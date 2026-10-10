import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, Eye, Gift, Hourglass, ShieldCheck, Sparkles, X } from 'lucide-react'
import type { UsuarioLogado } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'

type Assinatura = NonNullable<UsuarioLogado['assinatura']>

interface Visual {
  titulo: string
  /** Texto de apoio (padrão: a mensagem da assinatura) */
  texto?: string
  Icone: typeof Eye
  /** Faixa lateral, fundo do ícone e barra de progresso */
  faixa: string
  icone: string
  barra: string
  acao: string
  /** Informativo: pode ser fechado até amanhã */
  dispensavel: boolean
  /** 0–100: quanto já andou até o próximo degrau */
  progresso: number | null
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

function visual(a: Assinatura): Visual | null {
  const ate = (falta: number | null) => (falta === null ? null : Math.round((a.diasAtraso / (a.diasAtraso + Math.max(falta, 0))) * 100))
  switch (a.motivo) {
    case 'teste':
      return { titulo: `Teste grátis · ${a.diasRestantesTeste === 0 ? 'último dia' : `${plural(a.diasRestantesTeste ?? 0, 'dia restante', 'dias restantes')}`}`, Icone: Sparkles, faixa: 'bg-marca', icone: 'bg-marca-suave text-marca-escuro', barra: 'bg-marca', acao: 'Ver planos', dispensavel: true, progresso: null, texto: 'Assine quando quiser: a 1ª mensalidade só vence no fim do teste.' }
    case 'teste_acabando':
      return { titulo: a.diasRestantesTeste === 0 ? 'Seu teste grátis termina hoje' : `Seu teste grátis termina em ${plural(a.diasRestantesTeste ?? 0, 'dia', 'dias')}`, Icone: Hourglass, faixa: 'bg-amber-500', icone: 'bg-amber-100 text-amber-800', barra: 'bg-amber-500', acao: 'Assinar agora', dispensavel: false, progresso: null, texto: 'Assine para continuar sem interrupção. Tudo o que você cadastrou continua aqui.' }
    case 'cortesia':
      // Cortesia sem prazo não tem aviso; com prazo, só nos últimos dias
      if (a.nivel !== 'aviso') return null
      return { titulo: a.diasRestantesTeste === 0 ? 'Sua cortesia termina hoje' : `Sua cortesia termina em ${plural(a.diasRestantesTeste ?? 0, 'dia', 'dias')}`, Icone: Gift, faixa: 'bg-violet-500', icone: 'bg-violet-100 text-violet-800', barra: 'bg-violet-500', acao: 'Assinar agora', dispensavel: false, progresso: null, texto: 'Assine para continuar sem interrupção: a 1ª mensalidade só vence no fim da cortesia.' }
    case 'liberacao_manual':
      return { titulo: 'Acesso liberado temporariamente', Icone: ShieldCheck, faixa: 'bg-sky-500', icone: 'bg-sky-100 text-sky-800', barra: 'bg-sky-500', acao: 'Ver assinatura', dispensavel: true, progresso: null }
  }
  if (a.nivel === 'somente_leitura') {
    return { titulo: 'Modo somente leitura', Icone: Eye, faixa: 'bg-coral', icone: 'bg-coral/15 text-coral-escuro', barra: 'bg-coral', acao: 'Regularizar agora', dispensavel: false, progresso: ate(a.diasParaBloqueio) }
  }
  if (a.nivel === 'aviso') {
    const fimGratis = a.motivo === 'teste_expirado' || a.motivo === 'cortesia_encerrada'
    const titulo = a.motivo === 'teste_expirado' ? 'Seu teste grátis terminou' : a.motivo === 'cortesia_encerrada' ? 'Sua cortesia terminou' : `Mensalidade vencida há ${plural(a.diasAtraso, 'dia', 'dias')}`
    return { titulo, Icone: AlertTriangle, faixa: 'bg-amber-500', icone: 'bg-amber-100 text-amber-800', barra: 'bg-amber-500', acao: fimGratis ? 'Assinar agora' : 'Pagar agora', dispensavel: false, progresso: ate(a.diasParaSomenteLeitura) }
  }
  return null
}

const CHAVE = 'onprint:aviso-assinatura'
const lerDispensado = () => {
  try {
    return sessionStorage.getItem(CHAVE)
  } catch {
    return null
  }
}

/**
 * Aviso da assinatura no topo das telas: teste grátis, fim do teste, atraso, modo leitura ou liberação.
 * Bloqueado não chega aqui (vai direto para /assinatura). Os informativos podem ser fechados na sessão.
 */
export function BannerAssinatura() {
  const { usuario } = useAuth()
  const { pathname } = useLocation()
  const [dispensado, setDispensado] = useState(lerDispensado)
  const a = usuario?.assinatura
  const v = a && pathname !== '/assinatura' ? visual(a) : null
  if (!a || !v || (v.dispensavel && dispensado === a.motivo)) return null

  function fechar() {
    try {
      sessionStorage.setItem(CHAVE, a?.motivo ?? '')
    } catch {
      // sem armazenamento: fecha só até recarregar
    }
    setDispensado(a?.motivo ?? null)
  }

  // Só leitura é grave: cartão grande. Os demais avisos ficam numa faixa fina de uma linha.
  if (a.nivel !== 'somente_leitura') {
    return (
      <div role={v.dispensavel ? 'status' : 'alert'} className="relative mb-5 overflow-hidden rounded-xl bg-card ring-1 ring-border">
        <div className="flex items-center gap-3 py-2 pl-3 pr-2">
          <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', v.icone)}>
            <v.Icone className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="font-semibold text-tinta">{v.titulo}</span>
            <span className="hidden text-texto-secundario md:inline"> · {v.texto ?? a.mensagem}</span>
          </p>
          <Link
            to="/assinatura"
            className={cn(
              'shrink-0 rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              v.dispensavel ? 'text-tinta hover:bg-fundo' : 'bg-marca text-marca-contraste hover:bg-marca-hover',
            )}
          >
            {v.acao}
          </Link>
          {v.dispensavel && (
            <button type="button" onClick={fechar} className="shrink-0 rounded-lg p-1 text-texto-secundario hover:bg-fundo hover:text-tinta" aria-label="Fechar aviso">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        {v.progresso !== null && (
          <div className="absolute inset-x-0 bottom-0 h-0.5 bg-fundo" role="progressbar" aria-label="Tempo até a próxima etapa" aria-valuenow={v.progresso} aria-valuemin={0} aria-valuemax={100}>
            <div className={cn('h-full', v.barra)} style={{ width: `${Math.max(v.progresso, 4)}%` }} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div role={v.dispensavel ? 'status' : 'alert'} className="relative mb-5 overflow-hidden rounded-2xl bg-card shadow-suave ring-1 ring-border">
      <span className={cn('absolute inset-y-0 left-0 w-1.5', v.faixa)} aria-hidden="true" />
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3.5 pl-5 pr-3 sm:pr-4">
        <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl', v.icone)}>
          <v.Icone className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-[12rem] flex-1">
          <p className="font-titulo font-extrabold text-tinta">{v.titulo}</p>
          <p className="text-sm text-texto-secundario">{v.texto ?? a.mensagem}</p>
        </div>
        <Button asChild size="sm" variant={v.dispensavel ? 'outline' : 'default'} className="w-full sm:w-auto">
          <Link to="/assinatura">{v.acao}</Link>
        </Button>
        {v.dispensavel && (
          <button type="button" onClick={fechar} className="rounded-lg p-1.5 text-texto-secundario hover:bg-fundo hover:text-tinta" aria-label="Fechar aviso">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
      {v.progresso !== null && (
        <div className="h-1.5 bg-fundo" role="progressbar" aria-label="Tempo até a próxima etapa" aria-valuenow={v.progresso} aria-valuemin={0} aria-valuemax={100}>
          <div className={cn('h-full rounded-r-full', v.barra)} style={{ width: `${Math.max(v.progresso, 4)}%` }} />
        </div>
      )}
    </div>
  )
}
