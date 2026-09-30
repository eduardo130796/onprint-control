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
        <h1 className="text-2xl font-semibold text-petroleo">{titulo}</h1>
        {subtitulo && <p className="mt-1 text-sm text-texto-secundario">{subtitulo}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  )
}
