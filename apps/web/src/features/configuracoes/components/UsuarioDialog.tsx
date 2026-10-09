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
import { Button } from '@/components/ui/button'
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
  const config = useQuery({ queryKey: ['usuarios', 'configuracao'], queryFn: usuariosApi.configuracao })
  // Com e-mail ativo, a senha provisória é opcional: o usuário recebe o convite para criar a dele
  const comConvite = config.data?.emailConfigurado ?? false
  const form = useForm<Valores>({
    resolver: zodResolver(usuario ? editarUsuarioSchema : criarUsuarioSchema) as never,
    defaultValues: {
      nome: usuario?.nome ?? '',
      email: usuario?.email ?? '',
      telefone: mascaraTelefone(usuario?.telefone),
      papelId: usuario?.papel.id ?? '',
      comissaoPercentual: decimalParaInput(usuario?.comissaoPercentual ?? 0),
      ativo: usuario?.ativo ?? true,
      semInatividade: usuario?.semInatividade ?? false,
      senhaProvisoria: '',
    },
  })
  const { errors } = form.formState
  const salvar = useMutation({
    mutationFn: (dados: unknown) => (usuario ? usuariosApi.atualizar(usuario.id, dados) : usuariosApi.criar(dados)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['usuarios'] }),
  })

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      const salvo = await salvar.mutateAsync(dados)
      if (usuario) toast.success('Usuário atualizado.')
      else {
        const senha = dados.senhaProvisoria ? ` Senha provisória: ${String(dados.senhaProvisoria)}` : ''
        const convite = 'conviteEnviado' in salvo && salvo.conviteEnviado ? ` Convite enviado para ${salvo.email}.` : ''
        toast.success(`Usuário criado.${convite}${senha}`, { duration: senha ? 15000 : 6000 })
      }
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
          <CampoFormulario id="us-senha" rotulo={comConvite ? 'Senha provisória (opcional)' : 'Senha provisória *'} erro={errors.senhaProvisoria?.message}>
            <div className="flex gap-2">
              <Input id="us-senha" autoComplete="off" placeholder={comConvite ? 'Em branco: só o convite' : ''} {...form.register('senhaProvisoria')} />
              <Button type="button" variant="outline" onClick={() => form.setValue('senhaProvisoria', sugerirSenha())}>
                Gerar
              </Button>
            </div>
          </CampoFormulario>
        )}
      </div>
      <label className="flex items-start gap-2 text-sm">
        <Checkbox className="mt-0.5" {...form.register('semInatividade')} />
        <span>
          Usuário de painel: não sair por inatividade
          <span className="block text-xs text-texto-secundario">Para a TV ou monitor da produção. Use um usuário só para isso, com acesso apenas de visualização. Só o administrador marca.</span>
        </span>
      </label>
      {usuario ? (
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...form.register('ativo')} /> Usuário ativo (desmarcar encerra as sessões abertas)
        </label>
      ) : (
        <p className="rounded-lg bg-accent p-3 text-xs text-tinta">
          {comConvite
            ? 'O usuário recebe um e-mail com o link para criar a própria senha (vale 72 horas). Se preferir, informe também uma senha provisória para passar a ele.'
            : 'O envio de e-mails não está configurado: informe a senha provisória ao usuário. No primeiro acesso ele será obrigado a criar a própria senha.'}
        </p>
      )}
    </FormDialog>
  )
}
