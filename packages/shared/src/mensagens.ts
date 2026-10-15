/**
 * Peças das mensagens ao cliente (WhatsApp), no padrão de TEXTOS_PADRAO_MENSAGEM: lista dos itens do orçamento
 * e do pedido, prazo, pagamento, retirada/entrega e o bloco extra antes da assinatura. Usadas pela API (avisos e
 * o texto dos envios do pedido) e pela web (prévias e envios).
 */
import { formatarDataSimples, formatarMoeda } from './format'
import type { TipoEntrega } from './enums-comercial'
import type { VariavelTemplate } from './enums'

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

/** "Pedido confirmado" (templates antigos com {{proximo_passo}}): o que acontece agora (a aprovação da arte pelo cliente é opcional: não promete o envio) */
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

/** "Pedido pronto" (templates antigos com {{forma_entrega}}): retirada ou entrega */
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

// ─── Pedido: tudo no corpo da mensagem (itens, pagamento, retirada/entrega), sem precisar abrir o link ───

const centavos = (v: string | number) => Math.round(Number(v) * 100)

/** Pagamento do pedido: quitado, parcial (pago e falta) ou tudo a pagar */
export function resumoPagamento(total: string | number, pago: string | number): string {
  const t = centavos(total)
  const p = Math.max(centavos(pago), 0)
  if (t <= 0) return ''
  if (p >= t) return 'Pagamento: *quitado* ✅'
  if (p > 0) return `Pago: *${formatarMoeda(p / 100)}* · Falta: *${formatarMoeda((t - p) / 100)}*`
  return `A pagar: *${formatarMoeda(t / 100)}*`
}

export interface ParcelaMensagem {
  valor: string | number
  valorPago: string | number
  /** "aaaa-mm-dd" */
  vencimento: string
  /** StatusConta: aberto, parcial, pago, vencido, cancelado */
  status: string
}

/**
 * Próxima parcela em aberto que vence hoje ou depois (a que falta dela); "" com o pedido quitado ou sem parcela
 * por vencer (vencida não entra: a gráfica cobra pelo caminho dela).
 */
export function proximoVencimento(parcelas: ParcelaMensagem[], total: string | number, pago: string | number, hoje: string): string {
  if (centavos(pago) >= centavos(total)) return ''
  const proxima = parcelas
    .filter((c) => c.status !== 'cancelado' && c.status !== 'pago' && c.vencimento.slice(0, 10) >= hoje && centavos(c.valor) > centavos(c.valorPago))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento))[0]
  if (!proxima) return ''
  return `Próxima parcela: *${formatarMoeda((centavos(proxima.valor) - centavos(proxima.valorPago)) / 100)}* em *${formatarDataSimples(proxima.vencimento).slice(0, 5)}*`
}

/** Endereço e horário da gráfica (retirada) */
export interface GraficaMensagem {
  endereco?: string | null
  horario?: string | null
  chavePix?: string | null
}

/** Uma linha só: quebras e espaços repetidos do cadastro viram " · " / um espaço */
const emUmaLinha = (texto: string | null | undefined) =>
  (texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' · ')

/** Onde o cliente recebe o pedido: retirada (endereço e horário da gráfica), entrega ou instalação (endereço do pedido) */
export function localEntrega(tipo: TipoEntrega | null | undefined, enderecoEntrega: string | null | undefined, grafica: GraficaMensagem): string {
  const destino = emUmaLinha(enderecoEntrega)
  if (tipo === 'entrega') return destino ? `Entrega em: ${destino}` : 'Vamos combinar a entrega com você.'
  if (tipo === 'instalacao') return destino ? `Instalação em: ${destino}` : 'Vamos combinar a instalação com você.'
  const endereco = emUmaLinha(grafica.endereco)
  const horario = emUmaLinha(grafica.horario)
  if (!endereco && !horario) return 'Retirada aqui na gráfica.'
  return `Retirada: ${[endereco || 'aqui na gráfica', horario].filter(Boolean).join(' · ')}`
}

/** Chave Pix da gráfica, só quando falta pagar algo */
export function pixPagamento(total: string | number, pago: string | number, chavePix: string | null | undefined): string {
  const chave = chavePix?.trim()
  return chave && centavos(total) > centavos(pago) ? `Pix para pagar: *${chave}*` : ''
}

export interface PedidoMensagem {
  total: string | number
  valorPago: string | number
  tipoEntrega: TipoEntrega | null
  enderecoEntrega: string | null
  itens: ItemMensagem[]
  /** Contas a receber do pedido */
  parcelas: ParcelaMensagem[]
}

/**
 * Variáveis do pedido que trazem tudo no corpo da mensagem: itens, pagamento, próxima parcela, retirada/entrega e Pix.
 * No "pedido confirmado" sem nada pago, o "A pagar" sairia igual ao Total logo acima: fica só o Total.
 */
export function valoresPedidoCompleto(
  pedido: PedidoMensagem,
  grafica: GraficaMensagem,
  hoje: string,
  categoria?: string,
): Partial<Record<VariavelTemplate, string>> {
  const nadaPago = centavos(pedido.valorPago) <= 0
  return {
    itens_pedido: listaItensMensagem(pedido.itens),
    resumo_pagamento: categoria === 'pedido_confirmado' && nadaPago ? '' : resumoPagamento(pedido.total, pedido.valorPago),
    proximo_vencimento: proximoVencimento(pedido.parcelas, pedido.total, pedido.valorPago, hoje),
    local_entrega: localEntrega(pedido.tipoEntrega, pedido.enderecoEntrega, grafica),
    pix_pagamento: pixPagamento(pedido.total, pedido.valorPago, grafica.chavePix),
  }
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
