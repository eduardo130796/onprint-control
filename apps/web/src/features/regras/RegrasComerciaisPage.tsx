import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, BookOpenText, Loader2, Pencil, Plus, Save, Scale, Sparkles, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { PRESETS_REGRA, PRESETS_REGRA_INFO, regraComercialSchema, regraDoPreset, type PresetRegra } from '@onprint/shared'
import { regrasApi, type ListaRegras, type RegraComercialLista } from '@/api/regras'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { RegraDialog } from './RegraDialog'
import { rascunhoDaRegra, rascunhoNovo, type RascunhoRegra } from './rascunho'
import { SimuladorRegras } from './SimuladorRegras'

const CHAVE = ['regras-comerciais']
const VAZIO: ListaRegras['nomes'] = { produtos: {}, categorias: {}, clientes: {} }

/** Liga/desliga em forma de chave (mais fácil de tocar no celular que uma caixinha) */
function Chave({ ligada, onChange, rotulo, desabilitada }: { ligada: boolean; onChange: (v: boolean) => void; rotulo: string; desabilitada?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo}
      disabled={desabilitada}
      onClick={() => onChange(!ligada)}
      className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50', ligada ? 'bg-marca' : 'bg-tinta/20')}
    >
      <span className={cn('absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all', ligada ? 'left-[1.375rem]' : 'left-0.5')} />
    </button>
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
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <BookOpenText className="h-4 w-4 text-texto-secundario" /> Manual do atendente
        </CardTitle>
        <p className="text-sm text-texto-secundario">
          Orientações para o Assistente GrafyGo atender como você atenderia (ex.: “sempre oferecer a criação de arte”, “perguntar se é frente e verso”). Viram sugestões; preço e desconto
          ficam só nas regras acima.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {consulta.isPending ? (
          <Skeleton className="h-28 w-full" />
        ) : podeEditar ? (
          <>
            <Textarea
              rows={6}
              value={texto}
              maxLength={4000}
              onChange={(e) => setTexto(e.target.value)}
              aria-label="Manual do atendente"
              placeholder={'Ex.:\n- Sempre oferecer a criação de arte quando o cliente não tiver o arquivo.\n- Banner acima de 3 m: lembrar do reforço e dos ilhoses.'}
            />
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs text-texto-secundario">{texto.length.toLocaleString('pt-BR')} / 4.000 · telefone, documento e e-mail não vão para o Assistente</span>
              <Button
                size="sm"
                disabled={!alterado || salvar.isPending}
                onClick={() =>
                  salvar.mutate(texto, {
                    onSuccess: () => toast.success('Manual do atendente salvo.'),
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar manual
              </Button>
            </div>
          </>
        ) : consulta.data?.manualAtendente ? (
          <p className="whitespace-pre-line text-sm">{consulta.data.manualAtendente}</p>
        ) : (
          <p className="text-sm text-texto-secundario">Nenhuma orientação escrita ainda.</p>
        )}
      </CardContent>
    </Card>
  )
}

/**
 * Configurações → Regras comerciais: o dono ensina o sistema como ensinaria um estagiário. Lista com liga/desliga e
 * ordem, modelos prontos, editor "Quando… → Faça…", simulador e o manual do atendente. Quem só vende vê "o que vale
 * hoje" (as ligadas) e pode simular.
 */
export function RegrasComerciaisPage() {
  const podeEditar = usePermission('configuracoes', 'editar')
  const consulta = useQuery({ queryKey: CHAVE, queryFn: regrasApi.listar })
  const [editando, setEditando] = useState<RascunhoRegra | null>(null)
  const [excluindo, setExcluindo] = useState<RegraComercialLista | null>(null)
  const ativar = useMutacao(['regras-comerciais', 'orcamentos'], ({ id, ativa }: { id: string; ativa: boolean }) => regrasApi.ativar(id, ativa))
  const ordenar = useMutacao(['regras-comerciais', 'orcamentos'], (ids: string[]) => regrasApi.ordenar(ids))
  const remover = useMutacao(['regras-comerciais', 'orcamentos'], (id: string) => regrasApi.remover(id))

  const nomes = consulta.data?.nomes ?? VAZIO
  const todas = consulta.data?.regras ?? []
  const visiveis = podeEditar ? todas : todas.filter((r) => r.ativa)

  function mover(i: number, d: -1 | 1) {
    const ids = todas.map((r) => r.id)
    const j = i + d
    if (j < 0 || j >= ids.length) return
    ;[ids[i], ids[j]] = [ids[j]!, ids[i]!]
    ordenar.mutate(ids, { onError: (e) => toast.error(e.message) })
  }

  function usarModelo(p: PresetRegra) {
    setEditando(rascunhoDaRegra(regraComercialSchema.parse(regraDoPreset(p)), nomes))
  }

  return (
    <>
      <PageHeader
        titulo="Regras comerciais"
        subtitulo={
          podeEditar
            ? 'Ensine o sistema uma vez: ele aplica sozinho em todo orçamento — no balcão, montado pelo Assistente e, no futuro, pelo WhatsApp. O que sair das regras vai para uma pessoa.'
            : 'O que vale hoje nos orçamentos. O sistema aplica sozinho; você vê cada regra no orçamento.'
        }
        acoes={
          podeEditar ? (
            <Button onClick={() => setEditando(rascunhoNovo())}>
              <Plus /> Nova regra
            </Button>
          ) : undefined
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_26rem]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Scale className="h-4 w-4 text-texto-secundario" /> {podeEditar ? 'Suas regras' : 'O que vale hoje'}
              </CardTitle>
              {podeEditar && todas.length > 1 && <p className="text-sm text-texto-secundario">Valem de cima para baixo. Use as setas para mudar a ordem.</p>}
            </CardHeader>
            <CardContent>
              {consulta.isPending ? (
                <div className="space-y-3">
                  <Skeleton className="h-16 w-full" />
                  <Skeleton className="h-16 w-full" />
                </div>
              ) : consulta.isError ? (
                <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
              ) : visiveis.length === 0 ? (
                <EmptyState
                  icone={Scale}
                  titulo={podeEditar ? 'Nenhuma regra ainda' : 'Nenhuma regra ligada'}
                  descricao={podeEditar ? 'Comece por um modelo pronto aqui embaixo ou crie a sua.' : 'Os orçamentos seguem os preços do cadastro.'}
                />
              ) : (
                <ol className="divide-y divide-border">
                  {visiveis.map((r, i) => (
                    <li key={r.id} className={cn('flex items-start gap-3 py-3', !r.ativa && 'opacity-60')}>
                      {podeEditar ? (
                        <Chave
                          ligada={r.ativa}
                          rotulo={r.ativa ? `Desligar ${r.nome}` : `Ligar ${r.nome}`}
                          desabilitada={ativar.isPending}
                          onChange={(ativa) => ativar.mutate({ id: r.id, ativa }, { onSuccess: () => toast.success(ativa ? 'Regra ligada.' : 'Regra desligada.'), onError: (e) => toast.error(e.message) })}
                        />
                      ) : (
                        <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-grafite text-xs font-semibold text-white">{i + 1}</span>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-tinta">{r.nome}</p>
                        <p className="text-sm text-texto-secundario [overflow-wrap:anywhere]">{r.descricao}</p>
                      </div>
                      {podeEditar && (
                        <div className="flex shrink-0 flex-wrap justify-end">
                          <AcaoIcone icone={ArrowUp} rotulo="Subir (vale antes)" onClick={() => mover(i, -1)} />
                          <AcaoIcone icone={ArrowDown} rotulo="Descer (vale depois)" onClick={() => mover(i, 1)} />
                          <AcaoIcone icone={Pencil} rotulo="Editar regra" onClick={() => setEditando(rascunhoDaRegra(r, nomes))} />
                          <AcaoIcone icone={Trash2} rotulo="Excluir regra" perigo onClick={() => setExcluindo(r)} />
                        </div>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>

          {podeEditar && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-texto-secundario" /> Modelos prontos
                </CardTitle>
                <p className="text-sm text-texto-secundario">Um clique abre a regra preenchida; você confere os números e salva.</p>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-2">
                {PRESETS_REGRA.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => usarModelo(p)}
                    className="rounded-xl border border-border p-3 text-left transition-colors hover:border-marca hover:bg-marca-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="block font-medium text-tinta">{PRESETS_REGRA_INFO[p].titulo}</span>
                    <span className="mt-0.5 block text-sm text-texto-secundario">{PRESETS_REGRA_INFO[p].descricao}</span>
                  </button>
                ))}
              </CardContent>
            </Card>
          )}

          <ManualAtendente podeEditar={podeEditar} />
        </div>

        <div className="min-w-0 xl:sticky xl:top-24 xl:self-start">
          <SimuladorRegras />
        </div>
      </div>

      {editando && <RegraDialog key={editando.id ?? 'nova'} inicial={editando} nomes={nomes} onFechar={() => setEditando(null)} />}
      <ConfirmDialog
        aberto={Boolean(excluindo)}
        onAbertoChange={(v) => !v && setExcluindo(null)}
        titulo="Excluir regra"
        descricao={
          <>
            Excluir “{excluindo?.nome}”? Os orçamentos já salvos guardam o que ela fez; ela só deixa de valer nos próximos. Para pausar, desligue em vez de excluir.
          </>
        }
        textoConfirmar="Excluir"
        perigoso
        onConfirmar={async () => {
          await remover.mutateAsync(excluindo!.id)
          toast.success('Regra excluída.')
        }}
      />
    </>
  )
}
