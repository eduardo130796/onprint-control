/**
 * Imprime um PDF sem baixar: carrega num iframe invisível e abre o diálogo de impressão do navegador.
 * Se o navegador não deixar imprimir pelo iframe, abre o PDF numa aba nova (dali, Ctrl+P).
 */
export function imprimirPdf(blob: Blob) {
  const url = URL.createObjectURL(blob)
  const quadro = document.createElement('iframe')
  quadro.setAttribute('aria-hidden', 'true')
  quadro.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none'
  quadro.src = url
  quadro.onload = () => {
    setTimeout(() => {
      try {
        quadro.contentWindow?.focus()
        quadro.contentWindow?.print()
      } catch {
        window.open(url, '_blank', 'noopener')
      }
    }, 150)
  }
  document.body.appendChild(quadro)
  // Remover cedo cancelaria a impressão: limpa depois de um tempo folgado
  setTimeout(() => {
    quadro.remove()
    URL.revokeObjectURL(url)
  }, 120_000)
}
