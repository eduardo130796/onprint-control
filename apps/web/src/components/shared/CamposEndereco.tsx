import type { FieldErrors, UseFormRegister } from 'react-hook-form'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { UFS } from '@/lib/ufs'
import { CampoFormulario } from './CampoFormulario'
import { CepInput } from './inputs'

interface CamposEnderecoProps {
  prefixo: string
  // Formulários diferentes (empresa, fornecedor) compartilham os mesmos nomes de campo de endereço
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
}

const erro = (errors: FieldErrors, campo: string) => errors[campo]?.message as string | undefined

/** Bloco de endereço (CEP manual — a busca automática é uma integração futura). */
export function CamposEndereco({ prefixo, register, errors }: CamposEnderecoProps) {
  const id = (c: string) => `${prefixo}-${c}`
  return (
    <div className="grid gap-4 md:grid-cols-12">
      <div className="md:col-span-3">
        <CampoFormulario id={id('cep')} rotulo="CEP" erro={erro(errors, 'cep')}>
          <CepInput id={id('cep')} {...register('cep')} />
        </CampoFormulario>
      </div>
      <div className="md:col-span-7">
        <CampoFormulario id={id('logradouro')} rotulo="Logradouro">
          <Input id={id('logradouro')} {...register('logradouro')} />
        </CampoFormulario>
      </div>
      <div className="md:col-span-2">
        <CampoFormulario id={id('numero')} rotulo="Número">
          <Input id={id('numero')} {...register('numero')} />
        </CampoFormulario>
      </div>
      <div className="md:col-span-3">
        <CampoFormulario id={id('complemento')} rotulo="Complemento">
          <Input id={id('complemento')} {...register('complemento')} />
        </CampoFormulario>
      </div>
      <div className="md:col-span-3">
        <CampoFormulario id={id('bairro')} rotulo="Bairro">
          <Input id={id('bairro')} {...register('bairro')} />
        </CampoFormulario>
      </div>
      <div className="md:col-span-4">
        <CampoFormulario id={id('cidade')} rotulo="Cidade">
          <Input id={id('cidade')} {...register('cidade')} />
        </CampoFormulario>
      </div>
      <div className="md:col-span-2">
        <CampoFormulario id={id('uf')} rotulo="UF" erro={erro(errors, 'uf')}>
          <Select id={id('uf')} {...register('uf')}>
            <option value="">—</option>
            {UFS.map((uf) => (
              <option key={uf} value={uf}>
                {uf}
              </option>
            ))}
          </Select>
        </CampoFormulario>
      </div>
    </div>
  )
}
