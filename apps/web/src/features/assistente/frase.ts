import type { AssistenteEmpresa, RecursoIA } from '@onprint/shared'

/** "Este mês o Assistente montou 12 itens de orçamento e preencheu 3 produtos" */
export function fraseDoMes(uso: AssistenteEmpresa['uso']): string | null {
  const de = (r: RecursoIA) => uso.porRecurso.find((x) => x.recurso === r)
  const partes = [
    de('orcamento_texto')?.itens ? `montou ${de('orcamento_texto')!.itens} item(ns) de orçamento` : null,
    de('produto_texto')?.itens ? `preencheu ${de('produto_texto')!.itens} produto(s)` : null,
    de('descricao')?.itens ? `escreveu ${de('descricao')!.itens} descrição(ões)` : null,
    de('whatsapp_resposta')?.chamadas ? `leu ${de('whatsapp_resposta')!.chamadas} resposta(s) no WhatsApp` : null,
  ].filter(Boolean)
  if (!partes.length) return null
  const ultima = partes.pop()
  return `Este mês o Assistente ${partes.length ? `${partes.join(', ')} e ${ultima}` : ultima}.`
}
