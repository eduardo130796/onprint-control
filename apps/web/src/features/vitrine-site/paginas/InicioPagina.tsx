import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ArrowRight, ChevronLeft, ChevronRight, ClipboardList, Clock, MessageCircle, MousePointerClick } from 'lucide-react'
import type { ProdutoCardVitrine } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { Container, FaixaProdutos, GradeEsqueleto, GradeProdutos, ImagemProduto, TituloSecao } from '../componentes/comum'
import { ListaContatos, RedesSociais } from '../componentes/Estrutura'
import { IconeWhatsapp } from '../componentes/icones'
import { useTituloPagina, useVitrine } from '../contexto'
import { botao, reticula } from '../estilos'
import { paragrafos } from '../formato'

function Acoes({ claro }: { claro?: boolean }) {
  const { whatsapp } = useVitrine()
  const wa = whatsapp()
  return (
    <div className="flex flex-wrap gap-3">
      <Link to="/produtos" className={cn(botao.base, botao.lg, claro ? botao.claro : botao.primario, 'shadow-lg')}>
        Ver produtos <ArrowRight />
      </Link>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={cn(
            botao.base,
            botao.lg,
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
    <section className="relative isolate overflow-hidden rounded-[1.75rem] bg-marca text-marca-contraste lg:rounded-[2.25rem]">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_left,rgba(255,255,255,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(0,0,0,0.28),transparent_60%)]" />
      <div className="absolute inset-y-0 right-0 -z-10 w-2/3 opacity-[0.14] [mask-image:linear-gradient(to_left,black,transparent)]" style={reticula} />
      <div className="absolute -right-24 -top-24 -z-10 h-96 w-96 rounded-full border-[3rem] border-white/10" />
      <div className="grid items-center gap-10 px-6 py-14 sm:px-10 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:px-16 lg:py-24">
        <div className="max-w-2xl">
          <p className="mb-5 inline-flex items-center gap-2 rounded-full bg-white/15 px-3.5 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] backdrop-blur">
            <span className="h-1.5 w-1.5 rounded-full bg-current" /> Orçamento online
          </p>
          <h1 className="vt-titulo text-[2.25rem] font-extrabold leading-[1.05] sm:text-5xl lg:text-[3.75rem]">{titulo}</h1>
          {(slogan || seoDescricao) && <p className="mt-5 max-w-xl text-lg leading-relaxed opacity-90 lg:text-xl">{slogan || seoDescricao}</p>}
          <div className="mt-9">
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

/** Banners da gráfica em carrossel (troca sozinho; para com o mouse em cima ou foco) */
function Carrossel({ banners }: { banners: string[] }) {
  const { vitrine } = useVitrine()
  const [atual, setAtual] = useState(0)
  const [pausado, setPausado] = useState(false)
  const toque = useRef<number | null>(null)
  const n = banners.length
  const ir = useCallback((i: number) => setAtual(((i % n) + n) % n), [n])

  useEffect(() => {
    if (n < 2 || pausado || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setInterval(() => setAtual((a) => (a + 1) % n), 6000)
    return () => window.clearInterval(t)
  }, [n, pausado])

  return (
    <section
      aria-roledescription="carrossel"
      aria-label="Destaques da loja"
      className="group relative overflow-hidden rounded-[1.75rem] bg-slate-100 lg:rounded-[2.25rem]"
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
    >
      <div
        className="relative aspect-[3/1]"
        onTouchStart={(e) => (toque.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={(e) => {
          if (toque.current === null) return
          const dx = (e.changedTouches[0]?.clientX ?? 0) - toque.current
          toque.current = null
          if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1))
        }}
      >
        {banners.map((url, i) => (
          <img
            key={url}
            src={url}
            alt={`Banner ${i + 1} de ${n} — ${vitrine.empresa.titulo}`}
            aria-hidden={i !== atual}
            loading={i === 0 ? 'eager' : 'lazy'}
            className={cn('absolute inset-0 h-full w-full object-cover transition-opacity duration-700', i === atual ? 'opacity-100' : 'opacity-0')}
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
          <div className="absolute inset-x-0 bottom-2 flex justify-center gap-2 sm:bottom-4">
            {banners.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => ir(i)}
                aria-label={`Mostrar banner ${i + 1}`}
                aria-current={i === atual}
                className={cn('h-2 rounded-full bg-white shadow transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white', i === atual ? 'w-7' : 'w-2 opacity-60 hover:opacity-100')}
              />
            ))}
          </div>
        </>
      )}
    </section>
  )
}

function Categorias() {
  const { vitrine } = useVitrine()
  const categorias = vitrine.categorias.filter((c) => c.quantidade > 0)
  if (!categorias.length) return null
  return (
    <section aria-labelledby="titulo-categorias" className="mt-20 lg:mt-28">
      <TituloSecao id="titulo-categorias" sobretitulo="Categorias" titulo="Encontre o que você precisa" />
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fit,minmax(13rem,1fr))] sm:gap-4">
        {categorias.map((c) => (
          <li key={c.id}>
            <Link
              to={`/categoria/${c.id}`}
              className="group flex h-full flex-col justify-between gap-6 rounded-2xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-marca/50 hover:shadow-[0_1rem_2rem_-1rem_rgba(15,23,42,0.25)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca sm:p-5"
            >
              <span className="vt-titulo flex h-11 w-11 items-center justify-center rounded-xl bg-marca-suave text-lg font-extrabold text-marca-escuro transition group-hover:bg-marca group-hover:text-marca-contraste">
                {c.nome.trim().charAt(0).toUpperCase()}
              </span>
              <span>
                <span className="block font-semibold leading-snug text-slate-900">{c.nome}</span>
                <span className="mt-1 flex items-center justify-between text-sm text-slate-500">
                  {c.quantidade} {c.quantidade === 1 ? 'produto' : 'produtos'}
                  <ArrowRight className="h-4 w-4 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden="true" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}

/** Catálogo no início: com destaques acima, mostra os demais produtos (sem repetir os mesmos cards) */
function TodosOsProdutos({ semDestaques }: { semDestaques: boolean }) {
  const { api, slug } = useVitrine()
  const consulta = useQuery({
    queryKey: ['vitrine', slug, 'produtos', { page: 1, pageSize: 24 }],
    queryFn: () => api.produtos({ page: 1, pageSize: 24 }),
    placeholderData: keepPreviousData,
  })
  const total = consulta.data?.meta.total ?? 0
  const produtos = (consulta.data?.data ?? []).filter((p) => !semDestaques || !p.destaque).slice(0, 8)
  if (consulta.isSuccess && (!total || !produtos.length)) return null
  return (
    <section aria-labelledby="titulo-todos" className="mt-20 lg:mt-28">
      <TituloSecao
        id="titulo-todos"
        sobretitulo="Catálogo"
        titulo={semDestaques ? 'Mais produtos' : 'Nossos produtos'}
        acao={
          total > produtos.length ? (
            <Link to="/produtos" className={cn(botao.base, botao.contorno, botao.md)}>
              Ver todos ({total}) <ArrowRight />
            </Link>
          ) : undefined
        }
      />
      {consulta.data ? <GradeProdutos produtos={produtos} /> : <GradeEsqueleto />}
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
    <section aria-labelledby="titulo-como" className="mt-20 rounded-[1.75rem] bg-slate-50 px-6 py-12 sm:px-10 lg:mt-28 lg:rounded-[2.25rem] lg:px-16 lg:py-16">
      <TituloSecao id="titulo-como" sobretitulo="Como funciona" titulo="Seu orçamento em três passos" />
      <ol className="grid gap-8 md:grid-cols-3 md:gap-10">
        {passos.map(({ Icone, titulo, texto }, i) => (
          <li key={titulo} className="relative">
            <div className="mb-5 flex items-center gap-4">
              <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-marca text-marca-contraste shadow-lg shadow-marca/25">
                <Icone className="h-[1.375rem] w-[1.375rem]" aria-hidden="true" />
              </span>
              <span className="vt-titulo text-4xl font-extrabold text-slate-200">0{i + 1}</span>
            </div>
            <h3 className="text-lg font-bold text-slate-900">{titulo}</h3>
            <p className="mt-2 leading-relaxed text-slate-600">{texto}</p>
          </li>
        ))}
      </ol>
      <div className="mt-10">
        <Link to="/produtos" className={cn(botao.base, botao.escuro, botao.lg)}>
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
  return (
    <section id="contato" aria-labelledby="titulo-sobre" className="mt-20 grid gap-8 lg:mt-28 lg:grid-cols-12 lg:gap-12">
      {textos.length > 0 && (
        <div className="lg:col-span-7">
          <TituloSecao id="titulo-sobre" sobretitulo="Quem somos" titulo={e.titulo} />
          <div className="space-y-4 text-[1.0625rem] leading-relaxed text-slate-600">
            {textos.map((p, i) => (
              <p key={i} className="whitespace-pre-line">
                {p}
              </p>
            ))}
          </div>
        </div>
      )}
      <aside className={cn('rounded-[1.75rem] border border-slate-200 bg-white p-6 shadow-[0_1.5rem_3rem_-1.5rem_rgba(15,23,42,0.18)] sm:p-8', textos.length ? 'lg:col-span-5' : 'lg:col-span-8 lg:col-start-3')}>
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
    <Container className="pt-5 sm:pt-6">
      {banners.length ? (
        <>
          <Carrossel banners={banners} />
          <div className="mt-8 flex flex-col gap-6 lg:mt-10 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <h1 className="vt-titulo text-3xl font-extrabold text-slate-900 sm:text-4xl">{empresa.titulo}</h1>
              {empresa.slogan && <p className="mt-2 text-lg text-slate-600">{empresa.slogan}</p>}
            </div>
            <Acoes />
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
