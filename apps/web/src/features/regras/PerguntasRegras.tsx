import { useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Plus, Save, Sparkles, Trash2, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { MODOS_USO_REGRA, MODO_USO_ROTULOS, personalizadasDaPergunta, type ModoUsoRegra, type PerguntaRegra, type RespostasRegras } from '@onprint/shared'
import { ErroApi } from '@/api/http'
import { regrasApi, type RegraComercialLista } from '@/api/regras'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Interruptor } from '@/features/vitrine/components/Interruptor'
import { cn } from '@/lib/utils'
import { respostasParaApi } from './perguntas'
import { Escolha } from './RegraDialog'

const DICA_MODO: Record<ModoUsoRegra, string> = {
  sempre: 'Entra sozinho em todo orçamento que se encaixa.',
  sugerir: 'Aparece para o vendedor aplicar com um clique.',
  se_pedir: 'O vendedor só oferece se o cliente pedir desconto.',
}

/** "Como usar": sempre, sugerir ao vendedor ou só se o cliente pedir */
function ComoUsar({ valor, onChange, desabilitado }: { valor: ModoUsoRegra; onChange: (v: ModoUsoRegra) => void; desabilitado?: boolean }) {
  return (
    <fieldset disabled={desabilitado} className="space-y-1">
      <legend className="mb-1 text-xs font-medium text-texto-secundario">Como usar</legend>
      <Escolha rotulo="Como usar" valor={valor} onChange={onChange} opcoes={MODOS_USO_REGRA.map((m): [ModoUsoRegra, string] => [m, MODO_USO_ROTULOS[m]])} />
      <p className="text-xs text-texto-secundario">{DICA_MODO[valor]}</p>
    </fieldset>
  )
}

interface CartaoProps {
  pergunta: PerguntaRegra
  titulo: string
  ligado: boolean
  onLigar: (v: boolean) => void
  editavel: boolean
  /** Preenchida agora pelo Assistente (a pessoa confere antes de salvar) */
  sugerida: boolean
  erro?: string
  /** Regras do mesmo tipo feitas no avançado */
  personalizadas: number
  children: ReactNode
}

function Cartao({ pergunta, titulo, ligado, onLigar, editavel, sugerida, erro, personalizadas, children }: CartaoProps) {
  return (
    <Card className={cn('p-4 sm:p-5', sugerida && 'ring-1 ring-marca/50', erro && 'ring-1 ring-coral/60')} data-pergunta={pergunta}>
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 font-semibold text-tinta">{titulo}</p>
        {sugerida && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-marca-suave px-2 py-0.5 text-[0.6875rem] font-semibold text-marca-escuro">
            <Sparkles className="h-3 w-3" /> sugerido
          </span>
        )}
        <Interruptor rotulo={titulo} marcado={ligado} onMudar={onLigar} desabilitado={!editavel} />
      </div>
      {ligado && <div className="mt-4 space-y-4">{children}</div>}
      {erro && (
        <p className="mt-3 flex items-center gap-1.5 text-sm text-coral-escuro">
          <AlertTriangle className="h-4 w-4 shrink-0" /> {erro}
        </p>
      )}
      {personalizadas > 0 && (
        <p className="mt-3 text-xs text-texto-secundario">
          Você também tem {personalizadas === 1 ? '1 regra' : `${personalizadas} regras`} deste tipo em “Regras personalizadas”, que continua{personalizadas === 1 ? '' : 'm'} valendo.
        </p>
      )}
    </Card>
  )
}

/** Campo pequeno com rótulo na frente ("a partir de [10] un") */
const curto = 'w-24'

interface PerguntasProps {
  inicial: RespostasRegras
  regras: RegraComercialLista[]
  editavel: boolean
  /** Respostas que o Assistente acabou de preencher (substituem o formulário) */
  doAssistente: { respostas: RespostasRegras; mudadas: PerguntaRegra[] } | null
  onDescartarAssistente: () => void
}

/**
 * As seis perguntas das regras comerciais (o básico em um minuto). Cada uma liga/desliga e tem um ou dois números;
 * os descontos têm o "Como usar". Salvar cria, atualiza ou desliga as regras por baixo (PUT /regras-comerciais/perguntas).
 */
export function PerguntasRegras({ inicial, regras, editavel, doAssistente, onDescartarAssistente }: PerguntasProps) {
  const queryClient = useQueryClient()
  const [form, setForm] = useState<RespostasRegras>(doAssistente?.respostas ?? inicial)
  const [erros, setErros] = useState<Partial<Record<PerguntaRegra, string>>>({})
  const [salvando, setSalvando] = useState(false)
  const sugeridas = new Set(doAssistente?.mudadas ?? [])
  const alterado = JSON.stringify(form) !== JSON.stringify(inicial)
  const set = <K extends PerguntaRegra>(p: K, d: Partial<RespostasRegras[K]>) => {
    setForm((f) => ({ ...f, [p]: { ...f[p], ...d } }))
    setErros((e) => ({ ...e, [p]: undefined }))
  }
  const personalizadas = (p: PerguntaRegra) => personalizadasDaPergunta(p, regras).length

  async function salvar() {
    setSalvando(true)
    setErros({})
    try {
      const lista = await regrasApi.salvarRespostas(respostasParaApi(form))
      queryClient.setQueryData(['regras-comerciais'], lista)
      await queryClient.invalidateQueries({ queryKey: ['orcamentos'] })
      onDescartarAssistente()
      toast.success('Regras salvas. Já valem nos próximos orçamentos.')
    } catch (e) {
      const detalhes = e instanceof ErroApi ? (e.details as { erros?: { pergunta: PerguntaRegra; mensagem: string }[] } | undefined) : undefined
      if (detalhes?.erros) setErros(Object.fromEntries(detalhes.erros.map((x) => [x.pergunta, x.mensagem])))
      toast.error((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const { quantidade, aVista, especiais, urgencia, minimo, limite } = form
  const comum = (p: PerguntaRegra) => ({ pergunta: p, editavel, sugerida: sugeridas.has(p), erro: erros[p], personalizadas: personalizadas(p) })

  return (
    <div className="space-y-3">
      <fieldset disabled={!editavel} className="min-w-0 space-y-3">
        <Cartao {...comum('quantidade')} titulo="Dá desconto por quantidade?" ligado={quantidade.ligado} onLigar={(v) => set('quantidade', { ligado: v })}>
          <div className="space-y-2">
            {quantidade.faixas.map((f, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span>A partir de</span>
                <NumberInput
                  aria-label={`Faixa ${i + 1}: a partir de quantas unidades`}
                  className={curto}
                  casas={0}
                  sufixo="un"
                  value={f.aPartirDe}
                  onChange={(e) => set('quantidade', { faixas: quantidade.faixas.map((x, j) => (j === i ? { ...x, aPartirDe: e.target.value } : x)) })}
                />
                <span>→</span>
                <NumberInput
                  aria-label={`Faixa ${i + 1}: desconto`}
                  className={curto}
                  sufixo="%"
                  value={f.percentual}
                  onChange={(e) => set('quantidade', { faixas: quantidade.faixas.map((x, j) => (j === i ? { ...x, percentual: e.target.value } : x)) })}
                />
                {quantidade.faixas.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Tirar faixa ${i + 1}`} onClick={() => set('quantidade', { faixas: quantidade.faixas.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {quantidade.faixas.length < 10 && (
              <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => set('quantidade', { faixas: [...quantidade.faixas, { aPartirDe: '', percentual: '' }] })}>
                <Plus /> outra faixa
              </Button>
            )}
          </div>
          <ComoUsar valor={quantidade.modoUso} onChange={(modoUso) => set('quantidade', { modoUso })} />
        </Cartao>

        <Cartao {...comum('aVista')} titulo="Dá desconto para pagamento à vista ou Pix?" ligado={aVista.ligado} onLigar={(v) => set('aVista', { ligado: v })}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Desconto de</span>
            <NumberInput aria-label="Desconto à vista ou Pix" className={curto} sufixo="%" value={aVista.percentual} onChange={(e) => set('aVista', { percentual: e.target.value })} />
          </div>
          <ComoUsar valor={aVista.modoUso} onChange={(modoUso) => set('aVista', { modoUso })} />
        </Cartao>

        <Cartao {...comum('especiais')} titulo="Tem clientes com preço especial?" ligado={especiais.ligado} onLigar={(v) => set('especiais', { ligado: v })}>
          <div className="space-y-2">
            <p className="text-xs text-texto-secundario">Use a etiqueta que está no cadastro do cliente (ex.: Revenda).</p>
            {especiais.lista.map((e, i) => (
              <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
                <span>Etiqueta</span>
                <Input
                  aria-label={`Etiqueta ${i + 1}`}
                  className="w-36"
                  maxLength={40}
                  value={e.etiqueta}
                  onChange={(ev) => set('especiais', { lista: especiais.lista.map((x, j) => (j === i ? { ...x, etiqueta: ev.target.value } : x)) })}
                />
                <span>→</span>
                <NumberInput
                  aria-label={`Desconto da etiqueta ${i + 1}`}
                  className={curto}
                  sufixo="%"
                  value={e.percentual}
                  onChange={(ev) => set('especiais', { lista: especiais.lista.map((x, j) => (j === i ? { ...x, percentual: ev.target.value } : x)) })}
                />
                {especiais.lista.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" aria-label={`Tirar etiqueta ${i + 1}`} onClick={() => set('especiais', { lista: especiais.lista.filter((_, j) => j !== i) })}>
                    <Trash2 />
                  </Button>
                )}
              </div>
            ))}
            {especiais.lista.length < 20 && (
              <Button type="button" variant="ghost" size="sm" className="px-2" onClick={() => set('especiais', { lista: [...especiais.lista, { etiqueta: '', percentual: '' }] })}>
                <Plus /> outra etiqueta
              </Button>
            )}
          </div>
          <ComoUsar valor={especiais.modoUso} onChange={(modoUso) => set('especiais', { modoUso })} />
        </Cartao>

        <Cartao {...comum('urgencia')} titulo="Cobra a mais por urgência?" ligado={urgencia.ligado} onLigar={(v) => set('urgencia', { ligado: v })}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Mais</span>
            <NumberInput aria-label="Acréscimo de urgência" className={curto} sufixo="%" value={urgencia.percentual} onChange={(e) => set('urgencia', { percentual: e.target.value })} />
            <span>para menos de</span>
            <NumberInput aria-label="Dias úteis" className={curto} casas={0} value={urgencia.dias} onChange={(e) => set('urgencia', { dias: e.target.value })} />
            <span>dias úteis</span>
          </div>
          <p className="text-xs text-texto-secundario">Entra sozinho e avisa a equipe para conferir a fila da produção.</p>
        </Cartao>

        <Cartao {...comum('minimo')} titulo="Tem pedido mínimo?" ligado={minimo.ligado} onLigar={(v) => set('minimo', { ligado: v })}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Pedido mínimo de</span>
            <div className="w-36">
              <MoneyInput aria-label="Pedido mínimo" value={minimo.valor} onChange={(e) => set('minimo', { valor: e.target.value })} />
            </div>
          </div>
          <p className="text-xs text-texto-secundario">Abaixo disso, o orçamento sobe até o mínimo.</p>
        </Cartao>

        <Cartao {...comum('limite')} titulo="Até quanto o vendedor pode dar de desconto sem te perguntar?" ligado={limite.ligado} onLigar={(v) => set('limite', { ligado: v })}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span>Até</span>
            <NumberInput aria-label="Desconto máximo do vendedor" className={curto} sufixo="%" value={limite.percentual} onChange={(e) => set('limite', { percentual: e.target.value })} />
          </div>
          <p className="text-xs text-texto-secundario">Passou disso, o orçamento espera um gerente liberar antes de ir para o cliente.</p>
        </Cartao>
      </fieldset>

      {editavel && (alterado || doAssistente) && (
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border bg-card p-3 shadow-suave">
          <span className="text-sm text-texto-secundario">{doAssistente ? 'Confira o que o Assistente preencheu e salve.' : 'Você mudou as respostas.'}</span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={salvando}
              onClick={() => {
                setForm(inicial)
                setErros({})
                onDescartarAssistente()
              }}
            >
              <Undo2 /> Desfazer
            </Button>
            <Button type="button" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
