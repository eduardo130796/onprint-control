import { useEffect, useState } from 'react'

export function useDebounce<T>(valor: T, atrasoMs = 350): T {
  const [atual, setAtual] = useState(valor)
  useEffect(() => {
    const id = setTimeout(() => setAtual(valor), atrasoMs)
    return () => clearTimeout(id)
  }, [valor, atrasoMs])
  return atual
}
