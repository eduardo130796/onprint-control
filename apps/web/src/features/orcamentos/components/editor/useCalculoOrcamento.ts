import { useMemo } from 'react'
import { useQueries } from '@tanstack/react-query'
import {
  Decimal,
  adicionarDiasUteis,
  calcularPreco,
  hojeISO,
  normalizarDecimal,
  type ModoCalculo,
  type ProdutoCatalogo,
  type ResultadoPreco,
} from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import type { FormOrcamento, ItemForm } from './formOrcamento'

export interface ItemCalculadoTela {
  produto?: ProdutoCatalogo
  resultado: ResultadoPreco | null
  /** Total do item já com o desconto do item */
  total: string
  prazoDias: number
}

const n = (v: string) => (v.trim() ? normalizarDecimal(v) : '')

export const chaveProdutoCatalogo = (id: string) => ['catalogo-produto', id]

export function useProdutosDoCatalogo(ids: string[]) {
  const consultas = useQueries({
    queries: [...new Set(ids)].map((id) => ({
      queryKey: chaveProdutoCatalogo(id),
      queryFn: () => orcamentosApi.produto(id),
      staleTime: 5 * 60 * 1000,
    })),
  })
  return useMemo(() => new Map(consultas.flatMap((c) => (c.data ? [[c.data.id, c.data] as const] : []))), [consultas])
}

/** Cálculo ao vivo, no navegador, com o mesmo motor da API (@onprint/shared/pricing). */
export function calcularItem(item: ItemForm, produto: ProdutoCatalogo | undefined, areaMinimaM2?: string): ItemCalculadoTela {
  if (!produto) return { resultado: null, total: '0.00', prazoDias: 0 }
  const acabs = produto.acabamentos.filter((a) => item.acabamentoIds.includes(a.acabamentoId) || a.obrigatorio)
  const resultado = calcularPreco({
    modoCalculo: produto.modoCalculo as ModoCalculo,
    precoUnitario: n(item.precoUnitario) || produto.precoVenda,
    custoUnitario: produto.custo,
    precoMinimo: produto.precoMinimo,
    quantidade: n(item.quantidade) || '0',
    largura: n(item.largura) || null,
    altura: n(item.altura) || null,
    areaMinimaM2,
    medidasMaximas: { largura: produto.larguraMaxima, altura: produto.alturaMaxima },
    acabamentos: acabs.map((a) => ({ id: a.acabamentoId, nome: a.acabamento.nome, tipoCobranca: a.acabamento.tipoCobranca, valor: a.acabamento.valor, custo: a.acabamento.custo })),
  })
  const bruto = new Decimal(resultado.total)
  const desconto = Decimal.min(new Decimal(n(item.desconto) || '0'), bruto)
  return {
    produto,
    resultado,
    total: bruto.minus(desconto).toFixed(2),
    prazoDias: produto.prazoProducaoDias + Math.max(0, ...acabs.map((a) => a.acabamento.prazoAdicionalDias)),
  }
}

export function useCalculoOrcamento(form: FormOrcamento, areaMinimaM2?: string) {
  const produtos = useProdutosDoCatalogo(form.itens.flatMap((i) => (i.produto ? [i.produto.id] : [])))
  return useMemo(() => {
    const itens = form.itens.map((i) => calcularItem(i, i.produto ? produtos.get(i.produto.id) : undefined, areaMinimaM2))
    const subtotal = itens.reduce((s, i) => s.plus(i.total), new Decimal(0))
    const total = subtotal.minus(n(form.desconto) || '0').plus(n(form.acrescimo) || '0').plus(n(form.frete) || '0')
    const prazoDias = Math.max(0, ...itens.map((i) => i.prazoDias))
    return {
      itens,
      produtos,
      subtotal: subtotal.toFixed(2),
      total: total.toFixed(2),
      prazoDias,
      previsaoEntrega: adicionarDiasUteis(hojeISO(), prazoDias),
      temErros: itens.some((i) => i.resultado && !i.resultado.ok),
    }
  }, [form, produtos, areaMinimaM2])
}
