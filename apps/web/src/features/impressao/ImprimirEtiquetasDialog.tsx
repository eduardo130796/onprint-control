import { useMemo, useState } from 'react'
import { useQueries } from '@tanstack/react-query'
import { FileDown, ListPlus, Loader2, Printer } from 'lucide-react'
import { FORMATOS_ETIQUETA, FORMATO_ETIQUETA, distribuirEtiquetas, posicaoInicialValida, type FormatoEtiqueta, type PedidoDetalhe } from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { chavesDoLote, formatoSalvo, proximaPosicaoSalva, salvarFormato, salvarProximaPosicao, volumesDoPedido, type LoteEtiquetas } from './etiquetas'
import { useAcoesFilaEtiquetas, useFilaEtiquetas } from './useFilaEtiquetas'
import { useImpressao, type ModoImpressao } from './useImpressao'

interface ImprimirEtiquetasDialogProps {
  lotes: LoteEtiquetas[]
  onFechar: () => void
  /** Depois de imprimir/baixar: as OPs que saíram no papel (a fila marca como impressas) */
  onImpresso?: (opIds: string[]) => void
  /** Veio da fila: esconde "Adicionar à fila" */
  daFila?: boolean
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`

/**
 * "Imprimir etiquetas": escolhe as etiquetas (de um ou vários pedidos), o papel (lembrado neste navegador)
 * e a casa da folha onde começar, para aproveitar folha já usada. Imprime, baixa o PDF ou manda para a fila.
 */
export function ImprimirEtiquetasDialog({ lotes, onFechar, onImpresso, daFila }: ImprimirEtiquetasDialogProps) {
  const pedidoIds = useMemo(() => [...new Set(lotes.map((l) => l.pedidoId))], [lotes])
  const consultas = useQueries({ queries: pedidoIds.map((id) => ({ queryKey: ['pedidos', 'detalhe', id], queryFn: () => pedidosApi.obter(id) })) })
  const pedidos = consultas.map((c) => c.data).filter((p): p is PedidoDetalhe => Boolean(p))
  const carregando = consultas.some((c) => c.isPending)
  const erro = consultas.find((c) => c.isError)

  // null = ainda não mexeu: valem as etiquetas pedidas ao abrir
  const [marcadas, setMarcadas] = useState<Set<string> | null>(null)
  const [formato, setFormato] = useState<FormatoEtiqueta>(formatoSalvo)
  const [inicio, setInicio] = useState(1)
  const impressao = useImpressao()
  const fila = useFilaEtiquetas()
  const acoesFila = useAcoesFilaEtiquetas()
  const [enfileirando, setEnfileirando] = useState(false)

  const def = FORMATO_ETIQUETA[formato]
  const ordenados = pedidoIds.map((id) => pedidos.find((p) => p.id === id)).filter((p): p is PedidoDetalhe => Boolean(p))
  const selecionadas =
    marcadas ??
    new Set(
      ordenados.flatMap((p) => {
        const doPedido = lotes.filter((l) => l.pedidoId === p.id)
        return chavesDoLote(p, doPedido.some((l) => !l.opIds) ? undefined : doPedido.flatMap((l) => l.opIds ?? []))
      }),
    )
  const grupos = ordenados.map((pedido) => ({ pedido, volumes: volumesDoPedido(pedido) }))
  const total = grupos.reduce((s, g) => s + g.volumes.filter((v) => selecionadas.has(v.chave)).length, 0)
  const todas = grupos.flatMap((g) => g.volumes.map((v) => v.chave))
  const posicao = posicaoInicialValida(formato, inicio)
  const dist = distribuirEtiquetas(total, formato, posicao)
  const continuar = def.rolo ? null : proximaPosicaoSalva(formato)
  const opsMarcadas = todas.filter((c) => selecionadas.has(c) && !c.startsWith('item:'))
  const ocupado = Boolean(impressao.ocupado) || enfileirando

  function alternar(chaves: string[], marcar: boolean) {
    const novo = new Set(selecionadas)
    for (const c of chaves) {
      if (marcar) novo.add(c)
      else novo.delete(c)
    }
    setMarcadas(novo)
  }

  function escolherFormato(f: FormatoEtiqueta) {
    setFormato(f)
    setInicio(1)
    salvarFormato(f)
  }

  async function gerar(modo: ModoImpressao) {
    const escolhidos = grupos
      .map((g) => ({ pedido: g.pedido, chaves: g.volumes.filter((v) => selecionadas.has(v.chave)).map((v) => v.chave) }))
      .filter((g) => g.chaves.length > 0)
    const ok = await impressao.etiquetas(escolhidos, { formato, inicio: posicao }, modo)
    if (!ok) return
    if (!def.rolo) salvarProximaPosicao(formato, dist.proximaPosicao)
    onImpresso?.(opsMarcadas)
    onFechar()
  }

  async function mandarParaFila() {
    setEnfileirando(true)
    const ok = await acoesFila.adicionar({ opIds: opsMarcadas })
    setEnfileirando(false)
    if (ok) onFechar()
  }

  const resumo =
    total === 0
      ? 'Nenhuma etiqueta escolhida'
      : def.rolo
        ? `${plural(total, 'etiqueta', 'etiquetas')} · ${plural(total, 'página', 'páginas')} no rolo`
        : `${plural(total, 'etiqueta', 'etiquetas')} · ${plural(dist.folhas, 'folha', 'folhas')}${dist.sobram ? ` · sobra${dist.sobram === 1 ? '' : 'm'} ${plural(dist.sobram, 'espaço', 'espaços')}` : ' · folha completa'}`

  return (
    <Dialog open onOpenChange={(v) => !v && !ocupado && onFechar()}>
      <DialogContent className="top-[3vh] flex max-h-[94vh] max-w-4xl flex-col gap-0 overflow-hidden rounded-3xl p-0">
        <header className="border-b border-border px-5 pb-4 pt-5 sm:px-6">
          <DialogTitle className="font-titulo text-xl font-extrabold">Imprimir etiquetas</DialogTitle>
          <DialogDescription className="mt-1">Escolha as etiquetas, o papel e onde começar na folha — dá para aproveitar uma folha já usada.</DialogDescription>
        </header>

        <div className="grid min-h-0 flex-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_320px]">
          {/* Etiquetas por pedido */}
          <section className="min-w-0 space-y-3 p-5 sm:px-6 md:overflow-y-auto">
            {erro ? (
              <EstadoErro erro={erro.error} onTentarNovamente={() => void erro.refetch()} />
            ) : carregando ? (
              <div className="space-y-3">
                {pedidoIds.slice(0, 3).map((id) => (
                  <Skeleton key={id} className="h-28 w-full rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                <label className="flex items-center gap-2.5 text-sm font-semibold text-tinta">
                  <Checkbox
                    checked={todas.length > 0 && total === todas.length}
                    ref={(el) => {
                      if (el) el.indeterminate = total > 0 && total < todas.length
                    }}
                    onChange={(e) => alternar(todas, e.target.checked)}
                  />
                  Todas
                  <span className="font-normal text-texto-secundario">
                    {total} de {todas.length}
                  </span>
                </label>
                {grupos.map(({ pedido, volumes }) => {
                  const marcadasAqui = volumes.filter((v) => selecionadas.has(v.chave)).length
                  return (
                    <div key={pedido.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                      <label className="flex cursor-pointer items-center gap-2.5 border-b border-border bg-fundo/60 px-4 py-2.5">
                        <Checkbox
                          checked={marcadasAqui === volumes.length}
                          ref={(el) => {
                            if (el) el.indeterminate = marcadasAqui > 0 && marcadasAqui < volumes.length
                          }}
                          onChange={(e) => alternar(volumes.map((v) => v.chave), e.target.checked)}
                        />
                        <span className="flex min-w-0 flex-1 items-baseline gap-2">
                          <span className="shrink-0 font-mono text-xs font-semibold text-tinta">{pedido.numero}</span>
                          <span className="truncate text-sm font-semibold text-tinta">{pedido.cliente.nome}</span>
                        </span>
                        <span className="shrink-0 text-xs text-texto-secundario">
                          {marcadasAqui}/{volumes.length}
                        </span>
                      </label>
                      <ul className="divide-y divide-border">
                        {volumes.map((v) => (
                          <li key={v.chave}>
                            <label className="flex cursor-pointer items-center gap-2.5 px-4 py-2 text-sm hover:bg-fundo/50">
                              <Checkbox checked={selecionadas.has(v.chave)} onChange={(e) => alternar([v.chave], e.target.checked)} />
                              <span className="min-w-0 flex-1">
                                <span className="block truncate">
                                  {Number(v.item.quantidade).toLocaleString('pt-BR')} × {v.item.descricao}
                                </span>
                                <span className="block text-xs text-texto-secundario">
                                  {v.op ? v.op.numero : 'sem OP'} · volume {v.indice} de {v.total}
                                </span>
                              </span>
                            </label>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )
                })}
              </>
            )}
          </section>

          {/* Papel e posição */}
          <aside className="space-y-5 border-t border-border bg-fundo/40 p-5 sm:px-6 md:border-l md:border-t-0">
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">Papel</h3>
              <div role="radiogroup" aria-label="Formato da etiqueta" className="space-y-2">
                {FORMATOS_ETIQUETA.map((f) => {
                  const d = FORMATO_ETIQUETA[f]
                  const ativo = f === formato
                  return (
                    <button
                      key={f}
                      type="button"
                      role="radio"
                      aria-checked={ativo}
                      onClick={() => escolherFormato(f)}
                      className={cn(
                        'flex w-full items-center gap-3 rounded-2xl border bg-card px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca',
                        ativo ? 'border-marca ring-1 ring-marca' : 'border-border hover:border-tinta/30',
                      )}
                    >
                      <IconeFormato formato={f} ativo={ativo} />
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-tinta">{d.rotulo}</span>
                        <span className="block text-xs leading-snug text-texto-secundario">{d.descricao}</span>
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-texto-secundario">{def.rolo ? 'Prévia' : 'Começar na posição'}</h3>
              {!def.rolo && ((continuar !== null && continuar !== posicao) || posicao > 1) && (
                <div className="mb-2 flex flex-wrap gap-1.5">
                  {continuar && continuar !== posicao && (
                    <button
                      type="button"
                      onClick={() => setInicio(continuar)}
                      className="rounded-full bg-marca-suave px-3 py-1 text-xs font-semibold text-marca-escuro hover:bg-marca/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                    >
                      Continuar a última folha (posição {continuar})
                    </button>
                  )}
                  {posicao > 1 && (
                    <button
                      type="button"
                      onClick={() => setInicio(1)}
                      className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-tinta hover:bg-fundo focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
                    >
                      Folha nova
                    </button>
                  )}
                </div>
              )}
              <MiniaturaFolha formato={formato} pagina={dist.paginas[0] ?? null} posicao={posicao} onEscolher={setInicio} />
              {!def.rolo && <p className="mt-2 text-xs text-texto-secundario">Toque na casa onde a impressão deve começar. As casas antes dela ficam em branco.</p>}
            </div>
          </aside>
        </div>

        <footer className="flex flex-col gap-3 border-t border-border bg-card px-5 py-4 sm:flex-row sm:items-center sm:px-6">
          <p className="text-sm font-semibold text-tinta sm:mr-auto" aria-live="polite">
            {resumo}
            {dist.folhas > 1 && !def.rolo && <span className="block text-xs font-normal text-texto-secundario">A prévia mostra a primeira folha.</span>}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:flex">
            {!daFila && fila.pode && (
              <Button variant="ghost" className="col-span-2 sm:col-span-1" disabled={ocupado || opsMarcadas.length === 0} onClick={() => void mandarParaFila()}>
                {enfileirando ? <Loader2 className="animate-spin" /> : <ListPlus />} Adicionar à fila
              </Button>
            )}
            <Button variant="outline" disabled={ocupado || total === 0} onClick={() => void gerar('baixar')}>
              {impressao.ocupado === 'etiquetas:baixar' ? <Loader2 className="animate-spin" /> : <FileDown />} Baixar PDF
            </Button>
            <Button disabled={ocupado || total === 0} onClick={() => void gerar('imprimir')}>
              {impressao.ocupado === 'etiquetas:imprimir' ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir
            </Button>
          </div>
        </footer>
      </DialogContent>
    </Dialog>
  )
}

/** Desenho pequeno do papel de cada formato. */
function IconeFormato({ formato, ativo }: { formato: FormatoEtiqueta; ativo: boolean }) {
  const d = FORMATO_ETIQUETA[formato]
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 gap-[2px] rounded-[4px] border bg-white p-[3px]', d.rolo ? 'h-9 w-6' : 'h-10 w-7', ativo ? 'border-marca' : 'border-[#CBD5E1]')}
      style={{ gridTemplateColumns: `repeat(${d.colunas}, 1fr)`, gridTemplateRows: `repeat(${d.linhas}, 1fr)` }}
    >
      {Array.from({ length: d.porFolha }, (_, i) => (
        <span key={i} className={cn('rounded-[1px]', ativo ? 'bg-marca/60' : 'bg-[#CBD5E1]')} />
      ))}
    </span>
  )
}

/**
 * Miniatura da primeira folha (o papel é sempre branco, como sai da impressora): casas puladas hachuradas,
 * etiquetas numeradas na cor da marca e espaços livres tracejados. Clicar escolhe a posição inicial.
 */
function MiniaturaFolha({ formato, pagina, posicao, onEscolher }: { formato: FormatoEtiqueta; pagina: (number | null)[] | null; posicao: number; onEscolher: (n: number) => void }) {
  const d = FORMATO_ETIQUETA[formato]
  if (d.rolo) {
    return (
      <div className="flex items-center gap-3">
        <div className="flex aspect-[100/150] w-24 flex-col justify-between rounded-md border border-[#CBD5E1] bg-white p-2 shadow-sm" aria-hidden="true">
          <span className="h-2 rounded-sm bg-[#334155]" />
          <span className="h-3 w-3/4 rounded-sm bg-marca/50" />
          <span className="h-1.5 w-full rounded-sm bg-[#E2E8F0]" />
          <span className="h-1.5 w-5/6 rounded-sm bg-[#E2E8F0]" />
          <span className="h-6 rounded-sm bg-[#F1F5F9]" />
        </div>
        <p className="text-xs text-texto-secundario">Uma etiqueta por página, no tamanho exato do rolo. Configure a impressora para papel 100 × 150 mm.</p>
      </div>
    )
  }
  return (
    <div
      className="mx-auto grid aspect-[210/297] w-full max-w-[180px] gap-1 rounded-md border border-[#CBD5E1] bg-white p-1.5 shadow-sm"
      style={{ gridTemplateColumns: `repeat(${d.colunas}, 1fr)`, gridTemplateRows: `repeat(${d.linhas}, 1fr)` }}
      role="radiogroup"
      aria-label="Posição inicial na folha"
    >
      {Array.from({ length: d.porFolha }, (_, i) => {
        const n = i + 1
        const indice = pagina?.[i] ?? null
        const pulada = n < posicao
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={n === posicao}
            aria-label={`Começar na posição ${n}`}
            onClick={() => onEscolher(n)}
            className={cn(
              'relative flex items-center justify-center rounded-[3px] text-[11px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca',
              pulada
                ? 'bg-[repeating-linear-gradient(135deg,#E5E7EB_0_4px,#F3F4F6_4px_8px)] text-[#94A3B8]'
                : indice !== null
                  ? 'border border-marca bg-marca/15 text-[#1F2937]'
                  : 'border border-dashed border-[#CBD5E1] text-[#94A3B8] hover:border-marca',
              n === posicao && 'ring-2 ring-marca ring-offset-1 ring-offset-white',
            )}
          >
            {pulada ? 'usada' : n}
          </button>
        )
      })}
    </div>
  )
}
