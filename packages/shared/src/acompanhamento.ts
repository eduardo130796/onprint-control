/** Link público "Acompanhe seu pedido" (/pedido/:empresa/:token): o cliente vê o andamento sem login. */
import type { StatusArte, StatusPedido, TipoEntrega } from './enums-comercial'

/** Caminho da página de acompanhamento (o front e a API completam com a origem do sistema). */
export function caminhoAcompanhamento(slug: string, token: string): string {
  return `/pedido/${slug}/${token}`
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
      versao: number
      status: StatusArte
      rotulo: string
      aguardandoAprovacao: boolean
      /** Caminho da página pública de aprovação (/arte/:empresa/:token), só quando aguarda o cliente */
      linkAprovacao: string | null
      miniaturaUrl: string | null
    } | null
  }[]
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
