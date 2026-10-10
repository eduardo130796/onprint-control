import { somenteDigitos, type ProdutoVitrineResumo } from '@onprint/shared'
import { linkWhatsapp, partesPreco, textoPreco, type PartesPreco } from '@/features/vitrine-site/formato'
import { UNIDADE_VITRINE } from './utils'

// Divulgação da vitrine pelo WhatsApp (Etapa 1.5 B — docs/VITRINE.md): mensagens prontas, links wa.me e as contas
// de layout das imagens (Status/Post) e do catálogo em PDF. Tudo puro (testado em divulgar.test.ts).

/** Nome que o produto tem no site */
export const nomeNoSite = (p: Pick<ProdutoVitrineResumo, 'nomePublico' | 'nome'>) => (p.nomePublico || p.nome).trim()

/** Preço do produto da área logada no formato do site (mesmas regras de `partesPreco`) */
export function partesPrecoProduto(p: Pick<ProdutoVitrineResumo, 'modoPreco' | 'precoVenda' | 'modoCalculo'>): PartesPreco {
  return partesPreco({ modo: p.modoPreco, valor: p.modoPreco === 'sob_consulta' ? null : p.precoVenda, unidade: UNIDADE_VITRINE[p.modoCalculo] })
}

export function textoPrecoProduto(p: Pick<ProdutoVitrineResumo, 'modoPreco' | 'precoVenda' | 'modoCalculo'>): string {
  return textoPreco({ modo: p.modoPreco, valor: p.modoPreco === 'sob_consulta' ? null : p.precoVenda, unidade: UNIDADE_VITRINE[p.modoCalculo] })
}

/** Endereço do produto no site ("https://grafica.grafygo.com.br/produto/banner-em-lona"); sem slug, o início */
export function urlProduto(urlPublica: string, slug: string | null | undefined): string {
  const base = urlPublica.replace(/\/+$/, '')
  return slug ? `${base}/produto/${slug}` : base
}

/** Primeiro nome, com a primeira letra maiúscula ("MARIA DA SILVA" → "Maria") */
export function primeiroNome(nome: string | null | undefined): string {
  const p = (nome ?? '').trim().split(/\s+/)[0] ?? ''
  if (!p) return ''
  return p.charAt(0).toLocaleUpperCase('pt-BR') + p.slice(1).toLocaleLowerCase('pt-BR')
}

/** "Olá!" ou "Olá, Maria!" */
export const saudacao = (nome?: string | null) => {
  const n = primeiroNome(nome)
  return n ? `Olá, ${n}!` : 'Olá!'
}

/**
 * Troca a saudação do começo da mensagem pelo nome do cliente escolhido (mantém o resto, mesmo editado).
 * Sem saudação no começo, acrescenta uma.
 */
export function trocarSaudacao(texto: string, nome?: string | null): string {
  const nova = saudacao(nome)
  const m = /^\s*(olá|oi|ola)(\s*,\s*[^!\n]*)?!\s*/i.exec(texto)
  if (m) return `${nova} ${texto.slice(m[0].length)}`.trimEnd()
  return texto.trim() ? `${nova} ${texto.trim()}` : nova
}

/** "Olá, Maria! Veja o produto *Banner em lona* — a partir de R$ 45,00 / m²: https://…" */
export function mensagemProduto({ nome, produto, preco, link }: { nome?: string | null; produto: string; preco: string; link: string }): string {
  const valor = preco && preco !== 'Sob consulta' ? ` — ${preco.replace(/^A partir de/, 'a partir de')}` : ' — preço sob consulta'
  return `${saudacao(nome)} Veja o produto *${produto}*${valor}: ${link}`
}

/** Divulgar o site inteiro ("Conheça a vitrine…") */
export function mensagemVitrine({ nome, loja, link }: { nome?: string | null; loja: string; link: string }): string {
  return `${saudacao(nome)} Conheça a vitrine online da *${loja}*: veja nossos produtos, monte sua lista e peça seu orçamento: ${link}`
}

/** "Enviar catálogo" para um cliente (painel/ficha do cliente e solicitação) */
export function mensagemCatalogo({ nome, loja, link }: { nome?: string | null; loja: string; link: string }): string {
  return `${saudacao(nome)} Aqui está o nosso catálogo de produtos da *${loja}*. É só escolher, montar a lista e pedir o orçamento pelo site: ${link}`
}

/**
 * wa.me com a mensagem: para o número do cliente (com 55 nos números brasileiros) ou, sem número válido,
 * para qualquer contato (o WhatsApp pergunta para quem enviar).
 */
export function linkWhatsappEnvio(numero: string | null | undefined, mensagem: string): string {
  return linkWhatsapp(numero, mensagem) ?? `https://wa.me/?text=${encodeURIComponent(mensagem.trim())}`
}

/** O número serve para o wa.me (10+ dígitos) */
export const numeroValido = (numero: string | null | undefined) => somenteDigitos(numero ?? '').length >= 10

/** Nome de arquivo seguro ("Banner em lona 440g" → "banner-em-lona-440g") */
export function nomeArquivo(texto: string): string {
  return (
    texto
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'vitrine'
  )
}

// ─── Layout (canvas) ───────────────────────────────────────────────────────

/**
 * Quebra o texto em linhas que cabem em `largura`, com no máximo `maxLinhas` (a última ganha "…" se sobrar texto).
 * `medir` devolve a largura de um trecho (ctx.measureText no canvas). Palavra maior que a linha é cortada com "…".
 */
export function quebrarLinhas(texto: string, largura: number, medir: (t: string) => number, maxLinhas = Infinity): { linhas: string[]; cortado: boolean } {
  const palavras = texto.trim().split(/\s+/).filter(Boolean)
  const linhas: string[] = []
  let atual = ''
  let i = 0
  for (; i < palavras.length; i++) {
    const p = palavras[i]!
    const tentativa = atual ? `${atual} ${p}` : p
    if (medir(tentativa) <= largura) {
      atual = tentativa
      continue
    }
    if (atual) {
      linhas.push(atual)
      if (linhas.length === maxLinhas) break
    }
    atual = medir(p) <= largura ? p : reticencias(p, largura, medir)
  }
  const cortado = i < palavras.length
  if (!cortado && atual) linhas.push(atual)
  if (cortado && linhas.length) linhas[linhas.length - 1] = reticencias(`${linhas[linhas.length - 1]}…`, largura, medir)
  return { linhas, cortado }
}

/** Corta o fim do texto até caber, terminando em "…" */
export function reticencias(texto: string, largura: number, medir: (t: string) => number): string {
  if (medir(texto) <= largura) return texto
  let t = texto.replace(/…$/, '')
  while (t.length > 1 && medir(`${t.trimEnd()}…`) > largura) t = t.slice(0, -1)
  return `${t.trimEnd()}…`
}

/**
 * Maior tamanho de fonte (dos `tamanhos`, em ordem decrescente) em que o texto cabe em `maxLinhas` sem cortar;
 * se nenhum couber, o menor, cortado com "…".
 */
export function ajustarTexto(
  texto: string,
  { tamanhos, largura, maxLinhas, medir }: { tamanhos: number[]; largura: number; maxLinhas: number; medir: (t: string, tamanho: number) => number },
): { tamanho: number; linhas: string[] } {
  for (const tamanho of tamanhos) {
    const r = quebrarLinhas(texto, largura, (t) => medir(t, tamanho), maxLinhas)
    if (!r.cortado) return { tamanho, linhas: r.linhas }
  }
  const menor = tamanhos[tamanhos.length - 1] ?? 16
  return { tamanho: menor, linhas: quebrarLinhas(texto, largura, (t) => medir(t, menor), maxLinhas).linhas }
}

/** Recorte da imagem para cobrir a caixa sem distorcer (como object-fit: cover), centralizado */
export function recorteCapa(larguraImg: number, alturaImg: number, larguraCaixa: number, alturaCaixa: number) {
  const escala = Math.max(larguraCaixa / larguraImg, alturaCaixa / alturaImg)
  const sw = larguraCaixa / escala
  const sh = alturaCaixa / escala
  return { sx: (larguraImg - sw) / 2, sy: (alturaImg - sh) / 2, sw, sh }
}

/** Miniatura da área logada em tamanho grande (a API serve 480 e 1200 px) */
export const urlImagemGrande = (url: string) => (/[?&]w=\d+/.test(url) ? url.replace(/([?&]w=)\d+/, '$11200') : `${url}${url.includes('?') ? '&' : '?'}w=1200`)

/** Texto curto de venda para o catálogo: primeiro parágrafo, até `max` letras (corta na palavra) */
export function textoCurto(texto: string | null | undefined, max = 180): string {
  const t = (texto ?? '').replace(/\r\n?/g, '\n').split(/\n\s*\n/)[0]?.replace(/\s+/g, ' ').trim() ?? ''
  if (t.length <= max) return t
  const corte = t.slice(0, max - 1)
  const espaco = corte.lastIndexOf(' ')
  return `${(espaco > max * 0.6 ? corte.slice(0, espaco) : corte).replace(/[\s,.;:–—-]+$/, '')}…`
}

/** Produtos publicados agrupados por categoria (na ordem da lista; sem categoria por último, como "Outros produtos") */
export function agruparPorCategoria<T extends { categoria: { id: string; nome: string } | null }>(produtos: T[]): { titulo: string; produtos: T[] }[] {
  const grupos = new Map<string, { titulo: string; produtos: T[] }>()
  for (const p of produtos) {
    const chave = p.categoria?.id ?? ''
    if (!grupos.has(chave)) grupos.set(chave, { titulo: p.categoria?.nome ?? 'Outros produtos', produtos: [] })
    grupos.get(chave)!.produtos.push(p)
  }
  const semCategoria = grupos.get('')
  grupos.delete('')
  const lista = [...grupos.values()].sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
  return semCategoria ? [...lista, semCategoria] : lista
}
