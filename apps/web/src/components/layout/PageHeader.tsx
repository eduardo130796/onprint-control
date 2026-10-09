import type { ReactNode } from 'react'

interface PageHeaderProps {
  titulo: string
  subtitulo?: ReactNode
  acoes?: ReactNode
}

export function PageHeader({ titulo, subtitulo, acoes }: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <span className="mb-2 block h-1 w-8 rounded-full bg-laranja" aria-hidden="true" />
        <h1 className="font-titulo text-2xl font-extrabold tracking-tight text-tinta">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-texto-secundario">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}
