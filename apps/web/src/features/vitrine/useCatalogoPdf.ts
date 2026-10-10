import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CHAVE_VITRINE_CONFIG, CHAVE_VITRINE_PRODUTOS, vitrineApi } from '@/api/vitrine'
import { empresaApi } from '@/api/configuracoes'
import { CHAVE_EMPRESA } from '@/features/configuracoes/hooks'
import { baixarBlob, compartilharArquivo } from './compartilhar'

/**
 * Vitrine → Produtos → "Catálogo em PDF": produtos publicados por categoria, com a capa da loja.
 * O gerador (e a biblioteca de PDF) só é baixado na primeira vez.
 */
export function useCatalogoPdf() {
  const queryClient = useQueryClient()
  const [gerando, setGerando] = useState<'baixar' | 'compartilhar' | null>(null)

  async function gerar(modo: 'baixar' | 'compartilhar') {
    setGerando(modo)
    try {
      const [g, produtos, config, empresa] = await Promise.all([
        import('./catalogo/gerarCatalogo'),
        queryClient.fetchQuery({ queryKey: [CHAVE_VITRINE_PRODUTOS, { publicado: 'true' }], queryFn: () => vitrineApi.produtos({ publicado: 'true' }), staleTime: 60_000 }),
        queryClient.fetchQuery({ queryKey: CHAVE_VITRINE_CONFIG, queryFn: vitrineApi.config, staleTime: 60_000 }),
        queryClient.fetchQuery({ queryKey: CHAVE_EMPRESA, queryFn: empresaApi.obter, staleTime: 5 * 60 * 1000 }),
      ])
      const { blob, nome } = await g.pdfCatalogo(produtos, config, empresa)
      if (modo === 'compartilhar') {
        const r = await compartilharArquivo(blob, nome, `Catálogo — ${config.titulo || empresa.nomeFantasia || empresa.razaoSocial}`)
        if (r === 'baixado') toast.success('Catálogo baixado.')
      } else {
        baixarBlob(blob, nome)
        toast.success('Catálogo baixado.')
      }
    } catch (e) {
      toast.error(`Não foi possível gerar o catálogo: ${(e as Error).message}`)
    } finally {
      setGerando(null)
    }
  }

  return { gerando, gerar }
}
