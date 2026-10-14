/** Link público "Acompanhe seu pedido" (/pedido/:empresa/:token): o cliente vê o andamento sem login. */
import type { StatusArte, StatusPedido, TipoEntrega } from './enums-comercial'

/** Caminho da página de acompanhamento (o front e a API completam com a origem do sistema). */
export function caminhoAcompanhamento(slug: string, token: string): string {
  return `/pedido/${slug}/${token}`
}

/** Status do pedido em que a arte ainda está em jogo (depois disso a produção já seguiu) */
export const STATUS_PEDIDO_NA_ARTE: readonly StatusPedido[] = ['aguardando_arte', 'arte_em_aprovacao']

/** O cliente ainda pode responder esta arte: ela aguarda a resposta dele e o pedido não passou da etapa da arte */
export function arteAguardaCliente(statusPedido: StatusPedido, statusArte: StatusArte | null | undefined): boolean {
  return statusArte === 'enviada_cliente' && STATUS_PEDIDO_NA_ARTE.includes(statusPedido)
}

/**
 * Mostrar o pedido de aprovação da arte (destaque e botões) na página do pedido? Só enquanto alguma arte aguarda
 * o cliente E o pedido ainda está na etapa da arte: em produção, pronto, em entrega, entregue ou cancelado, não.
 */
export function mostrarAprovacaoArte(statusPedido: StatusPedido, artes: (StatusArte | null | undefined)[]): boolean {
  return artes.some((a) => arteAguardaCliente(statusPedido, a))
}

/**
 * "Cliente aprovou todas as artes" (equipe, um clique): a última versão de cada item que tem arquivo e está com o
 * cliente ou em criação. Aprovada, com ajuste pedido ou sem arquivo ficam como estão.
 */
export function artesParaAprovarTodas<T extends { status: StatusArte; arquivoId: string | null }>(artes: T[]): T[] {
  return artes.filter((a) => Boolean(a.arquivoId) && (a.status === 'enviada_cliente' || a.status === 'em_criacao'))
}

export type CodigoEtapaAcompanhamento = 'confirmado' | 'arte' | 'producao' | 'pronto' | 'entregue'

export interface EtapaAcompanhamento {
  codigo: CodigoEtapaAcompanhamento
  titulo: string
  descricao: string
  situacao: 'concluida' | 'atual' | 'pendente'
  /** Quando o pedido chegou nesta etapa (pela linha do tempo); null se não houver registro */
  quando: string | null
}

export interface PedidoAcompanhamento {
  numero: string
  criadoEm: string
  dataPrevistaEntrega: string
  atrasado: boolean
  status: StatusPedido
  cancelado: boolean
  canceladoEm: string | null
  /** Frase principal do topo ("Em produção", "Seu pedido está sendo produzido.") */
  situacao: { titulo: string; descricao: string }
  etapas: EtapaAcompanhamento[]
  cliente: { nome: string }
  empresa: {
    nome: string
    logoUrl: string | null
    corTema: string | null
    whatsapp: string | null
    telefone: string | null
    email: string | null
    endereco: string | null
    horario: string | null
  }
  itens: {
    descricao: string
    quantidade: string
    largura: string | null
    altura: string | null
    acabamentos: string[]
    total: string
    /** Última versão da arte do item */
    arte: {
      /** Para aprovar ou pedir ajuste desta arte pela página do pedido */
      id: string
      versao: number
      status: StatusArte
      rotulo: string
      /** Aguarda o cliente e o pedido ainda está na etapa da arte (arteAguardaCliente) */
      aguardandoAprovacao: boolean
      /** Caminho da página antiga de aprovação (/arte/:empresa/:token), só quando aguarda o cliente */
      linkAprovacao: string | null
      miniaturaUrl: string | null
      /** Arquivo em tamanho real (URL temporária); visualizavel = imagem ou PDF que o navegador abre */
      arquivo: { nome: string; mime: string; url: string; visualizavel: boolean } | null
      /** Último pedido de ajuste do cliente (enquanto o ajuste está em andamento) */
      ajustePedido: string | null
    } | null
  }[]
  /** Aprovação da arte pelo cliente: mostrar = alguma arte aguarda e o pedido ainda está na etapa da arte */
  aprovacaoArte: { mostrar: boolean; pendentes: number }
  financeiro: {
    total: string
    pago: string
    restante: string
    quitado: boolean
    proximoVencimento: { data: string; valor: string; vencida: boolean } | null
    parcelas: { rotulo: string; valor: string; vencimento: string; pago: boolean; vencida: boolean; pagoEm: string | null }[]
  }
  entrega: {
    tipo: TipoEntrega
    rotulo: string
    /** Endereço de entrega/instalação (null na retirada) */
    endereco: string | null
    agendadaPara: string | null
    realizadaEm: string | null
  }
  observacoes: string | null
  /** Marcos com data, do mais recente para o mais antigo (sem nomes da equipe nem comentários internos) */
  historico: { quando: string; titulo: string }[]
}
