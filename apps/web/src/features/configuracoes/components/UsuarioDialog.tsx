import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  criarUsuarioSchema,
  editarUsuarioSchema,
  type CriarUsuarioInput,
  type EditarUsuarioInput,
  type UsuarioResumo,
} from '@onprint/shared'
import { usuariosApi } from '@/api/configuracoes'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { NumberInput, PhoneInput } from '@/components/shared/inputs'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { decimalParaInput, mascaraTelefone } from '@/lib/mascaras'
import { sugerirSenha } from '@/lib/senha'

type Valores = CriarUsuarioInput & EditarUsuarioInput

interface UsuarioDialogProps {
  usuario?: UsuarioResumo
  onFechar: () => void
}

export function UsuarioDialog({ usuario, onFechar }: UsuarioDialogProps) {
  const queryClient = useQueryClient()
  const papeis = useQuery({ queryKey: ['usuarios', 'papeis'], queryFn: usuariosApi.papeis })
  const form = useForm<Valores>({
    // Criação exige senha provisória; edição permite ativar/desativar
    resolver: zodResolver(usuario ? editarUsuarioSchema : criarUsuarioSchema) as never,
    defaultValues: {
      nome: usuario?.nome ?? '',
      email: usuario?.email ?? '',
      telefone: mascaraTelefone(usuario?.telefone),
      papelId: usuario?.papel.id ?? '',
      comissaoPercentual: decimalParaInput(usuario?.comissaoPercentual ?? 0),
      ativo: usuario?.ativo ?? true,
      senhaProvisoria: usuario ? undefined : sugerirSenha(),
    },
  })
  const { errors } = form.formState
  const salvar = useMutation({
    mutationFn: (dados: unknown) => (usuario ? usuariosApi.atualizar(usuario.id, dados) : usuariosApi.criar(dados)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success(usuario ? 'Usuário atualizado.' : `Usuário criado. Senha provisória: ${String(dados.senhaProvisoria)}`, {
        duration: usuario ? 4000 : 15000,
      })
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={usuario ? 'Editar usuário' : 'Novo usuário'} salvando={salvar.isPending} onSubmit={onSubmit}>
      <CampoFormulario id="us-nome" rotulo="Nome *" erro={errors.nome?.message}>
        <Input id="us-nome" autoFocus {...form.register('nome')} />
      </CampoFormulario>
      <CampoFormulario id="us-email" rotulo="E-mail (login) *" erro={errors.email?.message}>
        <Input id="us-email" type="email" {...form.register('email')} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="us-papel" rotulo="Papel *" erro={errors.papelId?.message}>
          <Select id="us-papel" {...form.register('papelId')}>
            <option value="">Selecione…</option>
            {papeis.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="us-telefone" rotulo="Telefone" erro={errors.telefone?.message}>
          <PhoneInput id="us-telefone" {...form.register('telefone')} />
        </CampoFormulario>
        <CampoFormulario id="us-comissao" rotulo="Comissão" erro={errors.comissaoPercentual?.message}>
          <NumberInput id="us-comissao" sufixo="%" {...form.register('comissaoPercentual')} />
        </CampoFormulario>
        {!usuario && (
          <CampoFormulario id="us-senha" rotulo="Senha provisória *" erro={errors.senhaProvisoria?.message}>
            <Input id="us-senha" autoComplete="off" {...form.register('senhaProvisoria')} />
          </CampoFormulario>
        )}
      </div>
      {usuario ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...form.register('ativo')} /> Usuário ativo (desmarcar encerra as sessões abertas)
        </label>
      ) : (
        <p className="rounded-lg bg-accent p-3 text-xs text-petroleo">
          Informe a senha provisória ao usuário. No primeiro acesso ele será obrigado a criar a própria senha.
        </p>
      )}
    </FormDialog>
  )
}
