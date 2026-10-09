import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useQuery } from '@tanstack/react-query'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ColumnDef } from '@tanstack/react-table'
import { toast } from 'sonner'
import {
  TIPOS_COBRANCA,
  TIPO_COBRANCA_ROTULOS,
  acabamentoSchema,
  formatarMoeda,
  type Acabamento,
  type AcabamentoInput,
} from '@onprint/shared'
import type { z } from 'zod'
import { acabamentosApi } from '@/api/produtos'
import { PageHeader } from '@/components/layout/PageHeader'
import { BadgeInativo, CadastroLista } from '@/components/shared/CadastroLista'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/usePermission'
import { decimalParaInput } from '@/lib/mascaras'
import { MateriaisAcabamento } from '../components/acabamento/MateriaisAcabamento'
import { materiaisParaApi, novaLinhaMaterial, type MaterialAcabamentoLinha } from '../components/acabamento/linhasMaterial'
import { numero, paraCampo } from '../custos'
import { useMutacao } from '../hooks'

type Saida = z.output<typeof acabamentoSchema>

/** Exemplo da base de cobrança, para o usuário entender cada tipo. */
const EXEMPLOS: Record<string, string> = {
  fixo: 'Cobrado uma vez por item do orçamento (ex.: criação de arte).',
  por_unidade: 'Multiplicado pela quantidade de peças (ex.: embalagem).',
  por_m2: 'Multiplicado pela área total em m² (ex.: laminação).',
  por_metro_linear: 'Multiplicado pela largura × quantidade (ex.: bastão no topo do banner).',
  por_perimetro: 'Multiplicado pelo perímetro 2 × (L + A) × quantidade (ex.: ilhós, bainha).',
}

const linhasDoAcabamento = (a: Acabamento): MaterialAcabamentoLinha[] =>
  (a.materiais ?? []).map((m) => ({
    ...novaLinhaMaterial(),
    insumoId: m.insumoId,
    nome: m.nome,
    unidade: m.unidade,
    custoUnitario: m.custoUnitario ?? '0',
    quantidade: paraCampo(m.quantidade),
    perdaPercentual: Number(m.perdaPercentual) > 0 ? paraCampo(m.perdaPercentual, 2) : '',
  }))

function AcabamentoDialog({ acabamento, onFechar }: { acabamento?: Acabamento; onFechar: () => void }) {
  const podeCusto = usePermission('produtos', 'editar')
  // Materiais vêm do detalhe (a lista pode não trazê-los); só são enviados se a pessoa mexer (ausente = API mantém)
  const detalhe = useQuery({ queryKey: ['acabamentos', 'detalhe', acabamento?.id], queryFn: () => acabamentosApi.obter(acabamento!.id), enabled: Boolean(acabamento) })
  const [materiais, setMateriais] = useState<MaterialAcabamentoLinha[] | null>(null)
  const linhasMateriais = materiais ?? (acabamento ? (detalhe.data ? linhasDoAcabamento(detalhe.data) : null) : [])
  const mexeuMateriais = materiais !== null
  const form = useForm<AcabamentoInput, unknown, Saida>({
    resolver: zodResolver(acabamentoSchema),
    defaultValues: {
      nome: acabamento?.nome ?? '',
      descricao: acabamento?.descricao ?? '',
      tipoCobranca: acabamento?.tipoCobranca ?? 'por_unidade',
      valor: decimalParaInput(acabamento?.valor ?? 0),
      custo: decimalParaInput(acabamento?.custo ?? 0),
      prazoAdicionalDias: String(acabamento?.prazoAdicionalDias ?? 0),
      ativo: acabamento?.ativo ?? true,
    },
  })
  const { errors } = form.formState
  const tipo = form.watch('tipoCobranca')
  const custoManual = form.watch('custo')
  const salvar = useMutacao(['acabamentos'], (d: Saida) => (acabamento ? acabamentosApi.atualizar(acabamento.id, d) : acabamentosApi.criar(d)))

  const onSubmit = form.handleSubmit(async (d) => {
    const linhas = linhasMateriais ?? []
    if (linhas.some((l) => l.insumoId && numero(l.quantidade) <= 0)) return void toast.error('Informe quanto vai de cada material.')
    try {
      await salvar.mutateAsync(mexeuMateriais || !acabamento ? { ...d, materiais: materiaisParaApi(linhas) } : d)
      toast.success('Acabamento salvo.')
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto largo onAbertoChange={(v) => !v && onFechar()} titulo={acabamento ? 'Editar acabamento' : 'Novo acabamento'} salvando={salvar.isPending} onSubmit={onSubmit}>
      <CampoFormulario id="ac-nome" rotulo="Nome *" erro={errors.nome?.message}>
        <Input id="ac-nome" autoFocus {...form.register('nome')} />
      </CampoFormulario>
      <CampoFormulario id="ac-tipo" rotulo="Forma de cobrança">
        <Select id="ac-tipo" {...form.register('tipoCobranca')}>
          {TIPOS_COBRANCA.map((t) => (
            <option key={t} value={t}>
              {TIPO_COBRANCA_ROTULOS[t]}
            </option>
          ))}
        </Select>
      </CampoFormulario>
      <p className="-mt-2 text-xs text-texto-secundario">{EXEMPLOS[String(tipo)]}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <CampoFormulario id="ac-valor" rotulo="Valor de venda *" erro={errors.valor?.message}>
          <MoneyInput id="ac-valor" {...form.register('valor')} />
        </CampoFormulario>
        {podeCusto && (
          <CampoFormulario id="ac-custo" rotulo="Custo" erro={errors.custo?.message}>
            <MoneyInput id="ac-custo" {...form.register('custo')} />
          </CampoFormulario>
        )}
        <CampoFormulario id="ac-prazo" rotulo="Prazo adicional" erro={errors.prazoAdicionalDias?.message}>
          <NumberInput id="ac-prazo" casas={0} sufixo="dias" {...form.register('prazoAdicionalDias')} />
        </CampoFormulario>
      </div>
      {linhasMateriais === null ? (
        detalhe.isError ? (
          <p className="rounded-2xl bg-fundo p-3 text-sm text-texto-secundario">Não foi possível carregar os materiais deste acabamento. Os que já estão cadastrados continuam como estão.</p>
        ) : (
          <Skeleton className="h-28 w-full rounded-2xl" />
        )
      ) : (
        <MateriaisAcabamento linhas={linhasMateriais} tipoCobranca={tipo ?? 'por_unidade'} custoManual={String(custoManual ?? '')} veCustos={podeCusto} onChange={setMateriais} />
      )}
      <CampoFormulario id="ac-descricao" rotulo="Descrição">
        <Textarea id="ac-descricao" rows={2} {...form.register('descricao')} />
      </CampoFormulario>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Ativo
      </label>
    </FormDialog>
  )
}

const colunas: ColumnDef<Acabamento, unknown>[] = [
  {
    id: 'nome',
    header: 'Acabamento',
    meta: { ordenavel: 'nome' },
    cell: ({ row: { original: a } }) => (
      <span className="font-medium">
        {a.nome}
        <BadgeInativo ativo={a.ativo} />
      </span>
    ),
  },
  { id: 'cobranca', header: 'Cobrança', cell: ({ row }) => TIPO_COBRANCA_ROTULOS[row.original.tipoCobranca] },
  { id: 'valor', header: 'Valor', meta: { ordenavel: 'valor' }, cell: ({ row }) => formatarMoeda(row.original.valor) },
  { id: 'prazo', header: 'Prazo extra', cell: ({ row }) => (row.original.prazoAdicionalDias ? `+${row.original.prazoAdicionalDias} dia(s)` : '—') },
]

export function AcabamentosPage() {
  return (
    <>
      <PageHeader titulo="Acabamentos" subtitulo="Ilhós, bainha, laminação, bastão… e como cada um é cobrado no orçamento." />
      <CadastroLista
        chave="acabamentos"
        modulo="produtos"
        rotuloNovo="Novo acabamento"
        caminhoNovo="/produtos/acabamentos/novo"
        api={acabamentosApi}
        colunas={colunas}
        csv={{
          nomeArquivo: 'acabamentos',
          colunas: [
            { titulo: 'Nome', valor: (a) => a.nome },
            { titulo: 'Cobrança', valor: (a) => TIPO_COBRANCA_ROTULOS[a.tipoCobranca] },
            { titulo: 'Valor', valor: (a) => a.valor.replace('.', ',') },
            { titulo: 'Prazo adicional (dias)', valor: (a) => a.prazoAdicionalDias },
          ],
        }}
        dialogo={(a, fechar) => <AcabamentoDialog acabamento={a} onFechar={fechar} />}
      />
    </>
  )
}
