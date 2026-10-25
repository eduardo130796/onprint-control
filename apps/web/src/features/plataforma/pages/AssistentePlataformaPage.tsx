import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, FlaskConical, KeyRound, Loader2, Plus, Save, Sparkles, Trash2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import {
  INTENCAO_RESPOSTA_IA_ROTULOS,
  MODELO_PADRAO_IA,
  PROVEDORES_IA,
  PROVEDORES_IA_DISPONIVEIS,
  PROVEDOR_IA_ROTULOS,
  RECURSO_IA_ROTULOS,
  assistenteConfigSchema,
  formatarDataHora,
  formatarMoeda,
  type AssistenteCentral,
  type ProvedorIA,
  type RecursoIA,
  type TesteAssistente,
} from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Interruptor } from '@/features/vitrine/components/Interruptor'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { CabecalhoPlataforma, Secao } from '../components/Secao'

/** Número digitado com vírgula ou ponto; vazio = null */
const lerNumero = (v: string): number | null => (v.trim() === '' ? null : Number(v.replace(/\s/g, '').replace(',', '.')))
const mostrarNumero = (v: number | null) => (v === null ? '' : String(v).replace('.', ','))
const usd = (v: number) => `US$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: v < 1 ? 4 : 2 })}`
const inteiro = (v: number) => v.toLocaleString('pt-BR')
/** Custos de centavos de dólar: "< R$ 0,01" em vez de R$ 0,00 */
const reais = (v: number) => (v > 0 && v < 0.01 ? '< R$ 0,01' : formatarMoeda(v))

interface FormAssistente {
  ativo: boolean
  provedor: ProvedorIA
  modelo: string
  chave: string
  limiteChamadasMes: string
  limiteUsdMes: string
  precos: { modelo: string; entrada: string; saida: string }[]
  cotacaoDolar: string
}

const paraForm = (c: AssistenteCentral): FormAssistente => ({
  ativo: c.ativo,
  provedor: c.provedor,
  modelo: c.modelo,
  chave: '',
  limiteChamadasMes: mostrarNumero(c.limiteChamadasMes),
  limiteUsdMes: mostrarNumero(c.limiteUsdMes),
  precos: c.precos.map((p) => ({ modelo: p.modelo, entrada: mostrarNumero(p.entrada), saida: mostrarNumero(p.saida) })),
  cotacaoDolar: mostrarNumero(c.cotacaoDolar),
})

/** Situação da chave: nunca mostra a chave, só a origem e os 4 últimos caracteres */
function SituacaoChave({ c }: { c: AssistenteCentral }) {
  if (c.chave.ilegivel) {
    return (
      <p className="flex items-start gap-2 rounded-xl bg-coral/10 p-2.5 text-sm text-coral-escuro">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> A chave guardada não abre mais (o segredo do servidor mudou). Cole a chave de novo.
      </p>
    )
  }
  if (!c.chave.origem) return <p className="text-sm text-texto-secundario">Nenhuma chave configurada.</p>
  return (
    <p className="flex flex-wrap items-center gap-2 text-sm text-tinta">
      <KeyRound className="h-4 w-4 text-marca-escuro" aria-hidden="true" />
      <span>
        Configurada <span className="font-mono">••••{c.chave.final}</span>
      </span>
      <span className="rounded-full bg-fundo px-2 py-0.5 text-xs text-texto-secundario ring-1 ring-border">{c.chave.origem === 'banco' ? 'cadastrada aqui, cifrada' : 'ANTHROPIC_API_KEY do servidor'}</span>
    </p>
  )
}

function FormularioAssistente({ config }: { config: AssistenteCentral }) {
  const queryClient = useQueryClient()
  const [v, setV] = useState<FormAssistente>(() => paraForm(config))
  const [removerChave, setRemoverChave] = useState(false)
  const [teste, setTeste] = useState<TesteAssistente | null>(null)
  const campo = <K extends keyof FormAssistente>(k: K, valor: FormAssistente[K]) => setV((x) => ({ ...x, [k]: valor }))
  const provedores = PROVEDORES_IA.filter((p) => p !== 'simulado' || config.simuladoDisponivel)

  const dados = () => ({
    ativo: v.ativo,
    provedor: v.provedor,
    modelo: v.modelo,
    chave: v.chave.trim() || undefined,
    removerChave: removerChave || undefined,
    limiteChamadasMes: lerNumero(v.limiteChamadasMes),
    limiteUsdMes: lerNumero(v.limiteUsdMes),
    precos: v.precos.filter((p) => p.modelo.trim()).map((p) => ({ modelo: p.modelo.trim(), entrada: lerNumero(p.entrada) ?? 0, saida: lerNumero(p.saida) ?? 0 })),
    cotacaoDolar: lerNumero(v.cotacaoDolar) ?? 0,
  })

  const salvar = useMutation({
    mutationFn: plataformaApi.salvarAssistente,
    onSuccess: (c) => {
      queryClient.setQueryData(['plataforma', 'assistente'], c)
      setV(paraForm(c))
      setRemoverChave(false)
      toast.success(c.ativo && !c.pronto ? 'Salvo, mas o Assistente ainda não está pronto (falta a chave?).' : 'Assistente GrafyGo salvo.')
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const testar = useMutation({
    mutationFn: plataformaApi.testarAssistente,
    onSuccess: (r) => {
      setTeste(r)
      void queryClient.invalidateQueries({ queryKey: ['plataforma', 'assistente', 'uso'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })

  function enviar(e: React.FormEvent) {
    e.preventDefault()
    const r = assistenteConfigSchema.safeParse(dados())
    if (!r.success) return toast.error(r.error.issues[0]?.message ?? 'Confira os campos.')
    salvar.mutate(r.data)
  }

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Secao titulo="Configuração" subtitulo="Vale para todas as gráficas. Cada gráfica ainda pode desligar na tela WhatsApp." icone={Sparkles} className="lg:col-span-2">
        <form onSubmit={enviar} className="space-y-6">
          <div className="flex items-start gap-3 rounded-2xl bg-fundo p-4">
            <Interruptor rotulo="Assistente ligado para as gráficas" marcado={v.ativo} onMudar={(x) => campo('ativo', x)} className="mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-tinta">Assistente ligado para as gráficas</p>
              <p className="text-xs text-texto-secundario">Desligado, nada vai para a IA: as respostas fora do padrão só avisam o vendedor, como antes.</p>
            </div>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-tinta">Provedor</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {provedores.map((p) => {
                const disponivel = PROVEDORES_IA_DISPONIVEIS.includes(p)
                return (
                  <label
                    key={p}
                    className={cn(
                      'flex cursor-pointer items-center justify-between gap-2 rounded-xl p-3 text-sm ring-1 transition-colors',
                      v.provedor === p ? 'bg-marca-suave font-semibold text-marca-escuro ring-marca' : 'ring-border hover:bg-fundo',
                      !disponivel && 'cursor-not-allowed opacity-60 hover:bg-transparent',
                    )}
                  >
                    <span className="flex items-center gap-2">
                      <input type="radio" name="provedor" value={p} checked={v.provedor === p} disabled={!disponivel} onChange={() => campo('provedor', p)} className="accent-marca" />
                      {PROVEDOR_IA_ROTULOS[p]}
                    </span>
                    {!disponivel && <span className="rounded-full bg-fundo px-2 py-0.5 text-xs font-medium text-texto-secundario ring-1 ring-border">em breve</span>}
                  </label>
                )
              })}
            </div>
          </fieldset>

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoFormulario id="as-modelo" rotulo="Modelo" dica={`Padrão: ${MODELO_PADRAO_IA} (rápido e barato para entender respostas curtas).`}>
              <Input id="as-modelo" value={v.modelo} onChange={(e) => campo('modelo', e.target.value)} disabled={v.provedor === 'simulado'} spellCheck={false} />
            </CampoFormulario>
            <CampoFormulario id="as-cotacao" rotulo="Dólar (R$) para o painel de uso">
              <Input id="as-cotacao" inputMode="decimal" value={v.cotacaoDolar} onChange={(e) => campo('cotacaoDolar', e.target.value)} />
            </CampoFormulario>
          </div>

          {v.provedor !== 'simulado' && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-tinta">Chave da API</p>
              {removerChave ? <p className="text-sm text-coral-escuro">A chave será removida ao salvar.</p> : <SituacaoChave c={config} />}
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="as-chave"
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  aria-label="Nova chave da API"
                  placeholder={config.chave.origem ? 'Colar uma chave nova para trocar' : 'Colar a chave (sk-ant-…)'}
                  value={v.chave}
                  onChange={(e) => campo('chave', e.target.value)}
                />
                {config.chave.origem === 'banco' && !removerChave && (
                  <Button type="button" variant="outline" onClick={() => setRemoverChave(true)}>
                    <Trash2 /> Remover
                  </Button>
                )}
              </div>
              <p className="text-xs text-texto-secundario">Fica cifrada no banco e nunca volta para o navegador. Crie a chave no Console da Anthropic (API Keys).</p>
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <CampoFormulario id="as-limite" rotulo="Limite por gráfica: chamadas no mês" dica="Vazio = sem limite. Passou do limite, a gráfica volta ao comportamento sem IA até o mês virar.">
              <Input id="as-limite" inputMode="numeric" value={v.limiteChamadasMes} onChange={(e) => campo('limiteChamadasMes', e.target.value)} />
            </CampoFormulario>
            <CampoFormulario id="as-limite-usd" rotulo="Limite por gráfica: custo no mês (US$)" dica="Custo estimado pela tabela de preços abaixo. Vazio = sem limite.">
              <Input id="as-limite-usd" inputMode="decimal" value={v.limiteUsdMes} onChange={(e) => campo('limiteUsdMes', e.target.value)} />
            </CampoFormulario>
          </div>

          <fieldset>
            <legend className="mb-2 text-sm font-medium text-tinta">Preços (US$ por milhão de tokens)</legend>
            <div className="space-y-2">
              {v.precos.map((p, i) => (
                <div key={i} className="grid grid-cols-[1fr_5.5rem_5.5rem_auto] items-center gap-2">
                  <Input aria-label="Modelo" value={p.modelo} spellCheck={false} onChange={(e) => campo('precos', v.precos.map((x, j) => (j === i ? { ...x, modelo: e.target.value } : x)))} />
                  <Input aria-label="Entrada" title="Entrada" inputMode="decimal" value={p.entrada} onChange={(e) => campo('precos', v.precos.map((x, j) => (j === i ? { ...x, entrada: e.target.value } : x)))} />
                  <Input aria-label="Saída" title="Saída" inputMode="decimal" value={p.saida} onChange={(e) => campo('precos', v.precos.map((x, j) => (j === i ? { ...x, saida: e.target.value } : x)))} />
                  <Button type="button" size="icon" variant="ghost" aria-label={`Tirar ${p.modelo || 'linha'}`} onClick={() => campo('precos', v.precos.filter((_, j) => j !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <p className="text-xs text-texto-secundario">Colunas: modelo · entrada · saída. Modelo fora da tabela conta custo zero.</p>
              <Button type="button" variant="outline" size="sm" onClick={() => campo('precos', [...v.precos, { modelo: v.modelo, entrada: '', saida: '' }])}>
                <Plus /> Adicionar modelo
              </Button>
            </div>
          </fieldset>

          <div className="flex justify-end">
            <Button type="submit" disabled={salvar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        </form>
      </Secao>

      <Secao titulo="Testar" subtitulo="Uma classificação pequena com o que está no formulário (salvo ou não)." icone={FlaskConical} className="h-fit">
        <div className="space-y-4">
          <Button className="w-full" disabled={testar.isPending} onClick={() => testar.mutate({ provedor: v.provedor, modelo: v.modelo, chave: v.chave.trim() || undefined })}>
            {testar.isPending ? <Loader2 className="animate-spin" /> : <FlaskConical />} Testar agora
          </Button>
          {teste && (
            <div role="status" className={cn('space-y-2 rounded-2xl p-4 text-sm', teste.ok ? 'bg-marca-suave text-marca-escuro' : 'bg-coral/10 text-coral-escuro')}>
              <p className="flex items-center gap-2 font-semibold">
                {teste.ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
                {teste.ok ? 'Funcionando' : 'Não funcionou'}
              </p>
              {teste.erro && <p>{teste.erro}</p>}
              <dl className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-tinta">
                <dt className="text-texto-secundario">Modelo</dt>
                <dd className="font-mono [overflow-wrap:anywhere]">{teste.modelo}</dd>
                <dt className="text-texto-secundario">Tokens</dt>
                <dd>
                  {inteiro(teste.tokens.entrada)} entrada · {inteiro(teste.tokens.saida)} saída
                </dd>
                <dt className="text-texto-secundario">Tempo</dt>
                <dd>{(teste.latenciaMs / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} s</dd>
                <dt className="text-texto-secundario">Custo</dt>
                <dd>{usd(teste.custoUsd)}</dd>
              </dl>
              {teste.resultado && (
                <p className="text-xs text-tinta">
                  Entendeu “Ficou ótimo, pode mandar fazer!” como <strong>{INTENCAO_RESPOSTA_IA_ROTULOS[teste.resultado.intencao]}</strong> ({Math.round(teste.resultado.confianca * 100)}%): {teste.resultado.resumo}
                </p>
              )}
            </div>
          )}
        </div>
      </Secao>
    </div>
  )
}

/** Uso do mês por gráfica: chamadas, tokens, custo estimado e os últimos erros */
function UsoDoMes() {
  const [mes, setMes] = useState('')
  const consulta = useQuery({ queryKey: ['plataforma', 'assistente', 'uso', mes], queryFn: () => plataformaApi.usoAssistente(mes || undefined) })
  const u = consulta.data

  return (
    <Secao
      titulo="Uso no mês"
      subtitulo="Custo estimado pela tabela de preços (o valor exato está na fatura do provedor)."
      acoes={<Input type="month" aria-label="Mês" value={mes || u?.mes || ''} onChange={(e) => setMes(e.target.value)} className="w-40" />}
    >
      {consulta.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : consulta.isError ? (
        <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
      ) : (
        <div className="space-y-6">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Chamadas', inteiro(u!.totais.chamadas), u!.totais.erros ? `${u!.totais.erros} com erro` : null],
              ['Tokens', inteiro(u!.totais.tokensEntrada + u!.totais.tokensSaida), `${inteiro(u!.totais.tokensEntrada)} entrada · ${inteiro(u!.totais.tokensSaida)} saída`],
              ['Custo (US$)', usd(u!.totais.custoUsd), u!.totais.bloqueadas ? `${u!.totais.bloqueadas} evitada(s) pelo limite` : null],
              ['Custo (R$)', reais(u!.totais.custoBrl), `dólar a ${formatarMoeda(u!.cotacaoDolar)}`],
            ].map(([rotulo, valor, detalhe]) => (
              <div key={rotulo} className="min-w-0 rounded-2xl bg-fundo p-3">
                <dt className="text-xs text-texto-secundario">{rotulo}</dt>
                <dd className="font-titulo text-xl font-extrabold tabular-nums text-tinta [overflow-wrap:anywhere]">{valor}</dd>
                {detalhe && <dd className="text-[0.6875rem] text-texto-secundario">{detalhe}</dd>}
              </div>
            ))}
          </dl>

          {u!.empresas.length === 0 ? (
            <p className="text-sm text-texto-secundario">Nenhum uso neste mês.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="text-left text-xs text-texto-secundario">
                    <th className="py-2 pr-3 font-medium">Gráfica</th>
                    <th className="py-2 pr-3 text-right font-medium">Chamadas</th>
                    <th className="py-2 pr-3 text-right font-medium">Tokens</th>
                    <th className="py-2 pr-3 text-right font-medium">US$</th>
                    <th className="py-2 text-right font-medium">R$</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {u!.empresas.map((e) => (
                    <tr key={e.empresa?.id ?? 'central'}>
                      <td className="py-2 pr-3 font-medium text-tinta">{e.empresa?.nome ?? 'Testes da central'}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">
                        {inteiro(e.chamadas)}
                        {e.erros > 0 && <span className="block text-xs text-coral-escuro">{e.erros} erro(s)</span>}
                        {e.bloqueadas > 0 && <span className="block text-xs text-amber-800">{e.bloqueadas} no limite</span>}
                      </td>
                      <td className="py-2 pr-3 text-right tabular-nums">{inteiro(e.tokensEntrada + e.tokensSaida)}</td>
                      <td className="py-2 pr-3 text-right tabular-nums">{usd(e.custoUsd)}</td>
                      <td className="py-2 text-right tabular-nums">{reais(e.custoBrl)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {u!.ultimosErros.length > 0 && (
            <div>
              <h3 className="mb-2 text-sm font-semibold text-tinta">Últimos erros e limites</h3>
              <ul className="space-y-1.5">
                {u!.ultimosErros.map((e) => (
                  <li key={e.id} className="flex flex-wrap items-baseline gap-x-2 rounded-xl p-2 text-xs ring-1 ring-border">
                    <span className={cn('rounded-full px-2 py-0.5 font-semibold', e.situacao === 'limite' ? 'bg-ambar/10 text-amber-800' : 'bg-coral/10 text-coral-escuro')}>{e.situacao === 'limite' ? 'Limite' : 'Erro'}</span>
                    <span className="font-medium text-tinta">{e.empresa ?? 'Central'}</span>
                    <span className="text-texto-secundario">{RECURSO_IA_ROTULOS[e.recurso as RecursoIA] ?? e.recurso}</span>
                    <span className="min-w-0 flex-1 text-texto-secundario [overflow-wrap:anywhere]">{e.erro}</span>
                    <span className="text-texto-secundario">{formatarDataHora(e.em)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Secao>
  )
}

/** Central do Assistente GrafyGo (IA): provedor, modelo, chave, limites por gráfica, teste e uso do mês. */
export function AssistentePlataformaPage() {
  const consulta = useQuery({ queryKey: ['plataforma', 'assistente'], queryFn: plataformaApi.assistente })
  const c = consulta.data

  return (
    <>
      <CabecalhoPlataforma
        sobretitulo="Inteligência artificial"
        titulo="Assistente GrafyGo"
        subtitulo="Entende as respostas dos clientes no WhatsApp que as regras não entendem. Só age sozinho no claro; no resto, avisa o vendedor com um resumo."
        acoes={
          c && (
            <span className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1', c.pronto ? 'bg-marca-suave text-marca-escuro ring-marca/30' : 'bg-card text-texto-secundario ring-border')}>
              {c.pronto ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <XCircle className="h-4 w-4" aria-hidden="true" />}
              {c.pronto ? `Ligado · ${PROVEDOR_IA_ROTULOS[c.provedor]}` : c.ativo ? 'Ligado, falta configurar' : 'Desligado'}
            </span>
          )
        }
      />
      {consulta.isPending ? (
        <div className="grid gap-5 lg:grid-cols-3">
          <Skeleton className="h-[36rem] rounded-3xl lg:col-span-2" />
          <Skeleton className="h-60 rounded-3xl" />
        </div>
      ) : consulta.isError ? (
        <Secao>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Secao>
      ) : (
        <div className="space-y-5">
          <FormularioAssistente config={c!} />
          <UsoDoMes />
        </div>
      )}
    </>
  )
}
