import { useState } from 'react'
import { ArrowDown, ArrowUp, Loader2, Plus, Route, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { ProdutoDetalhe } from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { useMaquinasOpcoes, useMutacao, useProcessosOpcoes } from '../../hooks'

interface Etapa {
  processoId: string
  maquinaId: string
}

/** Roteiro de produção: etapas em ordem, cada uma com a máquina (opcional). */
export function ProcessosEditor({ produto, podeEditar }: { produto: ProdutoDetalhe; podeEditar: boolean }) {
  const processos = useProcessosOpcoes()
  const maquinas = useMaquinasOpcoes()
  const [etapas, setEtapas] = useState<Etapa[]>(() => produto.processos.map((p) => ({ processoId: p.processoId, maquinaId: p.maquinaId ?? '' })))
  const salvar = useMutacao(['produtos'], () => produtosApi.salvarProcessos(produto.id, etapas))

  const alterar = (i: number, dados: Partial<Etapa>) => setEtapas((e) => e.map((etapa, j) => (j === i ? { ...etapa, ...dados } : etapa)))
  const mover = (i: number, direcao: -1 | 1) =>
    setEtapas((e) => {
      const nova = [...e]
      const destino = i + direcao
      if (destino < 0 || destino >= nova.length) return e
      ;[nova[i], nova[destino]] = [nova[destino] as Etapa, nova[i] as Etapa]
      return nova
    })

  /** Ao escolher o processo, sugere a máquina padrão dele. */
  function escolherProcesso(i: number, processoId: string) {
    const padrao = processos.data?.find((p) => p.id === processoId)?.maquinaPadraoId ?? ''
    alterar(i, { processoId, maquinaId: etapas[i]?.maquinaId || padrao })
  }

  return (
    <Card>
      {etapas.length === 0 ? (
        <EmptyState icone={Route} titulo="Sem roteiro" descricao="Defina as etapas de produção (ex.: impressão → acabamento). Elas darão origem às ordens de produção." />
      ) : (
        <ol className="divide-y divide-border">
          {etapas.map((e, i) => (
            <li key={i} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-petroleo text-sm font-semibold text-white">{i + 1}</span>
              <div className="flex-1">
                <Select value={e.processoId} disabled={!podeEditar} onChange={(ev) => escolherProcesso(i, ev.target.value)} aria-label={`Processo da etapa ${i + 1}`}>
                  <option value="">Selecione o processo…</option>
                  {processos.data?.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="flex-1">
                <Select value={e.maquinaId} disabled={!podeEditar} onChange={(ev) => alterar(i, { maquinaId: ev.target.value })} aria-label={`Máquina da etapa ${i + 1}`}>
                  <option value="">Sem máquina</option>
                  {maquinas.data?.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome}
                    </option>
                  ))}
                </Select>
              </div>
              {podeEditar && (
                <div className="flex gap-1">
                  <Button type="button" variant="ghost" size="icon" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir etapa">
                    <ArrowUp />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" onClick={() => mover(i, 1)} disabled={i === etapas.length - 1} aria-label="Descer etapa">
                    <ArrowDown />
                  </Button>
                  <Button type="button" variant="ghost" size="icon" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setEtapas((l) => l.filter((_, j) => j !== i))} aria-label="Remover etapa">
                    <Trash2 />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {podeEditar && (
        <div className="flex flex-wrap justify-between gap-2 border-t border-border p-4">
          <Button type="button" variant="outline" onClick={() => setEtapas((l) => [...l, { processoId: '', maquinaId: '' }])}>
            <Plus /> Adicionar etapa
          </Button>
          <Button
            disabled={salvar.isPending || etapas.some((e) => !e.processoId)}
            onClick={() => salvar.mutate(undefined, { onSuccess: () => toast.success('Roteiro salvo.'), onError: (err) => toast.error(err.message) })}
          >
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar roteiro
          </Button>
        </div>
      )}
    </Card>
  )
}
