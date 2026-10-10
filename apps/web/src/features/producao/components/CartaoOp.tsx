import { Link } from 'react-router-dom'
import { CalendarClock, ClipboardList, Clock, Cpu, ExternalLink, Hourglass, Pencil, Ruler, Tag, User } from 'lucide-react'
import { formatarDataSimples, type OrdemProducao } from '@onprint/shared'
import { BotaoCartao } from '@/components/shared/kanban/BotaoCartao'
import { Checkbox } from '@/components/ui/form-controls'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { formatarDuracao } from '@/lib/datas'
import { cn } from '@/lib/utils'

export interface AcoesCartaoOp {
  onAbrir: (op: OrdemProducao) => void
  /** Ausente para quem não pode editar a OP */
  onEditar?: (op: OrdemProducao) => void
  onEtiqueta: (op: OrdemProducao) => void
}

const num = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/**
 * Cartão da OP no kanban (estilo Trello): a arte como capa, cliente, item, medidas, prazo, máquina,
 * responsável, horas previstas, tempo na etapa e atalhos.
 */
/** Modo seleção (etiquetas de várias OPs): caixa de marcar no canto do cartão. */
export interface SelecaoCartaoOp {
  marcado: boolean
  onAlternar: (op: OrdemProducao) => void
}

export function CartaoOp({ op, acoes, selecao }: { op: OrdemProducao; acoes?: AcoesCartaoOp; selecao?: SelecaoCartaoOp }) {
  const prazo = op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega
  const naEtapa = Math.max(0, (Date.now() - new Date(op.entrouEtapaEm).getTime()) / 1000)
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border bg-card text-sm shadow-sm transition-shadow hover:shadow-md',
        op.atrasada ? 'border-coral/60' : 'border-transparent',
        selecao?.marcado && 'ring-2 ring-marca',
      )}
    >
      {selecao && (
        <span className="absolute left-2 top-2 z-10 flex h-7 w-7 items-center justify-center rounded-lg bg-card/95 shadow-sm">
          <Checkbox
            checked={selecao.marcado}
            onChange={() => selecao.onAlternar(op)}
            onPointerDown={(e) => e.stopPropagation()}
            className="h-[1.125rem] w-[1.125rem]"
            aria-label={`Selecionar ${op.numero}`}
          />
        </span>
      )}
      {op.arte?.miniaturaUrl && (
        <div className="h-32 bg-fundo">
          <img src={op.arte.miniaturaUrl} alt={`Arte de ${op.item.descricao}`} className="h-full w-full object-cover" loading="lazy" draggable={false} />
        </div>
      )}
      <div className="p-3.5">
        <div className="flex items-center justify-between gap-2">
          <Link
            to={`/producao/ordens/${op.id}`}
            className={cn('font-mono text-xs font-semibold text-tinta hover:underline', selecao && !op.arte?.miniaturaUrl && 'ml-8')}
            onPointerDown={(e) => e.stopPropagation()}
          >
            {op.numero}
          </Link>
          <Link to={`/pedidos/${op.pedidoId}`} className="font-mono text-[0.6875rem] text-texto-secundario hover:underline" onPointerDown={(e) => e.stopPropagation()}>
            {op.pedido.numero}
          </Link>
        </div>
        <p className="mt-0.5 truncate text-[0.9375rem] font-semibold" title={op.pedido.cliente.nome}>
          {op.pedido.cliente.nome}
        </p>
        <p className="text-xs text-texto-secundario" title={op.item.descricao}>
          {num(op.quantidade)} × {op.item.descricao}
        </p>
        {op.largura && (
          <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-texto-secundario">
            <Ruler className="h-3.5 w-3.5" /> {num(op.largura)} × {num(op.altura ?? '0')} m · {num(op.areaM2)} m²
          </p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {op.atrasada && <SeloAtraso />}
          <SeloPrioridade prioridade={op.prioridade} />
          <StatusBadge entidade="arte" codigo={op.arte?.status ?? 'aguardando_arquivo'} className="text-[0.6875rem]" />
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-texto-secundario">
          <span className={cn('inline-flex items-center gap-1', op.atrasada && 'font-medium text-coral-escuro')}>
            <CalendarClock className="h-3.5 w-3.5" /> {formatarDataSimples(prazo)}
          </span>
          <span className="inline-flex items-center gap-1" title="Tempo nesta etapa">
            <Hourglass className="h-3.5 w-3.5" /> {formatarDuracao(naEtapa)} aqui
          </span>
          {op.maquina && (
            <span className="inline-flex min-w-0 items-center gap-1">
              <Cpu className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{op.maquina.nome}</span>
            </span>
          )}
          {Number(op.horasEstimadas) > 0 && (
            <span className="inline-flex items-center gap-1" title="Horas previstas">
              <Clock className="h-3.5 w-3.5" /> {num(op.horasEstimadas)} h
            </span>
          )}
          {op.responsavel && (
            <span className="inline-flex items-center gap-1">
              <User className="h-3.5 w-3.5" /> {op.responsavel.nome.split(' ')[0]}
            </span>
          )}
        </div>
        {acoes && (
          <div className="-mx-1 mt-2.5 flex flex-wrap gap-1 border-t border-border pt-2">
            <BotaoCartao icone={ExternalLink} rotulo="Abrir" onClick={() => acoes.onAbrir(op)} />
            {acoes.onEditar && <BotaoCartao icone={Pencil} rotulo="Editar" onClick={() => acoes.onEditar?.(op)} />}
            <BotaoCartao icone={ClipboardList} rotulo="Ficha" onClick={() => window.open(`/producao/ordens/${op.id}/ficha`, '_blank', 'noopener')} />
            <BotaoCartao icone={Tag} rotulo="Etiqueta" onClick={() => acoes.onEtiqueta(op)} />
          </div>
        )}
      </div>
    </article>
  )
}
