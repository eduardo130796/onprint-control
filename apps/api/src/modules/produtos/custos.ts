import {
  Decimal,
  analisarPreco,
  custoDeReferencia,
  formatarMoeda,
  parametrosDaEmpresa,
  type BaseTempo,
  type Composicao,
  type ModoCalculo,
  type ModoRateio,
  type ParametrosPreco,
  type ProducaoComposicao,
  type SituacaoLucro,
} from '@onprint/shared'

/**
 * Regras puras da composição de custo no lado da API (docs/PRECIFICACAO.md): resolve as linhas gravadas
 * (custo/hora e minutos), monta a composição para o motor compartilhado e os parâmetros da empresa.
 */

type Num = { toString(): string } | string | number | null | undefined
const txt = (v: Num) => (v === null || v === undefined ? null : v.toString())
const dec = (v: Num) => new Decimal(txt(v) ?? 0)

export interface MaquinaCusto {
  id: string
  nome: string
  custoHora: Num
  velocidadeM2Hora: Num
}

export interface LinhaProducao {
  minutos: Num
  base: string
  setupMinutos: Num
  maquina: MaquinaCusto | null
  processo: { id: string; nome: string; custoHora: Num; tempoPadraoMinutos: number | null; maquinaPadrao: MaquinaCusto | null }
}

export interface ProducaoResolvida extends ProducaoComposicao {
  custoHora: string
  maquina: MaquinaCusto | null
}

/**
 * Custo/hora: o da máquina da linha (ou a padrão do processo) se > 0, senão o do processo.
 * Minutos: os da linha; vazio + por m² + máquina com velocidade → o motor usa 60 ÷ velocidade;
 * vazio nos demais → tempo padrão do processo, por item.
 */
export function resolverProducao(l: LinhaProducao): ProducaoResolvida {
  const maquina = l.maquina ?? l.processo.maquinaPadrao
  const custoHora = maquina && dec(maquina.custoHora).gt(0) ? dec(maquina.custoHora) : dec(l.processo.custoHora)
  const velocidade = maquina && dec(maquina.velocidadeM2Hora).gt(0) ? dec(maquina.velocidadeM2Hora).toString() : null
  const base = l.base as BaseTempo
  let minutos: string | null = txt(l.minutos)
  let baseUsada = base
  if (minutos === null) {
    if (!(base === 'por_m2' && velocidade)) {
      minutos = String(l.processo.tempoPadraoMinutos ?? 0)
      baseUsada = 'por_item'
    }
  }
  return {
    nome: maquina ? `${l.processo.nome} (${maquina.nome})` : l.processo.nome,
    custoHora: custoHora.toFixed(2),
    minutos,
    base: baseUsada,
    setupMinutos: txt(l.setupMinutos) ?? '0',
    velocidadeM2Hora: velocidade,
    maquina,
  }
}

export interface ProdutoComposicao {
  modoCalculo: ModoCalculo
  larguraPadrao: Num
  alturaPadrao: Num
  insumos: { quantidade: Num; base: string; perdaPercentual: Num; insumo: { nome: string; custo: Num; unidadeMedida: { sigla: string } | null } }[]
  processos: LinhaProducao[]
  custosExtras: { nome: string; valor: Num; base: string }[]
}

/** Composição gravada → entrada do motor (custos atuais dos insumos, máquinas e processos). */
export function montarComposicao(p: ProdutoComposicao): Composicao {
  return {
    materiais: p.insumos.map((i) => ({
      nome: i.insumo.nome,
      custoUnitario: txt(i.insumo.custo),
      unidade: i.insumo.unidadeMedida?.sigla ?? '',
      quantidade: txt(i.quantidade),
      base: i.base as Composicao['materiais'][number]['base'],
      perdaPercentual: txt(i.perdaPercentual),
    })),
    producao: p.processos.map((l) => semMaquina(resolverProducao(l))),
    extras: p.custosExtras.map((e) => ({ nome: e.nome, valor: txt(e.valor), base: e.base as Composicao['extras'][number]['base'] })),
  }
}

const semMaquina = (l: ProducaoResolvida): ProducaoComposicao => ({ nome: l.nome, custoHora: l.custoHora, minutos: l.minutos, base: l.base, setupMinutos: l.setupMinutos, velocidadeM2Hora: l.velocidadeM2Hora })

/** Custo de referência (por unidade de cálculo) da composição gravada. */
export function referenciaDoProduto(p: ProdutoComposicao, parametros: ParametrosPreco) {
  return custoDeReferencia(montarComposicao(p), { modoCalculo: p.modoCalculo, larguraPadrao: txt(p.larguraPadrao), alturaPadrao: txt(p.alturaPadrao) }, { custoFixoHora: parametros.custoFixoHora })
}

export interface ConfigEmpresaPreco {
  impostosPercentual: Num
  comissaoPercentual: Num
  custoFixoPercentual: Num
  rateioModo: string
  custoFixoMensal: Num
  horasProdutivasMes: number
  lucroDesejadoPadrao: Num
  lucroMinimoPadrao: Num
}

/** Parâmetros de preço resolvidos (sem configuração: tudo zero, lucro 30/15). */
export function parametrosPreco(cfg: ConfigEmpresaPreco | null): ParametrosPreco {
  if (!cfg) return { percentuais: { impostos: '0', comissao: '0', custoFixo: '0' }, custoFixoHora: '0.0000', lucroDesejadoPadrao: '30.00', lucroMinimoPadrao: '15.00' }
  const p = parametrosDaEmpresa({
    impostosPercentual: txt(cfg.impostosPercentual),
    comissaoPercentual: txt(cfg.comissaoPercentual),
    rateioModo: cfg.rateioModo as ModoRateio,
    custoFixoPercentual: txt(cfg.custoFixoPercentual),
    custoFixoMensal: txt(cfg.custoFixoMensal),
    horasProdutivasMes: cfg.horasProdutivasMes,
    lucroDesejadoPadrao: txt(cfg.lucroDesejadoPadrao),
    lucroMinimoPadrao: txt(cfg.lucroMinimoPadrao),
  })
  const pct = (v: Num) => dec(v).toFixed(2)
  return {
    percentuais: { impostos: pct(p.percentuais.impostos), comissao: pct(p.percentuais.comissao), custoFixo: pct(p.percentuais.custoFixo) },
    custoFixoHora: p.custoFixoHora,
    lucroDesejadoPadrao: pct(cfg.lucroDesejadoPadrao),
    lucroMinimoPadrao: pct(cfg.lucroMinimoPadrao),
  }
}

/** Situação do lucro de um produto com o preço e o custo gravados. */
export function situacaoDoProduto(p: { precoVenda: Num; custo: Num; lucroMinimo: Num }, parametros: ParametrosPreco) {
  return analisarPreco(txt(p.precoVenda), txt(p.custo), parametros.percentuais, txt(p.lucroMinimo) ?? parametros.lucroMinimoPadrao)
}

export interface MudancaSituacao {
  id: string
  nome: string
  antes: SituacaoLucro
  depois: SituacaoLucro
}

/** Produtos que PASSARAM a ficar abaixo do lucro mínimo (ou em prejuízo). */
export function quePioraram(mudancas: MudancaSituacao[]) {
  const ruim = (s: SituacaoLucro) => s === 'baixo' || s === 'prejuizo'
  return mudancas.filter((m) => !ruim(m.antes) && ruim(m.depois))
}

/** "O custo de Lona 440g subiu (R$ 8,90 → R$ 9,52/m²): 3 produtos ficaram abaixo do lucro mínimo." */
export function mensagemReajuste(causa: string, quantidade: number) {
  const produtos = quantidade === 1 ? '1 produto ficou' : `${quantidade} produtos ficaram`
  return `${causa}: ${produtos} abaixo do lucro mínimo.`
}

export function causaCustoInsumo(nome: string, antes: Num, depois: Num, unidade: string | null) {
  const a = dec(antes)
  const d = dec(depois)
  const verbo = d.gt(a) ? 'subiu' : d.lt(a) ? 'baixou' : 'mudou'
  return `O custo de ${nome} ${verbo} (${formatarMoeda(a.toString())} → ${formatarMoeda(d.toString())}${unidade ? `/${unidade}` : ''})`
}

/** Unidade de uso do insumo para converter a embalagem: m², metro ou outra. */
export function usoDaUnidade(sigla: string | null | undefined): 'm2' | 'm' | 'outra' {
  if (sigla === 'm²' || sigla === 'm2') return 'm2'
  if (sigla === 'm') return 'm'
  return 'outra'
}

/** Modo de cálculo do insumo pela unidade de uso. */
export function modoDoInsumo(sigla: string | null | undefined): ModoCalculo {
  const uso = usoDaUnidade(sigla)
  return uso === 'm2' ? 'm2' : uso === 'm' ? 'metro_linear' : 'unidade'
}
