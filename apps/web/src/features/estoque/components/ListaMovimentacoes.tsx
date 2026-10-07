import { Link } from 'react-router-dom'
import { TIPO_MOVIMENTACAO_ROTULOS, formatarDataHora, type MovimentacaoEstoque } from '@onprint/shared'
import { formatarQuantidade } from '@/lib/quantidade'
import { cn } from '@/lib/utils'

/** Extrato compacto (kardex): data, tipo, quantidade com sinal, saldo resultante e origem. */
export function ListaMovimentacoes({ movimentacoes, mostrarProduto }: { movimentacoes: MovimentacaoEstoque[]; mostrarProduto?: boolean }) {
  if (movimentacoes.length === 0) return <p className="py-6 text-center text-sm text-texto-secundario">Nenhuma movimentação.</p>
  return (
    <ul className="divide-y divide-border text-sm">
      {movimentacoes.map((m) => {
        const entra = Number(m.quantidade) > 0
        return (
          <li key={m.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
            <span className="w-32 shrink-0 text-xs text-texto-secundario">{formatarDataHora(m.createdAt)}</span>
            <span className="min-w-0 flex-1">
              <span className="font-medium">{TIPO_MOVIMENTACAO_ROTULOS[m.tipo]}</span>
              {mostrarProduto && <span> · {m.produto.nome}</span>}
              <span className="text-texto-secundario"> · {m.local.nome}</span>
              {(m.motivo || m.op || m.pedido || m.entrada) && (
                <span className="block text-xs text-texto-secundario">
                  {m.motivo}
                  {m.op && (
                    <Link to={`/producao/ordens/${m.op.id}`} className="ml-1 text-marca-escuro hover:underline">
                      {m.op.numero}
                    </Link>
                  )}
                  {m.pedido && !m.op && (
                    <Link to={`/pedidos/${m.pedido.id}`} className="ml-1 text-marca-escuro hover:underline">
                      {m.pedido.numero}
                    </Link>
                  )}
                  {m.usuario && ` · ${m.usuario.nome}`}
                </span>
              )}
            </span>
            <span className={cn('w-28 text-right font-medium', entra ? 'text-green-800' : 'text-coral-escuro')}>
              {entra ? '+' : ''}
              {formatarQuantidade(m.quantidade, m.produto.unidade)}
            </span>
            <span className="w-28 text-right text-xs text-texto-secundario">saldo {formatarQuantidade(m.saldoApos, m.produto.unidade)}</span>
          </li>
        )
      })}
    </ul>
  )
}
