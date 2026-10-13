import { formatarTelefone } from '@onprint/shared'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, NavLink, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ClipboardList, Clock, House, LayoutGrid, Mail, MapPin, Phone, Search } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useVitrine, useWhatsappGeral } from '../contexto'
import { botao } from '../estilos'
import { linkRede } from '../formato'
import { classesFade, useRolagemLateral } from '../rolagem'
import { Container } from './comum'
import { IconeFacebook, IconeInstagram, IconeTiktok, IconeWhatsapp, IconeYoutube } from './icones'

/** Logo da gráfica (ou a inicial na cor do tema) */
export function MarcaLoja({ grande }: { grande?: boolean }) {
  const { vitrine } = useVitrine()
  const { logoUrl, titulo, nome } = vitrine.empresa
  const [falhou, setFalhou] = useState(false)
  if (logoUrl && !falhou) {
    return (
      <img
        src={logoUrl}
        alt={`Logo ${nome}`}
        onError={() => setFalhou(true)}
        className={cn('w-auto shrink-0 rounded-lg object-contain', grande ? 'h-14 max-w-[12rem]' : 'h-10 max-w-[6.5rem] sm:h-11 sm:max-w-[10rem]')}
      />
    )
  }
  return (
    <span
      aria-hidden="true"
      className={cn(
        'vt-titulo flex shrink-0 items-center justify-center rounded-xl bg-marca font-extrabold text-marca-contraste',
        grande ? 'h-14 w-14 text-2xl' : 'h-10 w-10 text-lg sm:h-11 sm:w-11',
      )}
    >
      {(titulo || nome).trim().charAt(0).toUpperCase()}
    </span>
  )
}

function Busca({ id, className }: { id: string; className?: string }) {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const [params] = useSearchParams()
  const atual = pathname === '/produtos' || pathname.startsWith('/categoria/') ? (params.get('busca') ?? '') : ''
  const [texto, setTexto] = useState(atual)
  useEffect(() => setTexto(atual), [atual])

  const buscar = (e: FormEvent) => {
    e.preventDefault()
    const t = texto.trim()
    navigate(t ? `/produtos?busca=${encodeURIComponent(t)}` : '/produtos')
  }
  return (
    <form role="search" onSubmit={buscar} className={cn('relative', className)}>
      <label htmlFor={id} className="sr-only">
        Buscar produtos
      </label>
      <Search className="pointer-events-none absolute left-4 top-1/2 h-[1.125rem] w-[1.125rem] -translate-y-1/2 text-slate-400" aria-hidden="true" />
      <input
        id={id}
        type="search"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        placeholder="Buscar produtos: banner, cartão, adesivo…"
        maxLength={80}
        enterKeyHint="search"
        className="h-11 w-full rounded-full border border-transparent bg-slate-100 pl-11 pr-4 text-[0.9375rem] text-slate-900 transition placeholder:text-slate-500 focus:border-marca focus:bg-white focus:outline-none focus:ring-4 focus:ring-marca/15"
      />
    </form>
  )
}

/** Pulsa quando entra item na lista (não ao abrir a página) */
function usePulsoLista(n: number) {
  const [pulso, setPulso] = useState(false)
  const anterior = useRef(n)
  useEffect(() => {
    const subiu = n > anterior.current
    anterior.current = n
    if (!subiu) return
    setPulso(true)
    const t = window.setTimeout(() => setPulso(false), 600)
    return () => window.clearTimeout(t)
  }, [n])
  return pulso
}

/** Quantos itens na lista ("9+" acima de 9, para caber no selo) */
function SeloLista({ n, className }: { n: number; className?: string }) {
  return (
    <span aria-hidden="true" className={cn('flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[0.6875rem] font-bold leading-none', className)}>
      {n > 9 ? '9+' : n}
    </span>
  )
}

const rotuloLista = (n: number) => `Lista de orçamento, ${n} ${n === 1 ? 'item' : 'itens'}`

function BotaoLista() {
  const { lista } = useVitrine()
  const n = lista.itens.length
  const pulso = usePulsoLista(n)
  return (
    <Link
      to="/lista"
      aria-label={rotuloLista(n)}
      className={cn(botao.base, botao.primario, 'relative h-11 gap-1.5 px-3.5 text-sm sm:gap-2 sm:px-5', pulso && 'animate-[vt-pulso_0.6s_ease-out]')}
    >
      <ClipboardList />
      <span className="sm:hidden">Lista</span>
      <span className="hidden sm:inline">Lista de orçamento</span>
      <SeloLista n={n} className={n ? 'bg-white text-slate-900' : 'bg-white/25 text-marca-contraste max-sm:hidden'} />
    </Link>
  )
}

/**
 * Abas do pé da tela no celular: somem nas páginas que têm a própria barra de ação (produto e lista com itens),
 * para não empilhar duas barras.
 */
function useBarraAbasVisivel(): boolean {
  const { pathname } = useLocation()
  const { lista } = useVitrine()
  return !pathname.startsWith('/produto/') && !(pathname === '/lista' && lista.itens.length > 0)
}

export function Topo() {
  const { vitrine } = useVitrine()
  const { titulo, slogan } = vitrine.empresa
  const { pathname } = useLocation()
  const wa = useWhatsappGeral()
  const abas = useBarraAbasVisivel()
  const categorias = vitrine.categorias.filter((c) => c.quantidade > 0)
  const faixa = useRolagemLateral<HTMLElement>(categorias.length)
  const chip = ({ isActive }: { isActive: boolean }) =>
    cn(
      'shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca',
      isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
    )
  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur-xl">
        <Container className="flex h-[3.75rem] items-center gap-3 sm:h-[4.25rem] sm:gap-5 lg:h-20">
          <Link
            to="/"
            className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg sm:gap-3 lg:max-w-[45%] lg:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
            aria-label={`${titulo} — início`}
          >
            <MarcaLoja />
            <span className="min-w-0">
              <span className="vt-titulo line-clamp-1 text-[1.0625rem] font-extrabold leading-tight text-slate-900 sm:line-clamp-2 sm:text-lg">{titulo}</span>
              {slogan && <span className="hidden truncate text-xs text-slate-500 xl:block">{slogan}</span>}
            </span>
          </Link>
          <Busca id="busca-topo" className="ml-auto hidden min-w-[12rem] max-w-md flex-1 lg:block xl:max-w-xl" />
          <div className="ml-auto flex shrink-0 items-center gap-2 lg:ml-0">
            {wa && (
              <a
                href={wa}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Chamar no WhatsApp"
                className={cn(
                  botao.base,
                  'h-11 w-11 border border-slate-200 bg-white text-[#128C4B] hover:border-[#25D366] hover:bg-[#25D366]/10 xl:w-auto xl:px-4 xl:text-sm',
                  // No celular o WhatsApp fica nas abas; nas páginas sem abas (produto, lista) ele volta para o topo
                  abas && 'max-lg:hidden',
                )}
              >
                <IconeWhatsapp />
                <span className="hidden xl:inline">WhatsApp</span>
              </a>
            )}
            <BotaoLista />
          </div>
        </Container>
      </header>
      {/* Celular: a busca só no início (Produtos tem a sua); as categorias ficam no início e em Produtos */}
      <div className={cn('border-b border-slate-200/80 bg-white', pathname !== '/' && 'max-lg:hidden')}>
        <Container className="py-3 lg:py-0">
          <Busca id="busca-celular" className="lg:hidden" />
          <nav ref={faixa.ref} aria-label="Categorias" className={cn('vt-sem-barra hidden items-center gap-1 overflow-x-auto lg:flex lg:h-12', classesFade(faixa))}>
            <NavLink to="/" end className={chip}>
              Início
            </NavLink>
            <NavLink to="/produtos" className={chip}>
              Todos os produtos
            </NavLink>
            {categorias.map((c) => (
              <NavLink key={c.id} to={`/categoria/${c.id}`} className={chip}>
                {c.nome}
              </NavLink>
            ))}
          </nav>
        </Container>
      </div>
    </>
  )
}

/** Abas fixas no pé da tela do celular (como num aplicativo): início, produtos, busca, lista e WhatsApp */
export function BarraAbas() {
  const { lista } = useVitrine()
  const wa = useWhatsappGeral()
  const visivel = useBarraAbasVisivel()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const n = lista.itens.length
  const pulso = usePulsoLista(n)
  if (!visivel) return null
  const noCatalogo = pathname === '/produtos' || pathname.startsWith('/categoria/')
  const aba = (ativa: boolean) =>
    cn(
      'relative flex min-h-[3.5rem] min-w-0 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-[0.6875rem] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-marca [&_svg]:h-[1.375rem] [&_svg]:w-[1.375rem]',
      ativa ? 'text-marca-escuro' : 'text-slate-500 active:text-slate-900',
    )
  return (
    <nav aria-label="Navegação principal" className="vt-lados fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
      <div className="mx-auto flex max-w-lg items-stretch px-1">
        <NavLink to="/" end className={({ isActive }) => aba(isActive)}>
          <House aria-hidden="true" /> Início
        </NavLink>
        <Link to="/produtos" className={aba(noCatalogo)} aria-current={noCatalogo ? 'page' : undefined}>
          <LayoutGrid aria-hidden="true" /> Produtos
        </Link>
        <button type="button" className={aba(false)} onClick={() => navigate('/produtos', { state: { buscar: true }, replace: noCatalogo })}>
          <Search aria-hidden="true" /> Buscar
        </button>
        <NavLink to="/lista" className={({ isActive }) => aba(isActive)} aria-label={rotuloLista(n)}>
          <span className={cn('relative', pulso && 'animate-[vt-pulso_0.6s_ease-out]')}>
            <ClipboardList aria-hidden="true" />
            {n > 0 && <SeloLista n={n} className="absolute -right-3 -top-2 bg-marca text-marca-contraste ring-2 ring-white" />}
          </span>
          Lista
        </NavLink>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(aba(false), 'text-[#128C4B] active:text-[#0B3B1F]')}>
            <IconeWhatsapp aria-hidden="true" /> WhatsApp
          </a>
        )}
      </div>
    </nav>
  )
}

const REDES = [
  { chave: 'instagram', rotulo: 'Instagram', Icone: IconeInstagram },
  { chave: 'facebook', rotulo: 'Facebook', Icone: IconeFacebook },
  { chave: 'tiktok', rotulo: 'TikTok', Icone: IconeTiktok },
  { chave: 'youtube', rotulo: 'YouTube', Icone: IconeYoutube },
] as const

export function RedesSociais({ className }: { className?: string }) {
  const { vitrine } = useVitrine()
  const redes = REDES.map((r) => ({ ...r, url: linkRede(r.chave, vitrine.empresa.redes[r.chave]) })).filter((r) => r.url)
  if (!redes.length) return null
  return (
    <ul className={cn('flex gap-2', className)}>
      {redes.map(({ chave, rotulo, Icone, url }) => (
        <li key={chave}>
          <a
            href={url!}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={rotulo}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 transition hover:border-marca hover:text-marca-escuro focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
          >
            <Icone className="h-[1.125rem] w-[1.125rem]" />
          </a>
        </li>
      ))}
    </ul>
  )
}

/** Linhas de contato (WhatsApp, telefone, e-mail, endereço) */
export function ListaContatos({ className }: { className?: string }) {
  const { vitrine, whatsapp } = useVitrine()
  const e = vitrine.empresa
  const wa = whatsapp()
  const itens = [
    wa && e.whatsapp ? { Icone: IconeWhatsapp, texto: formatarTelefone(e.whatsapp), href: wa, externo: true, rotulo: 'WhatsApp' } : null,
    e.telefone ? { Icone: Phone, texto: formatarTelefone(e.telefone), href: `tel:${e.telefone.replace(/[^\d+]/g, '')}`, rotulo: 'Telefone' } : null,
    e.email ? { Icone: Mail, texto: e.email, href: `mailto:${e.email}`, rotulo: 'E-mail' } : null,
    e.endereco
      ? { Icone: MapPin, texto: e.endereco, href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.endereco)}`, externo: true, rotulo: 'Endereço' }
      : null,
  ].filter((i) => i !== null)
  if (!itens.length) return null
  return (
    <ul className={cn('space-y-3', className)}>
      {itens.map(({ Icone, texto, href, externo, rotulo }) => (
        <li key={rotulo}>
          <a
            href={href}
            {...(externo ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            className="group flex min-h-11 items-start gap-3 rounded-lg text-slate-700 transition hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-suave text-marca-escuro">
              <Icone className="h-4 w-4" />
            </span>
            <span className="min-w-0 pt-0.5">
              <span className="block text-xs font-medium uppercase tracking-wider text-slate-500">{rotulo}</span>
              <span className="block break-words group-hover:underline">{texto}</span>
            </span>
          </a>
        </li>
      ))}
    </ul>
  )
}

/** "Feito com GrafyGo": divulgação discreta da plataforma */
export function FeitoComGrafyGo({ className }: { className?: string }) {
  return (
    <a
      href="https://grafygo.com.br/?utm_source=vitrine&utm_medium=rodape"
      target="_blank"
      rel="noopener"
      className={cn('group inline-flex min-h-11 items-center gap-2 rounded-md text-xs text-slate-500 transition hover:text-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca', className)}
    >
      Feito com
      <img src="/marca/grafygo.png" alt="GrafyGo" className="h-6 w-auto opacity-90 transition group-hover:opacity-100" />
    </a>
  )
}

export function Rodape() {
  const { vitrine } = useVitrine()
  const e = vitrine.empresa
  const ano = new Date().getFullYear()
  return (
    <footer className="mt-16 border-t border-slate-200 bg-slate-50 lg:mt-32">
      <Container className="grid gap-8 py-10 sm:grid-cols-2 sm:gap-10 sm:py-14 lg:grid-cols-12 lg:gap-12 lg:py-16">
        <div className="space-y-4 sm:col-span-2 lg:col-span-3">
          <div className="flex items-center gap-3">
            <MarcaLoja />
            <p className="vt-titulo text-lg font-extrabold text-slate-900">{e.titulo}</p>
          </div>
          {(e.slogan || e.seoDescricao) && <p className="max-w-sm text-sm leading-relaxed text-slate-600">{e.slogan || e.seoDescricao}</p>}
          <RedesSociais />
        </div>
        {/* No celular a navegação já está nas abas do pé da tela */}
        <nav aria-label="Rodapé" className="max-lg:hidden lg:col-span-2">
          <h2 className="mb-4 text-sm font-bold text-slate-900">Navegação</h2>
          <ul className="space-y-2.5 text-sm text-slate-600">
            <li>
              <Link to="/" className="hover:text-slate-900 hover:underline">
                Início
              </Link>
            </li>
            <li>
              <Link to="/produtos" className="hover:text-slate-900 hover:underline">
                Todos os produtos
              </Link>
            </li>
            <li>
              <Link to="/lista" className="hover:text-slate-900 hover:underline">
                Lista de orçamento
              </Link>
            </li>
          </ul>
        </nav>
        <div className="lg:col-span-4">
          <h2 className="mb-4 text-sm font-bold text-slate-900">Contato</h2>
          <ListaContatos className="text-sm" />
        </div>
        {e.horario && (
          <div className="lg:col-span-3">
            <h2 className="mb-4 text-sm font-bold text-slate-900">Horário de atendimento</h2>
            <p className="flex items-start gap-3 text-sm text-slate-700">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-suave text-marca-escuro">
                <Clock className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="whitespace-pre-line pt-2">{e.horario}</span>
            </p>
          </div>
        )}
      </Container>
      <div className="border-t border-slate-200">
        <Container className="flex flex-col items-center justify-between gap-3 py-6 text-xs text-slate-500 sm:flex-row">
          <p>
            © {ano} {e.nome}. Todos os direitos reservados.
          </p>
          <FeitoComGrafyGo />
        </Container>
      </div>
    </footer>
  )
}

/** Botão flutuante do WhatsApp no computador (no celular ele fica nas abas do pé da tela ou no topo) */
export function WhatsappFlutuante() {
  const wa = useWhatsappGeral()
  if (!wa) return null
  return (
    <a
      href={wa}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Chamar no WhatsApp"
      className="group fixed bottom-6 right-6 z-40 hidden h-14 w-14 items-center justify-center rounded-full bg-[#25D366] text-[#0B3B1F] shadow-[0_0.75rem_2rem_-0.5rem_rgba(37,211,102,0.65)] transition hover:-translate-y-0.5 hover:bg-[#1EBE5A] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#25D366]/40 lg:flex"
    >
      <IconeWhatsapp className="h-7 w-7" />
      <span className="pointer-events-none absolute right-full mr-3 hidden whitespace-nowrap rounded-full bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-lg transition group-hover:opacity-100 group-focus-visible:opacity-100 lg:block">
        Chamar no WhatsApp
      </span>
    </a>
  )
}
