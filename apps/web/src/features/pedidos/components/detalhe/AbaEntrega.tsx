import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, FileCheck2, Pencil, Plus, Truck, Upload, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { STATUS_ENTREGA_ROTULOS, TIPO_ENTREGA_ROTULOS, formatarDataHora, type Entrega, type PedidoDetalhe } from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'
import { entregasApi } from '@/api/producao'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { EntregaDialog, RealizarEntregaDialog } from './EntregaDialogs'

const COR_STATUS: Record<Entrega['status'], string> = {
  pendente: 'bg-slate-100 text-slate-700',
  agendada: 'bg-sky-50 text-sky-800',
  realizada: 'bg-verde/10 text-green-800',
  cancelada: 'bg-coral/10 text-coral-escuro',
}

export function SeloEntrega({ status }: { status: Entrega['status'] }) {
  return <span className={cn('rounded-full px-2 py-0.5 text-xs font-medium', COR_STATUS[status])}>{STATUS_ENTREGA_ROTULOS[status]}</span>
}

/** Entregas do pedido: agendar, saída para entrega, confirmação com quem recebeu e comprovante. */
export function AbaEntrega({ pedido }: { pedido: PedidoDetalhe }) {
  const queryClient = useQueryClient()
  const [dialogo, setDialogo] = useState<{ tipo: 'nova' } | { tipo: 'editar' | 'realizar' | 'cancelar'; entrega: Entrega } | null>(null)
  const inputComprovante = useRef<HTMLInputElement>(null)
  const [comprovanteDe, setComprovanteDe] = useState<Entrega | null>(null)
  const encerrado = ['cancelado', 'entregue'].includes(pedido.status)
  const pronto = ['pronto', 'em_entrega'].includes(pedido.status)

  const atualizar = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['pedidos'] }), queryClient.invalidateQueries({ queryKey: ['entregas'] })])

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    try {
      await acao()
      toast.success(sucesso)
      await atualizar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function verComprovante(id: string) {
    try {
      window.open((await arquivosApi.urlTemporaria(id)).url, '_blank', 'noopener')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-3">
      {!encerrado && (
        <div className="flex justify-end">
          <Can modulo="pedidos" acao="editar">
            <Button onClick={() => setDialogo({ tipo: 'nova' })}>
              <Plus /> Nova entrega
            </Button>
          </Can>
        </div>
      )}
      {pedido.entregas.length === 0 ? (
        <Card>
          <EmptyState icone={Truck} titulo="Nenhuma entrega registrada" descricao={`Tipo previsto: ${TIPO_ENTREGA_ROTULOS[pedido.tipoEntrega]}.`} />
        </Card>
      ) : (
        pedido.entregas.map((e) => {
          const aberta = e.status === 'pendente' || e.status === 'agendada'
          return (
            <Card key={e.id} className="space-y-2 p-4 text-sm">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{TIPO_ENTREGA_ROTULOS[e.tipo]}</span>
                <SeloEntrega status={e.status} />
                {e.dataAgendada && <span className="text-texto-secundario">agendada para {formatarDataHora(e.dataAgendada)}</span>}
                {e.responsavel && <span className="text-texto-secundario">· {e.responsavel.nome}</span>}
              </div>
              {e.endereco && <p className="text-texto-secundario">{e.endereco}</p>}
              {e.observacao && <p>{e.observacao}</p>}
              {e.status === 'realizada' && (
                <p className="text-green-800">
                  Recebido por <strong>{e.recebidoPor}</strong> em {formatarDataHora(e.dataRealizada)}
                </p>
              )}
              <Can modulo="pedidos" acao="editar">
                <div className="flex flex-wrap gap-2 pt-1">
                  {aberta && pedido.status === 'pronto' && e.tipo !== 'retirada' && (
                    <Button size="sm" variant="outline" onClick={() => void executar(() => entregasApi.saiu(e.id), 'Pedido saiu para entrega.')}>
                      <Truck /> Saiu para entrega
                    </Button>
                  )}
                  {aberta && pronto && (
                    <Button size="sm" onClick={() => setDialogo({ tipo: 'realizar', entrega: e })}>
                      <CheckCircle2 /> Confirmar entrega
                    </Button>
                  )}
                  {aberta && (
                    <>
                      <Button size="sm" variant="ghost" onClick={() => setDialogo({ tipo: 'editar', entrega: e })}>
                        <Pencil /> Editar
                      </Button>
                      <Button size="sm" variant="ghost" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setDialogo({ tipo: 'cancelar', entrega: e })}>
                        <XCircle /> Cancelar
                      </Button>
                    </>
                  )}
                  {e.status === 'realizada' && !e.comprovanteId && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setComprovanteDe(e)
                        inputComprovante.current?.click()
                      }}
                    >
                      <Upload /> Anexar comprovante
                    </Button>
                  )}
                </div>
              </Can>
              {e.comprovanteId && (
                <Button size="sm" variant="link" className="h-auto p-0" onClick={() => void verComprovante(e.comprovanteId!)}>
                  <FileCheck2 /> Ver comprovante
                </Button>
              )}
            </Card>
          )
        })
      )}
      {!pronto && !encerrado && pedido.entregas.length > 0 && (
        <p className="text-xs text-texto-secundario">A confirmação da entrega fica disponível quando o pedido estiver pronto.</p>
      )}

      <input
        ref={inputComprovante}
        type="file"
        accept=".pdf,.png,.jpg,.jpeg"
        className="hidden"
        onChange={(ev) => {
          const arquivo = ev.target.files?.[0]
          ev.target.value = ''
          if (arquivo && comprovanteDe) void executar(() => entregasApi.enviarComprovante(comprovanteDe.id, arquivo), 'Comprovante anexado.')
        }}
      />
      {dialogo?.tipo === 'nova' && <EntregaDialog pedido={pedido} onFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'editar' && <EntregaDialog pedido={pedido} entrega={dialogo.entrega} onFechar={() => setDialogo(null)} />}
      {dialogo?.tipo === 'realizar' && <RealizarEntregaDialog entrega={dialogo.entrega} onFechar={() => setDialogo(null)} />}
      <ConfirmDialog
        aberto={dialogo?.tipo === 'cancelar'}
        onAbertoChange={(v) => !v && setDialogo(null)}
        titulo="Cancelar esta entrega?"
        descricao="O agendamento será cancelado. O pedido continua como está."
        perigoso
        textoConfirmar="Cancelar entrega"
        onConfirmar={async () => {
          if (dialogo?.tipo !== 'cancelar') return
          await entregasApi.cancelar(dialogo.entrega.id)
          await atualizar()
        }}
      />
    </div>
  )
}
