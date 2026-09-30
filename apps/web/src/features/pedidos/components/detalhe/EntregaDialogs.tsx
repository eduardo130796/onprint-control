import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  TIPOS_ENTREGA,
  TIPO_ENTREGA_ROTULOS,
  entregaSchema,
  realizarEntregaSchema,
  type Entrega,
  type EntregaInput,
  type PedidoDetalhe,
  type RealizarEntregaInput,
} from '@onprint/shared'
import { entregasApi } from '@/api/producao'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useUsuariosOpcoes } from '@/features/producao/hooks'
import { localParaIso, paraDataHoraLocal } from '@/lib/datas'

type SaidaEntrega = z.output<typeof entregaSchema>
type SaidaRealizar = z.output<typeof realizarEntregaSchema>

const validarEntrega = zodResolver(entregaSchema)
const resolverEntrega: Resolver<EntregaInput, unknown, SaidaEntrega> = (v, c, o) => validarEntrega({ ...v, dataAgendada: localParaIso(v.dataAgendada) }, c, o)
const validarRealizar = zodResolver(realizarEntregaSchema)
const resolverRealizar: Resolver<RealizarEntregaInput, unknown, SaidaRealizar> = (v, c, o) =>
  validarRealizar({ ...v, dataRealizada: localParaIso(v.dataRealizada) }, c, o)

function useAtualizar() {
  const queryClient = useQueryClient()
  return () => Promise.all([queryClient.invalidateQueries({ queryKey: ['pedidos'] }), queryClient.invalidateQueries({ queryKey: ['entregas'] })])
}

/** Nova entrega/retirada/instalação (ou edição do agendamento). */
export function EntregaDialog({ pedido, entrega, onFechar }: { pedido: PedidoDetalhe; entrega?: Entrega; onFechar: () => void }) {
  const usuarios = useUsuariosOpcoes()
  const atualizar = useAtualizar()
  const form = useForm<EntregaInput, unknown, SaidaEntrega>({
    resolver: resolverEntrega,
    defaultValues: {
      tipo: entrega?.tipo ?? pedido.tipoEntrega,
      dataAgendada: entrega?.dataAgendada ? paraDataHoraLocal(new Date(entrega.dataAgendada)) : '',
      responsavelId: entrega?.responsavel?.id ?? '',
      endereco: entrega?.endereco ?? pedido.enderecoEntrega ?? '',
      observacao: entrega?.observacao ?? '',
    },
  })
  const tipo = form.watch('tipo')

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      if (entrega) await entregasApi.atualizar(entrega.id, d)
      else await entregasApi.criar(pedido.id, d)
      toast.success(entrega ? 'Entrega atualizada.' : 'Entrega registrada.')
      await atualizar()
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={entrega ? 'Editar entrega' : 'Nova entrega'} salvando={form.formState.isSubmitting} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="en-tipo" rotulo="Tipo">
          <Select id="en-tipo" {...form.register('tipo')}>
            {TIPOS_ENTREGA.map((t) => (
              <option key={t} value={t}>
                {TIPO_ENTREGA_ROTULOS[t]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="en-data" rotulo="Data agendada" erro={form.formState.errors.dataAgendada?.message}>
          <Input id="en-data" type="datetime-local" {...form.register('dataAgendada')} />
        </CampoFormulario>
        <CampoFormulario id="en-resp" rotulo="Responsável">
          <Select id="en-resp" {...form.register('responsavelId')}>
            <option value="">—</option>
            {usuarios.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
      </div>
      {tipo !== 'retirada' && (
        <CampoFormulario id="en-end" rotulo="Endereço">
          <Textarea id="en-end" rows={2} {...form.register('endereco')} />
        </CampoFormulario>
      )}
      <CampoFormulario id="en-obs" rotulo="Observação">
        <Textarea id="en-obs" rows={2} {...form.register('observacao')} />
      </CampoFormulario>
    </FormDialog>
  )
}

/** Confirma a entrega (quem recebeu) — o pedido vai para "Entregue". */
export function RealizarEntregaDialog({ entrega, onFechar }: { entrega: Entrega; onFechar: () => void }) {
  const atualizar = useAtualizar()
  const form = useForm<RealizarEntregaInput, unknown, SaidaRealizar>({
    resolver: resolverRealizar,
    defaultValues: { recebidoPor: '', dataRealizada: paraDataHoraLocal(new Date()), observacao: '' },
  })
  const { errors } = form.formState

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await entregasApi.realizar(entrega.id, d)
      toast.success('Entrega concluída. Pedido entregue!')
      await atualizar()
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo="Confirmar entrega" salvando={form.formState.isSubmitting} onSubmit={onSubmit} textoSalvar="Confirmar">
      <CampoFormulario id="re-quem" rotulo="Recebido por *" erro={errors.recebidoPor?.message}>
        <Input id="re-quem" autoFocus {...form.register('recebidoPor')} />
      </CampoFormulario>
      <CampoFormulario id="re-data" rotulo="Data e hora" erro={errors.dataRealizada?.message}>
        <Input id="re-data" type="datetime-local" {...form.register('dataRealizada')} />
      </CampoFormulario>
      <CampoFormulario id="re-obs" rotulo="Observação">
        <Textarea id="re-obs" rows={2} {...form.register('observacao')} />
      </CampoFormulario>
    </FormDialog>
  )
}
