import { createElement, type ReactElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import QRCode from 'qrcode'
import {
  formatarDataHora,
  formatarDataSimples,
  formatarMoeda,
  formatarTelefone,
  type EmpresaConfig,
  type OrcamentoDetalhe,
  type PedidoDetalhe,
  type RecebimentosPedido,
} from '@onprint/shared'
import { DocumentoOrcamento } from '@/features/orcamentos/components/pdf/DocumentoOrcamento'
import { DocumentoEtiquetas } from './DocumentoEtiquetas'
import { DocumentoPedido } from './DocumentoPedido'
import { DocumentoRecibo } from './DocumentoRecibo'
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

/** Uma etiqueta por OP ativa do pedido (ou só das OPs informadas), com a miniatura da arte mais recente. */
const ENTREGA_CURTA = { retirada: 'Retirada', entrega: 'Entrega', instalacao: 'Instalação' } as const

/**
 * Uma etiqueta por OP ativa do pedido (ou só das OPs informadas), com a miniatura da arte mais recente,
 * "etiqueta N de T" (contando todas as OPs do pedido) e um QR que abre o pedido no sistema.
 */
export async function pdfEtiquetas(p: PedidoDetalhe, empresa: EmpresaConfig, opIds?: string[]): Promise<PdfGerado> {
  // Entrega mais recente ainda em aberto (agenda, endereço, entregador, observação)
  const entrega = p.entregas.find((e) => !['cancelada', 'realizada'].includes(e.status)) ?? null
  const retirada = (entrega?.tipo ?? p.tipoEntrega) === 'retirada'
  const destino = retirada ? '' : entrega?.endereco || p.enderecoEntrega || 'Endereço a combinar com o cliente'
  const emAberto = Number(p.total) - Number(p.valorPago)
  const observacao = (entrega?.observacao || p.observacoes || '').trim()
  const todas = p.itens.flatMap((item) => {
    const ops = item.ordensProducao.filter((o) => !o.cancelada)
    return (ops.length > 0 ? ops : [null]).map((op) => ({ item, op }))
  })
  const linhas = todas.map((l, i) => ({ ...l, indice: i + 1 })).filter((l) => !opIds || (l.op && opIds.includes(l.op.id)))
  if (linhas.length === 0) throw new Error('Nenhuma OP para etiquetar.')
  const qr = await QRCode.toDataURL(`${window.location.origin}/pedidos/${p.id}`, { margin: 0, width: 240, errorCorrectionLevel: 'M', color: { dark: '#2B3036FF', light: '#FFFFFFFF' } }).catch(() => null)
  const etiquetas: Etiqueta[] = await Promise.all(
    linhas.map(async ({ item, op, indice }) => ({
      pedido: p.numero,
      op: op?.numero ?? null,
      indice,
      totalEtiquetas: todas.length,
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
      imagem: await imagemDataUrl(item.artes[0]?.miniaturaUrl),
      qr,
      telefoneEmpresa: formatarTelefone(empresa.whatsapp ?? empresa.telefone),
    })),
  )
  const nome = dadosEmpresa(empresa).nome
  return { blob: await renderizar(createElement(DocumentoEtiquetas, { etiquetas, empresa: nome })), nome: `Etiquetas ${p.numero}.pdf` }
}
