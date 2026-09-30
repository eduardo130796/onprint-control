import Decimal from 'decimal.js'
import type { StatusConta, StatusFinanceiroPedido } from './enums-comercial'

export const TIPOS_FORMA_PAGAMENTO = ['dinheiro', 'pix', 'cartao_debito', 'cartao_credito', 'boleto', 'transferencia', 'outro'] as const
export type TipoFormaPagamento = (typeof TIPOS_FORMA_PAGAMENTO)[number]
export const TIPO_FORMA_PAGAMENTO_ROTULOS: Record<TipoFormaPagamento, string> = {
  dinheiro: 'Dinheiro',
  pix: 'PIX',
  cartao_debito: 'Cartão de débito',
  cartao_credito: 'Cartão de crédito',
  boleto: 'Boleto',
  transferencia: 'Transferência',
  outro: 'Outro',
}

export const TIPOS_CONTA_FINANCEIRA = ['caixa', 'banco', 'outro'] as const
export type TipoContaFinanceira = (typeof TIPOS_CONTA_FINANCEIRA)[number]
export const TIPO_CONTA_FINANCEIRA_ROTULOS: Record<TipoContaFinanceira, string> = { caixa: 'Caixa', banco: 'Banco', outro: 'Outra' }

export const TIPOS_CATEGORIA_FINANCEIRA = ['receita', 'despesa'] as const
export type TipoCategoriaFinanceira = (typeof TIPOS_CATEGORIA_FINANCEIRA)[number]

export const TIPOS_CAIXA_MOVIMENTO = ['abertura', 'venda', 'recebimento', 'sangria', 'suprimento', 'estorno'] as const
export type TipoCaixaMovimento = (typeof TIPOS_CAIXA_MOVIMENTO)[number]
export const TIPO_CAIXA_MOVIMENTO_ROTULOS: Record<TipoCaixaMovimento, string> = {
  abertura: 'Abertura',
  venda: 'Venda',
  recebimento: 'Recebimento',
  sangria: 'Sangria',
  suprimento: 'Suprimento',
  estorno: 'Estorno',
}

type Valor = Decimal.Value
const dec = (v: Valor | null | undefined) => new Decimal(v ?? 0)
const moeda = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2)

/**
 * Status do título: pago quando o principal foi quitado, parcial com algum pagamento,
 * vencido quando sem pagamento e com vencimento antes de hoje, senão aberto.
 * (Parcial continua "parcial" mesmo vencido; a lista mostra o atraso pela data.)
 */
export function statusTitulo(valor: Valor, valorPago: Valor, vencimento: string, hoje: string): Exclude<StatusConta, 'cancelado'> {
  const pago = dec(valorPago)
  if (pago.gte(dec(valor))) return 'pago'
  if (pago.gt(0)) return 'parcial'
  return vencimento.slice(0, 10) < hoje ? 'vencido' : 'aberto'
}

export interface BaixaInformada {
  /** Total que entrou/saiu de fato (principal + juros + multa − desconto) */
  valorRecebido: Valor
  juros?: Valor
  multa?: Valor
  desconto?: Valor
}

export type ResultadoBaixa = { ok: true; principal: string; valorPago: string; saldo: string; quitado: boolean } | { ok: false; erro: string }

/** Aplica uma baixa (parcial ou total) num título: separa o principal dos juros, multa e desconto. */
export function aplicarBaixa(titulo: { valor: Valor; valorPago: Valor }, b: BaixaInformada): ResultadoBaixa {
  const saldo = dec(titulo.valor).minus(dec(titulo.valorPago))
  if (saldo.lte(0)) return { ok: false, erro: 'Este título já está quitado.' }
  if ([b.juros, b.multa, b.desconto].some((v) => dec(v).lt(0))) return { ok: false, erro: 'Juros, multa e desconto não podem ser negativos.' }
  const principal = dec(b.valorRecebido).minus(dec(b.juros)).minus(dec(b.multa)).plus(dec(b.desconto))
  if (principal.lte(0)) return { ok: false, erro: 'O valor pago precisa abater alguma parte do título.' }
  if (principal.gt(saldo)) {
    return { ok: false, erro: `O valor abate R$ ${moeda(principal).replace('.', ',')}, mais que o saldo do título (R$ ${moeda(saldo).replace('.', ',')}).` }
  }
  const valorPago = dec(titulo.valorPago).plus(principal)
  return { ok: true, principal: moeda(principal), valorPago: moeda(valorPago), saldo: moeda(dec(titulo.valor).minus(valorPago)), quitado: valorPago.gte(dec(titulo.valor)) }
}

/** Status financeiro do pedido pelos títulos não cancelados. */
export function statusFinanceiroPedido(titulos: { valor: Valor; valorPago: Valor; status: StatusConta }[]): StatusFinanceiroPedido {
  const ativos = titulos.filter((t) => t.status !== 'cancelado')
  if (ativos.length === 0) return 'pendente'
  if (ativos.every((t) => dec(t.valorPago).gte(dec(t.valor)))) return 'pago'
  return ativos.some((t) => dec(t.valorPago).gt(0)) ? 'parcial' : 'pendente'
}

/** Taxa da operadora sobre um recebimento (2 casas). */
export function taxaDaForma(valor: Valor, taxaPercentual: Valor): string {
  return moeda(dec(valor).mul(dec(taxaPercentual)).div(100))
}

export interface PagamentoPdv {
  valor: Valor
  /** Só dinheiro pode gerar troco */
  dinheiro: boolean
}

export type ResultadoVendaPdv =
  | { ok: true; subtotal: string; desconto: string; total: string; recebido: string; troco: string }
  | { ok: false; erro: string; subtotal: string; total: string; recebido: string }

/** Totais da venda balcão: subtotal, desconto, total, recebido e troco (só em dinheiro). */
export function calcularVendaPdv(itens: { quantidade: Valor; precoUnitario: Valor }[], desconto: Valor, pagamentos: PagamentoPdv[]): ResultadoVendaPdv {
  const subtotal = itens.reduce((s, i) => s.plus(dec(i.quantidade).mul(dec(i.precoUnitario)).toDecimalPlaces(2)), new Decimal(0))
  const total = subtotal.minus(dec(desconto))
  const recebido = pagamentos.reduce((s, p) => s.plus(dec(p.valor)), new Decimal(0))
  const base = { subtotal: moeda(subtotal), total: moeda(total), recebido: moeda(recebido) }
  if (itens.length === 0) return { ok: false, erro: 'Adicione ao menos um item.', ...base }
  if (dec(desconto).lt(0) || total.lt(0)) return { ok: false, erro: 'O desconto não pode ser maior que o subtotal.', ...base }
  if (recebido.lt(total)) return { ok: false, erro: `Falta receber R$ ${moeda(total.minus(recebido)).replace('.', ',')}.`, ...base }
  const troco = recebido.minus(total)
  const emDinheiro = pagamentos.filter((p) => p.dinheiro).reduce((s, p) => s.plus(dec(p.valor)), new Decimal(0))
  if (troco.gt(emDinheiro)) return { ok: false, erro: 'Troco só pode ser dado sobre pagamento em dinheiro.', ...base }
  return { ok: true, ...base, desconto: moeda(dec(desconto)), troco: moeda(troco) }
}
