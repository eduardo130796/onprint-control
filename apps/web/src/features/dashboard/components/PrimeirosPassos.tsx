import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, PlayCircle, Rocket, X } from 'lucide-react'
import { dashboardApi } from '@/api/relatorios'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

const chaveOculto = (empresa: string) => `grafygo:primeiros-passos-oculto:${empresa}`

function lerOculto(chave: string) {
  try {
    return localStorage.getItem(chave) === '1'
  } catch {
    return false
  }
}

/**
 * "Primeiros passos" no painel de quem acabou de chegar: o que falta para ver o sistema funcionando (logo, preço,
 * primeiro orçamento, enviar, pedido, equipe, vitrine). O progresso vem dos dados; some quando tudo estiver feito
 * ou se a pessoa ocultar.
 */
export function PrimeirosPassos() {
  const { usuario } = useAuth()
  const podeConfigurar = usePermission('configuracoes', 'editar')
  const chave = chaveOculto(usuario?.empresa.slug ?? '')
  const [oculto, setOculto] = useState(() => lerOculto(chave))
  const consulta = useQuery({ queryKey: ['primeiros-passos'], queryFn: dashboardApi.primeirosPassos, enabled: podeConfigurar && !oculto, staleTime: 30_000 })
  const d = consulta.data
  if (!podeConfigurar || oculto || !d || d.concluidos >= d.total) return null

  const proximo = d.passos.find((p) => !p.feito)
  const pct = Math.round((d.concluidos / d.total) * 100)
  const ocultar = () => {
    try {
      localStorage.setItem(chave, '1')
    } catch {
      /* sem armazenamento: só some nesta visita */
    }
    setOculto(true)
  }

  return (
    <section aria-labelledby="titulo-primeiros-passos" className="relative mb-4 overflow-hidden rounded-2xl border border-marca/25 bg-card shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-marca/10 blur-2xl" aria-hidden="true" />
      <div className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <div>
          <div className="flex items-start justify-between gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-marca text-marca-contraste">
              <Rocket className="h-5 w-5" aria-hidden="true" />
            </span>
            <Button variant="ghost" size="icon" className="-mr-2 -mt-2 lg:hidden" onClick={ocultar} aria-label="Ocultar primeiros passos">
              <X />
            </Button>
          </div>
          <h2 id="titulo-primeiros-passos" className="mt-4 font-titulo text-xl font-extrabold text-tinta">
            Primeiros passos
          </h2>
          <p className="mt-1 text-sm text-texto-secundario">Em poucos minutos você manda o primeiro orçamento com a sua marca.</p>
          <div className="mt-4" role="progressbar" aria-valuemin={0} aria-valuemax={d.total} aria-valuenow={d.concluidos} aria-label="Progresso dos primeiros passos">
            <div className="flex items-baseline justify-between text-sm">
              <span className="font-semibold text-tinta">
                {d.concluidos} de {d.total}
              </span>
              <span className="text-texto-secundario">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fundo">
              <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${Math.max(pct, 4)}%` }} />
            </div>
          </div>
          <Button variant="ghost" size="sm" className="mt-4 hidden px-0 text-texto-secundario hover:bg-transparent hover:text-tinta lg:inline-flex" onClick={ocultar}>
            Ocultar esta lista
          </Button>
        </div>

        <ol className="grid gap-2 sm:grid-cols-2">
          {d.passos.map((p, i) => {
            const atual = p.id === proximo?.id
            return (
              <li
                key={p.id}
                className={cn(
                  'flex gap-3 rounded-xl p-3 transition',
                  atual ? 'bg-marca-suave ring-1 ring-marca/40 sm:col-span-2' : p.feito ? 'opacity-70' : 'bg-fundo/60',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold',
                    p.feito ? 'bg-verde text-white' : atual ? 'bg-marca text-marca-contraste' : 'bg-card text-texto-secundario ring-1 ring-border',
                  )}
                  aria-hidden="true"
                >
                  {p.feito ? <Check className="h-4 w-4" /> : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm font-semibold', p.feito ? 'text-texto-secundario line-through' : 'text-tinta')}>
                    {p.titulo}
                    {p.feito && <span className="sr-only"> (feito)</span>}
                  </p>
                  {!p.feito && <p className="mt-0.5 text-xs text-texto-secundario">{p.descricao}</p>}
                  {atual && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      <Button asChild size="sm">
                        <Link to={p.link}>
                          Fazer agora <ArrowRight />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="outline">
                        <Link to={`/ajuda/${p.ajuda}`}>
                          <PlayCircle /> Ver como fazer
                        </Link>
                      </Button>
                    </div>
                  )}
                  {!p.feito && !atual && (
                    <Link to={p.link} className="mt-1 inline-flex text-xs font-medium text-marca-escuro hover:underline">
                      Fazer
                    </Link>
                  )}
                </div>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}
