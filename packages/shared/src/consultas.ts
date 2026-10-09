/** Consultas públicas de CEP e CNPJ (feitas pela API; o navegador nunca chama serviços externos). */

/** Endereço devolvido pela consulta de CEP (CEP só com dígitos, UF em maiúsculas). */
export interface EnderecoCep {
  cep: string
  logradouro: string
  bairro: string
  cidade: string
  uf: string
}

/** Dados públicos do CNPJ na Receita Federal. Textos vazios viram ''; telefone e CEP só com dígitos. */
export interface DadosCnpj {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string
  /** Situação cadastral em maiúsculas (ATIVA, BAIXADA, INAPTA, SUSPENSA, NULA) */
  situacao: string
  ativa: boolean
  email: string
  telefone: string
  endereco: EnderecoCep & { numero: string; complemento: string }
  /** Só quando o serviço informa uma inscrição estadual ativa na UF da empresa */
  inscricaoEstadual?: string
}

const CONECTIVOS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'di', 'du'])
const ROMANO = /^(?=[ivxlc]+$)c{0,3}(xc|xl|l?x{0,3})(ix|iv|v?i{0,3})$/

/**
 * "RUA XV DE NOVEMBRO" → "Rua XV de Novembro". A Receita devolve tudo em maiúsculas;
 * texto que já vem com minúsculas é mantido como está (o serviço já capitalizou).
 */
export function capitalizarNome(texto: string | null | undefined): string {
  const limpo = (texto ?? '').trim().replace(/\s+/g, ' ')
  if (!limpo || /\p{Ll}/u.test(limpo)) return limpo
  return limpo
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((palavra, i) => {
      if (i > 0 && CONECTIVOS.has(palavra)) return palavra
      // Algarismo romano, mesmo com pontuação colada ("TORRE I, II, III")
      const nucleo = palavra.replace(/[^\p{L}]+$/u, '')
      if (nucleo.length > 1 && ROMANO.test(nucleo)) return palavra.toUpperCase()
      // Primeira letra e a letra depois de apóstrofo ou hífen (D'Oeste, Guarda-Mor)
      return palavra.replace(/(^|['’-])(\p{L})/gu, (_, sep: string, letra: string) => sep + letra.toLocaleUpperCase('pt-BR'))
    })
    .join(' ')
}
