import type { FonteTexto, PesoTexto } from '@onprint/shared'

/** Fontes do texto do sistema (todas variáveis e empacotadas: funcionam sem internet) */
export const FONTES: Record<FonteTexto, { nome: string; descricao: string; familia: string }> = {
  inter: { nome: 'Inter', descricao: 'Moderna e neutra', familia: "'Inter Variable', 'Inter', system-ui, sans-serif" },
  jakarta: { nome: 'Plus Jakarta', descricao: 'Elegante e sofisticada', familia: "'Plus Jakarta Sans Variable', system-ui, sans-serif" },
  lexend: { nome: 'Lexend', descricao: 'Feita para leitura confortável', familia: "'Lexend Variable', system-ui, sans-serif" },
  nunito: { nome: 'Nunito Sans', descricao: 'Arredondada e suave', familia: "'Nunito Sans Variable', system-ui, sans-serif" },
}

/** Pesos usados pelas classes font-normal/medium/semibold/bold/extrabold em cada opção */
export const PESOS: Record<PesoTexto, { nome: string; descricao: string; valores: [number, number, number, number, number] }> = {
  leve: { nome: 'Leve', descricao: 'Mais fino, descansa a vista', valores: [350, 430, 520, 620, 720] },
  normal: { nome: 'Normal', descricao: 'Equilibrado', valores: [400, 500, 600, 700, 800] },
  forte: { nome: 'Forte', descricao: 'Mais carregado, fácil de ler', valores: [450, 580, 680, 760, 850] },
}

const VARIAVEIS_PESO = ['--peso-normal', '--peso-medio', '--peso-semi', '--peso-forte', '--peso-extra'] as const

/** Aplica a fonte e o peso do usuário no sistema todo; null volta ao padrão (Inter, normal) */
export function aplicarTipografia(fonte: FonteTexto | null, peso: PesoTexto | null) {
  const estilo = document.documentElement.style
  if (fonte && fonte !== 'inter') estilo.setProperty('--fonte-texto', FONTES[fonte].familia)
  else estilo.removeProperty('--fonte-texto')
  VARIAVEIS_PESO.forEach((v, i) => {
    if (peso && peso !== 'normal') estilo.setProperty(v, String(PESOS[peso].valores[i]))
    else estilo.removeProperty(v)
  })
}
