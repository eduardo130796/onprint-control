import { Banknote, Factory, FileImage, ShoppingCart, Truck, type LucideIcon } from 'lucide-react'
import { formatarDataHora, type EventoHistorico } from '@onprint/shared'
import { cn } from '@/lib/utils'

const ICONES: Record<EventoHistorico['tipo'], { icone: LucideIcon; cor: string }> = {
  pedido: { icone: ShoppingCart, cor: 'bg-grafite text-white' },
  arte: { icone: FileImage, cor: 'bg-purple-500 text-white' },
  producao: { icone: Factory, cor: 'bg-sky-600 text-white' },
  entrega: { icone: Truck, cor: 'bg-marca text-grafite-escuro' },
  financeiro: { icone: Banknote, cor: 'bg-verde text-white' },
}

/** Linha do tempo vertical (mais recente primeiro). */
export function Timeline({ eventos }: { eventos: EventoHistorico[] }) {
  return (
    <ol className="relative space-y-5 border-l-2 border-border pl-6">
      {eventos.map((e) => {
        const { icone: Icone, cor } = ICONES[e.tipo]
        return (
          <li key={e.id} className="relative">
            <span className={cn('absolute -left-[37px] flex h-6 w-6 items-center justify-center rounded-full ring-4 ring-card', cor)}>
              <Icone className="h-3.5 w-3.5" />
            </span>
            <p className="text-sm font-medium">{e.titulo}</p>
            {e.detalhe && <p className="whitespace-pre-line text-sm text-texto-secundario">{e.detalhe}</p>}
            <p className="text-xs text-texto-secundario">
              {formatarDataHora(e.quando)}
              {e.usuario && ` · ${e.usuario}`}
            </p>
          </li>
        )
      })}
    </ol>
  )
}
