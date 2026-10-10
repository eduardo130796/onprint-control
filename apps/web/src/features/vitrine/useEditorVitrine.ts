import { useId } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
import { produtoVitrineSchema, type ProdutoVitrineInput, type ProdutoVitrineResumo } from '@onprint/shared'
import { vitrineApi } from '@/api/vitrine'
import { useAtualizarVitrine } from './hooks'

type Saida = z.output<typeof produtoVitrineSchema>

function valores(p: ProdutoVitrineResumo): ProdutoVitrineInput {
  return {
    publicado: p.publicado,
    destaque: p.destaque,
    nomePublico: p.nomePublico ?? '',
    descricaoPublica: p.descricaoPublica ?? '',
    modoPreco: p.modoPreco,
    slug: p.slug ?? '',
    ordem: p.ordem,
  }
}

/**
 * Estado do editor do produto na vitrine. Fica fora do componente de campos para o botão "Salvar" poder morar
 * no rodapé do painel lateral (botão com `form={idFormulario}`) ou embaixo da aba do cadastro.
 */
export function useEditorVitrine(produto: ProdutoVitrineResumo) {
  const idFormulario = useId()
  const atualizar = useAtualizarVitrine()
  const form = useForm<ProdutoVitrineInput, unknown, Saida>({ resolver: zodResolver(produtoVitrineSchema), defaultValues: valores(produto) })
  const salvar = useMutation({ mutationFn: (d: Saida) => vitrineApi.salvarProduto(produto.id, d), onSuccess: atualizar })
  const onSubmit = form.handleSubmit(
    async (dados) => {
      try {
        const salvo = await salvar.mutateAsync(dados)
        // A API pode ter gerado o endereço (slug) a partir do nome
        form.reset(salvo ? valores(salvo) : dados)
        toast.success(dados.publicado ? 'Produto salvo e publicado na vitrine.' : 'Produto salvo.')
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
    () => toast.error('Verifique os campos destacados.'),
  )
  return { produto, form, salvar, onSubmit, idFormulario }
}
export type EditorVitrine = ReturnType<typeof useEditorVitrine>
