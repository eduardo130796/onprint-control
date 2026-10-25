/*
 * Comparação simples de textos em português (sem IA): usada para escolher os produtos do catálogo que vão no prompt
 * quando o catálogo é grande e pelo provedor simulado para imitar o modelo. Sem acento, minúsculo, sem palavras
 * comuns e no singular aproximado ("cartões" → "cartao", "banners" → "banner").
 */

const COMUNS = new Set([
  'com', 'para', 'pra', 'pro', 'uma', 'umas', 'uns', 'por', 'cada', 'que', 'mais', 'tem', 'sem', 'dos', 'das', 'nos', 'nas', 'num', 'numa',
  'quero', 'queria', 'preciso', 'gostaria', 'orcamento', 'favor', 'tudo', 'bem', 'boa', 'bom', 'dia', 'tarde', 'noite', 'obrigado', 'obrigada',
  'unidade', 'unidades', 'peca', 'pecas', 'tamanho', 'medida', 'cliente', 'entrega', 'entregar', 'ate', 'ser', 'sao', 'esta', 'esse', 'essa', 'isso',
  'aqui', 'ola', 'meu', 'minha', 'zap', 'whats', 'whatsapp', 'telefone', 'fone', 'contato', 'email', 'numero', 'omitido',
])

export const semAcentos = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

function singular(p: string): string {
  if (p.length <= 3) return p
  if (p.endsWith('oes') || p.endsWith('aes')) return `${p.slice(0, -3)}ao`
  if (p.endsWith('ns')) return `${p.slice(0, -2)}m`
  if (/[rz]es$/.test(p)) return p.slice(0, -2)
  if (p.endsWith('is') && p.length > 5) return `${p.slice(0, -2)}l`
  if (p.endsWith('s') && !p.endsWith('ss')) return p.slice(0, -1)
  return p
}

/** Palavras que contam para comparar (3+ letras, sem números e sem as comuns), sem repetição */
export function palavras(texto: string): string[] {
  return [
    ...new Set(
      semAcentos(texto)
        .split(/[^a-z0-9]+/)
        .filter((p) => p.length >= 3 && !/\d/.test(p) && !COMUNS.has(p))
        .map(singular),
    ),
  ]
}

/** Mesma palavra, ou o mesmo começo (5 letras): "adesivo"/"adesivos", "personalizada"/"personalizado" */
export const parecidas = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && a.slice(0, 5) === b.slice(0, 5))

/** Quantas palavras do alvo aparecem no pedido */
export function pontuar(pedido: string[], alvo: string[]): number {
  return alvo.filter((a) => pedido.some((p) => parecidas(p, a))).length
}
