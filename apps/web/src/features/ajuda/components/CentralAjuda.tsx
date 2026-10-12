import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft, ArrowRight, Clock, PlayCircle, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { buscarTutoriais, tutorialPorSlug, tutoriaisPorCategoria } from '../conteudo'
import { CATEGORIAS_AJUDA, type Tutorial } from '../tipos'
import { formatarDuracao } from '../formato'
import { TutorialConteudo } from './TutorialConteudo'

/** Cartão de um tutorial na lista */
function CartaoTutorial({ t, base }: { t: Tutorial; base: string }) {
  return (
    <Link
      to={`${base}/${t.slug}`}
      className="group flex flex-col overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-border transition hover:-translate-y-0.5 hover:shadow-lg hover:ring-marca/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
    >
      {t.video ? (
        <span className="relative block aspect-[16/9] overflow-hidden bg-fundo">
          <img src={t.video.capa} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover object-top transition duration-500 group-hover:scale-[1.03]" />
          <span className="absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-slate-950/70 px-2 py-0.5 text-xs font-semibold text-white">
            <PlayCircle className="h-3.5 w-3.5" aria-hidden="true" /> {formatarDuracao(t.video.segundos)}
          </span>
        </span>
      ) : null}
      <span className="flex flex-1 flex-col p-4">
        <span className="font-titulo font-extrabold leading-snug text-tinta group-hover:text-marca-escuro">{t.titulo}</span>
        <span className="mt-1 line-clamp-2 text-sm text-texto-secundario">{t.resumo}</span>
        <span className="mt-3 inline-flex items-center gap-1 text-xs text-texto-secundario">
          <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {t.minutos} min · {t.passos.length} passos
        </span>
      </span>
    </Link>
  )
}

/** Lista da central de ajuda: busca e tutoriais por categoria. `base` = "/ajuda" (site e sistema). */
export function ListaAjuda({ base = '/ajuda' }: { base?: string }) {
  const [texto, setTexto] = useState('')
  const grupos = useMemo(() => tutoriaisPorCategoria(buscarTutoriais(texto)), [texto])
  return (
    <div className="space-y-10">
      <div className="relative max-w-xl">
        <label htmlFor="busca-ajuda" className="sr-only">
          Buscar na ajuda
        </label>
        <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-texto-secundario" aria-hidden="true" />
        <input
          id="busca-ajuda"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="O que você quer fazer? Ex.: orçamento, pagamento, vitrine"
          className="h-12 w-full rounded-full border border-border bg-card pl-12 pr-4 text-[0.9375rem] text-tinta shadow-sm placeholder:text-texto-secundario focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15"
        />
      </div>
      {grupos.length === 0 ? (
        <p className="text-texto-secundario">Nenhum tutorial encontrado para "{texto}". Tente outra palavra, como "orçamento" ou "caixa".</p>
      ) : (
        grupos.map((g) => (
          <section key={g.categoria} aria-labelledby={`cat-${g.categoria}`}>
            <h2 id={`cat-${g.categoria}`} className="font-titulo text-xl font-extrabold text-tinta">
              {g.titulo}
            </h2>
            <p className="text-sm text-texto-secundario">{g.descricao}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.tutoriais.map((t) => (
                <CartaoTutorial key={t.slug} t={t} base={base} />
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  )
}

/** Página de um tutorial: título, vídeo, passos e o que fazer depois */
export function PaginaTutorial({ slug, base = '/ajuda', acaoNoSistema }: { slug: string | undefined; base?: string; acaoNoSistema?: (t: Tutorial) => React.ReactNode }) {
  const t = tutorialPorSlug(slug)
  if (!t) {
    return (
      <div className="py-16 text-center">
        <p className="font-titulo text-xl font-extrabold text-tinta">Tutorial não encontrado</p>
        <Link to={base} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-marca-escuro hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Ver todos os tutoriais
        </Link>
      </div>
    )
  }
  const proximos = (t.proximos ?? []).map(tutorialPorSlug).filter((x): x is Tutorial => Boolean(x))
  return (
    <article className="mx-auto max-w-3xl">
      <Link to={base} className="inline-flex items-center gap-1.5 text-sm font-medium text-marca-escuro hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Central de ajuda
      </Link>
      <p className="mt-6 text-xs font-bold uppercase tracking-[0.18em] text-marca-escuro">{CATEGORIAS_AJUDA[t.categoria].titulo}</p>
      <h1 className="mt-2 font-titulo text-3xl font-extrabold leading-tight text-tinta sm:text-4xl">{t.titulo}</h1>
      <p className="mt-3 text-lg text-texto-secundario">{t.resumo}</p>
      {acaoNoSistema && <div className="mt-5">{acaoNoSistema(t)}</div>}
      <div className="mt-8">
        <TutorialConteudo t={t} />
      </div>
      {proximos.length > 0 && (
        <section className="mt-14 border-t border-border pt-8" aria-labelledby="titulo-proximos">
          <h2 id="titulo-proximos" className="font-titulo text-lg font-extrabold text-tinta">
            Próximo passo
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {proximos.map((p) => (
              <Link
                key={p.slug}
                to={`${base}/${p.slug}`}
                className={cn('group flex items-center justify-between gap-3 rounded-2xl bg-card p-4 ring-1 ring-border transition hover:ring-marca/50')}
              >
                <span>
                  <span className="block font-semibold text-tinta">{p.titulo}</span>
                  <span className="text-sm text-texto-secundario">{p.minutos} min</span>
                </span>
                <ArrowRight className="h-5 w-5 shrink-0 text-marca-escuro transition group-hover:translate-x-0.5" aria-hidden="true" />
              </Link>
            ))}
          </div>
        </section>
      )}
    </article>
  )
}
