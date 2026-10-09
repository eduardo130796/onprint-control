import { createElement, type ReactElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import {
  FORMATO_ETIQUETA,
  formatarDataHora,
  formatarDataSimples,
  formatarMoeda,
  formatarTelefone,
  type EmpresaConfig,
  type FormatoEtiqueta,
  type OrcamentoDetalhe,
  type PedidoDetalhe,
  type RecebimentosPedido,
} from '@onprint/shared'
import { DocumentoOrcamento } from '@/features/orcamentos/components/pdf/DocumentoOrcamento'
import { DocumentoEtiquetas } from './DocumentoEtiquetas'
import { DocumentoPedido } from './DocumentoPedido'
import { DocumentoRecibo } from './DocumentoRecibo'
import { volumesDoPedido } from './etiquetas'
import { carregarLogo, dadosEmpresa, imagemDataUrl, type Etiqueta } from './pdfComum'

// Carregado sob demanda (import dinâmico): a biblioteca de PDF só é baixada quando alguém imprime ou baixa.

export interface PdfGerado {
  blob: Blob
  nome: string
}

const renderizar = (doc: ReactElement) => pdf(doc as Parameters<typeof pdf>[0]).toBlob()

export async function pdfOrcamento(o: OrcamentoDetalhe, empresa: EmpresaConfig): Promise<PdfGerado> {
  const logo = await carregarLogo(empresa)
  return { blob: await renderizar(createElement(DocumentoOrcamento, { o, empresa, logo })), nome: `${o.numero} - ${o.cliente.nome}.pdf` }
}

export async function pdfPedido(p: PedidoDetalhe, empresa: EmpresaConfig): Promise<PdfGerado> {
  const logo = await carregarLogo(empresa)
  return { blob: await renderizar(createElement(DocumentoPedido, { p, empresa, logo })), nome: `${p.numero} - ${p.cliente.nome}.pdf` }
}

/** Recibo dos pagamentos escolhidos (duas vias na mesma folha). */
export async function pdfRecibo(p: PedidoDetalhe, recebimentos: RecebimentosPedido, empresa: EmpresaConfig): Promise<PdfGerado> {
  if (recebimentos.pagamentos.length === 0) throw new Error('Escolha ao menos um pagamento.')
  const logo = await carregarLogo(empresa)
  return { blob: await renderizar(createElement(DocumentoRecibo, { p, recebimentos, empresa, logo })), nome: `Recibo ${p.numero} - ${p.cliente.nome}.pdf` }
}

const metros = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

const ENTREGA_CURTA = { retirada: 'Retirada', entrega: 'Entrega', instalacao: 'Instalação' } as const

/** Pedido + volumes escolhidos (chaves de `volumesDoPedido`); sem chaves = todos. */
export interface GrupoEtiquetas {
  pedido: PedidoDetalhe
  chaves?: string[]
}

export interface OpcoesEtiquetas {
  formato: FormatoEtiqueta
  /** Primeira casa da folha (1-based) para aproveitar folha já usada */
  inicio: number
}

const qrDoPedido = (id: string) =>
  QRCode.toDataURL(`${window.location.origin}/pedidos/${id}`, { margin: 0, width: 240, errorCorrectionLevel: 'M', color: { dark: '#2B3036FF', light: '#FFFFFFFF' } }).catch(() => null)

/** Etiquetas de um pedido: miniatura da arte mais recente (não no formato compacto), "N de T" e QR que abre o pedido. */
async function etiquetasDoPedido({ pedido: p, chaves }: GrupoEtiquetas, empresa: EmpresaConfig, comImagem: boolean): Promise<Etiqueta[]> {
  // Entrega mais recente ainda em aberto (agenda, endereço, entregador, observação)
  const entrega = p.entregas.find((e) => !['cancelada', 'realizada'].includes(e.status)) ?? null
  const retirada = (entrega?.tipo ?? p.tipoEntrega) === 'retirada'
  const destino = retirada ? '' : entrega?.endereco || p.enderecoEntrega || 'Endereço a combinar com o cliente'
  const emAberto = Number(p.total) - Number(p.valorPago)
  const observacao = (entrega?.observacao || p.observacoes || '').trim()
  const volumes = volumesDoPedido(p).filter((v) => !chaves || chaves.includes(v.chave))
  if (volumes.length === 0) return []
  const qr = await qrDoPedido(p.id)
  return Promise.all(
    volumes.map(async ({ item, op, indice, total }) => ({
      pedido: p.numero,
      op: op?.numero ?? null,
      indice,
      totalEtiquetas: total,
      entrega: ENTREGA_CURTA[entrega?.tipo ?? p.tipoEntrega],
      retirada,
      cliente: p.cliente.nome,
      telefone: formatarTelefone(p.cliente.whatsapp ?? p.cliente.telefone),
      destino,
      quando: entrega?.dataAgendada ? formatarDataHora(entrega.dataAgendada) : formatarDataSimples(p.dataPrevistaEntrega),
      agendada: Boolean(entrega?.dataAgendada),
      entregador: entrega?.responsavel?.nome ?? null,
      cobrar: emAberto > 0.004 ? formatarMoeda(emAberto) : null,
      observacao: observacao ? (observacao.length > 140 ? `${observacao.slice(0, 137)}…` : observacao) : null,
      item: item.descricao,
      quantidade: Number(item.quantidade).toLocaleString('pt-BR'),
      medidas: item.largura ? `${metros(item.largura)}${item.altura ? ` × ${metros(item.altura)}` : ''} m` : null,
      outrosItens: p.itens.filter((i) => i.id !== item.id).map((i) => `${Number(i.quantidade).toLocaleString('pt-BR')} × ${i.descricao}`),
      imagem: comImagem ? await imagemDataUrl(item.artes[0]?.miniaturaUrl) : null,
      qr,
      telefoneEmpresa: formatarTelefone(empresa.whatsapp ?? empresa.telefone),
    })),
  )
}

/**
 * Etiquetas de um ou vários pedidos numa impressão só, no formato escolhido (A4 com 4 ou 8, ou térmica),
 * começando na casa `inicio` da primeira folha.
 */
export async function pdfEtiquetas(grupos: GrupoEtiquetas[], empresa: EmpresaConfig, opcoes: OpcoesEtiquetas): Promise<PdfGerado> {
  const comImagem = !FORMATO_ETIQUETA[opcoes.formato].compacta
  const etiquetas = (await Promise.all(grupos.map((g) => etiquetasDoPedido(g, empresa, comImagem)))).flat()
  if (etiquetas.length === 0) throw new Error('Nenhuma etiqueta escolhida.')
  const nome = dadosEmpresa(empresa).nome
  const doc = createElement(DocumentoEtiquetas, { etiquetas, empresa: nome, formato: opcoes.formato, inicio: opcoes.inicio })
  const pedidos = [...new Set(grupos.filter((g) => !g.chaves || g.chaves.length > 0).map((g) => g.pedido.numero))]
  return { blob: await renderizar(doc), nome: pedidos.length === 1 ? `Etiquetas ${pedidos[0]}.pdf` : `Etiquetas (${etiquetas.length}).pdf` }
}
