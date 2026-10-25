import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowUp, ChevronRight, FileUp, Loader2, Paperclip, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { EXEMPLOS_PEDIDO, NOME_ASSISTENTE, formatarMoeda, type EstadoDoAssistente, type RespostaPedir, type RespostaPergunta } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { EVENTO_ABRIR_ASSISTENTE, type PedidoAbrirAssistente } from './abrirAssistente'
import { useAssistente, useAtualizarUsoAssistente } from './useAssistente'

/** A resposta que fica na caixa (o resto abre a tela certa) */
type NaCaixa = { tipo: 'pergunta'; resposta: RespostaPergunta } | { tipo: 'mensagem'; texto: string; anexar?: boolean }

const ACEITOS = '.xml,text/xml,application/xml,image/jpeg,image/png,image/webp,application/pdf'

/** Resposta de uma pergunta rápida: a frase do sistema, as linhas (um toque abre) e o relatório completo */
function RespostaDaPergunta({ r, onAbrir }: { r: RespostaPergunta; onAbrir: (path: string) => void }) {
  return (
    <div className="space-y-2" aria-live="polite">
      <p className="text-[0.9375rem] font-semibold text-tinta">{r.resumo}</p>
      {r.linhas.length > 0 && (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
          {r.linhas.map((l, i) => (
            <li key={i}>
              <button
                type="button"
                disabled={!l.link}
                onClick={() => l.link && onAbrir(l.link)}
                className="flex w-full items-center gap-3 px-3 py-2.5 text-left text-sm transition-colors enabled:hover:bg-fundo"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-tinta">{l.titulo}</span>
                  {l.detalhe && <span className="block truncate text-xs text-texto-secundario">{l.detalhe}</span>}
                </span>
                {l.valor && <span className="shrink-0 font-semibold tabular-nums text-tinta">{formatarMoeda(l.valor)}</span>}
                {l.link && <ChevronRight className="h-4 w-4 shrink-0 text-texto-secundario" />}
              </button>
            </li>
          ))}
        </ul>
      )}
      {r.mais > 0 && <p className="text-xs text-texto-secundario">E mais {r.mais}.</p>}
      {r.link && (
        <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => onAbrir(r.link!.path)}>
          {r.link.rotulo}
        </Button>
      )}
    </div>
  )
}

/**
 * "Peça ao Assistente" (✨ na barra do topo, ou "Pedir ao Assistente" na busca Ctrl+K): uma caixa só. A pessoa escreve,
 * cola o pedido do cliente ou anexa a nota (XML, foto, PDF); o Assistente entende e o sistema abre a tela já preenchida
 * (orçamento, entrada da nota, cliente, produto) ou responde na hora as perguntas do dia a dia. Enter envia.
 */
export function PecaAoAssistente() {
  const navigate = useNavigate()
  const assistente = useAssistente()
  const atualizarUso = useAtualizarUsoAssistente()
  const [aberta, setAberta] = useState(false)
  const [texto, setTexto] = useState('')
  const [lendo, setLendo] = useState(false)
  const [resposta, setResposta] = useState<NaCaixa | null>(null)
  const arquivo = useRef<HTMLInputElement>(null)
  const ligado = Boolean(assistente.data?.disponivel && assistente.data.controles.ativo)
  const simulado = Boolean(assistente.data?.simulado)

  function abrirTela(path: string, state?: EstadoDoAssistente) {
    setAberta(false)
    setResposta(null)
    setTexto('')
    navigate(path, state ? { state } : undefined)
  }

  /** O que fazer com a resposta: abrir a tela já preenchida ou mostrar na caixa */
  function seguir(r: RespostaPedir) {
    switch (r.tipo) {
      case 'orcamento':
        return abrirTela('/orcamentos/novo', { orcamentoAssistente: { texto: r.texto, leitura: r.leitura } })
      case 'produto':
        return abrirTela('/produtos/novo', { produtoAssistente: r.texto })
      case 'nota_compra':
        return abrirTela('/estoque/entradas/novo', { notaAssistente: r.nota })
      case 'cliente':
        if (r.existente) {
          toast.info(`${r.existente.rotulo} já está cadastrado.`)
          return abrirTela(`/clientes/${r.existente.id}`)
        }
        return abrirTela(`/clientes/novo?${new URLSearchParams(r.documento ? { documento: r.documento, ...(r.nome ? { nome: r.nome } : {}) } : { nome: r.nome ?? '' })}`)
      case 'pergunta':
        return setResposta({ tipo: 'pergunta', resposta: r.resposta })
      case 'anexar_nota':
        return setResposta({ tipo: 'mensagem', texto: r.mensagem, anexar: true })
      case 'nao_sei':
        return setResposta({ tipo: 'mensagem', texto: r.mensagem })
    }
  }

  const enviar = useCallback(
    async (pedido: string) => {
      const t = pedido.trim()
      if (t.length < 2 || lendo) return
      setLendo(true)
      setResposta(null)
      try {
        seguir(await assistenteApi.pedir(t))
      } catch (e) {
        setResposta({ tipo: 'mensagem', texto: (e as Error).message })
      } finally {
        setLendo(false)
        atualizarUso()
      }
    },
    // seguir/abrirTela só usam setters e navigate (estáveis)
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lendo, atualizarUso],
  )

  async function anexar(f: File | undefined) {
    if (!f) return
    setLendo(true)
    setResposta(null)
    try {
      const nota = await assistenteApi.nota(f)
      abrirTela('/estoque/entradas/novo', { notaAssistente: nota })
    } catch (e) {
      setResposta({ tipo: 'mensagem', texto: (e as Error).message })
    } finally {
      setLendo(false)
      atualizarUso()
      if (arquivo.current) arquivo.current.value = ''
    }
  }

  // Aberto pela busca (Ctrl+K → "Pedir ao Assistente") com o texto já digitado
  useEffect(() => {
    function onAbrir(e: Event) {
      const d = (e as CustomEvent<PedidoAbrirAssistente>).detail
      setAberta(true)
      setResposta(null)
      if (d?.texto) {
        setTexto(d.texto)
        if (d.enviar) void enviar(d.texto)
      }
    }
    window.addEventListener(EVENTO_ABRIR_ASSISTENTE, onAbrir)
    return () => window.removeEventListener(EVENTO_ABRIR_ASSISTENTE, onAbrir)
  }, [enviar])

  if (!ligado) return null

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label={`Peça ao ${NOME_ASSISTENTE}`}
        title={`Peça ao ${NOME_ASSISTENTE}: orçamento, nota, cliente, produto ou uma pergunta`}
        className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl bg-marca text-marca-contraste shadow-sm transition-colors hover:bg-marca-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40 md:w-auto md:px-3"
      >
        <Sparkles className="h-4 w-4" />
        <span className="hidden text-sm font-semibold lg:inline">Peça ao Assistente</span>
      </button>

      <Dialog
        open={aberta}
        onOpenChange={(v) => {
          setAberta(v)
          if (!v) setResposta(null)
        }}
      >
        <DialogContent className="top-[8%] max-h-[84vh] max-w-xl gap-3 overflow-y-auto p-4 sm:top-[12%] sm:p-5">
          <div className="flex items-center gap-2 pr-8">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-marca text-marca-contraste">
              <Sparkles className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <DialogTitle className="text-base">Peça ao Assistente</DialogTitle>
              <DialogDescription className="text-xs">Orçamento, nota de compra, cliente, produto ou uma pergunta. Nada é salvo sem você conferir.</DialogDescription>
            </div>
          </div>
          {simulado && (
            <p className="rounded-lg bg-ambar/15 px-3 py-1.5 text-xs font-medium text-amber-900 dark:text-amber-200">
              Modo de demonstração do Assistente: as respostas são simuladas (sem IA de verdade).
            </p>
          )}

          <form
            className="flex items-end gap-2 rounded-2xl border border-border bg-fundo/60 p-2 focus-within:border-marca"
            onSubmit={(e) => {
              e.preventDefault()
              void enviar(texto)
            }}
          >
            <Button type="button" variant="ghost" size="icon" className="shrink-0" aria-label="Anexar a nota (XML, foto ou PDF)" title="Anexar a nota (XML, foto ou PDF)" disabled={lendo} onClick={() => arquivo.current?.click()}>
              <Paperclip />
            </Button>
            <textarea
              autoFocus
              rows={2}
              maxLength={3000}
              value={texto}
              aria-label="O que você precisa"
              placeholder="Ex.: 2 banners 3x1 e mil cartões para a Padaria Pão Quente · quem está devendo? · cadastrar cliente 11.222.333/0001-81"
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => {
                // Enter envia; Shift+Enter quebra a linha (colar o pedido do cliente continua igual)
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault()
                  void enviar(texto)
                }
              }}
              className="max-h-40 min-h-[2.75rem] flex-1 resize-none bg-transparent py-2 text-[0.9375rem] outline-none placeholder:text-muted-foreground"
            />
            <Button type="submit" size="icon" className="shrink-0 rounded-xl" aria-label="Enviar" disabled={lendo || texto.trim().length < 2}>
              {lendo ? <Loader2 className="animate-spin" /> : <ArrowUp />}
            </Button>
            <input ref={arquivo} type="file" accept={ACEITOS} className="hidden" onChange={(e) => void anexar(e.target.files?.[0])} />
          </form>

          {lendo && (
            <p className="flex items-center gap-2 text-sm text-texto-secundario" role="status">
              <Loader2 className="h-4 w-4 animate-spin" /> Entendendo o pedido…
            </p>
          )}

          {!lendo && !resposta && (
            <div className="flex flex-wrap gap-2">
              {EXEMPLOS_PEDIDO.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => {
                    setTexto(ex)
                    void enviar(ex)
                  }}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-tinta transition-colors hover:border-marca hover:bg-marca-suave"
                >
                  {ex}
                </button>
              ))}
              <button
                type="button"
                onClick={() => arquivo.current?.click()}
                className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-border bg-card px-3 py-1.5 text-xs font-medium text-tinta transition-colors hover:border-marca hover:bg-marca-suave"
              >
                <FileUp className="h-3.5 w-3.5" /> Lançar nota (XML, foto ou PDF)
              </button>
            </div>
          )}

          {resposta?.tipo === 'pergunta' && <RespostaDaPergunta r={resposta.resposta} onAbrir={(p) => abrirTela(p)} />}
          {resposta?.tipo === 'mensagem' && (
            <div className={cn('space-y-2 rounded-xl bg-fundo p-3 text-sm text-tinta')} role="status">
              <p>{resposta.texto}</p>
              {resposta.anexar && (
                <Button type="button" size="sm" variant="outline" onClick={() => arquivo.current?.click()}>
                  <Paperclip /> Anexar a nota
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
