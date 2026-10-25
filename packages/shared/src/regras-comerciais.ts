import { adicionarDias, diaDaSemana } from './datas'
import { formatarMoeda } from './format'
import { Decimal, type Valor } from './pricing'
import type { AcaoRegra, CombinacaoRegra, CondicoesRegra, OrigemOrcamento, PresetRegra, RegraComercialInput, TipoAcaoRegra, TipoRegra } from './schemas/regras'
import { DIAS_SEMANA_CURTOS, ORIGEM_ORCAMENTO_ROTULOS } from './schemas/regras'

/*
 * Motor das regras comerciais: função pura, a mesma no editor (valores ao vivo), no simulador e na API (que aplica de
 * novo ao salvar e guarda o resultado no orçamento). Recebe o rascunho do orçamento já com o preço de cada item
 * (calcularPreco) e as regras ativas; devolve o ajuste de cada item e do orçamento, as regras aplicadas com a
 * explicação, sugestões, avisos, pedidos de aprovação e bloqueios.
 *
 * Semântica (para o dono e para os testes):
 * - Ordem: prioridade (menor primeiro), depois o nome. Condições somam com E; listas valem com OU dentro delas.
 * - Condições de item (produto, categoria, quantidade, valor do item) escolhem os itens; as outras olham o orçamento.
 *   Ação de orçamento com condição de item vale sobre a soma dos itens que atendem (e só se houver algum).
 * - Valores de referência: "valor do item" e "valor total" são antes das regras e dos descontos manuais.
 * - Descontos (e preço especial que barateia): "soma" acumula; "maior" não acumula — o maior deles compete com a soma
 *   dos acumuláveis, em reais, e vale só o lado maior (empate: os acumuláveis). Percentuais somam sobre a mesma base
 *   (5% + 10% = 15%, não composto). Acréscimos sempre somam.
 * - Preço especial: o primeiro por prioridade em cada item; não vale em item com preço digitado pelo vendedor.
 * - Pedido mínimo e limite de negociação: o primeiro por prioridade. O mínimo é conferido por último, sobre o total
 *   já com regras e descontos/acréscimos manuais (sem o frete).
 * - Preço mínimo do produto: se as regras levarem o preço do item abaixo do mínimo, o orçamento pede aprovação.
 * - Limite de negociação: desconto manual (itens + orçamento + preço digitado abaixo do de tabela) sobre o valor já
 *   com as regras; acima do limite, pede aprovação. Sem regra de limite, não há limite.
 * - Arredondamento: cada valor de regra em centavos (meio para cima); nenhum item fica negativo.
 */

export interface RegraComercialMotor {
  id: string
  nome: string
  ativa: boolean
  prioridade: number
  tipo?: TipoRegra | string
  condicoes: CondicoesRegra
  acao: AcaoRegra
  combinacao: CombinacaoRegra
}

export interface ItemParaRegras {
  produtoId: string | null
  categoriaId?: string | null
  /** Nome do item (para as explicações: "Item 2 (Banner)") */
  descricao?: string
  /** Peças (no milheiro, unidades; na hora, horas) */
  quantidade: Valor
  /** Quantidade na unidade de cálculo (m², metros, milheiros…), a base do preço por unidade */
  quantidadeCobrada: Valor
  /** Preço usado no item (de tabela ou digitado) */
  precoUnitario: Valor
  /** Preço de tabela do produto */
  precoCatalogo: Valor
  precoMinimo?: Valor | null
  valorProduto: Valor
  valorAcabamentos: Valor
  /** Desconto manual no item (R$) */
  desconto?: Valor
  /** Sufixo da unidade de cálculo ("un", "m²"…) para "Preço especial R$ 0,30/un" */
  unidade?: string
}

export interface EntradaRegras {
  itens: ItemParaRegras[]
  clienteId: string | null
  etiquetasCliente: string[]
  /** Pagamento combinado; null = ainda não definido (condição de pagamento não vale) */
  pagamento: { sinalPercentual: Valor; parcelas: number } | null
  /** Data em que o cliente quer o pedido (AAAA-MM-DD) */
  dataDesejada: string | null
  /** Data do orçamento (AAAA-MM-DD, São Paulo) */
  hoje: string
  origem: OrigemOrcamento
  /** Desconto, acréscimo e frete manuais do orçamento */
  desconto?: Valor
  acrescimo?: Valor
  frete?: Valor
}

export type NivelRegra = 'item' | 'orcamento'

export interface EfeitoNoItem {
  regraId: string
  nome: string
  /** Curto, para o selo: "−5%", "+R$ 10,00", "Preço especial R$ 0,30/un" */
  efeito: string
  /** Valor com sinal (negativo = desconto) */
  valor: string
}

export interface ItemComRegras {
  /** Produto + acabamentos, antes de tudo */
  bruto: string
  /** Soma das regras no item (negativo = desconto) */
  ajuste: string
  /** Desconto manual efetivo (limitado ao valor do item) */
  desconto: string
  /** bruto + ajuste − desconto */
  total: string
  regras: EfeitoNoItem[]
  /** As regras levaram o preço abaixo do mínimo do produto */
  abaixoDoMinimo: boolean
}

export interface RegraAplicada {
  regraId: string
  nome: string
  tipo: TipoAcaoRegra
  nivel: NivelRegra | null
  /** Índices dos itens alcançados (ações de item ou condições de item) */
  itens: number[]
  efeito: string
  /** Valor com sinal no orçamento (negativo = desconto; 0 nas ações sem valor) */
  valor: string
  /** Para a equipe: "Desconto por quantidade (−5%)" */
  explicacao: string
  fraseCliente: string | null
}

export interface RegraIgnorada {
  regraId: string
  nome: string
  motivo: string
}

export interface SugestaoRegra {
  regraId: string
  texto: string
  produtoId: string | null
  obrigatorio: boolean
}

export interface MotivoLiberacao {
  regraId: string | null
  motivo: string
}

export interface ResultadoRegras {
  itens: ItemComRegras[]
  /** Ajuste das regras no orçamento (descontos/acréscimos de orçamento e pedido mínimo), com sinal */
  ajusteOrcamento: string
  aplicadas: RegraAplicada[]
  ignoradas: RegraIgnorada[]
  sugestoes: SugestaoRegra[]
  avisos: { regraId: string; texto: string }[]
  aprovacoes: MotivoLiberacao[]
  bloqueios: MotivoLiberacao[]
  /** Frases para o cliente (mensagem, PDF e página de aprovação) */
  frasesCliente: string[]
  /** Desconto manual máximo (%) para quem não é gerente; null = sem limite */
  limiteNegociacao: string | null
  /** Desconto manual dado, em % do valor com as regras */
  descontoManualPercentual: string
  subtotal: string
  total: string
}

const ZERO = new Decimal(0)
const CEM = new Decimal(100)

function dec(v: Valor | null | undefined): Decimal {
  if (v === null || v === undefined || v === '') return ZERO
  try {
    const d = new Decimal(v)
    return d.isFinite() ? d : ZERO
  } catch {
    return ZERO
  }
}
const centavos = (v: Decimal) => v.toDecimalPlaces(2)

/** Sem acento e sem diferença de maiúsculas: "Revenda" = "revenda" = "REVENDA" */
export const normalizarEtiqueta = (t: string) => t.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()

/** Dias úteis (seg a sex) depois de `de` até `ate` (inclusive); 0 se `ate` não é depois de `de` */
export function diasUteisAte(de: string, ate: string): number {
  let dias = 0
  for (let d = adicionarDias(de, 1); d <= ate.slice(0, 10) && dias < 400; d = adicionarDias(d, 1)) {
    const s = diaDaSemana(d)
    if (s !== 0 && s !== 6) dias++
  }
  return dias
}

/** À vista = entrada de 100% (o restante zero) */
export const pagamentoAVista = (p: { sinalPercentual: Valor }) => dec(p.sinalPercentual).gte(100)

const percentualTexto = (v: Valor) => dec(v).toNumber().toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const quantidadeTexto = (v: Valor) => dec(v).toNumber().toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** "−5%", "+20%", "−R$ 10,00" */
function efeitoTexto(sinal: '−' | '+', modo: 'percentual' | 'valor', valor: Valor) {
  return modo === 'percentual' ? `${sinal}${percentualTexto(valor)}%` : `${sinal}${formatarMoeda(dec(valor).toFixed(2))}`
}
/** "5%" ou "R$ 10,00" (para {valor} nas frases) */
const valorDaAcao = (modo: 'percentual' | 'valor', valor: Valor) => (modo === 'percentual' ? `${percentualTexto(valor)}%` : formatarMoeda(dec(valor).toFixed(2)))

const temLista = (l?: unknown[]) => Array.isArray(l) && l.length > 0
const definido = (v: unknown): v is string => v !== null && v !== undefined && v !== ''

/** A regra tem condição que escolhe itens? */
export function temCondicaoDeItem(c: CondicoesRegra): boolean {
  return temLista(c.produtoIds) || temLista(c.categoriaIds) || definido(c.quantidadeMin) || definido(c.quantidadeMax) || definido(c.valorItemMin) || definido(c.valorItemMax)
}

function itemAtende(c: CondicoesRegra, item: ItemParaRegras, bruto: Decimal): boolean {
  if (temLista(c.produtoIds) && !(item.produtoId && c.produtoIds!.includes(item.produtoId))) return false
  if (temLista(c.categoriaIds) && !(item.categoriaId && c.categoriaIds!.includes(item.categoriaId))) return false
  const q = dec(item.quantidade)
  if (definido(c.quantidadeMin) && q.lt(dec(c.quantidadeMin))) return false
  if (definido(c.quantidadeMax) && q.gt(dec(c.quantidadeMax))) return false
  if (definido(c.valorItemMin) && bruto.lt(dec(c.valorItemMin))) return false
  if (definido(c.valorItemMax) && bruto.gt(dec(c.valorItemMax))) return false
  return true
}

function orcamentoAtende(c: CondicoesRegra, e: EntradaRegras, subtotalBruto: Decimal): boolean {
  if (temLista(c.clienteIds) && !(e.clienteId && c.clienteIds!.includes(e.clienteId))) return false
  if (temLista(c.etiquetas)) {
    const doCliente = new Set(e.etiquetasCliente.map(normalizarEtiqueta))
    if (!c.etiquetas!.some((t) => doCliente.has(normalizarEtiqueta(t)))) return false
  }
  if (definido(c.valorTotalMin) && subtotalBruto.lt(dec(c.valorTotalMin))) return false
  if (definido(c.valorTotalMax) && subtotalBruto.gt(dec(c.valorTotalMax))) return false
  if (c.pagamento) {
    if (!e.pagamento) return false
    if ((c.pagamento === 'a_vista') !== pagamentoAVista(e.pagamento)) return false
  }
  if (c.prazoMenorQueDias !== null && c.prazoMenorQueDias !== undefined) {
    if (!e.dataDesejada || diasUteisAte(e.hoje, e.dataDesejada) >= c.prazoMenorQueDias) return false
  }
  if (definido(c.periodoInicio) && e.hoje < c.periodoInicio) return false
  if (definido(c.periodoFim) && e.hoje > c.periodoFim) return false
  if (temLista(c.diasSemana) && !c.diasSemana!.includes(diaDaSemana(e.hoje))) return false
  if (temLista(c.origens) && !c.origens!.includes(e.origem)) return false
  return true
}

/** Faixa alcançada (a de maior mínimo ≤ medida) ou null */
function faixaAlcancada(faixas: { minimo: string; valor: string }[], medida: Decimal) {
  return [...faixas].sort((a, b) => dec(b.minimo).cmp(dec(a.minimo))).find((f) => medida.gte(dec(f.minimo))) ?? null
}

/** Frase do cliente com {valor} trocado ("Desconto de {valor} por quantidade" → "Desconto de 5% por quantidade") */
function frase(texto: string | null | undefined, valor: string): string | null {
  const t = texto?.trim()
  return t ? t.replace(/\{\s*valor\s*\}/gi, valor) : null
}

interface Candidato {
  regra: RegraComercialMotor
  ordem: number
  tipo: 'desconto' | 'acrescimo'
  nivel: NivelRegra
  /** Por item (nível item) ou um só (nível orçamento, item = -1) */
  partes: { item: number; valor: Decimal; efeito: string }[]
  efeito: string
  /** O que entra no {valor} da frase do cliente */
  rotuloValor: string
}

/** Ordem determinística: prioridade, depois nome e id */
export function ordenarRegras<T extends Pick<RegraComercialMotor, 'prioridade' | 'nome' | 'id'>>(regras: T[]): T[] {
  return [...regras].sort((a, b) => a.prioridade - b.prioridade || a.nome.localeCompare(b.nome, 'pt-BR') || a.id.localeCompare(b.id))
}

export function aplicarRegras(entrada: EntradaRegras, regras: RegraComercialMotor[]): ResultadoRegras {
  const ativas = ordenarRegras(regras.filter((r) => r.ativa))
  const brutos = entrada.itens.map((i) => centavos(dec(i.valorProduto).plus(dec(i.valorAcabamentos))))
  const subtotalBruto = brutos.reduce((s, b) => s.plus(b), ZERO)
  const rotuloItem = (k: number) => `Item ${k + 1}${entrada.itens[k]?.descricao ? ` (${entrada.itens[k]!.descricao})` : ''}`

  const aplicadas: RegraAplicada[] = []
  const ignoradas: RegraIgnorada[] = []
  const sugestoes: SugestaoRegra[] = []
  const avisos: { regraId: string; texto: string }[] = []
  const aprovacoes: MotivoLiberacao[] = []
  const bloqueios: MotivoLiberacao[] = []
  const candidatos: Candidato[] = []
  const especialNoItem = new Set<number>()
  let minimo: { regra: RegraComercialMotor; acao: Extract<AcaoRegra, { tipo: 'pedido_minimo' }>; itens: number[] } | null = null
  let limite: string | null = null

  /** Registra a regra que valeu, com o aviso para a equipe e a frase do cliente que a acompanham */
  const registrar = (r: RegraComercialMotor, dados: Omit<RegraAplicada, 'regraId' | 'nome' | 'tipo' | 'fraseCliente'>, valorFrase = '') => {
    const a = r.acao as { avisoEquipe?: string | null; fraseCliente?: string | null }
    if (a.avisoEquipe?.trim()) avisos.push({ regraId: r.id, texto: a.avisoEquipe.trim() })
    aplicadas.push({ regraId: r.id, nome: r.nome, tipo: r.acao.tipo, fraseCliente: frase(a.fraseCliente, valorFrase), ...dados })
  }

  for (const [ordem, r] of ativas.entries()) {
    if (!orcamentoAtende(r.condicoes, entrada, subtotalBruto)) continue
    const porItem = temCondicaoDeItem(r.condicoes)
    const alvos = entrada.itens.map((_, k) => k).filter((k) => !porItem || itemAtende(r.condicoes, entrada.itens[k]!, brutos[k]!))
    if (porItem && alvos.length === 0) continue
    const itensDaRegra = porItem ? alvos : []
    const a = r.acao

    switch (a.tipo) {
      case 'desconto':
      case 'acrescimo': {
        if (!alvos.length) break
        const sinal = a.tipo === 'desconto' ? '−' : '+'
        const calcular = (base: Decimal, medida: Decimal) => {
          let valor = a.valor
          if (a.faixas?.length) {
            const f = faixaAlcancada(a.faixas, medida)
            if (!f) return null
            valor = f.valor
          }
          const v = a.modo === 'percentual' ? centavos(base.mul(dec(valor)).div(CEM)) : centavos(dec(valor))
          return { valor: a.tipo === 'desconto' ? Decimal.min(v, base) : v, efeito: efeitoTexto(sinal, a.modo, valor), rotulo: valorDaAcao(a.modo, valor) }
        }
        if (a.nivel === 'item') {
          const partes: Candidato['partes'] = []
          let rotulo = ''
          for (const k of alvos) {
            const medida = a.faixasPor === 'quantidade' ? dec(entrada.itens[k]!.quantidade) : brutos[k]!
            const c = calcular(brutos[k]!, medida)
            if (!c || c.valor.lte(0)) continue
            partes.push({ item: k, valor: c.valor, efeito: c.efeito })
            rotulo ||= c.rotulo
          }
          if (partes.length) candidatos.push({ regra: r, ordem, tipo: a.tipo, nivel: 'item', partes, efeito: partes[0]!.efeito, rotuloValor: rotulo })
        } else {
          const base = alvos.reduce((s, k) => s.plus(brutos[k]!), ZERO)
          const medida = a.faixasPor === 'quantidade' ? alvos.reduce((s, k) => s.plus(dec(entrada.itens[k]!.quantidade)), ZERO) : base
          const c = calcular(base, medida)
          if (c && c.valor.gt(0)) candidatos.push({ regra: r, ordem, tipo: a.tipo, nivel: 'orcamento', partes: [{ item: -1, valor: c.valor, efeito: c.efeito }], efeito: c.efeito, rotuloValor: c.rotulo })
        }
        break
      }
      case 'preco_especial': {
        const partes: Candidato['partes'] = []
        const acrescimos: Candidato['partes'] = []
        for (const k of alvos) {
          const item = entrada.itens[k]!
          if (especialNoItem.has(k)) continue
          if (!dec(item.precoUnitario).eq(dec(item.precoCatalogo))) {
            ignoradas.push({ regraId: r.id, nome: r.nome, motivo: `${rotuloItem(k)}: o preço foi digitado no item; vale o preço digitado.` })
            continue
          }
          especialNoItem.add(k)
          const especial = centavos(dec(item.quantidadeCobrada).mul(dec(a.valor)))
          const dif = centavos(dec(item.valorProduto)).minus(especial)
          const efeito = `Preço especial ${formatarMoeda(dec(a.valor).toFixed(2))}/${item.unidade ?? 'un'}`
          if (dif.gt(0)) partes.push({ item: k, valor: dif, efeito })
          else if (dif.lt(0)) acrescimos.push({ item: k, valor: dif.neg(), efeito })
        }
        const rotulo = formatarMoeda(dec(a.valor).toFixed(2))
        if (partes.length) candidatos.push({ regra: r, ordem, tipo: 'desconto', nivel: 'item', partes, efeito: partes[0]!.efeito, rotuloValor: rotulo })
        if (acrescimos.length) candidatos.push({ regra: r, ordem, tipo: 'acrescimo', nivel: 'item', partes: acrescimos, efeito: acrescimos[0]!.efeito, rotuloValor: rotulo })
        break
      }
      case 'pedido_minimo':
        if (minimo) ignoradas.push({ regraId: r.id, nome: r.nome, motivo: `Vale o pedido mínimo de “${minimo.regra.nome}”, que vem antes.` })
        else minimo = { regra: r, acao: a, itens: itensDaRegra }
        break
      case 'limite_negociacao':
        if (limite !== null) ignoradas.push({ regraId: r.id, nome: r.nome, motivo: 'Vale o limite de negociação de uma regra que vem antes.' })
        else {
          limite = dec(a.percentual).toFixed(2)
          registrar(r, { nivel: null, itens: itensDaRegra, efeito: `até ${percentualTexto(a.percentual)}%`, valor: '0.00', explicacao: `${r.nome}: desconto manual até ${percentualTexto(a.percentual)}% sem gerente` })
        }
        break
      case 'sugerir_item': {
        if (a.produtoId && entrada.itens.some((i) => i.produtoId === a.produtoId)) break
        sugestoes.push({ regraId: r.id, texto: a.texto, produtoId: a.produtoId ?? null, obrigatorio: a.obrigatorio })
        if (a.obrigatorio) aprovacoes.push({ regraId: r.id, motivo: `${r.nome}: falta ${a.texto.replace(/[.\s]+$/, '')}.` })
        registrar(r, { nivel: null, itens: itensDaRegra, efeito: a.obrigatorio ? 'item obrigatório' : 'sugestão', valor: '0.00', explicacao: `${r.nome}: ${a.texto}` })
        break
      }
      case 'exigir_aprovacao':
        aprovacoes.push({ regraId: r.id, motivo: `${r.nome}: ${a.motivo}` })
        registrar(r, { nivel: null, itens: itensDaRegra, efeito: 'aprovação do gerente', valor: '0.00', explicacao: `${r.nome}: ${a.motivo}` })
        break
      case 'bloquear':
        bloqueios.push({ regraId: r.id, motivo: `${r.nome}: ${a.motivo}` })
        registrar(r, { nivel: null, itens: itensDaRegra, efeito: 'bloqueado', valor: '0.00', explicacao: `${r.nome}: ${a.motivo}` })
        break
      case 'aviso':
        avisos.push({ regraId: r.id, texto: a.texto })
        registrar(r, { nivel: null, itens: itensDaRegra, efeito: 'aviso', valor: '0.00', explicacao: `${r.nome}: ${a.texto}` })
        break
      case 'frase_cliente':
        aplicadas.push({ regraId: r.id, nome: r.nome, tipo: a.tipo, nivel: null, itens: itensDaRegra, efeito: 'frase', valor: '0.00', explicacao: `${r.nome}: “${a.texto.trim()}”`, fraseCliente: a.texto.trim() })
        break
    }
  }

  // ── Descontos: os acumuláveis somam; "maior vence" compete com a soma deles (em reais) ──
  const descontos = candidatos.filter((c) => c.tipo === 'desconto')
  const totalDe = (c: Candidato) => c.partes.reduce((s, p) => s.plus(p.valor), ZERO)
  const acumulaveis = descontos.filter((c) => c.regra.combinacao !== 'maior')
  const somaAcumulavel = acumulaveis.reduce((s, c) => s.plus(totalDe(c)), ZERO)
  let melhor: Candidato | null = null
  for (const m of descontos.filter((c) => c.regra.combinacao === 'maior')) if (!melhor || totalDe(m).gt(totalDe(melhor))) melhor = m
  const vencem = new Set<Candidato>(melhor && totalDe(melhor).gt(somaAcumulavel) ? [melhor] : acumulaveis)
  for (const c of descontos) {
    if (vencem.has(c)) continue
    const porque = melhor && vencem.has(melhor) ? `vale “${melhor.regra.nome}”, que dá mais desconto` : 'os outros descontos juntos dão mais'
    ignoradas.push({ regraId: c.regra.id, nome: c.regra.nome, motivo: `Não acumula com outros descontos: ${porque}.` })
  }

  // ── Aplica (na ordem das regras), sem deixar nenhum item nem o orçamento negativo ──
  const ajustes = entrada.itens.map(() => ZERO)
  const efeitos: EfeitoNoItem[][] = entrada.itens.map(() => [])
  const noOrcamento = { desconto: ZERO, acrescimo: ZERO }
  const efetivos = candidatos.filter((c) => c.tipo === 'acrescimo' || vencem.has(c)).sort((a, b) => a.ordem - b.ordem)
  const valorEfetivo = new Map<Candidato, Decimal>()
  for (const c of efetivos.filter((x) => x.nivel === 'item')) {
    let total = ZERO
    for (const p of c.partes) {
      const disponivel = Decimal.max(brutos[p.item]!.plus(ajustes[p.item]!), ZERO)
      const v = c.tipo === 'desconto' ? Decimal.min(p.valor, disponivel) : p.valor
      if (v.lte(0)) continue
      const comSinal = c.tipo === 'desconto' ? v.neg() : v
      ajustes[p.item] = ajustes[p.item]!.plus(comSinal)
      efeitos[p.item]!.push({ regraId: c.regra.id, nome: c.regra.nome, efeito: p.efeito, valor: comSinal.toFixed(2) })
      total = total.plus(comSinal)
    }
    valorEfetivo.set(c, total)
  }
  const somaItens = brutos.reduce((s, b, k) => s.plus(b).plus(ajustes[k]!), ZERO)
  for (const c of efetivos.filter((x) => x.nivel === 'orcamento')) {
    const p = c.partes[0]!
    if (c.tipo === 'desconto') {
      const v = Decimal.min(p.valor, Decimal.max(somaItens.minus(noOrcamento.desconto), ZERO))
      noOrcamento.desconto = noOrcamento.desconto.plus(v)
      valorEfetivo.set(c, v.neg())
    } else {
      noOrcamento.acrescimo = noOrcamento.acrescimo.plus(p.valor)
      valorEfetivo.set(c, p.valor)
    }
  }
  for (const c of efetivos) {
    const v = valorEfetivo.get(c) ?? ZERO
    if (v.isZero()) continue
    const itens = c.nivel === 'item' ? c.partes.map((p) => p.item) : []
    const valorTxt = `${v.lt(0) ? '−' : '+'}${formatarMoeda(v.abs().toFixed(2))}`
    const explicacao = c.nivel === 'orcamento' && c.efeito.includes('%') ? `${c.regra.nome} (${c.efeito} = ${valorTxt})` : `${c.regra.nome} (${c.efeito})`
    registrar(c.regra, { nivel: c.nivel, itens, efeito: c.efeito, valor: v.toFixed(2), explicacao }, c.rotuloValor)
  }

  // ── Itens: total = bruto + regras − desconto manual (limitado ao valor do item) ──
  const itens: ItemComRegras[] = entrada.itens.map((item, k) => {
    const comRegras = Decimal.max(brutos[k]!.plus(ajustes[k]!), ZERO)
    const desconto = Decimal.min(Decimal.max(dec(item.desconto), ZERO), comRegras)
    // Preço efetivo do produto com as regras (o ajuste todo conta no produto, o lado mais seguro)
    const qc = dec(item.quantidadeCobrada)
    const efetivo = qc.gt(0) ? dec(item.valorProduto).plus(ajustes[k]!).div(qc) : ZERO
    const minimo = dec(item.precoMinimo)
    const abaixoDoMinimo = ajustes[k]!.lt(0) && minimo.gt(0) && dec(item.precoUnitario).gte(minimo) && efetivo.lt(minimo)
    return {
      bruto: brutos[k]!.toFixed(2),
      ajuste: ajustes[k]!.toFixed(2),
      desconto: desconto.toFixed(2),
      total: comRegras.minus(desconto).toFixed(2),
      regras: efeitos[k]!,
      abaixoDoMinimo,
    }
  })
  itens.forEach((i, k) => {
    if (i.abaixoDoMinimo) aprovacoes.push({ regraId: null, motivo: `${rotuloItem(k)}: com as regras, o preço fica abaixo do mínimo do produto (${formatarMoeda(dec(entrada.itens[k]!.precoMinimo).toFixed(2))}).` })
  })

  const subtotal = itens.reduce((s, i) => s.plus(i.total), ZERO)
  let ajusteOrcamento = noOrcamento.acrescimo.minus(noOrcamento.desconto)

  // ── Pedido mínimo: por último, sobre o total sem o frete ──
  if (minimo && subtotalBruto.gt(0)) {
    const semFrete = subtotal.minus(dec(entrada.desconto)).plus(dec(entrada.acrescimo)).plus(ajusteOrcamento)
    const alvo = dec(minimo.acao.valor)
    if (semFrete.lt(alvo)) {
      const extra = minimo.acao.modo === 'completar' ? centavos(alvo.minus(semFrete)) : centavos(dec(minimo.acao.taxa))
      if (extra.gt(0)) {
        ajusteOrcamento = ajusteOrcamento.plus(extra)
        const efeito = minimo.acao.modo === 'completar' ? `completa até ${formatarMoeda(alvo.toFixed(2))}` : `taxa de ${formatarMoeda(extra.toFixed(2))}`
        registrar(
          minimo.regra,
          { nivel: 'orcamento', itens: minimo.itens, efeito, valor: extra.toFixed(2), explicacao: `${minimo.regra.nome} (${efeito}: +${formatarMoeda(extra.toFixed(2))})` },
          formatarMoeda(alvo.toFixed(2)),
        )
      }
    }
  }

  // ── Limite de negociação: o desconto manual sobre o valor já com as regras ──
  const reducaoPreco = entrada.itens.reduce((s, i) => {
    const r = dec(i.precoCatalogo).minus(dec(i.precoUnitario))
    return r.gt(0) ? s.plus(centavos(r.mul(dec(i.quantidadeCobrada)))) : s
  }, ZERO)
  const manual = itens.reduce((s, i) => s.plus(i.desconto), ZERO).plus(Decimal.max(dec(entrada.desconto), ZERO)).plus(reducaoPreco)
  const referencia = itens.reduce((s, i) => s.plus(i.bruto).plus(i.ajuste), ZERO).plus(reducaoPreco).plus(noOrcamento.acrescimo).minus(noOrcamento.desconto)
  const percentualManual = referencia.gt(0) ? manual.div(referencia).mul(CEM).toDecimalPlaces(2) : ZERO
  if (limite !== null && percentualManual.gt(dec(limite))) {
    aprovacoes.push({ regraId: null, motivo: `Desconto manual de ${percentualTexto(percentualManual)}% passa do limite de negociação (${percentualTexto(limite)}%).` })
  }

  const total = subtotal.minus(dec(entrada.desconto)).plus(dec(entrada.acrescimo)).plus(dec(entrada.frete)).plus(ajusteOrcamento)
  // Na ordem das regras (o sort é estável: a mesma regra fica na ordem em que entrou); frases sem repetir
  const ordemRegra = new Map(ativas.map((r, i) => [r.id, i]))
  aplicadas.sort((a, b) => (ordemRegra.get(a.regraId) ?? 0) - (ordemRegra.get(b.regraId) ?? 0))
  const frasesCliente = [...new Set(aplicadas.flatMap((a) => (a.fraseCliente ? [a.fraseCliente] : [])))]

  return {
    itens,
    ajusteOrcamento: ajusteOrcamento.toFixed(2),
    aplicadas,
    ignoradas,
    sugestoes,
    avisos,
    aprovacoes,
    bloqueios,
    frasesCliente,
    limiteNegociacao: limite,
    descontoManualPercentual: percentualManual.toFixed(2),
    subtotal: subtotal.toFixed(2),
    total: total.toFixed(2),
  }
}

// ─── O que fica gravado no orçamento (histórico de qual regra mudou o quê) ───

/** Resumo gravado no orçamento a cada salvamento (JSON `regras`) */
export interface RegrasDoOrcamento {
  /** Quando foi calculado (ISO) */
  em?: string
  aplicadas: RegraAplicada[]
  ignoradas: RegraIgnorada[]
  sugestoes: SugestaoRegra[]
  avisos: { regraId: string; texto: string }[]
  aprovacoes: MotivoLiberacao[]
  bloqueios: MotivoLiberacao[]
  frasesCliente: string[]
  limiteNegociacao: string | null
  descontoManualPercentual: string
  /** Selos por item (na ordem dos itens) */
  itens: EfeitoNoItem[][]
}

export function resumoParaGravar(r: ResultadoRegras, em = new Date()): RegrasDoOrcamento {
  return {
    em: em.toISOString(),
    aplicadas: r.aplicadas,
    ignoradas: r.ignoradas,
    sugestoes: r.sugestoes,
    avisos: r.avisos,
    aprovacoes: r.aprovacoes,
    bloqueios: r.bloqueios,
    frasesCliente: r.frasesCliente,
    limiteNegociacao: r.limiteNegociacao,
    descontoManualPercentual: r.descontoManualPercentual,
    itens: r.itens.map((i) => i.regras),
  }
}

/** JSON do banco → resumo (orçamentos de antes das regras: vazio) */
export function lerRegrasDoOrcamento(json: unknown): RegrasDoOrcamento {
  const j = (json && typeof json === 'object' ? json : {}) as Partial<RegrasDoOrcamento>
  return {
    em: j.em,
    aplicadas: j.aplicadas ?? [],
    ignoradas: j.ignoradas ?? [],
    sugestoes: j.sugestoes ?? [],
    avisos: j.avisos ?? [],
    aprovacoes: j.aprovacoes ?? [],
    bloqueios: j.bloqueios ?? [],
    frasesCliente: j.frasesCliente ?? [],
    limiteNegociacao: j.limiteNegociacao ?? null,
    descontoManualPercentual: j.descontoManualPercentual ?? '0.00',
    itens: j.itens ?? [],
  }
}

/**
 * Para o cliente (PDF, página de aprovação, {{descontos}} da mensagem): as frases das regras; regra com valor e sem
 * frase vira um texto neutro ("Desconto de 5%"), sem o nome interno da regra.
 */
export function textosParaCliente(r: Pick<RegrasDoOrcamento, 'aplicadas' | 'frasesCliente'>): string[] {
  const comFrase = new Set(r.aplicadas.filter((a) => a.fraseCliente).map((a) => a.regraId))
  const neutro = (a: RegraAplicada): string | null => {
    const efeito = a.efeito.replace(/^[−+]/, '')
    if (a.tipo === 'desconto') return `Desconto de ${efeito}`
    if (a.tipo === 'acrescimo') return `Acréscimo de ${efeito}`
    if (a.tipo === 'preco_especial') return a.efeito
    if (a.tipo === 'pedido_minimo') return `Valor mínimo do pedido (${formatarMoeda(Math.abs(Number(a.valor)).toFixed(2))} a mais)`
    return null
  }
  const semFrase = r.aplicadas.filter((a) => !comFrase.has(a.regraId) && Number(a.valor) !== 0).flatMap((a) => neutro(a) ?? [])
  return [...new Set([...r.frasesCliente, ...semFrase])]
}

/**
 * Ajustes das regras no total do orçamento, para o cliente (linhas dos totais no PDF e na página de aprovação): a frase
 * da regra ou o texto neutro, com o valor (negativo = desconto)
 */
export function ajustesDoOrcamentoParaCliente(r: Pick<RegrasDoOrcamento, 'aplicadas'>): { rotulo: string; valor: string }[] {
  return r.aplicadas
    .filter((a) => a.nivel === 'orcamento' && Number(a.valor) !== 0)
    .map((a) => ({ rotulo: textosParaCliente({ aplicadas: [a], frasesCliente: a.fraseCliente ? [a.fraseCliente] : [] })[0] ?? 'Condição comercial', valor: a.valor }))
}

/** Selos de um item para o cliente, sem o nome interno da regra: "Desconto de 5%", "Preço especial R$ 0,30/un" */
export function textosDoItemParaCliente(efeitos: EfeitoNoItem[]): string[] {
  return [
    ...new Set(
      efeitos.map((e) => {
        if (e.efeito.startsWith('Preço especial')) return e.efeito
        const efeito = e.efeito.replace(/^[−+]/, '')
        return Number(e.valor) < 0 ? `Desconto de ${efeito}` : `Acréscimo de ${efeito}`
      }),
    ),
  ]
}

/** Motivos que pedem um gerente (bloqueios primeiro) */
export const motivosDeLiberacao = (r: Pick<RegrasDoOrcamento, 'aprovacoes' | 'bloqueios'>) => [...r.bloqueios, ...r.aprovacoes].map((m) => m.motivo)

// ─── Descrição em português ("Quando… → …") ───

export interface NomesRegra {
  produtos?: Map<string, string> | Record<string, string>
  categorias?: Map<string, string> | Record<string, string>
  clientes?: Map<string, string> | Record<string, string>
}

function nomeDe(lista: NomesRegra[keyof NomesRegra], id: string): string {
  const v = lista instanceof Map ? lista.get(id) : lista?.[id]
  return v ?? 'cadastro removido'
}

/** "Cartões", "Cartões ou Banners", "Cartões, Banners ou Adesivos" */
function ou(lista: string[]): string {
  if (lista.length <= 1) return lista[0] ?? ''
  return `${lista.slice(0, -1).join(', ')} ou ${lista[lista.length - 1]}`
}

const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** As condições em frases curtas ("a categoria for Cartões", "o cliente tiver a etiqueta Revenda") */
export function descreverCondicoes(c: CondicoesRegra, nomes: NomesRegra = {}): string[] {
  const p: string[] = []
  if (temLista(c.produtoIds)) p.push(`o produto for ${ou(c.produtoIds!.map((id) => nomeDe(nomes.produtos, id)))}`)
  if (temLista(c.categoriaIds)) p.push(`a categoria for ${ou(c.categoriaIds!.map((id) => nomeDe(nomes.categorias, id)))}`)
  if (definido(c.quantidadeMin) && definido(c.quantidadeMax)) p.push(`a quantidade do item for de ${quantidadeTexto(c.quantidadeMin)} a ${quantidadeTexto(c.quantidadeMax)}`)
  else if (definido(c.quantidadeMin)) p.push(`a quantidade do item for ${quantidadeTexto(c.quantidadeMin)} ou mais`)
  else if (definido(c.quantidadeMax)) p.push(`a quantidade do item for até ${quantidadeTexto(c.quantidadeMax)}`)
  if (definido(c.valorItemMin)) p.push(`o item valer ${formatarMoeda(c.valorItemMin)} ou mais`)
  if (definido(c.valorItemMax)) p.push(`o item valer até ${formatarMoeda(c.valorItemMax)}`)
  if (definido(c.valorTotalMin)) p.push(`o orçamento somar ${formatarMoeda(c.valorTotalMin)} ou mais`)
  if (definido(c.valorTotalMax)) p.push(`o orçamento somar até ${formatarMoeda(c.valorTotalMax)}`)
  if (temLista(c.clienteIds)) p.push(`o cliente for ${ou(c.clienteIds!.map((id) => nomeDe(nomes.clientes, id)))}`)
  if (temLista(c.etiquetas)) p.push(`o cliente tiver a etiqueta ${ou(c.etiquetas!)}`)
  if (c.pagamento) p.push(c.pagamento === 'a_vista' ? 'o pagamento for à vista (entrada de 100%)' : 'o pagamento for parcelado')
  if (c.prazoMenorQueDias) p.push(`o cliente quiser em menos de ${c.prazoMenorQueDias} ${c.prazoMenorQueDias === 1 ? 'dia útil' : 'dias úteis'}`)
  if (definido(c.periodoInicio) && definido(c.periodoFim)) p.push(`for de ${dataBR(c.periodoInicio)} a ${dataBR(c.periodoFim)}`)
  else if (definido(c.periodoInicio)) p.push(`for a partir de ${dataBR(c.periodoInicio)}`)
  else if (definido(c.periodoFim)) p.push(`for até ${dataBR(c.periodoFim)}`)
  if (temLista(c.diasSemana)) p.push(`o dia for ${ou([...c.diasSemana!].sort().map((d) => DIAS_SEMANA_CURTOS[d]!))}`)
  if (temLista(c.origens)) p.push(`o orçamento vier ${ou(c.origens!.map((o) => `de ${ORIGEM_ORCAMENTO_ROTULOS[o]}`))}`)
  return p
}

/** O "Faça" em português: "10% de desconto no item", "pede aprovação de um gerente" */
export function descreverAcao(a: AcaoRegra, nomes: NomesRegra = {}): string {
  switch (a.tipo) {
    case 'desconto':
    case 'acrescimo': {
      const palavra = a.tipo === 'desconto' ? 'de desconto' : 'de acréscimo'
      const onde = a.nivel === 'item' ? 'no item' : 'no orçamento'
      if (a.faixas?.length) {
        const ordenadas = [...a.faixas].sort((x, y) => dec(x.minimo).cmp(dec(y.minimo)))
        const medida = (m: string) => (a.faixasPor === 'quantidade' ? `${quantidadeTexto(m)}+` : `${formatarMoeda(dec(m).toFixed(2))}+`)
        return `${ordenadas.map((f) => `${medida(f.minimo)}: ${valorDaAcao(a.modo, f.valor)}`).join('; ')} ${palavra} ${onde}`
      }
      return `${valorDaAcao(a.modo, a.valor)} ${palavra} ${a.modo === 'valor' && a.nivel === 'item' ? 'em cada item' : onde}`
    }
    case 'preco_especial':
      return `preço especial de ${formatarMoeda(a.valor)} por unidade de cálculo`
    case 'pedido_minimo':
      return a.modo === 'completar' ? `completa o pedido até o mínimo de ${formatarMoeda(a.valor)}` : `cobra taxa de ${formatarMoeda(a.taxa ?? '0')} abaixo de ${formatarMoeda(a.valor)}`
    case 'sugerir_item':
      return `${a.obrigatorio ? 'exige' : 'sugere'} ${a.texto}${a.produtoId ? ` (${nomeDe(nomes.produtos, a.produtoId)})` : ''}`
    case 'exigir_aprovacao':
      return `pede aprovação de um gerente (${a.motivo})`
    case 'bloquear':
      return `bloqueia o envio (${a.motivo})`
    case 'aviso':
      return `avisa a equipe: “${a.texto}”`
    case 'frase_cliente':
      return `diz ao cliente: “${a.texto}”`
    case 'limite_negociacao':
      return `desconto manual até ${percentualTexto(a.percentual)}% sem gerente`
  }
}

/** "Quando a categoria for Cartões e o cliente tiver a etiqueta Revenda → 10% de desconto no item" */
export function descreverRegra(r: { condicoes: CondicoesRegra; acao: AcaoRegra; combinacao?: CombinacaoRegra }, nomes: NomesRegra = {}): string {
  const cond = descreverCondicoes(r.condicoes, nomes)
  const quando = cond.length ? `Quando ${cond.length > 1 ? `${cond.slice(0, -1).join(', ')} e ${cond[cond.length - 1]}` : cond[0]}` : 'Sempre'
  const extras: string[] = []
  const a = r.acao as { avisoEquipe?: string | null }
  if ((r.acao.tipo === 'desconto' || r.acao.tipo === 'preco_especial') && r.combinacao === 'maior') extras.push('não acumula: vale o maior desconto')
  if (a.avisoEquipe) extras.push(`avisa a equipe: “${a.avisoEquipe}”`)
  return `${quando} → ${descreverAcao(r.acao, nomes)}${extras.length ? ` (${extras.join('; ')})` : ''}`
}

// ─── Modelos prontos ───

export const PRESETS_REGRA_INFO: Record<PresetRegra, { titulo: string; descricao: string }> = {
  desconto_quantidade: { titulo: 'Desconto por quantidade', descricao: 'Faixas: quanto mais peças no item, maior o desconto.' },
  desconto_valor: { titulo: 'Desconto por valor do pedido', descricao: 'Pedidos maiores ganham um desconto no total.' },
  desconto_a_vista: { titulo: 'Desconto à vista / Pix', descricao: 'Entrada de 100% ganha desconto (não acumula: vale o maior).' },
  cliente_especial: { titulo: 'Cliente especial (VIP, revenda)', descricao: 'Clientes com uma etiqueta ganham desconto.' },
  urgencia: { titulo: 'Acréscimo de urgência', descricao: 'Prazo apertado cobra a mais e avisa a produção.' },
  pedido_minimo: { titulo: 'Pedido mínimo', descricao: 'Abaixo do mínimo, completa até o valor ou cobra uma taxa.' },
  limite_negociacao: { titulo: 'Limite de negociação', descricao: 'Desconto manual acima do limite pede um gerente.' },
}

/** A regra preenchida do modelo (o dono confere e ajusta antes de salvar) */
export function regraDoPreset(p: PresetRegra): RegraComercialInput {
  const base = { nome: PRESETS_REGRA_INFO[p].titulo, ativa: true, tipo: p, condicoes: {}, combinacao: 'soma' as const }
  switch (p) {
    case 'desconto_quantidade':
      return {
        ...base,
        acao: { tipo: 'desconto', modo: 'percentual', valor: '5', nivel: 'item', faixasPor: 'quantidade', faixas: [{ minimo: '100', valor: '5' }, { minimo: '500', valor: '10' }], fraseCliente: 'Desconto de {valor} por quantidade' },
      }
    case 'desconto_valor':
      return {
        ...base,
        acao: { tipo: 'desconto', modo: 'percentual', valor: '5', nivel: 'orcamento', faixasPor: 'valor', faixas: [{ minimo: '500', valor: '5' }, { minimo: '1000', valor: '8' }], fraseCliente: 'Desconto de {valor} pelo valor do pedido' },
      }
    case 'desconto_a_vista':
      return { ...base, combinacao: 'maior', condicoes: { pagamento: 'a_vista' }, acao: { tipo: 'desconto', modo: 'percentual', valor: '3', nivel: 'orcamento', fraseCliente: 'Desconto de {valor} para pagamento à vista (Pix)' } }
    case 'cliente_especial':
      return { ...base, nome: 'Cliente revenda', condicoes: { etiquetas: ['Revenda'] }, acao: { tipo: 'desconto', modo: 'percentual', valor: '10', nivel: 'item', fraseCliente: 'Condição especial de revenda: {valor} de desconto' } }
    case 'urgencia':
      return {
        ...base,
        condicoes: { prazoMenorQueDias: 2 },
        acao: { tipo: 'acrescimo', modo: 'percentual', valor: '20', nivel: 'orcamento', avisoEquipe: 'Pedido urgente: confirme a fila da produção antes de prometer o prazo.', fraseCliente: 'Taxa de urgência de {valor}' },
      }
    case 'pedido_minimo':
      return { ...base, acao: { tipo: 'pedido_minimo', valor: '50', modo: 'completar', fraseCliente: 'Pedido mínimo de {valor}' } }
    case 'limite_negociacao':
      return { ...base, acao: { tipo: 'limite_negociacao', percentual: '5' } }
  }
}

/** Ação nova (o editor troca o tipo da ação e começa com estes valores) */
export function acaoPadrao(tipo: TipoAcaoRegra): AcaoRegraForm {
  switch (tipo) {
    case 'desconto':
    case 'acrescimo':
      return { tipo, modo: 'percentual', valor: '5', nivel: 'item', avisoEquipe: null, fraseCliente: null }
    case 'preco_especial':
      return { tipo, valor: '1.00', avisoEquipe: null, fraseCliente: null }
    case 'pedido_minimo':
      return { tipo, valor: '50.00', modo: 'completar', taxa: null, avisoEquipe: null, fraseCliente: null }
    case 'sugerir_item':
      return { tipo, texto: 'oferecer a criação da arte', produtoId: null, obrigatorio: false, avisoEquipe: null, fraseCliente: null }
    case 'exigir_aprovacao':
      return { tipo, motivo: 'confira com o gerente antes de enviar', avisoEquipe: null, fraseCliente: null }
    case 'bloquear':
      return { tipo, motivo: 'não fazemos este pedido sem falar com o gerente', avisoEquipe: null, fraseCliente: null }
    case 'aviso':
      return { tipo, texto: 'Lembre o cliente de mandar a arte em PDF.', fraseCliente: null }
    case 'frase_cliente':
      return { tipo, texto: 'Arte inclusa no valor.' }
    case 'limite_negociacao':
      return { tipo, percentual: '5' }
  }
}

/** Ação como o formulário a edita (mesmos campos da gravada) */
export type AcaoRegraForm = AcaoRegra

/** Ações que somam ou tiram dinheiro (as outras só avisam, sugerem ou pedem um gerente) */
export const acaoMexeNoValor = (t: TipoAcaoRegra) => t === 'desconto' || t === 'acrescimo' || t === 'preco_especial' || t === 'pedido_minimo'
