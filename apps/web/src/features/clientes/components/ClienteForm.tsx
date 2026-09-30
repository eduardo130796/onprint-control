import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  ORIGENS_CLIENTE,
  ORIGEM_ROTULOS,
  SITUACOES_CLIENTE,
  clienteSchema,
  type Cliente,
  type ClienteDados,
  type ClienteInput,
} from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { CpfCnpjInput, MoneyInput, PhoneInput } from '@/components/shared/inputs'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { TagsInput } from '@/components/shared/TagsInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { usePermission } from '@/hooks/usePermission'
import { decimalParaInput, mascaraCpfCnpj, mascaraTelefone } from '@/lib/mascaras'
import { useMutacaoClientes, useVendedores } from '../hooks'

function valoresIniciais(c?: Cliente): ClienteInput {
  return {
    tipoPessoa: c?.tipoPessoa ?? 'PF',
    nome: c?.nome ?? '',
    fantasia: c?.fantasia ?? '',
    cpfCnpj: mascaraCpfCnpj(c?.cpfCnpj),
    ie: c?.ie ?? '',
    email: c?.email ?? '',
    telefone: mascaraTelefone(c?.telefone),
    whatsapp: mascaraTelefone(c?.whatsapp),
    origem: c?.origem ?? '',
    situacao: c?.situacao ?? 'pre_cadastro',
    limiteCredito: decimalParaInput(c?.limiteCredito ?? 0),
    vendedorId: c?.vendedorId ?? '',
    observacoes: c?.observacoes ?? '',
    tags: c?.tags ?? [],
  }
}

interface ClienteFormProps {
  cliente?: Cliente
  onSalvo: (cliente: Cliente) => void
}

export function ClienteForm({ cliente, onSalvo }: ClienteFormProps) {
  const podeSalvar = usePermission('clientes', cliente ? 'editar' : 'criar')
  const vendedores = useVendedores()
  const { mapa } = useStatusConfig()
  const form = useForm<ClienteInput, unknown, ClienteDados>({
    resolver: zodResolver(clienteSchema),
    defaultValues: valoresIniciais(cliente),
  })
  const { errors, isDirty } = form.formState
  const tipo = form.watch('tipoPessoa')
  const salvar = useMutacaoClientes((dados: ClienteDados) =>
    cliente ? clientesApi.atualizar(cliente.id, dados) : clientesApi.criar(dados),
  )

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      const salvo = await salvar.mutateAsync(dados)
      form.reset(valoresIniciais(salvo))
      toast.success(cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      onSalvo(salvo)
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  const campo = (nome: keyof ClienteInput) => ({ id: `cli-${nome}`, 'aria-invalid': Boolean(errors[nome]) })

  return (
    <form onSubmit={onSubmit} noValidate>
      <fieldset disabled={!podeSalvar || salvar.isPending} className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Identificação</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-6">
            <div className="md:col-span-2">
              <CampoFormulario id="cli-tipoPessoa" rotulo="Tipo">
                <Select {...campo('tipoPessoa')} {...form.register('tipoPessoa')}>
                  <option value="PF">Pessoa física</option>
                  <option value="PJ">Pessoa jurídica</option>
                </Select>
              </CampoFormulario>
            </div>
            <div className="md:col-span-4">
              <CampoFormulario id="cli-nome" rotulo={tipo === 'PJ' ? 'Razão social *' : 'Nome *'} erro={errors.nome?.message}>
                <Input {...campo('nome')} {...form.register('nome')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="cli-fantasia" rotulo={tipo === 'PJ' ? 'Nome fantasia' : 'Apelido'}>
                <Input {...campo('fantasia')} {...form.register('fantasia')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="cli-cpfCnpj" rotulo={tipo === 'PJ' ? 'CNPJ' : 'CPF'} erro={errors.cpfCnpj?.message}>
                <CpfCnpjInput {...campo('cpfCnpj')} {...form.register('cpfCnpj')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="cli-ie" rotulo={tipo === 'PJ' ? 'Inscrição estadual' : 'RG'}>
                <Input {...campo('ie')} {...form.register('ie')} />
              </CampoFormulario>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            <CampoFormulario id="cli-whatsapp" rotulo="WhatsApp" erro={errors.whatsapp?.message}>
              <PhoneInput {...campo('whatsapp')} {...form.register('whatsapp')} />
            </CampoFormulario>
            <CampoFormulario id="cli-telefone" rotulo="Telefone" erro={errors.telefone?.message}>
              <PhoneInput {...campo('telefone')} {...form.register('telefone')} />
            </CampoFormulario>
            <CampoFormulario id="cli-email" rotulo="E-mail" erro={errors.email?.message}>
              <Input type="email" {...campo('email')} {...form.register('email')} />
            </CampoFormulario>
            <CampoFormulario id="cli-origem" rotulo="Origem">
              <Select {...campo('origem')} {...form.register('origem')}>
                <option value="">Não informada</option>
                {ORIGENS_CLIENTE.map((o) => (
                  <option key={o} value={o}>
                    {ORIGEM_ROTULOS[o]}
                  </option>
                ))}
              </Select>
            </CampoFormulario>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comercial</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-3">
            <CampoFormulario id="cli-situacao" rotulo="Situação">
              <Select {...campo('situacao')} {...form.register('situacao')}>
                {SITUACOES_CLIENTE.map((s) => (
                  <option key={s} value={s}>
                    {mapa.get(`cliente:${s}`)?.rotulo ?? s}
                  </option>
                ))}
              </Select>
            </CampoFormulario>
            <CampoFormulario id="cli-vendedorId" rotulo="Vendedor responsável">
              <Select {...campo('vendedorId')} {...form.register('vendedorId')}>
                <option value="">Sem vendedor</option>
                {vendedores.data?.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.nome}
                  </option>
                ))}
              </Select>
            </CampoFormulario>
            <CampoFormulario id="cli-limiteCredito" rotulo="Limite de crédito" erro={errors.limiteCredito?.message}>
              <MoneyInput {...campo('limiteCredito')} {...form.register('limiteCredito')} />
            </CampoFormulario>
            <div className="md:col-span-3">
              <CampoFormulario id="cli-tags" rotulo="Etiquetas">
                <Controller
                  control={form.control}
                  name="tags"
                  render={({ field }) => (
                    <TagsInput valor={(field.value as string[]) ?? []} onChange={field.onChange} desabilitado={!podeSalvar} />
                  )}
                />
              </CampoFormulario>
            </div>
            <div className="md:col-span-3">
              <CampoFormulario id="cli-observacoes" rotulo="Observações">
                <Textarea {...campo('observacoes')} {...form.register('observacoes')} />
              </CampoFormulario>
            </div>
          </CardContent>
        </Card>

        {podeSalvar && (
          <div className="flex justify-end">
            <Button type="submit" disabled={salvar.isPending || (Boolean(cliente) && !isDirty)}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {cliente ? 'Salvar alterações' : 'Cadastrar cliente'}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}
