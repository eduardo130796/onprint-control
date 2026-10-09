import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { processoSchema, type Processo, type ProcessoInput } from '@onprint/shared'
import type { z } from 'zod'
import { processosApi } from '@/api/produtos'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { decimalParaInput } from '@/lib/mascaras'
import { useMaquinasOpcoes, useMutacao } from '../hooks'

type Saida = z.output<typeof processoSchema>

export function ProcessoDialog({ processo, onFechar }: { processo?: Processo; onFechar: () => void }) {
  const maquinas = useMaquinasOpcoes()
  const form = useForm<ProcessoInput, unknown, Saida>({
    resolver: zodResolver(processoSchema),
    defaultValues: {
      nome: processo?.nome ?? '',
      descricao: processo?.descricao ?? '',
      maquinaPadraoId: processo?.maquinaPadraoId ?? '',
      tempoPadraoMinutos: processo?.tempoPadraoMinutos != null ? String(processo.tempoPadraoMinutos) : '',
      custoHora: decimalParaInput(processo?.custoHora ?? 0),
      ativo: processo?.ativo ?? true,
    },
  })
  const { errors } = form.formState
  const salvar = useMutacao(['processos', 'produtos'], (d: Saida) => (processo ? processosApi.atualizar(processo.id, d) : processosApi.criar(d)))

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync(d)
      toast.success('Processo salvo.')
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={processo ? 'Editar processo' : 'Novo processo'} salvando={salvar.isPending} onSubmit={onSubmit}>
      <CampoFormulario id="pr-nome" rotulo="Nome *" erro={errors.nome?.message}>
        <Input id="pr-nome" autoFocus placeholder="Ex.: Impressão digital, Corte, Laminação" {...form.register('nome')} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="pr-maquina" rotulo="Máquina padrão">
          <Select id="pr-maquina" {...form.register('maquinaPadraoId')}>
            <option value="">Nenhuma</option>
            {maquinas.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="pr-tempo" rotulo="Tempo padrão" erro={errors.tempoPadraoMinutos?.message}>
          <NumberInput id="pr-tempo" casas={0} sufixo="min" {...form.register('tempoPadraoMinutos')} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="pr-custo" rotulo="Custo da hora de mão de obra" erro={errors.custoHora?.message}>
        <MoneyInput id="pr-custo" {...form.register('custoHora')} />
      </CampoFormulario>
      <p className="-mt-2 text-xs text-texto-secundario">Usado na composição dos produtos quando a máquina não tem custo por hora (ex.: acabamento manual).</p>
      <CampoFormulario id="pr-desc" rotulo="Descrição">
        <Textarea id="pr-desc" rows={2} {...form.register('descricao')} />
      </CampoFormulario>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Ativo
      </label>
    </FormDialog>
  )
}
