import { useCallback, useEffect, useRef, useState } from 'react'
import { somenteDigitos } from '@onprint/shared'
import { cepProvider, type EnderecoCep } from '@/integrations/cep'

export type StatusCep = 'ocioso' | 'buscando' | 'encontrado' | 'nao_encontrado' | 'indisponivel'

const ESPERA_MS = 400

/**
 * Busca o endereço quando o CEP fica completo (ao digitar, com espera curta, ou ao sair do campo).
 * O mesmo CEP não é consultado duas vezes seguidas; resposta de um CEP antigo é descartada.
 */
export function useBuscaCep(aoEncontrar: (endereco: EnderecoCep) => void) {
  const [status, setStatus] = useState<StatusCep>('ocioso')
  const ultimo = useRef('')
  const timer = useRef<ReturnType<typeof setTimeout>>()
  const controle = useRef<AbortController>()
  const callback = useRef(aoEncontrar)
  useEffect(() => {
    callback.current = aoEncontrar
  }, [aoEncontrar])
  useEffect(
    () => () => {
      clearTimeout(timer.current)
      controle.current?.abort()
    },
    [],
  )

  const consultar = useCallback(async (cep: string) => {
    if (cep === ultimo.current) return
    ultimo.current = cep
    controle.current?.abort()
    const c = new AbortController()
    controle.current = c
    setStatus('buscando')
    try {
      const endereco = await cepProvider.buscar(cep, c.signal)
      if (c.signal.aborted) return
      if (endereco) callback.current(endereco)
      setStatus(endereco ? 'encontrado' : 'nao_encontrado')
    } catch {
      if (c.signal.aborted) return
      ultimo.current = '' // serviço fora: sair do campo tenta de novo
      setStatus('indisponivel')
    }
  }, [])

  const aoDigitar = useCallback(
    (valor: string) => {
      clearTimeout(timer.current)
      const cep = somenteDigitos(valor)
      if (cep.length === 8) {
        timer.current = setTimeout(() => void consultar(cep), ESPERA_MS)
        return
      }
      // CEP incompleto: cancela a busca em andamento e limpa o aviso
      controle.current?.abort()
      ultimo.current = ''
      setStatus('ocioso')
    },
    [consultar],
  )

  const aoSair = useCallback(
    (valor: string) => {
      const cep = somenteDigitos(valor)
      if (cep.length !== 8) return
      clearTimeout(timer.current)
      void consultar(cep)
    },
    [consultar],
  )

  return { status, aoDigitar, aoSair }
}
