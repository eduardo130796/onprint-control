import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { ProdutoVitrineResumo } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { CHAVE_VITRINE_CONFIG, CHAVE_VITRINE_PRODUTOS, vitrineApi } from '@/api/vitrine'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Checkbox, Textarea } from '@/components/ui/form-controls'
import { SeloSugerido } from '@/features/assistente/SeloSugerido'
import { useAtualizarUsoAssistente } from '@/features/assistente/useAssistente'
import { dadosVitrine } from '../utils'

/** Por vez: cada descrição é uma chamada ao Assistente (conta no limite do mês) */
export const MAX_DESCRICOES_LOTE = 20

interface Linha {
  produto: ProdutoVitrineResumo
  texto: string | null
  erro: string | null
  incluir: boolean
}

interface Props {
  aberto: boolean
  onFechar: () => void
  /** Produtos ativos sem texto de venda */
  produtos: ProdutoVitrineResumo[]
}

/**
 * "Gerar descrições para os produtos sem texto" (Vitrine → Produtos): o Assistente escreve o texto de venda de cada
 * um com os dados do cadastro; a pessoa revisa, ajusta e salva os que quiser (nada é salvo sozinho).
 */
export function DescricoesEmLoteDialog({ aberto, onFechar, produtos }: Props) {
  const queryClient = useQueryClient()
  const atualizarUso = useAtualizarUsoAssistente()
  const [linhas, setLinhas] = useState<Linha[]>([])
  const [gerando, setGerando] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const parar = useRef(false)
  const alvo = produtos.slice(0, MAX_DESCRICOES_LOTE)

  async function gerar() {
    parar.current = false
    setGerando(true)
    setLinhas(alvo.map((produto) => ({ produto, texto: null, erro: null, incluir: false })))
    for (const [i, p] of alvo.entries()) {
      if (parar.current) break
      try {
        const r = await assistenteApi.descricao({ produtoId: p.id, destino: 'vitrine' })
        setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, texto: r.texto, incluir: true } : l)))
      } catch (e) {
        setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, erro: (e as Error).message } : l)))
        // Limite do mês ou Assistente desligado: não adianta seguir
        if (/limite|desligad|liberado/i.test((e as Error).message)) break
      }
    }
    setGerando(false)
    atualizarUso()
  }

  const prontas = linhas.filter((l) => l.incluir && l.texto?.trim())

  async function salvar() {
    setSalvando(true)
    let salvas = 0
    try {
      for (const l of prontas) {
        await vitrineApi.salvarProduto(l.produto.id, dadosVitrine(l.produto, { descricaoPublica: l.texto!.trim() }))
        salvas++
      }
      toast.success(`${salvas} texto(s) de venda salvo(s).`)
      fechar()
    } catch (e) {
      toast.error(`${salvas} salvo(s); parou em um erro: ${(e as Error).message}`)
    } finally {
      setSalvando(false)
      await Promise.all([queryClient.invalidateQueries({ queryKey: [CHAVE_VITRINE_PRODUTOS] }), queryClient.invalidateQueries({ queryKey: CHAVE_VITRINE_CONFIG })])
    }
  }

  function fechar() {
    parar.current = true
    setLinhas([])
    onFechar()
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !salvando && fechar()}>
      <DialogContent className="top-[5%] flex max-h-[90vh] max-w-2xl flex-col">
        <div className="pr-6">
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-marca-escuro" aria-hidden="true" /> Descrições com o Assistente
          </DialogTitle>
          <DialogDescription className="mt-1 text-sm text-texto-secundario">
            {produtos.length} produto(s) ativo(s) sem texto de venda{produtos.length > MAX_DESCRICOES_LOTE ? ` (os primeiros ${MAX_DESCRICOES_LOTE} desta vez)` : ''}. O Assistente escreve
            com os dados do cadastro, sem inventar medidas nem preços; você revisa antes de salvar.
          </DialogDescription>
        </div>

        {linhas.length > 0 && (
          <ul className="-mx-2 min-h-0 flex-1 space-y-3 overflow-y-auto px-2" aria-label="Textos sugeridos">
            {linhas.map((l, i) => (
              <li key={l.produto.id} className="space-y-2 rounded-xl border border-border p-3">
                <label className="flex items-center gap-2 text-sm font-medium text-tinta">
                  <Checkbox
                    checked={l.incluir}
                    disabled={!l.texto}
                    onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, incluir: e.target.checked } : x)))}
                  />
                  <span className="min-w-0 flex-1 truncate">{l.produto.nomePublico || l.produto.nome}</span>
                  {l.texto && <SeloSugerido curto />}
                </label>
                {l.texto !== null ? (
                  <Textarea
                    aria-label={`Texto de venda de ${l.produto.nome}`}
                    rows={4}
                    value={l.texto}
                    onChange={(e) => setLinhas((ls) => ls.map((x, j) => (j === i ? { ...x, texto: e.target.value } : x)))}
                  />
                ) : l.erro ? (
                  <p className="flex items-start gap-1.5 text-xs text-amber-800">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {l.erro}
                  </p>
                ) : (
                  <p className="flex items-center gap-1.5 text-xs text-texto-secundario">
                    {gerando ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> aguardando…
                      </>
                    ) : (
                      'não gerado'
                    )}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="flex flex-col-reverse gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
          <Button type="button" variant="outline" onClick={fechar} disabled={salvando}>
            {linhas.length ? 'Descartar' : 'Cancelar'}
          </Button>
          {!linhas.length || gerando ? (
            <Button type="button" onClick={() => void gerar()} disabled={gerando || !alvo.length}>
              {gerando ? <Loader2 className="animate-spin" /> : <Sparkles />} {gerando ? `Escrevendo ${linhas.filter((l) => l.texto || l.erro).length + 1} de ${alvo.length}…` : 'Gerar descrições'}
            </Button>
          ) : (
            <Button type="button" onClick={() => void salvar()} disabled={!prontas.length || salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar {prontas.length === linhas.length ? 'todas' : 'as marcadas'} ({prontas.length})
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
