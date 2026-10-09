import { useState } from 'react'
import { CheckCircle2, Info, Printer, Sparkles, Tags, Undo2, X } from 'lucide-react'
import { FORMATO_ETIQUETA, faltamParaCompletar, type EtiquetaFilaItem } from '@onprint/shared'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { PainelCartao } from '@/components/shared/kanban/PainelCartao'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarDuracao } from '@/lib/datas'
import { cn } from '@/lib/utils'
import { formatoSalvo } from './etiquetas'
import { ImprimirEtiquetasDialog } from './ImprimirEtiquetasDialog'
import { useAcoesFilaEtiquetas, useFilaEtiquetas } from './useFilaEtiquetas'

/** Botão "Fila de etiquetas (N)" do cabeçalho; só aparece para quem vê a produção. */
export function BotaoFilaEtiquetas({ className }: { className?: string }) {
  const fila = useFilaEtiquetas()
  const [aberta, setAberta] = useState(false)
  if (!fila.pode) return null
  const n = fila.data?.length ?? 0
  return (
    <>
      <Button variant="outline" className={className} onClick={() => setAberta(true)}>
        <Tags /> Fila de etiquetas
        <span className={cn('ml-0.5 min-w-6 rounded-full px-1.5 text-xs font-bold leading-5', n > 0 ? 'bg-marca text-marca-contraste' : 'bg-fundo text-texto-secundario')}>{n}</span>
      </Button>
      {aberta && <FilaEtiquetasPainel onFechar={() => setAberta(false)} />}
    </>
  )
}

const desde = (iso: string) => formatarDuracao(Math.max(60, (Date.now() - new Date(iso).getTime()) / 1000))

/**
 * Fila de etiquetas: as OPs concluídas entram sozinhas (e dá para adicionar à mão); imprime várias
 * de uma vez para não gastar uma folha por etiqueta. Depois de imprimir, saem da fila (com "Desfazer").
 */
export function FilaEtiquetasPainel({ onFechar }: { onFechar: () => void }) {
  const fila = useFilaEtiquetas()
  const acoes = useAcoesFilaEtiquetas()
  // null = todas marcadas (inclusive as que chegarem com o painel aberto)
  const [marcadas, setMarcadas] = useState<Set<string> | null>(null)
  const [imprimindo, setImprimindo] = useState<EtiquetaFilaItem[] | null>(null)
  // Última leva marcada como impressa (para o "Desfazer" aqui mesmo no painel)
  const [impressas, setImpressas] = useState<string[] | null>(null)
  const itens = fila.data ?? []
  const selecionadas = itens.filter((e) => !marcadas || marcadas.has(e.id))
  const formato = formatoSalvo()
  const def = FORMATO_ETIQUETA[formato]
  const faltam = faltamParaCompletar(selecionadas.length, formato)

  // Agrupa por pedido mantendo a ordem de chegada
  const grupos: { pedidoId: string; numero: string; cliente: string; itens: EtiquetaFilaItem[] }[] = []
  for (const e of itens) {
    const g = grupos.find((x) => x.pedidoId === e.pedidoId)
    if (g) g.itens.push(e)
    else grupos.push({ pedidoId: e.pedidoId, numero: e.pedido.numero, cliente: e.pedido.cliente, itens: [e] })
  }

  function alternar(ids: string[], marcar: boolean) {
    const novo = new Set(selecionadas.map((e) => e.id))
    for (const id of ids) {
      if (marcar) novo.add(id)
      else novo.delete(id)
    }
    setMarcadas(novo)
  }

  function imprimir() {
    setImprimindo(selecionadas)
  }

  const lotes = imprimindo
    ? [...new Set(imprimindo.map((e) => e.pedidoId))].map((pedidoId) => ({ pedidoId, opIds: imprimindo.filter((e) => e.pedidoId === pedidoId).map((e) => e.ordemProducaoId) }))
    : []

  return (
    <>
      <PainelCartao
        aberto
        onFechar={onFechar}
        titulo={`Fila de etiquetas${itens.length ? ` (${itens.length})` : ''}`}
        subtitulo="OPs concluídas entram aqui sozinhas. Junte várias e imprima de uma vez, sem gastar uma folha por etiqueta."
        rodape={
          itens.length > 0 && (
            <div className="space-y-3">
              {selecionadas.length > 0 && !def.rolo && (
                <p className={cn('flex items-start gap-2 rounded-2xl px-3 py-2 text-xs', faltam ? 'bg-amber-50 text-amber-900' : 'bg-marca-suave text-tinta')}>
                  {faltam ? <Info className="mt-0.5 h-4 w-4 shrink-0" /> : <Sparkles className="mt-0.5 h-4 w-4 shrink-0" />}
                  <span>
                    {faltam
                      ? `Faltam ${faltam} para completar a folha (${def.rotulo}). Dá para esperar mais OPs ou aproveitar a sobra depois.`
                      : `Fecha ${selecionadas.length / def.porFolha === 1 ? 'a folha' : `${selecionadas.length / def.porFolha} folhas`} certinho (${def.rotulo}), sem sobra.`}
                  </span>
                </p>
              )}
              <Button className="w-full" size="lg" disabled={selecionadas.length === 0} onClick={imprimir}>
                <Printer /> Imprimir {selecionadas.length} etiqueta{selecionadas.length === 1 ? '' : 's'}
              </Button>
            </div>
          )
        }
      >
        {impressas && (
          <div className="flex items-center gap-3 rounded-2xl bg-marca-suave px-4 py-3 text-tinta" role="status">
            <CheckCircle2 className="h-5 w-5 shrink-0 text-marca-escuro" />
            <p className="min-w-0 flex-1 text-sm">
              {impressas.length === 1 ? '1 etiqueta marcada como impressa' : `${impressas.length} etiquetas marcadas como impressas`} e fora da fila.
            </p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                void acoes.voltar(impressas)
                setImpressas(null)
              }}
            >
              <Undo2 /> Desfazer
            </Button>
          </div>
        )}
        {fila.isPending ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-24 w-full rounded-2xl" />
            ))}
          </div>
        ) : fila.isError ? (
          <EstadoErro erro={fila.error} onTentarNovamente={() => void fila.refetch()} />
        ) : itens.length === 0 ? (
          <EmptyState
            className={impressas ? 'py-10' : undefined}
            icone={Tags}
            titulo="Fila vazia"
            descricao="Quando uma OP for concluída, a etiqueta dela aparece aqui. Também dá para adicionar pelo kanban da produção ou pelas entregas (modo Selecionar)."
          />
        ) : (
          <>
            <label className="flex items-center gap-2.5 font-semibold text-tinta">
              <Checkbox
                checked={selecionadas.length === itens.length}
                ref={(el) => {
                  if (el) el.indeterminate = selecionadas.length > 0 && selecionadas.length < itens.length
                }}
                onChange={(e) => setMarcadas(e.target.checked ? null : new Set())}
              />
              Todas
              <span className="font-normal text-texto-secundario">
                {selecionadas.length} de {itens.length}
              </span>
            </label>
            {grupos.map((g) => {
              const marcadasAqui = g.itens.filter((e) => selecionadas.includes(e)).length
              return (
                <div key={g.pedidoId} className="overflow-hidden rounded-2xl border border-border">
                  <label className="flex cursor-pointer items-center gap-2.5 border-b border-border bg-fundo/60 px-4 py-2.5">
                    <Checkbox
                      checked={marcadasAqui === g.itens.length}
                      ref={(el) => {
                        if (el) el.indeterminate = marcadasAqui > 0 && marcadasAqui < g.itens.length
                      }}
                      onChange={(e) => alternar(g.itens.map((x) => x.id), e.target.checked)}
                    />
                    <span className="flex min-w-0 flex-1 items-baseline gap-2">
                      <span className="shrink-0 font-mono text-xs font-semibold text-tinta">{g.numero}</span>
                      <span className="truncate font-semibold text-tinta">{g.cliente}</span>
                    </span>
                  </label>
                  <ul className="divide-y divide-border">
                    {g.itens.map((e) => (
                      <li key={e.id} className="flex items-center gap-2.5 py-1.5 pl-4 pr-2">
                        <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                          <Checkbox checked={selecionadas.includes(e)} onChange={(ev) => alternar([e.id], ev.target.checked)} />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate">
                              {Number(e.op.quantidade).toLocaleString('pt-BR')} × {e.item}
                            </span>
                            <span className="block text-xs text-texto-secundario">
                              {e.op.numero} · {e.automatica ? 'OP concluída' : 'adicionada'} há {desde(e.criadaEm)}
                            </span>
                          </span>
                        </label>
                        <button
                          type="button"
                          onClick={() => void acoes.remover(e.id)}
                          className="rounded-lg p-1.5 text-texto-secundario hover:bg-fundo hover:text-coral-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                          aria-label={`Tirar ${e.op.numero} da fila`}
                          title="Tirar da fila"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )
            })}
          </>
        )}
      </PainelCartao>
      {imprimindo && (
        <ImprimirEtiquetasDialog
          lotes={lotes}
          daFila
          onFechar={() => setImprimindo(null)}
          onImpresso={(opIds) => {
            const ids = imprimindo.filter((e) => opIds.includes(e.ordemProducaoId)).map((e) => e.id)
            setMarcadas(null)
            void acoes.marcarImpressas(ids).then((n) => setImpressas(n > 0 ? ids : null))
          }}
        />
      )}
    </>
  )
}
