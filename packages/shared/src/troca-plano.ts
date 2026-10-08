import { diasEntre } from './assinatura'
import { adicionarMeses } from './datas'

/**
 * Troca de plano (regras do usuário):
 * - mensalidade vencida ou do período em curso nunca muda de valor (é serviço já prestado no plano antigo);
 * - upgrade: plano novo na hora + cobrança da diferença proporcional aos dias que faltam no período;
 * - downgrade: o plano maior já pago vale até o fim do período; a troca vale na próxima renovação;
 * - sem período pago em curso (teste grátis): troca imediata, sem proporcional.
 */
export type TipoTrocaPlano = 'upgrade' | 'downgrade' | 'imediata'

export interface PreviaTrocaPlano {
  tipo: TipoTrocaPlano
  plano: { codigo: string; nome: string; valorMensal: string }
  /** Diferença proporcional cobrada agora (upgrade com período em curso) */
  valorProporcional: string | null
  diasRestantes: number | null
  diasPeriodo: number | null
  /** Período em curso (início = vencimento da mensalidade que o paga) */
  periodo: { inicio: string; fim: string } | null
  /** Quando o plano novo passa a valer */
  valeA: string
  /** Mensalidade cheia do plano novo e a partir de quando */
  novaMensalidade: { valor: string; aPartirDe: string | null }
}

export interface EntradaTrocaPlano {
  valorAtual: string
  valorNovo: string
  /** Vencimento da mensalidade do período em curso (a última com vencimento até hoje), se houver */
  inicioPeriodo: string | null
  hoje: string
}

const centavos = (v: string | number) => Math.round(Number(v) * 100)
/** Abaixo disso não vale gerar cobrança (taxas do gateway maiores que o valor) */
export const PROPORCIONAL_MINIMO = 5

/** Diferença proporcional aos dias que faltam no período: (novo − atual) × restantes ÷ total, em centavos. */
export function calcularTrocaPlano(e: EntradaTrocaPlano): Omit<PreviaTrocaPlano, 'plano'> {
  const fim = e.inicioPeriodo ? adicionarMeses(e.inicioPeriodo, 1) : null
  const emCurso = Boolean(e.inicioPeriodo && fim && e.inicioPeriodo <= e.hoje && e.hoje < fim)
  const novo = centavos(e.valorNovo)
  const atual = centavos(e.valorAtual)
  const base = { valorProporcional: null, diasRestantes: null, diasPeriodo: null, periodo: null }

  if (!emCurso || novo === atual) {
    return { ...base, tipo: 'imediata', valeA: e.hoje, novaMensalidade: { valor: (novo / 100).toFixed(2), aPartirDe: fim && emCurso ? fim : null } }
  }
  const inicio = e.inicioPeriodo as string
  const periodo = { inicio, fim: fim as string }
  const diasPeriodo = diasEntre(inicio, periodo.fim)
  const diasRestantes = diasEntre(e.hoje, periodo.fim)
  if (novo < atual) {
    return { ...base, tipo: 'downgrade', periodo, diasPeriodo, diasRestantes, valeA: periodo.fim, novaMensalidade: { valor: (novo / 100).toFixed(2), aPartirDe: periodo.fim } }
  }
  const proporcional = Math.round(((novo - atual) * diasRestantes) / diasPeriodo)
  return {
    tipo: 'upgrade',
    periodo,
    diasPeriodo,
    diasRestantes,
    valorProporcional: proporcional >= PROPORCIONAL_MINIMO * 100 ? (proporcional / 100).toFixed(2) : null,
    valeA: e.hoje,
    novaMensalidade: { valor: (novo / 100).toFixed(2), aPartirDe: periodo.fim },
  }
}
