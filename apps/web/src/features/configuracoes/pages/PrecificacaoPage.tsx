import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { Ban, Clock, Loader2, Percent, PiggyBank, Receipt, Save, Sparkles, Target } from 'lucide-react'
import { toast } from 'sonner'
import { formatarMoeda, parametrosDaEmpresa, precoSugerido, precificacaoSchema, type ModoRateio, type Precificacao, type PrecificacaoInput } from '@onprint/shared'
import { precificacaoApi } from '@/api/custos'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { CartaoOpcao, Dica, Secao } from '@/features/produtos/components/custo/Secao'
import { formatarPercentual, numero, paraApi, paraCampo } from '@/features/produtos/custos'
import { usePrecificacao } from '@/features/produtos/hooks'
import { usePermission } from '@/hooks/usePermission'
import { decimalParaInput } from '@/lib/mascaras'

const RATEIOS: { modo: ModoRateio; icone: typeof Ban; titulo: string; descricao: string }[] = [
  { modo: 'nenhum', icone: Ban, titulo: 'Não ratear', descricao: 'O lucro desejado já cobre aluguel, salários fixos, contas.' },
  { modo: 'percentual', icone: Percent, titulo: '% sobre o preço', descricao: 'Uma parte de cada venda paga os custos fixos.' },
  { modo: 'por_hora', icone: Clock, titulo: 'Por hora de produção', descricao: 'Quem usa mais tempo de máquina paga mais. Mais preciso.' },
]

const pct = (v: string) => paraCampo(v, 2)

function valores(p: Precificacao): PrecificacaoInput {
  return {
    impostosPercentual: pct(p.impostosPercentual),
    comissaoPercentual: pct(p.comissaoPercentual),
    rateioModo: p.rateioModo,
    custoFixoPercentual: pct(p.custoFixoPercentual),
    custoFixoMensal: decimalParaInput(p.custoFixoMensal),
    horasProdutivasMes: String(p.horasProdutivasMes ?? 0),
    lucroDesejadoPadrao: pct(p.lucroDesejadoPadrao),
    lucroMinimoPadrao: pct(p.lucroMinimoPadrao),
  }
}

const texto = (v: unknown) => (v === null || v === undefined ? '' : String(v))

function Formulario({ config }: { config: Precificacao }) {
  const queryClient = useQueryClient()
  const podeEditar = usePermission('configuracoes', 'editar')
  const form = useForm<PrecificacaoInput>({ resolver: zodResolver(precificacaoSchema), defaultValues: valores(config) })
  const { errors, isDirty, isSubmitting } = form.formState
  const r = form.register
  const w = form.watch()
  const rateio = (w.rateioModo ?? 'nenhum') as ModoRateio

  // Exemplo ao vivo: produto de R$ 100 de custo direto
  const params = parametrosDaEmpresa({
    impostosPercentual: paraApi(texto(w.impostosPercentual)),
    comissaoPercentual: paraApi(texto(w.comissaoPercentual)),
    rateioModo: rateio,
    custoFixoPercentual: paraApi(texto(w.custoFixoPercentual)),
    custoFixoMensal: paraApi(texto(w.custoFixoMensal)),
    horasProdutivasMes: paraApi(texto(w.horasProdutivasMes)),
    lucroDesejadoPadrao: paraApi(texto(w.lucroDesejadoPadrao)),
    lucroMinimoPadrao: paraApi(texto(w.lucroMinimoPadrao)),
  })
  const lucro = numero(texto(w.lucroDesejadoPadrao))
  const sugerido = precoSugerido(100, params.percentuais, lucro)
  const porHora = Number(params.custoFixoHora)
  const preco = Number(sugerido ?? 0)
  const fatias = [
    { rotulo: 'Custo do produto', valor: 100, cor: 'bg-slate-400' },
    { rotulo: 'Impostos', valor: (preco * numero(texto(w.impostosPercentual))) / 100, cor: 'bg-red-400' },
    { rotulo: 'Comissão', valor: (preco * numero(texto(w.comissaoPercentual))) / 100, cor: 'bg-sky-500' },
    { rotulo: 'Custos fixos', valor: (preco * Number(params.percentuais.custoFixo || 0)) / 100, cor: 'bg-amber-500' },
    { rotulo: 'Lucro', valor: (preco * lucro) / 100, cor: 'bg-marca' },
  ].filter((f) => f.valor > 0)

  const onSubmit = form.handleSubmit(
    async (dados) => {
      try {
        const salvo = await precificacaoApi.salvar(dados)
        queryClient.setQueryData(['precificacao'], salvo)
        await Promise.all(['produtos', 'insumos'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
        form.reset(valores(salvo))
        toast.success('Precificação salva. O custo dos produtos com composição foi recalculado.')
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
    () => toast.error('Verifique os campos destacados.'),
  )

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!podeEditar || isSubmitting} className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_21.25rem] lg:items-start">
        <div className="min-w-0 space-y-6">
          <Secao icone={Receipt} titulo="O que sai de cada venda" descricao="Percentuais descontados do preço de venda.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <CampoFormulario id="pc-impostos" rotulo="Impostos" erro={errors.impostosPercentual?.message}>
                  <NumberInput id="pc-impostos" sufixo="%" placeholder="0" {...r('impostosPercentual')} />
                </CampoFormulario>
                <Dica>Simples Nacional, ISS, ICMS… o total que você paga sobre o faturamento.</Dica>
              </div>
              <div>
                <CampoFormulario id="pc-comissao" rotulo="Comissão padrão" erro={errors.comissaoPercentual?.message}>
                  <NumberInput id="pc-comissao" sufixo="%" placeholder="0" {...r('comissaoPercentual')} />
                </CampoFormulario>
                <Dica>Usada no preço sugerido. A comissão de cada vendedor continua valendo nos pedidos.</Dica>
              </div>
            </div>
          </Secao>

          <Secao icone={PiggyBank} titulo="Custos fixos" descricao="Aluguel, salários, energia, internet… Como eles entram no preço?">
            <div role="radiogroup" aria-label="Rateio dos custos fixos" className="grid gap-2 sm:grid-cols-3">
              {RATEIOS.map((o) => (
                <CartaoOpcao key={o.modo} marcado={rateio === o.modo} onClick={() => form.setValue('rateioModo', o.modo, { shouldDirty: true })} icone={o.icone} titulo={o.titulo} descricao={o.descricao} desabilitado={!podeEditar} />
              ))}
            </div>
            {rateio === 'percentual' && (
              <div className="mt-4 max-w-xs">
                <CampoFormulario id="pc-fixo" rotulo="Quanto do preço vai para os custos fixos" erro={errors.custoFixoPercentual?.message}>
                  <NumberInput id="pc-fixo" sufixo="%" placeholder="0" {...r('custoFixoPercentual')} />
                </CampoFormulario>
                <Dica>Dica: custos fixos do mês ÷ faturamento do mês × 100.</Dica>
              </div>
            )}
            {rateio === 'por_hora' && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <CampoFormulario id="pc-mensal" rotulo="Custos fixos por mês" erro={errors.custoFixoMensal?.message}>
                  <MoneyInput id="pc-mensal" {...r('custoFixoMensal')} />
                </CampoFormulario>
                <div>
                  <CampoFormulario id="pc-horas" rotulo="Horas produtivas por mês" erro={errors.horasProdutivasMes?.message}>
                    <NumberInput id="pc-horas" casas={0} sufixo="h" placeholder="0" {...r('horasProdutivasMes')} />
                  </CampoFormulario>
                  <Dica>Horas em que as máquinas e a equipe estão produzindo (ex.: 22 dias × 8 h = 176 h).</Dica>
                </div>
                <p className="flex items-center gap-2 rounded-2xl bg-marca-suave p-3 text-sm font-semibold text-tinta sm:col-span-2" aria-live="polite">
                  <Clock className="h-4 w-4 text-marca-escuro" aria-hidden="true" />
                  {porHora > 0 ? `${formatarMoeda(porHora)} por hora de produção` : 'Informe o custo mensal e as horas para ver o custo por hora.'}
                </p>
              </div>
            )}
          </Secao>

          <Secao icone={Target} titulo="Lucro" descricao="Em % do preço, depois de pagar custos, impostos e comissão. Cada produto pode ter o seu.">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <CampoFormulario id="pc-lucro" rotulo="Lucro desejado (padrão)" erro={errors.lucroDesejadoPadrao?.message}>
                  <NumberInput id="pc-lucro" sufixo="%" {...r('lucroDesejadoPadrao')} />
                </CampoFormulario>
                <Dica>Usado para calcular o preço sugerido.</Dica>
              </div>
              <div>
                <CampoFormulario id="pc-lucromin" rotulo="Lucro mínimo (padrão)" erro={errors.lucroMinimoPadrao?.message}>
                  <NumberInput id="pc-lucromin" sufixo="%" {...r('lucroMinimoPadrao')} />
                </CampoFormulario>
                <Dica>Abaixo disso o produto fica amarelo e aparece em Reajuste de preços.</Dica>
              </div>
            </div>
          </Secao>
        </div>

        <aside className="space-y-4 lg:sticky lg:top-20" aria-label="Exemplo">
          <div className="rounded-3xl bg-grafite p-5 text-white shadow-suave">
            <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-white/70">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Exemplo
            </p>
            <p className="mt-2 text-sm text-white/80">Um produto que custa {formatarMoeda(100)}</p>
            <p className="font-titulo text-3xl font-extrabold">{sugerido ? formatarMoeda(sugerido) : '—'}</p>
            <p className="text-sm text-white/80">{sugerido ? `preço sugerido para ${formatarPercentual(lucro)} de lucro` : 'Os percentuais somam 95% ou mais: não há preço possível.'}</p>
            {sugerido && (
              <>
                <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label="Composição do preço">
                  {fatias.map((f) => (
                    <span key={f.rotulo} className={f.cor} style={{ width: `${(f.valor / preco) * 100}%` }} />
                  ))}
                </div>
                <ul className="mt-3 space-y-1.5 text-xs">
                  {fatias.map((f) => (
                    <li key={f.rotulo} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-white/80">
                        <span className={`h-2 w-2 rounded-full ${f.cor}`} aria-hidden="true" />
                        {f.rotulo}
                      </span>
                      <span className="font-semibold">{formatarMoeda(f.valor)}</span>
                    </li>
                  ))}
                </ul>
              </>
            )}
            {rateio === 'por_hora' && porHora > 0 && <p className="mt-3 text-xs text-white/70">Com o rateio por hora, cada 10 minutos de produção somam {formatarMoeda(porHora / 6)} ao custo do produto.</p>}
          </div>
          {podeEditar && (
            <Button type="submit" className="w-full" disabled={isSubmitting || !isDirty}>
              {isSubmitting ? <Loader2 className="animate-spin" /> : <Save />} Salvar precificação
            </Button>
          )}
          <p className="px-1 text-xs text-texto-secundario">Ao salvar, o custo de todos os produtos com composição é recalculado. Os preços não mudam sozinhos.</p>
        </aside>
      </fieldset>
    </form>
  )
}

/** Configurações → Precificação: impostos, comissão, custos fixos e lucro padrão, com exemplo ao vivo. */
export function PrecificacaoPage() {
  const consulta = usePrecificacao()
  return (
    <>
      <PageHeader titulo="Precificação" subtitulo="Os números da empresa que transformam custo em preço sugerido." />
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full rounded-3xl" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <Formulario key={consulta.dataUpdatedAt} config={consulta.data} />
      )}
    </>
  )
}
