import { useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { HandCoins } from 'lucide-react'
import { toast } from 'sonner'
import { formatarData, formatarMoeda, hojeISO, type Comissao, type StatusComissao } from '@onprint/shared'
import { financeiroApi } from '@/api/financeiro'
import { PageHeader } from '@/components/layout/PageHeader'
import { Can } from '@/components/shared/Can'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useUsuariosOpcoes } from '@/features/producao/hooks'
import { useListagem } from '@/hooks/useListagem'
import { cn } from '@/lib/utils'
import { useContasFinanceiras, useFormasPagamento } from '../hooks'

const ROTULO: Record<StatusComissao, string> = { prevista: 'Prevista', liberada: 'Liberada', paga: 'Paga' }
const COR: Record<StatusComissao, string> = { prevista: 'bg-slate-100 text-slate-700', liberada: 'bg-ambar/15 text-amber-800', paga: 'bg-verde/10 text-green-800' }

function PagarDialog({ ids, total, onFechar }: { ids: string[]; total: number; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const contas = useContasFinanceiras()
  const formas = useFormasPagamento()
  const [conta, setConta] = useState('')
  const [forma, setForma] = useState('')
  const [data, setData] = useState(hojeISO())
  const [salvando, setSalvando] = useState(false)
  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo={`Pagar ${ids.length} comissão(ões)`}
      descricao={`Total ${formatarMoeda(total)} — lançado como saída na categoria Comissões.`}
      salvando={salvando}
      textoSalvar="Registrar pagamento"
      onSubmit={async (e) => {
        e.preventDefault()
        if (!conta) return toast.error('Escolha a conta.')
        setSalvando(true)
        try {
          await financeiroApi.pagarComissoes({ ids, contaFinanceiraId: conta, formaPagamentoId: forma || null, data })
          toast.success('Comissões pagas.')
          await queryClient.invalidateQueries({ queryKey: ['financeiro'] })
          onFechar()
        } catch (erro) {
          toast.error((erro as Error).message)
        } finally {
          setSalvando(false)
        }
      }}
    >
      <CampoFormulario id="pc-conta" rotulo="Conta *">
        <Select id="pc-conta" value={conta} onChange={(e) => setConta(e.target.value)}>
          <option value="">Escolha…</option>
          {contas.data?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nome}
            </option>
          ))}
        </Select>
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="pc-forma" rotulo="Forma">
          <Select id="pc-forma" value={forma} onChange={(e) => setForma(e.target.value)}>
            <option value="">—</option>
            {formas.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="pc-data" rotulo="Data">
          <Input id="pc-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </CampoFormulario>
      </div>
    </FormDialog>
  )
}

/** Comissões dos vendedores: prevista (pedido convertido) → liberada (pedido pago) → paga. */
export function ComissoesPage() {
  const usuarios = useUsuariosOpcoes()
  const lista = useListagem<{ status?: string; vendedorId?: string }>({ status: 'liberada' })
  const params = { ...lista.params, status: lista.filtros.status as StatusComissao | undefined }
  const consulta = useQuery({ queryKey: ['financeiro', 'comissoes', params], queryFn: () => financeiroApi.comissoes(params), placeholderData: keepPreviousData })
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set())
  const [pagando, setPagando] = useState(false)
  const liberadas = (consulta.data?.data ?? []).filter((c) => c.status === 'liberada')
  const totalSel = liberadas.filter((c) => selecionadas.has(c.id)).reduce((s, c) => s + Number(c.valor), 0)

  const alternar = (id: string) =>
    setSelecionadas((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  // Recriadas a cada render: a coluna de seleção depende do estado
  const colunas: ColumnDef<Comissao, unknown>[] = [
      {
        id: 'sel',
        header: '',
        cell: ({ row: { original: c } }) =>
          c.status === 'liberada' ? <Checkbox aria-label={`Selecionar ${c.pedido.numero}`} checked={selecionadas.has(c.id)} onClick={(e) => e.stopPropagation()} onChange={() => alternar(c.id)} /> : null,
      },
      {
        id: 'pedido',
        header: 'Pedido',
        cell: ({ row: { original: c } }) => (
          <div className="min-w-0">
            <Link to={`/pedidos/${c.pedido.id}?aba=financeiro`} className="font-mono text-xs font-semibold text-tinta hover:underline">
              {c.pedido.numero}
            </Link>
            <p className="truncate text-xs text-texto-secundario">{c.pedido.cliente.nome}</p>
          </div>
        ),
      },
      { id: 'vendedor', header: 'Vendedor', cell: ({ row }) => row.original.vendedor.nome },
      { id: 'base', header: 'Base', meta: { className: 'text-right', ocultarNoCard: true }, cell: ({ row }) => formatarMoeda(row.original.base) },
      { id: 'pct', header: '%', meta: { className: 'text-right', ocultarNoCard: true }, cell: ({ row }) => `${Number(row.original.percentual).toLocaleString('pt-BR')}%` },
      { id: 'valor', header: 'Comissão', meta: { ordenavel: 'valor', className: 'text-right' }, cell: ({ row }) => <span className="font-semibold">{formatarMoeda(row.original.valor)}</span> },
      { id: 'status', header: 'Situação', cell: ({ row }) => <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', COR[row.original.status])}>{ROTULO[row.original.status]}</span> },
      { id: 'data', header: 'Liberada/paga em', meta: { ocultarNoCard: true }, cell: ({ row }) => formatarData(row.original.pagaEm ?? row.original.liberadaEm) || '—' },
  ]
  const resumo = consulta.data?.resumo ?? {}

  return (
    <>
      <PageHeader
        titulo="Comissões"
        subtitulo="A comissão é liberada quando o pedido fica totalmente pago."
        acoes={
          <Can modulo="financeiro" acao="editar">
            <Button disabled={selecionadas.size === 0} onClick={() => setPagando(true)}>
              <HandCoins /> Pagar selecionadas {selecionadas.size > 0 && `(${formatarMoeda(totalSel)})`}
            </Button>
          </Can>
        }
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        {(['prevista', 'liberada', 'paga'] as const).map((s) => (
          <Card key={s} className="p-4">
            <p className="text-xs text-texto-secundario">{ROTULO[s]}s</p>
            <p className="text-xl font-semibold text-tinta">{formatarMoeda(resumo[s] ?? '0')}</p>
          </Card>
        ))}
      </div>
      <DataTable
        colunas={colunas}
        resultado={consulta.data}
        carregando={consulta.isFetching}
        erro={consulta.error}
        onTentarNovamente={() => void consulta.refetch()}
        page={lista.page}
        pageSize={lista.pageSize}
        sort={lista.sort}
        onPageChange={lista.setPage}
        onPageSizeChange={lista.setPageSize}
        onSortChange={lista.setSort}
        idLinha={(c) => c.id}
        onLinhaClick={(c) => c.status === 'liberada' && alternar(c.id)}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Pedido, cliente ou vendedor…' }}
        filtros={
          <div className="flex flex-wrap gap-2">
            <div className="w-40">
              <Select value={lista.filtros.status ?? ''} onChange={(e) => lista.setFiltro('status', e.target.value || undefined)} aria-label="Situação">
                <option value="">Todas</option>
                {(['prevista', 'liberada', 'paga'] as const).map((s) => (
                  <option key={s} value={s}>
                    {ROTULO[s]}s
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-48">
              <Select value={lista.filtros.vendedorId ?? ''} onChange={(e) => lista.setFiltro('vendedorId', e.target.value || undefined)} aria-label="Vendedor">
                <option value="">Todos os vendedores</option>
                {usuarios.data?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nome}
                  </option>
                ))}
              </Select>
            </div>
          </div>
        }
        vazio={{ titulo: 'Nenhuma comissão neste filtro' }}
      />
      {pagando && (
        <PagarDialog
          ids={[...selecionadas]}
          total={totalSel}
          onFechar={() => {
            setPagando(false)
            setSelecionadas(new Set())
          }}
        />
      )}
    </>
  )
}
