import type { FastifyInstance } from 'fastify'
import { STATUS_ORCAMENTO_ABERTOS, hojeISO, type OrcamentoPublico } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

const NAO_ENCONTRADO = 'Link inválido ou orçamento não encontrado.'

/**
 * Aprovação de orçamento pelo cliente, sem login, pelo token do link.
 * Só devolve o necessário para o cliente decidir (nada de custos ou observações internas).
 */
export function criarPublicoService(app: FastifyInstance) {
  const { prisma, storage } = app

  async function buscar(token: string) {
    const o = await prisma.orcamento.findUnique({
      where: { tokenPublico: token },
      include: {
        cliente: { select: { nome: true } },
        vendedor: { select: { id: true, nome: true } },
        itens: { orderBy: { ordem: 'asc' }, include: { acabamentos: { select: { nome: true } } } },
      },
    })
    if (!o) throw AppError.naoEncontrado(NAO_ENCONTRADO)

    // Verificação ao abrir: se venceu e ainda está aberto, expira agora (além do job diário)
    const aberto = (STATUS_ORCAMENTO_ABERTOS as readonly string[]).includes(o.status)
    const expirado = o.validade.toISOString().slice(0, 10) < hojeISO()
    if (aberto && expirado) {
      await prisma.orcamento.update({ where: { id: o.id }, data: { status: 'expirado' } })
      o.status = 'expirado'
    }
    return o
  }

  function podeResponder(status: string) {
    return (STATUS_ORCAMENTO_ABERTOS as readonly string[]).includes(status)
  }

  return {
    async obter(token: string): Promise<OrcamentoPublico> {
      const o = await buscar(token)
      const empresa = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
      return {
        numero: o.numero,
        status: o.status,
        validade: o.validade.toISOString().slice(0, 10),
        expirado: o.status === 'expirado',
        podeResponder: podeResponder(o.status),
        cliente: { nome: o.cliente.nome },
        vendedor: o.vendedor ? { nome: o.vendedor.nome } : null,
        empresa: {
          nome: empresa?.nomeFantasia || empresa?.razaoSocial || '',
          telefone: empresa?.telefone ?? null,
          whatsapp: empresa?.whatsapp ?? null,
          email: empresa?.email ?? null,
          logoUrl: empresa?.logoArquivoId ? storage.gerarUrlTemporaria(empresa.logoArquivoId, 3600) : null,
        },
        itens: o.itens.map((i) => ({
          descricao: i.descricao,
          quantidade: i.quantidade.toString(),
          largura: i.largura?.toString() ?? null,
          altura: i.altura?.toString() ?? null,
          acabamentos: i.acabamentos.map((a) => a.nome),
          total: i.total.toString(),
        })),
        subtotal: o.subtotal.toString(),
        desconto: o.desconto.toString(),
        acrescimo: o.acrescimo.toString(),
        frete: o.frete.toString(),
        total: o.total.toString(),
        prazoDias: o.prazoDias,
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
      await prisma.$transaction(async (tx) => {
        await tx.orcamento.update({
          where: { id: o.id },
          data: resposta.aprovar
            ? { status: 'aprovado', aprovadoEm: new Date(), aprovadoPorNome: resposta.nome, aprovadoIp: ip }
            : { status: 'recusado', recusadoEm: new Date(), motivoRecusa: resposta.motivo, aprovadoIp: ip },
        })
        if (o.vendedor) {
          await tx.notificacao.create({
            data: {
              usuarioId: o.vendedor.id,
              titulo: resposta.aprovar ? `Orçamento ${o.numero} aprovado` : `Orçamento ${o.numero} recusado`,
              mensagem: resposta.aprovar
                ? `${o.cliente.nome} aprovou pelo link (${resposta.nome}).`
                : `${o.cliente.nome} recusou: ${resposta.motivo}`,
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
      return this.obter(token)
    },
  }
}
