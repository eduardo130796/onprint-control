import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import type { z } from 'zod'
import {
  TIPOS_CONTA_FINANCEIRA,
  TIPOS_FORMA_PAGAMENTO,
  TIPO_CONTA_FINANCEIRA_ROTULOS,
  TIPO_FORMA_PAGAMENTO_ROTULOS,
  categoriaFinanceiraSchema,
  contaFinanceiraSchema,
  formaPagamentoSchema,
  type CategoriaFinanceira,
  type CategoriaFinanceiraInput,
  type ContaFinanceira,
  type ContaFinanceiraInput,
  type FormaPagamento,
  type FormaPagamentoInput,
} from '@onprint/shared'
import { categoriasFinanceirasApi, contasFinanceirasApi, formasApi } from '@/api/financeiro'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useMutacao } from '@/hooks/useMutacao'
import { decimalParaInput } from '@/lib/mascaras'
import { useCategoriasFinanceiras, useContasFinanceiras } from '../hooks'

function useSalvar<T>(chave: string, salvar: (d: T) => Promise<unknown>, onFechar: () => void) {
  const m = useMutacao([chave], salvar)
  return {
    pendente: m.isPending,
    enviar: async (d: T) => {
      try {
        await m.mutateAsync(d)
        toast.success('Salvo.')
        onFechar()
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
  }
}

export function FormaDialog({ forma, onFechar }: { forma?: FormaPagamento; onFechar: () => void }) {
  const contas = useContasFinanceiras()
  const form = useForm<FormaPagamentoInput, unknown, z.output<typeof formaPagamentoSchema>>({
    resolver: zodResolver(formaPagamentoSchema),
    defaultValues: {
      nome: forma?.nome ?? '',
      tipo: forma?.tipo ?? 'pix',
      taxaPercentual: decimalParaInput(forma?.taxaPercentual ?? '0'),
      diasRecebimento: forma?.diasRecebimento ?? 0,
      permiteParcelamento: forma?.permiteParcelamento ?? false,
      maxParcelas: forma?.maxParcelas ?? 1,
      contaFinanceiraId: forma?.contaFinanceiraId ?? '',
      ativo: forma?.ativo ?? true,
    },
  })
  const { errors } = form.formState
  const s = useSalvar('financeiro-formas', (d: z.output<typeof formaPagamentoSchema>) => (forma ? formasApi.atualizar(forma.id, d) : formasApi.criar(d)), onFechar)
  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={forma ? 'Editar forma de pagamento' : 'Nova forma de pagamento'} salvando={s.pendente} onSubmit={form.handleSubmit(s.enviar)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="fp-nome" rotulo="Nome *" erro={errors.nome?.message}>
          <Input id="fp-nome" autoFocus {...form.register('nome')} />
        </CampoFormulario>
        <CampoFormulario id="fp-tipo" rotulo="Tipo">
          <Select id="fp-tipo" {...form.register('tipo')}>
            {TIPOS_FORMA_PAGAMENTO.map((t) => (
              <option key={t} value={t}>
                {TIPO_FORMA_PAGAMENTO_ROTULOS[t]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="fp-taxa" rotulo="Taxa da operadora" erro={errors.taxaPercentual?.message}>
          <NumberInput id="fp-taxa" sufixo="%" {...form.register('taxaPercentual')} />
        </CampoFormulario>
        <CampoFormulario id="fp-dias" rotulo="Dias para receber">
          <Input id="fp-dias" type="number" min={0} {...form.register('diasRecebimento')} />
        </CampoFormulario>
        <CampoFormulario id="fp-conta" rotulo="Conta que recebe">
          <Select id="fp-conta" {...form.register('contaFinanceiraId')}>
            <option value="">Escolher na hora</option>
            {contas.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="fp-parc" rotulo="Máximo de parcelas" erro={errors.maxParcelas?.message}>
          <Input id="fp-parc" type="number" min={1} max={24} {...form.register('maxParcelas')} />
        </CampoFormulario>
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        <label className="flex items-center gap-2">
          <Checkbox {...form.register('permiteParcelamento')} /> Permite parcelamento
        </label>
        <label className="flex items-center gap-2">
          <Checkbox {...form.register('ativo')} /> Ativa
        </label>
      </div>
    </FormDialog>
  )
}

export function ContaDialog({ conta, onFechar }: { conta?: ContaFinanceira; onFechar: () => void }) {
  const form = useForm<ContaFinanceiraInput, unknown, z.output<typeof contaFinanceiraSchema>>({
    resolver: zodResolver(contaFinanceiraSchema),
    defaultValues: {
      nome: conta?.nome ?? '',
      tipo: conta?.tipo ?? 'banco',
      banco: conta?.banco ?? '',
      agencia: conta?.agencia ?? '',
      numeroConta: conta?.numeroConta ?? '',
      saldoInicial: decimalParaInput(conta?.saldoInicial ?? '0'),
      ativo: conta?.ativo ?? true,
    },
  })
  const { errors } = form.formState
  const s = useSalvar('financeiro-contas', (d: z.output<typeof contaFinanceiraSchema>) => (conta ? contasFinanceirasApi.atualizar(conta.id, d) : contasFinanceirasApi.criar(d)), onFechar)
  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={conta ? 'Editar conta' : 'Nova conta financeira'} salvando={s.pendente} onSubmit={form.handleSubmit(s.enviar)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="cf-nome" rotulo="Nome *" erro={errors.nome?.message}>
          <Input id="cf-nome" autoFocus {...form.register('nome')} />
        </CampoFormulario>
        <CampoFormulario id="cf-tipo" rotulo="Tipo">
          <Select id="cf-tipo" {...form.register('tipo')}>
            {TIPOS_CONTA_FINANCEIRA.map((t) => (
              <option key={t} value={t}>
                {TIPO_CONTA_FINANCEIRA_ROTULOS[t]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="cf-banco" rotulo="Banco">
          <Input id="cf-banco" {...form.register('banco')} />
        </CampoFormulario>
        <CampoFormulario id="cf-ag" rotulo="Agência / conta">
          <div className="flex gap-2">
            <Input id="cf-ag" placeholder="Agência" {...form.register('agencia')} />
            <Input placeholder="Conta" aria-label="Número da conta" {...form.register('numeroConta')} />
          </div>
        </CampoFormulario>
        <CampoFormulario id="cf-saldo" rotulo="Saldo inicial" erro={errors.saldoInicial?.message}>
          <MoneyInput id="cf-saldo" {...form.register('saldoInicial')} />
        </CampoFormulario>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Ativa
      </label>
    </FormDialog>
  )
}

export function CategoriaDialog({ categoria, onFechar }: { categoria?: CategoriaFinanceira; onFechar: () => void }) {
  const form = useForm<CategoriaFinanceiraInput, unknown, z.output<typeof categoriaFinanceiraSchema>>({
    resolver: zodResolver(categoriaFinanceiraSchema),
    defaultValues: { nome: categoria?.nome ?? '', tipo: categoria?.tipo ?? 'despesa', paiId: categoria?.paiId ?? '', ativo: categoria?.ativo ?? true },
  })
  const tipo = form.watch('tipo')
  const pais = useCategoriasFinanceiras(tipo)
  const { errors } = form.formState
  const s = useSalvar('financeiro-categorias', (d: z.output<typeof categoriaFinanceiraSchema>) => (categoria ? categoriasFinanceirasApi.atualizar(categoria.id, d) : categoriasFinanceirasApi.criar(d)), onFechar)
  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={categoria ? 'Editar categoria' : 'Nova categoria'} salvando={s.pendente} onSubmit={form.handleSubmit(s.enviar)}>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="cat-nome" rotulo="Nome *" erro={errors.nome?.message}>
          <Input id="cat-nome" autoFocus {...form.register('nome')} />
        </CampoFormulario>
        <CampoFormulario id="cat-tipo" rotulo="Tipo">
          <Select id="cat-tipo" disabled={Boolean(categoria?.codigo)} {...form.register('tipo')}>
            <option value="receita">Receita</option>
            <option value="despesa">Despesa</option>
          </Select>
        </CampoFormulario>
      </div>
      <CampoFormulario id="cat-pai" rotulo="Dentro de">
        <Select id="cat-pai" {...form.register('paiId')}>
          <option value="">— (categoria principal)</option>
          {pais.data
            ?.filter((p) => !p.nome.includes('›') && p.id !== categoria?.id)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
        </Select>
      </CampoFormulario>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Ativa
      </label>
    </FormDialog>
  )
}
