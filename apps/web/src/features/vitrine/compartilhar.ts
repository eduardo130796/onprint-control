// Baixar ou compartilhar um arquivo gerado no navegador (imagens de divulgação, catálogo em PDF).

/**
 * Compartilha o arquivo pelo menu do sistema (WhatsApp, Instagram…) quando dá; senão baixa.
 * Chame com o arquivo JÁ pronto, direto no clique: o navegador só abre o menu logo após o toque do usuário
 * (gerar antes e compartilhar depois de um await faz ele recusar — 'bloqueado').
 */
export async function compartilharArquivo(blob: Blob, nome: string, titulo: string): Promise<'compartilhado' | 'baixado' | 'cancelado' | 'bloqueado'> {
  const arquivo = new File([blob], nome, { type: blob.type })
  if (typeof navigator.canShare === 'function' && navigator.canShare({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: titulo })
      return 'compartilhado'
    } catch (e) {
      const nomeErro = (e as Error).name
      if (nomeErro === 'AbortError') return 'cancelado'
      if (nomeErro === 'NotAllowedError') return 'bloqueado'
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
