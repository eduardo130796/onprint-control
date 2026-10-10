/**
 * Marca do sistema (quem produz a GrafyGo): logo, assinatura discreta no rodapé do menu e a janela "Sobre o sistema".
 * A marca em destaque nas telas é a da gráfica cliente; esta aparece como autoria, direitos e no login.
 */
export const MARCA = {
  produto: 'GrafyGo',
  /** Titular dos direitos autorais */
  empresa: 'GrafyGo',
  slogan: 'Gestão inteligente para quem transforma ideias.',
  descricao: 'Sistema de gestão para gráficas e comunicação visual',
  anoInicio: 2026,
}

/** "2026" ou "2026–2028" */
export function anosDireitos(agora = new Date()) {
  const ano = agora.getFullYear()
  return ano > MARCA.anoInicio ? `${MARCA.anoInicio}–${ano}` : String(MARCA.anoInicio)
}

/** Abre a janela "Sobre o sistema" (montada uma vez no layout) de qualquer lugar: rodapé do menu, menu da conta */
export const EVENTO_SOBRE = 'onprint:sobre-sistema'
export function abrirSobreSistema() {
  window.dispatchEvent(new Event(EVENTO_SOBRE))
}
