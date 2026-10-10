import type { OrcamentoDetalhe, OrcamentoInput, ProdutoCatalogo, SolicitacaoItem } from '@onprint/shared'
import type { OpcaoBusca } from '@/components/shared/SearchSelect'
import { decimalParaInput } from '@/lib/mascaras'

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
}

export interface FormOrcamento {
  cliente: OpcaoBusca | null
  validade: string
  desconto: string
  acrescimo: string
  frete: string
  condicoes: string
  observacoes: string
  observacoesInternas: string
  itens: ItemForm[]
}

let contador = 0
export const novaChave = () => `item-${Date.now()}-${++contador}`

const medida = (v: string | null) => (v ? decimalParaInput(v, 3).replace(/,?0+$/, '') : '')
const quantidade = (v: string) => decimalParaInput(v, 3).replace(/,?0+$/, '')

export function itemVazio(): ItemForm {
  return { chave: novaChave(), produto: null, descricao: '', quantidade: '1', largura: '', altura: '', precoUnitario: '', acabamentoIds: [], desconto: '0,00', observacao: '' }
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

export function formDoOrcamento(o?: OrcamentoDetalhe, cliente?: OpcaoBusca | null, itensIniciais?: ItemForm[], observacoesInternas?: string): FormOrcamento {
  if (!o) {
    return {
      cliente: cliente ?? null,
      validade: '',
      desconto: '0,00',
      acrescimo: '0,00',
      frete: '0,00',
      condicoes: '',
      observacoes: '',
      observacoesInternas: observacoesInternas ?? '',
      itens: itensIniciais?.length ? itensIniciais : [itemVazio()],
    }
  }
  return {
    cliente: { id: o.cliente.id, rotulo: o.cliente.nome },
    validade: o.validade.slice(0, 10),
    desconto: decimalParaInput(o.desconto),
    acrescimo: decimalParaInput(o.acrescimo),
    frete: decimalParaInput(o.frete),
    condicoes: o.condicoes ?? '',
    observacoes: o.observacoes ?? '',
    observacoesInternas: o.observacoesInternas ?? '',
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
    condicoes: f.condicoes,
    observacoes: f.observacoes,
    observacoesInternas: f.observacoesInternas,
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
    })),
  }
}
