import { useCallback } from 'react'
import type { FieldErrors, UseFormRegister, UseFormSetValue } from 'react-hook-form'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useBuscaCep } from '@/hooks/useBuscaCep'
import type { EnderecoCep } from '@/integrations/cep'
import { aplicarEnderecoDoCep } from '@/lib/consultas'
import { UFS } from '@/lib/ufs'
import { CampoFormulario } from './CampoFormulario'
import { CepInput } from './inputs'
import { StatusCep } from './StatusCep'

interface CamposEnderecoProps {
  prefixo: string
  // Formulários diferentes (empresa, fornecedor) compartilham os mesmos nomes de campo de endereço
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  register: UseFormRegister<any>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  errors: FieldErrors<any>
  /** Preenche logradouro, bairro, cidade e UF pela busca do CEP */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: UseFormSetValue<any>
}

const erro = (errors: FieldErrors, campo: string) => errors[campo]?.message as string | undefined

/** Bloco de endereço: o CEP completo busca logradouro, bairro, cidade e UF; o foco vai para o número. */
export function CamposEndereco({ prefixo, register, errors, setValue }: CamposEnderecoProps) {
  const id = (c: string) => `${prefixo}-${c}`
  const busca = useBuscaCep(
    useCallback(
      (e: EnderecoCep) => {
        aplicarEnderecoDoCep(setValue, e)
        document.getElementById(`${prefixo}-numero`)?.focus()
      },
      [setValue, prefixo],
    ),
  )
  const cep = register('cep')
  return (
    <div className="grid gap-4 md:grid-cols-12">
      <div className="md:col-span-3">
        <CampoFormulario id={id('cep')} rotulo="CEP" erro={erro(errors, 'cep')}>
          <CepInput
            id={id('cep')}
            aria-describedby={id('cep-status')}
            {...cep}
            onChange={(e) => {
              void cep.onChange(e)
              busca.aoDigitar(e.target.value)
            }}
            onBlur={(e) => {
              void cep.onBlur(e)
              busca.aoSair(e.target.value)
            }}
          />
          <StatusCep id={id('cep-status')} status={busca.status} />
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
