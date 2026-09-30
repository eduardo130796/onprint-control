/** Respostas da API de estoque. Quantidades e valores trafegam como string decimal. */
import type { SituacaoEstoque, TipoMovimentacao } from './estoque'

type Ref = { id: string; nome: string }

export interface LocalEstoque {
  id: string
  nome: string
  descricao: string | null
  padrao: boolean
  ativo: boolean
  createdAt: string
  updatedAt: string
}

export interface ProdutoEstoqueRef {
  id: string
  codigo: string
  nome: string
  tipo: string
  unidade: string | null
}

/** Linha de "Estoque atual": saldo somado dos locais (ou de um local, se filtrado). */
export interface PosicaoEstoque {
  produto: ProdutoEstoqueRef
  saldo: string
  estoqueMinimo: string
  custoMedio: string
  valorEstoque: string
  situacao: SituacaoEstoque
  locais: { local: Ref; saldo: string }[]
  ultimaMovimentacao: string | null
}

export interface MovimentacaoEstoque {
  id: string
  tipo: TipoMovimentacao
  produto: ProdutoEstoqueRef
  local: Ref
  quantidade: string
  custoUnitario: string
  saldoApos: string
  motivo: string | null
  op: { id: string; numero: string } | null
  pedido: { id: string; numero: string } | null
  fornecedor: Ref | null
  entrada: { id: string; numero: string } | null
  transferenciaId: string | null
  usuario: Ref | null
  createdAt: string
}

export interface EntradaEstoque {
  id: string
  numero: string
  fornecedor: Ref | null
  local: Ref
  notaFiscal: string | null
  dataEntrada: string
  total: string
  observacoes: string | null
  usuario: Ref | null
  createdAt: string
  itensCount?: number
}

export interface EntradaEstoqueDetalhe extends EntradaEstoque {
  itens: { id: string; produto: ProdutoEstoqueRef; quantidade: string; custoUnitario: string; total: string }[]
}

/** Estoque de um produto (aba Estoque do produto e diálogo "kardex"). */
export interface EstoqueDoProduto {
  produto: ProdutoEstoqueRef & { controlaEstoque: boolean; estoqueMinimo: string }
  saldo: string
  custoMedio: string
  situacao: SituacaoEstoque
  locais: { local: Ref; saldo: string; custoMedio: string }[]
  movimentacoes: MovimentacaoEstoque[]
}
