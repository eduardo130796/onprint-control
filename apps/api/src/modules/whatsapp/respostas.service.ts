import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { OPCOES_ENQUETE_ORCAMENTO, TIPO_RESPOSTA_WHATSAPP_ROTULOS, nomeCliente, type FormatoRespostaOrcamento, type TipoRespostaWhatsapp } from '@onprint/shared'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import type { ContextoUsuario } from '../../core/escopo'
import { ErroWhatsapp, instanciaDaEmpresa } from '../../integrations/whatsapp'
import { criarConversaoAutomatica } from '../orcamentos/conversao-automatica'
import { criarConversaoService } from '../orcamentos/conversao.service'
import { criarOrcamentosService } from '../orcamentos/orcamentos.service'
import { avisarOrcamento } from '../orcamentos/tempo-real'
import { numeroDoCliente, obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import { opcoesDoVoto } from './enquete'
import { FUSO } from './regras'
import { JANELA_RESPOSTA_MS, decidirResposta, numeroDaResposta, variantesDoNumero, type Decisao, type MotivoNotificacao, type OrcamentoEnviado, type Recebida } from './respostas'
import type { AvisoWebhook, EventoWebhook } from './webhook'

const ABERTOS_RESPOSTA = ['enviado', 'em_negociacao'] as const

const incluirOrcamento = {
  orcamento: {
    select: {
      id: true,
      numero: true,
      status: true,
      vendedorId: true,
      createdBy: true,
      clienteId: true,
      cliente: { select: { id: true, nome: true, fantasia: true, whatsapp: true, telefone: true, receberAvisosWhatsapp: true } },
    },
  },
} as const

/** "24/10/2026 10:12" no horário de Brasília */
const dataHora = (d: Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: FUSO, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(d).replace(',', '')

/**
 * Resposta do cliente ao orçamento na conversa (webhook da Evolution): decide (respostas.ts) e aplica — aprova (e
 * vira pedido conforme a empresa), passa para negociação com o texto nas observações internas, ou só avisa a equipe.
 * Tudo dentro do contexto da empresa da instância. Nunca lança: o webhook responde 200 de qualquer jeito.
 */
export function criarRespostasWhatsapp(app: FastifyInstance) {
  const { prisma } = app
  const orcamentos = criarOrcamentosService(app)
  const automatica = criarConversaoAutomatica(app, criarConversaoService(app, orcamentos))

  type Linha = Awaited<ReturnType<typeof buscarLinhas>>[number]

  function buscarLinhas(where: Prisma.MensagemWhatsappWhereInput) {
    return prisma.mensagemWhatsapp.findMany({
      where: { evento: 'orcamento_enviado', status: 'enviada', orcamentoId: { not: null }, ...where },
      include: incluirOrcamento,
      orderBy: { enviadaEm: 'desc' },
      take: 20,
    })
  }

  const paraCandidato = (l: Linha): OrcamentoEnviado => ({
    mensagemId: l.id,
    orcamentoId: l.orcamento!.id,
    numero: l.orcamento!.numero,
    status: l.orcamento!.status,
    idExterno: l.idExterno,
    enqueteId: l.enqueteId,
    formatoResposta: (l.formatoResposta as FormatoRespostaOrcamento | null) ?? null,
    enviadaEm: l.enviadaEm ?? l.createdAt,
    resposta: (l.resposta as TipoRespostaWhatsapp | null) ?? null,
    respostaEm: l.respostaEm,
    respostaIdExterno: l.respostaIdExterno,
  })

  async function quemAvisar(vendedorId: string | null): Promise<string[]> {
    if (vendedorId) {
      const v = await prisma.usuario.findUnique({ where: { id: vendedorId }, select: { ativo: true } })
      if (v?.ativo) return [vendedorId]
    }
    const admins = await prisma.usuario.findMany({ where: { ativo: true, papel: { codigo: 'admin' } }, select: { id: true } })
    return admins.map((a) => a.id)
  }

  async function notificar(usuarios: string[], dados: { titulo: string; mensagem: string; link: string }, toast: boolean) {
    for (const usuarioId of usuarios) {
      await prisma.notificacao.create({ data: { usuarioId, ...dados } })
      app.tempoReal.emitir(`usuario:${usuarioId}`, 'notificacao:nova', { titulo: dados.titulo, link: dados.link, toast })
    }
  }

  /** Grava a resposta na linha do orçamento enviado (a tela do orçamento e a lista do WhatsApp mostram) */
  async function registrar(mensagemId: string, resposta: TipoRespostaWhatsapp, r: Recebida, textoResposta: string | null) {
    await prisma.mensagemWhatsapp.update({
      where: { id: mensagemId },
      data: { resposta, respostaVia: r.tipo === 'voto' ? 'enquete' : 'texto', respostaTexto: textoResposta?.slice(0, 500) ?? null, respostaEm: new Date(), respostaIdExterno: r.idMensagem },
    })
  }

  /**
   * Resposta curta ao cliente, na hora (é resposta a uma mensagem dele, fora da fila dos avisos). Só com o WhatsApp
   * no plano, conectado e sem pausa; fica registrada em mensagens_whatsapp ("Resposta ao cliente").
   */
  async function responderCliente(empresa: EmpresaAtual, l: Linha, texto: string) {
    try {
      if (!whatsappNoPlano(empresa)) return
      const config = await obterConfigWhatsapp(prisma)
      const provedor = app.whatsapp.provedor
      if (config.pausado || (!provedor.simulado && !config.conectado)) return
      const base = { clienteId: l.clienteId, orcamentoId: l.orcamentoId, evento: 'resposta_orcamento', manual: false, telefone: l.telefone, texto, tentativas: 1 }
      try {
        const r = await provedor.enviarTexto(instanciaDaEmpresa(empresa.id), l.telefone, texto)
        await prisma.mensagemWhatsapp.create({ data: { ...base, status: 'enviada', enviadaEm: new Date(), idExterno: r.id } })
      } catch (erro) {
        const e = erro instanceof ErroWhatsapp ? erro : new ErroWhatsapp('temporario', (erro as Error).message)
        await prisma.mensagemWhatsapp.create({ data: { ...base, status: 'falhou', erro: e.message } })
      }
    } catch (erro) {
      app.log.warn({ err: erro, empresa: empresa.slug }, 'Resposta automática ao cliente no WhatsApp não saiu')
    }
  }

  const assinatura = async () => {
    const e = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { nomeFantasia: true, razaoSocial: true } })
    const nome = e?.nomeFantasia || e?.razaoSocial
    return nome ? `\n\n— ${nome}` : ''
  }

  function textoDaNotificacao(motivo: MotivoNotificacao, cliente: string, alvos: OrcamentoEnviado[], resposta: TipoRespostaWhatsapp, escrito: string | null) {
    const numero = alvos[0]!.numero
    const disse = escrito ? `“${escrito.slice(0, 200)}”` : TIPO_RESPOSTA_WHATSAPP_ROTULOS[resposta]
    switch (motivo) {
      case 'varios':
        return {
          titulo: `${cliente} respondeu no WhatsApp — confirme de qual orçamento`,
          mensagem: `${cliente} respondeu: ${disse}. Há mais de um orçamento aberto para este número (${alvos.map((a) => a.numero).join(', ')}): confirme no orçamento certo.`,
        }
      case 'voto_ilegivel':
        return { titulo: `${cliente} votou na enquete do orçamento ${numero}`, mensagem: 'Não deu para ler a opção escolhida: confira a conversa no WhatsApp e registre no orçamento.' }
      case 'aprovacao_manual':
        return { titulo: `${cliente} respondeu Aprovado no WhatsApp · orçamento ${numero}`, mensagem: `${cliente} respondeu: ${disse}. Confirme no orçamento ("Cliente aprovou pelo WhatsApp").` }
      case 'depois_de_aprovado':
        return { titulo: `${cliente} respondeu de novo o orçamento ${numero} (já aprovado)`, mensagem: `${cliente} respondeu: ${disse}. A aprovação continua valendo; fale com o cliente.` }
      case 'fechado':
        return { titulo: `${cliente} respondeu o orçamento ${numero} (fechado)`, mensagem: `${cliente} respondeu: ${disse}. O orçamento não está mais aberto; reabra se for o caso.` }
      default:
        return { titulo: `${cliente} respondeu o orçamento ${numero} no WhatsApp`, mensagem: `${cliente} respondeu: ${disse} — confirme no orçamento ${numero} e responda o cliente.` }
    }
  }

  async function aplicar(empresa: EmpresaAtual, d: Decisao, r: Recebida, linhas: Linha[], escrito: string | null) {
    if (d.acao === 'ignorar') return d
    const linhaDe = (c: OrcamentoEnviado) => linhas.find((l) => l.id === c.mensagemId)!
    const autoria = { origem: 'cliente' as const, atorId: null, canal: 'whatsapp' as const }

    if (d.acao === 'aprovar') {
      const l = linhaDe(d.alvo)
      const o = l.orcamento!
      const nome = nomeCliente(o.cliente)
      const ator = o.vendedorId ?? o.createdBy ?? (await quemAvisar(null))[0] ?? ''
      const ctx: ContextoUsuario = { usuarioId: ator, veTodos: true, podeAprovar: true, veCustos: true }
      try {
        await orcamentos.aprovarInterno(o.id, nome, ctx, 'whatsapp', { via: r.tipo === 'voto' ? 'enquete' : 'texto', texto: escrito })
      } catch (erro) {
        // Outra aprovação (ou recusa) chegou antes: só registra e avisa
        app.log.info({ err: erro, orcamento: o.numero }, 'Resposta do WhatsApp não aprovou: o orçamento mudou antes')
        await registrar(l.id, d.resposta, r, escrito)
        return d
      }
      await registrar(l.id, d.resposta, r, escrito)
      const resultado = await automatica.aposAprovacao({ id: o.id, numero: o.numero, vendedorId: o.vendedorId, createdBy: o.createdBy, cliente: o.cliente }, { ...autoria, nome })
      // Virou pedido e o aviso "pedido confirmado" vai sair (evento ligado, cliente aceita avisos): ele já confirma
      const config = await obterConfigWhatsapp(prisma)
      const confirmacaoVai = resultado.situacao === 'convertido' && config.eventos.includes('pedido_confirmado') && o.cliente.receberAvisosWhatsapp && Boolean(numeroDoCliente(o.cliente))
      if (!confirmacaoVai) {
        const pedido = resultado.situacao === 'convertido' ? ` Seu pedido *${resultado.pedido.numero}* já está confirmado.` : ' Em instantes confirmamos o seu pedido por aqui.'
        await responderCliente(empresa, l, `Perfeito, recebemos sua aprovação do orçamento *${o.numero}* ✅${pedido}${await assinatura()}`)
      }
      return d
    }

    if (d.acao === 'modificar') {
      const l = linhaDe(d.alvo)
      const o = l.orcamento!
      const cliente = nomeCliente(o.cliente)
      const quando = dataHora(new Date())
      // Pelo "2" (formato 1/2) ou pela enquete ainda não há os detalhes do ajuste
      const porNumero = r.tipo === 'texto' && numeroDaResposta(r.texto) !== null
      const detalhe = r.tipo === 'voto' ? ' (enquete; ainda sem os detalhes)' : porNumero ? ' (respondeu 2; ainda sem os detalhes)' : escrito ? `: “${escrito}”` : ''
      const nota = `[${quando} · WhatsApp] ${cliente} pediu modificações${detalhe}`
      const mudou = await prisma.$transaction(async (tx) => {
        const atual = await tx.orcamento.findUnique({ where: { id: o.id }, select: { status: true, observacoesInternas: true } })
        if (!atual || !(ABERTOS_RESPOSTA as readonly string[]).includes(atual.status)) return false
        const { count } = await tx.orcamento.updateMany({
          where: { id: o.id, status: atual.status },
          data: { status: 'em_negociacao', observacoesInternas: [atual.observacoesInternas?.trim(), nota].filter(Boolean).join('\n') },
        })
        if (count !== 1) return false
        await registrarAuditoria(tx, {
          tabela: 'orcamentos',
          registroId: o.id,
          acao: 'editar',
          antes: { status: atual.status },
          depois: { status: 'em_negociacao', via: 'resposta no WhatsApp', resposta: escrito, por: r.tipo === 'voto' ? 'enquete' : 'texto' },
          usuarioId: null,
        })
        return true
      })
      await registrar(l.id, d.resposta, r, escrito)
      if (!mudou) return d
      await notificar(
        await quemAvisar(o.vendedorId),
        { titulo: `${cliente} pediu modificações no orçamento ${o.numero}`, mensagem:
            r.tipo === 'voto'
              ? 'Pela enquete do WhatsApp; fale com o cliente para combinar os ajustes.'
              : porNumero
                ? 'Respondeu 2 no WhatsApp; fale com o cliente para combinar os ajustes.'
                : `“${(escrito ?? '').slice(0, 200)}”`, link: `/orcamentos/${o.id}` },
        // O aviso flutuante vem do evento do orçamento (negociação pelo cliente)
        false,
      )
      avisarOrcamento(app, { ...o, status: 'em_negociacao', pedidoId: null }, 'negociacao', autoria)
      if (d.responderCliente) await responderCliente(empresa, l, `Certo! Já avisei a equipe; em instantes falamos com você sobre os ajustes.${await assinatura()}`)
      return d
    }

    // Só avisa a equipe (e registra a resposta em cada orçamento envolvido)
    for (const alvo of d.alvos) await registrar(alvo.mensagemId, d.resposta, r, escrito)
    const o = linhaDe(d.alvos[0]!).orcamento!
    if (d.avisarEquipe) {
      const dados = textoDaNotificacao(d.motivo, nomeCliente(o.cliente), d.alvos, d.resposta, escrito)
      await notificar(await quemAvisar(o.vendedorId), { ...dados, link: `/orcamentos/${o.id}` }, true)
    }
    for (const alvo of d.alvos) {
      const l = linhaDe(alvo)
      avisarOrcamento(app, { ...l.orcamento!, pedidoId: null }, 'alterado', autoria)
    }
    return d
  }

  /** Um voto ou texto recebido */
  async function responder(empresa: EmpresaAtual, e: Extract<EventoWebhook, { tipo: 'voto' | 'texto' }>) {
    const config = await obterConfigWhatsapp(prisma)
    const opcoes = { aprovarSozinho: config.aprovarPelaResposta, agora: new Date() }
    if (e.tipo === 'voto') {
      const linhas = await buscarLinhas({ enqueteId: e.idEnquete })
      if (!linhas.length) return { acao: 'ignorar', motivo: 'enquete desconhecida' } as Decisao
      let escolhidas = e.opcoes
      if (!escolhidas && e.cifrado) {
        const l = linhas[0]!
        const segredo = l.enqueteSegredo ? Buffer.from(l.enqueteSegredo, 'base64') : null
        if (segredo?.length) {
          escolhidas = opcoesDoVoto(e.cifrado, {
            idEnquete: e.idEnquete,
            segredo,
            opcoes: Object.values(OPCOES_ENQUETE_ORCAMENTO),
            criadores: [...e.criadores, ...(config.numero ? [`${config.numero}@s.whatsapp.net`] : [])],
            votantes: [...e.votantes, ...(l.enqueteJid ? [l.enqueteJid] : []), `${l.telefone}@s.whatsapp.net`],
          })
        }
      }
      const r: Recebida = { tipo: 'voto', idMensagem: e.idMensagem, idEnquete: e.idEnquete, opcoes: escolhidas }
      const decisao = decidirResposta(r, linhas.map(paraCandidato), opcoes)
      return aplicar(empresa, decisao, r, linhas, escolhidas?.join(', ') || null)
    }
    // Texto: o orçamento citado (respondeu em cima da mensagem ou da enquete) e os abertos enviados ao número
    const citadas = e.citadoId ? await buscarLinhas({ OR: [{ idExterno: e.citadoId }, { enqueteId: e.citadoId }] }) : []
    const doNumero = e.numero
      ? await buscarLinhas({
          telefone: { in: variantesDoNumero(e.numero) },
          enviadaEm: { gte: new Date(Date.now() - JANELA_RESPOSTA_MS) },
          orcamento: { status: { in: [...ABERTOS_RESPOSTA] } },
        })
      : []
    const linhas = [...citadas, ...doNumero.filter((l) => !citadas.some((c) => c.id === l.id))]
    if (!linhas.length) return { acao: 'ignorar', motivo: 'sem orçamento para o número' } as Decisao
    const r: Recebida = { tipo: 'texto', idMensagem: e.idMensagem, texto: e.texto, citadoId: e.citadoId }
    return aplicar(empresa, decidirResposta(r, linhas.map(paraCandidato), opcoes), r, linhas, e.texto)
  }

  /** Conexão mudou (CONNECTION_UPDATE): grava o último estado conhecido */
  async function conexao(empresa: EmpresaAtual, e: Extract<EventoWebhook, { tipo: 'conexao' }>) {
    if (app.whatsapp.provedor.simulado || e.estado === 'conectando') return
    const config = await obterConfigWhatsapp(prisma)
    if (e.estado === 'conectado') {
      if (config.conectado && (!e.numero || config.numero === e.numero)) return
      await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: { conectado: true, numero: e.numero ?? config.numero, nomePerfil: e.nomePerfil ?? config.nomePerfil, conectadoEm: config.conectadoEm ?? new Date(), desconectadoEm: null },
      })
      app.whatsapp.marcarFila(empresa.id)
    } else if (config.conectado) {
      await prisma.whatsappConfig.update({ where: { id: config.id }, data: { conectado: false, desconectadoEm: new Date() } })
    }
  }

  return {
    /** Aviso do webhook já autenticado, dentro da empresa da instância */
    async processar(empresa: EmpresaAtual, aviso: AvisoWebhook) {
      const resultados: { tipo: EventoWebhook['tipo']; acao: string; motivo?: string }[] = []
      await contextoEmpresa.com(empresa, async () => {
        for (const e of aviso.eventos) {
          try {
            if (e.tipo === 'conexao') {
              await conexao(empresa, e)
              resultados.push({ tipo: e.tipo, acao: 'conexao' })
            } else {
              const d = await responder(empresa, e)
              resultados.push({ tipo: e.tipo, acao: d.acao, ...('motivo' in d ? { motivo: d.motivo } : {}) })
            }
          } catch (erro) {
            app.log.error({ err: erro, empresa: empresa.slug, evento: e.tipo }, 'Resposta do WhatsApp não processada')
            resultados.push({ tipo: e.tipo, acao: 'erro' })
          }
        }
      })
      return resultados
    },
  }
}

export type RespostasWhatsapp = ReturnType<typeof criarRespostasWhatsapp>
