import { z } from 'zod'

/** Como a tela formata cada valor (tabela, resumo, gráfico, CSV e PDF). */
export type FormatoValor = 'moeda' | 'numero' | 'percentual' | 'texto' | 'data' | 'horas'

export interface ColunaRelatorio {
  chave: string
  titulo: string
  formato: FormatoValor
}

/**
 * Formato único de todos os relatórios: resumo (cartões), gráfico, colunas e linhas.
 * A agregação é feita no banco (SQL); o front só desenha e exporta.
 */
export interface Relatorio {
  titulo: string
  periodo: { de: string; ate: string } | null
  resumo: { rotulo: string; valor: number | string; formato: FormatoValor }[]
  grafico: {
    tipo: 'barras' | 'barras_horizontais'
    /** Coluna usada como rótulo das barras */
    rotulo: string
    series: { chave: string; titulo: string }[]
    formato: FormatoValor
  } | null
  colunas: ColunaRelatorio[]
  linhas: Record<string, string | number | null>[]
  observacao?: string
}

/** Relatórios da seção 11 e suas visões (abas). */
export const RELATORIOS = {
  vendas: { titulo: 'Vendas', visoes: { mes: 'Por mês', vendedor: 'Por vendedor', produto: 'Por produto', cliente: 'Por cliente' } },
  orcamentos: { titulo: 'Conversão de orçamentos', visoes: { funil: 'Funil e conversão', vendedor: 'Por vendedor', recusas: 'Motivos de recusa' } },
  producao: { titulo: 'Produção', visoes: { etapas: 'Tempo por etapa', maquinas: 'Produtividade por máquina', perdas: 'Perdas' } },
  estoque: { titulo: 'Estoque', visoes: { posicao: 'Posição', abc: 'Curva ABC', consumo: 'Consumo' } },
  financeiro: { titulo: 'Financeiro', visoes: { dre: 'DRE simplificado', inadimplencia: 'Inadimplência', fluxo: 'Fluxo mensal' } },
  comissoes: { titulo: 'Comissões', visoes: { vendedor: 'Por vendedor', detalhe: 'Detalhado' } },
} as const

export type TipoRelatorio = keyof typeof RELATORIOS
export const TIPOS_RELATORIO = Object.keys(RELATORIOS) as TipoRelatorio[]

const dataISO = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD).')

export const relatorioParamSchema = z.object({ tipo: z.enum(TIPOS_RELATORIO as [TipoRelatorio, ...TipoRelatorio[]]) })
export const relatorioQuerySchema = z
  .object({ visao: z.string().min(1).max(30), de: dataISO, ate: dataISO })
  .refine((q) => q.de <= q.ate, { message: 'A data final deve ser depois da inicial.', path: ['ate'] })
export type RelatorioQuery = z.input<typeof relatorioQuerySchema>

export interface KpiDashboard {
  chave: string
  rotulo: string
  valor: number
  formato: FormatoValor
  detalhe?: string
  alerta?: boolean
  link?: string
}

export interface PedidoResumoDashboard {
  id: string
  numero: string
  cliente: string
  data: string
  status: string
}

/** Dashboard (seção 11). Blocos sem permissão vêm como null. */
export interface Dashboard {
  hoje: string
  kpis: KpiDashboard[]
  faturamentoMensal: { mes: string; pedidos: number; balcao: number }[] | null
  funil: { etapa: string; quantidade: number }[] | null
  pedidosPorStatus: { status: string; quantidade: number }[] | null
  producaoPorEtapa: { etapa: string; quantidade: number }[] | null
  topProdutos: { produto: string; quantidade: number; total: number }[] | null
  proximasEntregas: PedidoResumoDashboard[] | null
  atrasos: PedidoResumoDashboard[] | null
}

export const buscaGlobalQuerySchema = z.object({ q: z.string().trim().min(2).max(80) })

export interface ResultadoBusca {
  clientes: { id: string; nome: string; detalhe: string | null }[]
  orcamentos: { id: string; numero: string; cliente: string; status: string }[]
  pedidos: { id: string; numero: string; cliente: string; status: string }[]
}

export const notificacoesQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
  naoLidas: z.enum(['true', 'false']).optional(),
})

export interface Notificacao {
  id: string
  titulo: string
  mensagem: string
  link: string | null
  lida: boolean
  createdAt: string
}
