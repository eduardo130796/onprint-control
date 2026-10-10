import type {
  ImagemProdutoVitrine,
  ProdutoVitrineInput,
  ProdutoVitrineResumo,
  ProdutosVitrineQuery,
  VitrineConfig,
  VitrineConfigInput,
} from '@onprint/shared'
import { http, qs, upload } from './http'

/** Vitrine online (área logada): configuração do site, banners e produtos publicados (ver docs/VITRINE.md §3). */
export const vitrineApi = {
  config: () => http<VitrineConfig>('/vitrine/config'),
  salvarConfig: (dados: VitrineConfigInput) => http<VitrineConfig>('/vitrine/config', { method: 'PUT', body: dados }),

  // Banners (até MAX_BANNERS_VITRINE), identificados pelo arquivo
  enviarBanner: (arquivo: File, aoProgredir?: (pct: number) => void) => upload<unknown>('/vitrine/banners', arquivo, aoProgredir),
  removerBanner: (arquivoId: string) => http<void>(`/vitrine/banners/${arquivoId}`, { method: 'DELETE' }),
  ordenarBanners: (ids: string[]) => http<unknown>('/vitrine/banners/ordem', { method: 'PUT', body: { ids } }),

  produtos: (q: ProdutosVitrineQuery = {}) => http<ProdutoVitrineResumo[]>(`/vitrine/produtos${qs(q)}`),
  salvarProduto: (produtoId: string, dados: ProdutoVitrineInput) =>
    http<ProdutoVitrineResumo>(`/produtos/${produtoId}/vitrine`, { method: 'PATCH', body: dados }),

  // Galeria do produto (a primeira imagem é a capa)
  enviarImagem: (produtoId: string, arquivo: File, aoProgredir?: (pct: number) => void) =>
    upload<ImagemProdutoVitrine>(`/produtos/${produtoId}/imagens`, arquivo, aoProgredir),
  removerImagem: (produtoId: string, imagemId: string) => http<void>(`/produtos/${produtoId}/imagens/${imagemId}`, { method: 'DELETE' }),
  ordenarImagens: (produtoId: string, ids: string[]) =>
    http<unknown>(`/produtos/${produtoId}/imagens/ordem`, { method: 'PUT', body: { ids } }),
}

/** Chaves do React Query da vitrine */
export const CHAVE_VITRINE_CONFIG = ['vitrine-config']
export const CHAVE_VITRINE_PRODUTOS = 'vitrine-produtos'
