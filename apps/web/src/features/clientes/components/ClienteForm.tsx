import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import {
  ORIGENS_CLIENTE,
  ORIGEM_ROTULOS,
  SITUACOES_CLIENTE,
  clienteSchema,
  enderecoSchema,
  type Cliente,
  type ClienteDados,
  type ClienteInput,
  type DadosCnpj,
  type EnderecoInput,
  cnpjValido,
  cpfValido,
  somenteDigitos,
} from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { ErroApi } from '@/api/http'
import { AvisoReceita, type ConsultaReceita } from '@/components/shared/AvisoReceita'
import { BotaoBuscarCnpj } from '@/components/shared/BotaoBuscarCnpj'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { CamposEndereco } from '@/components/shared/CamposEndereco'
import { CpfCnpjInput, MoneyInput, PhoneInput } from '@/components/shared/inputs'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { TagsInput } from '@/components/shared/TagsInput'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useConsultaCnpj } from '@/hooks/useConsultaCnpj'
import { usePermission } from '@/hooks/usePermission'
import { candidatosEndereco } from '@/lib/consultas'
import { decimalParaInput, mascaraCpfCnpj, mascaraTelefone } from '@/lib/mascaras'
import { useMutacaoClientes, useVendedores } from '../hooks'
import { ClienteJaExiste, type ClienteExistente } from './ClienteJaExiste'

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

const ENDERECO_VAZIO: EnderecoInput = { tipo: 'principal', cep: '', logradouro: '', numero: '', complemento: '', bairro: '', cidade: '', uf: '', referencia: '' }

/** O bloco de endereço foi usado (o CEP sozinho, sem rua, ainda conta: a validação pede o resto) */
const enderecoUsado = (e: EnderecoInput) => [e.cep, e.logradouro, e.numero, e.complemento, e.bairro, e.cidade].some((v) => String(v ?? '').trim() !== '')

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
  // O documento decide o tipo: 11 dígitos = pessoa física, 14 = jurídica
  const documento = somenteDigitos(String(form.watch('cpfCnpj') ?? ''))
  useEffect(() => {
    const certo = documento.length === 14 ? 'PJ' : documento.length === 11 ? 'PF' : null
    if (certo && form.getValues('tipoPessoa') !== certo) form.setValue('tipoPessoa', certo, { shouldDirty: true })
  }, [documento, form])
  // Cliente novo: o documento já é de alguém (talvez desativado)? Avisa antes de a pessoa preencher o resto
  const documentoCompleto = (documento.length === 11 && cpfValido(documento)) || (documento.length === 14 && cnpjValido(documento))
  const jaCadastrado = useQuery({
    queryKey: ['clientes', 'documento', documento],
    queryFn: () => clientesApi.porDocumento(documento),
    enabled: !cliente && documentoCompleto,
    staleTime: 30_000,
  })
  // Conflito devolvido ao salvar (CPF/CNPJ ou WhatsApp de outro cliente)
  const [conflito, setConflito] = useState<ClienteExistente | null>(null)
  useEffect(() => setConflito(null), [documento])
  const existente: ClienteExistente | null =
    conflito ?? (!cliente && documentoCompleto && jaCadastrado.data ? { ...jaCadastrado.data, nome: jaCadastrado.data.fantasia || jaCadastrado.data.nome } : null)
  // Empresa sem pessoas de contato: "Falar com" vira o contato principal (aba Contatos)
  const comFalarCom = tipo === 'PJ' && (!cliente || cliente.contatos.length === 0)
  const [falarCom, setFalarCom] = useState('')

  // Cliente novo (ou ainda sem endereço): endereço principal editável aqui mesmo, digitado ou vindo da Receita
  const comEndereco = !cliente || cliente.enderecos.length === 0
  const formEndereco = useForm<EnderecoInput>({ resolver: zodResolver(enderecoSchema), defaultValues: ENDERECO_VAZIO })
  const [enderecoDaReceita, setEnderecoDaReceita] = useState(false)
  const [daReceita, setDaReceita] = useState<ConsultaReceita | null>(null)
  // Endereço salvo junto, antes de a lista de clientes ser recarregada
  const salvar = useMutacaoClientes(async ({ dados, endereco, contato }: { dados: ClienteDados; endereco: EnderecoInput | null; contato: string }) => {
    const salvo = await (cliente ? clientesApi.atualizar(cliente.id, dados) : clientesApi.criar(dados))
    let enderecoFalhou = false
    let contatoFalhou = false
    if (endereco) {
      try {
        await clientesApi.salvarEndereco(salvo.id, endereco)
      } catch {
        enderecoFalhou = true
      }
    }
    if (contato) {
      try {
        await clientesApi.salvarContato(salvo.id, { nome: contato, cargo: '', email: dados.email ?? '', telefone: dados.telefone ?? '', whatsapp: dados.whatsapp ?? '', principal: true })
      } catch {
        contatoFalhou = true
      }
    }
    return { salvo, enderecoFalhou, contatoFalhou }
  })
  const consultaCnpj = useConsultaCnpj({
    form,
    campoDocumento: 'cpfCnpj',
    campos: { razaoSocial: 'nome', nomeFantasia: 'fantasia', email: 'email', telefone: 'telefone', whatsapp: 'whatsapp', ie: 'ie' },
    aoEncontrar: () => {
      if (form.getValues('tipoPessoa') !== 'PJ') form.setValue('tipoPessoa', 'PJ', { shouldDirty: true })
    },
    aoPreencher: (dados, preenchidos) => setDaReceita({ dados, preenchidos }),
    aoReceberEndereco: (e) => {
      if (!comEndereco) return false
      // Só com o bloco vazio (nunca mistura com o que a pessoa já digitou)
      const preencher = candidatosEndereco({ endereco: e } as DadosCnpj, formEndereco.getValues())
      for (const c of preencher) formEndereco.setValue(c.campo as keyof EnderecoInput, c.valor, { shouldDirty: true })
      if (preencher.length) setEnderecoDaReceita(true)
      return preencher.length > 0
    },
  })

  const onSubmit = form.handleSubmit(async (dados) => {
    let endereco: EnderecoInput | null = null
    if (comEndereco && enderecoUsado(formEndereco.getValues())) {
      if (!(await formEndereco.trigger())) {
        toast.error('Confira o endereço', { description: 'Complete rua, cidade e UF, ou apague o endereço para cadastrar depois.' })
        return
      }
      endereco = formEndereco.getValues()
    }
    try {
      const { salvo, enderecoFalhou, contatoFalhou } = await salvar.mutateAsync({ dados, endereco, contato: comFalarCom ? falarCom.trim() : '' })
      if (enderecoFalhou) toast.warning('Cliente salvo, mas o endereço não.', { description: 'Adicione o endereço na aba Endereços.' })
      if (contatoFalhou) toast.warning('Cliente salvo, mas o contato não.', { description: 'Adicione a pessoa na aba Contatos.' })
      formEndereco.reset(ENDERECO_VAZIO)
      setFalarCom('')
      setEnderecoDaReceita(false)
      setDaReceita(null)
      form.reset(valoresIniciais(salvo))
      toast.success(cliente ? 'Cliente atualizado.' : 'Cliente cadastrado.')
      onSalvo(salvo)
    } catch (e) {
      const d = e instanceof ErroApi && e.status === 409 ? (e.details as Partial<ClienteExistente> & { clienteId?: string } | undefined) : undefined
      if (d?.clienteId && d.nome) setConflito({ id: d.clienteId, nome: d.nome, ativo: Boolean(d.ativo), campo: d.campo })
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
              <CampoFormulario
                id="cli-cpfCnpj"
                rotulo="CPF ou CNPJ"
                erro={errors.cpfCnpj?.message}
                acao={<BotaoBuscarCnpj consulta={consultaCnpj} />}
                dica={cliente ? undefined : 'Com o CNPJ, nome, telefone e endereço se preenchem sozinhos.'}
              >
                <CpfCnpjInput autoFocus={!cliente} {...campo('cpfCnpj')} {...form.register('cpfCnpj')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="cli-tipoPessoa" rotulo="Tipo">
                <Select {...campo('tipoPessoa')} {...form.register('tipoPessoa')}>
                  <option value="PF">Pessoa física</option>
                  <option value="PJ">Pessoa jurídica</option>
                </Select>
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="cli-ie" rotulo={tipo === 'PJ' ? 'Inscrição estadual' : 'RG'}>
                <Input {...campo('ie')} {...form.register('ie')} />
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
            {existente && <ClienteJaExiste existente={existente} />}
            {daReceita && <AvisoReceita consulta={daReceita} onFechar={() => setDaReceita(null)} className="md:col-span-6" />}
          </CardContent>
        </Card>

        {comEndereco && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Endereço principal</CardTitle>
              <p className="text-sm text-texto-secundario">
                {enderecoDaReceita
                  ? 'Veio da Receita Federal: confira e ajuste antes de salvar.'
                  : 'Opcional. Digite o CEP para buscar a rua; outros endereços (entrega, cobrança) ficam na aba Endereços.'}
              </p>
            </CardHeader>
            <CardContent>
              <CamposEndereco prefixo="cli-end" register={formEndereco.register} errors={formEndereco.formState.errors} setValue={formEndereco.setValue} />
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contato</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 md:grid-cols-4">
            {comFalarCom && (
              <div className="md:col-span-4">
                <CampoFormulario id="cli-falarCom" rotulo="Falar com" dica="Pessoa da empresa que você atende (vira o contato principal, na aba Contatos).">
                  <Input id="cli-falarCom" value={falarCom} onChange={(e) => setFalarCom(e.target.value)} placeholder="Ex.: Ana, do marketing" maxLength={120} />
                </CampoFormulario>
              </div>
            )}
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
            <Button type="submit" disabled={salvar.isPending || (Boolean(cliente) && !isDirty && !formEndereco.formState.isDirty && !falarCom.trim())}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {cliente ? 'Salvar alterações' : 'Cadastrar cliente'}
            </Button>
          </div>
        )}
      </fieldset>
    </form>
  )
}
