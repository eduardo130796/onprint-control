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
  /**
   * Quem vende o serviço (exigido no site pelo Decreto 7.962/2013): nome completo e CPF enquanto for pessoa física,
   * razão social e CNPJ quando abrir a empresa. Aparece só nos termos de uso e na privacidade (fora do rodapé, para evitar golpes
   * com o CPF exposto; o rodapé leva aos termos).
   */
  titular: 'Eduardo Roquête Cabral Júnior',
  /** CPF ou CNPJ, com pontuação (ex.: 123.456.789-00 ou 12.345.678/0001-90) */
  documento: '030.154.681-97',
  /** Atendimento, privacidade (DPO) e comercial */
  contato: 'contato@grafygo.com.br',
}

/** "CPF 123.456.789-00" ou "CNPJ 12.345.678/0001-90" (vazio se não preenchido) */
export function documentoTitular(): string {
  const d = MARCA.documento.trim()
  if (!d) return ''
  return `${d.replace(/\D/g, '').length === 11 ? 'CPF' : 'CNPJ'} ${d}`
}

/** Titular com o documento, para os textos legais (sem titular, a marca) */
export function titularCompleto(): string {
  if (!MARCA.titular.trim()) return MARCA.empresa
  const doc = documentoTitular()
  return doc ? `${MARCA.titular.trim()}, ${doc}` : MARCA.titular.trim()
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
