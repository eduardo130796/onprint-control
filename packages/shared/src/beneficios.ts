import { adicionarMeses } from './datas'

/**
 * Benefícios da assinatura (cupom, meses grátis, cortesia, abono). Aqui ficam as regras puras de valor:
 * quanto custa a mensalidade de um vencimento, com o plano em vigor (ou o agendado) e o cupom da janela.
 */

export const TIPOS_CUPOM = ['percentual', 'valor'] as const
export type TipoCupom = (typeof TIPOS_CUPOM)[number]

/** Menor mensalidade que o gateway cobra; desconto maior que isso vira mês grátis ou cortesia. */
export const MENSALIDADE_MINIMA = 5

const centavos = (v: string | number) => Math.round(Number(v) * 100)
const reais = (c: number) => (c / 100).toFixed(2)

export interface DescontoCupom {
  tipo: TipoCupom
  /** Percentual (0–100) ou valor em R$ */
  valor: string
  /** Primeira mensalidade com desconto (null = a partir da 1ª, ainda não gerada) */
  desde: string | null
  /** Última mensalidade com desconto (null = para sempre) */
  ate: string | null
}

/** Desconto (R$) sobre o valor cheio: percentual arredondado ao centavo; valor fixo limitado ao cheio. */
export function descontoDoCupom(c: Pick<DescontoCupom, 'tipo' | 'valor'>, valorCheio: string): string {
  const cheio = centavos(valorCheio)
  const d = c.tipo === 'percentual' ? Math.round((cheio * Number(c.valor)) / 100) : centavos(c.valor)
  return reais(Math.max(0, Math.min(cheio, d)))
}

/** Descrição curta: "20% por 3 meses", "R$ 50,00 para sempre". */
export function descreverCupom(c: { tipo: TipoCupom; valor: string; duracaoMeses: number | null }): string {
  const valor = c.tipo === 'percentual' ? `${Number(c.valor).toLocaleString('pt-BR')}%` : `R$ ${Number(c.valor).toFixed(2).replace('.', ',')}`
  const duracao = c.duracaoMeses == null ? 'para sempre' : c.duracaoMeses === 1 ? 'na 1ª mensalidade' : `por ${c.duracaoMeses} meses`
  return `${valor} de desconto ${duracao}`
}

/** Última mensalidade com desconto: `desde` + (meses − 1); null = para sempre. */
export const fimDoDesconto = (desde: string, meses: number | null) => (meses == null ? null : adicionarMeses(desde, meses - 1))

export const descontoValeEm = (d: Pick<DescontoCupom, 'desde' | 'ate'>, vencimento: string) => (!d.desde || vencimento >= d.desde) && (!d.ate || vencimento <= d.ate)

export interface RegrasMensalidade {
  valorPlano: string
  /** Downgrade agendado: a partir de `em`, vale este valor */
  agendado?: { valor: string; em: string } | null
  desconto?: DescontoCupom | null
}

/** Valor da mensalidade de um vencimento: plano em vigor naquela data, menos o cupom (se o vencimento estiver na janela). */
export function valorDaMensalidade(r: RegrasMensalidade, vencimento: string): { cheio: string; desconto: string; valor: string } {
  const cheio = r.agendado && vencimento >= r.agendado.em ? r.agendado.valor : r.valorPlano
  const desconto = r.desconto && descontoValeEm(r.desconto, vencimento) ? descontoDoCupom(r.desconto, cheio) : '0.00'
  return { cheio: reais(centavos(cheio)), desconto, valor: reais(centavos(cheio) - centavos(desconto)) }
}

/** Meses grátis: os N vencimentos a partir de `base` ficam abonados; a próxima cobrança passa a ser base + N meses. */
export function mesesGratis(base: string, meses: number): { abonados: string[]; proximo: string } {
  return { abonados: Array.from({ length: meses }, (_, i) => adicionarMeses(base, i)), proximo: adicionarMeses(base, meses) }
}

/** Cupom pode ser usado hoje neste plano? Devolve o motivo quando não. */
export function cupomIndisponivel(
  c: { ativo: boolean; validoAte: string | null; limiteUsos: number | null; usos: number; planos: string[] },
  plano: string | null,
  hoje: string,
): string | null {
  if (!c.ativo) return 'Este cupom não está mais disponível.'
  if (c.validoAte && c.validoAte < hoje) return 'Este cupom expirou.'
  if (c.limiteUsos != null && c.usos >= c.limiteUsos) return 'Este cupom já atingiu o limite de usos.'
  if (plano && c.planos.length > 0 && !c.planos.includes(plano)) return 'Este cupom não vale para este plano.'
  return null
}
