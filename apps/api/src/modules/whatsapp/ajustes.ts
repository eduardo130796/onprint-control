import { Decimal, dataDoPrazo, formatarDataSimples, formatarMoeda, type OrcamentoInput } from '@onprint/shared'
import { normalizarResposta } from './respostas'

/*
 * Ajustes do orçamento pelo "Você" ("10% de desconto", "tira o 2", "muda os banners para 3", "à vista no Pix",
 * "entrega pra sexta"): a IA só entende o pedido e devolve operações (prompts-ajuste.ts); aqui (puro, testável) o
 * sistema confere cada uma contra o orçamento como está e monta o orçamento novo para o serviço de orçamentos salvar —
 * o mesmo cálculo do editor, com as regras comerciais. Uma operação que não faz sentido não deixa aplicar nada.
 * Também: o orçamento salvo → o formato do editor (para acrescentar itens da 📝 nova sem perder as edições).
 */

type Dec = { toString(): string }

/** Item como o editor manda à API (preço vazio = o do produto; a API recalcula tudo) */
export interface ItemEditavel {
  produtoId: string
  /** Vazio = nome do produto */
  descricao: string
  quantidade: string
  largura: string | null
  altura: string | null
  precoUnitario: string | null
  acabamentoIds: string[]
  desconto: string
  observacao: string
  precisaArte: boolean
}

/** O orçamento salvo no formato do editor (payloadDoForm), sem o que só o sistema decide */
export type OrcamentoEditavel = Required<Pick<OrcamentoInput, 'clienteId' | 'desconto' | 'acrescimo' | 'frete' | 'sinalPercentual' | 'parcelas' | 'intervaloDias' | 'regrasAceitas'>> & {
  vendedorId: string | null
  validade: string
  condicoes: string
  observacoes: string
  observacoesInternas: string
  dataDesejada: string | null
  itens: ItemEditavel[]
}

export interface OrcamentoSalvo {
  clienteId: string
  vendedorId: string | null
  validade: Date
  desconto: Dec
  acrescimo: Dec
  frete: Dec
  sinalPercentual: Dec
  parcelas: number
  intervaloDias: number
  condicoes: string | null
  observacoes: string | null
  observacoesInternas: string | null
  dataDesejada: Date | null
  regrasAceitas: string[]
  itens: { produtoId: string; descricao: string; quantidade: Dec; largura: Dec | null; altura: Dec | null; precoUnitario: Dec; desconto: Dec; observacao: string | null; precisaArte: boolean; acabamentos: { acabamentoId: string }[]; produto: { nome: string } }[]
}

const s = (v: Dec | null | undefined) => (v === null || v === undefined ? null : v.toString())
const dia = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)

/** O orçamento salvo → o que o editor mandaria ao salvar sem mexer em nada (as edições do dono continuam) */
export function editavelDoOrcamento(o: OrcamentoSalvo): OrcamentoEditavel {
  return {
    clienteId: o.clienteId,
    vendedorId: o.vendedorId,
    validade: dia(o.validade)!,
    desconto: s(o.desconto)!,
    acrescimo: s(o.acrescimo)!,
    frete: s(o.frete)!,
    sinalPercentual: s(o.sinalPercentual)!,
    parcelas: o.parcelas,
    intervaloDias: o.intervaloDias,
    condicoes: o.condicoes ?? '',
    observacoes: o.observacoes ?? '',
    observacoesInternas: o.observacoesInternas ?? '',
    dataDesejada: dia(o.dataDesejada),
    regrasAceitas: o.regrasAceitas,
    itens: o.itens.map((i) => ({
      produtoId: i.produtoId,
      descricao: i.descricao === i.produto.nome ? '' : i.descricao,
      quantidade: s(i.quantidade)!,
      largura: s(i.largura),
      altura: s(i.altura),
      precoUnitario: s(i.precoUnitario),
      acabamentoIds: i.acabamentos.map((a) => a.acabamentoId),
      desconto: s(i.desconto)!,
      observacao: i.observacao ?? '',
      precisaArte: i.precisaArte,
    })),
  }
}

/** O editável → o corpo do orçamento (orcamentoSchema valida e o serviço recalcula) */
export function payloadDoEditavel(e: OrcamentoEditavel): OrcamentoInput {
  return { ...e, vendedorId: e.vendedorId ?? undefined, itens: e.itens.map((i) => ({ ...i, largura: i.largura ?? '', altura: i.altura ?? '', precoUnitario: i.precoUnitario ?? '' })) }
}

// ─── Operações do ajuste ───

export const TIPOS_OPERACAO_AJUSTE = ['desconto_percentual', 'desconto_valor', 'total_final', 'acrescentar', 'remover', 'quantidade', 'medidas', 'acabamento', 'pagamento', 'prazo'] as const
export type TipoOperacaoAjuste = (typeof TIPOS_OPERACAO_AJUSTE)[number]

/** Uma operação como a IA devolve (campos que não são do tipo vêm null). `item`: o número mostrado no aviso (1, 2, 3…) */
export interface OperacaoAjuste {
  tipo: TipoOperacaoAjuste
  item: number | null
  /** desconto_percentual (%), desconto_valor e total_final (R$), quantidade, largura/altura (m) */
  numero: number | null
  altura: number | null
  /** acrescentar: o trecho do pedido ("1 wind banner"); acabamento: o nome; prazo: como foi dito ("sexta") */
  texto: string | null
  /** acabamento: true = com, false = sem */
  incluir: boolean | null
  /** pagamento: entrada (%), parcelas do saldo (0 = na retirada/entrega), forma ("Pix") */
  sinalPercentual: number | null
  parcelas: number | null
  forma: string | null
}

/** O orçamento como está, para conferir as operações (itens na ordem do aviso) */
export interface OrcamentoParaAjuste {
  total: string
  desconto: string
  itens: { descricao: string; acabamentosDoProduto: { id: string; nome: string }[] }[]
}

export type ValidacaoAjuste = { ok: true } | { ok: false; motivo: string }

/** Certeza mínima da leitura para aplicar sem perguntar */
export const CONFIANCA_AJUSTE = 0.7

const naoFaz = (motivo: string): ValidacaoAjuste => ({ ok: false, motivo })

/** O acabamento do produto pelo nome ("ilhós" → "Ilhós a cada 50 cm"), sem acento e pelo começo das palavras */
export function acabamentoPeloNome(lista: { id: string; nome: string }[], nome: string): { id: string; nome: string } | null {
  const alvo = normalizarResposta(nome)
  if (!alvo) return null
  const achados = lista.filter((a) => normalizarResposta(a.nome).split(' ').some((p) => p.startsWith(alvo) || alvo.startsWith(p) && p.length >= 4) || normalizarResposta(a.nome).includes(alvo))
  return achados.length === 1 ? achados[0]! : null
}

/** A forma de pagamento cadastrada pelo nome ("pix" → "Pix"); null se não houver ou se mais de uma combinar */
export function formaPeloNome(formas: string[], nome: string): string | null {
  const alvo = normalizarResposta(nome)
  const achadas = formas.filter((f) => normalizarResposta(f) === alvo || normalizarResposta(f).split(' ').includes(alvo))
  return achadas.length === 1 ? achadas[0]! : null
}

/**
 * Confere as operações contra o orçamento: item que existe, número que faz sentido, acabamento do produto, forma de
 * pagamento cadastrada, prazo que vira data. Qualquer uma errada: nada é aplicado (o dono recebe o motivo).
 */
export function validarAjuste(ops: OperacaoAjuste[], o: OrcamentoParaAjuste, ctx: { formas: string[]; hoje: string }): ValidacaoAjuste {
  if (!ops.length) return naoFaz('não achei o que mudar')
  const n = o.itens.length
  const item = (op: OperacaoAjuste) => (op.item !== null && Number.isInteger(op.item) && op.item >= 1 && op.item <= n ? op.item : null)
  const removidos = new Set<number>()
  const descontos = ops.filter((op) => ['desconto_percentual', 'desconto_valor', 'total_final'].includes(op.tipo))
  if (descontos.length > 1) return naoFaz('mais de um desconto no mesmo pedido')
  for (const op of ops) {
    switch (op.tipo) {
      case 'desconto_percentual':
        if (op.numero === null || !(op.numero > 0 && op.numero < 100)) return naoFaz('o percentual do desconto')
        break
      case 'desconto_valor':
        if (op.numero === null || !(op.numero > 0) || op.numero >= Number(o.total) + Number(o.desconto)) return naoFaz('o valor do desconto')
        break
      case 'total_final':
        if (op.numero === null || !(op.numero > 0)) return naoFaz('o valor final')
        if (op.numero >= Number(o.total)) return naoFaz(`o total já é ${formatarMoeda(o.total)} (para cobrar mais, ajuste no sistema)`)
        break
      case 'acrescentar':
        if (!op.texto?.trim()) return naoFaz('o item a acrescentar')
        break
      case 'remover': {
        const i = item(op)
        if (!i) return naoFaz(`o item ${op.item ?? ''} (o orçamento tem ${n})`.replace('  ', ' '))
        removidos.add(i)
        break
      }
      case 'quantidade':
        if (!item(op)) return naoFaz(`o item ${op.item ?? ''} (o orçamento tem ${n})`.replace('  ', ' '))
        if (op.numero === null || !(op.numero > 0) || op.numero > 1_000_000) return naoFaz('a quantidade')
        break
      case 'medidas':
        if (!item(op)) return naoFaz(`o item ${op.item ?? ''} (o orçamento tem ${n})`.replace('  ', ' '))
        if (op.numero === null || !(op.numero > 0 && op.numero <= 100) || (op.altura !== null && !(op.altura > 0 && op.altura <= 100))) return naoFaz('a medida')
        break
      case 'acabamento': {
        const i = item(op)
        if (!i) return naoFaz(`o item ${op.item ?? ''} (o orçamento tem ${n})`.replace('  ', ' '))
        if (!op.texto || !acabamentoPeloNome(o.itens[i - 1]!.acabamentosDoProduto, op.texto)) return naoFaz(`o acabamento “${op.texto ?? ''}” (esse produto não tem)`)
        break
      }
      case 'pagamento':
        if (op.sinalPercentual === null && op.parcelas === null && !op.forma) return naoFaz('a condição de pagamento')
        if (op.sinalPercentual !== null && !(op.sinalPercentual >= 0 && op.sinalPercentual <= 100)) return naoFaz('a entrada')
        if (op.parcelas !== null && !(Number.isInteger(op.parcelas) && op.parcelas >= 0 && op.parcelas <= 24)) return naoFaz('as parcelas')
        if (op.forma && !formaPeloNome(ctx.formas, op.forma)) {
          return naoFaz(`a forma de pagamento “${op.forma}” (cadastradas: ${ctx.formas.length ? ctx.formas.join(', ') : 'nenhuma'})`)
        }
        break
      case 'prazo':
        if (!dataDoPrazo(op.texto, ctx.hoje)) return naoFaz(`o prazo “${op.texto ?? ''}” (diga o dia, ex.: "entrega dia 30")`)
        break
    }
  }
  if (removidos.size >= n && !ops.some((op) => op.tipo === 'acrescentar')) return naoFaz('tirar todos os itens (o orçamento ficaria vazio)')
  return { ok: true }
}

const numeroBr = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 3 })
const dec = (v: number, casas = 3) => new Decimal(v).toDecimalPlaces(casas).toString()

export interface ResultadoItens {
  editavel: OrcamentoEditavel
  /** O que foi feito, para a resposta ("tirei o item 2", "à vista") */
  feito: string[]
}

/**
 * Aplica as operações de item, pagamento e prazo (as já validadas) sobre o orçamento em memória. Os itens são
 * referenciados pelo número do aviso: mudanças primeiro, depois as remoções (o número não muda no meio) e os novos no
 * fim (`novos`: o que a leitura de orçamento achou para os "acrescentar"). Item mudado volta ao preço do produto (a API
 * recalcula com a quantidade e a medida novas). Os descontos ficam para depois (dependem do total novo).
 */
export function aplicarItens(
  base: OrcamentoEditavel,
  ops: OperacaoAjuste[],
  ctx: { itens: OrcamentoParaAjuste['itens']; formas: string[]; hoje: string; novos: { item: ItemEditavel; rotulo: string }[] },
): ResultadoItens {
  const e: OrcamentoEditavel = { ...base, itens: base.itens.map((i) => ({ ...i, acabamentoIds: [...i.acabamentoIds] })) }
  const feito: string[] = []
  // O nome do item sem a quantidade e o valor do aviso ("2× Banner 2,0 × 1,0 m — R$ 320,00" → "Banner 2,0 × 1,0 m")
  const rotulo = (k: number) => (ctx.itens[k - 1]?.descricao ?? `item ${k}`).replace(/^[\d.,]+× /, '').replace(/ — R\$.*$/, '')
  for (const op of ops) {
    const i = op.item ? e.itens[op.item - 1] : undefined
    switch (op.tipo) {
      case 'quantidade':
        i!.quantidade = dec(op.numero!)
        i!.precoUnitario = null
        feito.push(`item ${op.item} (${rotulo(op.item!)}) com ${numeroBr(op.numero!)}`)
        break
      case 'medidas':
        i!.largura = dec(op.numero!)
        if (op.altura !== null) i!.altura = dec(op.altura)
        i!.precoUnitario = null
        feito.push(`item ${op.item}: ${numeroBr(op.numero!)}${op.altura !== null ? ` × ${numeroBr(op.altura)}` : ''} m`)
        break
      case 'acabamento': {
        const a = acabamentoPeloNome(ctx.itens[op.item! - 1]!.acabamentosDoProduto, op.texto!)!
        i!.acabamentoIds = op.incluir === false ? i!.acabamentoIds.filter((id) => id !== a.id) : [...new Set([...i!.acabamentoIds, a.id])]
        feito.push(`item ${op.item}: ${op.incluir === false ? 'sem' : 'com'} ${a.nome}`)
        break
      }
      case 'pagamento': {
        if (op.sinalPercentual !== null) e.sinalPercentual = dec(op.sinalPercentual, 2)
        if (op.parcelas !== null) e.parcelas = op.parcelas
        // À vista (100% de entrada): sem parcelas do saldo
        if (op.sinalPercentual === 100) e.parcelas = 0
        const forma = op.forma ? formaPeloNome(ctx.formas, op.forma) : null
        if (forma) e.condicoes = `Pagamento no ${forma}.`
        feito.push(op.sinalPercentual === 100 ? `à vista${forma ? ` no ${forma}` : ''}` : `pagamento${forma ? ` no ${forma}` : ''}${op.sinalPercentual !== null ? `, entrada de ${numeroBr(op.sinalPercentual)}%` : ''}${op.parcelas !== null ? `, ${op.parcelas === 0 ? 'resto na entrega' : `${op.parcelas}× no saldo`}` : ''}`)
        break
      }
      case 'prazo': {
        const data = dataDoPrazo(op.texto, ctx.hoje)!
        e.dataDesejada = data
        feito.push(`entrega até ${formatarDataSimples(data)}`)
        break
      }
      default:
        break
    }
  }
  const remover = new Set(ops.filter((op) => op.tipo === 'remover').map((op) => op.item!))
  for (const k of [...remover].sort((a, b) => a - b)) feito.push(`tirei o item ${k} (${rotulo(k)})`)
  e.itens = e.itens.filter((_, k) => !remover.has(k + 1))
  for (const n of ctx.novos) {
    e.itens.push(n.item)
    feito.push(`acrescentei ${n.rotulo}`)
  }
  return { editavel: e, feito }
}

/**
 * O desconto do orçamento (o campo "desconto" do editor) para a operação, a partir do total salvo: "10%" é sobre o
 * total antes do desconto; "desconto de 50" fica 50; "faz por 600" é o desconto que leva o total a 600.
 */
export function descontoDaOperacao(op: OperacaoAjuste, atual: { total: string; desconto: string }): { desconto: string; feito: string } | null {
  const total = new Decimal(atual.total)
  const desconto = new Decimal(atual.desconto)
  const semDesconto = total.plus(desconto)
  let novo: Decimal
  let feito: string
  if (op.tipo === 'desconto_percentual') {
    novo = semDesconto.mul(op.numero!).div(100)
    feito = `desconto de ${numeroBr(op.numero!)}%`
  } else if (op.tipo === 'desconto_valor') {
    novo = new Decimal(op.numero!)
    feito = `desconto de ${formatarMoeda(dec(op.numero!, 2))}`
  } else if (op.tipo === 'total_final') {
    novo = desconto.plus(total.minus(op.numero!))
    feito = `total de ${formatarMoeda(dec(op.numero!, 2))}`
  } else return null
  novo = novo.toDecimalPlaces(2)
  if (novo.lt(0) || novo.gte(semDesconto)) return null
  return { desconto: novo.toFixed(2), feito }
}
