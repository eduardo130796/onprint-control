import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { ORIGENS_CLIENTE, ORIGEM_ROTULOS, clienteSchema, type ClienteDados, type ClienteInput } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { PhoneInput } from '@/components/shared/inputs'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useMutacaoClientes } from '../hooks'

interface PreCadastroDialogProps {
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
}

/** Cadastro mínimo de quem chegou pelo atendimento (nome + WhatsApp/telefone + origem). */
export function PreCadastroDialog({ aberto, onAbertoChange }: PreCadastroDialogProps) {
  const navigate = useNavigate()
  const form = useForm<ClienteInput, unknown, ClienteDados>({
    resolver: zodResolver(clienteSchema),
    defaultValues: { nome: '', whatsapp: '', telefone: '', origem: 'whatsapp', situacao: 'pre_cadastro' },
  })
  const { errors } = form.formState
  const criar = useMutacaoClientes((dados: ClienteDados) => clientesApi.criar(dados))

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      const cliente = await criar.mutateAsync(dados)
      toast.success('Pré-cadastro criado.', {
        action: { label: 'Abrir ficha', onClick: () => navigate(`/clientes/${cliente.id}`) },
      })
      form.reset()
      onAbertoChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog
      aberto={aberto}
      onAbertoChange={onAbertoChange}
      titulo="Pré-cadastro rápido"
      descricao="Registre o contato agora e complete os dados depois."
      salvando={criar.isPending}
      onSubmit={onSubmit}
    >
      <CampoFormulario id="pc-nome" rotulo="Nome *" erro={errors.nome?.message}>
        <Input id="pc-nome" autoFocus aria-invalid={Boolean(errors.nome)} {...form.register('nome')} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="pc-whatsapp" rotulo="WhatsApp" erro={errors.whatsapp?.message}>
          <PhoneInput id="pc-whatsapp" aria-invalid={Boolean(errors.whatsapp)} {...form.register('whatsapp')} />
        </CampoFormulario>
        <CampoFormulario id="pc-telefone" rotulo="Telefone" erro={errors.telefone?.message}>
          <PhoneInput id="pc-telefone" {...form.register('telefone')} />
        </CampoFormulario>
      </div>
      <CampoFormulario id="pc-origem" rotulo="Origem do contato">
        <Select id="pc-origem" {...form.register('origem')}>
          {ORIGENS_CLIENTE.map((o) => (
            <option key={o} value={o}>
              {ORIGEM_ROTULOS[o]}
            </option>
          ))}
        </Select>
      </CampoFormulario>
    </FormDialog>
  )
}
