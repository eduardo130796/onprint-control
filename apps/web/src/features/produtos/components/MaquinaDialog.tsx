import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { STATUS_MAQUINA, STATUS_MAQUINA_ROTULOS, maquinaSchema, type Maquina, type MaquinaInput } from '@onprint/shared'
import type { z } from 'zod'
import { maquinasApi } from '@/api/produtos'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { decimalParaInput } from '@/lib/mascaras'
import { useMutacao } from '../hooks'

type Saida = z.output<typeof maquinaSchema>

const decimalOuVazio = (v: string | null, casas: number) => (v ? decimalParaInput(v, casas) : '')

export function MaquinaDialog({ maquina, onFechar }: { maquina?: Maquina; onFechar: () => void }) {
  const form = useForm<MaquinaInput, unknown, Saida>({
    resolver: zodResolver(maquinaSchema),
    defaultValues: {
      nome: maquina?.nome ?? '',
      tipo: maquina?.tipo ?? '',
      larguraUtil: decimalOuVazio(maquina?.larguraUtil ?? null, 3),
      velocidadeM2Hora: decimalOuVazio(maquina?.velocidadeM2Hora ?? null, 2),
      custoHora: decimalParaInput(maquina?.custoHora ?? 0),
      status: maquina?.status ?? 'ativa',
      observacoes: maquina?.observacoes ?? '',
      ativo: maquina?.ativo ?? true,
    },
  })
  const { errors } = form.formState
  const salvar = useMutacao(['maquinas', 'produtos'], (d: Saida) => (maquina ? maquinasApi.atualizar(maquina.id, d) : maquinasApi.criar(d)))

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync(d)
      toast.success('Máquina salva.')
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={maquina ? 'Editar máquina' : 'Nova máquina'} salvando={salvar.isPending} onSubmit={onSubmit}>
      <CampoFormulario id="mq-nome" rotulo="Nome *" erro={errors.nome?.message}>
        <Input id="mq-nome" autoFocus {...form.register('nome')} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="mq-tipo" rotulo="Tipo">
          <Input id="mq-tipo" placeholder="Ex.: impressora de grande formato" {...form.register('tipo')} />
        </CampoFormulario>
        <CampoFormulario id="mq-status" rotulo="Status">
          <Select id="mq-status" {...form.register('status')}>
            {STATUS_MAQUINA.map((s) => (
              <option key={s} value={s}>
                {STATUS_MAQUINA_ROTULOS[s]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="mq-largura" rotulo="Largura útil" erro={errors.larguraUtil?.message}>
          <NumberInput id="mq-largura" casas={3} sufixo="m" {...form.register('larguraUtil')} />
        </CampoFormulario>
        <CampoFormulario id="mq-velocidade" rotulo="Velocidade" erro={errors.velocidadeM2Hora?.message}>
          <NumberInput id="mq-velocidade" sufixo="m²/h" className="pr-16" {...form.register('velocidadeM2Hora')} />
        </CampoFormulario>
        <CampoFormulario id="mq-custo" rotulo="Custo por hora" erro={errors.custoHora?.message}>
          <MoneyInput id="mq-custo" {...form.register('custoHora')} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="mq-obs" rotulo="Observações">
        <Textarea id="mq-obs" rows={2} {...form.register('observacoes')} />
      </CampoFormulario>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Ativa no cadastro
      </label>
    </FormDialog>
  )
}
