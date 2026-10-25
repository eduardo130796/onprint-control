import { useMemo } from 'react'
import { keepPreviousData, useQueries, useQuery } from '@tanstack/react-query'
import {
  Decimal,
  MODO_CALCULO_SUFIXO,
  adicionarDiasUteis,
  aplicarRegras,
  calcularPreco,
  hojeISO,
  normalizarDecimal,
  type ItemComRegras,
  type ItemParaRegras,
  type ModoCalculo,
  type OrigemOrcamento,
  type ProdutoCatalogo,
  type ResultadoPreco,
  type ResultadoRegras,
} from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import type { FormOrcamento, ItemForm } from './formOrcamento'

export interface ItemCalculadoTela {
  produto?: ProdutoCatalogo
  resultado: ResultadoPreco | null
  /** Total do item já com as regras comerciais e o desconto do item */
  total: string
  prazoDias: number
  /** O que as regras fizeram no item (selos "−5% Desconto por quantidade") */
  regras?: ItemComRegras
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

/** Item calculado → o que o motor das regras comerciais precisa (como a API monta em recalcularItens) */
export function itemParaRegras(item: ItemForm, c: ItemCalculadoTela): ItemParaRegras | null {
  const p = c.produto
  const r = c.resultado
  if (!p || !r?.ok) return null
  return {
    produtoId: p.id,
    categoriaId: p.categoriaId,
    descricao: item.descricao.trim() || p.nome,
    quantidade: n(item.quantidade) || '0',
    quantidadeCobrada: r.quantidadeCobrada,
    precoUnitario: n(item.precoUnitario) || p.precoVenda,
    precoCatalogo: p.precoVenda,
    precoMinimo: p.precoMinimo,
    valorProduto: r.valorProduto,
    valorAcabamentos: r.valorAcabamentos,
    desconto: n(item.desconto) || '0',
    unidade: MODO_CALCULO_SUFIXO[p.modoCalculo as ModoCalculo],
  }
}

/** Pagamento do formulário para a condição "à vista / parcelado" (inválido = ainda sem pagamento) */
function pagamentoDoForm(f: FormOrcamento) {
  const sinal = Number(normalizarDecimal(f.sinalPercentual || '0'))
  if (!Number.isFinite(sinal) || sinal < 0 || sinal > 100) return null
  return { sinalPercentual: normalizarDecimal(f.sinalPercentual || '0'), parcelas: Number(f.parcelas || '0') || 0 }
}

/**
 * Regras comerciais ativas e as etiquetas do cliente escolhido (para o motor rodar ao vivo). O orçamento já salvo
 * guarda a origem; o novo é do balcão ou do Assistente.
 */
export function useContextoRegras(clienteId: string | null | undefined) {
  return useQuery({
    queryKey: ['orcamentos', 'regras', clienteId ?? null],
    queryFn: () => orcamentosApi.regras(clienteId),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  })
}

export function useCalculoOrcamento(form: FormOrcamento, areaMinimaM2?: string, opcoes: { origem?: OrigemOrcamento } = {}) {
  const produtos = useProdutosDoCatalogo(form.itens.flatMap((i) => (i.produto ? [i.produto.id] : [])))
  const contexto = useContextoRegras(form.cliente?.id)
  const origem: OrigemOrcamento = opcoes.origem ?? (form.doAssistente ? 'assistente' : 'balcao')
  return useMemo(() => {
    const base = form.itens.map((i) => calcularItem(i, i.produto ? produtos.get(i.produto.id) : undefined, areaMinimaM2))
    // Só os itens prontos (produto e preço válidos) passam pelas regras, como na API
    const validos = base.flatMap((c, k) => {
      const e = itemParaRegras(form.itens[k]!, c)
      return e ? [{ k, e }] : []
    })
    let regras: ResultadoRegras | null = null
    let itens = base
    if (contexto.data) {
      regras = aplicarRegras(
        {
          itens: validos.map((v) => v.e),
          clienteId: form.cliente?.id ?? null,
          etiquetasCliente: contexto.data.etiquetasCliente,
          pagamento: pagamentoDoForm(form),
          dataDesejada: form.dataDesejada || null,
          hoje: hojeISO(),
          origem,
          desconto: n(form.desconto) || '0',
          acrescimo: n(form.acrescimo) || '0',
          frete: n(form.frete) || '0',
        },
        contexto.data.regras,
      )
      const porItem = new Map(validos.map((v, j) => [v.k, regras!.itens[j]!]))
      itens = base.map((c, k) => {
        const r = porItem.get(k)
        return r ? { ...c, total: r.total, regras: r } : c
      })
      // Os índices das regras aplicadas passam a ser os da tela (itens sem produto ficam de fora do motor)
      regras = { ...regras, aplicadas: regras.aplicadas.map((a) => ({ ...a, itens: a.itens.map((j) => validos[j]?.k ?? j) })) }
    }
    const subtotal = itens.reduce((s, i) => s.plus(i.total), new Decimal(0))
    const ajuste = new Decimal(regras?.ajusteOrcamento ?? '0')
    const total = subtotal.minus(n(form.desconto) || '0').plus(n(form.acrescimo) || '0').plus(n(form.frete) || '0').plus(ajuste)
    const prazoDias = Math.max(0, ...itens.map((i) => i.prazoDias))
    return {
      itens,
      produtos,
      subtotal: subtotal.toFixed(2),
      /** Regras comerciais no orçamento (com sinal) */
      ajusteRegras: ajuste.toFixed(2),
      total: total.toFixed(2),
      prazoDias,
      previsaoEntrega: adicionarDiasUteis(hojeISO(), prazoDias),
      temErros: itens.some((i) => i.resultado && !i.resultado.ok),
      regras,
      /** Ainda carregando as regras (os valores podem mudar quando chegarem) */
      carregandoRegras: contexto.isPending,
    }
  }, [form, produtos, areaMinimaM2, contexto.data, contexto.isPending, origem])
}
