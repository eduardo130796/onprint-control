import { formatarTelefone, type EmpresaConfig } from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'

// Utilitários dos PDFs (orçamento, pedido, etiquetas). Só é carregado junto com a biblioteca de PDF.

export const PETROLEO = '#0B4F5C'
export const TURQUESA = '#0F766E'
export const CINZA = '#5B6472'

/** Imagem como data URL (o PDF só aceita PNG/JPG); null se não der para usar. */
export async function imagemDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null
  try {
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

export async function carregarLogo(empresa: EmpresaConfig): Promise<string | null> {
  if (!empresa.logoArquivoId) return null
  try {
    return await imagemDataUrl((await arquivosApi.urlTemporaria(empresa.logoArquivoId)).url)
  } catch {
    return null
  }
}

export function dadosEmpresa(empresa: EmpresaConfig) {
  const nome = empresa.nomeFantasia || empresa.razaoSocial
  const contato = [formatarTelefone(empresa.whatsapp ?? empresa.telefone), empresa.email, empresa.site].filter(Boolean).join('  ·  ')
  const endereco = [
    empresa.logradouro && `${empresa.logradouro}${empresa.numero ? `, ${empresa.numero}` : ''}`,
    empresa.bairro,
    empresa.cidade && `${empresa.cidade}/${empresa.uf ?? ''}`,
  ]
    .filter(Boolean)
    .join(' - ')
  return { nome, contato, endereco }
}

/** Uma etiqueta de entrega (uma por item/OP). */
export interface Etiqueta {
  pedido: string
  op: string | null
  cliente: string
  telefone: string
  destino: string
  entrega: string
  item: string
  quantidade: string
  medidas: string | null
  previsao: string
  imagem: string | null
}
