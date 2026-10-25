import { useEffect, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, BookOpenText, ChevronDown, FlaskConical, Loader2, Pencil, Plus, Save, Scale, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { regrasAvancadas, respostasComTexto, respostasDasRegras, type PerguntaRegra, type RegrasDeTexto, type RespostasRegras } from '@onprint/shared'
import { regrasApi, type ListaRegras, type RegraComercialLista } from '@/api/regras'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Gaveta } from '@/components/shared/Gaveta'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { useAjudaLiberada } from '@/features/assistente/useAssistente'
import { Interruptor } from '@/features/vitrine/components/Interruptor'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { ExpliqueComPalavras } from './ExpliqueComPalavras'
import { PerguntasRegras } from './PerguntasRegras'
import { respostasParaApi, respostasParaTela } from './perguntas'
import { RegraDialog } from './RegraDialog'
import { rascunhoDaRegra, rascunhoNovo, type RascunhoRegra } from './rascunho'
import { SimuladorRegras } from './SimuladorRegras'

const CHAVE = ['regras-comerciais']
const VAZIO: ListaRegras['nomes'] = { produtos: {}, categorias: {}, clientes: {} }

/** Seção fechada por padrão (o avançado não atrapalha quem só quer o básico) */
function Recolhida({ titulo, icone: Icone, contador, children }: { titulo: string; icone: typeof Scale; contador?: number; children: ReactNode }) {
  const [aberta, setAberta] = useState(false)
  return (
    <Card>
      <button type="button" aria-expanded={aberta} onClick={() => setAberta((v) => !v)} className="flex w-full items-center gap-2 p-4 text-left sm:px-5">
        <Icone className="h-4 w-4 shrink-0 text-texto-secundario" />
        <span className="min-w-0 flex-1 font-semibold text-tinta">
          {titulo}
          {contador ? <span className="ml-1 font-normal text-texto-secundario">({contador})</span> : null}
        </span>
        <ChevronDown className={cn('h-4 w-4 shrink-0 text-texto-secundario transition-transform', aberta && 'rotate-180')} />
      </button>
      {aberta && <div className="border-t border-border p-4 sm:px-5">{children}</div>}
    </Card>
  )
}

/** Manual do atendente: orientações livres do dono para o Assistente (nunca mudam preço) */
function ManualAtendente({ podeEditar }: { podeEditar: boolean }) {
  const consulta = useQuery({ queryKey: [...CHAVE, 'manual'], queryFn: regrasApi.manual })
  const [texto, setTexto] = useState('')
  const salvar = useMutacao(CHAVE, (t: string) => regrasApi.salvarManual(t))
  useEffect(() => {
    if (consulta.data) setTexto(consulta.data.manualAtendente ?? '')
  }, [consulta.data])
  const alterado = (consulta.data?.manualAtendente ?? '') !== texto

  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-secundario">Como o Assistente deve atender (ex.: “sempre oferecer a criação de arte”). Não muda preço nem desconto.</p>
      {consulta.isPending ? (
        <Skeleton className="h-28 w-full" />
      ) : podeEditar ? (
        <>
          <Textarea
            rows={5}
            value={texto}
            maxLength={4000}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Orientações para o Assistente"
            placeholder={'Ex.:\n- Sempre oferecer a criação de arte quando o cliente não tiver o arquivo.\n- Banner acima de 3 m: lembrar do reforço e dos ilhoses.'}
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-texto-secundario">{texto.length.toLocaleString('pt-BR')} / 4.000 · telefone, documento e e-mail não vão para o Assistente</span>
            <Button
              size="sm"
              disabled={!alterado || salvar.isPending}
              onClick={() =>
                salvar.mutate(texto, {
                  onSuccess: () => toast.success('Orientações salvas.'),
                  onError: (e) => toast.error(e.message),
                })
              }
            >
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        </>
      ) : consulta.data?.manualAtendente ? (
        <p className="whitespace-pre-line text-sm">{consulta.data.manualAtendente}</p>
      ) : (
        <p className="text-sm text-texto-secundario">Nenhuma orientação escrita ainda.</p>
      )}
    </div>
  )
}

/** As regras que nenhuma pergunta cobre: o construtor "Quando… Faça…" de sempre (liga/desliga, ordem, editar) */
function RegrasPersonalizadas({ todas, nomes, podeEditar }: { todas: RegraComercialLista[]; nomes: ListaRegras['nomes']; podeEditar: boolean }) {
  const [editando, setEditando] = useState<RascunhoRegra | null>(null)
  const [excluindo, setExcluindo] = useState<RegraComercialLista | null>(null)
  const ativar = useMutacao(['regras-comerciais', 'orcamentos'], ({ id, ativa }: { id: string; ativa: boolean }) => regrasApi.ativar(id, ativa))
  const ordenar = useMutacao(['regras-comerciais', 'orcamentos'], (ids: string[]) => regrasApi.ordenar(ids))
  const remover = useMutacao(['regras-comerciais', 'orcamentos'], (id: string) => regrasApi.remover(id))
  const avancadas = regrasAvancadas(todas)

  /** Troca a regra de lugar com a vizinha da lista (a ordem gravada é a de todas as regras) */
  function mover(i: number, d: -1 | 1) {
    const vizinha = avancadas[i + d]
    if (!vizinha) return
    const ids = todas.map((r) => r.id)
    const a = ids.indexOf(avancadas[i]!.id)
    const b = ids.indexOf(vizinha.id)
    ;[ids[a], ids[b]] = [ids[b]!, ids[a]!]
    ordenar.mutate(ids, { onError: (e) => toast.error(e.message) })
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-texto-secundario">Para o que as perguntas não cobrem: “Quando… faça…” com produto, categoria, período, aprovação do gerente e mais.</p>
      {avancadas.length > 0 && (
        <ol className="divide-y divide-border">
          {avancadas.map((r, i) => (
            <li key={r.id} className={cn('flex items-start gap-3 py-3', !r.ativa && 'opacity-60')}>
              {podeEditar && (
                <Interruptor
                  rotulo={r.ativa ? `Desligar ${r.nome}` : `Ligar ${r.nome}`}
                  marcado={r.ativa}
                  desabilitado={ativar.isPending}
                  onMudar={(ativa) => ativar.mutate({ id: r.id, ativa }, { onSuccess: () => toast.success(ativa ? 'Regra ligada.' : 'Regra desligada.'), onError: (e) => toast.error(e.message) })}
                />
              )}
              <div className="min-w-0 flex-1">
                <p className="font-medium text-tinta">{r.nome}</p>
                <p className="text-sm text-texto-secundario [overflow-wrap:anywhere]">{r.descricao}</p>
              </div>
              {podeEditar && (
                <div className="flex shrink-0 flex-wrap justify-end">
                  {avancadas.length > 1 && <AcaoIcone icone={ArrowUp} rotulo="Subir (vale antes)" onClick={() => mover(i, -1)} />}
                  {avancadas.length > 1 && <AcaoIcone icone={ArrowDown} rotulo="Descer (vale depois)" onClick={() => mover(i, 1)} />}
                  <AcaoIcone icone={Pencil} rotulo="Editar regra" onClick={() => setEditando(rascunhoDaRegra(r, nomes))} />
                  <AcaoIcone icone={Trash2} rotulo="Excluir regra" perigo onClick={() => setExcluindo(r)} />
                </div>
              )}
            </li>
          ))}
        </ol>
      )}
      {podeEditar && (
        <Button variant="outline" size="sm" onClick={() => setEditando(rascunhoNovo())}>
          <Plus /> Nova regra personalizada
        </Button>
      )}

      {editando && <RegraDialog key={editando.id ?? 'nova'} inicial={editando} nomes={nomes} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={Boolean(excluindo)}
        onAbertoChange={(v) => !v && setExcluindo(null)}
        titulo="Excluir regra"
        descricao={<>Excluir “{excluindo?.nome}”? Os orçamentos já salvos não mudam. Para pausar, desligue em vez de excluir.</>}
        textoConfirmar="Excluir"
        perigoso
        onConfirmar={async () => {
          await remover.mutateAsync(excluindo!.id)
          toast.success('Regra excluída.')
        }}
      />
    </div>
  )
}

/**
 * Configurações → Regras comerciais: o dono ensina o sistema como ensinaria um estagiário, em seis perguntas (o
 * básico em um minuto). O construtor completo "Quando… Faça…" e as orientações do Assistente ficam recolhidos; o
 * "Testar" abre numa gaveta. Quem só vende vê o que vale hoje.
 */
export function RegrasComerciaisPage() {
  const podeEditar = usePermission('configuracoes', 'editar')
  const consulta = useQuery({ queryKey: CHAVE, queryFn: regrasApi.listar })
  const assistenteLiberado = useAjudaLiberada('regras')
  const [testando, setTestando] = useState(false)
  const [explicando, setExplicando] = useState(false)
  const [doAssistente, setDoAssistente] = useState<{ respostas: RespostasRegras; mudadas: PerguntaRegra[]; naoEntendido: string[] } | null>(null)

  const nomes = consulta.data?.nomes ?? VAZIO
  const todas = consulta.data?.regras ?? []
  const inicial = respostasParaTela(respostasDasRegras(todas))

  function entendido(r: RegrasDeTexto) {
    // O que o Assistente entendeu entra por cima das respostas atuais (só as perguntas que o texto respondeu)
    const { respostas, mudadas } = respostasComTexto(respostasParaApi(inicial), r)
    setDoAssistente({ respostas: respostasParaTela(respostas), mudadas, naoEntendido: r.naoEntendido })
  }

  return (
    <>
      <PageHeader
        titulo="Regras comerciais"
        subtitulo={podeEditar ? 'Responda o básico. O sistema usa em todo orçamento, do jeito que você mandar.' : 'O que vale hoje nos orçamentos.'}
        acoes={
          <>
            {podeEditar && assistenteLiberado && (
              <Button variant="outline" onClick={() => setExplicando(true)}>
                <Sparkles /> Explique com suas palavras
              </Button>
            )}
            <Button variant="outline" onClick={() => setTestando(true)}>
              <FlaskConical /> Testar
            </Button>
          </>
        }
      />

      <div className="mx-auto max-w-3xl space-y-4">
        {consulta.isPending ? (
          <div className="space-y-3">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : consulta.isError ? (
          <Card>
            <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
          </Card>
        ) : (
          <>
            {doAssistente && doAssistente.naoEntendido.length > 0 && (
              <p className="rounded-2xl bg-ambar/10 p-3 text-sm text-amber-900 dark:text-amber-200">
                Ficou de fora (não cabe nas perguntas): {doAssistente.naoEntendido.join(' · ')}. Se precisar, crie em “Regras personalizadas”.
              </p>
            )}
            <PerguntasRegras
              // Volta ao gravado quando a lista muda (salvou) ou quando o Assistente preenche
              key={`${JSON.stringify(inicial)}-${doAssistente ? JSON.stringify(doAssistente.respostas) : ''}`}
              inicial={inicial}
              regras={todas}
              editavel={podeEditar}
              doAssistente={doAssistente}
              onDescartarAssistente={() => setDoAssistente(null)}
            />
            <Recolhida titulo="Regras personalizadas (avançado)" icone={Scale} contador={regrasAvancadas(todas).length}>
              <RegrasPersonalizadas todas={todas} nomes={nomes} podeEditar={podeEditar} />
            </Recolhida>
            <Recolhida titulo="Orientações para o Assistente" icone={BookOpenText}>
              <ManualAtendente podeEditar={podeEditar} />
            </Recolhida>
          </>
        )}
      </div>

      <Gaveta aberta={testando} onAbertaChange={setTestando} titulo="Testar as regras">
        <SimuladorRegras />
      </Gaveta>
      {podeEditar && assistenteLiberado && <ExpliqueComPalavras aberta={explicando} onAbertaChange={setExplicando} onEntendido={entendido} />}
    </>
  )
}
