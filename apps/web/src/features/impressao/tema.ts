import { Font, StyleSheet } from '@react-pdf/renderer'
import inter400 from '@fontsource/inter/files/inter-latin-400-normal.woff?url'
import inter500 from '@fontsource/inter/files/inter-latin-500-normal.woff?url'
import inter600 from '@fontsource/inter/files/inter-latin-600-normal.woff?url'
import inter700 from '@fontsource/inter/files/inter-latin-700-normal.woff?url'
import manrope600 from '@fontsource/manrope/files/manrope-latin-600-normal.woff?url'
import manrope700 from '@fontsource/manrope/files/manrope-latin-700-normal.woff?url'
import manrope800 from '@fontsource/manrope/files/manrope-latin-800-normal.woff?url'
import { DESTAQUE } from './corDocumentos'

// Identidade dos documentos impressos (orçamento, pedido, recibo, etiquetas, relatórios).
// As fontes vão junto com o sistema (funciona sem internet): Manrope nos títulos, Inter no texto e nos números.

Font.register({
  family: 'Inter',
  fonts: [
    { src: inter400, fontWeight: 400 },
    { src: inter500, fontWeight: 500 },
    { src: inter600, fontWeight: 600 },
    { src: inter700, fontWeight: 700 },
  ],
})
Font.register({
  family: 'Manrope',
  fonts: [
    { src: manrope600, fontWeight: 600 },
    { src: manrope700, fontWeight: 700 },
    { src: manrope800, fontWeight: 800 },
  ],
})
// Sem hifenização automática (palavras inteiras quebram melhor em português)
Font.registerHyphenationCallback((palavra) => [palavra])

/**
 * Paleta dos documentos: cinza escuro (principal) + a cor do tema da empresa (destaque, lida na hora de gerar:
 * use em estilo inline, não dentro do StyleSheet.create, que guarda o valor de quando o módulo carregou).
 */
export const COR = {
  /** Títulos, faixa do topo, faixa do total */
  principal: '#2B3036',
  principalEscuro: '#1E2226',
  /** Cor do tema: faixa, selos, bordas de destaque (decorativo) */
  get destaque() {
    return DESTAQUE.cor
  },
  /** Cor do tema para texto sobre fundo claro (rótulos de tipo, links) */
  get destaqueTexto() {
    return DESTAQUE.escuro
  },
  /** Texto sobre a cor de destaque (branco nas cores escuras, escuro nas claras) */
  get destaqueContraste() {
    return DESTAQUE.contraste
  },
  tinta: '#1F2328',
  suave: '#4A5259',
  claro: '#7A838A',
  linha: '#E1E5E8',
  fundo: '#F3F5F6',
  get fundoDestaque() {
    return DESTAQUE.suave
  },
  /** Laranja: pequenos detalhes da identidade (lasca na faixa do topo) */
  laranja: '#F97316',
  coral: '#C8322F',
  branco: '#FFFFFF',
}

/**
 * Margem lateral padrão das páginas A4 (pt).
 * Atenção: não pôr lineHeight na Page/View — o react-pdf o converte em altura fixa herdada por todos os textos
 * (títulos grandes se sobrepõem) e some com o rodapé absoluto. lineHeight só em textos específicos.
 */
export const MARGEM = 40

export const base = StyleSheet.create({
  pagina: { fontFamily: 'Inter', fontSize: 9, color: COR.tinta, paddingTop: 0, paddingBottom: 64, paddingHorizontal: MARGEM },
  titulo: { fontFamily: 'Manrope', fontWeight: 800, color: COR.principal },
  rotulo: { fontSize: 6.8, fontWeight: 600, color: COR.suave, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 3 },
  forte: { fontWeight: 600 },
  suave: { color: COR.suave },
  secao: { fontFamily: 'Manrope', fontWeight: 700, fontSize: 10.5, color: COR.principal, marginTop: 18, marginBottom: 6 },
  numero: { textAlign: 'right' },
})
