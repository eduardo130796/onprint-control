import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardList, Clock, LayoutGrid, MessageCircle, MousePointerClick } from 'lucide-react'
import type { ProdutoCardVitrine } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { Container, FaixaProdutos, GradeEsqueleto, GradeProdutos, ImagemProduto, TituloSecao } from '../componentes/comum'
import { ListaContatos, RedesSociais } from '../componentes/Estrutura'
import { IconeWhatsapp } from '../componentes/icones'
import { capasDasCategorias } from '../catalogo'
import { useTituloPagina, useVitrine } from '../contexto'
import { botao, reticula } from '../estilos'
import { paragrafos } from '../formato'
import { reduzirMovimento, useSlides } from '../rolagem'

/** Primeira página do catálogo: alimenta "Mais produtos" e as fotos das categorias (a mesma consulta, em cache) */
const FILTRO_INICIO = { page: 1, pageSize: 24 }
function useProdutosInicio() {
  const { api, slug } = useVitrine()
  return useQuery({
    queryKey: ['vitrine', slug, 'produtos', FILTRO_INICIO],
    queryFn: () => api.produtos(FILTRO_INICIO),
    placeholderData: keepPreviousData,
  })
}

function Acoes({ claro }: { claro?: boolean }) {
  const { whatsapp } = useVitrine()
  const wa = whatsapp()
  return (
    <div className="flex flex-wrap gap-3">
      <Link to="/produtos" className={cn(botao.base, botao.md, 'sm:h-[3.25rem] sm:px-7 sm:text-[0.9375rem]', claro ? botao.claro : botao.primario, 'shadow-lg')}>
        Ver produtos <ArrowRight />
      </Link>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            botao.base,
            botao.md,
            'sm:h-[3.25rem] sm:px-7 sm:text-[0.9375rem]',
            claro ? 'border border-white/30 bg-white/10 backdrop-blur hover:bg-white/20' : botao.contorno,
          )}
        >
          <IconeWhatsapp /> Chamar no WhatsApp
        </a>
      )}
    </div>
  )
}

/** Sem banner: degradê na cor do tema com título, slogan e uma colagem dos destaques */
function HeroDegrade({ destaques }: { destaques: ProdutoCardVitrine[] }) {
  const { vitrine } = useVitrine()
  const { titulo, slogan, seoDescricao } = vitrine.empresa
  const fotos = destaques.filter((d) => d.capaUrl).slice(0, 3)
  return (
    <section className="relative isolate overflow-hidden rounded-3xl bg-marca text-marca-contraste sm:rounded-[1.75rem] lg:rounded-[2.25rem]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(0,0,0,0.28),transparent_60%)]" />
      <div className="absolute inset-y-0 right-0 -z-10 w-2/3 opacity-[0.14] [mask-image:linear-gradient(to_left,black,transparent)]" style={reticula} />
      <div className="absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full border-[3rem] border-white/10" />
      <div className="grid items-center gap-10 px-5 py-9 sm:px-10 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:px-16 lg:py-24">
        <div className="max-w-2xl">
          <p className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur sm:mb-5">
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> Orçamento online
          </p>
          <h1 className="vt-titulo text-[2rem] font-extrabold leading-[1.05] sm:text-5xl lg:text-[3.75rem]">{titulo}</h1>
          {(slogan || seoDescricao) && <p className="mt-3 max-w-xl text-base leading-relaxed opacity-90 sm:mt-5 sm:text-lg lg:text-xl">{slogan || seoDescricao}</p>}
          <div className="mt-6 sm:mt-9">
            <Acoes claro />
          </div>
        </div>
        {fotos.length > 0 && (
          <div className="relative hidden h-[26rem] lg:block" aria-hidden="true">
            {fotos.map((f, i) => (
              <div
                key={f.slug}
                className={cn(
                  'absolute overflow-hidden rounded-3xl bg-white p-2 shadow-2xl shadow-black/25 ring-1 ring-black/5',
                  i === 0 && 'left-[18%] top-[6%] z-20 w-[52%] rotate-[-3deg]',
                  i === 1 && 'right-[2%] top-0 z-10 w-[40%] rotate-[5deg]',
                  i === 2 && 'bottom-0 right-[10%] z-30 w-[38%] rotate-[2deg]',
                )}
              >
                <div className="aspect-square overflow-hidden rounded-2xl">
                  <ImagemProduto src={f.capaUrl} alt="" prioridade />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * Banners da gráfica em carrossel: arrasta com o dedo (scroll-snap) e troca sozinho; para com o mouse em cima ou
 * foco, e não anda para quem pediu menos animação.
 */
function Carrossel({ banners }: { banners: string[] }) {
  const { vitrine } = useVitrine()
  const n = banners.length
  const { ref, atual, ir } = useSlides<HTMLDivElement>(n)
  const [pausado, setPausado] = useState(false)

  // Recomeça a contar a cada troca (inclusive quando a pessoa arrasta)
  useEffect(() => {
    if (n < 2 || pausado || reduzirMovimento()) return
    const t = window.setTimeout(() => ir(atual + 1), 6000)
    return () => window.clearTimeout(t)
  }, [n, pausado, atual, ir])

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques da loja"
      className="group relative overflow-hidden rounded-2xl bg-slate-100 sm:rounded-[1.75rem] lg:rounded-[2.25rem]"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <div ref={ref} className="vt-sem-barra flex aspect-[3/1] snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
        {banners.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`Banner ${i + 1} de ${n} — ${vitrine.empresa.titulo}`}
            aria-hidden={i !== atual}
            loading={i === 0 ? 'eager' : 'lazy'}
            draggable={false}
            className="h-full w-full shrink-0 snap-center snap-always object-cover"
          />
        ))}
      </div>
      {n > 1 && (
        <>
          <button
            type="button"
            onClick={() => ir(atual - 1)}
            aria-label="Banner anterior"
            className="absolute left-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca sm:left-5 md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => ir(atual + 1)}
            aria-label="Próximo banner"
            className="absolute right-3 top-1/2 hidden h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca sm:right-5 md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
          <div className="pointer-events-none absolute inset-x-0 bottom-1.5 flex justify-center sm:bottom-3">
            {banners.map((url, i) => (
              // Ponto pequeno, mas com área de toque confortável
              <button
                key={url}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Mostrar banner ${i + 1}`}
                aria-current={i === atual}
                className="group/ponto pointer-events-auto flex h-6 items-center px-1 focus-visible:outline-none sm:h-8"
              >
                <span
                  className={cn(
                    'block h-1.5 rounded-full bg-white shadow transition-all group-focus-visible/ponto:ring-2 group-focus-visible/ponto:ring-white sm:h-2',
                    i === atual ? 'w-6 sm:w-7' : 'w-1.5 opacity-60 group-hover/ponto:opacity-100 sm:w-2',
                  )}
                />
              </button>
            ))}
          </div>
        </>
      )}
    </section>
  )
}

/** Categorias com a foto de um produto: faixa que rola com o dedo no celular, grade no computador */
function Categorias() {
  const { vitrine } = useVitrine()
  const produtos = useProdutosInicio().data?.data
  const categorias = vitrine.categorias.filter((c) => c.quantidade > 0)
  const capas = useMemo(() => capasDasCategorias([...vitrine.destaques, ...(produtos ?? [])]), [vitrine.destaques, produtos])
  if (!categorias.length) return null
  const caixa = 'relative block aspect-square w-full overflow-hidden rounded-2xl ring-1 ring-inset ring-slate-900/5 transition group-active:scale-[0.97]'
  const nome = 'mt-2 line-clamp-2 text-center text-[0.8125rem] font-semibold leading-tight text-slate-900 md:mt-3 md:text-left md:text-[0.9375rem]'
  return (
    <section aria-labelledby="titulo-categorias" className="mt-8 lg:mt-24">
      <TituloSecao
        id="titulo-categorias"
        sobretitulo="Categorias"
        titulo="Encontre o que você precisa"
        acao={
          <Link to="/produtos" className="hidden items-center gap-1 rounded-md text-sm font-semibold text-marca-escuro hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca md:inline-flex">
            Ver todos os produtos <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        }
      />
      <ul className="vt-sem-barra -mx-4 flex snap-x gap-3 overflow-x-auto scroll-px-4 px-4 pb-1 sm:-mx-6 sm:scroll-px-6 sm:px-6 md:mx-0 md:grid md:grid-cols-[repeat(auto-fill,minmax(9.5rem,1fr))] md:gap-5 md:overflow-visible md:px-0 lg:grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]">
        <li className="w-[5.5rem] shrink-0 snap-start md:hidden">
          <Link to="/produtos" className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
            <span className={cn(caixa, 'flex items-center justify-center bg-slate-900 text-white')}>
              <LayoutGrid className="h-7 w-7" aria-hidden="true" />
            </span>
            <span className={cn(nome, 'block')}>Ver todos</span>
          </Link>
        </li>
        {categorias.map((c) => {
          const capa = capas.get(c.id)
          return (
            <li key={c.id} className="w-[5.5rem] shrink-0 snap-start md:w-auto">
              <Link to={`/categoria/${c.id}`} className="group block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-offset-2">
                <span className={cn(caixa, 'bg-marca-suave md:aspect-[4/3]')}>
                  {capa ? (
                    <ImagemProduto src={capa} alt="" className="transition duration-500 group-hover:scale-[1.05]" />
                  ) : (
                    <span className="vt-titulo flex h-full w-full items-center justify-center text-2xl font-extrabold text-marca-escuro" aria-hidden="true">
                      {c.nome.trim().charAt(0).toUpperCase()}
                    </span>
                  )}
                </span>
                <span className={cn(nome, 'block')}>{c.nome}</span>
                <span className="mt-0.5 hidden text-sm text-slate-500 md:block">
                  {c.quantidade} {c.quantidade === 1 ? 'produto' : 'produtos'}
                </span>
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/** Catálogo no início: com destaques acima, mostra os demais produtos (sem repetir os mesmos cards) */
function TodosOsProdutos({ semDestaques }: { semDestaques: boolean }) {
  const consulta = useProdutosInicio()
  const total = consulta.data?.meta.total ?? 0
  const produtos = (consulta.data?.data ?? []).filter((p) => !semDestaques || !p.destaque).slice(0, 8)
  if (consulta.isSuccess && (!total || !produtos.length)) return null
  const verTodos = total > produtos.length
  return (
    <section aria-labelledby="titulo-todos" className="mt-12 lg:mt-28">
      <TituloSecao
        id="titulo-todos"
        sobretitulo="Catálogo"
        titulo={semDestaques ? 'Mais produtos' : 'Nossos produtos'}
        acao={
          verTodos ? (
            <Link to="/produtos" className={cn(botao.base, botao.contorno, botao.md, 'max-sm:hidden')}>
              Ver todos ({total}) <ArrowRight />
            </Link>
          ) : undefined
        }
      />
      {consulta.data ? <GradeProdutos produtos={produtos} /> : <GradeEsqueleto quantidade={4} />}
      {verTodos && (
        <Link to="/produtos" className={cn(botao.base, botao.contorno, botao.md, 'mt-6 w-full sm:hidden')}>
          Ver todos os {total} produtos <ArrowRight />
        </Link>
      )}
    </section>
  )
}

function ComoFunciona() {
  const passos = [
    { Icone: MousePointerClick, titulo: 'Escolha os produtos', texto: 'Veja o catálogo e abra cada produto para conferir detalhes, medidas e acabamentos.' },
    { Icone: ClipboardList, titulo: 'Monte sua lista', texto: 'Adicione à lista de orçamento com a quantidade, as medidas e os acabamentos que precisa.' },
    { Icone: MessageCircle, titulo: 'Receba o orçamento', texto: 'Envie a lista com seu WhatsApp. A equipe confere tudo e responde com valores e prazos.' },
  ]
  return (
    <section aria-labelledby="titulo-como" className="mt-12 rounded-3xl bg-slate-50 px-5 py-8 sm:rounded-[1.75rem] sm:px-10 sm:py-12 lg:mt-28 lg:rounded-[2.25rem] lg:px-16 lg:py-16">
      <TituloSecao id="titulo-como" sobretitulo="Como funciona" titulo="Seu orçamento em três passos" />
      <ol className="grid gap-5 md:grid-cols-3 md:gap-10">
        {passos.map(({ Icone, titulo, texto }, i) => (
          <li key={titulo} className="flex gap-4 md:block">
            <div className="flex shrink-0 items-center gap-4 md:mb-5">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-marca text-marca-contraste shadow-lg shadow-marca/25 md:h-12 md:w-12">
                <Icone className="h-5 w-5 md:h-[1.375rem] md:w-[1.375rem]" aria-hidden="true" />
              </span>
              <span className="vt-titulo hidden text-4xl font-extrabold text-slate-200 md:inline" aria-hidden="true">
                0{i + 1}
              </span>
            </div>
            <div>
              <h3 className="font-bold text-slate-900 md:text-lg">
                <span className="text-marca-escuro md:hidden">{i + 1}. </span>
                {titulo}
              </h3>
              <p className="mt-1 text-[0.9375rem] leading-relaxed text-slate-600 md:mt-2 md:text-base">{texto}</p>
            </div>
          </li>
        ))}
      </ol>
      <div className="mt-8 md:mt-10">
        <Link to="/produtos" className={cn(botao.base, botao.escuro, botao.lg, 'max-sm:w-full')}>
          Começar meu orçamento <ArrowRight />
        </Link>
      </div>
    </section>
  )
}

function QuemSomos() {
  const { vitrine, whatsapp } = useVitrine()
  const e = vitrine.empresa
  const textos = paragrafos(e.sobre)
  const wa = whatsapp()
  // No celular o texto começa resumido (a página fica curta); o computador mostra tudo
  const [aberto, setAberto] = useState(false)
  const longo = textos.length > 1 || (textos[0]?.length ?? 0) > 220
  return (
    <section id="contato" aria-labelledby="titulo-sobre" className="mt-12 grid gap-8 lg:mt-28 lg:grid-cols-12 lg:gap-12">
      {textos.length > 0 && (
        <div className="lg:col-span-7">
          <TituloSecao id="titulo-sobre" sobretitulo="Quem somos" titulo={e.titulo} />
          <div id="texto-sobre" className="space-y-4 text-base leading-relaxed text-slate-600 sm:text-[1.0625rem]">
            {textos.map((p, i) => (
              <p key={i} className={cn('whitespace-pre-line', !aberto && (i === 0 ? 'max-lg:line-clamp-4' : 'max-lg:hidden'))}>
                {p}
              </p>
            ))}
          </div>
          {longo && !aberto && (
            <button
              type="button"
              onClick={() => setAberto(true)}
              aria-expanded={false}
              aria-controls="texto-sobre"
              className="mt-2 min-h-11 rounded-md font-semibold text-marca-escuro hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca lg:hidden"
            >
              Ler mais
            </button>
          )}
        </div>
      )}
      <aside
        className={cn(
          'rounded-3xl border border-slate-200 bg-white p-5 shadow-[0_1.5rem_3rem_-1.5rem_rgba(15,23,42,0.18)] sm:rounded-[1.75rem] sm:p-8',
          textos.length ? 'lg:col-span-5' : 'lg:col-span-8 lg:col-start-3',
        )}
      >
        <h2 id={textos.length ? undefined : 'titulo-sobre'} className="vt-titulo text-xl font-extrabold text-slate-900">
          Fale com a gente
        </h2>
        <p className="mt-1 text-sm text-slate-500">Tire dúvidas, peça um orçamento ou envie sua arte.</p>
        <ListaContatos className="mt-6" />
        {e.horario && (
          <p className="mt-5 flex items-start gap-3 text-sm text-slate-700">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-suave text-marca-escuro">
              <Clock className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="pt-0.5">
              <span className="block text-xs font-medium uppercase tracking-wider text-slate-500">Horário</span>
              <span className="whitespace-pre-line">{e.horario}</span>
            </span>
          </p>
        )}
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(botao.base, botao.whatsapp, botao.lg, 'mt-7 w-full')}>
            <IconeWhatsapp /> Chamar no WhatsApp
          </a>
        )}
        <RedesSociais className="mt-6" />
      </aside>
    </section>
  )
}

export function InicioPagina() {
  const { vitrine } = useVitrine()
  useTituloPagina(null)
  const { banners, destaques, empresa } = vitrine
  return (
    <Container className="pt-4 sm:pt-6">
      {banners.length ? (
        <>
          <Carrossel banners={banners} />
          <div className="mt-5 flex flex-col gap-6 sm:mt-8 lg:mt-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="vt-titulo text-2xl font-extrabold text-slate-900 sm:text-4xl">{empresa.titulo}</h1>
              {empresa.slogan && <p className="mt-1 text-slate-600 sm:mt-2 sm:text-lg">{empresa.slogan}</p>}
            </div>
            {/* No celular "Produtos" e "WhatsApp" já estão nas abas do pé da tela */}
            <div className="max-sm:hidden">
              <Acoes />
            </div>
          </div>
        </>
      ) : (
        <HeroDegrade destaques={destaques} />
      )}
      <Categorias />
      {destaques.length > 0 && <FaixaProdutos id="titulo-destaques" sobretitulo="Destaques" titulo="Os mais procurados" produtos={destaques} />}
      <TodosOsProdutos semDestaques={destaques.length > 0} />
      <ComoFunciona />
      <QuemSomos />
    </Container>
  )
}
