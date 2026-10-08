import { useMemo, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Building2, Plus, Search, X } from 'lucide-react'
import { CATEGORIA_EMPRESA_ROTULOS, formatarData, formatarDataSimples, formatarMoeda, type CategoriaEmpresa, type EmpresaPlataformaResumo, type EmpresasPlataformaQuery } from '@onprint/shared'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { CATEGORIA_SINGULAR, PONTO_CATEGORIA } from '../components/cores'
import type { PedidoAcao } from '../components/acoes'
import { DialogoAcao } from '../components/DialogoAcao'
import { MenuAcoesEmpresa } from '../components/MenuAcoesEmpresa'
import { NovaEmpresaDialog } from '../components/NovaEmpresaDialog'
import { SeloCategoria } from '../components/SeloCategoria'
import { CabecalhoPlataforma } from '../components/Secao'
import { detalheSituacao } from '../components/regras'
import { ChipBeneficio, FormaPagamento, ValorCobrado } from '../components/Valores'

const CATEGORIAS = Object.keys(CATEGORIA_EMPRESA_ROTULOS) as CategoriaEmpresa[]
const BENEFICIOS = [
  ['', 'Todos os benefícios'],
  ['cupom', 'Com cupom'],
  ['cortesia', 'Cortesia'],
  ['nenhum', 'Sem benefício'],
] as const

function Situacao({ e }: { e: EmpresaPlataformaResumo }) {
  const detalhe = detalheSituacao(e)
  return (
    <div className="min-w-0">
      <SeloCategoria categoria={e.categoria} />
      {detalhe && <p className={cn('mt-1 max-w-[180px] truncate text-xs', e.diasAtraso > 0 ? 'font-semibold text-coral-escuro' : 'text-texto-secundario')}>{detalhe}</p>}
    </div>
  )
}

function UltimoPagamento({ e }: { e: EmpresaPlataformaResumo }) {
  if (!e.ultimoPagamento) return <span className="text-texto-secundario">—</span>
  return (
    <span className="whitespace-nowrap">
      <span className="block tabular-nums text-grafite">{formatarData(e.ultimoPagamento.data)}</span>
      <span className="block text-xs tabular-nums text-texto-secundario">{formatarMoeda(e.ultimoPagamento.valor)}</span>
    </span>
  )
}

/** Todas as assinaturas: situação bem à vista, valores, benefícios e ações rápidas por linha. */
export function EmpresasPlataformaPage() {
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const [nova, setNova] = useState(false)
  const [pedido, setPedido] = useState<PedidoAcao | null>(null)
  const busca = useDebounce(params.get('busca') ?? '', 300)
  const filtros: EmpresasPlataformaQuery = {
    busca: busca || undefined,
    categoria: (params.get('categoria') as CategoriaEmpresa) || undefined,
    beneficio: (params.get('beneficio') as EmpresasPlataformaQuery['beneficio']) || undefined,
    plano: params.get('plano') || undefined,
    // Links antigos (nível / situação) continuam valendo
    nivel: (params.get('nivel') as EmpresasPlataformaQuery['nivel']) || undefined,
    situacao: (params.get('situacao') as EmpresasPlataformaQuery['situacao']) || undefined,
  }
  const consulta = useQuery({ queryKey: ['plataforma', 'empresas', filtros], queryFn: () => plataformaApi.empresas(filtros), placeholderData: keepPreviousData })
  // Contagem dos chips: lista sem filtro (a plataforma tem no máximo alguns milhares de empresas)
  const todas = useQuery({ queryKey: ['plataforma', 'empresas', {}], queryFn: () => plataformaApi.empresas({}) })
  const planos = useQuery({ queryKey: ['plataforma', 'planos'], queryFn: plataformaApi.planos })
  const definir = (chave: string, valor: string) => {
    const p = new URLSearchParams(params)
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    setParams(p, { replace: true })
  }
  const contagem = useMemo(() => {
    const c = Object.fromEntries(CATEGORIAS.map((k) => [k, 0])) as Record<CategoriaEmpresa, number>
    for (const e of todas.data ?? []) if (e.categoria) c[e.categoria]++
    return c
  }, [todas.data])
  const lista = useMemo(() => consulta.data ?? [], [consulta.data])
  const totais = useMemo(
    () => ({
      mensal: lista.filter((e) => e.situacao === 'ativa').reduce((t, e) => t + Number(e.valorCobrado ?? 0), 0),
      atraso: lista.reduce((t, e) => t + Number(e.emAtraso), 0),
    }),
    [lista],
  )
  const temFiltro = [...params.keys()].length > 0

  return (
    <>
      <CabecalhoPlataforma
        sobretitulo="Gestão"
        titulo="Assinaturas"
        subtitulo="Cada empresa, quanto paga, como paga e a situação de hoje. Use o menu ⋯ da linha para liberar, dar benefícios ou bloquear."
        acoes={
          <Button onClick={() => setNova(true)}>
            <Plus /> Nova empresa
          </Button>
        }
      />

      {/* Chips de situação com a contagem de cada uma */}
      <div className="-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        <div className="flex w-max gap-2 sm:w-auto sm:flex-wrap">
          <button
            type="button"
            onClick={() => definir('categoria', '')}
            className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition-colors', !filtros.categoria ? 'bg-grafite text-white ring-grafite' : 'bg-card text-grafite ring-border hover:bg-fundo')}
          >
            Todas <span className={cn('rounded-full px-1.5 text-xs tabular-nums', !filtros.categoria ? 'bg-white/15' : 'bg-fundo')}>{todas.data?.length ?? '…'}</span>
          </button>
          {CATEGORIAS.map((c) => {
            const ativo = filtros.categoria === c
            return (
              <button
                key={c}
                type="button"
                onClick={() => definir('categoria', ativo ? '' : c)}
                aria-pressed={ativo}
                className={cn('inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold ring-1 transition-colors', ativo ? 'bg-grafite text-white ring-grafite' : 'bg-card text-grafite ring-border hover:bg-fundo', contagem[c] === 0 && !ativo && 'opacity-60')}
              >
                <span className={cn('h-2 w-2 rounded-full', PONTO_CATEGORIA[c])} aria-hidden="true" />
                {CATEGORIA_SINGULAR[c]}
                <span className={cn('rounded-full px-1.5 text-xs tabular-nums', ativo ? 'bg-white/15' : 'bg-fundo')}>{contagem[c]}</span>
              </button>
            )
          })}
        </div>
      </div>

      <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_200px_200px_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-texto-secundario" aria-hidden="true" />
          <Input className="pl-9" placeholder="Buscar por nome ou identificador…" aria-label="Buscar" value={params.get('busca') ?? ''} onChange={(e) => definir('busca', e.target.value)} />
        </div>
        <Select aria-label="Plano" value={filtros.plano ?? ''} onChange={(e) => definir('plano', e.target.value)}>
          <option value="">Todos os planos</option>
          {planos.data?.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nome}
            </option>
          ))}
        </Select>
        <Select aria-label="Benefício" value={filtros.beneficio ?? ''} onChange={(e) => definir('beneficio', e.target.value)}>
          {BENEFICIOS.map(([v, r]) => (
            <option key={v} value={v}>
              {r}
            </option>
          ))}
        </Select>
        {temFiltro && (
          <Button variant="ghost" onClick={() => setParams(new URLSearchParams(), { replace: true })}>
            <X /> Limpar
          </Button>
        )}
      </div>

      <section className="overflow-hidden rounded-3xl bg-card shadow-suave" aria-label="Assinaturas">
        {consulta.data && (
          <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-b border-border px-5 py-3 text-sm">
            <span className="font-semibold text-grafite">{lista.length} assinatura(s)</span>
            <span className="text-texto-secundario">
              Cobrado por mês (ativas): <strong className="tabular-nums text-grafite">{formatarMoeda(totais.mensal)}</strong>
            </span>
            {totais.atraso > 0 && (
              <span className="text-texto-secundario">
                Em atraso: <strong className="tabular-nums text-coral-escuro">{formatarMoeda(totais.atraso)}</strong>
              </span>
            )}
            {consulta.isFetching && <span className="text-xs text-texto-secundario">atualizando…</span>}
          </div>
        )}
        {consulta.isPending ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }, (_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : lista.length === 0 ? (
          <EmptyState icone={Building2} titulo="Nenhuma assinatura neste filtro" descricao="Limpe os filtros ou crie uma empresa." />
        ) : (
          <>
            {/* Tabela (telas largas): rola de lado dentro do cartão se faltar espaço */}
            <div className="relative hidden overflow-x-auto lg:block">
              <table className="w-full min-w-[1120px] text-sm [&_td]:px-2.5 [&_th]:px-2.5 [&_td:first-child]:pl-5 [&_th:first-child]:pl-5">
                <thead>
                  <tr className="border-b border-border bg-fundo/60 text-left text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">
                    <th className="py-2.5 pl-5 pr-3">Empresa</th>
                    <th className="px-3">Situação</th>
                    <th className="px-3">Plano</th>
                    <th className="px-3">Valor/mês</th>
                    <th className="px-3">Pagamento</th>
                    <th className="px-3">Último pagamento</th>
                    <th className="px-3">Próx. vencimento</th>
                    <th className="px-3">Benefício</th>
                    <th className="px-3 text-right">Em atraso</th>
                    <th className="w-12 pr-3">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {lista.map((e) => (
                    <tr key={e.id} className="cursor-pointer align-middle transition-colors hover:bg-fundo/70" onClick={() => navigate(`/plataforma/empresas/${e.id}`)}>
                      <td className="relative max-w-[260px] py-3 pl-5 pr-3">
                        {e.categoria && <span className={cn('absolute inset-y-2 left-0 w-1 rounded-r-full', PONTO_CATEGORIA[e.categoria])} aria-hidden="true" />}
                        <Link to={`/plataforma/empresas/${e.id}`} className="block max-w-[200px] truncate font-semibold text-grafite hover:underline" onClick={(ev) => ev.stopPropagation()}>
                          {e.nome}
                        </Link>
                        <span className="block max-w-[200px] truncate text-xs text-texto-secundario">
                          /{e.slug}
                          {!e.ativa && ' · desativada'}
                        </span>
                      </td>
                      <td className="max-w-[220px] px-3 py-3">
                        <Situacao e={e} />
                      </td>
                      <td className="px-3 py-3 text-grafite">{e.plano ?? '—'}</td>
                      <td className="px-3 py-3">
                        <ValorCobrado e={e} empilhado />
                      </td>
                      <td className="px-3 py-3 text-grafite">
                        <FormaPagamento forma={e.formaPagamento} />
                      </td>
                      <td className="px-3 py-3">
                        <UltimoPagamento e={e} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 tabular-nums text-grafite">{e.proximoVencimento ? formatarDataSimples(e.proximoVencimento) : '—'}</td>
                      <td className="max-w-[180px] px-3 py-3">
                        <ChipBeneficio beneficio={e.beneficio} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-right tabular-nums">{Number(e.emAtraso) > 0 ? <strong className="text-coral-escuro">{formatarMoeda(e.emAtraso)}</strong> : <span className="text-texto-secundario">—</span>}</td>
                      <td className="pr-3" onClick={(ev) => ev.stopPropagation()}>
                        <MenuAcoesEmpresa empresa={e} onPedir={setPedido} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Cartões (celular e tablet) */}
            <ul className="divide-y divide-border lg:hidden">
              {lista.map((e) => (
                <li key={e.id} className="relative flex gap-3 py-4 pl-5 pr-3">
                  {e.categoria && <span className={cn('absolute inset-y-3 left-0 w-1 rounded-r-full', PONTO_CATEGORIA[e.categoria])} aria-hidden="true" />}
                  <Link to={`/plataforma/empresas/${e.id}`} className="min-w-0 flex-1 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-grafite">{e.nome}</p>
                        <p className="truncate text-xs text-texto-secundario">
                          /{e.slug} · {e.plano ?? 'sem plano'}
                        </p>
                      </div>
                      <div className="text-right text-sm">
                        <ValorCobrado e={e} />
                      </div>
                    </div>
                    <Situacao e={e} />
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-texto-secundario">
                      <FormaPagamento forma={e.formaPagamento} />
                      {e.proximoVencimento && <span>Vence {formatarDataSimples(e.proximoVencimento)}</span>}
                      {Number(e.emAtraso) > 0 && <strong className="text-coral-escuro">{formatarMoeda(e.emAtraso)} em atraso</strong>}
                      {e.beneficio && <ChipBeneficio beneficio={e.beneficio} />}
                    </div>
                  </Link>
                  <div className="shrink-0">
                    <MenuAcoesEmpresa empresa={e} onPedir={setPedido} />
                  </div>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      {nova && <NovaEmpresaDialog onFechar={() => setNova(false)} />}
      {pedido && <DialogoAcao pedido={pedido} onFechar={() => setPedido(null)} />}
    </>
  )
}
