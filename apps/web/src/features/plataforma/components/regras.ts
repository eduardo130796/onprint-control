import { formatarDataSimples, hojeISO, type CupomInput, type CupomPlataforma, type EmpresaPlataformaResumo } from '@onprint/shared'

/** Linha curta abaixo do selo: dias de atraso, fim do teste ou a mensagem do acesso. */
export function detalheSituacao(e: EmpresaPlataformaResumo): string | null {
  if (e.diasAtraso > 0 && e.categoria !== 'cancelada') return `vencida há ${e.diasAtraso} ${e.diasAtraso === 1 ? 'dia' : 'dias'}`
  if (e.categoria === 'teste' && e.testeAte) return `teste até ${formatarDataSimples(e.testeAte)}`
  if (e.categoria === 'em_dia' || (e.categoria === 'cortesia' && !e.testeAte)) return null
  return e.mensagem
}

export type SituacaoCupom = 'ativo' | 'pausado' | 'expirado' | 'esgotado'
export const SITUACAO_CUPOM: Record<SituacaoCupom, { rotulo: string; cor: string; ponto: string }> = {
  ativo: { rotulo: 'Ativo', cor: 'bg-marca-suave text-marca-escuro ring-marca/30', ponto: 'bg-marca' },
  pausado: { rotulo: 'Pausado', cor: 'bg-slate-100 text-texto-secundario ring-slate-300', ponto: 'bg-slate-400' },
  expirado: { rotulo: 'Expirado', cor: 'bg-amber-50 text-amber-900 ring-amber-300', ponto: 'bg-amber-500' },
  esgotado: { rotulo: 'Esgotado', cor: 'bg-coral/10 text-coral-escuro ring-coral/30', ponto: 'bg-coral' },
}

export function situacaoCupom(c: Pick<CupomPlataforma, 'ativo' | 'validoAte' | 'limiteUsos' | 'usos'>): SituacaoCupom {
  if (!c.ativo) return 'pausado'
  if (c.validoAte && c.validoAte < hojeISO()) return 'expirado'
  if (c.limiteUsos != null && c.usos >= c.limiteUsos) return 'esgotado'
  return 'ativo'
}

/** Corpo do PUT a partir do cupom salvo (para pausar/reativar sem abrir o formulário). */
export const paraEntrada = (c: CupomPlataforma, mudancas: Partial<CupomInput> = {}): CupomInput => ({
  codigo: c.codigo,
  descricao: c.descricao,
  tipo: c.tipo,
  valor: c.valor,
  duracaoMeses: c.duracaoMeses,
  validoAte: c.validoAte,
  limiteUsos: c.limiteUsos,
  planos: c.planos,
  ativo: c.ativo,
  ...mudancas,
})
