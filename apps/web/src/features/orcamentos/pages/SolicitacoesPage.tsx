import { useEffect, useMemo, useState } from 'react'
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import type { ColumnDef } from '@tanstack/react-table'
import { FilePlus2, Globe, Hand, Mail, Plus, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ORIGENS_CLIENTE, ORIGEM_ROTULOS, STATUS_SOLICITACAO, formatarDataHora, formatarDataSimples, type OrigemCliente, type Solicitacao, type StatusSolicitacao } from '@onprint/shared'
import { solicitacoesApi } from '@/api/comercial'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { DataTable } from '@/components/shared/data-table/DataTable'
import { FormDialog } from '@/components/shared/FormDialog'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/form-controls'
import { useAuth } from '@/hooks/useAuth'
import { useListagem } from '@/hooks/useListagem'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermissoes } from '@/hooks/usePermission'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { AbasComercial } from '../components/AbasComercial'
import { PainelSolicitacao, type SolicitacaoComItens } from '../components/PainelSolicitacao'
import { SolicitacaoDialog } from '../components/SolicitacaoDialog'

export function SolicitacoesPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const { usuario } = useAuth()
  const pode = usePermissoes()
  const { mapa } = useStatusConfig()
  const lista = useListagem<{ status?: string }>({})
  // Origem fica na URL: o atalho "Pedidos do site" (menu Vitrine) abre com ?origem=site
  const [busca, setBusca] = useSearchParams()
  const origemUrl = busca.get('origem')
  const origem = (ORIGENS_CLIENTE as readonly string[]).includes(origemUrl ?? '') ? (origemUrl as OrigemCliente) : undefined
  const params = { ...lista.params, status: lista.filtros.status as StatusSolicitacao | undefined, origem }
  const consulta = useQuery({ queryKey: ['solicitacoes', params], queryFn: () => solicitacoesApi.listar(params), placeholderData: keepPreviousData })
  const [criando, setCriando] = useState(false)
  const [descartando, setDescartando] = useState<Solicitacao | null>(null)
  // ?id= abre o painel direto (link do aviso de pedido do site no sino), mesmo fora da página atual da lista
  const idUrl = busca.get('id')
  const [abertaId, setAbertaId] = useState<string | null>(idUrl)
  useEffect(() => {
    if (idUrl) setAbertaId(idUrl)
  }, [idUrl])
  const naLista = consulta.data?.data.find((s) => s.id === abertaId)
  const avulsa = useQuery({
    queryKey: ['solicitacoes', 'detalhe', abertaId],
    queryFn: () => solicitacoesApi.obter(abertaId as string),
    enabled: Boolean(abertaId) && !naLista && !consulta.isPending,
  })
  const solicitacaoAberta: SolicitacaoComItens | undefined = naLista ?? avulsa.data
  function fecharPainel() {
    setAbertaId(null)
    if (busca.has('id')) {
      const nova = new URLSearchParams(busca)
      nova.delete('id')
      setBusca(nova, { replace: true })
    }
  }
  const [motivo, setMotivo] = useState('')
  const assumir = useMutacao(['solicitacoes'], (id: string) => solicitacoesApi.assumir(id))
  const descartar = useMutacao(['solicitacoes'], (s: Solicitacao) => solicitacoesApi.descartar(s.id, motivo))
  const abertaPelaRota = pathname.endsWith('/novo')

  function trocarOrigem(valor: string) {
    const nova = new URLSearchParams(busca)
    if (valor) nova.set('origem', valor)
    else nova.delete('origem')
    setBusca(nova, { replace: true })
    lista.setPage(1)
  }

  const colunas = useMemo<ColumnDef<Solicitacao, unknown>[]>(
    () => [
      {
        id: 'numero',
        header: 'Solicitação',
        meta: { ordenavel: 'numero' },
        cell: ({ row: { original: s } }) => (
          <div>
            <p className="font-mono text-xs">{s.numero}</p>
            <p className="text-xs text-texto-secundario">{formatarDataHora(s.createdAt)}</p>
          </div>
        ),
      },
      {
        id: 'cliente',
        header: 'Cliente',
        cell: ({ row }) => {
          const s = row.original as SolicitacaoComItens
          const qtd = s.itens?.length ?? 0
          return (
            <div className="min-w-0">
              <p className="truncate font-medium">{s.cliente?.nome ?? '—'}</p>
              {s.origem === 'site' ? (
                <p className="inline-flex items-center gap-1 text-xs font-medium text-marca-escuro">
                  <Globe className="h-3 w-3" /> Site{qtd > 0 && ` · ${qtd} ${qtd === 1 ? 'item' : 'itens'}`}
                </p>
              ) : (
                <p className="text-xs text-texto-secundario">{ORIGEM_ROTULOS[s.origem]}</p>
              )}
              {s.email && (
                <p className="flex min-w-0 items-center gap-1 text-xs text-texto-secundario">
                  <Mail className="h-3 w-3 shrink-0" /> <span className="truncate">{s.email}</span>
                </p>
              )}
            </div>
          )
        },
      },
      { id: 'descricao', header: 'Pedido do cliente', meta: { className: 'max-w-sm' }, cell: ({ row }) => <p className="line-clamp-2 text-sm">{row.original.descricao}</p> },
      { id: 'prazo', header: 'Prazo desejado', meta: { ordenavel: 'prazoDesejado' }, cell: ({ row }) => formatarDataSimples(row.original.prazoDesejado) },
      { id: 'responsavel', header: 'Responsável', cell: ({ row }) => row.original.responsavel?.nome ?? <span className="text-ambar">Sem responsável</span> },
      { id: 'status', header: 'Status', cell: ({ row }) => <StatusBadge entidade="solicitacao" codigo={row.original.status} /> },
      {
        id: 'acoes',
        header: '',
        meta: { className: 'w-28 text-right' },
        cell: ({ row: { original: s } }) => {
          const aberta = s.status === 'nova' || s.status === 'em_atendimento'
          return (
            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
              {aberta && pode('orcamentos', 'criar') && s.clienteId && (
                <AcaoIcone icone={FilePlus2} rotulo="Criar orçamento" onClick={() => navigate(`/orcamentos/novo?solicitacao=${s.id}&cliente=${s.clienteId}`)} />
              )}
              {aberta && pode('orcamentos', 'editar') && s.responsavelId !== usuario?.id && (
                <AcaoIcone icone={Hand} rotulo="Assumir atendimento" onClick={() => assumir.mutate(s.id, { onSuccess: () => toast.success('Solicitação assumida.'), onError: (e) => toast.error(e.message) })} />
              )}
              {aberta && pode('orcamentos', 'editar') && <AcaoIcone icone={XCircle} rotulo="Descartar" perigo onClick={() => setDescartando(s)} />}
            </div>
          )
        },
      },
    ],
    [navigate, pode, usuario?.id, assumir],
  )

  return (
    <>
      <PageHeader
        titulo="Orçamentos"
        subtitulo="Do primeiro contato ao pedido."
        acoes={
          pode('orcamentos', 'criar') && (
            <Button onClick={() => setCriando(true)}>
              <Plus /> Nova solicitação
            </Button>
          )
        }
      />
      <AbasComercial />
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
        idLinha={(s) => s.id}
        onLinhaClick={(s) => setAbertaId(s.id)}
        destacarLinha={(s) => s.status === 'nova' || !s.responsavelId}
        busca={{ valor: lista.busca, onChange: lista.setBusca, placeholder: 'Número, cliente ou descrição…' }}
        filtros={
          <>
            <div className="w-full sm:w-48">
              <Select value={lista.filtros.status ?? ''} onChange={(e) => lista.setFiltro('status', e.target.value || undefined)} aria-label="Status">
                <option value="">Todos os status</option>
                {STATUS_SOLICITACAO.map((s) => (
                  <option key={s} value={s}>
                    {mapa.get(`solicitacao:${s}`)?.rotulo ?? s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-full sm:w-44">
              <Select value={origem ?? ''} onChange={(e) => trocarOrigem(e.target.value)} aria-label="Origem">
                <option value="">Todas as origens</option>
                {ORIGENS_CLIENTE.map((o) => (
                  <option key={o} value={o}>
                    {ORIGEM_ROTULOS[o]}
                  </option>
                ))}
              </Select>
            </div>
          </>
        }
        vazio={
          origem === 'site'
            ? { titulo: 'Nenhum pedido do site', descricao: 'As listas de orçamento enviadas pela sua vitrine online aparecem aqui, com os itens escolhidos.' }
            : { titulo: 'Nenhuma solicitação', descricao: 'Registre aqui cada pedido de orçamento que chega pelo WhatsApp, balcão ou telefone.' }
        }
      />

      {(criando || abertaPelaRota) && (
        <SolicitacaoDialog
          onFechar={() => {
            setCriando(false)
            if (abertaPelaRota) navigate('/orcamentos/solicitacoes', { replace: true })
          }}
        />
      )}
      {solicitacaoAberta && (
        <PainelSolicitacao
          key={solicitacaoAberta.id}
          solicitacao={solicitacaoAberta}
          onFechar={fecharPainel}
          assumindo={assumir.isPending}
          onAssumir={(s) => assumir.mutate(s.id, { onSuccess: () => toast.success('Solicitação assumida.'), onError: (e) => toast.error(e.message) })}
          onDescartar={(s) => setDescartando(s)}
        />
      )}
      {descartando && (
        <FormDialog
          aberto
          onAbertoChange={(v) => !v && setDescartando(null)}
          titulo={`Descartar ${descartando.numero}`}
          salvando={descartar.isPending}
          textoSalvar="Descartar"
          onSubmit={async (e) => {
            e.preventDefault()
            try {
              await descartar.mutateAsync(descartando)
              toast.success('Solicitação descartada.')
              setDescartando(null)
              setMotivo('')
            } catch (err) {
              toast.error((err as Error).message)
            }
          }}
        >
          <Textarea autoFocus rows={3} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Motivo (ex.: cliente desistiu, fora do nosso escopo)…" aria-label="Motivo" />
        </FormDialog>
      )}
    </>
  )
}
