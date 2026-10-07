import { formatarTelefone, type EmpresaConfig } from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'

// Utilitários dos PDFs (orçamento, pedido, etiquetas). Só é carregado junto com a biblioteca de PDF.

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

/** Uma etiqueta de entrega (uma por item/OP), pensada para quem vai entregar. */
export interface Etiqueta {
  pedido: string
  op: string | null
  /** Etiqueta N de T (todas as OPs do pedido) */
  indice: number
  totalEtiquetas: number
  /** "Entrega", "Retirada" ou "Instalação" */
  entrega: string
  retirada: boolean
  cliente: string
  telefone: string
  /** Endereço de entrega completo (vazio na retirada) */
  destino: string
  /** Data agendada da entrega ou, sem agenda, a previsão do pedido */
  quando: string
  agendada: boolean
  /** Quem leva (responsável da entrega), se definido */
  entregador: string | null
  /** Saldo a cobrar na entrega ("R$ 240,00"); null = pago */
  cobrar: string | null
  /** Observação da entrega ou do pedido (curta) */
  observacao: string | null
  item: string
  quantidade: string
  medidas: string | null
  /** Outros itens do pedido (conferência dos volumes) */
  outrosItens: string[]
  imagem: string | null
  /** QR code (PNG) que abre o pedido no sistema */
  qr: string | null
  /** Telefone da empresa (dúvidas na entrega) */
  telefoneEmpresa: string
}
