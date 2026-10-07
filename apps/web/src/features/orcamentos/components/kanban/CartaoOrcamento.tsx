import { Link } from 'react-router-dom'
import { CalendarClock, CheckCircle2, ExternalLink, Link2, Phone, Printer, Send, ThumbsDown, User } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, formatarTelefone, hojeISO, type Orcamento } from '@onprint/shared'
import { BotaoCartao } from '@/components/shared/kanban/BotaoCartao'
import { cn } from '@/lib/utils'

export interface AcoesCartaoOrcamento {
  onAbrir: (o: Orcamento) => void
  onImprimir: (o: Orcamento) => void
  onCopiarLink: (o: Orcamento) => void
  imprimindo: boolean
}

const diasDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000))

/** Cartão do orçamento no kanban: cliente e contato, itens principais, validade, envio/aprovação e atalhos. */
export function CartaoOrcamento({ o, acoes }: { o: Orcamento; acoes: AcoesCartaoOrcamento }) {
  const emAberto = ['rascunho', 'enviado', 'em_negociacao'].includes(o.status)
  const vencido = emAberto && o.validade.slice(0, 10) < hojeISO()
  const telefone = formatarTelefone(o.cliente.whatsapp ?? o.cliente.telefone)
  const r = o.resumo
  return (
    <article className="rounded-xl border border-transparent bg-card p-3.5 text-sm shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-center justify-between gap-2">
        <Link to={`/orcamentos/${o.id}`} className="font-mono text-xs font-semibold text-petroleo hover:underline" onPointerDown={(e) => e.stopPropagation()}>
          {o.numero}
        </Link>
        <span className="font-semibold tabular-nums">{formatarMoeda(o.total)}</span>
      </div>
      <p className="mt-0.5 truncate text-[15px] font-semibold" title={o.cliente.nome}>
        {o.cliente.nome}
      </p>
      {telefone && (
        <p className="inline-flex items-center gap-1 text-xs text-texto-secundario">
          <Phone className="h-3 w-3" /> {telefone}
        </p>
      )}
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
      <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-texto-secundario">
        <span className={cn('inline-flex items-center gap-1', vencido && 'font-medium text-coral-escuro')}>
          <CalendarClock className="h-3.5 w-3.5" /> {vencido ? 'venceu' : 'válido até'} {formatarDataSimples(o.validade)}
        </span>
        {o.vendedor && (
          <span className="inline-flex items-center gap-1">
            <User className="h-3.5 w-3.5" /> {o.vendedor.nome.split(' ')[0]}
          </span>
        )}
        {emAberto && o.enviadoEm && (
          <span className="inline-flex items-center gap-1">
            <Send className="h-3.5 w-3.5" /> enviado há {diasDesde(o.enviadoEm)} dia(s)
          </span>
        )}
        {o.status === 'aprovado' && o.aprovadoPorNome && (
          <span className="inline-flex min-w-0 items-center gap-1 text-green-800">
            <CheckCircle2 className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{o.aprovadoPorNome}</span>
          </span>
        )}
        {o.status === 'recusado' && o.motivoRecusa && (
          <span className="inline-flex min-w-0 items-center gap-1 text-coral-escuro" title={o.motivoRecusa}>
            <ThumbsDown className="h-3.5 w-3.5 shrink-0" /> <span className="truncate">{o.motivoRecusa}</span>
          </span>
        )}
      </div>
      <div className="-mx-1 mt-2.5 flex flex-wrap gap-1 border-t border-border pt-2">
        <BotaoCartao icone={ExternalLink} rotulo="Abrir" onClick={() => acoes.onAbrir(o)} />
        <BotaoCartao icone={Printer} rotulo="Imprimir" onClick={() => acoes.onImprimir(o)} carregando={acoes.imprimindo} />
        <BotaoCartao icone={Link2} rotulo="Link" onClick={() => acoes.onCopiarLink(o)} />
      </div>
    </article>
  )
}
