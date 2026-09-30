import { useState } from 'react'
import { useForm, type Resolver } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery } from '@tanstack/react-query'
import { Plus, Timer, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { z } from 'zod'
import { apontamentoSchema, formatarDataHora, type ApontamentoInput, type OrdemProducaoDetalhe } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { processosApi } from '@/api/produtos'
import { Can } from '@/components/shared/Can'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { FormDialog } from '@/components/shared/FormDialog'
import { NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useMutacao } from '@/hooks/useMutacao'
import { formatarDuracao, localParaIso, paraDataHoraLocal } from '@/lib/datas'
import { useMaquinasOpcoes } from '../hooks'

type Saida = z.output<typeof apontamentoSchema>
type Apontamento = OrdemProducaoDetalhe['apontamentos'][number]

/** Os campos datetime-local (horário do navegador) viram ISO com fuso antes da validação. */
const validar = zodResolver(apontamentoSchema)
const resolver: Resolver<ApontamentoInput, unknown, Saida> = (valores, contexto, opcoes) =>
  validar({ ...valores, inicio: localParaIso(valores.inicio), fim: localParaIso(valores.fim) }, contexto, opcoes)

function NovoApontamentoDialog({ op, onFechar }: { op: OrdemProducaoDetalhe; onFechar: () => void }) {
  const maquinas = useMaquinasOpcoes()
  const processos = useQuery({ queryKey: ['processos', 'opcoes'], queryFn: () => processosApi.listar({ pageSize: 100 }), select: (r) => r.data })
  const agora = new Date()
  const form = useForm<ApontamentoInput, unknown, Saida>({
    resolver,
    defaultValues: {
      processoId: '',
      maquinaId: op.maquinaId ?? '',
      inicio: paraDataHoraLocal(new Date(agora.getTime() - 3600_000)),
      fim: paraDataHoraLocal(agora),
      quantidadeProduzida: '0',
      perda: '0',
      observacao: '',
    },
  })
  const { errors } = form.formState
  const salvar = useMutacao(['ops'], (d: Saida) => opsApi.criarApontamento(op.id, d))

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync(d)
      toast.success('Apontamento registrado.')
      onFechar()
    } catch (erro) {
      toast.error((erro as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo="Novo apontamento" descricao={`${op.numero} · ${op.item.descricao}`} salvando={salvar.isPending} onSubmit={onSubmit}>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="ap-processo" rotulo="Processo">
          <Select id="ap-processo" {...form.register('processoId')}>
            <option value="">—</option>
            {processos.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="ap-maquina" rotulo="Máquina">
          <Select id="ap-maquina" {...form.register('maquinaId')}>
            <option value="">—</option>
            {maquinas.data?.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="ap-inicio" rotulo="Início *" erro={errors.inicio?.message}>
          <Input id="ap-inicio" type="datetime-local" {...form.register('inicio')} />
        </CampoFormulario>
        <CampoFormulario id="ap-fim" rotulo="Fim" erro={errors.fim?.message}>
          <Input id="ap-fim" type="datetime-local" {...form.register('fim')} />
        </CampoFormulario>
        <CampoFormulario id="ap-qtd" rotulo="Quantidade produzida" erro={errors.quantidadeProduzida?.message}>
          <NumberInput id="ap-qtd" casas={3} {...form.register('quantidadeProduzida')} />
        </CampoFormulario>
        <CampoFormulario id="ap-perda" rotulo="Perda" erro={errors.perda?.message}>
          <NumberInput id="ap-perda" casas={3} {...form.register('perda')} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="ap-obs" rotulo="Observação">
        <Textarea id="ap-obs" rows={2} {...form.register('observacao')} />
      </CampoFormulario>
    </FormDialog>
  )
}

/** Apontamentos de produção da OP: tempo, quantidade e perda por processo/máquina. */
export function Apontamentos({ op }: { op: OrdemProducaoDetalhe }) {
  const [novo, setNovo] = useState(false)
  const [removendo, setRemovendo] = useState<Apontamento | null>(null)
  const remover = useMutacao(['ops'], (id: string) => opsApi.removerApontamento(op.id, id))

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-base">Apontamentos</CardTitle>
        <Can modulo="producao" acao="editar">
          <Button size="sm" variant="outline" onClick={() => setNovo(true)}>
            <Plus /> Apontar
          </Button>
        </Can>
      </CardHeader>
      <CardContent>
        {op.apontamentos.length === 0 ? (
          <EmptyState icone={Timer} titulo="Nenhum apontamento" className="py-6" />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {op.apontamentos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5">
                <span className="font-medium">{a.processo?.nome ?? a.maquina?.nome ?? 'Produção'}</span>
                <span className="text-texto-secundario">
                  {formatarDataHora(a.inicio)}
                  {a.fim && ` · ${formatarDuracao((new Date(a.fim).getTime() - new Date(a.inicio).getTime()) / 1000)}`}
                </span>
                <span>{Number(a.quantidadeProduzida).toLocaleString('pt-BR')} produzidos</span>
                {Number(a.perda) > 0 && <span className="text-coral-escuro">{Number(a.perda).toLocaleString('pt-BR')} de perda</span>}
                <span className="text-xs text-texto-secundario">{a.operador?.nome}</span>
                <Can modulo="producao" acao="editar">
                  <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label="Remover apontamento" onClick={() => setRemovendo(a)}>
                    <Trash2 className="text-coral-escuro" />
                  </Button>
                </Can>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {novo && <NovoApontamentoDialog op={op} onFechar={() => setNovo(false)} />}
      <ConfirmDialog
        aberto={Boolean(removendo)}
        onAbertoChange={(v) => !v && setRemovendo(null)}
        titulo="Remover apontamento?"
        descricao="O registro de tempo e quantidade será apagado."
        perigoso
        textoConfirmar="Remover"
        onConfirmar={() => remover.mutateAsync(removendo!.id)}
      />
    </Card>
  )
}
