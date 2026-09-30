import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { TIPOS_ENDERECO, TIPO_ENDERECO_ROTULOS, enderecoSchema, type Endereco, type EnderecoInput } from '@onprint/shared'
import type { z } from 'zod'
import { clientesApi } from '@/api/cadastros'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { CepInput } from '@/components/shared/inputs'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { UFS } from '@/lib/ufs'
import { mascaraCep } from '@/lib/mascaras'
import { useMutacaoClientes } from '../hooks'

type Saida = z.output<typeof enderecoSchema>

interface EnderecoDialogProps {
  clienteId: string
  endereco?: Endereco
  onFechar: () => void
}

/** Endereço preenchido manualmente (a busca por CEP é uma integração futura — CepProvider). */
export function EnderecoDialog({ clienteId, endereco, onFechar }: EnderecoDialogProps) {
  const form = useForm<EnderecoInput, unknown, Saida>({
    resolver: zodResolver(enderecoSchema),
    defaultValues: {
      tipo: endereco?.tipo ?? 'principal',
      cep: mascaraCep(endereco?.cep),
      logradouro: endereco?.logradouro ?? '',
      numero: endereco?.numero ?? '',
      complemento: endereco?.complemento ?? '',
      bairro: endereco?.bairro ?? '',
      cidade: endereco?.cidade ?? '',
      uf: endereco?.uf ?? '',
      referencia: endereco?.referencia ?? '',
    },
  })
  const { errors } = form.formState
  const salvar = useMutacaoClientes((dados: Saida) => clientesApi.salvarEndereco(clienteId, dados, endereco?.id))

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success('Endereço salvo.')
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  const id = (nome: string) => `end-${nome}`

  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo={endereco ? 'Editar endereço' : 'Novo endereço'}
      salvando={salvar.isPending}
      onSubmit={onSubmit}
      largo
    >
      <div className="grid gap-4 sm:grid-cols-6">
        <div className="sm:col-span-3">
          <CampoFormulario id={id('tipo')} rotulo="Tipo">
            <Select id={id('tipo')} {...form.register('tipo')}>
              {TIPOS_ENDERECO.map((t) => (
                <option key={t} value={t}>
                  {TIPO_ENDERECO_ROTULOS[t]}
                </option>
              ))}
            </Select>
          </CampoFormulario>
        </div>
        <div className="sm:col-span-3">
          <CampoFormulario id={id('cep')} rotulo="CEP" erro={errors.cep?.message}>
            <CepInput id={id('cep')} {...form.register('cep')} />
          </CampoFormulario>
        </div>
        <div className="sm:col-span-4">
          <CampoFormulario id={id('logradouro')} rotulo="Logradouro *" erro={errors.logradouro?.message}>
            <Input id={id('logradouro')} autoFocus aria-invalid={Boolean(errors.logradouro)} {...form.register('logradouro')} />
          </CampoFormulario>
        </div>
        <div className="sm:col-span-2">
          <CampoFormulario id={id('numero')} rotulo="Número">
            <Input id={id('numero')} {...form.register('numero')} />
          </CampoFormulario>
        </div>
        <div className="sm:col-span-3">
          <CampoFormulario id={id('complemento')} rotulo="Complemento">
            <Input id={id('complemento')} {...form.register('complemento')} />
          </CampoFormulario>
        </div>
        <div className="sm:col-span-3">
          <CampoFormulario id={id('bairro')} rotulo="Bairro">
            <Input id={id('bairro')} {...form.register('bairro')} />
          </CampoFormulario>
        </div>
        <div className="sm:col-span-4">
          <CampoFormulario id={id('cidade')} rotulo="Cidade *" erro={errors.cidade?.message}>
            <Input id={id('cidade')} aria-invalid={Boolean(errors.cidade)} {...form.register('cidade')} />
          </CampoFormulario>
        </div>
        <div className="sm:col-span-2">
          <CampoFormulario id={id('uf')} rotulo="UF *" erro={errors.uf?.message}>
            <Select id={id('uf')} aria-invalid={Boolean(errors.uf)} {...form.register('uf')}>
              <option value="">—</option>
              {UFS.map((uf) => (
                <option key={uf} value={uf}>
                  {uf}
                </option>
              ))}
            </Select>
          </CampoFormulario>
        </div>
        <div className="sm:col-span-6">
          <CampoFormulario id={id('referencia')} rotulo="Ponto de referência">
            <Input id={id('referencia')} {...form.register('referencia')} />
          </CampoFormulario>
        </div>
      </div>
    </FormDialog>
  )
}
