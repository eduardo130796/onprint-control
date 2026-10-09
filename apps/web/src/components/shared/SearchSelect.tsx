import { useEffect, useId, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, Loader2, Search, X } from 'lucide-react'
import { useDebounce } from '@/hooks/useDebounce'
import { cn } from '@/lib/utils'

export interface OpcaoBusca {
  id: string
  rotulo: string
  detalhe?: string
}

interface SearchSelectProps {
  /** Chave de cache da busca (ex.: "clientes-busca") */
  chave: string
  buscar: (termo: string) => Promise<OpcaoBusca[]>
  valor: OpcaoBusca | null
  onChange: (opcao: OpcaoBusca | null) => void
  placeholder?: string
  desabilitado?: boolean
  invalido?: boolean
  id?: string
  /** Ação extra no fim da lista (ex.: "Cadastrar novo cliente") */
  rodape?: React.ReactNode
}

/** Campo de seleção com busca assíncrona no servidor (debounce, teclado e estado de carregamento). */
export function SearchSelect({ chave, buscar, valor, onChange, placeholder = 'Buscar…', desabilitado, invalido, id, rodape }: SearchSelectProps) {
  const [aberto, setAberto] = useState(false)
  const [termo, setTermo] = useState('')
  const [ativo, setAtivo] = useState(0)
  const termoAtrasado = useDebounce(termo.trim(), 300)
  const raiz = useRef<HTMLDivElement>(null)
  const listaId = useId()
  const consulta = useQuery({ queryKey: [chave, termoAtrasado], queryFn: () => buscar(termoAtrasado), enabled: aberto, staleTime: 30_000 })
  const opcoes = consulta.data ?? []

  useEffect(() => {
    if (!aberto) return
    const fechar = (e: MouseEvent) => {
      if (!raiz.current?.contains(e.target as Node)) setAberto(false)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [aberto])

  function escolher(opcao: OpcaoBusca) {
    onChange(opcao)
    setAberto(false)
    setTermo('')
  }

  return (
    <div ref={raiz} className="relative">
      {aberto ? (
        <div className="flex h-10 items-center gap-2 rounded-lg border border-marca bg-card px-3 ring-2 ring-ring">
          <Search className="h-4 w-4 shrink-0 text-texto-secundario" />
          <input
            id={id}
            autoFocus
            role="combobox"
            aria-expanded
            aria-controls={listaId}
            value={termo}
            onChange={(e) => {
              setTermo(e.target.value)
              setAtivo(0)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault()
                setAtivo((a) => Math.min(a + 1, opcoes.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setAtivo((a) => Math.max(a - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                if (opcoes[ativo]) escolher(opcoes[ativo])
              } else if (e.key === 'Escape') setAberto(false)
            }}
            placeholder={placeholder}
            className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
          {consulta.isFetching && <Loader2 className="h-4 w-4 animate-spin text-texto-secundario" />}
        </div>
      ) : (
        <button
          id={id}
          type="button"
          disabled={desabilitado}
          onClick={() => setAberto(true)}
          aria-invalid={invalido}
          className={cn(
            'flex h-10 w-full items-center gap-2 rounded-lg border border-input bg-card px-3 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-60 aria-[invalid=true]:border-coral',
          )}
        >
          <span className={cn('flex-1 truncate', !valor && 'text-muted-foreground')}>
            {valor ? valor.rotulo : placeholder}
            {valor?.detalhe && <span className="ml-2 text-xs text-texto-secundario">{valor.detalhe}</span>}
          </span>
          {valor && !desabilitado ? (
            <span
              role="button"
              tabIndex={-1}
              aria-label="Limpar"
              onClick={(e) => {
                e.stopPropagation()
                onChange(null)
              }}
              className="rounded p-0.5 text-texto-secundario hover:bg-accent"
            >
              <X className="h-3.5 w-3.5" />
            </span>
          ) : (
            <ChevronsUpDown className="h-4 w-4 text-texto-secundario" />
          )}
        </button>
      )}

      {aberto && (
        <div className="absolute z-40 mt-1 w-full overflow-hidden rounded-xl border bg-popover shadow-suave">
          <ul id={listaId} role="listbox" className="max-h-64 overflow-y-auto p-1">
            {!consulta.isFetching && opcoes.length === 0 && (
              <li className="px-3 py-3 text-center text-sm text-texto-secundario">{consulta.isError ? 'Erro ao buscar.' : 'Nada encontrado.'}</li>
            )}
            {opcoes.map((o, i) => (
              <li key={o.id} role="option" aria-selected={valor?.id === o.id}>
                <button
                  type="button"
                  onMouseEnter={() => setAtivo(i)}
                  onClick={() => escolher(o)}
                  className={cn('flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm', i === ativo && 'bg-accent text-tinta')}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate">{o.rotulo}</span>
                    {o.detalhe && <span className="block truncate text-xs text-texto-secundario">{o.detalhe}</span>}
                  </span>
                  {valor?.id === o.id && <Check className="h-4 w-4 text-marca-escuro" />}
                </button>
              </li>
            ))}
          </ul>
          {rodape && <div className="border-t border-border p-1">{rodape}</div>}
        </div>
      )}
    </div>
  )
}
