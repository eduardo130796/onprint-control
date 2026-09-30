import type {
  CaixaSessao,
  CaixaSessaoDetalhe,
  CategoriaFinanceira,
  Comissao,
  ComissoesQuery,
  ContaFinanceira,
  DiaCalendario,
  FluxoCaixa,
  FluxoQuery,
  FormaPagamento,
  MovimentoFinanceiro,
  MovimentosFinanceirosQuery,
  Paginado,
  ProdutoPdv,
  Titulo,
  TituloDetalhe,
  TitulosQuery,
  TipoFormaPagamento,
  VendaPdv,
} from '@onprint/shared'
import { http, qs, upload } from './http'
import { recursoCrud } from './produtos'

export type TipoTitulo = 'receber' | 'pagar'
export type ListaTitulos = Paginado<Titulo> & { resumo: { valor: string; pago: string; saldo: string } }

/** Contas a receber e a pagar (mesmas rotas, prefixo por tipo). */
export const titulosApi = (tipo: TipoTitulo) => {
  const base = `/financeiro/${tipo}`
  return {
    listar: (q: TitulosQuery) => http<ListaTitulos>(`${base}${qs(q)}`),
    obter: (id: string) => http<TituloDetalhe>(`${base}/${id}`),
    criar: (dados: unknown) => http<TituloDetalhe[]>(base, { method: 'POST', body: dados }),
    atualizar: (id: string, dados: unknown) => http<TituloDetalhe>(`${base}/${id}`, { method: 'PUT', body: dados }),
    cancelar: (id: string, motivo: string) => http<TituloDetalhe>(`${base}/${id}/cancelar`, { method: 'POST', body: { motivo } }),
    baixar: (id: string, dados: unknown) => http<TituloDetalhe>(`${base}/${id}/baixa`, { method: 'POST', body: dados }),
    estornar: (id: string, movimentoId: string, motivo: string) => http<TituloDetalhe>(`${base}/${id}/movimentos/${movimentoId}/estornar`, { method: 'POST', body: { motivo } }),
    anexar: (id: string, arquivo: File) => upload<TituloDetalhe>(`${base}/${id}/anexo`, arquivo),
  }
}

export const formasApi = recursoCrud<FormaPagamento>('/financeiro/formas')
export const contasFinanceirasApi = recursoCrud<ContaFinanceira>('/financeiro/contas')
export const categoriasFinanceirasApi = recursoCrud<CategoriaFinanceira>('/financeiro/categorias')

export const financeiroApi = {
  fluxo: (q: FluxoQuery) => http<FluxoCaixa>(`/financeiro/fluxo${qs(q)}`),
  calendario: (mes: string) => http<DiaCalendario[]>(`/financeiro/calendario${qs({ mes })}`),
  movimentos: (q: MovimentosFinanceirosQuery) => http<Paginado<MovimentoFinanceiro>>(`/financeiro/movimentos${qs(q)}`),
  comissoes: (q: ComissoesQuery) => http<Paginado<Comissao> & { resumo: Record<string, string> }>(`/financeiro/comissoes${qs(q)}`),
  pagarComissoes: (dados: unknown) => http<{ pagas: number }>('/financeiro/comissoes/pagar', { method: 'POST', body: dados }),
}

export type FormaCaixa = { id: string; nome: string; tipo: TipoFormaPagamento; taxaPercentual: string }
export type TituloAberto = { id: string; descricao: string; valor: string; valorPago: string; saldo: string; vencimento: string; status: string; cliente: { id: string; nome: string }; pedido: { id: string; numero: string } | null }

/** Caixa / PDV. */
export const caixaApi = {
  atual: () => http<CaixaSessaoDetalhe | null>('/caixa/atual'),
  abrir: (dados: unknown) => http<CaixaSessaoDetalhe>('/caixa/abrir', { method: 'POST', body: dados }),
  movimento: (dados: unknown) => http<CaixaSessaoDetalhe>('/caixa/movimentos', { method: 'POST', body: dados }),
  fechar: (id: string, dados: unknown) => http<CaixaSessaoDetalhe>(`/caixa/sessoes/${id}/fechar`, { method: 'POST', body: dados }),
  sessoes: (q: Record<string, unknown>) => http<Paginado<CaixaSessao>>(`/caixa/sessoes${qs(q)}`),
  sessao: (id: string) => http<CaixaSessaoDetalhe>(`/caixa/sessoes/${id}`),
  produtos: (busca: string) => http<ProdutoPdv[]>(`/caixa/produtos${qs({ busca })}`),
  formas: () => http<FormaCaixa[]>('/caixa/formas'),
  contas: () => http<{ id: string; nome: string; tipo: string }[]>('/caixa/contas'),
  titulos: (busca: string) => http<TituloAberto[]>(`/caixa/titulos${qs({ busca })}`),
  receber: (dados: unknown) => http<CaixaSessaoDetalhe>('/caixa/recebimentos', { method: 'POST', body: dados }),
  vender: (dados: unknown) => http<VendaPdv>('/caixa/vendas', { method: 'POST', body: dados }),
  vendas: (q: Record<string, unknown>) => http<Paginado<VendaPdv>>(`/caixa/vendas${qs(q)}`),
  cancelarVenda: (id: string, motivo: string) => http<VendaPdv>(`/caixa/vendas/${id}/cancelar`, { method: 'POST', body: { motivo } }),
}
