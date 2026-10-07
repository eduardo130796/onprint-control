import { useMemo } from 'react'
import { adicionarDias, diaDaSemana, formatarDataSimples, hojeISO, type OrdemProducao } from '@onprint/shared'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { cn } from '@/lib/utils'

const DIAS = 14
const SIGLAS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S']

/**
 * Período previsto da OP: usa as datas previstas; sem início, estima pelas horas (8 h/dia) antes do prazo.
 * OP atrasada (prazo já passou) aparece a partir de hoje, em vermelho, pelo tempo que ainda precisa.
 */
function periodo(op: OrdemProducao, hoje: string) {
  const prazo = (op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega).slice(0, 10)
  const dias = Math.max(1, Math.ceil(Number(op.horasEstimadas) / 8))
  if (prazo < hoje) return { inicio: hoje, fim: adicionarDias(hoje, dias - 1), prazo, atrasada: true }
  let inicio = op.dataInicioPrevista?.slice(0, 10) ?? adicionarDias(prazo, -(dias - 1))
  if (!op.dataInicioPrevista && inicio < hoje) inicio = hoje
  return { inicio: inicio > prazo ? prazo : inicio, fim: prazo, prazo, atrasada: false }
}

const diferenca = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000)

interface GanttProps {
  ops: OrdemProducao[]
  inicio: string
  onSelecionar: (op: OrdemProducao) => void
}

/** Gantt simples de 14 dias, agrupado por máquina. Clicar na barra abre a reprogramação. */
export function GanttSimples({ ops, inicio, onSelecionar }: GanttProps) {
  const { mapa } = useStatusConfig()
  const hoje = hojeISO()
  const dias = Array.from({ length: DIAS }, (_, i) => adicionarDias(inicio, i))
  const grupos = useMemo(() => {
    const m = new Map<string, OrdemProducao[]>()
    for (const op of ops) {
      const chave = op.maquina?.nome ?? 'Sem máquina'
      m.set(chave, [...(m.get(chave) ?? []), op])
    }
    return [...m.entries()].sort(([a], [b]) => (a === 'Sem máquina' ? 1 : b === 'Sem máquina' ? -1 : a.localeCompare(b)))
  }, [ops])
  const grade = { gridTemplateColumns: `minmax(140px, 200px) repeat(${DIAS}, minmax(32px, 1fr))` }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[720px] text-xs">
        <div className="grid border-b border-border pb-1" style={grade}>
          <span />
          {dias.map((d) => (
            <span key={d} className={cn('text-center', diaDaSemana(d) % 6 === 0 && 'text-texto-secundario/60', d === hoje && 'font-bold text-marca-escuro')}>
              {SIGLAS[diaDaSemana(d)]}
              <br />
              {d.slice(8, 10)}
            </span>
          ))}
        </div>
        {grupos.map(([maquina, lista]) => (
          <div key={maquina} className="border-b border-border py-1">
            <p className="py-1 font-semibold text-grafite">{maquina}</p>
            {lista.map((op) => {
              const p = periodo(op, hoje)
              const col = Math.max(0, diferenca(inicio, p.inicio))
              const fimCol = Math.min(DIAS - 1, diferenca(inicio, p.fim))
              const visivel = fimCol >= 0 && col < DIAS
              const cor = p.atrasada ? '#EF5A57' : (mapa.get(`producao:${op.etapaAtual}`)?.cor ?? '#6B7280')
              return (
                <div key={op.id} className="grid items-center py-0.5" style={grade}>
                  <span className="truncate pr-2" title={`${op.numero} · ${op.item.descricao}`}>
                    <span className="font-mono">{op.numero.slice(-4)}</span> {op.pedido.cliente.nome}
                  </span>
                  {visivel ? (
                    <button
                      type="button"
                      onClick={() => onSelecionar(op)}
                      title={`${op.numero} · ${op.item.descricao} · prazo ${formatarDataSimples(p.prazo)}${p.atrasada ? ' (atrasada)' : ''}`}
                      className="h-5 overflow-hidden whitespace-nowrap rounded-md text-left text-[10px] font-medium text-white hover:opacity-90"
                      style={{ gridColumn: `${col + 2} / ${fimCol + 3}`, backgroundColor: cor }}
                    >
                      <span className="px-1">
                        {p.atrasada ? 'atrasada · ' : ''}
                        {Number(op.horasEstimadas).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} h
                      </span>
                    </button>
                  ) : (
                    <span className="col-span-full col-start-2 text-texto-secundario">
                      a partir de {formatarDataSimples(p.inicio)}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </div>
    </div>
  )
}
