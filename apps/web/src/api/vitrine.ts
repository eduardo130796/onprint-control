import type {
  CatalogoPublicado,
  DisponibilidadeLinkVitrine,
  ImagemProdutoVitrine,
  LinkVitrine,
  ProdutoVitrineInput,
  ProdutoVitrineResumo,
  ProdutosVitrineQuery,
  VerificacaoDominio,
  VitrineConfig,
  VitrineConfigInput,
} from '@onprint/shared'
import { http, qs, upload } from './http'

/** Vitrine online (área logada): configuração do site, banners e produtos publicados (ver docs/VITRINE.md §3). */
export const vitrineApi = {
  config: () => http<VitrineConfig>('/vitrine/config'),
  salvarConfig: (dados: VitrineConfigInput) => http<VitrineConfig>('/vitrine/config', { method: 'PUT', body: dados }),
  /** Domínio próprio (null tira); devolve a configuração com o que apontar no DNS */
  salvarDominio: (dominio: string | null) => http<VitrineConfig>('/vitrine/dominio', { method: 'PUT', body: { dominio } }),
  verificarDominio: () => http<VerificacaoDominio>('/vitrine/dominio/verificar', { method: 'POST' }),
  /** Endereço da vitrine ({slug}.grafygo.com.br): trocar mantém os links antigos funcionando */
  linkVitrine: () => http<LinkVitrine>('/empresa/link-vitrine'),
  linkDisponivel: (slug: string) => http<DisponibilidadeLinkVitrine>(`/empresa/link-vitrine/disponivel${qs({ slug })}`),
  salvarLinkVitrine: (slug: string) => http<LinkVitrine>('/empresa/link-vitrine', { method: 'PUT', body: { slug } }),

  // Banners (até MAX_BANNERS_VITRINE), identificados pelo arquivo
  enviarBanner: (arquivo: File, aoProgredir?: (pct: number) => void) => upload<unknown>('/vitrine/banners', arquivo, aoProgredir),
  /** Guarda o PDF do catálogo e devolve o link curto da vitrine ({site}/catalogo/{id}) */
  publicarCatalogo: (arquivo: File) => upload<CatalogoPublicado>('/vitrine/catalogos', arquivo),
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
export const CHAVE_LINK_VITRINE = ['link-vitrine']
export const CHAVE_VITRINE_PRODUTOS = 'vitrine-produtos'
