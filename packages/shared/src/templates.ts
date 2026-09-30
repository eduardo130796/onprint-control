import type { VariavelTemplate } from './enums'

/** Substitui {{variavel}} pelos valores informados; variáveis sem valor ficam em branco. */
export function preencherTemplate(
  conteudo: string,
  valores: Partial<Record<VariavelTemplate, string>>,
): string {
  return conteudo.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_trecho, nome: string) => {
    return valores[nome as VariavelTemplate] ?? ''
  })
}
