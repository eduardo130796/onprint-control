// Baixar ou compartilhar um arquivo gerado no navegador (imagens de divulgação, catálogo em PDF).

/** Compartilha o arquivo pelo menu do celular (WhatsApp, Instagram…) quando dá; senão baixa */
export async function compartilharArquivo(blob: Blob, nome: string, titulo: string): Promise<'compartilhado' | 'baixado' | 'cancelado'> {
  const arquivo = new File([blob], nome, { type: blob.type })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo })
      return 'compartilhado'
    } catch (e) {
      if ((e as Error).name === 'AbortError') return 'cancelado'
    }
  }
  baixarBlob(blob, nome)
  return 'baixado'
}

export function baixarBlob(blob: Blob, nome: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = nome
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** O celular sabe compartilhar arquivos (Web Share com arquivo) */
export function podeCompartilharArquivo(tipo = 'application/pdf') {
  try {
    return typeof navigator.canShare === 'function' && navigator.canShare({ files: [new File([''], 'teste', { type: tipo })] })
  } catch {
    return false
  }
}
