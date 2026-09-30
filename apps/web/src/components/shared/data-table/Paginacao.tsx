import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface PaginacaoProps {
  meta: { page: number; pageSize: number; total: number }
  onPageChange: (page: number) => void
  onPageSizeChange: (size: number) => void
}

const TAMANHOS = [10, 20, 50, 100]

export function Paginacao({ meta, onPageChange, onPageSizeChange }: PaginacaoProps) {
  const totalPaginas = Math.max(1, Math.ceil(meta.total / meta.pageSize))
  const inicio = (meta.page - 1) * meta.pageSize + 1
  const fim = Math.min(meta.page * meta.pageSize, meta.total)

  return (
    <div className="flex flex-col items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-texto-secundario sm:flex-row">
      <span>
        {inicio}–{fim} de {meta.total.toLocaleString('pt-BR')}
      </span>
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2">
          <span className="hidden sm:inline">Por página</span>
          <select
            value={meta.pageSize}
            onChange={(e) => onPageSizeChange(Number(e.target.value))}
            className="h-8 rounded-md border border-input bg-card px-2 text-sm"
          >
            {TAMANHOS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </label>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onPageChange(meta.page - 1)} disabled={meta.page <= 1} aria-label="Página anterior">
            <ChevronLeft />
          </Button>
          <span className="min-w-16 text-center">
            {meta.page} / {totalPaginas}
          </span>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => onPageChange(meta.page + 1)}
            disabled={meta.page >= totalPaginas}
            aria-label="Próxima página"
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  )
}
