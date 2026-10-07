import { useState } from 'react'
import { X } from 'lucide-react'

interface TagsInputProps {
  valor: string[]
  onChange: (tags: string[]) => void
  desabilitado?: boolean
  placeholder?: string
}

/** Etiquetas livres: Enter ou vírgula adiciona; Backspace no campo vazio remove a última. */
export function TagsInput({ valor, onChange, desabilitado, placeholder = 'Digite e tecle Enter' }: TagsInputProps) {
  const [texto, setTexto] = useState('')

  function adicionar() {
    const tag = texto.trim().replace(/,$/, '')
    if (tag && !valor.includes(tag)) onChange([...valor, tag])
    setTexto('')
  }

  return (
    <div className="flex min-h-10 flex-wrap items-center gap-1.5 rounded-lg border border-input bg-card px-2 py-1.5 focus-within:ring-2 focus-within:ring-ring">
      {valor.map((tag) => (
        <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-medium text-grafite">
          {tag}
          {!desabilitado && (
            <button type="button" onClick={() => onChange(valor.filter((t) => t !== tag))} aria-label={`Remover ${tag}`}>
              <X className="h-3 w-3" />
            </button>
          )}
        </span>
      ))}
      <input
        value={texto}
        disabled={desabilitado}
        onChange={(e) => setTexto(e.target.value)}
        onBlur={adicionar}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ',') {
            e.preventDefault()
            adicionar()
          } else if (e.key === 'Backspace' && !texto && valor.length) {
            onChange(valor.slice(0, -1))
          }
        }}
        placeholder={valor.length ? '' : placeholder}
        className="min-w-24 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground"
      />
    </div>
  )
}
