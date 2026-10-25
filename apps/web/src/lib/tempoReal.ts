import type { EventoOrcamento, EventoSolicitacao } from '@onprint/shared'

/**
 * Regras dos eventos de tempo real (funções puras, testadas em tempoReal.test.ts):
 * quais listas atualizar e quando mostrar um aviso flutuante. Aviso só para o que importa
 * e nunca para quem fez a ação (a própria tela já mostrou o resultado).
 */

export interface AvisoTempoReal {
  mensagem: string
  acao?: { rotulo: string; link: string }
}

/** Quem está vendo: o próprio usuário e se ele vê os orçamentos de todos os vendedores */
export interface Espectador {
  usuarioId: string | null
  veTodosOrcamentos: boolean
}

/** Notificação do sino (`notificacao:nova`): `toast: false` = só atualiza o sino (o aviso vem de outro evento) */
export interface EventoNotificacao {
  titulo?: string
  link?: string
  toast?: boolean
  estoque?: boolean
}

/** Chaves (prefixos das queries) a invalidar em cada evento */
export function chavesDoEvento(evento: string, dados: Partial<EventoOrcamento> & { estoque?: boolean } = {}): string[] {
  switch (evento) {
    // Concluir OP baixa insumos (o estoque também muda) e põe a etiqueta na fila
    case 'op:atualizada':
      return ['ops', 'pcp', 'pedidos', 'estoque', 'etiquetas', 'dashboard']
    // Pagamentos e caixa também chegam aqui (status financeiro do pedido)
    case 'pedido:atualizado':
      return ['pedidos', 'entregas', 'ops', 'estoque', 'financeiro', 'caixa', 'dashboard']
    case 'orcamento:atualizado': {
      const chaves = ['orcamentos', 'dashboard', 'primeiros-passos']
      // Conversão: pedido, contas a receber e cliente promovido (pré-cadastro → ativo)
      if (dados.acao === 'convertido') chaves.push('pedidos', 'financeiro', 'clientes')
      // Orçamento feito a partir de uma solicitação: ela vira "orçada"
      if (dados.acao === 'criado') chaves.push('solicitacoes')
      return chaves
    }
    case 'solicitacao:nova':
      return ['solicitacoes', 'dashboard', 'clientes']
    case 'solicitacao:atualizada':
      return ['solicitacoes', 'dashboard']
    case 'notificacao:nova':
      return ['notificacoes', ...(dados.estoque ? ['estoque'] : [])]
    default:
      return []
  }
}

/** Aviso de orçamento: resposta do cliente (aprovou/recusou) ou mudança importante feita por outra pessoa num orçamento meu */
export function avisoDoOrcamento(e: EventoOrcamento, eu: Espectador): AvisoTempoReal | null {
  if (!e.id || !e.numero || (eu.usuarioId && e.atorId === eu.usuarioId)) return null
  const meu = Boolean(eu.usuarioId) && e.vendedorId === eu.usuarioId
  // Sem "ver todos", só os orçamentos do próprio vendedor
  if (!eu.veTodosOrcamentos && !meu) return null
  const abrirOrcamento = { rotulo: 'Abrir orçamento', link: `/orcamentos/${e.id}` }
  const pedido = e.pedidoId && e.pedidoNumero ? { numero: e.pedidoNumero, acao: { rotulo: 'Abrir pedido', link: `/pedidos/${e.pedidoId}` } } : null
  const virou = pedido ? ` · virou o pedido ${pedido.numero}` : ''

  if (e.origem === 'cliente') {
    const cliente = e.cliente || 'O cliente'
    const peloWhatsapp = e.canal === 'whatsapp' ? ' pelo WhatsApp' : ''
    if (e.acao === 'aprovado' || e.acao === 'convertido') return { mensagem: `${cliente} aprovou o orçamento ${e.numero}${peloWhatsapp}${virou}`, acao: pedido?.acao ?? abrirOrcamento }
    if (e.acao === 'recusado') return { mensagem: `${cliente} recusou o orçamento ${e.numero}`, acao: abrirOrcamento }
    // Respondeu "Quero modificações" na conversa: o orçamento volta para negociação
    if (e.acao === 'negociacao') return { mensagem: `${cliente} pediu modificações no orçamento ${e.numero}${peloWhatsapp}`, acao: abrirOrcamento }
    return null
  }
  // Pela equipe: só no orçamento do próprio vendedor (alguém registrou a aprovação, a recusa ou converteu)
  if (e.origem !== 'equipe' || !meu) return null
  if (e.acao === 'aprovado') return { mensagem: `Aprovação do orçamento ${e.numero} registrada${virou}`, acao: pedido?.acao ?? abrirOrcamento }
  if (e.acao === 'convertido') return { mensagem: `Orçamento ${e.numero}${virou || ' virou pedido'}`, acao: pedido?.acao ?? abrirOrcamento }
  if (e.acao === 'recusado') return { mensagem: `Recusa do orçamento ${e.numero} registrada`, acao: abrirOrcamento }
  return null
}

/** Aviso de solicitação: só o pedido que chegou pelo site (as da equipe aparecem na lista sem aviso) */
export function avisoDaSolicitacao(evento: string, e: EventoSolicitacao, eu: Espectador): AvisoTempoReal | null {
  if (evento !== 'solicitacao:nova' || e.origem !== 'cliente' || (eu.usuarioId && e.atorId === eu.usuarioId)) return null
  return {
    mensagem: `Novo pedido pelo site: ${e.numero}${e.cliente ? ` · ${e.cliente}` : ''}`,
    acao: { rotulo: 'Abrir', link: `/orcamentos/solicitacoes?id=${e.id}` },
  }
}

/** Aviso da notificação do sino (sem título ou com `toast: false`, só atualiza o sino) */
export function avisoDaNotificacao(e: EventoNotificacao): AvisoTempoReal | null {
  if (!e.titulo || e.toast === false) return null
  return { mensagem: e.titulo, acao: e.link ? { rotulo: 'Abrir', link: e.link } : undefined }
}
