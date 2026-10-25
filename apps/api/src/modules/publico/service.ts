import type { FastifyInstance } from 'fastify'
import { STATUS_ORCAMENTO_ABERTOS, ajustesDoOrcamentoParaCliente, hojeISO, lerRegrasDoOrcamento, nomeCliente, resumoCondicoesPagamento, textosDoItemParaCliente, textosParaCliente, type OrcamentoPublico } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import type { ConversaoAutomatica } from '../orcamentos/conversao-automatica'
import { avisarOrcamento } from '../orcamentos/tempo-real'

const NAO_ENCONTRADO = 'Link inválido ou orçamento não encontrado.'

/**
 * Aprovação de orçamento pelo cliente, sem login, pelo token do link.
 * Só devolve o necessário para o cliente decidir (nada de custos ou observações internas).
 */
export function criarPublicoService(app: FastifyInstance, automatica: ConversaoAutomatica) {
  const { prisma, storage } = app

  async function buscar(token: string) {
    const o = await prisma.orcamento.findUnique({
      where: { tokenPublico: token },
      include: {
        cliente: { select: { nome: true, fantasia: true } },
        vendedor: { select: { id: true, nome: true } },
        pedido: { select: { numero: true } },
        itens: { orderBy: { ordem: 'asc' }, include: { acabamentos: { select: { nome: true } } } },
      },
    })
    if (!o) throw AppError.naoEncontrado(NAO_ENCONTRADO)

    // Verificação ao abrir: se venceu e ainda está aberto, expira agora (além do job diário)
    const aberto = (STATUS_ORCAMENTO_ABERTOS as readonly string[]).includes(o.status)
    const expirado = o.validade.toISOString().slice(0, 10) < hojeISO()
    if (aberto && expirado) {
      const { count } = await prisma.orcamento.updateMany({ where: { id: o.id, status: o.status }, data: { status: 'expirado' } })
      o.status = 'expirado'
      if (count) avisarOrcamento(app, o, 'expirado', { origem: 'sistema', atorId: null })
    }
    return o
  }

  function podeResponder(status: string) {
    return (STATUS_ORCAMENTO_ABERTOS as readonly string[]).includes(status)
  }

  return {
    async obter(token: string): Promise<OrcamentoPublico> {
      const o = await buscar(token)
      const regras = lerRegrasDoOrcamento(o.regras)
      const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
      return {
        numero: o.numero,
        status: o.status,
        validade: o.validade.toISOString().slice(0, 10),
        expirado: o.status === 'expirado',
        podeResponder: podeResponder(o.status),
        cliente: { nome: nomeCliente(o.cliente) },
        vendedor: o.vendedor ? { nome: o.vendedor.nome } : null,
        empresa: {
          nome: empresa?.nomeFantasia || empresa?.razaoSocial || '',
          telefone: empresa?.telefone ?? null,
          whatsapp: empresa?.whatsapp ?? null,
          email: empresa?.email ?? null,
          logoUrl: empresa?.logoArquivoId ? storage.gerarUrlTemporaria(empresa.logoArquivoId, 3600) : null,
        },
        itens: o.itens.map((i, k) => ({
          descricao: i.descricao,
          quantidade: i.quantidade.toString(),
          largura: i.largura?.toString() ?? null,
          altura: i.altura?.toString() ?? null,
          acabamentos: i.acabamentos.map((a) => a.nome),
          total: i.total.toString(),
          // Selos das regras no item, em texto neutro para o cliente ("Desconto de 5%")
          regras: textosDoItemParaCliente(regras.itens[k] ?? []),
        })),
        subtotal: o.subtotal.toString(),
        desconto: o.desconto.toString(),
        acrescimo: o.acrescimo.toString(),
        frete: o.frete.toString(),
        ajusteRegras: o.ajusteRegras.toString(),
        ajustesRegras: ajustesDoOrcamentoParaCliente(regras),
        condicoesEspeciais: textosParaCliente(regras),
        emRevisao: o.liberacaoPendente,
        total: o.total.toString(),
        prazoDias: o.prazoDias,
        // O mesmo resumo da mensagem e do PDF (e das contas a receber do pedido)
        pagamento: resumoCondicoesPagamento({ total: o.total.toString(), sinalPercentual: o.sinalPercentual.toString(), parcelas: o.parcelas, intervaloDias: o.intervaloDias }),
        condicoes: o.condicoes,
        observacoes: o.observacoes,
        aprovadoEm: o.aprovadoEm?.toISOString() ?? null,
        aprovadoPorNome: o.aprovadoPorNome,
        recusadoEm: o.recusadoEm?.toISOString() ?? null,
      }
    },

    async responder(token: string, resposta: { aprovar: true; nome: string } | { aprovar: false; motivo: string }, ip: string) {
      const o = await buscar(token)
      if (!podeResponder(o.status)) {
        throw AppError.regraNegocio(o.status === 'expirado' ? 'Este orçamento expirou. Fale com seu atendente.' : 'Este orçamento já foi respondido.')
      }
      // Regras comerciais: esperando um gerente da gráfica, o cliente ainda não aprova (recusar continua possível)
      if (resposta.aprovar && o.liberacaoPendente) throw AppError.regraNegocio('Este orçamento está em revisão pela gráfica. Fale com seu atendente.')
      await prisma.$transaction(async (tx) => {
        // Transição atômica: só grava se o status ainda for o lido acima (clique duplo ou
        // aprovar e recusar ao mesmo tempo não aplicam as duas respostas)
        const { count } = await tx.orcamento.updateMany({
          where: { id: o.id, status: o.status },
          data: resposta.aprovar
            ? { status: 'aprovado', aprovadoEm: new Date(), aprovadoPorNome: resposta.nome, aprovadoIp: ip }
            : { status: 'recusado', recusadoEm: new Date(), motivoRecusa: resposta.motivo, aprovadoIp: ip },
        })
        if (count !== 1) throw AppError.regraNegocio('Este orçamento já foi respondido.')
        // Na aprovação, a notificação do vendedor sai depois da conversão automática (com o pedido gerado)
        if (o.vendedor && !resposta.aprovar) {
          await tx.notificacao.create({
            data: {
              usuarioId: o.vendedor.id,
              titulo: `Orçamento ${o.numero} recusado`,
              mensagem: `${nomeCliente(o.cliente)} recusou: ${resposta.motivo}`,
              link: `/orcamentos/${o.id}`,
            },
          })
        }
        await registrarAuditoria(tx, {
          tabela: 'orcamentos',
          registroId: o.id,
          acao: 'editar',
          antes: { status: o.status },
          depois: { status: resposta.aprovar ? 'aprovado' : 'recusado', via: 'link público', ip },
          usuarioId: null,
        })
      })
      const autoria = { origem: 'cliente' as const, atorId: null }
      if (resposta.aprovar) {
        // Aprovação já gravada: vira pedido (se ligado) sem nunca desfazer a aprovação
        await automatica.aposAprovacao({ ...o, vendedorId: o.vendedor?.id ?? null }, { ...autoria, nome: resposta.nome })
      } else {
        if (o.vendedor) app.tempoReal.emitir(`usuario:${o.vendedor.id}`, 'notificacao:nova', { titulo: `Orçamento ${o.numero} recusado`, link: `/orcamentos/${o.id}`, toast: false })
        avisarOrcamento(app, { ...o, status: 'recusado' }, 'recusado', autoria)
      }
      return this.obter(token)
    },
  }
}
