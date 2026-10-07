import { useEffect, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeft, Ban, ChevronDown, Copy, FileDown, History, Loader2, Pencil, Printer, ReceiptText, Tags } from 'lucide-react'
import { toast } from 'sonner'
import { TIPO_ENTREGA_ROTULOS, formatarData, formatarDataSimples, formatarMoeda } from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { PageHeader } from '@/components/layout/PageHeader'
import { Anexos } from '@/components/shared/Anexos'
import { Can } from '@/components/shared/Can'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { SeloAtraso, SeloPrioridade } from '@/components/shared/Selos'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Timeline } from '@/components/shared/Timeline'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useImpressao } from '@/features/impressao/useImpressao'
import { usePermission } from '@/hooks/usePermission'
import { messagingProvider } from '@/integrations/messaging'
import { AbaEntrega } from '../components/detalhe/AbaEntrega'
import { AbaFinanceiro } from '../components/detalhe/AbaFinanceiro'
import { AbaItens } from '../components/detalhe/AbaItens'
import { AbaProducao } from '../components/detalhe/AbaProducao'
import { ArteDoItem } from '../components/detalhe/ArteDoItem'
import { CancelarPedidoDialog, EditarPedidoDialog } from '../components/detalhe/PedidoDialogs'
import { ReciboDialog } from '../components/detalhe/ReciboDialog'
import { usePedido, useTemplates } from '../hooks'
import { mensagemPedidoPronto } from '../mensagens'

const ABAS = ['itens', 'arte', 'producao', 'financeiro', 'entrega', 'historico', 'anexos'] as const

function Historico({ pedidoId }: { pedidoId: string }) {
  const consulta = useQuery({ queryKey: ['pedidos', 'historico', pedidoId], queryFn: () => pedidosApi.historico(pedidoId) })
  if (consulta.isPending) return <Skeleton className="h-40 w-full" />
  if (consulta.isError) return <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
  if (consulta.data.length === 0) return <EmptyState icone={History} titulo="Sem eventos" />
  return <Timeline eventos={consulta.data} />
}

/** Detalhe do pedido (/pedidos/:id) com as abas Itens | Arte | Produção | Financeiro | Entrega | Histórico | Anexos. */
export function PedidoPage() {
  const { id = '' } = useParams()
  const [params, setParams] = useSearchParams()
  const consulta = usePedido(id)
  const templates = useTemplates()
  const podeEditar = usePermission('pedidos', 'editar')
  const impressao = useImpressao()
  // ?editar=1 (atalho "Editar" do kanban) já abre o diálogo de edição
  const [dialogo, setDialogo] = useState<'editar' | 'cancelar' | 'recibo' | null>(() => (params.get('editar') === '1' && podeEditar ? 'editar' : null))
  const aba = ABAS.find((a) => a === params.get('aba')) ?? 'itens'
  useEffect(() => {
    if (params.get('editar') === null) return
    const resto = new URLSearchParams(params)
    resto.delete('editar')
    setParams(resto, { replace: true })
  }, [params, setParams])

  if (consulta.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>

  const pedido = consulta.data
  const encerrado = ['cancelado', 'entregue'].includes(pedido.status)
  const artesAprovadas = pedido.itens.filter((i) => i.artes[0]?.status === 'aprovada').length

  async function avisarPronto() {
    try {
      await messagingProvider.enviar({ destinatario: pedido.cliente.whatsapp ?? undefined, texto: mensagemPedidoPronto(pedido, templates.data) })
      toast.success('Mensagem copiada. Cole no WhatsApp do cliente.')
    } catch {
      toast.error('Não foi possível copiar a mensagem.')
    }
  }

  return (
    <>
      <PageHeader
        titulo={pedido.numero}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge entidade="pedido" codigo={pedido.status} />
            {pedido.atrasado && <SeloAtraso />}
            <SeloPrioridade prioridade={pedido.prioridade} />
            <Link to={`/clientes/${pedido.clienteId}`} className="text-marca-escuro hover:underline">
              {pedido.cliente.nome}
            </Link>
            {pedido.orcamento && (
              <Link to={`/orcamentos/${pedido.orcamento.id}`} className="text-texto-secundario hover:underline">
                · {pedido.orcamento.numero}
              </Link>
            )}
          </span>
        }
        acoes={
          <>
            <Button asChild variant="outline">
              <Link to="/pedidos">
                <ArrowLeft /> Pedidos
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" disabled={Boolean(impressao.ocupado)}>
                  {impressao.ocupado ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => void impressao.pedido(pedido.id, 'imprimir')}>
                  <Printer /> Pedido
                </DropdownMenuItem>
                {pedido.itens.some((i) => i.ordensProducao.some((o) => !o.cancelada)) && (
                  <DropdownMenuItem onSelect={() => void impressao.etiquetas(pedido.id)}>
                    <Tags /> Etiquetas de entrega
                  </DropdownMenuItem>
                )}
                {Number(pedido.valorPago) > 0 && (
                  <DropdownMenuItem onSelect={() => setDialogo('recibo')}>
                    <ReceiptText /> Recibo
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onSelect={() => void impressao.pedido(pedido.id, 'baixar')}>
                  <FileDown /> Baixar PDF do pedido
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            {pedido.status === 'pronto' && (
              <Button variant="secondary" onClick={() => void avisarPronto()}>
                <Copy /> Avisar cliente
              </Button>
            )}
            {!encerrado && (
              <>
                <Can modulo="pedidos" acao="editar">
                  <Button variant="outline" onClick={() => setDialogo('editar')}>
                    <Pencil /> Editar
                  </Button>
                </Can>
                <Can modulo="pedidos" acao="excluir">
                  <Button variant="outline" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setDialogo('cancelar')}>
                    <Ban /> Cancelar
                  </Button>
                </Can>
              </>
            )}
          </>
        }
      />

      {pedido.status === 'cancelado' && (
        <Card className="mb-4 border border-coral/40 p-4 text-sm">
          <strong className="text-coral-escuro">Cancelado</strong> em {formatarData(pedido.canceladoEm)}: {pedido.motivoCancelamento}
        </Card>
      )}

      <Card className="mb-4">
        <CardContent className="grid gap-4 p-4 text-sm sm:grid-cols-2 lg:grid-cols-5">
          <div>
            <p className="text-xs text-texto-secundario">Entrega prevista</p>
            <p className="font-medium">{formatarDataSimples(pedido.dataPrevistaEntrega)}</p>
          </div>
          <div>
            <p className="text-xs text-texto-secundario">Entrega</p>
            <p className="font-medium">{TIPO_ENTREGA_ROTULOS[pedido.tipoEntrega]}</p>
          </div>
          <div>
            <p className="text-xs text-texto-secundario">Artes aprovadas</p>
            <p className="font-medium">
              {artesAprovadas} de {pedido.itens.length}
            </p>
          </div>
          <div>
            <p className="text-xs text-texto-secundario">Vendedor</p>
            <p className="font-medium">{pedido.vendedor?.nome ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-texto-secundario">Total</p>
            <p className="text-base font-semibold text-grafite">{formatarMoeda(pedido.total)}</p>
          </div>
        </CardContent>
      </Card>

      <Tabs value={aba} onValueChange={(v) => setParams({ aba: v }, { replace: true })}>
        <TabsList>
          <TabsTrigger value="itens">Itens ({pedido.itens.length})</TabsTrigger>
          <TabsTrigger value="arte">Arte</TabsTrigger>
          <TabsTrigger value="producao">Produção</TabsTrigger>
          <TabsTrigger value="financeiro">Financeiro</TabsTrigger>
          <TabsTrigger value="entrega">Entrega</TabsTrigger>
          <TabsTrigger value="historico">Histórico</TabsTrigger>
          <TabsTrigger value="anexos">Anexos</TabsTrigger>
        </TabsList>
        <TabsContent value="itens">
          <AbaItens pedido={pedido} />
        </TabsContent>
        <TabsContent value="arte" className="space-y-4">
          {pedido.itens.map((item) => (
            <ArteDoItem key={item.id} pedido={pedido} item={item} />
          ))}
        </TabsContent>
        <TabsContent value="producao">
          <AbaProducao pedido={pedido} />
        </TabsContent>
        <TabsContent value="financeiro">
          <AbaFinanceiro pedido={pedido} />
        </TabsContent>
        <TabsContent value="entrega">
          <AbaEntrega pedido={pedido} />
        </TabsContent>
        <TabsContent value="historico">
          <Card className="p-6">
            <Historico pedidoId={pedido.id} />
          </Card>
        </TabsContent>
        <TabsContent value="anexos">
          <Anexos entidade="pedido" entidadeId={pedido.id} modulo="pedidos" />
        </TabsContent>
      </Tabs>

      {dialogo === 'recibo' && <ReciboDialog pedidoId={pedido.id} numero={pedido.numero} onFechar={() => setDialogo(null)} />}
      {dialogo === 'editar' && !encerrado && <EditarPedidoDialog pedido={pedido} onFechar={() => setDialogo(null)} />}
      {dialogo === 'cancelar' && <CancelarPedidoDialog pedido={pedido} onFechar={() => setDialogo(null)} />}
    </>
  )
}
