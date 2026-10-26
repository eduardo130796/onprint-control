import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { OPCOES_ENQUETE_ORCAMENTO, TIPO_RESPOSTA_WHATSAPP_ROTULOS, funcaoLiberada, nomeCliente, type FormatoRespostaOrcamento, type TipoRespostaWhatsapp } from '@onprint/shared'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import type { ContextoUsuario } from '../../core/escopo'
import { ErroWhatsapp, instanciaDaEmpresa } from '../../integrations/whatsapp'
import { criarConversaoAutomatica } from '../orcamentos/conversao-automatica'
import { criarConversaoService } from '../orcamentos/conversao.service'
import { criarOrcamentosService } from '../orcamentos/orcamentos.service'
import { avisarOrcamento } from '../orcamentos/tempo-real'
import { numeroDoCliente, obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import { abrirVotoComIdentidades, ehLid, jidNormalizado, jidsUnicos, mascararJid, votoBrutoParaGuardar, votoDoBruto, type VotoAberto, type VotoCifrado } from './enquete'
import { FUSO } from './regras'
import { controlesDaEmpresa } from '../assistente/empresa.service'
import { contextoDoCerebro, montarCerebro } from '../assistente/cerebro'
import { pedidoClassificarResposta, primeiroNome } from '../assistente/prompts'
import { criarConversasWhatsapp, type EventoConversa } from './conversas.service'
import { criarCopilotoWhatsapp } from './copiloto.service'
import { DONO_PRESENTE_MS, decidirAprovacaoAutomatica, motivoDaConfirmacao, silencioAoCliente, textoConfirmarAprovacao, versaoDoOrcamento, type DecisaoAprovacao } from './aprovacao'
import { camposDaVersao } from './manual'
import { criarMensagensDono } from './mensagens-dono'
import { VIA_LENDO, notificarEquipe, quemAvisar as quemAvisarNaEmpresa } from './leituras-presas'
import {
  JANELA_RESPOSTA_MS,
  decidirPeloAssistente,
  decidirResposta,
  desempilharResposta,
  empilharResposta,
  numeroDaResposta,
  vaiParaAssistente,
  variantesDoNumero,
  type Decisao,
  type LeituraAssistente,
  type MotivoNotificacao,
  type OrcamentoEnviado,
  type Recebida,
  type RespostaGuardada,
} from './respostas'
import type { AvisoWebhook, EventoWebhook } from './webhook'

const ABERTOS_RESPOSTA = ['enviado', 'em_negociacao'] as const
const OPCOES_ENQUETE = Object.values(OPCOES_ENQUETE_ORCAMENTO)

const incluirOrcamento = {
  orcamento: {
    select: {
      id: true,
      numero: true,
      status: true,
      vendedorId: true,
      createdBy: true,
      clienteId: true,
      cliente: { select: { id: true, nome: true, fantasia: true, tipoPessoa: true, whatsapp: true, telefone: true, receberAvisosWhatsapp: true } },
    },
  },
} as const

/** Resposta lida pelo Assistente GrafyGo (resposta_via; enquanto lê: VIA_LENDO) */
const VIA_ASSISTENTE = 'assistente'

/** Os campos da resposta mais recente (a que vai para respostas_anteriores quando chega outra) */
const camposDaResposta = {
  resposta: true,
  respostaVia: true,
  respostaTexto: true,
  respostaEm: true,
  respostaIdExterno: true,
  respostaIntencao: true,
  respostaConfianca: true,
  respostaResumo: true,
} satisfies Prisma.MensagemWhatsappSelect

function respostaGuardada(m: Prisma.MensagemWhatsappGetPayload<{ select: typeof camposDaResposta }>): RespostaGuardada | null {
  if (!m.resposta || !m.respostaEm) return null
  return {
    resposta: m.resposta,
    via: m.respostaVia,
    texto: m.respostaTexto,
    em: m.respostaEm.toISOString(),
    idExterno: m.respostaIdExterno,
    intencao: m.respostaIntencao,
    confianca: m.respostaConfianca,
    resumo: m.respostaResumo,
  }
}

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
  // Mensagens que não viram resposta tratada de orçamento vão para as Conversas do WhatsApp
  const conversas = criarConversasWhatsapp(app)
  // Copiloto: 📝 na conversa do cliente e a conversa "Você" (o canal do Assistente)
  const copiloto = criarCopilotoWhatsapp(app)
  // O que o dono digitou nas conversas com clientes (a aprovação sozinha só sai se ninguém conversou depois do envio)
  const mensagensDono = criarMensagensDono(app)

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

  const quemAvisar = (vendedorId: string | null) => quemAvisarNaEmpresa(prisma, vendedorId)
  const notificar = (usuarios: string[], dados: { titulo: string; mensagem: string; link: string }, toast: boolean) => notificarEquipe(app, usuarios, dados, toast)

  /**
   * Grava a resposta na linha do orçamento enviado (a tela do orçamento e a lista do WhatsApp mostram), com o que o
   * Assistente entendeu quando foi ele quem leu (ou "lendo", enquanto a leitura não volta). A resposta que estava lá
   * (de outra mensagem) vai para respostas_anteriores: uma resposta nova nunca apaga a anterior.
   */
  async function registrar(mensagemId: string, resposta: TipoRespostaWhatsapp, r: Recebida, textoResposta: string | null, assistente?: LeituraAssistente | 'lendo') {
    const via = assistente === 'lendo' ? VIA_LENDO : assistente ? VIA_ASSISTENTE : r.tipo === 'voto' ? 'enquete' : 'texto'
    const leitura = assistente && assistente !== 'lendo' ? assistente : null
    const atual = await prisma.mensagemWhatsapp.findUnique({ where: { id: mensagemId }, select: { ...camposDaResposta, respostasAnteriores: true } })
    const anteriores = empilharResposta(atual?.respostasAnteriores, atual ? respostaGuardada(atual) : null, r.idMensagem)
    await prisma.mensagemWhatsapp.update({
      where: { id: mensagemId },
      data: {
        ...(anteriores ? { respostasAnteriores: anteriores as unknown as Prisma.InputJsonValue } : {}),
        resposta,
        respostaVia: via,
        respostaTexto: textoResposta?.slice(0, 500) ?? null,
        respostaEm: new Date(),
        respostaIdExterno: r.idMensagem,
        respostaIntencao: leitura?.intencao ?? null,
        respostaConfianca: leitura?.confianca ?? null,
        respostaResumo: leitura?.resumo.slice(0, 300) ?? null,
        // Resposta nova: a "aprovação a confirmar" anterior deixa de valer (a nova decide de novo)
        aprovacaoPendente: null,
        aprovacaoPendenteEm: null,
      },
    })
  }

  /**
   * A mensagem não era resposta do orçamento (o Assistente leu: pedido novo, pergunta de outro pedido): a resposta
   * anterior volta para o lugar. Só se ninguém respondeu depois (a resposta gravada ainda é esta mensagem).
   */
  async function restaurarResposta(mensagemId: string, idMensagem: string) {
    const atual = await prisma.mensagemWhatsapp.findUnique({ where: { id: mensagemId }, select: { respostaIdExterno: true, respostasAnteriores: true } })
    if (!atual || atual.respostaIdExterno !== idMensagem) return
    const { volta, ficam } = desempilharResposta(atual.respostasAnteriores)
    await prisma.mensagemWhatsapp.update({
      where: { id: mensagemId },
      data: {
        resposta: volta?.resposta ?? null,
        // Uma anterior que ficou "lendo" volta como texto (a recuperação das leituras presas não a pega de novo)
        respostaVia: volta?.via === VIA_LENDO ? 'texto' : (volta?.via ?? null),
        respostaTexto: volta?.texto ?? null,
        respostaEm: volta ? new Date(volta.em) : null,
        respostaIdExterno: volta?.idExterno ?? null,
        respostaIntencao: volta?.intencao ?? null,
        respostaConfianca: volta?.confianca ?? null,
        respostaResumo: volta?.resumo ?? null,
        respostasAnteriores: ficam.length ? (ficam as unknown as Prisma.InputJsonValue) : Prisma.DbNull,
      },
    })
  }

  /**
   * A mensagem de texto (ou mídia) também fica nas Conversas do WhatsApp: tratada (aprovou, pediu modificação) não
   * pede ação; o resto aparece na lista com o que já se sabe (orçamento citado, leitura do Assistente, equipe avisada)
   */
  async function registrarNaConversa(empresa: EmpresaAtual, e: EventoConversa, d: Decisao) {
    switch (d.acao) {
      case 'ignorar':
        if (d.motivo === 'repetida') return
        await conversas.registrar(empresa, e, d.motivo === 'já aprovado' ? { tratada: true } : {})
        return
      case 'aprovar':
      case 'modificar':
        await conversas.registrar(empresa, e, { orcamentoId: d.alvo.orcamentoId, tratada: true })
        return
      case 'outro_assunto':
        await conversas.registrar(empresa, e, { leitura: d.assistente })
        return
      default:
        await conversas.registrar(empresa, e, {
          orcamentoId: d.alvos.length === 1 ? d.alvos[0]!.orcamentoId : null,
          // Aprovação esperando a confirmação da equipe: o aviso já foi, a ação é no orçamento
          tratada: d.motivo === 'aprovacao_manual' || d.motivo === 'aprovacao_a_confirmar',
          leitura: d.assistente ?? null,
          jaAvisada: d.avisarEquipe,
        })
    }
  }

  /**
   * Resposta curta ao cliente, na hora (é resposta a uma mensagem dele, fora da fila dos avisos). Só com o WhatsApp
   * no plano, conectado e sem pausa; fica registrada em mensagens_whatsapp ("Resposta ao cliente"). `peloAssistente`:
   * a decisão veio da leitura do Assistente — com "nunca falar com meus clientes" ligado, nada sai (a equipe responde).
   * O dono escreveu nessa conversa nos últimos 30 minutos: ele está atendendo, a resposta pronta não sai (fica o sino).
   */
  async function responderCliente(empresa: EmpresaAtual, l: Linha, texto: string, peloAssistente = false) {
    try {
      if (!whatsappNoPlano(empresa)) return
      const agora = new Date()
      const [controles, doDono] = await Promise.all([controlesDaEmpresa(prisma), mensagensDono.depois(l.telefone, new Date(agora.getTime() - DONO_PRESENTE_MS))])
      const silencio = silencioAoCliente({ peloAssistente, semClientes: controles.semClientes, ultimaDoDonoEm: doDono.at(-1)?.enviadaEm ?? null, agora })
      if (silencio === 'sem_clientes') return
      if (silencio === 'dono_presente') {
        const o = l.orcamento!
        app.log.info({ empresa: empresa.slug, orcamento: o.numero }, 'Resposta automática ao cliente não enviada: o dono está na conversa')
        await notificar(
          await quemAvisar(o.vendedorId),
          { titulo: `${nomeCliente(o.cliente)}: o Assistente não respondeu no WhatsApp`, mensagem: `Você está na conversa (escreveu há pouco), então ele ficou quieto. Ia responder: “${texto.split('\n')[0]!.slice(0, 160)}”`, link: `/orcamentos/${o.id}` },
          false,
        )
        return
      }
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

  function textoDaNotificacao(motivo: MotivoNotificacao, cliente: string, alvos: OrcamentoEnviado[], resposta: TipoRespostaWhatsapp, escrito: string | null, assistente?: LeituraAssistente) {
    const numero = alvos[0]!.numero
    const disse = escrito ? `“${escrito.slice(0, 200)}”` : TIPO_RESPOSTA_WHATSAPP_ROTULOS[resposta]
    switch (motivo) {
      case 'assistente':
        return {
          titulo: `${cliente} respondeu o orçamento ${numero} no WhatsApp`,
          mensagem: `Assistente: ${assistente?.resumo.replace(/\.$/, '') ?? 'resposta fora do padrão'} — ${cliente} escreveu ${disse}. Responda o cliente e confirme no orçamento.`,
        }
      case 'aprovacao_manual':
        if (assistente) {
          return { titulo: `${cliente} aprovou o orçamento ${numero} no WhatsApp`, mensagem: `${cliente} respondeu: ${disse} (entendido pelo Assistente GrafyGo). Confirme no orçamento ("Cliente aprovou pelo WhatsApp").` }
        }
        return { titulo: `${cliente} respondeu Aprovado no WhatsApp · orçamento ${numero}`, mensagem: `${cliente} respondeu: ${disse}. Confirme no orçamento ("Cliente aprovou pelo WhatsApp").` }
      case 'varios':
        return {
          titulo: `${cliente} respondeu no WhatsApp — confirme de qual orçamento`,
          mensagem: `${cliente} respondeu: ${disse}. Há mais de um orçamento aberto para este número (${alvos.map((a) => a.numero).join(', ')}): confirme no orçamento certo.`,
        }
      case 'voto_ilegivel':
        return { titulo: `${cliente} votou na enquete do orçamento ${numero}`, mensagem: 'Não deu para ler a opção escolhida: confira a conversa no WhatsApp e registre no orçamento.' }
      case 'depois_de_aprovado':
        return { titulo: `${cliente} respondeu de novo o orçamento ${numero} (já aprovado)`, mensagem: `${cliente} respondeu: ${disse}. A aprovação continua valendo; fale com o cliente.` }
      case 'fechado':
        return { titulo: `${cliente} respondeu o orçamento ${numero} (fechado)`, mensagem: `${cliente} respondeu: ${disse}. O orçamento não está mais aberto; reabra se for o caso.` }
      default:
        return { titulo: `${cliente} respondeu o orçamento ${numero} no WhatsApp`, mensagem: `${cliente} respondeu: ${disse} — confirme no orçamento ${numero} e responda o cliente.` }
    }
  }

  /**
   * A aprovação clara pode sair sozinha? Só se o orçamento que o cliente viu (a versão gravada no envio) é o que está
   * no sistema e o dono não escreveu nada na conversa depois do envio (aprovacao.ts)
   */
  async function conferirAprovacao(l: Linha) {
    const o = await prisma.orcamento.findUniqueOrThrow({ where: { id: l.orcamento!.id }, select: { updatedAt: true, ...camposDaVersao } })
    const config = await obterConfigWhatsapp(prisma)
    const enviadaEm = l.enviadaEm ?? l.createdAt
    const doDono = await mensagensDono.depois(l.telefone, enviadaEm)
    const decisao = decidirAprovacaoAutomatica({
      aprovarSozinho: config.aprovarPelaResposta,
      enviadaEm,
      versaoEnviada: l.versaoEnviada,
      versaoAtual: versaoDoOrcamento(o),
      orcamentoAtualizadoEm: o.updatedAt,
      totalEnviado: l.totalEnviado?.toString() ?? null,
      totalAtual: o.total.toString(),
      mensagensDoDono: doDono.map((m) => ({ texto: m.texto, em: m.enviadaEm })),
    })
    return { decisao, totalAtual: o.total.toString() }
  }

  /**
   * Caso não limpo: não aprova. Grava a resposta com o motivo (faixa no orçamento), avisa no sino ("confirme a
   * aprovação") e, com o Assistente no WhatsApp ligado, pergunta no "Você" (o "ok" lá aprova pelo mesmo caminho do
   * botão "Cliente aprovou pelo WhatsApp")
   */
  async function aprovacaoAConfirmar(
    empresa: EmpresaAtual,
    l: Linha,
    decisao: Extract<DecisaoAprovacao, { acao: 'confirmar' }>,
    totalAtual: string,
    resposta: string,
    gravarResposta: (mensagemId: string, resposta: TipoRespostaWhatsapp) => Promise<void>,
  ) {
    const o = l.orcamento!
    const cliente = nomeCliente(o.cliente)
    const motivo = motivoDaConfirmacao(decisao)
    await gravarResposta(l.id, 'aprovado')
    await prisma.mensagemWhatsapp.update({ where: { id: l.id }, data: { aprovacaoPendente: motivo.slice(0, 500), aprovacaoPendenteEm: new Date() } })
    await notificar(
      await quemAvisar(o.vendedorId),
      {
        titulo: `${cliente} aprovou o orçamento ${o.numero} no WhatsApp — confirme a aprovação`,
        mensagem: `Não aprovei sozinho: ${motivo}. Confira e use "Cliente aprovou pelo WhatsApp".`,
        link: `/orcamentos/${o.id}`,
      },
      true,
    )
    const empresaConfig = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' }, select: { converterAoAprovar: true } })
    await copiloto.pedirConfirmacaoAprovacao(empresa, {
      orcamentoId: o.id,
      texto: textoConfirmarAprovacao({ cliente, resposta, numero: o.numero, total: totalAtual, decisao, converteAoAprovar: empresaConfig?.converterAoAprovar ?? true }),
    })
    avisarOrcamento(app, { ...o, pedidoId: null }, 'alterado', { origem: 'cliente', atorId: null, canal: 'whatsapp' })
  }

  /** `gravar` false: outra resposta do cliente já foi registrada depois desta (a leitura do Assistente demorou) */
  async function aplicar(empresa: EmpresaAtual, d: Decisao, r: Recebida, linhas: Linha[], escrito: string | null, gravar = true): Promise<Decisao> {
    if (d.acao === 'ignorar') return d
    const gravarResposta = (mensagemId: string, resposta: TipoRespostaWhatsapp) => (gravar ? registrar(mensagemId, resposta, r, escrito, d.assistente) : Promise.resolve())
    const linhaDe = (c: OrcamentoEnviado) => linhas.find((l) => l.id === c.mensagemId)!
    const autoria = { origem: 'cliente' as const, atorId: null, canal: 'whatsapp' as const }

    if (d.acao === 'outro_assunto') {
      if (gravar) await restaurarResposta(d.alvo.mensagemId, r.idMensagem)
      avisarOrcamento(app, { ...linhaDe(d.alvo).orcamento!, pedidoId: null }, 'alterado', autoria)
      return d
    }

    if (d.acao === 'aprovar') {
      const l = linhaDe(d.alvo)
      const o = l.orcamento!
      const nome = nomeCliente(o.cliente)
      const ator = o.vendedorId ?? o.createdBy ?? (await quemAvisar(null))[0] ?? ''
      const ctx: ContextoUsuario = { usuarioId: ator, veTodos: true, podeAprovar: true, veCustos: true }
      // Aprovar sozinho só no caso limpo: o orçamento não mudou desde o envio e o dono não conversou depois dele
      const seguranca = await conferirAprovacao(l)
      if (seguranca.decisao.acao === 'confirmar') {
        await aprovacaoAConfirmar(empresa, l, seguranca.decisao, seguranca.totalAtual, escrito ?? TIPO_RESPOSTA_WHATSAPP_ROTULOS[d.resposta], gravarResposta)
        return { acao: 'notificar', motivo: 'aprovacao_a_confirmar', alvos: [d.alvo], resposta: d.resposta, avisarEquipe: false, assistente: d.assistente }
      }
      try {
        await orcamentos.aprovarInterno(o.id, nome, ctx, 'whatsapp', { via: r.tipo === 'voto' ? 'enquete' : d.assistente ? 'assistente' : 'texto', texto: escrito })
      } catch (erro) {
        // Outra aprovação (ou recusa) chegou antes: só registra e avisa
        app.log.info({ err: erro, orcamento: o.numero }, 'Resposta do WhatsApp não aprovou: o orçamento mudou antes')
        await gravarResposta(l.id, d.resposta)
        return d
      }
      await gravarResposta(l.id, d.resposta)
      const resultado = await automatica.aposAprovacao({ id: o.id, numero: o.numero, vendedorId: o.vendedorId, createdBy: o.createdBy, cliente: o.cliente }, { ...autoria, nome })
      // Virou pedido e o aviso "pedido confirmado" vai sair (evento ligado, cliente aceita avisos): ele já confirma
      const config = await obterConfigWhatsapp(prisma)
      const confirmacaoVai = resultado.situacao === 'convertido' && config.eventos.includes('pedido_confirmado') && o.cliente.receberAvisosWhatsapp && Boolean(numeroDoCliente(o.cliente))
      if (!confirmacaoVai) {
        const pedido = resultado.situacao === 'convertido' ? ` Seu pedido *${resultado.pedido.numero}* já está confirmado.` : ' Em instantes confirmamos o seu pedido por aqui.'
        await responderCliente(empresa, l, `Perfeito, recebemos sua aprovação do orçamento *${o.numero}* ✅${pedido}${await assinatura()}`, Boolean(d.assistente))
      }
      // Assistente no WhatsApp ligado: o dono fica sabendo no "Você" e pode desfazer por 10 minutos
      await copiloto.avisarAprovadoAuto(empresa, { orcamentoId: o.id, numero: o.numero, cliente: nome, total: seguranca.totalAtual, pedido: resultado.situacao === 'convertido' ? resultado.pedido.numero : null })
      return d
    }

    if (d.acao === 'modificar') {
      const l = linhaDe(d.alvo)
      const o = l.orcamento!
      const cliente = nomeCliente(o.cliente)
      const quando = dataHora(new Date())
      // Pelo "2" (formato 1/2) ou pela enquete ainda não há os detalhes do ajuste
      const porNumero = r.tipo === 'texto' && numeroDaResposta(r.texto) !== null
      const lido = d.assistente ? ` (Assistente GrafyGo: ${d.assistente.resumo.replace(/.$/, '')})` : ''
      const detalhe = r.tipo === 'voto' ? ' (enquete; ainda sem os detalhes)' : porNumero ? ' (respondeu 2; ainda sem os detalhes)' : escrito ? `: “${escrito}”${lido}` : ''
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
          depois: { status: 'em_negociacao', via: 'resposta no WhatsApp', resposta: escrito, por: r.tipo === 'voto' ? 'enquete' : d.assistente ? 'assistente' : 'texto', ...(d.assistente ? { assistente: d.assistente } : {}) },
          usuarioId: null,
        })
        return true
      })
      await gravarResposta(l.id, d.resposta)
      if (!mudou) return d
      await notificar(
        await quemAvisar(o.vendedorId),
        { titulo: `${cliente} pediu modificações no orçamento ${o.numero}`, mensagem:
            r.tipo === 'voto'
              ? 'Pela enquete do WhatsApp; fale com o cliente para combinar os ajustes.'
              : porNumero
                ? 'Respondeu 2 no WhatsApp; fale com o cliente para combinar os ajustes.'
                : d.assistente
                  ? `Assistente: ${d.assistente.resumo.replace(/.$/, '')} — “${(escrito ?? '').slice(0, 200)}”`
                  : `“${(escrito ?? '').slice(0, 200)}”`, link: `/orcamentos/${o.id}` },
        // O aviso flutuante vem do evento do orçamento (negociação pelo cliente)
        false,
      )
      avisarOrcamento(app, { ...o, status: 'em_negociacao', pedidoId: null }, 'negociacao', autoria)
      if (d.responderCliente) await responderCliente(empresa, l, `Certo! Já avisei a equipe; em instantes falamos com você sobre os ajustes.${await assinatura()}`, Boolean(d.assistente))
      return d
    }

    // Só avisa a equipe (e registra a resposta em cada orçamento envolvido)
    for (const alvo of d.alvos) await gravarResposta(alvo.mensagemId, d.resposta)
    const o = linhaDe(d.alvos[0]!).orcamento!
    if (d.avisarEquipe) {
      const dados = textoDaNotificacao(d.motivo, nomeCliente(o.cliente), d.alvos, d.resposta, escrito, d.assistente)
      await notificar(await quemAvisar(o.vendedorId), { ...dados, link: `/orcamentos/${o.id}` }, true)
    }
    for (const alvo of d.alvos) {
      const l = linhaDe(alvo)
      avisarOrcamento(app, { ...l.orcamento!, pedidoId: null }, 'alterado', autoria)
    }
    return d
  }

  // ─── Voto cifrado da enquete (enquete.ts): identidades da gráfica e do cliente ───

  type Config = Awaited<ReturnType<typeof obterConfigWhatsapp>>
  type EventoVoto = Extract<EventoWebhook, { tipo: 'voto' }>

  /** LID aprendido nesta leitura: os votos guardados (voto_bruto) são tentados de novo ao fim do aviso */
  let reprocessarDepois = false

  /** Número e LID da gráfica (criador da enquete) */
  const identidadesDaGrafica = (config: Config) => jidsUnicos([config.numero ? `${config.numero}@s.whatsapp.net` : null, config.lid])

  /** O que a linha sabe do cliente: jid do envio, a outra identidade vista num voto e o telefone */
  const identidadesDoCliente = (l: { enqueteJid: string | null; enqueteJidAlt: string | null; telefone: string }) => [l.enqueteJid, l.enqueteJidAlt, `${l.telefone}@s.whatsapp.net`]

  /**
   * Lê o LID da conta nas credenciais da instância (Evolution) e guarda em whatsapp_config.lid. Devolve a config
   * atualizada só quando aprendeu um LID novo (null: igual, sem LID ou banco da Evolution fora — fica no log).
   */
  async function atualizarIdentidade(empresa: EmpresaAtual, config: Config): Promise<Config | null> {
    let lid: string | null = null
    try {
      const id = await app.whatsapp.provedor.identidade(instanciaDaEmpresa(empresa.id))
      lid = id?.lid ? jidNormalizado(id.lid) : null
    } catch (erro) {
      app.log.warn({ err: erro, empresa: empresa.slug }, 'LID da conta do WhatsApp não lido (credenciais da instância no banco da Evolution)')
      return null
    }
    if (!lid || lid === config.lid) return null
    const atualizada = await prisma.whatsappConfig.update({ where: { id: config.id }, data: { lid } })
    app.log.info({ empresa: empresa.slug, lid: mascararJid(lid) }, 'LID da conta do WhatsApp guardado (abre o voto da enquete no endereçamento novo)')
    reprocessarDepois = true
    return atualizada
  }

  const tentarAbrir = (cifrado: VotoCifrado, idEnquete: string, segredo: Buffer | null, config: Config, criadores: string[], votantes: (string | null)[]): VotoAberto | null =>
    segredo?.length
      ? abrirVotoComIdentidades(cifrado, { idEnquete, segredo, opcoes: OPCOES_ENQUETE, criadores: [...identidadesDaGrafica(config), ...criadores], votantes })
      : null

  /** A outra identidade do cliente (o LID, se a enquete saiu pelo número) para guardar na linha */
  function identidadeAlternativa(l: Linha, aberto: VotoAberto | null, votantes: string[]): string | null {
    const enviada = l.enqueteJid ? jidNormalizado(l.enqueteJid) : null
    const alt = aberto ? aberto.votanteJid : (jidsUnicos(votantes).find(ehLid) ?? null)
    return alt && alt !== enviada && alt !== l.enqueteJidAlt ? alt : null
  }

  /**
   * Abre o voto cifrado com { número, LID da gráfica } × { número, LID do cliente }. Se não abrir, relê o LID da
   * conta na Evolution e tenta de novo; se ainda não abrir, guarda o voto como chegou (voto_bruto) e avisa no log
   * (ids mascarados). Devolve os nomes das opções ou null (a equipe é avisada: "não deu para ler").
   */
  async function abrirVotoCifrado(empresa: EmpresaAtual, l: Linha, e: EventoVoto & { cifrado: VotoCifrado }): Promise<string[] | null> {
    const segredo = l.enqueteSegredo ? Buffer.from(l.enqueteSegredo, 'base64') : null
    const votantes = [...e.votantes, ...identidadesDoCliente(l)]
    let config = await obterConfigWhatsapp(prisma)
    let aberto = tentarAbrir(e.cifrado, e.idEnquete, segredo, config, e.criadores, votantes)
    if (!aberto && segredo?.length) {
      const nova = await atualizarIdentidade(empresa, config)
      if (nova) {
        config = nova
        aberto = tentarAbrir(e.cifrado, e.idEnquete, segredo, config, e.criadores, votantes)
      }
    }
    const alt = identidadeAlternativa(l, aberto, e.votantes)
    if (aberto) {
      if (alt || l.votoBruto !== null) await prisma.mensagemWhatsapp.update({ where: { id: l.id }, data: { ...(alt ? { enqueteJidAlt: alt } : {}), votoBruto: Prisma.DbNull } })
      return aberto.opcoes
    }
    const bruto = votoBrutoParaGuardar({
      idMensagem: e.idMensagem,
      idEnquete: e.idEnquete,
      cifrado: e.cifrado,
      votantes: e.votantes,
      criadores: e.criadores,
      chaveEnquete: e.chaveEnquete ?? null,
      grafica: identidadesDaGrafica(config),
      recebidoEm: new Date().toISOString(),
    })
    await prisma.mensagemWhatsapp.update({ where: { id: l.id }, data: { votoBruto: bruto as unknown as Prisma.InputJsonValue, ...(alt ? { enqueteJidAlt: alt } : {}) } })
    app.log.warn(
      {
        empresa: empresa.slug,
        orcamento: l.orcamento?.numero,
        enquete: e.idEnquete,
        semSegredo: !segredo?.length,
        lidDaGrafica: mascararJid(config.lid),
        grafica: identidadesDaGrafica(config).map(mascararJid),
        votantes: jidsUnicos(votantes).map(mascararJid),
        criadoresVistos: jidsUnicos(e.criadores).map(mascararJid),
        chaveEnquete: e.chaveEnquete ? { ...e.chaveEnquete, remoteJid: mascararJid(e.chaveEnquete.remoteJid), participant: mascararJid(e.chaveEnquete.participant) } : null,
        tamanho: { encPayload: e.cifrado.encPayload.length, encIv: e.cifrado.encIv.length },
      },
      'Voto da enquete do WhatsApp não abriu: guardado em mensagens_whatsapp.voto_bruto para tentar de novo',
    )
    return null
  }

  /**
   * Tenta de novo os votos guardados (voto_bruto) com as identidades conhecidas agora (LID da conta relido da
   * Evolution). O que abrir segue como um voto normal (aprova, pede modificação…), a menos que o cliente já tenha
   * respondido outra coisa depois; o que não abrir continua guardado. Roda dentro do contexto da empresa.
   */
  async function reprocessarVotosGuardados(empresa: EmpresaAtual): Promise<{ abertos: number; aplicados: number; pendentes: number }> {
    const linhas = await prisma.mensagemWhatsapp.findMany({ where: { evento: 'orcamento_enviado', votoBruto: { not: Prisma.DbNull } }, include: incluirOrcamento, take: 50 })
    const resultado = { abertos: 0, aplicados: 0, pendentes: 0 }
    if (!linhas.length) return resultado
    let config = await obterConfigWhatsapp(prisma)
    config = (await atualizarIdentidade(empresa, config)) ?? config
    reprocessarDepois = false
    for (const l of linhas) {
      const bruto = votoDoBruto(l.votoBruto)
      if (!bruto) {
        await prisma.mensagemWhatsapp.update({ where: { id: l.id }, data: { votoBruto: Prisma.DbNull } })
        continue
      }
      const segredo = l.enqueteSegredo ? Buffer.from(l.enqueteSegredo, 'base64') : null
      const aberto = tentarAbrir(bruto.cifrado, bruto.idEnquete, segredo, config, bruto.criadores, [...bruto.votantes, ...(bruto.chaveEnquete?.remoteJid ? [bruto.chaveEnquete.remoteJid] : []), ...identidadesDoCliente(l)])
      if (!aberto) {
        resultado.pendentes++
        continue
      }
      resultado.abertos++
      const alt = identidadeAlternativa(l, aberto, [])
      await prisma.mensagemWhatsapp.update({ where: { id: l.id }, data: { votoBruto: Prisma.DbNull, ...(alt ? { enqueteJidAlt: alt } : {}) } })
      // Respondeu outra coisa depois (texto, outro voto): o voto antigo não passa por cima
      const depois = l.respostaEm && l.respostaEm.getTime() > new Date(bruto.recebidoEm).getTime() && l.respostaIdExterno !== bruto.idMensagem
      if (depois || l.enqueteId !== bruto.idEnquete) continue
      const d = await responder(empresa, { tipo: 'voto', idMensagem: `${bruto.idMensagem}:reaberto`, idEnquete: bruto.idEnquete, numero: null, nome: null, opcoes: aberto.opcoes, cifrado: null, votantes: [], criadores: [] })
      if (d.acao !== 'ignorar') resultado.aplicados++
    }
    app.log.info({ empresa: empresa.slug, ...resultado }, 'Votos da enquete guardados: nova tentativa')
    return resultado
  }

  /** Um voto ou texto recebido */
  async function responder(empresa: EmpresaAtual, e: Extract<EventoWebhook, { tipo: 'voto' | 'texto' }>) {
    const config = await obterConfigWhatsapp(prisma)
    const opcoes = { aprovarSozinho: config.aprovarPelaResposta, agora: new Date() }
    if (e.tipo === 'voto') {
      const linhas = await buscarLinhas({ enqueteId: e.idEnquete })
      if (!linhas.length) return { acao: 'ignorar', motivo: 'enquete desconhecida' } as Decisao
      let escolhidas = e.opcoes
      if (!escolhidas && e.cifrado) escolhidas = await abrirVotoCifrado(empresa, linhas[0]!, { ...e, cifrado: e.cifrado })
      const r: Recebida = { tipo: 'voto', idMensagem: e.idMensagem, idEnquete: e.idEnquete, opcoes: escolhidas }
      const decisao = decidirResposta(r, linhas.map(paraCandidato), opcoes)
      return aplicar(empresa, decisao, r, linhas, escolhidas?.join(', ') || null)
    }
    // A mesma mensagem de novo (webhook repetido): já está nas Conversas
    if (await conversas.jaRecebida(e.idMensagem)) return { acao: 'ignorar', motivo: 'repetida' } as Decisao
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
    if (!linhas.length) {
      // Conversa normal (sem orçamento aberto para o número): vai para as Conversas do WhatsApp
      await conversas.registrar(empresa, e)
      return { acao: 'conversa', motivo: 'sem orçamento para o número' } as const
    }
    const r: Recebida = { tipo: 'texto', idMensagem: e.idMensagem, texto: e.texto, citadoId: e.citadoId }
    // Assistente GrafyGo disponível (a central e a empresa deixam: a chave geral e "respostas do WhatsApp" em
    // Configurações → Assistente, que é o mesmo campo da tela do WhatsApp): as regras só decidem o óbvio
    const comAssistente = (await app.assistente.disponivel()) && funcaoLiberada(await controlesDaEmpresa(prisma), 'respostasWhatsapp')
    const decisao = decidirResposta(r, linhas.map(paraCandidato), { ...opcoes, assistente: comAssistente })
    // Texto que as regras não decidiram, de um orçamento só: o Assistente lê
    if (comAssistente && vaiParaAssistente(decisao, r)) {
      // Registra já (o mesmo aviso do webhook repetido vira "repetida") e lê em segundo plano: o webhook não espera a IA
      await registrar(decisao.alvos[0]!.mensagemId, 'outra', r, e.texto, 'lendo')
      acompanhar(lerComAssistente(empresa, decisao, r, e, linhas, e.texto, opcoes))
      return { acao: 'assistente', motivo: 'lendo a resposta' } as const
    }
    const d = await aplicar(empresa, decisao, r, linhas, e.texto)
    await registrarNaConversa(empresa, e, d)
    return d
  }

  // ─── Assistente GrafyGo: respostas fora do padrão ───

  /** Leituras em andamento (os testes e o desligamento da API esperam) */
  const emAndamento = new Set<Promise<void>>()
  function acompanhar(p: Promise<void>) {
    emAndamento.add(p)
    void p.finally(() => emAndamento.delete(p))
  }

  /**
   * Contexto do orçamento para o Assistente, pelo cérebro da gráfica: nome da gráfica, itens (com a categoria), o
   * primeiro nome e a memória do cliente (o histórico ajuda a entender "pode fazer igual ao da outra vez")
   */
  async function contextoDoOrcamento(empresa: EmpresaAtual, l: Linha, mensagem: string) {
    const c = l.orcamento!.cliente
    const [cerebro, itens] = await Promise.all([
      // Sem a memória (falha ao montar) a leitura segue só com o orçamento
      montarCerebro(prisma, { clienteId: c.id }).catch((erro) => (app.log.warn({ err: erro }, 'Cérebro da gráfica: memória do cliente indisponível'), null)),
      prisma.orcamentoItem.findMany({ where: { orcamentoId: l.orcamento!.id }, orderBy: { ordem: 'asc' }, take: 15, select: { descricao: true, quantidade: true, produto: { select: { categoria: { select: { nome: true } } } } } }),
    ])
    return {
      grafica: cerebro?.grafica || empresa.nome,
      contexto: cerebro ? contextoDoCerebro(cerebro) : undefined,
      orcamento: { numero: l.orcamento!.numero, itens: itens.map((i) => ({ descricao: i.descricao, quantidade: Number(i.quantidade).toLocaleString('pt-BR'), categoria: i.produto.categoria?.nome ?? null })) },
      cliente: c.tipoPessoa === 'PF' ? primeiroNome(c.nome) : null,
      mensagem,
    }
  }

  /**
   * Pede a leitura ao Assistente e aplica: aprova, modificação ou só avisa o vendedor com o resumo. Sem leitura
   * (erro, demora, limite do mês, central desligada no meio) faz o de antes: avisa a equipe. Nunca lança.
   */
  async function lerComAssistente(
    empresa: EmpresaAtual,
    base: Extract<Decisao, { acao: 'notificar' }>,
    r: Extract<Recebida, { tipo: 'texto' }>,
    e: Extract<EventoWebhook, { tipo: 'texto' }>,
    linhas: Linha[],
    escrito: string,
    opcoes: { aprovarSozinho: boolean; agora: Date },
  ) {
    const alvo = base.alvos[0]!
    try {
      const l = linhas.find((x) => x.id === alvo.mensagemId)!
      const leitura = await app.assistente.executar({ assinanteId: empresa.id, recurso: 'whatsapp_resposta', pedido: pedidoClassificarResposta(await contextoDoOrcamento(empresa, l, escrito)) })
      // Outra resposta do cliente chegou enquanto lia: a mais nova fica registrada (esta só avisa, nunca aprova)
      const atual = await prisma.mensagemWhatsapp.findUnique({ where: { id: alvo.mensagemId }, select: { respostaIdExterno: true, respostaVia: true } })
      const ultima = atual?.respostaIdExterno === r.idMensagem
      // Demorou tanto que a recuperação das leituras presas já avisou a equipe (leituras-presas.ts): não repete
      if (ultima && atual?.respostaVia !== VIA_LENDO) {
        app.log.info({ empresa: empresa.slug, orcamento: alvo.numero }, 'Leitura do Assistente voltou depois da recuperação: já tratada')
        await registrarNaConversa(empresa, e, { ...base, avisarEquipe: true })
        return
      }
      let d: Decisao = base
      if (leitura.ok) {
        d = decidirPeloAssistente(leitura.dados, escrito, base, opcoes)
        // Outra resposta chegou enquanto lia: esta só avisa (nunca aprova); outro assunto segue para as Conversas
        if (!ultima && d.acao !== 'notificar' && d.acao !== 'outro_assunto') d = { acao: 'notificar', motivo: 'assistente', alvos: [alvo], resposta: 'outra', avisarEquipe: true, assistente: leitura.dados }
      } else {
        app.log.info({ empresa: empresa.slug, orcamento: alvo.numero, motivo: leitura.motivo }, 'Resposta do WhatsApp sem a leitura do Assistente: só avisa a equipe')
      }
      await aplicar(empresa, d, r, linhas, escrito, ultima)
      await registrarNaConversa(empresa, e, d)
    } catch (erro) {
      app.log.error({ err: erro, empresa: empresa.slug, orcamento: alvo.numero }, 'Assistente GrafyGo: resposta do WhatsApp não processada; avisando a equipe')
      try {
        await aplicar(empresa, base, r, linhas, escrito)
        await registrarNaConversa(empresa, e, base)
      } catch (erro2) {
        app.log.error({ err: erro2, empresa: empresa.slug }, 'Resposta do WhatsApp não processada')
      }
    }
  }

  /** Conexão mudou (CONNECTION_UPDATE): grava o último estado conhecido (e o LID da conta, para abrir os votos) */
  async function conexao(empresa: EmpresaAtual, e: Extract<EventoWebhook, { tipo: 'conexao' }>) {
    if (app.whatsapp.provedor.simulado || e.estado === 'conectando') return
    const config = await obterConfigWhatsapp(prisma)
    if (e.estado === 'conectado') {
      if (config.conectado && (!e.numero || config.numero === e.numero)) {
        if (!config.lid) await atualizarIdentidade(empresa, config)
        return
      }
      // Outro número: o LID guardado era da conta anterior
      const trocou = Boolean(e.numero && config.numero && e.numero !== config.numero)
      const atualizada = await prisma.whatsappConfig.update({
        where: { id: config.id },
        data: {
          conectado: true,
          numero: e.numero ?? config.numero,
          nomePerfil: e.nomePerfil ?? config.nomePerfil,
          conectadoEm: config.conectadoEm ?? new Date(),
          desconectadoEm: null,
          ...(trocou ? { lid: null } : {}),
        },
      })
      app.whatsapp.marcarFila(empresa.id)
      await atualizarIdentidade(empresa, atualizada)
    } else if (config.conectado) {
      await prisma.whatsappConfig.update({ where: { id: config.id }, data: { conectado: false, desconectadoEm: new Date() } })
    }
  }

  return {
    /** Aviso do webhook já autenticado, dentro da empresa da instância */
    async processar(empresa: EmpresaAtual, aviso: AvisoWebhook) {
      const resultados: { tipo: EventoWebhook['tipo']; acao: string; motivo?: string; jids?: (string | null)[] }[] = []
      await contextoEmpresa.com(empresa, async () => {
        for (const e of aviso.eventos) {
          try {
            if (e.tipo === 'conexao') {
              await conexao(empresa, e)
              resultados.push({ tipo: e.tipo, acao: 'conexao' })
            } else if (e.tipo === 'midia') {
              // Foto, áudio... sem texto: só para as Conversas (o tipo, sem o arquivo)
              const id = await conversas.registrar(empresa, e)
              resultados.push({ tipo: e.tipo, acao: id ? 'conversa' : 'ignorar' })
            } else if (e.tipo === 'reacao') {
              // 📝 do dono numa mensagem do cliente: o orçamento rascunho (copiloto)
              resultados.push({ tipo: e.tipo, ...(await copiloto.reacao(empresa, e, aviso.sender ?? null)), jids: e.jids.map(mascararJid) })
            } else if (e.tipo === 'proprio') {
              // Mensagem do próprio número: a conversa "Você" é o canal do Assistente; na conversa com o cliente, o que o
              // dono digitou fica guardado (a aprovação sozinha olha se conversaram depois do envio)
              const r = await copiloto.proprio(empresa, e, aviso.sender ?? null)
              const doDono = r.motivo === 'conversa com cliente' || r.motivo === 'assistente no WhatsApp desligado' ? await mensagensDono.registrar(e, aviso.sender ?? null) : false
              resultados.push({ tipo: e.tipo, ...r, ...(doDono ? { acao: 'dono', motivo: 'mensagem do dono na conversa' } : {}), jids: e.jids.map(mascararJid) })
            } else {
              const d = await responder(empresa, e)
              resultados.push({ tipo: e.tipo, acao: d.acao, ...('motivo' in d ? { motivo: d.motivo } : {}) })
            }
          } catch (erro) {
            app.log.error({ err: erro, empresa: empresa.slug, evento: e.tipo }, 'Resposta do WhatsApp não processada')
            resultados.push({ tipo: e.tipo, acao: 'erro' })
          }
        }
        // Aprendeu o LID da conta agora: os votos guardados que não abriram têm nova chance
        if (reprocessarDepois) {
          reprocessarDepois = false
          try {
            await reprocessarVotosGuardados(empresa)
          } catch (erro) {
            app.log.warn({ err: erro, empresa: empresa.slug }, 'Votos da enquete guardados: nova tentativa falhou')
          }
        }
      })
      // O que o copiloto fez com cada evento do dono (sem o texto, endereços mascarados): diagnóstico de "não respondeu
      // nada" pelos logs (ex.: a conversa "Você" chegando por um endereço que a conta não reconhece como dela)
      const doCopiloto = resultados.filter((r) => r.tipo === 'reacao' || r.tipo === 'proprio')
      if (doCopiloto.length) {
        const conta = await prisma.whatsappConfig.findFirst({ select: { numero: true, lid: true } })
        app.log.info(
          { empresa: empresa.slug, eventos: doCopiloto, conta: { numero: mascararJid(conta?.numero), lid: mascararJid(conta?.lid), sender: mascararJid(aviso.sender) } },
          'Copiloto do WhatsApp',
        )
      }
      return resultados
    },

    /** Tenta de novo os votos guardados que não abriram (voto_bruto), com as identidades conhecidas agora */
    async reprocessarVotos(empresa: EmpresaAtual) {
      return contextoEmpresa.com(empresa, () => reprocessarVotosGuardados(empresa))
    },

    /** Espera as leituras do Assistente em andamento e cancela as das conversas agendadas (testes e desligamento) */
    async aguardarAssistente() {
      while (emAndamento.size) await Promise.all([...emAndamento])
      await conversas.encerrar()
      await copiloto.aguardar()
    },
  }
}

export type RespostasWhatsapp = ReturnType<typeof criarRespostasWhatsapp>
