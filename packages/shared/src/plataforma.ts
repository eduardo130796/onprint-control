import type { AcessoAssinatura, NivelAcesso, SituacaoAssinatura } from './assinatura'
import type { CobrancaResumo, CupomEmUso } from './assinatura'
import type { TipoCupom } from './beneficios'

/** Situação comercial de uma empresa no painel (uma só categoria por empresa). */
export type CategoriaEmpresa = 'em_dia' | 'teste' | 'cortesia' | 'aviso' | 'somente_leitura' | 'bloqueada' | 'cancelada'
export const CATEGORIA_EMPRESA_ROTULOS: Record<CategoriaEmpresa, string> = {
  em_dia: 'Em dia',
  teste: 'Em teste',
  cortesia: 'Cortesia',
  aviso: 'Com atraso (aviso)',
  somente_leitura: 'Só leitura',
  bloqueada: 'Bloqueadas',
  cancelada: 'Canceladas',
}

/** Teste (ou cortesia) em andamento conta como tal mesmo nos últimos dias; atraso ou fim vão pelo nível. */
export function categoriaEmpresa(situacao: SituacaoAssinatura, acesso: Pick<AcessoAssinatura, 'nivel' | 'motivo'>): CategoriaEmpresa {
  if (situacao === 'cancelada') return 'cancelada'
  if (acesso.nivel === 'bloqueado') return 'bloqueada'
  if (acesso.nivel === 'somente_leitura') return 'somente_leitura'
  if (acesso.motivo === 'teste' || acesso.motivo === 'teste_acabando') return 'teste'
  if (acesso.motivo === 'cortesia') return 'cortesia'
  if (acesso.nivel === 'aviso') return 'aviso'
  return 'em_dia'
}

export interface EmpresaParaIndicadores {
  situacao: SituacaoAssinatura
  acesso: Pick<AcessoAssinatura, 'nivel' | 'motivo'>
  valorMensal: string
  /** Valor efetivamente cobrado (com cupom); se ausente, a mensalidade cheia */
  valorCobrado?: string
}

export interface IndicadoresPlataforma {
  total: number
  porCategoria: Record<CategoriaEmpresa, number>
  /** Receita mensal recorrente: mensalidade (com cupom) de quem paga e está em dia */
  receitaMensal: string
  /** Mensalidades em risco: ativas com atraso (aviso, só leitura ou bloqueadas) */
  receitaEmRisco: string
}

/** Indicadores do painel a partir das empresas (calculado em memória: plataformas de até alguns milhares). */
export function resumirIndicadores(empresas: EmpresaParaIndicadores[]): IndicadoresPlataforma {
  const porCategoria: Record<CategoriaEmpresa, number> = { em_dia: 0, teste: 0, cortesia: 0, aviso: 0, somente_leitura: 0, bloqueada: 0, cancelada: 0 }
  let receita = 0
  let risco = 0
  for (const e of empresas) {
    const categoria = categoriaEmpresa(e.situacao, e.acesso)
    porCategoria[categoria]++
    if (e.situacao !== 'ativa') continue
    const valor = Math.round(Number(e.valorCobrado ?? e.valorMensal) * 100)
    if (categoria === 'em_dia') receita += valor
    else if (categoria !== 'cancelada') risco += valor
  }
  return { total: empresas.length, porCategoria, receitaMensal: (receita / 100).toFixed(2), receitaEmRisco: (risco / 100).toFixed(2) }
}

export type GravidadeProblema = 'alta' | 'media' | 'baixa'

export interface ProblemaPlataforma {
  tipo: 'bloqueada' | 'somente_leitura' | 'cobranca_vencida' | 'falha_cartao' | 'nota_fiscal' | 'aviso_gateway' | 'teste_acabando' | 'cancelamento'
  gravidade: GravidadeProblema
  empresa: { id: string; nome: string; slug: string } | null
  descricao: string
  data: string
  /** Para "reprocessar" um aviso do gateway */
  eventoId?: string
}

export interface PainelPlataforma {
  indicadores: IndicadoresPlataforma
  /** Recebido no mês corrente (cobranças pagas) */
  recebidoNoMes: string
  /** Soma das cobranças vencidas e não pagas */
  emAtraso: string
  novasEmpresas30Dias: number
  /** Testes que viraram assinatura paga nos últimos 30 dias */
  conversoes30Dias: number
  problemas: ProblemaPlataforma[]
  pagamentoOnline: boolean
}

export interface EmpresaPlataformaResumo {
  id: string
  nome: string
  slug: string
  ativa: boolean
  criadaEm: string
  plano: string | null
  planoCodigo: string | null
  /** Mensalidade cheia do plano */
  valorMensal: string | null
  /** O que a empresa paga por mês hoje (com cupom); 0 na cortesia */
  valorCobrado: string | null
  formaPagamento: string | null
  situacao: SituacaoAssinatura | null
  categoria: CategoriaEmpresa | null
  nivel: NivelAcesso | null
  mensagem: string | null
  /** Bloqueada pelo suporte (não só pelo atraso): pode desbloquear */
  bloqueioManual: boolean
  diasAtraso: number
  /** Soma das cobranças vencidas e não pagas */
  emAtraso: string
  ultimoPagamento: { valor: string; data: string } | null
  proximoVencimento: string | null
  testeAte: string | null
  gateway: string | null
  /** Benefício em vigor (cupom, cortesia ou liberação manual), para a coluna da tabela */
  beneficio: { tipo: 'cupom' | 'cortesia' | 'liberacao'; rotulo: string } | null
}

export interface EmpresaPlataformaDetalhe extends EmpresaPlataformaResumo {
  schema: string
  email: string | null
  cnpj: string | null
  assinatura: {
    planoCodigo: string
    atrasoDesde: string | null
    liberadoAte: string | null
    cancelarEm: string | null
    bloqueioManual: boolean
    motivoBloqueio: string | null
    modulosExtras: string[]
    modulos: string[]
    limiteUsuarios: number | null
    formaPagamento: string | null
    gatewayClienteId: string | null
    gatewayAssinaturaId: string | null
    documentoCobranca: string | null
    acesso: AcessoAssinatura
    cortesia: { ate: string | null; motivo: string | null } | null
    cupom: CupomEmUso | null
    planoAgendado: { nome: string; em: string } | null
  } | null
  usuarios: { total: number; ativos: number; admins: { nome: string; email: string; ultimoLogin: string | null }[] }
  cobrancas: (CobrancaResumo & { gateway: string })[]
  eventos: { id: string; tipo: string; descricao: string; autor: string; data: string }[]
}

export interface PlanoPlataforma {
  id: string
  codigo: string
  nome: string
  descricao: string | null
  valorMensal: string
  modulos: string[]
  limiteUsuarios: number | null
  diasTeste: number
  diasAteSomenteLeitura: number
  diasAteBloqueio: number
  publico: boolean
  ativo: boolean
  ordem: number
  /** Empresas com assinatura neste plano */
  assinaturas: number
}

export interface EventoGatewayResumo {
  id: string
  eventoId: string
  tipo: string
  recebidoEm: string
  processadoEm: string | null
  erro: string | null
}

export interface CupomPlataforma {
  id: string
  codigo: string
  descricao: string | null
  tipo: TipoCupom
  valor: string
  duracaoMeses: number | null
  validoAte: string | null
  limiteUsos: number | null
  planos: string[]
  ativo: boolean
  /** "20% de desconto por 3 meses" */
  resumo: string
  /** Empresas que já usaram */
  usos: number
  /** Com o desconto valendo hoje */
  emUso: number
  /** Soma dos descontos nas mensalidades pagas */
  descontoConcedido: string
  /** Receita das mensalidades pagas com o cupom */
  receita: string
  criadoEm: string
}

export interface CupomDetalhe extends CupomPlataforma {
  empresas: { id: string; nome: string; slug: string; desde: string | null; ate: string | null; aplicadoEm: string; encerradoEm: string | null; descontoConcedido: string; autor: string }[]
}
