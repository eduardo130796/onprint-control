/** Respostas da API do financeiro e do caixa/PDV. Valores em string decimal. */
import type { StatusComissao, StatusConta, StatusPedido } from './enums-comercial'
import type { TipoCaixaMovimento, TipoCategoriaFinanceira, TipoContaFinanceira, TipoFormaPagamento } from './financeiro'

type Ref = { id: string; nome: string }

export interface FormaPagamento {
  id: string
  nome: string
  tipo: TipoFormaPagamento
  taxaPercentual: string
  diasRecebimento: number
  permiteParcelamento: boolean
  maxParcelas: number
  contaFinanceiraId: string | null
  contaFinanceira: Ref | null
  ativo: boolean
}

export interface ContaFinanceira {
  id: string
  nome: string
  tipo: TipoContaFinanceira
  banco: string | null
  agencia: string | null
  numeroConta: string | null
  saldoInicial: string
  /** Saldo inicial + entradas − saídas realizadas */
  saldoAtual: string
  ativo: boolean
}

export interface CategoriaFinanceira {
  id: string
  nome: string
  tipo: TipoCategoriaFinanceira
  paiId: string | null
  pai: Ref | null
  codigo: string | null
  ativo: boolean
}

/** Conta a receber ou a pagar. */
export interface Titulo {
  id: string
  descricao: string
  documento?: string | null
  parcela: number
  totalParcelas: number
  valor: string
  valorPago: string
  saldo: string
  juros: string
  multa: string
  desconto: string
  vencimento: string
  pagoEm: string | null
  status: StatusConta
  atrasado: boolean
  observacao: string | null
  motivoCancelamento: string | null
  cliente?: Ref
  fornecedor?: Ref | null
  pedido?: { id: string; numero: string; status: StatusPedido } | null
  formaPagamento: Ref | null
  contaFinanceira: Ref | null
  categoria: Ref | null
  anexo: { id: string; nomeOriginal: string } | null
  createdAt: string
}

export interface MovimentoFinanceiro {
  id: string
  tipo: 'entrada' | 'saida'
  valor: string
  data: string
  descricao: string
  contaFinanceira: Ref
  categoria: Ref | null
  formaPagamento: Ref | null
  principal: string | null
  juros: string
  multa: string
  desconto: string
  transferenciaId: string | null
  estornoDeId: string | null
  estornado: boolean
  contaReceberId: string | null
  contaPagarId: string | null
  usuario: Ref | null
  createdAt: string
}

export interface TituloDetalhe extends Titulo {
  movimentos: MovimentoFinanceiro[]
}

export interface DiaFluxo {
  data: string
  entradas: string
  saidas: string
  previstoEntradas: string
  previstoSaidas: string
  /** Saldo realizado ao fim do dia */
  saldo: string
  /** Saldo projetado (realizado + previsto até o dia) */
  saldoProjetado: string
}

export interface FluxoCaixa {
  de: string
  ate: string
  saldoInicial: string
  dias: DiaFluxo[]
  totais: { entradas: string; saidas: string; previstoEntradas: string; previstoSaidas: string; saldoFinal: string; saldoProjetado: string }
  porCategoria: { categoria: string; tipo: 'entrada' | 'saida'; valor: string }[]
}

export interface DiaCalendario {
  data: string
  aReceber: string
  aPagar: string
  recebido: string
  pago: string
  titulos: { id: string; tipo: 'receber' | 'pagar'; descricao: string; saldo: string; status: StatusConta; pessoa: string | null }[]
}

export interface Comissao {
  id: string
  vendedor: Ref
  pedido: { id: string; numero: string; status: StatusPedido; statusFinanceiro: string; cliente: Ref }
  base: string
  percentual: string
  valor: string
  status: StatusComissao
  liberadaEm: string | null
  pagaEm: string | null
  createdAt: string
}

export interface CaixaSessao {
  id: string
  numero: string
  usuario: Ref
  contaFinanceira: Ref
  status: 'aberta' | 'fechada'
  abertaEm: string
  valorAbertura: string
  fechadaEm: string | null
  fechadaPor: Ref | null
  totalCalculado: string | null
  totalInformado: string | null
  diferenca: string | null
  observacao: string | null
}

export interface ResumoFormaCaixa {
  formaPagamentoId: string | null
  nome: string
  tipo: TipoFormaPagamento | null
  calculado: string
  informado?: string
  diferenca?: string
}

export interface CaixaMovimento {
  id: string
  tipo: TipoCaixaMovimento
  valor: string
  motivo: string | null
  formaPagamento: Ref | null
  vendaPdv: { id: string; numero: string } | null
  contaReceber: { id: string; descricao: string } | null
  usuario: Ref | null
  createdAt: string
}

export interface CaixaSessaoDetalhe extends CaixaSessao {
  movimentos: CaixaMovimento[]
  porForma: ResumoFormaCaixa[]
  vendas: { quantidade: number; total: string }
  /** Dinheiro que deve estar na gaveta */
  dinheiroEsperado: string
  conferencia: ResumoFormaCaixa[] | null
}

export interface VendaPdv {
  id: string
  numero: string
  sessaoId: string
  cliente: Ref | null
  usuario: Ref | null
  subtotal: string
  desconto: string
  total: string
  valorRecebido: string
  troco: string
  status: 'concluida' | 'cancelada'
  motivoCancelamento: string | null
  createdAt: string
  itens: { id: string; produtoId: string; descricao: string; quantidade: string; precoUnitario: string; total: string }[]
  pagamentos: { forma: string; valor: string }[]
}

export interface ProdutoPdv {
  id: string
  codigo: string
  nome: string
  precoVenda: string
  unidade: string | null
  categoria: string | null
  controlaEstoque: boolean
  saldo: string | null
}
