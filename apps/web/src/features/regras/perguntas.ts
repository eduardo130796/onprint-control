import { normalizarDecimal, type RespostasRegras } from '@onprint/shared'
import { decimalParaCampo, decimalParaInput } from '@/lib/mascaras'

/*
 * As perguntas das regras comerciais na tela: os números como a pessoa digita ("5", "2,5", "R$ 50,00"), sem separador
 * de milhar nas quantidades ("1000" continua 1000). A API recebe os decimais dela (normalizarDecimal).
 */

/** Respostas da API → campos da tela */
export function respostasParaTela(r: RespostasRegras): RespostasRegras {
  const pct = (v: string) => decimalParaCampo(v, 2)
  return {
    quantidade: { ...r.quantidade, faixas: r.quantidade.faixas.map((f) => ({ aPartirDe: decimalParaCampo(f.aPartirDe, 3), percentual: pct(f.percentual) })) },
    aVista: { ...r.aVista, percentual: pct(r.aVista.percentual) },
    especiais: { ...r.especiais, lista: r.especiais.lista.map((e) => ({ etiqueta: e.etiqueta, percentual: pct(e.percentual) })) },
    urgencia: { ...r.urgencia, percentual: pct(r.urgencia.percentual), dias: decimalParaCampo(r.urgencia.dias, 0) },
    minimo: { ...r.minimo, valor: decimalParaInput(r.minimo.valor) },
    limite: { ...r.limite, percentual: pct(r.limite.percentual) },
  }
}

/** Campos da tela → corpo da API (vazio vira "0", que a conferência recusa com a mensagem certa) */
export function respostasParaApi(t: RespostasRegras): RespostasRegras {
  const d = (v: string) => normalizarDecimal(v)
  return {
    quantidade: { ...t.quantidade, faixas: t.quantidade.faixas.map((f) => ({ aPartirDe: d(f.aPartirDe), percentual: d(f.percentual) })) },
    aVista: { ...t.aVista, percentual: d(t.aVista.percentual) },
    especiais: { ...t.especiais, lista: t.especiais.lista.map((e) => ({ etiqueta: e.etiqueta.trim(), percentual: d(e.percentual) })) },
    urgencia: { ...t.urgencia, percentual: d(t.urgencia.percentual), dias: d(t.urgencia.dias) },
    minimo: { ...t.minimo, valor: d(t.minimo.valor) },
    limite: { ...t.limite, percentual: d(t.limite.percentual) },
  }
}
