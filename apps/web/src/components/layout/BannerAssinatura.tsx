import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Clock, Eye, Info } from 'lucide-react'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

/**
 * Faixa no topo das telas quando a assinatura pede atenção: teste grátis, atraso (aviso),
 * modo só leitura ou liberação temporária. Bloqueado não chega aqui (vai direto para /assinatura).
 */
export function BannerAssinatura() {
  const { usuario } = useAuth()
  const { pathname } = useLocation()
  const a = usuario?.assinatura
  if (!a || pathname === '/assinatura' || a.motivo === 'em_dia' || a.nivel === 'bloqueado') return null

  const estilo =
    a.nivel === 'somente_leitura'
      ? { cor: 'border-coral/40 bg-coral/10 text-coral-escuro', Icone: Eye }
      : a.nivel === 'aviso'
        ? { cor: 'border-amber-300 bg-amber-50 text-amber-900', Icone: AlertTriangle }
        : a.motivo === 'teste'
          ? { cor: 'border-marca/40 bg-marca-suave text-grafite', Icone: Clock }
          : { cor: 'border-border bg-card text-grafite', Icone: Info }

  return (
    <div role={a.nivel === 'normal' ? 'status' : 'alert'} className={cn('mb-4 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border px-4 py-2.5 text-sm', estilo.cor)}>
      <estilo.Icone className="h-4 w-4 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1 font-medium">{a.mensagem}</p>
      <Link to="/assinatura" className="shrink-0 font-semibold underline underline-offset-2 hover:no-underline">
        {a.nivel === 'normal' ? 'Ver planos' : 'Regularizar'}
      </Link>
    </div>
  )
}
