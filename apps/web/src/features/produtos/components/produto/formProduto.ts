import type { UseFormReturn } from 'react-hook-form'
import type { Produto, ProdutoInput, produtoSchema } from '@onprint/shared'
import type { z } from 'zod'
import { decimalParaInput } from '@/lib/mascaras'

export type ProdutoSaida = z.output<typeof produtoSchema>
export type FormProduto = UseFormReturn<ProdutoInput, unknown, ProdutoSaida>

const medida = (v: string | null | undefined) => (v ? decimalParaInput(v, 3) : '')

/** Valores do formulário a partir do produto da API (ou padrões de um produto novo). */
export function valoresProduto(p?: Produto): ProdutoInput {
  return {
    codigo: p?.codigo ?? '',
    nome: p?.nome ?? '',
    descricao: p?.descricao ?? '',
    categoriaId: p?.categoriaId ?? '',
    unidadeMedidaId: p?.unidadeMedidaId ?? '',
    tipo: p?.tipo ?? 'produto',
    modoCalculo: p?.modoCalculo ?? 'unidade',
    precoVenda: decimalParaInput(p?.precoVenda ?? 0),
    custo: decimalParaInput(p?.custo ?? 0),
    margem: decimalParaInput(p?.margem ?? 0),
    precoMinimo: p?.precoMinimo ? decimalParaInput(p.precoMinimo) : '',
    larguraPadrao: medida(p?.larguraPadrao),
    alturaPadrao: medida(p?.alturaPadrao),
    larguraMaxima: medida(p?.larguraMaxima),
    alturaMaxima: medida(p?.alturaMaxima),
    prazoProducaoDias: String(p?.prazoProducaoDias ?? 0),
    controlaEstoque: p?.controlaEstoque ?? false,
    estoqueMinimo: decimalParaInput(p?.estoqueMinimo ?? 0, 3),
    ativo: p?.ativo ?? true,
  }
}

/** Em qual aba está cada campo — para levar o usuário ao erro de validação. */
export const ABA_DO_CAMPO: Record<string, string> = {
  codigo: 'geral',
  nome: 'geral',
  descricao: 'geral',
  categoriaId: 'geral',
  unidadeMedidaId: 'geral',
  tipo: 'geral',
  prazoProducaoDias: 'geral',
  modoCalculo: 'preco',
  precoVenda: 'preco',
  custo: 'preco',
  margem: 'preco',
  precoMinimo: 'preco',
  larguraPadrao: 'preco',
  alturaPadrao: 'preco',
  larguraMaxima: 'preco',
  alturaMaxima: 'preco',
  controlaEstoque: 'estoque',
  estoqueMinimo: 'estoque',
}
