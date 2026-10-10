import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Clock, CornerDownLeft, FilePlus2, FileText, Loader2, Moon, Plus, Search, ShoppingCart, Sun, User, type LucideIcon } from 'lucide-react'
import { buscaApi } from '@/api/relatorios'
import { paginas, podeAbrir } from '@/app/navigation'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { useAuth } from '@/hooks/useAuth'
import { useDebounce } from '@/hooks/useDebounce'
import { usePermissoes } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

function normalizar(texto: string) {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

type IconeResultado = LucideIcon

interface Resultado {
  chave: string
  grupo: string
  icone: IconeResultado
  titulo: string
  detalhe?: string
  status?: { entidade: 'orcamento' | 'pedido'; codigo: string }
  /** Para onde vai (ou a ação a executar) */
  path?: string
  acao?: () => void
  /** Ação de criação: ícone no tom da marca */
  criar?: boolean
}

// Recentes: conveniência só deste navegador (some sem problema se o armazenamento falhar)
const CHAVE_RECENTES = 'onprint:busca-recentes'
type Recente = Pick<Resultado, 'chave' | 'titulo' | 'detalhe' | 'path'> & { tipo: 'cliente' | 'pedido' | 'orcamento' | 'tela' }
const ICONE_RECENTE: Record<Recente['tipo'], IconeResultado> = { cliente: User, pedido: ShoppingCart, orcamento: FileText, tela: Clock }

function lerRecentes(): Recente[] {
  try {
    const v = JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? '[]') as unknown
    return Array.isArray(v) ? (v as Recente[]).filter((r) => r && typeof r.path === 'string').slice(0, 5) : []
  } catch {
    return []
  }
}
function guardarRecente(r: Recente) {
  try {
    const lista = [r, ...lerRecentes().filter((x) => x.chave !== r.chave)].slice(0, 5)
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(lista))
  } catch {
    // sem armazenamento: só não lembra
  }
}

const tipoDaChave = (chave: string): Recente['tipo'] => (chave.startsWith('c:') ? 'cliente' : chave.startsWith('p:') ? 'pedido' : chave.startsWith('o:') ? 'orcamento' : 'tela')

/**
 * Busca global "Localizar…" (Ctrl+K): ações rápidas (novo orçamento, novo cliente…), telas, recentes e,
 * a partir de 2 letras, clientes, orçamentos e pedidos (a API filtra pelas permissões e pelo escopo "só os meus").
 */
export function BuscaGlobal() {
  const navigate = useNavigate()
  const { usuario, definirModoTela } = useAuth()
  const [aberta, setAberta] = useState(false)
  const [termo, setTermo] = useState('')
  const [selecionado, setSelecionado] = useState(0)
  const [recentes, setRecentes] = useState<Recente[]>([])
  const lista = useRef<HTMLUListElement>(null)
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
  useEffect(() => {
    if (aberta) setRecentes(lerRecentes())
  }, [aberta])

  const escuro = usuario?.modoTela === 'escuro'
  const resultados = useMemo<Resultado[]>(() => {
    const t = normalizar(termo.trim())
    const casa = (texto: string) => !t || normalizar(texto).includes(t)
    const podeCriarOrcamento = pode('orcamentos', 'criar')

    const acoes: Resultado[] = paginas
      .filter((p) => p.novo && !p.legado && podeAbrir(pode, { ...p, acao: 'criar' }) && casa(`${p.novo} ${p.moduloTitulo}`))
      .slice(0, t ? 4 : 5)
      .map((p) => ({ chave: `novo:${p.path}`, grupo: 'Ações', icone: Plus, titulo: p.novo!, detalhe: p.moduloTitulo, path: `${p.path}/novo`, criar: true }))
    const tema = escuro ? 'Mudar para o modo claro' : 'Mudar para o modo escuro'
    if (casa(`${tema} tema aparencia escuro claro`) && t) {
      acoes.push({ chave: 'acao:tema', grupo: 'Ações', icone: escuro ? Sun : Moon, titulo: tema, acao: () => void definirModoTela(escuro ? 'claro' : 'escuro') })
    }

    const telas: Resultado[] = paginas
      .filter((p) => podeAbrir(pode, p) && t && casa(`${p.moduloTitulo} ${p.titulo}`))
      .slice(0, 5)
      .map((p) => ({ chave: `tela:${p.path}`, grupo: 'Telas', icone: p.icone, titulo: p.titulo, detalhe: p.moduloTitulo !== p.titulo ? p.moduloTitulo : undefined, path: p.path }))

    if (!t) {
      const rec = recentes.map((r) => ({ chave: r.chave, grupo: 'Recentes', icone: ICONE_RECENTE[r.tipo], titulo: r.titulo, detalhe: r.detalhe, path: r.path }))
      return [...rec, ...acoes]
    }

    const r = termoApi.length >= 2 ? registros.data : undefined
    const clientes: Resultado[] = (r?.clientes ?? []).flatMap((c, i) => [
      { chave: `c:${c.id}`, grupo: 'Clientes', icone: User, titulo: c.nome, detalhe: c.detalhe ?? undefined, path: `/clientes/${c.id}` },
      // Atalho direto para os dois primeiros clientes encontrados
      ...(podeCriarOrcamento && i < 2 ? [{ chave: `oc:${c.id}`, grupo: 'Clientes', icone: FilePlus2, titulo: `Novo orçamento para ${c.nome}`, path: `/orcamentos/novo?cliente=${c.id}`, criar: true }] : []),
    ])
    return [
      ...clientes,
      ...(r?.pedidos ?? []).map((p) => ({ chave: `p:${p.id}`, grupo: 'Pedidos', icone: ShoppingCart, titulo: p.numero, detalhe: p.cliente, status: { entidade: 'pedido' as const, codigo: p.status }, path: `/pedidos/${p.id}` })),
      ...(r?.orcamentos ?? []).map((o) => ({ chave: `o:${o.id}`, grupo: 'Orçamentos', icone: FileText, titulo: o.numero, detalhe: o.cliente, status: { entidade: 'orcamento' as const, codigo: o.status }, path: `/orcamentos/${o.id}` })),
      ...acoes,
      ...telas,
    ]
  }, [termo, termoApi, registros.data, pode, recentes, escuro, definirModoTela])

  // Mantém o item escolhido à vista ao navegar com as setas
  useEffect(() => {
    lista.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [selecionado])

  function executar(r: Resultado) {
    setAberta(false)
    setTermo('')
    setSelecionado(0)
    if (r.acao) return r.acao()
    if (!r.path) return
    if (!r.criar && r.grupo !== 'Ações') guardarRecente({ chave: r.chave, titulo: r.titulo, detalhe: r.detalhe, path: r.path, tipo: tipoDaChave(r.chave) })
    navigate(r.path)
  }

  function onKeyDownLista(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelecionado((s) => Math.min(s + 1, resultados.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelecionado((s) => Math.max(s - 1, 0))
    } else if (e.key === 'Enter' && resultados[selecionado]) {
      e.preventDefault()
      executar(resultados[selecionado])
    }
  }

  const buscando = termoApi.length >= 2 && registros.isFetching

  return (
    <>
      <button
        type="button"
        onClick={() => setAberta(true)}
        aria-label="Localizar (Ctrl+K)"
        title="Localizar (Ctrl+K)"
        className="flex h-10 w-10 shrink-0 items-center justify-center gap-2 rounded-xl border border-white/25 bg-white/[0.12] text-sm font-medium text-white transition-colors hover:border-marca hover:bg-white/20 md:w-full md:min-w-[9rem] md:max-w-md md:justify-start md:px-3"
      >
        <Search className="h-4 w-4 shrink-0 text-marca" />
        <span className="hidden min-w-0 flex-1 truncate text-left md:inline">Localizar…</span>
        <kbd className="hidden shrink-0 rounded bg-white/20 px-1.5 py-0.5 text-[0.625rem] font-semibold text-white xl:inline">Ctrl K</kbd>
      </button>

      <Dialog
        open={aberta}
        onOpenChange={(v) => {
          setAberta(v)
          if (!v) setTermo('')
        }}
      >
        <DialogContent className="top-[18%] max-w-xl translate-y-0 gap-0 overflow-hidden rounded-2xl p-0 [&>button:last-child]:hidden">
          <DialogTitle className="sr-only">Localizar</DialogTitle>
          <DialogDescription className="sr-only">Busque clientes, orçamentos, pedidos, telas e ações</DialogDescription>
          <div className="flex items-center gap-3 border-b border-border px-4">
            <Search className="h-5 w-5 text-texto-secundario" />
            <input
              autoFocus
              value={termo}
              onChange={(e) => {
                setTermo(e.target.value)
                setSelecionado(0)
              }}
              onKeyDown={onKeyDownLista}
              placeholder="Buscar cliente, pedido, orçamento, tela ou ação…"
              className="h-14 flex-1 bg-transparent text-[0.9375rem] outline-none placeholder:text-muted-foreground"
              aria-label="Localizar"
              role="combobox"
              aria-expanded
              aria-controls="busca-global-resultados"
            />
            {buscando && <Loader2 className="h-4 w-4 animate-spin text-marca-escuro" />}
            <kbd className="rounded-md border border-border px-1.5 py-0.5 text-[0.625rem] font-semibold text-texto-secundario">Esc</kbd>
          </div>
          <ul ref={lista} id="busca-global-resultados" className="max-h-[min(60vh,420px)] overflow-y-auto p-2" role="listbox">
            {resultados.length === 0 && (
              <li className="px-3 py-10 text-center text-sm text-texto-secundario">{buscando ? 'Buscando…' : termo.trim().length < 2 ? 'Digite ao menos 2 letras.' : `Nada encontrado para “${termo.trim()}”.`}</li>
            )}
            {resultados.map((r, i) => {
              const Icone = r.icone
              const novoGrupo = i === 0 || resultados[i - 1]!.grupo !== r.grupo
              const ativo = i === selecionado
              return (
                <li key={r.chave} role="option" aria-selected={ativo}>
                  {novoGrupo && <p className="px-3 pb-1.5 pt-3 text-[0.65625rem] font-semibold uppercase tracking-[0.12em] text-texto-secundario/80">{r.grupo}</p>}
                  <button
                    type="button"
                    tabIndex={-1}
                    onMouseMove={() => setSelecionado(i)}
                    onClick={() => executar(r)}
                    className={cn('flex w-full items-center gap-3 rounded-xl px-2.5 py-2 text-left text-sm transition-colors', ativo ? 'bg-fundo text-tinta' : 'text-tinta/90')}
                  >
                    <span
                      className={cn(
                        'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                        r.criar ? 'bg-marca-suave text-marca-escuro' : ativo ? 'bg-card text-tinta shadow-sm' : 'bg-fundo text-texto-secundario',
                      )}
                    >
                      <Icone className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={cn('block truncate font-medium', r.status && 'font-mono')}>{r.titulo}</span>
                      {r.detalhe && <span className="block truncate text-xs text-texto-secundario">{r.detalhe}</span>}
                    </span>
                    {r.status && <StatusBadge entidade={r.status.entidade} codigo={r.status.codigo} className="text-[0.625rem]" />}
                    <CornerDownLeft className={cn('h-3.5 w-3.5 shrink-0 text-texto-secundario transition-opacity', ativo ? 'opacity-100' : 'opacity-0')} />
                  </button>
                </li>
              )
            })}
          </ul>
          <div className="flex items-center gap-4 border-t border-border bg-fundo/60 px-4 py-2.5 text-[0.6875rem] text-texto-secundario">
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-card px-1 font-sans">↑</kbd>
              <kbd className="rounded border border-border bg-card px-1 font-sans">↓</kbd> navegar
            </span>
            <span className="flex items-center gap-1.5">
              <kbd className="rounded border border-border bg-card px-1 font-sans">Enter</kbd> abrir
            </span>
            <span className="ml-auto hidden sm:inline">Dica: digite o nº do pedido ou o nome do cliente</span>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
