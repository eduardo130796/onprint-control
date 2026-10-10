import { subdominioReservado, type ModoCalculo, type ModoPrecoVitrine, type PrecoVitrine } from '@onprint/shared'

/**
 * Regras puras da Vitrine online (docs/VITRINE.md): slug, preço exibido, descrição da solicitação
 * e endereço público. Sem banco: testadas em tests/vitrine.test.ts.
 */

/** Rótulo da unidade de cobrança mostrado ao lado do preço ("R$ 45,00 / m²") */
export const UNIDADES_VITRINE: Record<ModoCalculo, string> = {
  m2: 'm²',
  metro_linear: 'metro',
  milheiro: 'milheiro',
  hora: 'hora',
  unidade: 'unidade',
}

/** Modos com medidas (largura × altura) no site */
export const MODOS_COM_MEDIDAS: readonly ModoCalculo[] = ['m2', 'metro_linear']

/** "Banner em Lona 440 g!" → "banner-em-lona-440-g" (sem acento, minúsculo, hífen; até 80 letras) */
export function normalizarSlug(texto: string, max = 80): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
    .replace(/-+$/, '')
}

/** Primeiro slug livre: base, base-2, base-3… (`ocupados` = slugs de outros produtos) */
export function slugLivre(base: string, ocupados: ReadonlySet<string>): string {
  const raiz = base || 'produto'
  if (!ocupados.has(raiz)) return raiz
  for (let n = 2; ; n++) {
    const sufixo = `-${n}`
    const candidato = `${raiz.slice(0, 80 - sufixo.length).replace(/-+$/, '')}${sufixo}`
    if (!ocupados.has(candidato)) return candidato
  }
}

interface ProdutoPreco {
  vitrineModoPreco: string
  precoVenda: { toString(): string } | string | number
  modoCalculo: ModoCalculo
}

/** Preço mostrado no site: fixo e "a partir de" usam o preço de venda; sob consulta não mostra valor. Nunca o custo. */
export function precoExibido(p: ProdutoPreco): PrecoVitrine {
  const modo = (['fixo', 'a_partir_de', 'sob_consulta'].includes(p.vitrineModoPreco) ? p.vitrineModoPreco : 'sob_consulta') as ModoPrecoVitrine
  return {
    modo,
    valor: modo === 'sob_consulta' ? null : Number(p.precoVenda.toString()).toFixed(2),
    unidade: UNIDADES_VITRINE[p.modoCalculo] ?? 'unidade',
  }
}

/** "1.500" → "1,5" */
const medida = (v: string) => String(Number(v)).replace('.', ',')

export interface ItemDescricao {
  descricao: string
  quantidade: number
  largura: string | null
  altura: string | null
  acabamentos: { nome: string }[]
  observacao: string | null
}

/** Texto da solicitação criada pela vitrine: um item por linha e a mensagem do visitante no fim. */
export function montarDescricaoSolicitacao(itens: ItemDescricao[], mensagem: string | null | undefined): string {
  const linhas = itens.map((i, n) => {
    const partes = [`${n + 1}. ${i.descricao}`, `Qtd.: ${i.quantidade}`]
    if (i.largura && i.altura) partes.push(`${medida(i.largura)} × ${medida(i.altura)} m`)
    else if (i.largura) partes.push(`${medida(i.largura)} m`)
    if (i.acabamentos.length) partes.push(`Acabamentos: ${i.acabamentos.map((a) => a.nome).join(', ')}`)
    if (i.observacao) partes.push(`Obs.: ${i.observacao}`)
    return partes.join(' · ')
  })
  const texto = [`Lista de orçamento enviada pelo site (${itens.length} ${itens.length === 1 ? 'item' : 'itens'}):`, ...linhas]
  if (mensagem?.trim()) texto.push('', `Mensagem: ${mensagem.trim()}`)
  return texto.join('\n')
}

interface ConfigEndereco {
  DOMINIO_VITRINE: string
  NODE_ENV: string
  APP_URL: string
}

/** Domínio base das vitrines: DOMINIO_VITRINE; sem ele, localhost em desenvolvimento ou o domínio do APP_URL em produção. */
export function dominioVitrine(config: ConfigEndereco): string {
  if (config.DOMINIO_VITRINE) return config.DOMINIO_VITRINE
  if (config.NODE_ENV !== 'production') return 'localhost'
  return new URL(config.APP_URL).hostname.replace(/^(www|app)\./, '')
}

/** https://{slug}.{DOMINIO_VITRINE}; em desenvolvimento sem domínio, http://{slug}.localhost:5173 */
export function urlPublicaVitrine(slug: string, config: ConfigEndereco): string {
  if (!config.DOMINIO_VITRINE && config.NODE_ENV !== 'production') return `http://${slug}.localhost:5173`
  return `https://${slug}.${dominioVitrine(config)}`
}

/** "grafica-x.grafygo.com.br" → "grafica-x"; null se não for subdomínio direto da base ou for reservado. */
export function slugDoDominio(dominio: string, base: string): string | null {
  const host = dominio.trim().toLowerCase().replace(/\.$/, '').replace(/:\d+$/, '')
  const sufixo = `.${base.toLowerCase()}`
  if (!base || !host.endsWith(sufixo)) return null
  const slug = host.slice(0, -sufixo.length)
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(slug) || subdominioReservado(slug)) return null
  return slug
}
