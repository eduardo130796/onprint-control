import { Link } from 'react-router-dom'
import { CalendarClock, ExternalLink, MapPin, Pencil, Printer, Store, User, Wrench } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, type Pedido } from '@onprint/shared'
import { BotaoCartao } from '@/components/shared/kanban/BotaoCartao'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { cn } from '@/lib/utils'

export interface AcoesCartaoPedido {
  onAbrir: (p: Pedido) => void
  onEditar: (p: Pedido) => void
  onImprimir: (p: Pedido) => void
  imprimindo: boolean
}

const FINANCEIRO = { pendente: ['Pendente', 'bg-slate-100 text-texto-secundario'], parcial: ['Pago em parte', 'bg-amber-100 text-amber-800'], pago: ['Pago', 'bg-green-100 text-green-800'] } as const
const ENTREGA = { retirada: [Store, 'Retirada'], entrega: [MapPin, 'Entrega'], instalacao: [Wrench, 'Instalação'] } as const

/** Barra de progresso fina com rótulo (arte aprovada, OPs concluídas, valor pago). */
function Progresso({ rotulo, feito, total, cor = 'bg-marca' }: { rotulo: string; feito: number; total: number; cor?: string }) {
  const pct = total > 0 ? Math.min(100, Math.round((feito / total) * 100)) : 0
  return (
    <div>
      <div className="flex justify-between text-[11px] text-texto-secundario">
        <span>{rotulo}</span>
        <span className="tabular-nums">
          {feito}/{total}
        </span>
      </div>
      <div className="mt-0.5 h-1.5 overflow-hidden rounded-full bg-fundo">
        <div className={cn('h-full rounded-full', cor)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Cartão do pedido no kanban: itens principais, andamento da arte e da produção, pagamento, prazo e atalhos. */
export function CartaoPedido({ pedido: p, acoes }: { pedido: Pedido; acoes: AcoesCartaoPedido }) {
  const [rotuloFin, corFin] = FINANCEIRO[p.statusFinanceiro]
  const [IconeEntrega, rotuloEntrega] = ENTREGA[p.tipoEntrega]
  const pctPago = Number(p.total) > 0 ? Math.min(100, (Number(p.valorPago) / Number(p.total)) * 100) : 0
  const r = p.resumo
  return (
    <article className={cn('rounded-xl border bg-card p-3.5 text-sm shadow-sm transition-shadow hover:shadow-md', p.atrasado ? 'border-coral/60' : 'border-transparent')}>
      <div className="flex items-center justify-between gap-2">
        <Link to={`/pedidos/${p.id}`} className="font-mono text-xs font-semibold text-grafite hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {p.numero}
        </Link>
        <span className="font-semibold tabular-nums">{formatarMoeda(p.total)}</span>
      </div>
      <p className="mt-0.5 truncate text-[15px] font-semibold" title={p.cliente.nome}>
        {p.cliente.nome}
      </p>
      {r && r.principais.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-texto-secundario">
          {r.principais.map((i) => (
            <li key={i} className="truncate" title={i}>
              {i}
            </li>
          ))}
          {r.itens > r.principais.length && <li>+ {r.itens - r.principais.length} item(ns)</li>}
        </ul>
      )}
      {r && r.ops > 0 && (
        <div className="mt-2.5 grid grid-cols-2 gap-3">
          <Progresso rotulo="Arte aprovada" feito={r.artesAprovadas} total={r.artes} />
          <Progresso rotulo="OPs concluídas" feito={r.opsConcluidas} total={r.ops} cor="bg-sky-500" />
        </div>
      )}
      <div className="mt-2.5 flex items-center gap-2">
        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-medium', corFin)}>{rotuloFin}</span>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fundo" title={`Pago ${formatarMoeda(p.valorPago)} de ${formatarMoeda(p.total)}`}>
          <div className="h-full rounded-full bg-green-500" style={{ width: `${pctPago}%` }} />
        </div>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-secundario">
        <span className={cn('inline-flex items-center gap-1', p.atrasado && 'font-medium text-coral-escuro')}>
          <CalendarClock className="h-3.5 w-3.5" /> {formatarDataSimples(p.dataPrevistaEntrega)}
        </span>
        <span className="inline-flex items-center gap-1">
          <IconeEntrega className="h-3.5 w-3.5" /> {rotuloEntrega}
        </span>
        {p.vendedor && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" /> {p.vendedor.nome.split(' ')[0]}
          </span>
        )}
        {p.atrasado && <SeloAtraso />}
        <SeloPrioridade prioridade={p.prioridade} />
      </div>
      <div className="-mx-1 mt-2.5 flex flex-wrap gap-1 border-t border-border pt-2">
        <BotaoCartao icone={ExternalLink} rotulo="Abrir" onClick={() => acoes.onAbrir(p)} />
        <BotaoCartao icone={Pencil} rotulo="Editar" onClick={() => acoes.onEditar(p)} />
        <BotaoCartao icone={Printer} rotulo="Imprimir" onClick={() => acoes.onImprimir(p)} carregando={acoes.imprimindo} />
      </div>
    </article>
  )
}
