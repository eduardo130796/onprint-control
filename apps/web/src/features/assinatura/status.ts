import { formatarDataSimples, type AcessoAssinatura, type SituacaoAssinatura } from '@onprint/shared'

export type TomStatus = 'verde' | 'azul' | 'violeta' | 'ambar' | 'coral' | 'vermelho' | 'cinza'

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * Situação da assinatura em poucas palavras e o tom de cor (chip do topo, pílula do cartão, cabeçalho).
 * Uma regra só para todas as telas: o que a pessoa vê em cima é o mesmo que vê em "Minha assinatura".
 */
export function statusDaAssinatura(acesso: Pick<AcessoAssinatura, 'nivel' | 'diasAtraso' | 'diasRestantesTeste'> & { motivo: string }, extra: { situacao?: SituacaoAssinatura; cancelarEm?: string | null } = {}): { rotulo: string; curto: string; tom: TomStatus } {
  const d = acesso.diasRestantesTeste ?? 0
  if (acesso.motivo === 'renovacao_pendente') return { rotulo: 'Aguardando o 1º pagamento', curto: 'Aguardando pagamento', tom: 'ambar' }
  if (extra.situacao === 'cancelada' || acesso.motivo === 'cancelada') return { rotulo: 'Cancelada', curto: 'Cancelada', tom: 'cinza' }
  if (acesso.motivo === 'bloqueio_manual') return { rotulo: 'Suspensa', curto: 'Suspensa', tom: 'vermelho' }
  if (acesso.nivel === 'bloqueado') return { rotulo: 'Bloqueada por atraso', curto: 'Bloqueada', tom: 'vermelho' }
  if (acesso.nivel === 'somente_leitura') return { rotulo: 'Somente leitura', curto: 'Só leitura', tom: 'coral' }
  if (acesso.motivo === 'cortesia') {
    if (acesso.diasRestantesTeste === null) return { rotulo: 'Cortesia', curto: 'Cortesia', tom: 'violeta' }
    return { rotulo: d === 0 ? 'Cortesia · último dia' : `Cortesia · ${plural(d, 'dia restante', 'dias restantes')}`, curto: d === 0 ? 'Cortesia: último dia' : `Cortesia: ${plural(d, 'dia', 'dias')}`, tom: acesso.nivel === 'aviso' ? 'ambar' : 'violeta' }
  }
  if (acesso.motivo === 'teste' || acesso.motivo === 'teste_acabando') {
    return { rotulo: d === 0 ? 'Teste grátis · último dia' : `Teste grátis · ${plural(d, 'dia restante', 'dias restantes')}`, curto: d === 0 ? 'Teste: último dia' : `Teste: ${plural(d, 'dia', 'dias')}`, tom: acesso.nivel === 'aviso' ? 'ambar' : 'azul' }
  }
  if (acesso.motivo === 'teste_expirado') return { rotulo: 'Teste grátis terminou', curto: 'Teste terminou', tom: 'ambar' }
  if (acesso.motivo === 'cortesia_encerrada') return { rotulo: 'Cortesia terminou', curto: 'Cortesia terminou', tom: 'ambar' }
  if (acesso.nivel === 'aviso') return { rotulo: `Vencida há ${plural(acesso.diasAtraso, 'dia', 'dias')}`, curto: `Vencida há ${plural(acesso.diasAtraso, 'dia', 'dias')}`, tom: 'ambar' }
  if (extra.cancelarEm) return { rotulo: `Ativa até ${formatarDataSimples(extra.cancelarEm)}`, curto: `Até ${formatarDataSimples(extra.cancelarEm)}`, tom: 'cinza' }
  if (acesso.motivo === 'liberacao_manual') return { rotulo: 'Liberada pelo suporte', curto: 'Liberada', tom: 'azul' }
  return { rotulo: 'Ativa · em dia', curto: 'Em dia', tom: 'verde' }
}

/** Cores da situação: `ponto`/`chip` sobre o topo escuro; `pontoClaro` sobre fundo claro (menu da conta) */
export const TOM_ASSINATURA: Record<TomStatus, { ponto: string; chip: string; pontoClaro: string }> = {
  verde: { ponto: 'bg-marca', chip: 'text-white/85 ring-white/15 hover:bg-white/10', pontoClaro: 'bg-marca' },
  azul: { ponto: 'bg-sky-400', chip: 'bg-sky-400/10 text-sky-100 ring-sky-300/30 hover:bg-sky-400/20', pontoClaro: 'bg-sky-500' },
  violeta: { ponto: 'bg-violet-400', chip: 'bg-violet-400/10 text-violet-100 ring-violet-300/30 hover:bg-violet-400/20', pontoClaro: 'bg-violet-500' },
  ambar: { ponto: 'bg-amber-400 animate-pulse', chip: 'bg-amber-400/15 text-amber-100 ring-amber-300/40 hover:bg-amber-400/25', pontoClaro: 'bg-amber-500' },
  coral: { ponto: 'bg-coral animate-pulse', chip: 'bg-coral/20 text-red-100 ring-coral/50 hover:bg-coral/30', pontoClaro: 'bg-coral' },
  vermelho: { ponto: 'bg-red-500', chip: 'bg-red-500/20 text-red-100 ring-red-400/50 hover:bg-red-500/30', pontoClaro: 'bg-red-500' },
  cinza: { ponto: 'bg-white/50', chip: 'text-white/70 ring-white/15 hover:bg-white/10', pontoClaro: 'bg-slate-400' },
}
