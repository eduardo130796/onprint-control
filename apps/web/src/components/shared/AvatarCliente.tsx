import { useState } from 'react'
import { iniciais, nomeCliente } from '@onprint/shared'
import { cn } from '@/lib/utils'

const TAMANHOS = {
  sm: 'h-8 w-8 text-[0.6875rem]',
  md: 'h-10 w-10 text-sm',
  lg: 'h-16 w-16 text-xl',
} as const

/** Matiz fixo por nome: o mesmo cliente tem sempre a mesma cor */
function matiz(texto: string) {
  let h = 0
  for (const c of texto) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

interface AvatarClienteProps {
  cliente: { nome: string; fantasia?: string | null; fotoUrl?: string | null }
  tamanho?: keyof typeof TAMANHOS
  className?: string
}

/**
 * Foto/imagem do cliente (miniatura carregada só quando aparece na tela); sem foto, ou se ela não
 * carregar, as iniciais do nome de exibição num círculo colorido.
 */
export function AvatarCliente({ cliente, tamanho = 'md', className }: AvatarClienteProps) {
  const [falhou, setFalhou] = useState<string | null>(null)
  const nome = nomeCliente(cliente)
  const foto = cliente.fotoUrl && falhou !== cliente.fotoUrl ? cliente.fotoUrl : null
  const classes = cn('flex shrink-0 items-center justify-center overflow-hidden rounded-full', TAMANHOS[tamanho], className)

  if (foto) {
    return (
      <span className={cn(classes, 'bg-white ring-1 ring-border')}>
        <img src={foto} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" onError={() => setFalhou(foto)} />
      </span>
    )
  }
  return (
    <span className={cn(classes, 'font-semibold text-white')} style={{ backgroundColor: `hsl(${matiz(nome)} 42% 42%)` }} aria-hidden="true">
      {iniciais(nome) || '?'}
    </span>
  )
}
