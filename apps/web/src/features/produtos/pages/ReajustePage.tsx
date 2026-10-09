import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Loader2, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'
import { MODO_CALCULO_SUFIXO, analisarPreco, formatarMoeda, parametrosDaEmpresa, type Precificacao, type ProdutoReajuste } from '@onprint/shared'
import { reajusteApi } from '@/api/custos'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { MoneyInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { SemaforoLucro } from '../components/custo/SemaforoLucro'
import { formatarCusto, paraApi } from '../custos'
import { usePrecificacao, useReajuste } from '../hooks'

type Situacao = 'abaixo' | 'todos'

/** Preço sugerido válido (sem custo, a API devolve nulo ou zero) */
const sugeridoValido = (p: ProdutoReajuste) => (Number(p.precoSugerido ?? 0) > 0 ? (p.precoSugerido as string) : null)

function Lista({ itens, situacao, config }: { itens: ProdutoReajuste[]; situacao: Situacao; config?: Precificacao }) {
  const queryClient = useQueryClient()
  const [precos, setPrecos] = useState<Record<string, string>>(() => Object.fromEntries(itens.map((p) => [p.id, decimalParaInput(sugeridoValido(p) ?? p.precoVenda)])))
  // Abaixo do mínimo: já vem tudo marcado (o caso comum é aplicar os sugeridos)
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(situacao === 'abaixo' ? itens.filter((p) => sugeridoValido(p)).map((p) => p.id) : []))
  const [aplicando, setAplicando] = useState(false)
  const parametros = config ? parametrosDaEmpresa(config) : null

  const marcar = (id: string, sim: boolean) =>
    setMarcados((m) => {
      const novo = new Set(m)
      if (sim) novo.add(id)
      else novo.delete(id)
      return novo
    })
  const todos = itens.length > 0 && marcados.size === itens.length

  async function aplicar() {
    const escolhidos = itens.filter((p) => marcados.has(p.id)).map((p) => ({ id: p.id, precoVenda: paraApi(precos[p.id]) || '0' }))
    if (escolhidos.some((i) => !(Number(i.precoVenda) > 0))) return toast.error('Informe um preço maior que zero em todos os produtos marcados.')
    setAplicando(true)
    try {
      await reajusteApi.aplicar({ itens: escolhidos })
      toast.success(`${escolhidos.length} preço(s) atualizado(s).`)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['produtos'] }), queryClient.invalidateQueries({ queryKey: ['insumos'] })])
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAplicando(false)
    }
  }

  if (itens.length === 0) {
    return (
      <Card className="rounded-3xl">
        <EmptyState
          icone={CheckCircle2}
          titulo={situacao === 'abaixo' ? 'Todos os preços estão com o lucro em dia' : 'Nenhum produto com custo calculado'}
          descricao={situacao === 'abaixo' ? 'Quando o custo de um insumo subir e algum produto ficar abaixo do lucro mínimo, ele aparece aqui.' : 'Informe o custo dos produtos na aba “Custo e preço”.'}
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-3xl bg-card shadow-suave">
        <div className="hidden grid-cols-[32px_minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.3fr)_minmax(0,1fr)] items-center gap-3 border-b border-border bg-fundo/60 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-texto-secundario lg:grid">
          <Checkbox checked={todos} onChange={(e) => setMarcados(new Set(e.target.checked ? itens.map((p) => p.id) : []))} aria-label="Marcar todos" />
          <span>Produto</span>
          <span className="text-right">Custo</span>
          <span className="text-right">Preço atual</span>
          <span>Lucro atual</span>
          <span>Novo preço</span>
          <span>Novo lucro</span>
        </div>
        <ul className="divide-y divide-border">
          {itens.map((p) => {
            const sufixo = MODO_CALCULO_SUFIXO[p.modoCalculo] ?? p.unidade
            const novo = parametros ? analisarPreco(paraApi(precos[p.id]) || '0', p.custo, parametros.percentuais, config?.lucroMinimoPadrao ?? 0) : null
            const marcado = marcados.has(p.id)
            return (
              <li key={p.id} className={cn('grid grid-cols-[32px_minmax(0,1fr)] items-center gap-x-3 gap-y-2 px-4 py-3 lg:grid-cols-[32px_minmax(0,2fr)_repeat(3,minmax(0,1fr))_minmax(0,1.3fr)_minmax(0,1fr)]', marcado && 'bg-marca-suave/40')}>
                <Checkbox checked={marcado} onChange={(e) => marcar(p.id, e.target.checked)} aria-label={`Marcar ${p.nome}`} />
                <div className="min-w-0">
                  <Link to={`/produtos/${p.id}?aba=custo`} className="block truncate font-semibold text-tinta hover:underline">
                    {p.nome}
                  </Link>
                  <span className="font-mono text-xs text-texto-secundario">{p.codigo}</span>
                </div>
                <div className="col-start-2 flex justify-between text-sm lg:col-start-auto lg:block lg:text-right">
                  <span className="text-texto-secundario lg:hidden">Custo</span>
                  <span>
                    {formatarCusto(p.custo)} <span className="text-xs text-texto-secundario">/ {sufixo}</span>
                  </span>
                </div>
                <div className="col-start-2 flex justify-between text-sm lg:col-start-auto lg:block lg:text-right">
                  <span className="text-texto-secundario lg:hidden">Preço atual</span>
                  <span className="font-medium text-tinta">{formatarMoeda(p.precoVenda)}</span>
                </div>
                <div className="col-start-2 flex items-center justify-between lg:col-start-auto lg:block">
                  <span className="text-sm text-texto-secundario lg:hidden">Lucro atual</span>
                  <SemaforoLucro situacao={p.situacao} lucroPercentual={p.lucroPercentual} />
                </div>
                <div className="col-start-2 lg:col-start-auto">
                  <MoneyInput
                    value={precos[p.id] ?? ''}
                    aria-label={`Novo preço de ${p.nome}`}
                    onChange={(e) => {
                      setPrecos((v) => ({ ...v, [p.id]: e.target.value }))
                      marcar(p.id, true)
                    }}
                  />
                  {sugeridoValido(p) && <p className="mt-1 text-[11px] text-texto-secundario">Sugerido para {Number(p.lucroDesejado).toLocaleString('pt-BR')}% de lucro</p>}
                </div>
                <div className="col-start-2 flex items-center justify-between lg:col-start-auto lg:block">
                  <span className="text-sm text-texto-secundario lg:hidden">Novo lucro</span>
                  {novo ? <SemaforoLucro situacao={novo.situacao} lucroPercentual={novo.lucroPercentual} /> : '—'}
                </div>
              </li>
            )
          })}
        </ul>
      </div>
      <div className="sticky bottom-0 z-10 -mx-4 flex flex-wrap items-center justify-between gap-3 border-t border-border bg-fundo/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border-0 sm:bg-card sm:shadow-suave">
        <label className="flex items-center gap-2 text-sm text-tinta lg:hidden">
          <Checkbox checked={todos} onChange={(e) => setMarcados(new Set(e.target.checked ? itens.map((p) => p.id) : []))} /> Marcar todos
        </label>
        <p className="hidden text-sm text-texto-secundario lg:block">O preço só muda quando você aplicar. Orçamentos já feitos não mudam.</p>
        <Button type="button" disabled={marcados.size === 0 || aplicando} onClick={() => void aplicar()}>
          {aplicando ? <Loader2 className="animate-spin" /> : <TrendingUp />} Aplicar {marcados.size} preço{marcados.size === 1 ? '' : 's'}
        </Button>
      </div>
    </div>
  )
}

/** Produtos → Reajuste de preços: os que ficaram abaixo do lucro mínimo, com o preço sugerido editável. */
export function ReajustePage() {
  const [situacao, setSituacao] = useState<Situacao>('abaixo')
  const consulta = useReajuste(situacao)
  const config = usePrecificacao()

  return (
    <>
      <PageHeader
        titulo="Reajuste de preços"
        subtitulo="Quando o custo sobe, o preço não muda sozinho: confira aqui e aplique os preços sugeridos."
        acoes={
          <div role="radiogroup" aria-label="Mostrar" className="flex rounded-xl bg-card p-1 shadow-suave">
            {(
              [
                ['abaixo', 'Abaixo do mínimo'],
                ['todos', 'Todos'],
              ] as const
            ).map(([valor, rotulo]) => (
              <button
                key={valor}
                type="button"
                role="radio"
                aria-checked={situacao === valor}
                onClick={() => setSituacao(valor)}
                className={cn('rounded-lg px-3 py-1.5 text-sm font-semibold transition', situacao === valor ? 'bg-marca text-marca-contraste' : 'text-tinta hover:bg-fundo')}
              >
                {rotulo}
              </button>
            ))}
          </div>
        }
      />
      {consulta.isPending || consulta.isPlaceholderData ? (
        <Skeleton className="h-72 w-full rounded-3xl" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <Lista key={`${situacao}-${consulta.dataUpdatedAt}`} itens={consulta.data} situacao={situacao} config={config.data} />
      )}
    </>
  )
}
