import { formatarMoeda, type ModoCalculo, type ProdutoVitrineInput, type ProdutoVitrineResumo } from '@onprint/shared'

/** Unidade da cobrança como o site mostra ("R$ 45,00 / m²") — ver docs/VITRINE.md §3 */
export const UNIDADE_VITRINE: Record<ModoCalculo, string> = {
  unidade: 'unidade',
  m2: 'm²',
  metro_linear: 'metro',
  milheiro: 'milheiro',
  hora: 'hora',
}

/** Preço como aparece no site: "R$ 45,00 / m²", "a partir de R$ 45,00 / m²" ou "Sob consulta" */
export function precoExibido(p: Pick<ProdutoVitrineResumo, 'modoPreco' | 'precoVenda' | 'modoCalculo'>): string {
  if (p.modoPreco === 'sob_consulta') return 'Sob consulta'
  const valor = `${formatarMoeda(p.precoVenda)} / ${UNIDADE_VITRINE[p.modoCalculo]}`
  return p.modoPreco === 'a_partir_de' ? `a partir de ${valor}` : valor
}

/** Dados completos para o PATCH (a API recebe o produto inteiro na vitrine) */
export function dadosVitrine(p: ProdutoVitrineResumo, mudancas: Partial<ProdutoVitrineInput> = {}): ProdutoVitrineInput {
  return {
    publicado: p.publicado,
    destaque: p.destaque,
    nomePublico: p.nomePublico,
    descricaoPublica: p.descricaoPublica,
    modoPreco: p.modoPreco,
    slug: p.slug,
    ordem: p.ordem,
    ...mudancas,
  }
}

/** Endereço público sem o protocolo, para exibir ("grafica.grafygo.com.br") */
export const semProtocolo = (url: string) => url.replace(/^https?:\/\//, '').replace(/\/$/, '')

/** Extensões aceitas nas fotos da vitrine (a API converte para WebP) */
export const EXTENSOES_FOTO = ['png', 'jpg', 'jpeg', 'webp'] as const
export const TAMANHO_MAX_FOTO_MB = 10

/** Prévia do endereço gerado pela API (sem acento, minúsculo, hífen) */
export function sugerirSlug(nome: string): string {
  return nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
}
