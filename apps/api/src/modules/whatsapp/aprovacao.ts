import { createHash } from 'node:crypto'
import { formatarMoeda } from '@onprint/shared'

/*
 * Aprovação pela resposta do cliente, segura no mundo real (puro, testável). Aprovar sozinho só no caso limpo: o
 * orçamento que o cliente viu é o que está no sistema (a versão gravada no envio) e o dono não digitou nada na
 * conversa depois do envio (pode ter combinado outro valor à mão). Fora disso, "aprovação a confirmar": o dono
 * confirma no "Você" (ou no sistema). Depois de aprovar sozinho, o "desfazer" vale por 10 minutos e só se nada
 * aconteceu no pedido.
 */

/** Orçamento editado há pouco mais que isto depois do envio conta como mudado (envios sem a versão gravada) */
export const FOLGA_SEM_VERSAO_MS = 5 * 60_000
/** "desfazer" depois da aprovação automática */
export const DESFAZER_MS = 10 * 60_000
/** Mensagens do dono guardadas por este tempo (privacidade: o mínimo, por pouco tempo) */
export const GUARDA_MENSAGENS_DONO_MS = 30 * 86_400_000

type Dec = { toString(): string }

/** O que o cliente vê do orçamento: itens, valores e pagamento (o que muda o pedido) */
export interface OrcamentoParaVersao {
  total: Dec
  desconto: Dec
  acrescimo: Dec
  frete: Dec
  sinalPercentual: Dec
  parcelas: number
  intervaloDias: number
  itens: { produtoId: string; descricao: string; quantidade: Dec; largura: Dec | null; altura: Dec | null; total: Dec; acabamentos: { acabamentoId: string }[] }[]
}

const n = (v: Dec | null) => (v === null ? null : Number(v.toString()))

/** Resumo (hash) da versão do orçamento: gravado no envio e comparado na resposta */
export function versaoDoOrcamento(o: OrcamentoParaVersao): string {
  const dados = {
    total: n(o.total),
    desconto: n(o.desconto),
    acrescimo: n(o.acrescimo),
    frete: n(o.frete),
    pagamento: [n(o.sinalPercentual), o.parcelas, o.intervaloDias],
    itens: o.itens.map((i) => [i.produtoId, i.descricao.trim(), n(i.quantidade), n(i.largura), n(i.altura), n(i.total), i.acabamentos.map((a) => a.acabamentoId).sort()]),
  }
  return createHash('sha256').update(JSON.stringify(dados)).digest('hex').slice(0, 32)
}

export interface ContextoAprovacao {
  /** "Aprovar sozinho quando o cliente responder Aprovado" (tela WhatsApp) */
  aprovarSozinho: boolean
  enviadaEm: Date
  /** Versão gravada no envio (null: envio de antes desta regra) */
  versaoEnviada: string | null
  versaoAtual: string
  orcamentoAtualizadoEm: Date
  totalEnviado: string | null
  totalAtual: string
  /** Mensagens que o dono digitou na conversa (as do sistema já ficaram de fora) */
  mensagensDoDono: { texto: string; em: Date }[]
}

export type DecisaoAprovacao =
  | { acao: 'aprovar' }
  /** "Aprovar sozinho" desligado: a equipe confirma (como sempre foi) */
  | { acao: 'manual' }
  | {
      acao: 'confirmar'
      /** O orçamento mudou depois do envio (o cliente viu outro): os totais, quando se sabe */
      mudou: { antes: string | null; agora: string } | null
      /** O que o dono escreveu depois do envio (as 2 últimas, curtas) */
      conversa: string[]
    }

const curta = (t: string) => {
  const s = t.replace(/\s+/g, ' ').trim()
  return s.length > 120 ? `${s.slice(0, 117)}…` : s
}

/** As três condições juntas: nada mudou, ninguém conversou e a aprovação é clara (quem chama já decidiu que é) */
export function decidirAprovacaoAutomatica(c: ContextoAprovacao): DecisaoAprovacao {
  if (!c.aprovarSozinho) return { acao: 'manual' }
  const mudou = c.versaoEnviada ? c.versaoEnviada !== c.versaoAtual : c.orcamentoAtualizadoEm.getTime() > c.enviadaEm.getTime() + FOLGA_SEM_VERSAO_MS
  const depois = c.mensagensDoDono.filter((m) => m.em.getTime() > c.enviadaEm.getTime()).sort((a, b) => a.em.getTime() - b.em.getTime())
  if (!mudou && !depois.length) return { acao: 'aprovar' }
  return { acao: 'confirmar', mudou: mudou ? { antes: c.totalEnviado, agora: c.totalAtual } : null, conversa: depois.slice(-2).map((m) => curta(m.texto)) }
}

/** Motivo curto para a faixa do orçamento e o sino */
export function motivoDaConfirmacao(d: Extract<DecisaoAprovacao, { acao: 'confirmar' }>): string {
  const partes = [
    ...(d.conversa.length ? [`depois do envio vocês conversaram: “${d.conversa.at(-1)}”`] : []),
    ...(d.mudou ? [d.mudou.antes && d.mudou.antes !== d.mudou.agora ? `o orçamento mudou depois do envio (o cliente viu ${formatarMoeda(d.mudou.antes)}; agora está ${formatarMoeda(d.mudou.agora)})` : 'o orçamento mudou depois do envio'] : []),
  ]
  return partes.join('; ')
}

/** O aviso no "Você": quem respondeu o quê, o motivo e como confirmar (o "ok" aqui APROVA; não reenvia) */
export function textoConfirmarAprovacao(a: {
  cliente: string
  resposta: string
  numero: string
  total: string
  decisao: Extract<DecisaoAprovacao, { acao: 'confirmar' }>
  converteAoAprovar: boolean
}): string {
  const linhas = [`${a.cliente} respondeu “${curta(a.resposta)}” ao ${a.numero} (${formatarMoeda(a.decisao.mudou?.antes ?? a.total)}).`]
  if (a.decisao.conversa.length) linhas.push(`Depois do envio vocês conversaram: ${a.decisao.conversa.map((t) => `“${t}”`).join(' · ')}`)
  if (a.decisao.mudou) {
    linhas.push(
      a.decisao.mudou.antes && a.decisao.mudou.antes !== a.decisao.mudou.agora
        ? `O orçamento mudou depois do envio (o cliente viu ${formatarMoeda(a.decisao.mudou.antes)}; agora está ${formatarMoeda(a.decisao.mudou.agora)}).`
        : 'O orçamento mudou depois do envio (o cliente viu outra versão).',
    )
  }
  linhas.push('')
  const ok = `Responda *ok* a esta mensagem para ${a.converteAoAprovar ? 'virar pedido' : 'aprovar'} assim`
  linhas.push(a.decisao.mudou ? `${ok}, *reenvia* para mandar a versão nova ao cliente antes, ou ajuste antes ("faz por 500").` : `${ok}, ou ajuste antes ("faz por 500").`)
  return linhas.join('\n')
}

/** Depois da aprovação automática: o que aconteceu e o "desfazer" */
export function textoAprovadoAuto(a: { numero: string; cliente: string; total: string; pedido: string | null }): string {
  // Uma linha só (o "desfazer" é respondido em cima dela): o primeiro nome do cliente basta
  const nome = a.cliente.trim().split(/\s+/)[0] ?? a.cliente
  return `✅ ${a.numero} aprovado por ${nome}${a.pedido ? ` → ${a.pedido}` : ''} (${formatarMoeda(a.total)}). *desfazer* em até 10 min.`
}

export interface PedidoParaDesfazer {
  numero: string
  status: string
  valorPago: string
  /** Contas a receber pagas ou com pagamento parcial */
  contasPagas: number
  /** OPs que saíram da fila (produção começou) */
  opsIniciadas: number
  /** Artes que já não esperam o arquivo (criação, enviada, aprovada…) */
  artesMexidas: number
}

/**
 * Dá para desfazer a aprovação automática? Só até 10 minutos depois do aviso e, com pedido, só se nada aconteceu nele:
 * sem pagamento, sem produção, sem arte. Devolve o motivo quando não dá (null = pode).
 */
export function impedimentoParaDesfazer(c: { avisoEm: Date; agora: Date; orcamentoStatus: string; pedido: PedidoParaDesfazer | null }): string | null {
  if (c.agora.getTime() - c.avisoEm.getTime() > DESFAZER_MS) return 'já passaram os 10 minutos para desfazer por aqui'
  if (!['aprovado', 'convertido'].includes(c.orcamentoStatus)) return 'o orçamento não está mais aprovado'
  const p = c.pedido
  if (!p) return null
  if (p.status === 'cancelado') return `o pedido ${p.numero} já está cancelado`
  if (!['aguardando_arte', 'arte_em_aprovacao', 'em_producao'].includes(p.status)) return `o pedido ${p.numero} já andou (está ${p.status.replace(/_/g, ' ')})`
  if (Number(p.valorPago) > 0 || p.contasPagas > 0) return `o pedido ${p.numero} já tem pagamento`
  if (p.opsIniciadas > 0) return `a produção do ${p.numero} já começou`
  if (p.artesMexidas > 0) return `a arte do ${p.numero} já foi mexida`
  return null
}

// ─── Resposta automática ao cliente: o atendente se cala quando o dono está na conversa ───

/** O dono escreveu na conversa há menos que isto: ele está atendendo, o sistema não responde sozinho ao cliente */
export const DONO_PRESENTE_MS = 30 * 60_000

export type MotivoDoSilencio = 'dono_presente' | 'sem_clientes'

/**
 * A resposta automática ao cliente ("Perfeito, recebemos sua aprovação", "Certo! Já avisei a equipe…") pode sair? Não,
 * se o dono digitou algo nessa conversa nos últimos 30 minutos (ele está atendendo: a resposta pronta atravessaria a
 * conversa dele) ou se a decisão veio do Assistente com "Nunca falar com meus clientes" ligado. Os avisos de pedido
 * (confirmado, pronto…) não passam por aqui.
 */
export function silencioAoCliente(c: { peloAssistente: boolean; semClientes: boolean; ultimaDoDonoEm: Date | null; agora: Date }): MotivoDoSilencio | null {
  if (c.peloAssistente && c.semClientes) return 'sem_clientes'
  if (c.ultimaDoDonoEm && c.agora.getTime() - c.ultimaDoDonoEm.getTime() < DONO_PRESENTE_MS) return 'dono_presente'
  return null
}
