import { impedimentoDaLinha, itemDaLinha, normalizarDecimal, type ItemLoteInput, type LinhaCadastro } from '@onprint/shared'

/*
 * Regras da tela "Cadastrar vários" (sem React, testáveis): quais linhas vêm marcadas, o que impede o "Criar" e o
 * corpo do POST. O que a API confere de novo (preço, duplicado) é a mesma regra do @onprint/shared.
 */

/** Linhas lidas de uma tabela vêm marcadas (menos as parecidas com um produto do cadastro); modelos, desmarcadas */
export function marcadasIniciais(linhas: LinhaCadastro[]): Set<string> {
  return new Set(linhas.filter((l) => l.origem !== 'modelo' && !l.duplicado).map((l) => l.chave))
}

/** Preço digitado ("1.234,56", "65") → decimal da API ("1234.56"); vazio ou zero = null (falta preço) */
export function precoDoCampo(v: string): string | null {
  const n = Number(normalizarDecimal(v || '0'))
  return Number.isFinite(n) && n > 0 ? n.toFixed(2) : null
}

export interface ParaCriar {
  itens: ItemLoteInput[]
  /** Linhas marcadas que não podem ser criadas ainda (chave → motivo) */
  impedidas: Map<string, string>
}

/** As linhas marcadas viram itens do POST; as marcadas sem nome ou preço impedem o "Criar" (com o motivo) */
export function paraCriar(linhas: LinhaCadastro[], marcadas: ReadonlySet<string>): ParaCriar {
  const impedidas = new Map<string, string>()
  const itens: ItemLoteInput[] = []
  for (const l of linhas) {
    if (!marcadas.has(l.chave)) continue
    const motivo = impedimentoDaLinha(l)
    if (motivo) impedidas.set(l.chave, motivo)
    // Marcada com o aviso de nome parecido: a pessoa viu e quer criar mesmo assim
    else itens.push(itemDaLinha(l, Boolean(l.duplicado)))
  }
  return { itens, impedidas }
}
