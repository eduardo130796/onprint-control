/** Respostas da API do módulo comercial (datas ISO, valores como string decimal). */
import type { OrigemCliente, TipoCobranca } from './enums'
import type { RespostaWhatsapp } from './whatsapp'
import type {
  Prioridade,
  StatusArte,
  StatusComissao,
  StatusConta,
  StatusFinanceiroPedido,
  StatusOrcamento,
  StatusPedido,
  StatusSolicitacao,
  TipoEntrega,
} from './enums-comercial'
import type { Auditavel, RefCliente } from './tipos'
import type { SolicitacaoItem } from './schemas/vitrine'
import type { OrigemOrcamento } from './schemas/regras'
import type { RegrasDoOrcamento } from './regras-comerciais'

type Ref = { id: string; nome: string }

export interface Solicitacao extends Auditavel {
  numero: string
  clienteId: string | null
  cliente: (RefCliente & { situacao: string; whatsapp: string | null }) | null
  origem: OrigemCliente
  descricao: string
  prazoDesejado: string | null
  status: StatusSolicitacao
  responsavelId: string | null
  responsavel: Ref | null
  referenciaExterna: string | null
  motivoDescarte: string | null
  /** E-mail do contato (pedidos da vitrine) */
  email: string | null
  /** Itens da lista de orçamento (vazio nas solicitações digitadas no sistema) */
  itens: SolicitacaoItem[]
  orcamentos: { id: string; numero: string; status: StatusOrcamento }[]
}

export interface OrcamentoItemAcabamento {
  id: string
  acabamentoId: string
  nome: string
  tipoCobranca: TipoCobranca
  valorUnitario: string
  base: string
  valor: string
}

export interface OrcamentoItem {
  id: string
  produtoId: string
  produto: { id: string; codigo: string; nome: string; modoCalculo: string }
  descricao: string
  quantidade: string
  largura: string | null
  altura: string | null
  areaM2: string
  precoUnitario: string
  valorProduto: string
  valorAcabamentos: string
  /** Desconto manual (o das regras comerciais fica em ajusteRegras) */
  desconto: string
  /** Regras comerciais no item, com sinal (negativo = desconto) */
  ajusteRegras: string
  total: string
  /** Só para quem vê custos */
  custoEstimado?: string
  prazoDias: number
  ordem: number
  observacao: string | null
  /** O item espera a arte antes de produzir (vai para o item do pedido na conversão) */
  precisaArte: boolean
  precoLiberadoPor: Ref | null
  acabamentos: OrcamentoItemAcabamento[]
}

export interface ContaReceberResumo {
  id: string
  descricao: string
  parcela: number
  totalParcelas: number
  valor: string
  /** Presente no detalhe do pedido (Fase 6) */
  valorPago?: string
  vencimento: string
  status: StatusConta
}

export interface PedidoResumo {
  id: string
  numero: string
  status: StatusPedido
  statusFinanceiro: StatusFinanceiroPedido
  dataPrevistaEntrega: string
  total: string
  contasReceber: ContaReceberResumo[]
  comissoes: { id: string; valor: string; percentual: string; status: StatusComissao }[]
  itens: { id: string; descricao: string; artes: { id: string; versao: number; status: StatusArte }[] }[]
}

export interface Orcamento extends Auditavel {
  numero: string
  clienteId: string
  cliente: RefCliente & { situacao: string; whatsapp: string | null; email: string | null; telefone: string | null; cpfCnpj: string | null }
  vendedorId: string | null
  vendedor: Ref | null
  solicitacaoId: string | null
  solicitacao: { id: string; numero: string } | null
  validade: string
  status: StatusOrcamento
  /** Coluna própria do kanban (status próprio com base = status) */
  statusPersonalizadoId: string | null
  subtotal: string
  desconto: string
  acrescimo: string
  frete: string
  total: string
  prazoDias: number
  /** Pagamento combinado: entrada (%) na aprovação + parcelas do saldo a cada N dias (resumoCondicoesPagamento) */
  sinalPercentual: string
  parcelas: number
  intervaloDias: number
  /** Observações de pagamento (linha livre opcional) */
  condicoes: string | null
  observacoes: string | null
  observacoesInternas: string | null
  tokenPublico: string
  enviadoEm: string | null
  aprovadoEm: string | null
  aprovadoPorNome: string | null
  aprovadoIp: string | null
  recusadoEm: string | null
  motivoRecusa: string | null
  pedidoId: string | null
  /** De onde veio (condição "origem" das regras comerciais) */
  origem: OrigemOrcamento
  /** Data em que o cliente quer o pedido */
  dataDesejada: string | null
  /** Regras comerciais no orçamento (descontos/acréscimos de orçamento e pedido mínimo), com sinal */
  ajusteRegras: string
  /** O que as regras fizeram no último salvamento (orçamentos antigos: {}; use lerRegrasDoOrcamento) */
  regras: Partial<RegrasDoOrcamento>
  /** Descontos sugeridos pelas regras que o vendedor aplicou (ids das regras; valem a cada recálculo) */
  regrasAceitas: string[]
  /** Precisa da liberação de um gerente: não pode ser enviado nem aprovado */
  liberacaoPendente: boolean
  liberadoPor?: Ref | null
  liberadoEm: string | null
  /** Pedido gerado na conversão (no detalhe vem o resumo completo) */
  pedido?: { id: string; numero: string } | null
  /** Lista/kanban: quantidade de itens e os 3 primeiros ("10 × Caneca") */
  resumo?: { itens: number; principais: string[] }
}

export interface OrcamentoDetalhe extends Orcamento {
  itens: OrcamentoItem[]
  pedido: PedidoResumo | null
  /** Só para quem vê custos */
  custoEstimado?: string
  margemPercentual?: string | null
  /** O que o cliente respondeu na conversa do WhatsApp (enquete ou texto), a mais recente */
  respostaWhatsapp?: RespostaWhatsapp | null
}

/** O que o cliente vê no link público (sem dados internos). */
export interface OrcamentoPublico {
  numero: string
  status: StatusOrcamento
  validade: string
  expirado: boolean
  podeResponder: boolean
  /** Nome de exibição (fantasia, senão o nome) */
  cliente: { nome: string }
  vendedor: { nome: string } | null
  empresa: {
    nome: string
    telefone: string | null
    whatsapp: string | null
    email: string | null
    logoUrl: string | null
  }
  itens: {
    descricao: string
    quantidade: string
    largura: string | null
    altura: string | null
    acabamentos: string[]
    total: string
    /** Descontos e acréscimos das regras no item, para o cliente ("Desconto de 5%") */
    regras: string[]
  }[]
  subtotal: string
  desconto: string
  acrescimo: string
  frete: string
  /** Regras comerciais no orçamento (com sinal): desconto à vista, pedido mínimo, urgência… */
  ajusteRegras: string
  /** As mesmas, linha a linha, com o texto para o cliente (ajustesDoOrcamentoParaCliente) */
  ajustesRegras: { rotulo: string; valor: string }[]
  /** Frases das regras para o cliente ("Desconto de 5% por quantidade") */
  condicoesEspeciais: string[]
  /** Em revisão pela gráfica (aguardando um gerente): ainda não pode ser aprovado */
  emRevisao: boolean
  total: string
  prazoDias: number
  /** Resumo do pagamento combinado (resumoCondicoesPagamento) */
  pagamento: string
  /** Observações de pagamento */
  condicoes: string | null
  observacoes: string | null
  aprovadoEm: string | null
  aprovadoPorNome: string | null
  recusadoEm: string | null
}

export interface ProdutoCatalogo {
  id: string
  codigo: string
  nome: string
  descricao: string | null
  modoCalculo: string
  precoVenda: string
  precoMinimo: string | null
  larguraPadrao: string | null
  alturaPadrao: string | null
  larguraMaxima: string | null
  alturaMaxima: string | null
  prazoProducaoDias: number
  /** Padrão do "Precisa de arte" do item no orçamento */
  precisaArte: boolean
  /** Condição "categoria" das regras comerciais */
  categoriaId: string | null
  custo?: string
  acabamentos: {
    acabamentoId: string
    obrigatorio: boolean
    padrao: boolean
    acabamento: { id: string; nome: string; tipoCobranca: TipoCobranca; valor: string; custo?: string; prazoAdicionalDias: number }
  }[]
}

export type { Prioridade, TipoEntrega }
