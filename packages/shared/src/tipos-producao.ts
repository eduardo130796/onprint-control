/** Respostas da API de pedidos, artes, entregas e produção. */
import type { TipoCobranca } from './enums'
import type { Prioridade, StatusArte, StatusFinanceiroPedido, StatusPedido, TipoEntrega } from './enums-comercial'
import type { EtapaProducao, StatusEntrega } from './enums-producao'
import type { ContaReceberResumo } from './tipos-comercial'

type Ref = { id: string; nome: string }

export interface Pedido {
  id: string
  numero: string
  clienteId: string
  cliente: Ref & { whatsapp: string | null; telefone: string | null }
  vendedorId: string | null
  vendedor: Ref | null
  orcamento: { id: string; numero: string } | null
  dataPrevistaEntrega: string
  status: StatusPedido
  statusFinanceiro: StatusFinanceiroPedido
  tipoEntrega: TipoEntrega
  enderecoEntrega: string | null
  subtotal: string
  desconto: string
  acrescimo: string
  frete: string
  total: string
  valorPago: string
  prioridade: Prioridade
  observacoes: string | null
  observacoesInternas: string | null
  motivoCancelamento: string | null
  canceladoEm: string | null
  atrasado: boolean
  createdAt: string
  updatedAt: string
  /** Resumo para lista e kanban */
  resumo?: { itens: number; artesAprovadas: number; artes: number; opsConcluidas: number; ops: number }
}

export interface ArteComentario {
  id: string
  autorNome: string
  origem: 'cliente' | 'interno'
  texto: string
  createdAt: string
}

export interface ArteVersao {
  id: string
  versao: number
  status: StatusArte
  arquivo: { id: string; nomeOriginal: string; mime: string; tamanho: number } | null
  miniaturaId: string | null
  /** URL assinada (1 h) da miniatura, para <img> */
  miniaturaUrl: string | null
  designer: Ref | null
  tokenPublico: string
  aprovadaEm: string | null
  createdAt: string
  updatedAt: string
  comentarios: ArteComentario[]
}

export interface PedidoItemDetalhe {
  id: string
  descricao: string
  quantidade: string
  largura: string | null
  altura: string | null
  areaM2: string
  precoUnitario: string
  total: string
  prazoDias: number
  observacao: string | null
  produto: { id: string; codigo: string; nome: string }
  acabamentos: { id: string; nome: string; tipoCobranca: TipoCobranca; valor: string }[]
  artes: ArteVersao[]
  ordensProducao: { id: string; numero: string; etapaAtual: EtapaProducao; cancelada: boolean }[]
}

export interface Entrega {
  id: string
  pedidoId: string
  pedido?: { id: string; numero: string; cliente: Ref; status: StatusPedido }
  tipo: TipoEntrega
  dataAgendada: string | null
  dataRealizada: string | null
  responsavel: Ref | null
  recebidoPor: string | null
  comprovanteId: string | null
  endereco: string | null
  status: StatusEntrega
  observacao: string | null
  createdAt: string
}

export interface PedidoDetalhe extends Pedido {
  itens: PedidoItemDetalhe[]
  contasReceber: ContaReceberResumo[]
  comissoes: { id: string; valor: string; percentual: string; status: string; vendedor: Ref }[]
  entregas: Entrega[]
}

export interface EventoHistorico {
  id: string
  quando: string
  titulo: string
  detalhe: string | null
  usuario: string | null
  tipo: 'pedido' | 'arte' | 'producao' | 'entrega' | 'financeiro'
}

export interface OrdemProducao {
  id: string
  numero: string
  pedidoId: string
  pedido: { id: string; numero: string; cliente: Ref; dataPrevistaEntrega: string; status: StatusPedido }
  pedidoItemId: string
  item: { id: string; descricao: string; produto: { id: string; nome: string } }
  quantidade: string
  largura: string | null
  altura: string | null
  areaM2: string
  etapaAtual: EtapaProducao
  maquinaId: string | null
  maquina: Ref | null
  responsavelId: string | null
  responsavel: Ref | null
  prioridade: Prioridade
  horasEstimadas: string
  dataInicioPrevista: string | null
  dataFimPrevista: string | null
  dataInicioReal: string | null
  dataFimReal: string | null
  entrouEtapaEm: string
  ordemKanban: number
  observacoes: string | null
  cancelada: boolean
  atrasada: boolean
  /** Status e miniatura da última versão da arte do item */
  arte: { status: StatusArte; miniaturaId: string | null; miniaturaUrl: string | null; versao: number } | null
  createdAt: string
  updatedAt: string
}

export interface OrdemProducaoDetalhe extends OrdemProducao {
  historico: { id: string; etapaDe: EtapaProducao | null; etapaPara: EtapaProducao; usuario: Ref | null; segundosNaEtapa: number; override: boolean; motivo: string | null; createdAt: string }[]
  apontamentos: {
    id: string
    processo: Ref | null
    maquina: Ref | null
    operador: Ref | null
    inicio: string
    fim: string | null
    quantidadeProduzida: string
    perda: string
    observacao: string | null
  }[]
  acabamentos: string[]
  /** Insumos baixados do estoque na conclusão (quantidade negativa) */
  consumos: { id: string; quantidade: string; custoUnitario: string; createdAt: string; produto: { id: string; nome: string; unidade: string | null } }[]
}

export interface PcpMaquina {
  maquina: Ref & { status: string; velocidadeM2Hora: string | null }
  opsNaFila: number
  horasEstimadas: number
  horasSemana: number
  capacidadeSemana: number
  ocupacao: number
}

export interface PcpResumo {
  semana: { inicio: string; fim: string }
  maquinas: PcpMaquina[]
  semMaquina: { opsNaFila: number; horasEstimadas: number }
  gargalos: string[]
  atrasadas: OrdemProducao[]
  ops: OrdemProducao[]
}

/** Link público da arte (/arte/:token), sem login. */
export interface ArtePublica {
  versao: number
  status: StatusArte
  ultimaVersao: boolean
  podeResponder: boolean
  pedido: { numero: string; cliente: string }
  item: { descricao: string; quantidade: string; largura: string | null; altura: string | null }
  arquivo: { nome: string; mime: string; url: string; visualizavel: boolean } | null
  miniaturaUrl: string | null
  comentarios: { autorNome: string; origem: 'cliente' | 'interno'; texto: string; createdAt: string }[]
  aprovadaEm: string | null
  empresa: { nome: string; logoUrl: string | null }
}
