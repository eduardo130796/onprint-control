import { normalizarDecimal, type BaseTempo, type LinhaCusto, type ProducaoComposicao, type SituacaoLucro, type TipoCobranca } from '@onprint/shared'

/**
 * Regras pequenas das telas de custo (insumos, composição, entrada de estoque): conversões entre o que a
 * pessoa digita (padrão brasileiro) e o que o motor de custos (@onprint/shared/custos) e a API esperam.
 */

/** Unidade de uso do insumo pela sigla: m² e metro mudam a conta de rolo/chapa; as demais usam o conteúdo. */
export function usoDaUnidade(sigla: string | null | undefined): 'm2' | 'm' | 'outra' {
  const s = (sigla ?? '').toLowerCase().replace(/[\s.]/g, '')
  if (['m²', 'm2', 'mt2', 'mt²', 'metroquadrado', 'metrosquadrados'].includes(s)) return 'm2'
  if (['m', 'ml', 'mt', 'metro', 'metros', 'metrolinear'].includes(s)) return 'm'
  return 'outra'
}

/** Texto digitado ("1.234,56", "3,2") → decimal da API ("1234.56"); vazio continua vazio. */
export function paraApi(valor: string | null | undefined): string {
  return valor?.trim() ? normalizarDecimal(valor) : ''
}

/** Decimal da API → texto do campo, sem zeros sobrando ("3.200" → "3,2"). */
export function paraCampo(valor: string | number | null | undefined, casasMax = 4): string {
  if (valor === null || valor === undefined || valor === '') return ''
  const n = Number(valor)
  if (!Number.isFinite(n)) return ''
  return n.toLocaleString('pt-BR', { maximumFractionDigits: casasMax, useGrouping: false })
}

/** Número para conta rápida na tela (0 quando vazio/ inválido). */
export function numero(valor: string | null | undefined): number {
  return Number(paraApi(valor) || 0) || 0
}

/** Custo unitário com 2 a 4 casas: "R$ 9,06", "R$ 0,0125". */
export function formatarCusto(valor: string | number | null | undefined): string {
  const n = Number(valor ?? 0)
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

/** "31%" / "12,5%" */
export function formatarPercentual(valor: string | number | null | undefined): string {
  return `${Number(valor ?? 0).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`
}

/**
 * Entrada de estoque em embalagens: "2 rolos de 160 m² por R$ 1.450,00" → 320 m² a R$ 9,0625/m²
 * (a API continua recebendo a quantidade e o custo na unidade de uso).
 */
export function converterEmbalagem(embalagens: string, precoEmbalagem: string, fator: number): { quantidade: string; custoUnitario: string } | null {
  if (!(fator > 0)) return null
  const arredondar = (n: number, casas: number) => String(Math.round((n + Number.EPSILON) * 10 ** casas) / 10 ** casas)
  return { quantidade: arredondar(numero(embalagens) * fator, 3), custoUnitario: arredondar(numero(precoEmbalagem) / fator, 4) }
}

/** Dados de uma linha de produção para a conta ao vivo (vindos dos cadastros de processo e máquina). */
export interface DadosProducao {
  nome: string
  custoHora: string
  velocidadeM2Hora: string | null
  tempoPadraoMinutos: number | null
}

/**
 * Linha de produção da tela → entrada do motor, com a mesma regra da API para os minutos vazios:
 * por m² com máquina que tem velocidade = automático (60 ÷ velocidade); nos demais, o tempo padrão do
 * processo, uma vez por item.
 */
export function producaoParaMotor(linha: { minutos: string; base: BaseTempo; setupMinutos: string }, dados: DadosProducao): ProducaoComposicao {
  const minutos = paraApi(linha.minutos)
  const comum = { nome: dados.nome, custoHora: dados.custoHora, setupMinutos: paraApi(linha.setupMinutos) || '0', velocidadeM2Hora: dados.velocidadeM2Hora }
  if (minutos && Number(minutos) > 0) return { ...comum, minutos, base: linha.base }
  if (linha.base === 'por_m2' && Number(dados.velocidadeM2Hora ?? 0) > 0) return { ...comum, minutos: '0', base: 'por_m2' }
  return { ...comum, minutos: String(dados.tempoPadraoMinutos ?? 0), base: 'por_item' }
}

/** Minutos automáticos de uma linha sem minutos (para o placeholder do campo). */
export function minutosAutomaticos(base: BaseTempo, dados: Pick<DadosProducao, 'velocidadeM2Hora' | 'tempoPadraoMinutos'> | undefined): string {
  if (!dados) return ''
  const vel = Number(dados.velocidadeM2Hora ?? 0)
  if (base === 'por_m2' && vel > 0) return `auto ${paraCampo(60 / vel, 2)}`
  if (dados.tempoPadraoMinutos) return `padrão ${dados.tempoPadraoMinutos}`
  return '0'
}

/** Cores e textos do semáforo do lucro. */
export const SITUACAO_LUCRO: Record<SituacaoLucro, { rotulo: string; classe: string; ponto: string }> = {
  ok: { rotulo: 'Lucro em dia', classe: 'bg-green-100 text-green-800', ponto: 'bg-green-500' },
  baixo: { rotulo: 'Lucro baixo', classe: 'bg-amber-100 text-amber-800', ponto: 'bg-amber-500' },
  prejuizo: { rotulo: 'Prejuízo', classe: 'bg-red-100 text-red-800', ponto: 'bg-red-500' },
  sem_custo: { rotulo: 'Sem custo', classe: 'bg-slate-100 text-slate-700', ponto: 'bg-slate-400' },
}

/** Frase curta do semáforo: "Lucro de 31%", "Prejuízo de 4%", "Informe o custo". */
export function textoSituacao(situacao: SituacaoLucro, lucroPercentual: string | number | null | undefined): string {
  if (situacao === 'sem_custo') return 'Informe o custo'
  if (situacao === 'prejuizo') return `Prejuízo de ${formatarPercentual(Math.abs(Number(lucroPercentual ?? 0)))}`
  return `Lucro de ${formatarPercentual(lucroPercentual)}`
}

/** Semáforo sem números (quem não vê custos, como o vendedor): só a cor e o rótulo. */
export const ROTULO_SEMAFORO: Record<SituacaoLucro, string> = {
  ok: 'Lucro ok',
  baixo: 'Lucro baixo',
  prejuizo: 'Prejuízo',
  sem_custo: 'Sem custo',
}

export type GrupoComposicao = 'materiais' | 'producao' | 'acabamentos' | 'outros'

export const GRUPO_COMPOSICAO_ROTULOS: Record<GrupoComposicao, string> = {
  materiais: 'Produto e materiais',
  producao: 'Produção',
  acabamentos: 'Acabamentos',
  outros: 'Outros custos',
}

const GRUPO_DA_LINHA: Record<LinhaCusto['grupo'], GrupoComposicao> = {
  produto: 'materiais',
  material: 'materiais',
  producao: 'producao',
  acabamento: 'acabamentos',
  rateio: 'outros',
  extra: 'outros',
}

/**
 * Linhas do custo de um item (motor custoDaVenda) agrupadas para a "Composição do custo": produto/materiais,
 * produção, acabamentos e outros (rateio de custos fixos e extras). Grupos vazios ficam de fora; a ordem é fixa.
 */
export function agruparLinhasCusto(linhas: LinhaCusto[] | null | undefined): { grupo: GrupoComposicao; rotulo: string; valor: string; linhas: LinhaCusto[] }[] {
  const grupos = new Map<GrupoComposicao, LinhaCusto[]>()
  for (const l of linhas ?? []) {
    const g = GRUPO_DA_LINHA[l.grupo] ?? 'outros'
    grupos.set(g, [...(grupos.get(g) ?? []), l])
  }
  return (Object.keys(GRUPO_COMPOSICAO_ROTULOS) as GrupoComposicao[]).flatMap((grupo) => {
    const ls = grupos.get(grupo)
    if (!ls?.length) return []
    // Soma em centavos (evita 0,1 + 0,2)
    const centavos = ls.reduce((s, l) => s + Math.round(Number(l.valor) * 100), 0)
    return [{ grupo, rotulo: GRUPO_COMPOSICAO_ROTULOS[grupo], valor: (centavos / 100).toFixed(2), linhas: ls }]
  })
}

/** Quantidade do insumo do acabamento "por" unidade da cobrança, em linguagem do dia a dia. */
export const UNIDADE_COBRANCA_ACABAMENTO: Record<TipoCobranca, string> = {
  fixo: 'por pedido',
  por_unidade: 'por peça',
  por_m2: 'por m²',
  por_metro_linear: 'por metro',
  por_perimetro: 'por metro de perímetro',
}
