import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { toast } from 'sonner'
import { novaEmpresaSchema, type NovaEmpresaInput } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { plataformaApi } from '../api'

/** Empresa criada pelo suporte. Sem senha provisória, o dono recebe o convite por e-mail. Leva alguns segundos. */
export function NovaEmpresaDialog({ onFechar }: { onFechar: () => void }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const planos = useQuery({ queryKey: ['plataforma', 'planos'], queryFn: plataformaApi.planos })
  const form = useForm<NovaEmpresaInput>({
    resolver: zodResolver(novaEmpresaSchema),
    defaultValues: { nome: '', email: '', responsavel: '', senhaProvisoria: '', plano: 'profissional', situacao: 'teste', exemplos: false },
  })
  const { errors, isSubmitting } = form.formState

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      const r = await plataformaApi.criarEmpresa(dados)
      toast.success(r.conviteEnviado ? `Empresa criada. Convite enviado para ${dados.email}.` : 'Empresa criada.', { duration: 6000 })
      await queryClient.invalidateQueries({ queryKey: ['plataforma'] })
      navigate(`/plataforma/empresas/${r.id}`)
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(x) => !x && onFechar()} titulo="Nova empresa" descricao="Cria o banco da empresa, os dados padrão e o administrador (alguns segundos)." salvando={isSubmitting} textoSalvar="Criar empresa" onSubmit={onSubmit}>
      <CampoFormulario id="ne-nome" rotulo="Nome da empresa *" erro={errors.nome?.message}>
        <Input id="ne-nome" autoFocus {...form.register('nome')} />
      </CampoFormulario>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="ne-resp" rotulo="Responsável *" erro={errors.responsavel?.message}>
          <Input id="ne-resp" {...form.register('responsavel')} />
        </CampoFormulario>
        <CampoFormulario id="ne-email" rotulo="E-mail do responsável (login) *" erro={errors.email?.message}>
          <Input id="ne-email" type="email" {...form.register('email')} />
        </CampoFormulario>
        <CampoFormulario id="ne-plano" rotulo="Plano *" erro={errors.plano?.message}>
          <Select id="ne-plano" {...form.register('plano')}>
            {planos.data
              ?.filter((p) => p.ativo)
              .map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nome}
                </option>
              ))}
          </Select>
        </CampoFormulario>
        <CampoFormulario id="ne-situacao" rotulo="Começa" erro={errors.situacao?.message}>
          <Select id="ne-situacao" {...form.register('situacao')}>
            <option value="teste">Em teste grátis</option>
            <option value="ativa">Ativa (já pagou / contrato)</option>
          </Select>
        </CampoFormulario>
      </div>
      <CampoFormulario id="ne-senha" rotulo="Senha provisória (opcional)" erro={errors.senhaProvisoria?.message}>
        <Input id="ne-senha" autoComplete="off" placeholder="Em branco: convite por e-mail" {...form.register('senhaProvisoria')} />
      </CampoFormulario>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('exemplos')} /> Criar catálogo de exemplo (produtos, insumos, máquinas)
      </label>
    </FormDialog>
  )
}
