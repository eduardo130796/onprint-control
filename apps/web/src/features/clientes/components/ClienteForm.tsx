import { useState } from 'react'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, MapPin, Save, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  ORIGENS_CLIENTE,
  ORIGEM_ROTULOS,
  SITUACOES_CLIENTE,
  clienteSchema,
  formatarCep,
  type Cliente,
  type ClienteDados,
  type ClienteInput,
} from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { BotaoBuscarCnpj } from '@/components/shared/BotaoBuscarCnpj'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { CpfCnpjInput, MoneyInput, PhoneInput } from '@/components/shared/inputs'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { TagsInput } from '@/components/shared/TagsInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useConsultaCnpj } from '@/hooks/useConsultaCnpj'
import { usePermission } from '@/hooks/usePermission'
import { enderecoPrincipalDaReceita, type EnderecoReceita } from '@/lib/consultas'
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

function PreviaEndereco({ endereco, onDescartar }: { endereco: EnderecoReceita; onDescartar: () => void }) {
  const rua = [endereco.logradouro, endereco.numero, endereco.complemento].filter(Boolean).join(', ')
  const cidade = [endereco.bairro, `${endereco.cidade}/${endereco.uf}`].filter(Boolean).join(' · ')
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-2xl border border-dashed border-marca/60 bg-marca-suave/40 p-4 text-sm md:col-span-6">
      <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-marca-escuro" aria-hidden />
      {/* No celular o texto ocupa a linha toda e o "Descartar" desce */}
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium text-tinta">Endereço encontrado na Receita (será salvo como principal)</p>
        <p className="mt-1 break-words text-tinta">{rua}</p>
        <p className="text-texto-secundario">{cidade}</p>
        {endereco.cep && <p className="text-texto-secundario">CEP {formatarCep(endereco.cep)}</p>}
      </div>
      <Button type="button" variant="ghost" size="sm" className="ml-auto shrink-0" onClick={onDescartar}>
        <X /> Descartar
      </Button>
    </div>
  )
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

  // Cliente novo: o endereço da Receita fica guardado e vira o endereço principal depois de salvar
  const [enderecoReceita, setEnderecoReceita] = useState<EnderecoReceita | null>(null)
  const consultaCnpj = useConsultaCnpj({
    form,
    campoDocumento: 'cpfCnpj',
    campos: { razaoSocial: 'nome', nomeFantasia: 'fantasia', email: 'email', telefone: 'telefone', ie: 'ie' },
    aoEncontrar: () => {
      if (form.getValues('tipoPessoa') !== 'PJ') form.setValue('tipoPessoa', 'PJ', { shouldDirty: true })
    },
    aoReceberEndereco: (e) => {
      if (cliente) return false
      const endereco = enderecoPrincipalDaReceita(e)
      setEnderecoReceita(endereco)
      return Boolean(endereco)
    },
  })

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      const salvo = await salvar.mutateAsync(dados)
      if (!cliente && enderecoReceita) {
        try {
          await clientesApi.salvarEndereco(salvo.id, enderecoReceita)
        } catch {
          toast.warning('Cliente salvo, mas o endereço não.', { description: 'Adicione o endereço na aba Endereços.' })
        }
      }
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
              <CampoFormulario
                id="cli-cpfCnpj"
                rotulo={tipo === 'PJ' ? 'CNPJ' : 'CPF'}
                erro={errors.cpfCnpj?.message}
                acao={<BotaoBuscarCnpj consulta={consultaCnpj} />}
              >
                <CpfCnpjInput {...campo('cpfCnpj')} {...form.register('cpfCnpj')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="cli-ie" rotulo={tipo === 'PJ' ? 'Inscrição estadual' : 'RG'}>
                <Input {...campo('ie')} {...form.register('ie')} />
              </CampoFormulario>
            </div>
            {enderecoReceita && <PreviaEndereco endereco={enderecoReceita} onDescartar={() => setEnderecoReceita(null)} />}
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
