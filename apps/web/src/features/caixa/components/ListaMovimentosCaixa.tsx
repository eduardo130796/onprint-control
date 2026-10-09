import { TIPO_CAIXA_MOVIMENTO_ROTULOS, formatarDataHora, formatarMoeda, type CaixaMovimento, type ResumoFormaCaixa } from '@onprint/shared'
import { cn } from '@/lib/utils'

export function ListaMovimentosCaixa({ movimentos }: { movimentos: CaixaMovimento[] }) {
  if (movimentos.length === 0) return <p className="py-4 text-center text-sm text-texto-secundario">Nenhum movimento.</p>
  return (
    <ul className="divide-y divide-border text-sm">
      {movimentos.map((m) => (
        <li key={m.id} className="flex flex-wrap items-center gap-3 py-2">
          <span className="w-32 text-xs text-texto-secundario">{formatarDataHora(m.createdAt)}</span>
          <span className="w-24 font-medium">{TIPO_CAIXA_MOVIMENTO_ROTULOS[m.tipo]}</span>
          <span className="min-w-0 flex-1 truncate text-xs text-texto-secundario">
            {[m.formaPagamento?.nome ?? 'Dinheiro', m.vendaPdv?.numero, m.contaReceber?.descricao, m.motivo].filter(Boolean).join(' · ')}
          </span>
          <span className={cn('w-24 text-right font-medium', Number(m.valor) < 0 ? 'text-coral-escuro' : 'text-green-800')}>{formatarMoeda(m.valor)}</span>
        </li>
      ))}
    </ul>
  )
}

export function ResumoFormas({ porForma, conferencia }: { porForma: ResumoFormaCaixa[]; conferencia?: ResumoFormaCaixa[] | null }) {
  const linhas = conferencia ?? porForma
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      {linhas.map((p) => (
        <div key={p.formaPagamentoId ?? p.nome} className="rounded-xl bg-fundo p-3 text-sm">
          <p className="text-xs text-texto-secundario">{p.nome}</p>
          <p className="text-lg font-semibold text-tinta">{formatarMoeda(p.calculado)}</p>
          {p.informado !== undefined && (
            <p className={cn('text-xs', Number(p.diferenca) === 0 ? 'text-texto-secundario' : Number(p.diferenca) > 0 ? 'text-green-800' : 'text-coral-escuro')}>
              contado {formatarMoeda(p.informado)} · diferença {formatarMoeda(p.diferenca)}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}
