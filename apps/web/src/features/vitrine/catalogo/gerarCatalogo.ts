import { createElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { TEMAS, formatarTelefone, temaOuPadrao, type EmpresaConfig, type ProdutoVitrineResumo, type VitrineConfig } from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'
import { carregarImagem } from '../arte'
import { linkWhatsapp } from '@/features/vitrine-site/formato'
import { agruparPorCategoria, mensagemInteresseCatalogo, nomeArquivo, nomeNoSite, partesPrecoProduto, recorteCapa, textoCurto, textoPrecoProduto, urlImagemGrande, urlProduto } from '../divulgar'
import { semProtocolo } from '../utils'
import { DocumentoCatalogo, type DadosCatalogo } from './DocumentoCatalogo'

// Catálogo em PDF da vitrine (carregado sob demanda junto com a biblioteca de PDF).
// As fotos da vitrine são WebP, que o react-pdf não lê: passam por um canvas e viram JPEG já recortados.

/** Foto recortada (como object-fit: cover) em JPEG; null sem foto */
async function fotoJpeg(url: string | null | undefined, largura: number, altura: number): Promise<string | null> {
  const img = await carregarImagem(url)
  if (!img) return null
  const canvas = document.createElement('canvas')
  canvas.width = largura
  canvas.height = altura
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.fillStyle = '#FFFFFF'
  ctx.fillRect(0, 0, largura, altura)
  const c = recorteCapa(img.naturalWidth, img.naturalHeight, largura, altura)
  ctx.drawImage(img, c.sx, c.sy, c.sw, c.sh, 0, 0, largura, altura)
  return canvas.toDataURL('image/jpeg', 0.86)
}

/** Logo em PNG (mantém a transparência), no máximo 640 px */
async function logoPng(empresa: EmpresaConfig): Promise<{ src: string; proporcao: number } | null> {
  if (!empresa.logoArquivoId) return null
  try {
    const img = await carregarImagem((await arquivosApi.urlTemporaria(empresa.logoArquivoId)).url)
    if (!img) return null
    const escala = Math.min(1, 640 / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala))
    canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height)
    return { src: canvas.toDataURL('image/png'), proporcao: img.naturalWidth / Math.max(1, img.naturalHeight) }
  } catch {
    return null
  }
}

const qr = (url: string, cor: string, largura = 300) =>
  QRCode.toDataURL(url, { margin: 0, width: largura, errorCorrectionLevel: 'M', color: { dark: `${cor}FF`, light: '#FFFFFFFF' } }).catch(() => null)

/** Em lotes, para não abrir dezenas de downloads de uma vez */
async function emLotes<T, R>(itens: T[], tamanho: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const saida: R[] = []
  for (let i = 0; i < itens.length; i += tamanho) saida.push(...(await Promise.all(itens.slice(i, i + tamanho).map(fn))))
  return saida
}

export interface OpcoesCatalogo {
  /** Só estes produtos (publicados); vazio/ausente = todos os publicados */
  produtoIds?: string[]
  mostrarPreco: boolean
  qrPorProduto: boolean
  /** Rótulo da capa */
  rotulo: string
}

export async function pdfCatalogo(
  produtos: ProdutoVitrineResumo[],
  config: VitrineConfig,
  empresa: EmpresaConfig,
  opcoes: OpcoesCatalogo = { mostrarPreco: true, qrPorProduto: true, rotulo: 'Catálogo de produtos' },
): Promise<{ blob: Blob; nome: string; total: number }> {
  const escolhidos = opcoes.produtoIds?.length ? new Set(opcoes.produtoIds) : null
  const publicados = produtos.filter((p) => p.publicado && (!escolhidos || escolhidos.has(p.id)))
  if (publicados.length === 0) throw new Error('Escolha ao menos um produto publicado.')
  const cores = TEMAS[temaOuPadrao(empresa.corTema)]
  const loja = (config.titulo || empresa.nomeFantasia || empresa.razaoSocial).trim()
  const endereco = [
    empresa.logradouro && `${empresa.logradouro}${empresa.numero ? `, ${empresa.numero}` : ''}`,
    empresa.bairro,
    empresa.cidade && `${empresa.cidade}${empresa.uf ? `/${empresa.uf}` : ''}`,
  ]
    .filter(Boolean)
    .join(' · ')
  const contatos = [
    config.mostrarWhatsapp && empresa.whatsapp
      ? { tipo: 'WhatsApp', valor: formatarTelefone(empresa.whatsapp), link: linkWhatsapp(empresa.whatsapp, config.mensagemWhatsapp || 'Olá! Vi o catálogo e gostaria de um orçamento.') ?? undefined }
      : null,
    config.mostrarTelefone && empresa.telefone && empresa.telefone !== empresa.whatsapp ? { tipo: 'Telefone', valor: formatarTelefone(empresa.telefone) } : null,
    empresa.email ? { tipo: 'E-mail', valor: empresa.email, link: `mailto:${empresa.email}` } : null,
    config.mostrarEndereco && endereco ? { tipo: 'Endereço', valor: endereco } : null,
    config.horario ? { tipo: 'Atendimento', valor: config.horario } : null,
  ].filter((c): c is { tipo: string; valor: string; link?: string } => Boolean(c))

  const numeroLoja = config.mostrarWhatsapp && empresa.whatsapp ? empresa.whatsapp : null
  const capas = [...publicados].filter((p) => p.imagens.length > 0).sort((a, b) => Number(b.destaque) - Number(a.destaque)).slice(0, 3)
  const [logo, qrSite, fotosCapa, itens] = await Promise.all([
    logoPng(empresa),
    qr(config.urlPublica, cores.escuro, 480),
    Promise.all(capas.map((p) => fotoJpeg(urlImagemGrande(p.imagens[0]!.url), 640, 640))),
    emLotes(publicados, 6, async (p) => {
      const link = urlProduto(config.urlPublica, p.slug)
      const [foto, qrProduto] = await Promise.all([fotoJpeg(p.imagens[0] ? urlImagemGrande(p.imagens[0].url) : null, 640, 480), opcoes.qrPorProduto ? qr(link, '#1E2226', 200) : null])
      // "Pedir pelo WhatsApp" do produto: conversa com a gráfica e a mensagem pronta (com o preço, se o catálogo mostra)
      const whatsapp = numeroLoja
        ? linkWhatsapp(numeroLoja, mensagemInteresseCatalogo({ produto: nomeNoSite(p), preco: opcoes.mostrarPreco ? textoPrecoProduto(p) : null, link }))
        : null
      return { id: p.id, whatsapp, categoria: p.categoria, nome: nomeNoSite(p), preco: opcoes.mostrarPreco ? partesPrecoProduto(p) : null, texto: textoCurto(p.descricaoPublica, 120), foto, link, qr: qrProduto }
    }),
  ])

  const dados: DadosCatalogo = {
    cores,
    loja,
    slogan: config.slogan ?? null,
    logo,
    site: semProtocolo(config.urlPublica),
    url: config.urlPublica,
    qrSite,
    contatos,
    fotosCapa: fotosCapa.filter((f): f is string => Boolean(f)),
    grupos: agruparPorCategoria(itens),
    total: itens.length,
    data: new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }),
    rotulo: opcoes.rotulo.trim() || 'Catálogo de produtos',
  }
  const blob = await pdf(createElement(DocumentoCatalogo, { dados }) as Parameters<typeof pdf>[0]).toBlob()
  return { blob, nome: `Catálogo ${nomeArquivo(loja)}.pdf`, total: itens.length }
}
