import { useMemo } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { orcamentoItemSchema, type AnaliseLucro, type OrcamentoItemInput } from '@onprint/shared'
import { orcamentosApi, type OrcamentoComAnalise } from '@/api/comercial'
import { useDebounce } from '@/hooks/useDebounce'
import { payloadDoForm, type FormOrcamento } from './formOrcamento'
import type { ItemCalculadoTela } from './useCalculoOrcamento'

export interface AnaliseTela {
  /** Análise por chave do item na tela */
  itens: Map<string, AnaliseLucro>
  total: AnaliseLucro | null
  /** A tela mudou e a análise nova ainda não chegou (esmaece, sem piscar) */
  desatualizado: boolean
}

/**
 * O que vai para a análise: os itens com produto escolhido, válidos e sem erro de cálculo (com a chave de cada
 * um na tela) e o desconto/acréscimo do cabeçalho (o lucro do total considera os dois; o frete fica de fora).
 */
export function itensAnalisaveis(form: FormOrcamento, calculos: ItemCalculadoTela[]): { chaves: string[]; itens: OrcamentoItemInput[]; desconto: string; acrescimo: string } {
  const completo = payloadDoForm(form)
  const payload = completo.itens
  const chaves: string[] = []
  const itens: OrcamentoItemInput[] = []
  form.itens.forEach((item, i) => {
    const corpo = payload[i]!
    if (!item.produto || calculos[i]?.resultado?.ok !== true || !orcamentoItemSchema.safeParse(corpo).success) return
    chaves.push(item.chave)
    itens.push(corpo)
  })
  const valor = (v: unknown) => (typeof v === 'string' && v.trim() ? v : '0')
  return { chaves, itens, desconto: valor(completo.desconto), acrescimo: valor(completo.acrescimo) }
}

/**
 * Semáforo do lucro no editor: com o orçamento salvo e sem alterações, usa a análise que veio no GET;
 * mudou algo (e pode editar), pede `POST /orcamentos/analisar` 600 ms depois da última alteração. A resposta
 * de uma versão antiga nunca sobrescreve a atual (a consulta é pela versão dos itens) e, enquanto a nova
 * não chega, a anterior continua na tela, esmaecida.
 */
export function useAnaliseOrcamento(form: FormOrcamento, calculos: ItemCalculadoTela[], opcoes: { orcamento?: OrcamentoComAnalise; alterado: boolean; podeAnalisar: boolean }): AnaliseTela {
  const { orcamento, alterado, podeAnalisar } = opcoes
  const alvo = useMemo(() => itensAnalisaveis(form, calculos), [form, calculos])
  const chaveAtual = useMemo(() => JSON.stringify(alvo), [alvo])
  const chaveAtrasada = useDebounce(chaveAtual, 600)
  const usarSalvo = Boolean(orcamento) && !alterado
  // A versão "atrasada" pode ser de antes de escolher o produto (sem itens): não manda nada
  const atrasadaTemItens = useMemo(() => (JSON.parse(chaveAtrasada) as typeof alvo).itens.length > 0, [chaveAtrasada])
  const consulta = useQuery({
    queryKey: ['orcamentos', 'analisar', chaveAtrasada],
    queryFn: async ({ signal }) => {
      const { chaves, ...corpo } = JSON.parse(chaveAtrasada) as typeof alvo
      const r = await orcamentosApi.analisar(corpo, signal)
      return { chaves, ...r }
    },
    enabled: podeAnalisar && !usarSalvo && alvo.itens.length > 0 && atrasadaTemItens,
    placeholderData: keepPreviousData,
    staleTime: 60_000,
    retry: false,
  })

  return useMemo<AnaliseTela>(() => {
    if (usarSalvo && orcamento) {
      const itens = new Map<string, AnaliseLucro>()
      for (const i of orcamento.itens) if (i.analise) itens.set(i.id, i.analise)
      return { itens, total: orcamento.analise ?? null, desatualizado: false }
    }
    const d = consulta.data
    if (!d || alvo.itens.length === 0) return { itens: new Map(), total: null, desatualizado: false }
    const itens = new Map<string, AnaliseLucro>()
    d.chaves.forEach((chave, i) => {
      const a = d.itens[i]
      if (a) itens.set(chave, a)
    })
    return { itens, total: d.total, desatualizado: chaveAtrasada !== chaveAtual || consulta.isPlaceholderData }
  }, [usarSalvo, orcamento, consulta.data, consulta.isPlaceholderData, alvo.itens.length, chaveAtrasada, chaveAtual])
}
