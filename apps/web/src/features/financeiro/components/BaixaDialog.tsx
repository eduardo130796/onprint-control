import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { z } from 'zod'
import { aplicarBaixa, baixaSchema, formatarMoeda, hojeISO, normalizarDecimal, type BaixaInput } from '@onprint/shared'
import { titulosApi, type TipoTitulo } from '@/api/financeiro'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput } from '@/components/shared/inputs'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { decimalParaInput } from '@/lib/mascaras'
import { useContasFinanceiras, useFormasPagamento } from '../hooks'

type Saida = z.output<typeof baixaSchema>

interface TituloParaBaixa {
  id: string
  descricao: string
  valor: string
  valorPago: string
  saldo: string
}

/** Baixa parcial ou total: valor pago + juros/multa (não abatem) e desconto (abate). */
export function BaixaDialog({ tipo, titulo, onFechar }: { tipo: TipoTitulo; titulo: TituloParaBaixa; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const formas = useFormasPagamento()
  const contas = useContasFinanceiras()
  const form = useForm<BaixaInput, unknown, Saida>({
    resolver: zodResolver(baixaSchema),
    defaultValues: { valorRecebido: decimalParaInput(titulo.saldo), juros: '0,00', multa: '0,00', desconto: '0,00', data: hojeISO(), formaPagamentoId: '', contaFinanceiraId: '', observacao: '' },
  })
  const { errors, isSubmitting } = form.formState
  const v = form.watch()
  const numero = (x: unknown) => normalizarDecimal(String(x ?? '0'))
  const previa = aplicarBaixa(titulo, { valorRecebido: numero(v.valorRecebido), juros: numero(v.juros), multa: numero(v.multa), desconto: numero(v.desconto) })
  const formaEscolhida = formas.data?.find((f) => f.id === v.formaPagamentoId)

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await titulosApi(tipo).baixar(titulo.id, d)
      toast.success(tipo === 'receber' ? 'Recebimento registrado.' : 'Pagamento registrado.')
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
      titulo={tipo === 'receber' ? 'Registrar recebimento' : 'Registrar pagamento'}
      descricao={`${titulo.descricao} · saldo ${formatarMoeda(titulo.saldo)}`}
      salvando={isSubmitting}
      onSubmit={onSubmit}
      textoSalvar="Confirmar baixa"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="bx-valor" rotulo={tipo === 'receber' ? 'Valor recebido *' : 'Valor pago *'} erro={errors.valorRecebido?.message}>
          <MoneyInput id="bx-valor" autoFocus {...form.register('valorRecebido')} />
        </CampoFormulario>
        <CampoFormulario id="bx-data" rotulo="Data *" erro={errors.data?.message}>
          <Input id="bx-data" type="date" {...form.register('data')} />
        </CampoFormulario>
        <CampoFormulario id="bx-juros" rotulo="Juros">
          <MoneyInput id="bx-juros" {...form.register('juros')} />
        </CampoFormulario>
        <CampoFormulario id="bx-multa" rotulo="Multa">
          <MoneyInput id="bx-multa" {...form.register('multa')} />
        </CampoFormulario>
        <CampoFormulario id="bx-desconto" rotulo="Desconto">
          <MoneyInput id="bx-desconto" {...form.register('desconto')} />
        </CampoFormulario>
        <CampoFormulario id="bx-forma" rotulo="Forma de pagamento *" erro={errors.formaPagamentoId?.message}>
          <Select id="bx-forma" {...form.register('formaPagamentoId')}>
            <option value="">Escolha…</option>
            {formas.data?.map((f) => (
              <option key={f.id} value={f.id}>
                {f.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <div className="sm:col-span-2">
          <CampoFormulario id="bx-conta" rotulo="Conta">
            <Select id="bx-conta" {...form.register('contaFinanceiraId')}>
              <option value="">{formaEscolhida?.contaFinanceira ? `Conta da forma (${formaEscolhida.contaFinanceira.nome})` : 'Escolha…'}</option>
              {contas.data?.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </Select>
          </CampoFormulario>
        </div>
      </div>
      <CampoFormulario id="bx-obs" rotulo="Observação">
        <Textarea id="bx-obs" rows={2} {...form.register('observacao')} />
      </CampoFormulario>
      <p className={previa.ok ? 'rounded-lg bg-fundo p-3 text-sm' : 'rounded-lg bg-coral/10 p-3 text-sm text-coral-escuro'}>
        {previa.ok
          ? `Abate ${formatarMoeda(previa.principal)} do título${previa.quitado ? ' e quita a conta.' : `; restam ${formatarMoeda(previa.saldo)}.`}`
          : previa.erro}
        {previa.ok && formaEscolhida && Number(formaEscolhida.taxaPercentual) > 0 && tipo === 'receber' && (
          <span className="block text-xs text-texto-secundario">Taxa de {Number(formaEscolhida.taxaPercentual).toLocaleString('pt-BR')}% lançada como despesa.</span>
        )}
      </p>
    </FormDialog>
  )
}
