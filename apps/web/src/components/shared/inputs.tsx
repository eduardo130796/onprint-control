import * as React from 'react'
import { Input } from '@/components/ui/input'
import { mascaraCep, mascaraCpfCnpj, mascaraMoeda, mascaraTelefone } from '@/lib/mascaras'
import { cn } from '@/lib/utils'

type InputProps = React.InputHTMLAttributes<HTMLInputElement>

interface InputComMascaraProps extends InputProps {
  mascara: (valor: string) => string
}

/**
 * Input que aplica a máscara enquanto o usuário digita. Funciona com react-hook-form (register):
 * o valor do evento já chega mascarado; o schema compartilhado remove a máscara antes de enviar à API.
 */
const InputComMascara = React.forwardRef<HTMLInputElement, InputComMascaraProps>(({ mascara, onChange, ...props }, ref) => (
  <Input
    ref={ref}
    {...props}
    onChange={(e) => {
      e.target.value = mascara(e.target.value)
      onChange?.(e)
    }}
  />
))
InputComMascara.displayName = 'InputComMascara'

export const CpfCnpjInput = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <InputComMascara ref={ref} mascara={mascaraCpfCnpj} inputMode="numeric" placeholder="CPF ou CNPJ" maxLength={18} {...props} />
))
CpfCnpjInput.displayName = 'CpfCnpjInput'

export const PhoneInput = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <InputComMascara ref={ref} mascara={mascaraTelefone} inputMode="tel" placeholder="(00) 00000-0000" maxLength={15} {...props} />
))
PhoneInput.displayName = 'PhoneInput'

export const CepInput = React.forwardRef<HTMLInputElement, InputProps>((props, ref) => (
  <InputComMascara ref={ref} mascara={mascaraCep} inputMode="numeric" placeholder="00000-000" maxLength={9} {...props} />
))
CepInput.displayName = 'CepInput'

/** Valor em reais digitado por centavos ("1.234,56"). */
export const MoneyInput = React.forwardRef<HTMLInputElement, InputProps>(({ className, onFocus, ...props }, ref) => (
  <div className="relative">
    <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-texto-secundario">R$</span>
    <InputComMascara
      ref={ref}
      mascara={mascaraMoeda}
      inputMode="numeric"
      className={cn('pl-9 text-right', className)}
      // Seleciona o valor ao focar: digitar substitui "0,00" ou o valor sugerido em vez de somar dígitos
      onFocus={(e) => {
        e.target.select()
        onFocus?.(e)
      }}
      {...props}
    />
  </div>
))
MoneyInput.displayName = 'MoneyInput'

interface NumberInputProps extends InputProps {
  casas?: number
  sufixo?: string
}

/** Número decimal no padrão brasileiro (vírgula), com sufixo opcional (%, m², dias). */
export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(({ casas = 2, sufixo, className, ...props }, ref) => {
  const mascara = React.useCallback(
    (valor: string) => {
      const limpo = valor.replace(casas ? /[^\d,]/g : /\D/g, '')
      const [inteiro = '', ...resto] = limpo.split(',')
      return resto.length ? `${inteiro},${resto.join('').slice(0, casas)}` : inteiro
    },
    [casas],
  )
  return (
    <div className="relative">
      <InputComMascara
        ref={ref}
        mascara={mascara}
        inputMode={casas ? 'decimal' : 'numeric'}
        className={cn('text-right', sufixo && 'pr-12', className)}
        {...props}
      />
      {sufixo && (
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-texto-secundario">{sufixo}</span>
      )}
    </div>
  )
})
NumberInput.displayName = 'NumberInput'
