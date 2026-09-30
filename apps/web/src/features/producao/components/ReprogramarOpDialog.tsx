import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import { PRIORIDADES, PRIORIDADE_ROTULOS, opAtualizacaoSchema, type OpAtualizacaoInput, type OrdemProducao } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useMutacao } from '@/hooks/useMutacao'
import { useMaquinasOpcoes, useUsuariosOpcoes } from '../hooks'

type Saida = z.output<typeof opAtualizacaoSchema>

/** Reprogramação da OP (máquina, responsável, prioridade e datas previstas) — usada na OP e no PCP. */
export function ReprogramarOpDialog({ op, onFechar }: { op: OrdemProducao; onFechar: () => void }) {
  const maquinas = useMaquinasOpcoes()
  const usuarios = useUsuariosOpcoes()
  const form = useForm<OpAtualizacaoInput, unknown, Saida>({
    resolver: zodResolver(opAtualizacaoSchema),
    defaultValues: {
      maquinaId: op.maquinaId ?? '',
      responsavelId: op.responsavelId ?? '',
      prioridade: op.prioridade,
      dataInicioPrevista: op.dataInicioPrevista?.slice(0, 10) ?? '',
      dataFimPrevista: op.dataFimPrevista?.slice(0, 10) ?? '',
      observacoes: op.observacoes ?? '',
    },
  })
  const { errors } = form.formState
  const salvar = useMutacao(['ops', 'pcp', 'pedidos'], (d: Saida) => opsApi.atualizar(op.id, d))

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync(d)
      toast.success(`${op.numero} reprogramada.`)
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={`Reprogramar ${op.numero}`} descricao={op.item.descricao} salvando={salvar.isPending} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="op-maquina" rotulo="Máquina">
          <Select id="op-maquina" {...form.register('maquinaId')}>
            <option value="">Sem máquina</option>
            {maquinas.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="op-responsavel" rotulo="Responsável">
          <Select id="op-responsavel" {...form.register('responsavelId')}>
            <option value="">Ninguém</option>
            {usuarios.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="op-prioridade" rotulo="Prioridade">
          <Select id="op-prioridade" {...form.register('prioridade')}>
            {PRIORIDADES.map((p) => (
              <option key={p} value={p}>
                {PRIORIDADE_ROTULOS[p]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <div />
        <CampoFormulario id="op-inicio" rotulo="Início previsto" erro={errors.dataInicioPrevista?.message}>
          <Input id="op-inicio" type="date" {...form.register('dataInicioPrevista')} />
        </CampoFormulario>
        <CampoFormulario id="op-fim" rotulo="Término previsto" erro={errors.dataFimPrevista?.message}>
          <Input id="op-fim" type="date" {...form.register('dataFimPrevista')} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="op-obs" rotulo="Observações para a produção">
        <Textarea id="op-obs" rows={2} {...form.register('observacoes')} />
      </CampoFormulario>
    </FormDialog>
  )
}
