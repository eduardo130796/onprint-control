import { Link } from 'react-router-dom'
import { TOM_ASSINATURA, statusDaAssinatura } from '@/features/assinatura/status'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

/**
 * Situação da assinatura no topo só quando a faixa de aviso não está à vista (teste, cortesia, cancelada…).
 * Em dia, o plano fica no menu da conta, para o topo não carregar informação que não pede ação.
 */
export function ChipAssinatura() {
  const { usuario } = useAuth()
  const a = usuario?.assinatura
  if (!a) return null
  const s = statusDaAssinatura(a)
  // Em dia: nada no topo. Atraso e só leitura já têm a faixa de aviso fixa logo abaixo: não repetir
  if (s.tom === 'verde' || s.tom === 'ambar' || s.tom === 'coral') return null
  const t = TOM_ASSINATURA[s.tom]
  return (
    <Link
      to="/assinatura"
      title={`${a.plano} · ${s.rotulo}. ${a.mensagem}`}
      aria-label={`Assinatura: plano ${a.plano}, ${s.rotulo}`}
      className={cn('inline-flex h-8 max-w-[15rem] items-center gap-2 rounded-full px-2.5 text-xs font-semibold ring-1 transition-colors sm:px-3', t.chip)}
    >
      <span className={cn('h-2 w-2 shrink-0 rounded-full', t.ponto)} aria-hidden="true" />
      <span className="hidden truncate sm:inline">{s.curto}</span>
    </Link>
  )
}
