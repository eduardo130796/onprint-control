/**
 * Peças das mensagens ao cliente (WhatsApp), no padrão de TEXTOS_PADRAO_MENSAGEM: lista dos itens do orçamento,
 * prazo, próximo passo do pedido e o bloco extra antes da assinatura. Usadas pela API (avisos) e pela web (envios).
 */
import { formatarMoeda } from './format'
import type { TipoEntrega } from './enums-comercial'

export interface ItemMensagem {
  descricao: string
  quantidade: string | number
  largura?: string | number | null
  altura?: string | number | null
  total: string | number
}

const decimal = (v: string | number, min = 0) => Number(v).toLocaleString('pt-BR', { minimumFractionDigits: min, maximumFractionDigits: 3 })

/** "2× Banner em lona 2,0 × 1,0 m — R$ 130,00" */
export function linhaItemMensagem(i: ItemMensagem): string {
  const medida = i.largura && i.altura && Number(i.largura) > 0 && Number(i.altura) > 0 ? ` ${decimal(i.largura, 1)} × ${decimal(i.altura, 1)} m` : ''
  return `${decimal(i.quantidade)}× ${i.descricao.trim()}${medida} — ${formatarMoeda(i.total)}`
}

/** Itens em lista (•), um por linha; passando de `max`, a última linha resume o resto */
export function listaItensMensagem(itens: ItemMensagem[], max = 8): string {
  const mostrados = itens.length > max ? itens.slice(0, max - 1) : itens
  const linhas = mostrados.map((i) => `• ${linhaItemMensagem(i)}`)
  if (mostrados.length < itens.length) linhas.push(`• e mais ${itens.length - mostrados.length} itens`)
  return linhas.join('\n')
}

/** "1 dia útil", "5 dias úteis"; 0 = sem prazo (a linha some da mensagem) */
export const textoPrazoDias = (dias: number | null | undefined) => (!dias || dias <= 0 ? '' : dias === 1 ? '1 dia útil' : `${dias} dias úteis`)

/** "Pedido confirmado": o que acontece agora (a aprovação da arte pelo cliente é opcional: não promete o envio) */
export function proximoPassoPedido(comArte: boolean): string {
  return comArte ? 'Agora preparamos a arte e, em seguida, a produção.' : 'Já vamos começar a produção.'
}

export interface ArteMensagem {
  /** Item do pedido */
  descricao: string
  versao: number
}

/** Artes do pedido em lista (•), uma por item: "• Banner em lona — v2" */
export function listaArtesMensagem(artes: ArteMensagem[]): string {
  return artes.map((a) => `• ${a.descricao.trim()} — v${a.versao}`).join('\n')
}

/** Link das artes na página de acompanhamento (seção #artes): um link só para ver e aprovar todas */
export const linkArtesDoPedido = (linkAcompanhamento: string) => `${linkAcompanhamento.replace(/#.*$/, '')}#artes`

/**
 * Variáveis da mensagem "Arte para aprovação" (uma por pedido, com todas as artes que aguardam o cliente):
 * a lista das artes, os itens (templates antigos com {{descricao_item}}) e o link único para aprovar todas.
 */
export function valoresArtesAprovacao(artes: ArteMensagem[], linkAcompanhamento: string) {
  return {
    itens_arte: listaArtesMensagem(artes),
    descricao_item: artes.map((a) => a.descricao.trim()).join(', '),
    link_aprovacao: linkAcompanhamento ? linkArtesDoPedido(linkAcompanhamento) : '',
  }
}

/** "Pedido pronto": retirada ou entrega */
export function formaEntregaPronto(tipo: TipoEntrega | null | undefined): string {
  if (tipo === 'entrega') return 'Vamos combinar com você a entrega.'
  if (tipo === 'instalacao') return 'Vamos combinar com você a instalação.'
  return 'Já pode ser retirado aqui na gráfica.'
}

/** Valor que falta pagar ("" quando está quitado: a linha some) */
export function valorEmAberto(total: string | number, pago: string | number): string {
  const resto = Math.round((Number(total) - Number(pago)) * 100) / 100
  return resto > 0 ? formatarMoeda(resto) : ''
}

const blocos = (texto: string) => texto.trim().split(/\n[ \t]*\n/)
const ehLink = (linha: string) => /^https?:\/\/\S+$/.test(linha.trim())

/**
 * Acrescenta um bloco (ex.: "O PDF do orçamento vai logo abaixo.") antes da assinatura ("— Gráfica") ou,
 * sem ela, antes do bloco final com o link, para o link continuar sozinho na última linha.
 */
export function inserirAntesDoFim(texto: string, bloco: string): string {
  const b = blocos(texto)
  const extra = bloco.trim()
  if (!extra) return texto.trim()
  let i = b.findIndex((x) => /^—\s/.test(x.trim()))
  if (i < 0) {
    const ultimo = b[b.length - 1] ?? ''
    i = ehLink(ultimo.split('\n').pop() ?? '') ? b.length - 1 : b.length
  }
  b.splice(i, 0, extra)
  return b.join('\n\n')
}
