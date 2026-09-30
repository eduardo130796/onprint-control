import { createElement } from 'react'
import { pdf } from '@react-pdf/renderer'
import type { EmpresaConfig, OrcamentoDetalhe } from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'
import { baixarArquivo } from '@/lib/csv'
import { DocumentoOrcamento } from './DocumentoOrcamento'

// Carregado sob demanda (import dinâmico): a biblioteca de PDF só é baixada quando o usuário clica em "PDF".

/** Logo como data URL (o PDF só aceita PNG/JPG; SVG é ignorado). */
async function carregarLogo(empresa: EmpresaConfig): Promise<string | null> {
  if (!empresa.logoArquivoId) return null
  try {
    const { url } = await arquivosApi.urlTemporaria(empresa.logoArquivoId)
    const blob = await (await fetch(url)).blob()
    if (!['image/png', 'image/jpeg'].includes(blob.type)) return null
    return await new Promise((resolve) => {
      const leitor = new FileReader()
      leitor.onload = () => resolve(leitor.result as string)
      leitor.onerror = () => resolve(null)
      leitor.readAsDataURL(blob)
    })
  } catch {
    return null
  }
}

export async function baixarPdfOrcamento(o: OrcamentoDetalhe, empresa: EmpresaConfig) {
  const logo = await carregarLogo(empresa)
  const blob = await pdf(createElement(DocumentoOrcamento, { o, empresa, logo }) as Parameters<typeof pdf>[0]).toBlob()
  baixarArquivo(blob, `${o.numero} - ${o.cliente.nome}.pdf`, 'application/pdf')
}
