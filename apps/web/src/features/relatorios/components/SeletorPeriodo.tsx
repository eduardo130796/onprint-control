import { Loader2 } from 'lucide-react'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { PERIODOS, type Periodo, type usePeriodo } from '../periodo'

export function SeletorPeriodo({ estado, carregando }: { estado: ReturnType<typeof usePeriodo>; carregando?: boolean }) {
  const { periodo, setPeriodo, livre, setLivre } = estado
  return (
    <div className="flex flex-wrap gap-2">
      <div className="w-44">
        <Select value={periodo} onChange={(e) => setPeriodo(e.target.value as Periodo)} aria-label="Período">
          {Object.entries(PERIODOS).map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </Select>
      </div>
      {periodo === 'livre' && (
        <>
          <Input type="date" className="w-40" value={livre.de} onChange={(e) => setLivre((l) => ({ ...l, de: e.target.value }))} aria-label="De" />
          <Input type="date" className="w-40" value={livre.ate} onChange={(e) => setLivre((l) => ({ ...l, ate: e.target.value }))} aria-label="Até" />
        </>
      )}
      {carregando && <Loader2 className="h-5 w-5 animate-spin self-center text-marca-escuro" />}
    </div>
  )
}
