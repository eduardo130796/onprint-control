import { createElement, type ReactElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import {
  TIPO_ENTREGA_ROTULOS,
  formatarDataSimples,
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
export async function pdfEtiquetas(p: PedidoDetalhe, empresa: EmpresaConfig, opIds?: string[]): Promise<PdfGerado> {
  const destino = p.tipoEntrega === 'retirada' ? '' : p.enderecoEntrega || 'endereço a combinar'
  const linhas = p.itens.flatMap((item) => {
    const ops = item.ordensProducao.filter((o) => !o.cancelada && (!opIds || opIds.includes(o.id)))
    const alvo = ops.length > 0 ? ops : !opIds ? [null] : []
    return alvo.map((op) => ({ item, op }))
  })
  if (linhas.length === 0) throw new Error('Nenhuma OP para etiquetar.')
  const etiquetas: Etiqueta[] = await Promise.all(
    linhas.map(async ({ item, op }) => ({
      pedido: p.numero,
      op: op?.numero ?? null,
      cliente: p.cliente.nome,
      telefone: formatarTelefone(p.cliente.whatsapp ?? p.cliente.telefone),
      destino,
      entrega: TIPO_ENTREGA_ROTULOS[p.tipoEntrega],
      item: item.descricao,
      quantidade: Number(item.quantidade).toLocaleString('pt-BR'),
      medidas: item.largura ? `${metros(item.largura)}${item.altura ? ` × ${metros(item.altura)}` : ''} m` : null,
      previsao: formatarDataSimples(p.dataPrevistaEntrega),
      imagem: await imagemDataUrl(item.artes[0]?.miniaturaUrl),
    })),
  )
  const nome = dadosEmpresa(empresa).nome
  return { blob: await renderizar(createElement(DocumentoEtiquetas, { etiquetas, empresa: nome })), nome: `Etiquetas ${p.numero}.pdf` }
}
