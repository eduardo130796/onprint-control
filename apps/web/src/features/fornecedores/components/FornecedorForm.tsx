import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { fornecedorSchema, type Fornecedor, type FornecedorInput } from '@onprint/shared'
import type { z } from 'zod'
import { fornecedoresApi } from '@/api/cadastros'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { BotaoBuscarCnpj } from '@/components/shared/BotaoBuscarCnpj'
import { CamposEndereco } from '@/components/shared/CamposEndereco'
import { CpfCnpjInput, NumberInput, PhoneInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useConsultaCnpj } from '@/hooks/useConsultaCnpj'
import { usePermission } from '@/hooks/usePermission'
import { mascaraCep, mascaraCpfCnpj, mascaraTelefone } from '@/lib/mascaras'
import { useMutacaoFornecedores } from '../hooks'

type Saida = z.output<typeof fornecedorSchema>

function valoresIniciais(f?: Fornecedor): FornecedorInput {
  return {
    tipoPessoa: f?.tipoPessoa ?? 'PJ',
    nome: f?.nome ?? '',
    fantasia: f?.fantasia ?? '',
    cpfCnpj: mascaraCpfCnpj(f?.cpfCnpj),
    ie: f?.ie ?? '',
    email: f?.email ?? '',
    telefone: mascaraTelefone(f?.telefone),
    whatsapp: mascaraTelefone(f?.whatsapp),
    contato: f?.contato ?? '',
    categoriaFornecimento: f?.categoriaFornecimento ?? '',
    prazoMedioDias: f?.prazoMedioDias ?? '',
    condicoesPagamento: f?.condicoesPagamento ?? '',
    cep: mascaraCep(f?.cep),
    logradouro: f?.logradouro ?? '',
    numero: f?.numero ?? '',
    complemento: f?.complemento ?? '',
    bairro: f?.bairro ?? '',
    cidade: f?.cidade ?? '',
    uf: f?.uf ?? '',
    observacoes: f?.observacoes ?? '',
  }
}

export function FornecedorForm({ fornecedor, onSalvo }: { fornecedor?: Fornecedor; onSalvo: (f: Fornecedor) => void }) {
  const podeSalvar = usePermission('fornecedores', fornecedor ? 'editar' : 'criar')
  const form = useForm<FornecedorInput, unknown, Saida>({ resolver: zodResolver(fornecedorSchema), defaultValues: valoresIniciais(fornecedor) })
  const { errors, isDirty } = form.formState
  const salvar = useMutacaoFornecedores((dados: Saida) =>
    fornecedor ? fornecedoresApi.atualizar(fornecedor.id, dados) : fornecedoresApi.criar(dados),
  )

  const consultaCnpj = useConsultaCnpj({
    form,
    campoDocumento: 'cpfCnpj',
    campos: { razaoSocial: 'nome', nomeFantasia: 'fantasia', email: 'email', telefone: 'telefone', ie: 'ie' },
    enderecoNoFormulario: true,
    aoEncontrar: () => {
      if (form.getValues('tipoPessoa') !== 'PJ') form.setValue('tipoPessoa', 'PJ', { shouldDirty: true })
    },
  })

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      const salvo = await salvar.mutateAsync(dados)
      form.reset(valoresIniciais(salvo))
      toast.success(fornecedor ? 'Fornecedor atualizado.' : 'Fornecedor cadastrado.')
      onSalvo(salvo)
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  const r = form.register
  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!podeSalvar || salvar.isPending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Dados do fornecedor</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <CampoFormulario id="for-tipo" rotulo="Tipo">
                <Select id="for-tipo" {...r('tipoPessoa')}>
                  <option value="PJ">Pessoa jurídica</option>
                  <option value="PF">Pessoa física</option>
                </Select>
              </CampoFormulario>
            </div>
            <div className="md:col-span-4">
              <CampoFormulario id="for-nome" rotulo="Nome / razão social *" erro={errors.nome?.message}>
                <Input id="for-nome" aria-invalid={Boolean(errors.nome)} {...r('nome')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="for-fantasia" rotulo="Nome fantasia">
                <Input id="for-fantasia" {...r('fantasia')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="for-doc" rotulo="CPF/CNPJ" erro={errors.cpfCnpj?.message} acao={<BotaoBuscarCnpj consulta={consultaCnpj} />}>
                <CpfCnpjInput id="for-doc" aria-invalid={Boolean(errors.cpfCnpj)} {...r('cpfCnpj')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="for-ie" rotulo="Inscrição estadual">
                <Input id="for-ie" {...r('ie')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="for-contato" rotulo="Pessoa de contato">
                <Input id="for-contato" {...r('contato')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="for-whatsapp" rotulo="WhatsApp" erro={errors.whatsapp?.message}>
                <PhoneInput id="for-whatsapp" {...r('whatsapp')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="for-telefone" rotulo="Telefone" erro={errors.telefone?.message}>
                <PhoneInput id="for-telefone" {...r('telefone')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-3">
              <CampoFormulario id="for-email" rotulo="E-mail" erro={errors.email?.message}>
                <Input id="for-email" type="email" {...r('email')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-3">
              <CampoFormulario id="for-categoria" rotulo="O que fornece">
                <Input id="for-categoria" placeholder="Ex.: lonas e vinis, tintas, ACM" {...r('categoriaFornecimento')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="for-prazo" rotulo="Prazo médio de entrega" erro={errors.prazoMedioDias?.message}>
                <NumberInput id="for-prazo" casas={0} sufixo="dias" {...r('prazoMedioDias')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-4">
              <CampoFormulario id="for-condicoes" rotulo="Condições de pagamento">
                <Input id="for-condicoes" placeholder="Ex.: 28 dias no boleto" {...r('condicoesPagamento')} />
              </CampoFormulario>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Endereço</CardTitle>
          </CardHeader>
          <CardContent>
            <CamposEndereco prefixo="for" register={form.register} errors={errors} setValue={form.setValue} />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <CampoFormulario id="for-obs" rotulo="Observações">
              <Textarea id="for-obs" {...r('observacoes')} />
            </CampoFormulario>
          </CardContent>
        </Card>
        {podeSalvar && (
          <div className="flex justify-end">
            <Button type="submit" disabled={salvar.isPending || (Boolean(fornecedor) && !isDirty)}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {fornecedor ? 'Salvar alterações' : 'Cadastrar fornecedor'}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}
