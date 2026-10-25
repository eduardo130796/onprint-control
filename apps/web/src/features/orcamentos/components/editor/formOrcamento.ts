import {
  nomeCliente,
  normalizarDecimal,
  resumoCondicoesPagamento,
  type EmpresaConfig,
  type ItemOrcamentoSugerido,
  type OrcamentoDetalhe,
  type OrcamentoInput,
  type ProdutoCatalogo,
  type SolicitacaoItem,
} from '@onprint/shared'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { decimalParaCampo, decimalParaInput } from '@/lib/mascaras'

export interface ItemForm {
  /** Chave estável da linha na tela */
  chave: string
  produto: OpcaoBusca | null
  descricao: string
  quantidade: string
  largura: string
  altura: string
  /** Vazio = preço de venda do produto */
  precoUnitario: string
  acabamentoIds: string[]
  desconto: string
  observacao: string
  /** O item espera a arte antes de produzir (padrão do produto ao escolher; vai para o pedido) */
  precisaArte: boolean
  /** Montado pelo Assistente GrafyGo: mostra o selo até a pessoa mexer no item (não vai para a API) */
  sugerido?: boolean
}

export interface FormOrcamento {
  cliente: OpcaoBusca | null
  validade: string
  desconto: string
  acrescimo: string
  frete: string
  /** Pagamento: entrada (%), parcelas do saldo (0 = restante na retirada/entrega) e intervalo em dias */
  sinalPercentual: string
  parcelas: string
  intervaloDias: string
  /** Observações de pagamento (linha livre opcional) */
  condicoes: string
  observacoes: string
  observacoesInternas: string
  /** Data em que o cliente quer o pedido (AAAA-MM-DD; vazio = não disse): regras comerciais de prazo/urgência */
  dataDesejada: string
  /** Descontos sugeridos pelas regras que o vendedor aplicou (ids das regras; vão para a API e valem ao recalcular) */
  regrasAceitas: string[]
  /** Itens montados pelo Assistente GrafyGo (só no orçamento novo: a origem vira "assistente") */
  doAssistente?: boolean
  itens: ItemForm[]
}

let contador = 0
export const novaChave = () => `item-${Date.now()}-${++contador}`

// Sem separador de milhar: "1.000" (sem vírgula) seria lido como 1 ao recalcular e ao salvar
const medida = (v: string | null) => decimalParaCampo(v, 3)
const quantidade = (v: string) => decimalParaCampo(v, 3)
const percentual = (v: string | number | null | undefined) => decimalParaCampo(v, 2)

/** Padrões da empresa para um orçamento novo (Configurações → Empresa) */
export type PadroesOrcamento = Pick<EmpresaConfig, 'sinalPercentual' | 'parcelasPadrao' | 'intervaloDiasPadrao' | 'condicoesPadrao'>

/**
 * Resumo do pagamento ao vivo (o mesmo texto da mensagem, do PDF e da página de aprovação);
 * null enquanto os campos não formam um plano válido.
 */
export function resumoPagamentoDoForm(f: Pick<FormOrcamento, 'sinalPercentual' | 'parcelas' | 'intervaloDias'>, total: string): string | null {
  const sinal = Number(normalizarDecimal(f.sinalPercentual || '0'))
  const parcelas = Number(f.parcelas || '0')
  const intervalo = Number(f.intervaloDias)
  if (!Number.isFinite(sinal) || sinal < 0 || sinal > 100) return null
  if (!Number.isInteger(parcelas) || parcelas < 0 || parcelas > 24) return null
  if (sinal < 100 && parcelas > 0 && (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 120)) return null
  return resumoCondicoesPagamento({ total, sinalPercentual: normalizarDecimal(f.sinalPercentual || '0'), parcelas, intervaloDias: intervalo || 30 })
}

export function itemVazio(): ItemForm {
  return { chave: novaChave(), produto: null, descricao: '', quantidade: '1', largura: '', altura: '', precoUnitario: '', acabamentoIds: [], desconto: '0,00', observacao: '', precisaArte: false }
}

/** Ao escolher o produto: medidas padrão e acabamentos que "vêm marcados". */
export function itemComProduto(item: ItemForm, produto: ProdutoCatalogo, opcao: OpcaoBusca): ItemForm {
  return {
    ...item,
    produto: opcao,
    descricao: '',
    quantidade: produto.modoCalculo === 'milheiro' ? '1000' : item.quantidade || '1',
    largura: medida(produto.larguraPadrao),
    altura: medida(produto.alturaPadrao),
    precoUnitario: '',
    acabamentoIds: produto.acabamentos.filter((a) => a.padrao || a.obrigatorio).map((a) => a.acabamentoId),
    // A decisão é do orçamento; o produto só sugere
    precisaArte: produto.precisaArte,
  }
}

/**
 * Itens do pedido do site já no orçamento: produto, quantidade, medidas, acabamentos (os obrigatórios do produto
 * sempre entram; os escolhidos só se ainda forem do produto) e observação. Preço = o do produto (a API recalcula).
 * Itens cujo produto não existe mais ficam de fora (`ignorados`), para a pessoa conferir na solicitação.
 */
export function itensDaSolicitacao(itens: SolicitacaoItem[], produtos: ProdutoCatalogo[]): { itens: ItemForm[]; ignorados: number } {
  const porId = new Map(produtos.map((p) => [p.id, p]))
  const resultado: ItemForm[] = []
  for (const i of itens) {
    const produto = i.produtoId ? porId.get(i.produtoId) : undefined
    if (!produto) continue
    const base = itemComProduto(itemVazio(), produto, { id: produto.id, rotulo: produto.nome, detalhe: produto.codigo })
    const doProduto = new Set(produto.acabamentos.map((a) => a.acabamentoId))
    const obrigatorios = produto.acabamentos.filter((a) => a.obrigatorio).map((a) => a.acabamentoId)
    const escolhidos = i.acabamentos.map((a) => a.id).filter((id) => doProduto.has(id))
    resultado.push({
      ...base,
      quantidade: String(i.quantidade),
      largura: medida(i.largura) || base.largura,
      altura: medida(i.altura) || base.altura,
      acabamentoIds: [...new Set([...obrigatorios, ...escolhidos])],
      observacao: i.observacao ?? '',
    })
  }
  return { itens: resultado, ignorados: itens.length - resultado.length }
}

/**
 * Item que o Assistente montou (e a pessoa manteve) → linha do formulário, com o selo "sugerido". Quantidade e medidas
 * pelo decimalParaCampo (sem separador de milhar: 1000 continua 1000). Preço vazio = o do produto (a API recalcula).
 */
export function itemDoAssistente(s: ItemOrcamentoSugerido): ItemForm | null {
  if (!s.produto) return null
  return {
    chave: novaChave(),
    produto: { id: s.produto.id, rotulo: s.produto.nome, detalhe: s.produto.codigo },
    descricao: '',
    quantidade: quantidade(s.quantidade),
    largura: medida(s.largura),
    altura: medida(s.altura),
    precoUnitario: '',
    acabamentoIds: s.acabamentos.map((a) => a.id),
    desconto: '0,00',
    observacao: s.observacao ?? '',
    precisaArte: s.produto.precisaArte,
    sugerido: true,
  }
}

/** Itens novos no fim do orçamento, sem perder os que já estão (só a linha vazia, sem produto, sai) */
export function juntarItens(atuais: ItemForm[], novos: ItemForm[]): ItemForm[] {
  const vazia = (i: ItemForm) => !i.produto && !i.descricao.trim() && !i.observacao.trim()
  const mantidos = atuais.filter((i) => !vazia(i))
  return [...mantidos, ...novos].length ? [...mantidos, ...novos] : [itemVazio()]
}

/** Prazo, observações e o que não virou item vão para as observações internas (a equipe confere com o cliente) */
export function notaDoAssistente(r: { prazoDesejado: string | null; observacoes: string | null; naoIdentificados: string[]; sugestoes?: string[] }): string | null {
  const partes = [
    // Manual do atendente: o que oferecer ao cliente (só lembrete; nada entra sozinho no orçamento)
    r.sugestoes?.length ? `oferecer ao cliente: ${r.sugestoes.join('; ')}` : null,
    r.prazoDesejado ? `prazo pedido pelo cliente: ${r.prazoDesejado}` : null,
    r.observacoes,
    r.naoIdentificados.length ? `não entendido: ${r.naoIdentificados.join('; ')}` : null,
  ].filter(Boolean)
  return partes.length ? `Pedido lido pelo Assistente GrafyGo — ${partes.join(' · ')}` : null
}

export function formDoOrcamento(
  o?: OrcamentoDetalhe,
  cliente?: OpcaoBusca | null,
  itensIniciais?: ItemForm[],
  observacoesInternas?: string,
  padroes?: PadroesOrcamento | null,
): FormOrcamento {
  if (!o) {
    return {
      cliente: cliente ?? null,
      validade: '',
      desconto: '0,00',
      acrescimo: '0,00',
      frete: '0,00',
      // Pagamento já com os padrões da empresa (o vendedor ajusta por orçamento)
      sinalPercentual: percentual(padroes?.sinalPercentual ?? 50),
      parcelas: String(padroes?.parcelasPadrao ?? 1),
      intervaloDias: String(padroes?.intervaloDiasPadrao ?? 30),
      condicoes: padroes?.condicoesPadrao ?? '',
      observacoes: '',
      observacoesInternas: observacoesInternas ?? '',
      dataDesejada: '',
      regrasAceitas: [],
      itens: itensIniciais?.length ? itensIniciais : [itemVazio()],
    }
  }
  return {
    cliente: { id: o.cliente.id, rotulo: nomeCliente(o.cliente) },
    validade: o.validade.slice(0, 10),
    desconto: decimalParaInput(o.desconto),
    acrescimo: decimalParaInput(o.acrescimo),
    frete: decimalParaInput(o.frete),
    sinalPercentual: percentual(o.sinalPercentual),
    parcelas: String(o.parcelas),
    intervaloDias: String(o.intervaloDias),
    condicoes: o.condicoes ?? '',
    observacoes: o.observacoes ?? '',
    observacoesInternas: o.observacoesInternas ?? '',
    dataDesejada: o.dataDesejada?.slice(0, 10) ?? '',
    regrasAceitas: o.regrasAceitas ?? [],
    itens: o.itens.map((i) => ({
      chave: i.id,
      produto: { id: i.produtoId, rotulo: i.produto.nome, detalhe: i.produto.codigo },
      descricao: i.descricao === i.produto.nome ? '' : i.descricao,
      quantidade: quantidade(i.quantidade),
      largura: medida(i.largura),
      altura: medida(i.altura),
      precoUnitario: decimalParaInput(i.precoUnitario),
      acabamentoIds: i.acabamentos.map((a) => a.acabamentoId),
      desconto: decimalParaInput(i.desconto),
      observacao: i.observacao ?? '',
      precisaArte: i.precisaArte,
    })),
  }
}

/** Corpo enviado à API (ela valida com o schema compartilhado e recalcula tudo). */
export function payloadDoForm(f: FormOrcamento, solicitacaoId?: string | null): OrcamentoInput {
  return {
    clienteId: f.cliente?.id ?? '',
    solicitacaoId: solicitacaoId ?? null,
    validade: f.validade || null,
    desconto: f.desconto,
    acrescimo: f.acrescimo,
    frete: f.frete,
    sinalPercentual: f.sinalPercentual,
    parcelas: f.parcelas,
    intervaloDias: f.intervaloDias,
    condicoes: f.condicoes,
    observacoes: f.observacoes,
    observacoesInternas: f.observacoesInternas,
    dataDesejada: f.dataDesejada || null,
    regrasAceitas: f.regrasAceitas,
    ...(f.doAssistente ? { origem: 'assistente' as const } : {}),
    itens: f.itens.map((i) => ({
      produtoId: i.produto?.id ?? '',
      descricao: i.descricao,
      quantidade: i.quantidade,
      largura: i.largura,
      altura: i.altura,
      precoUnitario: i.precoUnitario,
      acabamentoIds: i.acabamentoIds,
      desconto: i.desconto,
      observacao: i.observacao,
      precisaArte: i.precisaArte,
    })),
  }
}
