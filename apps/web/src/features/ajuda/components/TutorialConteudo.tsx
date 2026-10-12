import { useState } from 'react'
import { Clock, Lightbulb, PlayCircle, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatarDuracao } from '../formato'
import type { Tutorial } from '../tipos'

/** Vídeo do tutorial: a versão narrada do YouTube, se houver; senão o vídeo gravado (com legendas na tela) */
export function VideoTutorial({ t, className }: { t: Tutorial; className?: string }) {
  const [tocar, setTocar] = useState(false)
  if (t.youtube) {
    return (
      <div className={cn('aspect-video overflow-hidden rounded-2xl bg-black', className)}>
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(t.youtube)}?rel=0`}
          title={`Vídeo: ${t.titulo}`}
          allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; fullscreen"
          allowFullScreen
          className="h-full w-full"
        />
      </div>
    )
  }
  if (!t.video) return null
  // Capa com botão de play até a pessoa pedir (o vídeo só baixa quando for assistir)
  if (!tocar) {
    return (
      <button
        type="button"
        onClick={() => setTocar(true)}
        className={cn('group relative block aspect-[16/10] w-full overflow-hidden rounded-2xl bg-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca', className)}
        aria-label={`Assistir ao vídeo: ${t.titulo}`}
      >
        <img src={t.video.capa} alt="" decoding="async" className="h-full w-full object-cover object-top opacity-90 transition group-hover:opacity-100" />
        <span className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-gradient-to-t from-slate-950/70 via-slate-950/20 to-transparent text-white">
          <PlayCircle className="h-16 w-16 drop-shadow-lg transition group-hover:scale-105" strokeWidth={1.5} aria-hidden="true" />
          <span className="rounded-full bg-slate-950/60 px-3 py-1 text-sm font-semibold">Assistir · {formatarDuracao(t.video.segundos)}</span>
        </span>
      </button>
    )
  }
  return (
    <video
      src={t.video.arquivo}
      poster={t.video.capa}
      controls
      autoPlay
      playsInline
      preload="metadata"
      className={cn('block aspect-[16/10] w-full rounded-2xl bg-black', className)}
    >
      Seu navegador não toca este vídeo.
    </video>
  )
}

/** Imagem do passo: toque para ver grande */
function ImagemPasso({ src, alt }: { src: string; alt: string }) {
  const [aberta, setAberta] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setAberta(true)} className="mt-3 block w-full overflow-hidden rounded-xl ring-1 ring-border transition hover:ring-marca focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca" aria-label={`Ampliar imagem: ${alt}`}>
        <img src={src} alt={alt} loading="lazy" decoding="async" width={1600} height={1000} className="block aspect-[16/10] w-full bg-fundo object-cover object-top" />
      </button>
      {aberta && (
        <div role="dialog" aria-modal="true" aria-label={alt} className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/85 p-4" onClick={() => setAberta(false)}>
          <img src={src} alt={alt} className="max-h-full max-w-full rounded-lg shadow-2xl" />
          <button type="button" className="absolute right-4 top-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Fechar" onClick={() => setAberta(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </>
  )
}

/** Corpo do tutorial (página da central de ajuda e painel do botão "?"): vídeo e os passos numerados */
export function TutorialConteudo({ t, compacto }: { t: Tutorial; compacto?: boolean }) {
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-texto-secundario">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="h-4 w-4" aria-hidden="true" /> Leva cerca de {t.minutos} {t.minutos === 1 ? 'minuto' : 'minutos'}
        </span>
        <span>{t.passos.length} passos</span>
      </div>
      <VideoTutorial t={t} />
      <ol className="space-y-8">
        {t.passos.map((p, i) => (
          <li key={p.titulo} className={cn('grid gap-4', !compacto && 'sm:grid-cols-[2.5rem_minmax(0,1fr)]')}>
            {!compacto && (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-marca font-titulo text-sm font-extrabold text-marca-contraste" aria-hidden="true">
                {i + 1}
              </span>
            )}
            <div className="min-w-0">
              <h3 className="flex items-center gap-2.5 font-titulo text-lg font-extrabold text-tinta">
                {compacto && (
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marca text-xs text-marca-contraste" aria-hidden="true">
                    {i + 1}
                  </span>
                )}
                <span className="sr-only">Passo {i + 1}: </span>
                {p.titulo}
              </h3>
              <p className="mt-1.5 leading-relaxed text-tinta/80">{p.texto}</p>
              {p.dica && (
                <p className="mt-3 flex gap-2 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {p.dica}
                </p>
              )}
              {p.imagem && <ImagemPasso src={p.imagem} alt={`${p.titulo}: tela do sistema`} />}
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
