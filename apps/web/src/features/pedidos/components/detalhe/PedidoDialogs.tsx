import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  PRIORIDADES,
  PRIORIDADE_ROTULOS,
  TIPOS_ENTREGA,
  TIPO_ENTREGA_ROTULOS,
  pedidoAtualizacaoSchema,
  type PedidoAtualizacaoInput,
  type PedidoDetalhe,
} from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'

type Saida = z.output<typeof pedidoAtualizacaoSchema>

/** Edita prazo, prioridade, entrega e observações (prazo e prioridade também vão para as OPs). */
export function EditarPedidoDialog({ pedido, onFechar }: { pedido: PedidoDetalhe; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const form = useForm<PedidoAtualizacaoInput, unknown, Saida>({
    resolver: zodResolver(pedidoAtualizacaoSchema),
    defaultValues: {
      dataPrevistaEntrega: pedido.dataPrevistaEntrega.slice(0, 10),
      prioridade: pedido.prioridade,
      tipoEntrega: pedido.tipoEntrega,
      enderecoEntrega: pedido.enderecoEntrega ?? '',
      observacoes: pedido.observacoes ?? '',
      observacoesInternas: pedido.observacoesInternas ?? '',
    },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await pedidosApi.atualizar(pedido.id, d)
      toast.success('Pedido atualizado.')
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['pedidos'] }), queryClient.invalidateQueries({ queryKey: ['ops'] })])
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={`Editar ${pedido.numero}`} salvando={isSubmitting} onSubmit={onSubmit} largo>
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoFormulario id="pe-data" rotulo="Entrega prevista *" erro={errors.dataPrevistaEntrega?.message}>
          <Input id="pe-data" type="date" {...form.register('dataPrevistaEntrega')} />
        </CampoFormulario>
        <CampoFormulario id="pe-prioridade" rotulo="Prioridade">
          <Select id="pe-prioridade" {...form.register('prioridade')}>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_ROTULOS[p]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="pe-tipo" rotulo="Entrega">
          <Select id="pe-tipo" {...form.register('tipoEntrega')}>
            {TIPOS_ENTREGA.map((t) => (
              <option key={t} value={t}>
                {TIPO_ENTREGA_ROTULOS[t]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
      </div>
      <CampoFormulario id="pe-end" rotulo="Endereço de entrega">
        <Textarea id="pe-end" rows={2} {...form.register('enderecoEntrega')} />
      </CampoFormulario>
      <CampoFormulario id="pe-obs" rotulo="Observações (aparecem para o cliente)">
        <Textarea id="pe-obs" rows={2} {...form.register('observacoes')} />
      </CampoFormulario>
      <CampoFormulario id="pe-obsi" rotulo="Observações internas">
        <Textarea id="pe-obsi" rows={2} {...form.register('observacoesInternas')} />
      </CampoFormulario>
    </FormDialog>
  )
}

/** Cancelamento com motivo: cancela títulos em aberto, comissão prevista, OPs e entregas pendentes. */
export function CancelarPedidoDialog({ pedido, onFechar }: { pedido: PedidoDetalhe; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const [motivo, setMotivo] = useState('')
  const [estornar, setEstornar] = useState(false)
  const [salvando, setSalvando] = useState(false)
  const valido = motivo.trim().length >= 5
  // Só faz sentido oferecer o estorno se alguma OP já foi concluída (houve baixa de insumos)
  const houveConsumo = pedido.itens.some((i) => i.ordensProducao.some((o) => o.etapaAtual === 'concluido'))

  async function cancelar(e: React.FormEvent) {
    e.preventDefault()
    if (!valido) return
    setSalvando(true)
    try {
      await pedidosApi.cancelar(pedido.id, motivo.trim(), estornar)
      toast.success(`${pedido.numero} cancelado.`)
      await Promise.all(['pedidos', 'ops', 'pcp', 'entregas', 'estoque'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
      onFechar()
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo={`Cancelar ${pedido.numero}?`}
      descricao="As contas em aberto e a comissão prevista serão canceladas, as OPs saem da produção e as entregas pendentes são canceladas. Não dá para desfazer."
      salvando={salvando}
      onSubmit={(e) => void cancelar(e)}
      textoSalvar="Cancelar pedido"
    >
      <CampoFormulario id="cancelar-motivo" rotulo="Motivo *" erro={motivo && !valido ? 'Explique o motivo do cancelamento.' : undefined}>
        <Textarea id="cancelar-motivo" autoFocus value={motivo} onChange={(e) => setMotivo(e.target.value)} />
      </CampoFormulario>
      {houveConsumo && (
        <label className="flex items-start gap-2 rounded-lg bg-fundo p-3 text-sm">
          <Checkbox checked={estornar} onChange={(e) => setEstornar(e.target.checked)} className="mt-0.5" />
          <span>
            Devolver ao estoque os insumos já baixados pela produção
            <span className="block text-xs text-texto-secundario">Marque só se o material não foi usado de fato (ex.: peça reaproveitável).</span>
          </span>
        </label>
      )}
    </FormDialog>
  )
}
