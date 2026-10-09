import { useCallback, useState } from 'react'
import { useBuscaCep } from '@/hooks/useBuscaCep'
import type { EnderecoCep } from '@/integrations/cep'
import { textoEnderecoCep } from '@/lib/consultas'
import { CepInput } from './inputs'
import { StatusCep } from './StatusCep'

interface BuscaCepTextoProps {
  /** id do campo de texto do endereço (recebe o foco, com o cursor onde vai o número) */
  idCampo: string
  aoPreencher: (texto: string) => void
}

/** Para endereços em texto livre (entrega): digitar o CEP monta o texto do endereço. */
export function BuscaCepTexto({ idCampo, aoPreencher }: BuscaCepTextoProps) {
  const [cep, setCep] = useState('')
  const busca = useBuscaCep(
    useCallback(
      (e: EnderecoCep) => {
        const { texto, posicaoNumero } = textoEnderecoCep(e)
        aoPreencher(texto)
        requestAnimationFrame(() => {
          const campo = document.getElementById(idCampo) as HTMLTextAreaElement | null
          campo?.focus()
          campo?.setSelectionRange(posicaoNumero, posicaoNumero)
        })
      },
      [aoPreencher, idCampo],
    ),
  )
  const id = `${idCampo}-cep`
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <label htmlFor={id} className="sr-only">
        Buscar endereço pelo CEP
      </label>
      <CepInput
        id={id}
        value={cep}
        placeholder="CEP"
        className="h-9 w-32"
        aria-describedby={`${id}-status`}
        onChange={(e) => {
          setCep(e.target.value)
          busca.aoDigitar(e.target.value)
        }}
        onBlur={(e) => busca.aoSair(e.target.value)}
      />
      {busca.status === 'ocioso' ? (
        <span id={`${id}-status`} className="text-xs text-texto-secundario">
          Digite o CEP para montar o endereço
        </span>
      ) : (
        <StatusCep id={`${id}-status`} status={busca.status} encontrado="Endereço montado pelo CEP — complete com o número" />
      )}
    </div>
  )
}
