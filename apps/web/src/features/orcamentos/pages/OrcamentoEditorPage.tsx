import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CheckCircle2, Plus, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataHora, formatarDataSimples, orcamentoSchema, type OrcamentoDetalhe } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { orcamentosApi } from '@/api/comercial'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { SearchSelect } from '@/components/shared/SearchSelect'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermission } from '@/hooks/usePermission'
import { buscarClientes } from '../buscas'
import { AcoesOrcamento } from '../components/editor/AcoesOrcamento'
import { ItemOrcamento } from '../components/editor/ItemOrcamento'
import { PedidoGerado } from '../components/editor/PedidoGerado'
import { TotaisOrcamento } from '../components/editor/TotaisOrcamento'
import { formDoOrcamento, itemVazio, novaChave, payloadDoForm, type FormOrcamento } from '../components/editor/formOrcamento'
import { useCalculoOrcamento } from '../components/editor/useCalculoOrcamento'

const ABERTOS = ['rascunho', 'enviado', 'em_negociacao']

function Editor({ orcamento, solicitacaoId, clienteInicial }: { orcamento?: OrcamentoDetalhe; solicitacaoId?: string | null; clienteInicial?: { id: string; rotulo: string } | null }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const empresa = useEmpresa()
  const podeSalvar = usePermission('orcamentos', orcamento ? 'editar' : 'criar')
  const [inicial] = useState(() => formDoOrcamento(orcamento, clienteInicial))
  const [form, setForm] = useState<FormOrcamento>(inicial)
  const alterado = useMemo(() => JSON.stringify(form) !== JSON.stringify(inicial), [form, inicial])
  const editavel = podeSalvar && (!orcamento || ABERTOS.includes(orcamento.status))
  const calculo = useCalculoOrcamento(form, empresa.data?.areaMinimaM2)
  const salvar = useMutacao(['orcamentos', 'solicitacoes'], (dados: unknown) => (orcamento ? orcamentosApi.atualizar(orcamento.id, dados) : orcamentosApi.criar(dados)))

  // Avisa antes de sair com alterações não salvas
  useEffect(() => {
    if (!alterado) return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [alterado])

  const atualizar = (dados: Partial<FormOrcamento>) => setForm((f) => ({ ...f, ...dados }))
  const mudarItens = (fn: (itens: FormOrcamento['itens']) => FormOrcamento['itens']) => setForm((f) => ({ ...f, itens: fn(f.itens) }))

  async function onSalvar() {
    const payload = payloadDoForm(form, orcamento ? undefined : solicitacaoId)
    const validacao = orcamentoSchema.safeParse(payload)
    if (!validacao.success) return toast.error(validacao.error.issues[0]?.message ?? 'Verifique os dados.')
    if (calculo.temErros) return toast.error('Corrija os itens destacados antes de salvar.')
    try {
      const salvo = await salvar.mutateAsync(payload)
      queryClient.setQueryData(['orcamentos', 'detalhe', salvo.id], salvo)
      toast.success(orcamento ? 'Orçamento salvo.' : `Orçamento ${salvo.numero} criado.`)
      navigate(`/orcamentos/${salvo.id}`, { replace: true, state: { recarregar: Date.now() } })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-petroleo">{orcamento ? orcamento.numero : 'Novo orçamento'}</h1>
            {orcamento && <StatusBadge entidade="orcamento" codigo={orcamento.status} />}
            {alterado && <span className="rounded-full bg-ambar/15 px-2 py-0.5 text-xs text-amber-800">não salvo</span>}
          </div>
          {orcamento && (
            <p className="mt-1 text-sm text-texto-secundario">
              {orcamento.vendedor?.nome ?? 'Sem vendedor'} · criado em {formatarDataHora(orcamento.createdAt)}
              {orcamento.solicitacao && ` · solicitação ${orcamento.solicitacao.numero}`}
            </p>
          )}
        </div>
        <AcoesOrcamento orcamento={orcamento} editavel={editavel} alterado={alterado} salvando={salvar.isPending} onSalvar={() => void onSalvar()} />
      </div>

      {orcamento?.status === 'aprovado' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-verde/10 p-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" /> Aprovado por {orcamento.aprovadoPorNome} em {formatarDataHora(orcamento.aprovadoEm)}
          {orcamento.aprovadoIp && ` (link público, IP ${orcamento.aprovadoIp})`}.
        </p>
      )}
      {orcamento?.status === 'recusado' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-coral/10 p-3 text-sm text-coral-escuro">
          <XCircle className="h-4 w-4" /> Recusado em {formatarDataHora(orcamento.recusadoEm)}: {orcamento.motivoRecusa}
        </p>
      )}
      {orcamento?.status === 'expirado' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-ambar/10 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Expirou em {formatarDataSimples(orcamento.validade)}. Use “Reabrir negociação” para renovar a validade.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-6">
              <CampoFormulario id="orc-cliente" rotulo="Cliente *">
                <SearchSelect id="orc-cliente" chave="clientes-busca" buscar={buscarClientes} valor={form.cliente} onChange={(c) => atualizar({ cliente: c })} placeholder="Buscar cliente…" desabilitado={!editavel} />
              </CampoFormulario>
            </CardContent>
          </Card>

          {form.itens.map((item, i) => (
            <ItemOrcamento
              key={item.chave}
              indice={i}
              total={form.itens.length}
              item={item}
              calculo={calculo.itens[i]!}
              editavel={editavel}
              onChange={(novo) => mudarItens((itens) => itens.map((x, j) => (j === i ? novo : x)))}
              onRemover={() => mudarItens((itens) => itens.filter((_, j) => j !== i))}
              onDuplicar={() => mudarItens((itens) => [...itens.slice(0, i + 1), { ...item, chave: novaChave() }, ...itens.slice(i + 1)])}
              onMover={(d) =>
                mudarItens((itens) => {
                  const destino = i + d
                  if (destino < 0 || destino >= itens.length) return itens
                  const novo = [...itens]
                  ;[novo[i], novo[destino]] = [novo[destino]!, novo[i]!]
                  return novo
                })
              }
            />
          ))}
          {editavel && (
            <Button variant="outline" className="w-full border-dashed" onClick={() => mudarItens((itens) => [...itens, itemVazio()])}>
              <Plus /> Adicionar item
            </Button>
          )}

          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
              <CampoFormulario id="orc-cond" rotulo="Condições de pagamento">
                <Textarea id="orc-cond" rows={3} disabled={!editavel} value={form.condicoes} placeholder={empresa.data?.condicoesPadrao ?? ''} onChange={(e) => atualizar({ condicoes: e.target.value })} />
              </CampoFormulario>
              <CampoFormulario id="orc-obs" rotulo="Observações (aparecem para o cliente)">
                <Textarea id="orc-obs" rows={3} disabled={!editavel} value={form.observacoes} onChange={(e) => atualizar({ observacoes: e.target.value })} />
              </CampoFormulario>
              <div className="md:col-span-2">
                <CampoFormulario id="orc-obsint" rotulo="Observações internas (só a equipe vê)">
                  <Textarea id="orc-obsint" rows={2} disabled={!editavel} value={form.observacoesInternas} onChange={(e) => atualizar({ observacoesInternas: e.target.value })} />
                </CampoFormulario>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-4 xl:sticky xl:top-24 xl:self-start">
          <TotaisOrcamento
            form={form}
            onChange={atualizar}
            subtotal={calculo.subtotal}
            total={calculo.total}
            prazoDias={calculo.prazoDias}
            previsaoEntrega={calculo.previsaoEntrega}
            editavel={editavel}
            margemPercentual={alterado ? undefined : orcamento?.margemPercentual}
          />
          {orcamento?.pedido && <PedidoGerado pedido={orcamento.pedido} />}
        </div>
      </div>
    </>
  )
}

/** /orcamentos/novo (opcional ?solicitacao=&cliente=) e /orcamentos/:id */
export function OrcamentoEditorPage() {
  const { id } = useParams()
  const [busca] = useSearchParams()
  const novo = !id || id === 'novo'
  const consulta = useQuery({ queryKey: ['orcamentos', 'detalhe', id], queryFn: () => orcamentosApi.obter(id!), enabled: !novo })
  const clienteId = busca.get('cliente')
  const cliente = useQuery({ queryKey: ['clientes', 'detalhe', clienteId], queryFn: () => clientesApi.obter(clienteId!), enabled: novo && Boolean(clienteId) })

  const voltar = (
    <Button asChild variant="outline" size="sm" className="mb-4">
      <Link to="/orcamentos">
        <ArrowLeft /> Orçamentos
      </Link>
    </Button>
  )

  if (novo) {
    if (clienteId && cliente.isPending) return <Skeleton className="h-96 w-full" />
    return (
      <>
        {voltar}
        <Editor solicitacaoId={busca.get('solicitacao')} clienteInicial={cliente.data ? { id: cliente.data.id, rotulo: cliente.data.nome } : null} />
      </>
    )
  }
  if (consulta.isPending) return <Skeleton className="h-96 w-full" />
  if (consulta.isError) {
    return (
      <>
        <PageHeader titulo="Orçamento" acoes={voltar} />
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      </>
    )
  }
  return (
    <>
      {voltar}
      <Editor key={`${consulta.data.id}-${consulta.data.updatedAt}`} orcamento={consulta.data} />
    </>
  )
}
