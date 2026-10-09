import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { CornerDownLeft, FileText, Loader2, Search, ShoppingCart, User, type LucideIcon } from 'lucide-react'
import { buscaApi } from '@/api/relatorios'
import { paginas } from '@/app/navigation'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermissoes } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

interface Resultado {
  chave: string
  grupo: string
  icone: LucideIcon
  titulo: string
  detalhe?: string
  status?: { entidade: 'orcamento' | 'pedido'; codigo: string }
  path: string
}

/**
 * Busca global "Localizar…" (Ctrl+K): telas do sistema e, a partir de 2 letras, clientes,
 * orçamentos e pedidos (a API filtra pelas permissões e pelo escopo "só os meus").
 */
export function BuscaGlobal() {
  const navigate = useNavigate()
  const [aberta, setAberta] = useState(false)
  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  const termoApi = useDebounce(termo.trim(), 250)
  const pode = usePermissoes()
  const registros = useQuery({ queryKey: ['busca-global', termoApi], queryFn: () => buscaApi.buscar(termoApi), enabled: aberta && termoApi.length >= 2, staleTime: 30_000 })

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setAberta((a) => !a)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const resultados = useMemo<Resultado[]>(() => {
    const t = normalizar(termo.trim())
    const telas = paginas
      .filter((p) => pode(p.modulo, p.acao) && (!t || normalizar(`${p.moduloTitulo} ${p.titulo}`).includes(t)))
      .slice(0, t ? 5 : 12)
      .map((p) => ({ chave: `tela:${p.path}`, grupo: 'Telas', icone: p.icone, titulo: p.titulo, detalhe: p.moduloTitulo !== p.titulo ? p.moduloTitulo : undefined, path: p.path }))
    const r = termoApi.length >= 2 ? registros.data : undefined
    if (!r) return telas
    return [
      ...r.clientes.map((c) => ({ chave: `c:${c.id}`, grupo: 'Clientes', icone: User, titulo: c.nome, detalhe: c.detalhe ?? undefined, path: `/clientes/${c.id}` })),
      ...r.pedidos.map((p) => ({ chave: `p:${p.id}`, grupo: 'Pedidos', icone: ShoppingCart, titulo: p.numero, detalhe: p.cliente, status: { entidade: 'pedido' as const, codigo: p.status }, path: `/pedidos/${p.id}` })),
      ...r.orcamentos.map((o) => ({ chave: `o:${o.id}`, grupo: 'Orçamentos', icone: FileText, titulo: o.numero, detalhe: o.cliente, status: { entidade: 'orcamento' as const, codigo: o.status }, path: `/orcamentos/${o.id}` })),
      ...telas,
    ]
  }, [termo, termoApi, registros.data, pode])

  function abrir(path: string) {
    setAberta(false)
    setTermo('')
    navigate(path)
  }

  function onKeyDownLista(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelecionado((s) => Math.min(s + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelecionado((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && resultados[selecionado]) {
      abrir(resultados[selecionado].path)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        className="flex h-10 w-full max-w-md items-center gap-2 rounded-xl border border-white/25 bg-white/[0.12] px-3 text-sm font-medium text-white transition-colors hover:border-marca hover:bg-white/20"
      >
        <Search className="h-4 w-4 text-marca" />
        <span className="flex-1 text-left">Localizar…</span>
        <kbd className="hidden rounded bg-white/20 px-1.5 py-0.5 text-[10px] font-semibold text-white sm:inline">Ctrl K</kbd>
      </button>

      <Dialog open={aberta} onOpenChange={setAberta}>
        <DialogContent className="gap-0 p-0">
          <DialogTitle className="sr-only">Localizar</DialogTitle>
          <DialogDescription className="sr-only">Busque clientes, orçamentos, pedidos e telas</DialogDescription>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 text-texto-secundario" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value)
                setSelecionado(0)
              }}
              onKeyDown={onKeyDownLista}
              placeholder="Cliente, nº do orçamento ou pedido, tela…"
              className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              aria-label="Localizar"
            />
            {registros.isFetching && <Loader2 className="h-4 w-4 animate-spin text-marca-escuro" />}
          </div>
          <ul className="max-h-96 overflow-y-auto p-2" role="listbox">
            {resultados.length === 0 && <li className="px-3 py-6 text-center text-sm text-texto-secundario">Nada encontrado.</li>}
            {resultados.map((r, i) => {
              const Icone = r.icone
              const novoGrupo = i === 0 || resultados[i - 1]!.grupo !== r.grupo
              return (
                <li key={r.chave} role="option" aria-selected={i === selecionado}>
                  {novoGrupo && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">{r.grupo}</p>}
                  <button
                    type="button"
                    onMouseEnter={() => setSelecionado(i)}
                    onClick={() => abrir(r.path)}
                    className={cn('flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm', i === selecionado && 'bg-accent text-tinta')}
                  >
                    <Icone className="h-4 w-4 shrink-0 text-texto-secundario" />
                    <span className="min-w-0 flex-1 truncate">
                      {r.titulo}
                      {r.detalhe && <span className="ml-2 text-xs text-texto-secundario">{r.detalhe}</span>}
                    </span>
                    {r.status && <StatusBadge entidade={r.status.entidade} codigo={r.status.codigo} className="text-[10px]" />}
                    {i === selecionado && <CornerDownLeft className="h-3.5 w-3.5 text-texto-secundario" />}
                  </button>
                </li>
              )
            })}
          </ul>
        </DialogContent>
      </Dialog>
    </>
  )
}
