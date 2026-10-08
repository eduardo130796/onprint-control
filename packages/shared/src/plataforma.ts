import type { AcessoAssinatura, NivelAcesso, SituacaoAssinatura } from './assinatura'
import type { CobrancaResumo } from './assinatura'

/** Situação comercial de uma empresa no painel (uma só categoria por empresa). */
export type CategoriaEmpresa = 'em_dia' | 'teste' | 'aviso' | 'somente_leitura' | 'bloqueada' | 'cancelada'
export const CATEGORIA_EMPRESA_ROTULOS: Record<CategoriaEmpresa, string> = {
  em_dia: 'Em dia',
  teste: 'Em teste',
  aviso: 'Com atraso (aviso)',
  somente_leitura: 'Só leitura',
  bloqueada: 'Bloqueadas',
  cancelada: 'Canceladas',
}

/** Teste em andamento conta como "teste" mesmo nos últimos dias; atraso ou fim do teste vão pelo nível. */
export function categoriaEmpresa(situacao: SituacaoAssinatura, acesso: Pick<AcessoAssinatura, 'nivel' | 'motivo'>): CategoriaEmpresa {
  if (situacao === 'cancelada') return 'cancelada'
  if (acesso.nivel === 'bloqueado') return 'bloqueada'
  if (acesso.nivel === 'somente_leitura') return 'somente_leitura'
  if (acesso.motivo === 'teste' || acesso.motivo === 'teste_acabando') return 'teste'
  if (acesso.nivel === 'aviso') return 'aviso'
  return 'em_dia'
}

export interface EmpresaParaIndicadores {
  situacao: SituacaoAssinatura
  acesso: Pick<AcessoAssinatura, 'nivel' | 'motivo'>
  valorMensal: string
}

export interface IndicadoresPlataforma {
  total: number
  porCategoria: Record<CategoriaEmpresa, number>
  /** Receita mensal recorrente: mensalidade de quem paga (ativa e não bloqueada) */
  receitaMensal: string
  /** Mensalidades em risco: ativas com atraso (aviso, só leitura ou bloqueadas) */
  receitaEmRisco: string
}

/** Indicadores do painel a partir das empresas (calculado em memória: plataformas de até alguns milhares). */
export function resumirIndicadores(empresas: EmpresaParaIndicadores[]): IndicadoresPlataforma {
  const porCategoria: Record<CategoriaEmpresa, number> = { em_dia: 0, teste: 0, aviso: 0, somente_leitura: 0, bloqueada: 0, cancelada: 0 }
  let receita = 0
  let risco = 0
  for (const e of empresas) {
    const categoria = categoriaEmpresa(e.situacao, e.acesso)
    porCategoria[categoria]++
    if (e.situacao !== 'ativa') continue
    const valor = Number(e.valorMensal) * 100
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
  valorMensal: string | null
  situacao: SituacaoAssinatura | null
  categoria: CategoriaEmpresa | null
  nivel: NivelAcesso | null
  mensagem: string | null
  proximoVencimento: string | null
  testeAte: string | null
  gateway: string | null
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
