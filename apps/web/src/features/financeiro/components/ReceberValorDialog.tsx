import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
import { distribuirValor, formatarMoeda, hojeISO, normalizarDecimal, receberPedidoSchema, type ContaReceberResumo, type ReceberPedidoInput } from '@onprint/shared'
import { receberPedidoApi } from '@/api/financeiro'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput } from '@/components/shared/inputs'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { decimalParaInput } from '@/lib/mascaras'
import { useContasFinanceiras, useFormasPagamento } from '../hooks'

type Saida = z.output<typeof receberPedidoSchema>

/** Parcelas em aberto, da mais antiga à mais nova (mesma ordem que a API usa para abater). */
function parcelasEmAberto(contas: ContaReceberResumo[]) {
  return contas
    .filter((c) => ['aberto', 'parcial', 'vencido'].includes(c.status))
    .sort((a, b) => a.vencimento.localeCompare(b.vencimento) || a.parcela - b.parcela)
    .map((c) => ({ ...c, saldo: (Number(c.valor) - Number(c.valorPago ?? 0)).toFixed(2) }))
}

/** Valor avulso do pedido: digita quanto o cliente pagou e o sistema abate nas parcelas em aberto. */
export function ReceberValorDialog({ pedidoId, numero, contas, onFechar }: { pedidoId: string; numero: string; contas: ContaReceberResumo[]; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const formas = useFormasPagamento()
  const contasFin = useContasFinanceiras()
  const abertas = parcelasEmAberto(contas)
  const totalAberto = abertas.reduce((s, c) => s + Number(c.saldo), 0).toFixed(2)
  const form = useForm<ReceberPedidoInput, unknown, Saida>({
    resolver: zodResolver(receberPedidoSchema),
    defaultValues: { valorRecebido: decimalParaInput(totalAberto), data: hojeISO(), formaPagamentoId: '', contaFinanceiraId: '', observacao: '' },
  })
  const { errors, isSubmitting } = form.formState
  const v = form.watch()
  const previa = distribuirValor(abertas, normalizarDecimal(String(v.valorRecebido ?? '0')))
  const formaEscolhida = formas.data?.find((f) => f.id === v.formaPagamentoId)
  const rotulo = (id: string) => {
    const c = abertas.find((x) => x.id === id)
    return c?.descricao ?? ''
  }

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      const r = await receberPedidoApi(pedidoId, d)
      toast.success(`Recebimento registrado em ${r.parcelasAbatidas} parcela(s).`)
      await Promise.all(['financeiro', 'pedidos'].map((c) => queryClient.invalidateQueries({ queryKey: [c] })))
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog
      aberto
      onAbertoChange={(x) => !x && onFechar()}
      titulo="Receber valor do pedido"
      descricao={`${numero} · em aberto ${formatarMoeda(totalAberto)}. O valor abate nas parcelas, da mais antiga para a mais nova.`}
      salvando={isSubmitting}
      onSubmit={onSubmit}
      textoSalvar="Confirmar recebimento"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="rv-valor" rotulo="Valor recebido *" erro={errors.valorRecebido?.message}>
          <MoneyInput id="rv-valor" autoFocus {...form.register('valorRecebido')} />
        </CampoFormulario>
        <CampoFormulario id="rv-data" rotulo="Data *" erro={errors.data?.message}>
          <Input id="rv-data" type="date" {...form.register('data')} />
        </CampoFormulario>
        <CampoFormulario id="rv-forma" rotulo="Forma de pagamento *" erro={errors.formaPagamentoId?.message}>
          <Select id="rv-forma" {...form.register('formaPagamentoId')}>
            <option value="">Escolha…</option>
            {formas.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="rv-conta" rotulo="Conta">
          <Select id="rv-conta" {...form.register('contaFinanceiraId')}>
            <option value="">{formaEscolhida?.contaFinanceira ? `Conta da forma (${formaEscolhida.contaFinanceira.nome})` : 'Escolha…'}</option>
            {contasFin.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
      </div>
      <CampoFormulario id="rv-obs" rotulo="Observação">
        <Textarea id="rv-obs" rows={2} {...form.register('observacao')} />
      </CampoFormulario>
      <div className={previa.ok ? 'rounded-lg bg-fundo p-3 text-sm' : 'rounded-lg bg-coral/10 p-3 text-sm text-coral-escuro'}>
        {previa.ok ? (
          <ul className="space-y-0.5">
            {previa.partes.map((p) => (
              <li key={p.id} className="flex justify-between gap-3">
                <span>{rotulo(p.id)}</span>
                <span className="font-medium tabular-nums">{formatarMoeda(p.valor)}</span>
              </li>
            ))}
          </ul>
        ) : (
          previa.erro
        )}
      </div>
    </FormDialog>
  )
}
