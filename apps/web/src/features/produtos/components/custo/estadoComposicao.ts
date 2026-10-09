import {
  analisarPreco,
  custoDeReferencia,
  medidasDeReferencia,
  precoSugerido,
  type AnalisePreco,
  type BaseExtra,
  type BaseInsumo,
  type BaseTempo,
  type ComposicaoProdutoDetalhe,
  type ComposicaoProdutoInput,
  type CustoItem,
  type Maquina,
  type ModoCusto,
  type Processo,
} from '@onprint/shared'
import { decimalParaInput } from '@/lib/mascaras'
import { paraApi, paraCampo, producaoParaMotor, type DadosProducao } from '../../custos'

/**
 * Estado da aba "Custo e preço": o que a pessoa está editando (texto dos campos, padrão brasileiro),
 * a conversão para o PUT /produtos/:id/composicao e a conta ao vivo com o motor compartilhado.
 */

let proximaChave = 1
const chave = () => proximaChave++

export interface MaterialLinha {
  chave: number
  insumoId: string
  nome: string
  unidade: string
  /** Custo do insumo por unidade de uso (decimal da API) */
  custoUnitario: string
  quantidade: string
  base: BaseInsumo
  perdaPercentual: string
}

export interface ProducaoLinha {
  chave: number
  processoId: string
  maquinaId: string
  minutos: string
  base: BaseTempo
  setupMinutos: string
}

export interface ExtraLinha {
  chave: number
  nome: string
  valor: string
  base: BaseExtra
}

export interface EstadoComposicao {
  modoCusto: ModoCusto
  custoManual: string
  materiais: MaterialLinha[]
  producao: ProducaoLinha[]
  extras: ExtraLinha[]
  lucroDesejado: string
  lucroMinimo: string
  precoVenda: string
  precoMinimo: string
}

export const novoMaterial = (base: BaseInsumo): MaterialLinha => ({ chave: chave(), insumoId: '', nome: '', unidade: '', custoUnitario: '0', quantidade: '1', base, perdaPercentual: '' })
export const novaProducao = (base: BaseTempo): ProducaoLinha => ({ chave: chave(), processoId: '', maquinaId: '', minutos: '', base, setupMinutos: '' })
export const novoExtra = (): ExtraLinha => ({ chave: chave(), nome: '', valor: '', base: 'por_item' })

/** Base sugerida para uma linha nova, pela forma de cobrança do produto. */
export function baseSugerida(modoCalculo: ComposicaoProdutoDetalhe['modoCalculo']): BaseInsumo {
  return modoCalculo === 'm2' ? 'por_m2' : modoCalculo === 'metro_linear' ? 'por_metro_linear' : 'por_unidade'
}

export function estadoDoDetalhe(d: ComposicaoProdutoDetalhe): EstadoComposicao {
  return {
    modoCusto: d.modoCusto,
    custoManual: paraCampo(d.custoManual),
    materiais: d.materiais.map((m) => ({
      chave: chave(),
      insumoId: m.insumoId,
      nome: m.nome,
      unidade: m.unidade,
      custoUnitario: m.custoUnitario,
      quantidade: paraCampo(m.quantidade),
      base: m.base,
      perdaPercentual: Number(m.perdaPercentual) ? paraCampo(m.perdaPercentual, 2) : '',
    })),
    producao: d.producao.map((p) => ({
      chave: chave(),
      processoId: p.processoId,
      maquinaId: p.maquinaId ?? '',
      minutos: paraCampo(p.minutos, 2),
      base: p.base,
      setupMinutos: Number(p.setupMinutos) ? paraCampo(p.setupMinutos, 2) : '',
    })),
    extras: d.extras.map((e) => ({ chave: chave(), nome: e.nome, valor: paraCampo(e.valor), base: e.base })),
    lucroDesejado: paraCampo(d.lucroDesejado, 2),
    lucroMinimo: paraCampo(d.lucroMinimo, 2),
    precoVenda: decimalParaInput(d.precoVenda),
    precoMinimo: d.precoMinimo ? decimalParaInput(d.precoMinimo) : '',
  }
}

/** Assinatura do estado sem as chaves das linhas (para saber se houve alteração). */
export function assinatura(e: EstadoComposicao): string {
  return JSON.stringify({
    ...e,
    materiais: e.materiais.map((m) => [m.insumoId, m.quantidade, m.base, m.perdaPercentual]),
    producao: e.producao.map((p) => [p.processoId, p.maquinaId, p.minutos, p.base, p.setupMinutos]),
    extras: e.extras.map((x) => [x.nome, x.valor, x.base]),
  })
}

/** Corpo do PUT /produtos/:id/composicao. Os materiais/produção vão mesmo no modo simples (baixa de estoque). */
export function paraEnvio(e: EstadoComposicao): ComposicaoProdutoInput {
  return {
    modoCusto: e.modoCusto,
    custoManual: paraApi(e.custoManual) || null,
    materiais: e.materiais.map((m) => ({ insumoId: m.insumoId, quantidade: paraApi(m.quantidade), base: m.base, perdaPercentual: paraApi(m.perdaPercentual) || '0' })),
    producao: e.producao.map((p) => ({ processoId: p.processoId, maquinaId: p.maquinaId || null, minutos: paraApi(p.minutos) || null, base: p.base, setupMinutos: paraApi(p.setupMinutos) || '0' })),
    extras: e.extras.map((x) => ({ nome: x.nome.trim(), valor: paraApi(x.valor) || '0', base: x.base })),
    lucroDesejado: paraApi(e.lucroDesejado) || null,
    lucroMinimo: paraApi(e.lucroMinimo) || null,
    precoVenda: paraApi(e.precoVenda) || '0',
    precoMinimo: paraApi(e.precoMinimo) || null,
  }
}

/**
 * Custo/hora, velocidade e tempo padrão de uma linha de produção: máquina da linha (ou a padrão do processo)
 * com custo/hora > 0, senão o custo/hora do processo; sem o cadastro na lista, o que veio da API.
 */
export function dadosDaProducao(linha: ProducaoLinha, processos: Processo[], maquinas: Maquina[], detalhe?: ComposicaoProdutoDetalhe): DadosProducao & { maquinaNome: string | null } {
  const original = detalhe?.producao.find((p) => p.processoId === linha.processoId && (p.maquinaId ?? '') === linha.maquinaId)
  const processo = processos.find((p) => p.id === linha.processoId)
  const maquinaId = linha.maquinaId || processo?.maquinaPadraoId || original?.maquinaId || ''
  const maquina = maquinas.find((m) => m.id === maquinaId)
  if (!processo && original) return { nome: original.nome, custoHora: original.custoHora, velocidadeM2Hora: original.velocidadeM2Hora, tempoPadraoMinutos: original.tempoPadraoMinutos, maquinaNome: original.maquinaNome }
  const custoMaquina = Number(maquina?.custoHora ?? 0)
  return {
    nome: processo?.nome ?? '',
    custoHora: custoMaquina > 0 ? (maquina?.custoHora as string) : (processo?.custoHora ?? original?.custoHora ?? '0'),
    velocidadeM2Hora: maquina?.velocidadeM2Hora ?? null,
    tempoPadraoMinutos: processo?.tempoPadraoMinutos ?? null,
    maquinaNome: maquina?.nome ?? null,
  }
}

export interface ResultadoCusto {
  /** Custo direto por unidade de cálculo */
  custo: string
  unidade: string
  /** Partes do custo por unidade de cálculo (para as barras) */
  partes: { materiais: number; producao: number; rateio: number; extras: number }
  /** Custo de cada linha por unidade de cálculo, na ordem da tela */
  linhas: { materiais: number[]; producao: number[]; extras: number[] }
  /** Custo da composição (mesmo no modo simples, para o convite de ativá-la) */
  custoComposicao: string
  lucroDesejado: string
  lucroMinimo: string
  sugerido: string | null
  /** Preço para o lucro mínimo (sugestão de preço mínimo) */
  sugeridoMinimo: string | null
  analise: AnalisePreco
}

/** Conta ao vivo: custo de referência pela composição (ou o digitado), preço sugerido e lucro do preço. */
export function calcular(e: EstadoComposicao, d: ComposicaoProdutoDetalhe, producao: DadosProducao[]): ResultadoCusto {
  const produto = { modoCalculo: d.modoCalculo, larguraPadrao: d.larguraPadrao, alturaPadrao: d.alturaPadrao }
  const ref = custoDeReferencia(
    {
      materiais: e.materiais.filter((m) => m.insumoId).map((m) => ({ nome: m.nome, custoUnitario: m.custoUnitario, unidade: m.unidade, quantidade: paraApi(m.quantidade) || '0', base: m.base, perdaPercentual: paraApi(m.perdaPercentual) || '0' })),
      producao: e.producao.map((p, i) => (p.processoId ? producaoParaMotor(p, producao[i]!) : null)).filter((p) => p !== null),
      extras: e.extras.map((x) => ({ nome: x.nome, valor: paraApi(x.valor) || '0', base: x.base })),
    },
    produto,
    { custoFixoHora: d.parametros.custoFixoHora },
  )
  const divisor = medidasDeReferencia(produto).divisor || 1
  const porUnidade = (v: string) => Number(v) / divisor
  const valores = (grupo: CustoItem['linhas'][number]['grupo']) => ref.linhas.filter((l) => l.grupo === grupo).map((l) => porUnidade(l.valor))
  // Linhas sem insumo/processo escolhido não entram no motor: recoloca na posição da tela
  const espalhar = <T>(lista: T[], valido: (x: T) => boolean, calculados: number[]) => {
    let i = 0
    return lista.map((x) => (valido(x) ? (calculados[i++] ?? 0) : 0))
  }
  const custo = e.modoCusto === 'composicao' ? ref.porUnidade : paraApi(e.custoManual) || '0'
  const lucroDesejado = paraApi(e.lucroDesejado) || d.parametros.lucroDesejadoPadrao
  const lucroMinimo = paraApi(e.lucroMinimo) || d.parametros.lucroMinimoPadrao
  const pct = d.parametros.percentuais
  return {
    custo,
    unidade: ref.unidade,
    partes: { materiais: porUnidade(ref.materiais), producao: porUnidade(ref.producao), rateio: porUnidade(ref.rateio), extras: porUnidade(ref.extras) },
    linhas: {
      materiais: espalhar(e.materiais, (m) => Boolean(m.insumoId), valores('material')),
      producao: espalhar(e.producao, (p) => Boolean(p.processoId), valores('producao')),
      extras: valores('extra'),
    },
    custoComposicao: ref.porUnidade,
    lucroDesejado,
    lucroMinimo,
    sugerido: Number(custo) > 0 ? precoSugerido(custo, pct, lucroDesejado) : null,
    sugeridoMinimo: Number(custo) > 0 ? precoSugerido(custo, pct, lucroMinimo) : null,
    analise: analisarPreco(paraApi(e.precoVenda) || '0', custo, pct, lucroMinimo),
  }
}

/** Frase da medida de referência: "calculado para 1 m²", "na medida padrão 2 × 1 m, dividido por m²"… */
export function notaReferencia(d: Pick<ComposicaoProdutoDetalhe, 'modoCalculo' | 'larguraPadrao' | 'alturaPadrao'>): string {
  const l = Number(d.larguraPadrao ?? 0)
  const a = Number(d.alturaPadrao ?? 0)
  switch (d.modoCalculo) {
    case 'm2':
      return l > 0 && a > 0 ? `Calculado na medida padrão (${paraCampo(l, 3)} × ${paraCampo(a, 3)} m) e dividido por m²` : 'Calculado para 1 m²'
    case 'metro_linear':
      return 'Calculado para 1 metro'
    case 'milheiro':
      return 'Calculado para 1 milheiro (1.000 unidades)'
    case 'hora':
      return 'Calculado para 1 hora'
    default:
      return 'Calculado para 1 unidade'
  }
}
