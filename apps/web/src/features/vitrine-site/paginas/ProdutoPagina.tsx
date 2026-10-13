import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent, type MouseEvent } from 'react'
import { createPortal } from 'react-dom'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, ChevronLeft, ChevronRight, Clock, Expand, Lock, Plus, ShieldCheck, X } from 'lucide-react'
import { formatarMoeda, type ProdutoVitrine } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { naoEncontrado } from '../api'
import { Container, Esqueleto, GradeProdutos, ImagemProduto, TituloSecao } from '../componentes/comum'
import { CampoMedida, CampoQuantidade, Rotulo } from '../componentes/campos'
import { BotaoCompartilhar } from '../componentes/Compartilhar'
import { IconeWhatsapp } from '../componentes/icones'
import { dadosCompartilharProduto, linkProduto, mensagemInteresse } from '../compartilhar'
import { useMensagemWhatsappPagina, useTituloPagina, useVitrine } from '../contexto'
import { botao } from '../estilos'
import { calcularEstimativa, textoEstimativa } from '../estimativa'
import { formatarMetros, lerMedida, medidaParaCampo, miniatura, paragrafos, partesPreco, resumoEscolha, textoPrazo, textoPreco } from '../formato'
import { novoIdItem, type ItemLista } from '../lista'
import { reduzirMovimento, useSlides } from '../rolagem'
import { descricaoProduto } from '../seo'
import { NaoEncontradoPagina } from './NaoEncontradoPagina'

const seta =
  'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca'

/** Pontos de "qual foto": pequenos, só indicam (as fotos trocam arrastando ou pelas miniaturas) */
function Pontos({ n, atual, claro }: { n: number; atual: number; claro?: boolean }) {
  return (
    <div className="pointer-events-none flex justify-center gap-1.5" aria-hidden="true">
      {Array.from({ length: n }, (_, i) => (
        <span
          key={i}
          className={cn('h-1.5 rounded-full transition-all', i === atual ? 'w-5' : 'w-1.5 opacity-50', claro ? 'bg-white' : 'bg-slate-900')}
        />
      ))}
    </div>
  )
}

/**
 * Fotos em tela cheia: arrasta para trocar, toque na foto amplia (e arrasta para ver os detalhes), Esc ou X fecha.
 * Abre num portal por cima de tudo, com o foco preso dentro enquanto aberto.
 */
function VisorFotos({ imagens, nome, inicial, fechar }: { imagens: string[]; nome: string; inicial: number; fechar: (atual: number) => void }) {
  const n = imagens.length
  const { ref, atual, ir } = useSlides<HTMLDivElement>(n)
  const [ampliada, setAmpliada] = useState(false)
  const ponto = useRef({ x: 0.5, y: 0.5 })
  const caixa = useRef<HTMLDivElement>(null)
  const botaoFechar = useRef<HTMLButtonElement>(null)

  // Abre já na foto tocada, sem animar
  useLayoutEffect(() => {
    const el = ref.current
    if (el) el.scrollLeft = inicial * el.clientWidth
  }, [ref, inicial])

  // Trava a página por trás e devolve o foco a quem abriu
  useEffect(() => {
    const anterior = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    botaoFechar.current?.focus({ preventScroll: true })
    return () => {
      document.body.style.overflow = overflow
      anterior?.focus({ preventScroll: true })
    }
  }, [])

  // Trocar de foto desfaz o zoom
  useEffect(() => setAmpliada(false), [atual])

  // Ampliada: centraliza no ponto tocado
  useLayoutEffect(() => {
    if (!ampliada) return
    const el = ref.current?.children[atual] as HTMLElement | undefined
    if (!el) return
    el.scrollLeft = ponto.current.x * el.scrollWidth - el.clientWidth / 2
    el.scrollTop = ponto.current.y * el.scrollHeight - el.clientHeight / 2
  }, [ampliada, atual, ref])

  const alternarZoom = (e: MouseEvent<HTMLImageElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    ponto.current = { x: (e.clientX - r.left) / r.width, y: (e.clientY - r.top) / r.height }
    setAmpliada((a) => !a)
  }

  // Teclado no documento todo (tocar na foto tira o foco dos botões): Esc fecha, setas trocam, Tab fica no visor
  useEffect(() => {
    const teclas = (e: KeyboardEvent) => {
      if (e.key === 'Escape') fechar(atual)
      else if (e.key === 'ArrowRight') ir(atual + 1)
      else if (e.key === 'ArrowLeft') ir(atual - 1)
      else if (e.key === 'Tab') {
        const focaveis = [...(caixa.current?.querySelectorAll<HTMLElement>('button:not([disabled])') ?? [])].filter((b) => b.offsetParent !== null)
        const primeiro = focaveis[0]
        const ultimo = focaveis[focaveis.length - 1]
        const dentro = caixa.current?.contains(document.activeElement)
        if (!dentro || (e.shiftKey && document.activeElement === primeiro)) {
          e.preventDefault()
          ;(e.shiftKey ? ultimo : primeiro)?.focus()
        } else if (!e.shiftKey && document.activeElement === ultimo) {
          e.preventDefault()
          primeiro?.focus()
        }
      }
    }
    document.addEventListener('keydown', teclas)
    return () => document.removeEventListener('keydown', teclas)
  }, [atual, ir, fechar])

  return createPortal(
    <div ref={caixa} role="dialog" aria-modal="true" aria-label={`Fotos de ${nome}`} className="vt-surgir fixed inset-0 z-[60] flex flex-col bg-slate-950 text-white">
      <div className="flex items-center justify-between gap-3 pl-[max(0.5rem,env(safe-area-inset-left))] pr-[max(0.5rem,env(safe-area-inset-right))] pt-[env(safe-area-inset-top)]">
        <p className="px-3 text-sm font-semibold tabular-nums" aria-live="polite">
          {atual + 1} / {n}
        </p>
        <button
          ref={botaoFechar}
          type="button"
          onClick={() => fechar(atual)}
          aria-label="Fechar fotos"
          className="flex h-12 w-12 items-center justify-center rounded-full transition hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
        >
          <X className="h-6 w-6" />
        </button>
      </div>
      <div ref={ref} className={cn('vt-sem-barra flex min-h-0 flex-1 snap-x snap-mandatory overscroll-contain', ampliada ? 'overflow-hidden' : 'overflow-x-auto')}>
        {imagens.map((url, i) => {
          const zoom = ampliada && i === atual
          return (
            <div key={url} className={cn('h-full w-full shrink-0 snap-center snap-always', zoom ? 'overflow-auto' : 'flex items-center justify-center overflow-hidden p-2')}>
              <img
                src={url}
                alt={`${nome} — foto ${i + 1} de ${n}`}
                aria-hidden={i !== atual}
                onClick={alternarZoom}
                draggable={false}
                className={cn('select-none', zoom ? 'h-auto w-[250%] max-w-none cursor-zoom-out lg:w-[160%]' : 'max-h-full max-w-full cursor-zoom-in object-contain')}
              />
            </div>
          )
        })}
      </div>
      <div className="flex items-center justify-center gap-4 pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
        {n > 1 && (
          <button type="button" onClick={() => ir(atual - 1)} aria-label="Foto anterior" className="hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <p className="text-xs text-white/70">{ampliada ? 'Toque para afastar' : n > 1 ? 'Arraste para o lado · toque para ampliar' : 'Toque para ampliar'}</p>
        {n > 1 && (
          <button type="button" onClick={() => ir(atual + 1)} aria-label="Próxima foto" className="hidden h-11 w-11 items-center justify-center rounded-full bg-white/10 transition hover:bg-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white md:flex">
            <ChevronRight className="h-5 w-5" />
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** Galeria: arrasta com o dedo (pontos embaixo), miniaturas a partir do tablet, toque abre em tela cheia */
function Galeria({ imagens, nome }: { imagens: string[]; nome: string }) {
  const n = imagens.length
  const { ref, atual, ir } = useSlides<HTMLDivElement>(n)
  const [visor, setVisor] = useState<number | null>(null)
  return (
    <div className="lg:sticky lg:top-28">
      {/* No celular a foto vai de ponta a ponta, como num aplicativo */}
      <div className="group relative -mx-4 overflow-hidden bg-slate-50 sm:mx-0 sm:rounded-[1.75rem] sm:ring-1 sm:ring-inset sm:ring-slate-900/5">
        {n ? (
          <div ref={ref} className="vt-sem-barra flex aspect-square snap-x snap-mandatory overflow-x-auto overscroll-x-contain">
            {imagens.map((url, i) => (
              <button
                key={url}
                type="button"
                onClick={() => setVisor(i)}
                aria-label={`Ampliar foto ${i + 1} de ${n}`}
                aria-hidden={i !== atual}
                tabIndex={i === atual ? 0 : -1}
                className="relative h-full w-full shrink-0 cursor-zoom-in snap-center snap-always focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-inset focus-visible:ring-marca"
              >
                <ImagemProduto src={url} alt={`${nome} — foto ${i + 1} de ${n}`} prioridade={i === 0} />
              </button>
            ))}
          </div>
        ) : (
          <div className="aspect-square">
            <ImagemProduto src={null} alt={nome} />
          </div>
        )}
        {n > 0 && (
          <span className="pointer-events-none absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/85 text-slate-700 shadow backdrop-blur" aria-hidden="true">
            <Expand className="h-4 w-4" />
          </span>
        )}
        {n > 1 && (
          <>
            <button type="button" onClick={() => ir(atual - 1)} aria-label="Foto anterior" className={cn(seta, 'left-3 hidden md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100')}>
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button type="button" onClick={() => ir(atual + 1)} aria-label="Próxima foto" className={cn(seta, 'right-3 hidden md:flex md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100')}>
              <ChevronRight className="h-5 w-5" />
            </button>
            <div className="absolute inset-x-0 bottom-3 flex justify-center">
              <span className="rounded-full bg-slate-900/45 px-2.5 py-1.5 backdrop-blur">
                <Pontos n={n} atual={atual} claro />
              </span>
            </div>
          </>
        )}
      </div>
      {n > 1 && (
        <ul className="vt-sem-barra mt-3 hidden gap-3 overflow-x-auto p-1 sm:flex" aria-label="Fotos do produto">
          {imagens.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => ir(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === atual}
                className={cn(
                  'block h-20 w-20 overflow-hidden rounded-xl bg-slate-50 ring-2 transition focus-visible:outline-none focus-visible:ring-marca',
                  i === atual ? 'ring-slate-900' : 'opacity-70 ring-transparent hover:opacity-100',
                )}
              >
                <ImagemProduto src={miniatura(url)} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
      {visor !== null && (
        <VisorFotos
          imagens={imagens}
          nome={nome}
          inicial={visor}
          fechar={(i) => {
            setVisor(null)
            ir(i)
          }}
        />
      )}
    </div>
  )
}

function PrecoGrande({ produto }: { produto: ProdutoVitrine }) {
  const p = partesPreco(produto.preco)
  const prazo = textoPrazo(produto.prazoDias)
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 sm:mt-5 sm:gap-y-3">
      {p.valor === 'Sob consulta' ? (
        <p className="vt-titulo text-2xl font-extrabold text-marca-escuro sm:text-[1.75rem]">Sob consulta</p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2 text-slate-500">
          {p.prefixo && <span className="text-sm font-medium">{p.prefixo}</span>}
          <span className="vt-titulo text-[1.75rem] font-extrabold leading-none text-slate-900 sm:text-[2rem]">{p.valor}</span>
          {p.sufixo && <span className="text-base">{p.sufixo}</span>}
        </p>
      )}
      {prazo && (
        <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-sm font-medium text-slate-700">
          <Clock className="h-4 w-4" aria-hidden="true" /> {prazo}
        </span>
      )}
    </div>
  )
}

/** Texto de venda, uma vez só: no celular começa resumido (com "Ler mais") para o pedido aparecer logo */
function Descricao({ textos }: { textos: string[] }) {
  const [aberto, setAberto] = useState(false)
  if (!textos.length) return null
  const longo = textos.length > 1 || (textos[0]?.length ?? 0) > 180
  return (
    <section aria-label="Sobre o produto" className="mt-5 sm:mt-6">
      <div id="descricao-produto" className="space-y-3 text-base leading-relaxed text-slate-600 sm:space-y-4 sm:text-[1.0625rem]">
        {textos.map((p, i) => (
          <p key={i} className={cn('whitespace-pre-line', !aberto && (i === 0 ? 'max-lg:line-clamp-3' : 'max-lg:hidden'))}>
            {p}
          </p>
        ))}
      </div>
      {longo && (
        <button
          type="button"
          onClick={() => setAberto((a) => !a)}
          aria-expanded={aberto}
          aria-controls="descricao-produto"
          className="mt-1 min-h-11 rounded-md text-[0.9375rem] font-semibold text-marca-escuro hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca lg:hidden"
        >
          {aberto ? 'Ler menos' : 'Ler mais'}
        </button>
      )}
    </section>
  )
}

/** Aviso de item adicionado: sobe do pé da tela (acima da barra do produto), com os próximos passos */
function AvisoAdicionado({ item, total, continuar, fechar }: { item: ItemLista; total: number; continuar: string; fechar: () => void }) {
  const [parado, setParado] = useState(false)
  // Some sozinho (a menos que a pessoa esteja com o mouse ou o foco nele)
  useEffect(() => {
    if (parado) return
    const t = window.setTimeout(fechar, 8000)
    return () => window.clearTimeout(t)
  }, [parado, fechar])
  const escolhidos = item.acabamentos.filter((a) => a.obrigatorio || item.acabamentoIds.includes(a.id)).map((a) => a.nome)
  return (
    <div
      role="status"
      onMouseEnter={() => setParado(true)}
      onMouseLeave={() => setParado(false)}
      onFocus={() => setParado(true)}
      onBlur={() => setParado(false)}
      className="vt-subir fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-50 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))] lg:inset-x-auto lg:bottom-auto lg:right-8 lg:top-24 lg:w-[24rem] lg:px-0"
    >
      <div className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_1.5rem_3rem_-0.75rem_rgba(15,23,42,0.35)]">
        <div className="flex items-start gap-3">
          <span className="relative h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-slate-50 ring-1 ring-inset ring-slate-900/5">
            <ImagemProduto src={item.capaUrl} alt="" />
            <span className="absolute -bottom-0.5 -right-0.5 flex h-6 w-6 items-center justify-center rounded-full bg-emerald-500 text-white ring-2 ring-white">
              <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
            </span>
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-slate-900">Adicionado à sua lista!</p>
            <p className="truncate text-sm text-slate-600">{item.nome}</p>
            <p className="truncate text-xs text-slate-500">{resumoEscolha({ ...item, acabamentos: escolhidos })}</p>
          </div>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar aviso"
            className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link to={continuar} className={cn(botao.base, botao.contorno, 'h-11 px-3 text-sm')}>
            Continuar escolhendo
          </Link>
          <Link to="/lista" className={cn(botao.base, botao.primario, 'h-11 px-3 text-sm')}>
            Ver lista ({total}) <ArrowRight />
          </Link>
        </div>
      </div>
    </div>
  )
}

type Erros = Partial<Record<'quantidade' | 'largura' | 'altura', string>>
const ORDEM_CAMPOS: [keyof Erros, string][] = [
  ['quantidade', 'qtd'],
  ['largura', 'largura'],
  ['altura', 'altura'],
]

function FormularioLista({ produto, link }: { produto: ProdutoVitrine; link: string }) {
  const { lista, whatsapp } = useVitrine()
  const usaMedidas = produto.modoCalculo === 'm2' || produto.modoCalculo === 'metro_linear'
  const medidas = produto.medidas
  // Por milheiro a quantidade é em unidades (1.000 = 1 milheiro), como no orçamento do sistema
  const porMilheiro = produto.modoCalculo === 'milheiro'
  const inicial = () => ({
    quantidade: porMilheiro ? '1000' : '1',
    largura: medidaParaCampo(medidas?.larguraPadrao),
    altura: medidaParaCampo(medidas?.alturaPadrao),
    acabamentos: new Set(produto.acabamentos.filter((a) => a.obrigatorio || a.padrao).map((a) => a.id)),
    observacao: '',
  })
  const [form, setForm] = useState(inicial)
  const [erros, setErros] = useState<Erros>({})
  const [aviso, setAviso] = useState<string | null>(null)
  const [adicionado, setAdicionado] = useState<ItemLista | null>(null)
  const [cheia, setCheia] = useState(false)
  const fecharAviso = useCallback(() => setAdicionado(null), [])

  const mudar = <K extends keyof ReturnType<typeof inicial>>(campo: K, valor: ReturnType<typeof inicial>[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }))
    if (campo in erros) {
      const resto = { ...erros, [campo]: undefined }
      setErros(resto)
      if (!Object.values(resto).some(Boolean)) setAviso(null)
    }
  }

  const larguraLida = lerMedida(form.largura)
  const alturaLida = lerMedida(form.altura)
  const area = produto.modoCalculo === 'm2' && larguraLida && alturaLida ? Number(larguraLida) * Number(alturaLida) : null
  const qtd = Math.trunc(Number(form.quantidade))
  const qtdValida = Number.isFinite(qtd) && qtd >= 1
  const temAcabamentos = produto.acabamentos.some((a) => a.obrigatorio || form.acabamentos.has(a.id))
  const estimativa = qtdValida ? calcularEstimativa({ preco: produto.preco, modoCalculo: produto.modoCalculo, quantidade: qtd, largura: larguraLida, altura: alturaLida }) : null
  const textoEst = estimativa !== null ? textoEstimativa(estimativa, { aPartirDe: produto.preco.modo === 'a_partir_de', comAcabamentos: temAcabamentos }) : null
  const comPreco = partesPreco(produto.preco).valor !== 'Sob consulta'
  const faltamMedidas = usaMedidas && (!larguraLida || (produto.modoCalculo === 'm2' && !alturaLida))

  const validar = (): Erros => {
    const e: Erros = {}
    if (!qtdValida || String(qtd) !== form.quantidade.trim()) e.quantidade = 'Informe uma quantidade inteira, a partir de 1.'
    else if (qtd > 1_000_000) e.quantidade = 'Quantidade muito alta.'
    if (usaMedidas) {
      const conferir = (lida: string | null | undefined, maxima: string | null | undefined, obrigatoria: boolean) => {
        if (lida === undefined) return 'Medida inválida (use metros, ex.: 1,50).'
        if (lida === null) return obrigatoria ? 'Informe a medida em metros.' : undefined
        if (maxima && Number(lida) > Number(maxima)) return `A medida máxima é ${formatarMetros(maxima)}.`
        return undefined
      }
      e.largura = conferir(larguraLida, medidas?.larguraMaxima, true)
      e.altura = conferir(alturaLida, medidas?.alturaMaxima, produto.modoCalculo === 'm2')
    }
    return Object.fromEntries(Object.entries(e).filter(([, v]) => v)) as Erros
  }

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    const e = validar()
    setErros(e)
    const primeiro = ORDEM_CAMPOS.find(([campo]) => e[campo])
    if (primeiro) {
      // Leva até o primeiro campo com problema (no celular ele pode estar lá em cima) e explica o que falta
      const falta = (e.largura === 'Informe a medida em metros.' || e.altura === 'Informe a medida em metros.') && Object.keys(e).length <= 2
      setAviso(falta ? 'Informe as medidas para adicionar à lista.' : 'Confira o campo destacado para adicionar à lista.')
      const el = document.getElementById(primeiro[1])
      el?.focus({ preventScroll: true })
      el?.scrollIntoView({ block: 'center', behavior: reduzirMovimento() ? 'auto' : 'smooth' })
      return
    }
    setAviso(null)
    const item: ItemLista = {
      id: novoIdItem(),
      produtoSlug: produto.slug,
      nome: produto.nome,
      capaUrl: produto.capaUrl,
      modoCalculo: produto.modoCalculo,
      preco: produto.preco,
      quantidade: qtd,
      largura: usaMedidas ? (larguraLida ?? null) : null,
      altura: usaMedidas ? (alturaLida ?? null) : null,
      larguraMaxima: medidas?.larguraMaxima ?? null,
      alturaMaxima: medidas?.alturaMaxima ?? null,
      acabamentoIds: [...form.acabamentos],
      acabamentos: produto.acabamentos.map((a) => ({ id: a.id, nome: a.nome, obrigatorio: a.obrigatorio })),
      observacao: form.observacao.trim(),
    }
    const ok = lista.adicionar(item)
    setCheia(!ok)
    if (ok) {
      setAdicionado(item)
      setForm(inicial())
    }
  }

  const wa = whatsapp(mensagemInteresse(produto.nome, link))
  // Resumo da barra do celular: o que está escolhido (ou o que falta) e a estimativa/preço
  const resumo = qtdValida ? resumoEscolha({ modoCalculo: produto.modoCalculo, quantidade: qtd, largura: larguraLida, altura: alturaLida }) : 'Informe a quantidade'

  return (
    <form id="form-produto" onSubmit={enviar} noValidate className="mt-6 space-y-6 rounded-3xl border border-slate-200 bg-white p-4 shadow-[0_1.5rem_3rem_-1.5rem_rgba(15,23,42,0.18)] sm:mt-8 sm:rounded-[1.75rem] sm:p-7">
      <div>
        <h2 className="vt-titulo text-lg font-extrabold text-slate-900">Monte seu pedido de orçamento</h2>
        <p className="mt-1 text-sm text-slate-500">Escolha as opções e adicione à lista. Você envia tudo junto no final.</p>
      </div>

      <CampoQuantidade
        id="qtd"
        valor={form.quantidade}
        aoMudar={(v) => mudar('quantidade', v)}
        erro={erros.quantidade}
        passo={porMilheiro ? 500 : 1}
        ajuda={porMilheiro ? 'Em unidades: 1.000 = 1 milheiro.' : undefined}
      />

      {usaMedidas && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-900">Medidas (em metros)</legend>
          <div className="grid grid-cols-[1fr_auto_1fr] items-start gap-2">
            <CampoMedida
              id="largura"
              rotulo={produto.modoCalculo === 'metro_linear' ? 'Comprimento' : 'Largura'}
              valor={form.largura}
              aoMudar={(v) => mudar('largura', v)}
              maxima={medidas?.larguraMaxima}
              erro={erros.largura}
            />
            <span className="pt-9 text-slate-400" aria-hidden="true">
              ×
            </span>
            <CampoMedida
              id="altura"
              rotulo={produto.modoCalculo === 'metro_linear' ? 'Altura (opcional)' : 'Altura'}
              valor={form.altura}
              aoMudar={(v) => mudar('altura', v)}
              maxima={medidas?.alturaMaxima}
              erro={erros.altura}
            />
          </div>
          {area !== null && qtdValida && (
            <p className="mt-3 text-sm text-slate-600">
              Área: <strong className="font-semibold text-slate-900">{area.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²</strong> por peça
              {qtd > 1 && (
                <>
                  {' '}
                  · total <strong className="font-semibold text-slate-900">{(area * qtd).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²</strong>
                </>
              )}
            </p>
          )}
        </fieldset>
      )}

      {/* Estimativa ao vivo: só com o preço público (nunca custo ou margem); acabamentos não têm preço no site */}
      {comPreco && (textoEst || faltamMedidas) && (
        <div className="rounded-2xl bg-marca-suave/70 px-4 py-3" aria-live="polite">
          {textoEst ? (
            <>
              <p className="font-semibold text-slate-900">{textoEst}</p>
              <p className="mt-0.5 text-xs text-slate-600">Valor aproximado · o valor final vem no orçamento da gráfica.</p>
            </>
          ) : (
            <p className="text-sm text-slate-700">Informe as medidas para ver uma estimativa do valor.</p>
          )}
        </div>
      )}

      {produto.acabamentos.length > 0 && (
        <fieldset>
          <legend className="mb-2 text-sm font-semibold text-slate-900">Acabamentos</legend>
          <ul className="space-y-2">
            {produto.acabamentos.map((a) => {
              const marcado = a.obrigatorio || form.acabamentos.has(a.id)
              return (
                <li key={a.id}>
                  <label
                    className={cn(
                      'flex min-h-12 items-start gap-3 rounded-xl border p-3.5 transition',
                      a.obrigatorio ? 'cursor-not-allowed border-slate-200 bg-slate-50' : 'cursor-pointer hover:border-slate-400',
                      marcado && !a.obrigatorio && 'border-marca bg-marca-suave/60',
                    )}
                  >
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={marcado}
                      disabled={a.obrigatorio}
                      onChange={(e) => {
                        const s = new Set(form.acabamentos)
                        if (e.target.checked) s.add(a.id)
                        else s.delete(a.id)
                        mudar('acabamentos', s)
                      }}
                    />
                    <span
                      aria-hidden="true"
                      className={cn(
                        'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition peer-focus-visible:ring-2 peer-focus-visible:ring-marca peer-focus-visible:ring-offset-2',
                        marcado ? (a.obrigatorio ? 'border-slate-400 bg-slate-400 text-white' : 'border-marca bg-marca text-marca-contraste') : 'border-slate-300 bg-white',
                      )}
                    >
                      {marcado && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-2 text-[0.9375rem] font-medium text-slate-900">
                        {a.nome}
                        {a.obrigatorio && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-[0.6875rem] font-semibold uppercase tracking-wide text-slate-600">
                            <Lock className="h-3 w-3" aria-hidden="true" /> Incluso
                          </span>
                        )}
                      </span>
                      {a.descricao && <span className="mt-0.5 block text-sm text-slate-500">{a.descricao}</span>}
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      )}

      <div>
        <Rotulo htmlFor="obs">
          Observações <span className="font-normal text-slate-400">(opcional)</span>
        </Rotulo>
        <textarea
          id="obs"
          rows={3}
          maxLength={500}
          value={form.observacao}
          onChange={(e) => mudar('observacao', e.target.value)}
          placeholder="Ex.: cores, tipo de papel, se já tem a arte pronta…"
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-base text-slate-900 transition placeholder:text-slate-400 focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15 sm:text-[0.9375rem]"
        />
      </div>

      <div aria-live="assertive">
        {aviso && <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{aviso}</p>}
        {cheia && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">Sua lista chegou ao limite de itens. Envie esta lista e depois monte outra.</p>
        )}
      </div>

      {/* No celular o botão fica na barra fixa do pé da tela (sempre à vista) */}
      <button type="submit" className={cn(botao.base, botao.primario, botao.lg, 'w-full max-lg:hidden')}>
        Adicionar à lista de orçamento
      </button>
      <div className="flex flex-col items-center gap-3 border-t border-slate-100 pt-5 text-sm text-slate-500 sm:flex-row sm:justify-between">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Orçamento sem compromisso
        </span>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center gap-2 font-semibold text-[#128C4B] hover:underline">
            <IconeWhatsapp className="h-4 w-4" /> Dúvidas? Fale no WhatsApp
          </a>
        )}
      </div>

      {/* Barra fixa do celular: resumo do que foi escolhido + adicionar */}
      <div className="vt-lados fixed inset-x-0 bottom-0 z-40 border-t border-slate-200/80 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-0.5rem_1.5rem_-1rem_rgba(15,23,42,0.25)] backdrop-blur-xl lg:hidden">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-2.5">
          <div className="min-w-0 flex-1" aria-hidden="true">
            {estimativa !== null ? (
              <p className="flex min-w-0 items-baseline gap-1 text-[0.9375rem] font-bold text-slate-900">
                <span className="text-xs font-medium text-slate-500">≈</span>
                <span className="whitespace-nowrap">{formatarMoeda(estimativa)}</span>
                {temAcabamentos && <span className="whitespace-nowrap text-xs font-medium text-slate-500">+ acab.</span>}
              </p>
            ) : (
              <p className="truncate text-[0.9375rem] font-bold text-slate-900">{comPreco ? textoPreco(produto.preco).replace('A partir de ', '') : 'Sob consulta'}</p>
            )}
            <p className={cn('truncate text-xs', aviso ? 'font-semibold text-red-600' : 'text-slate-500')}>
              {aviso ? (faltamMedidas ? 'Falta informar as medidas' : 'Confira o campo destacado') : faltamMedidas ? 'Informe as medidas' : estimativa !== null ? `Estimativa · ${resumo}` : resumo}
            </p>
          </div>
          <button type="submit" className={cn(botao.base, botao.primario, 'h-12 shrink-0 px-5 text-[0.9375rem]')}>
            <Plus /> Adicionar à lista
          </button>
        </div>
      </div>

      {adicionado && (
        <AvisoAdicionado
          key={adicionado.id}
          item={adicionado}
          total={lista.itens.length}
          continuar={produto.categoria ? `/categoria/${produto.categoria.id}` : '/produtos'}
          fechar={fecharAviso}
        />
      )}
    </form>
  )
}

function Relacionados({ produto }: { produto: ProdutoVitrine }) {
  const { api, slug } = useVitrine()
  const filtro = { categoriaId: produto.categoria?.id, page: 1, pageSize: 5 }
  const consulta = useQuery({ queryKey: ['vitrine', slug, 'produtos', filtro], queryFn: () => api.produtos(filtro) })
  const outros = (consulta.data?.data ?? []).filter((p) => p.slug !== produto.slug).slice(0, 4)
  if (!outros.length) return null
  return (
    <section aria-labelledby="titulo-relacionados" className="mt-14 lg:mt-28">
      <TituloSecao id="titulo-relacionados" sobretitulo="Veja também" titulo={produto.categoria ? `Mais em ${produto.categoria.nome}` : 'Outros produtos'} />
      <GradeProdutos produtos={outros} />
    </section>
  )
}

function Carregando() {
  return (
    <Container className="pt-4 lg:pt-12">
      <div role="status" aria-label="Carregando produto" className="grid gap-6 lg:grid-cols-2 lg:gap-16">
        <Esqueleto className="-mx-4 aspect-square rounded-none sm:mx-0 sm:rounded-[1.75rem]" />
        <div className="space-y-4">
          <Esqueleto className="h-4 w-24" />
          <Esqueleto className="h-9 w-3/4" />
          <Esqueleto className="h-8 w-40" />
          <Esqueleto className="mt-8 h-96 rounded-[1.75rem]" />
        </div>
      </div>
    </Container>
  )
}

export function ProdutoPagina() {
  const { api, slug, vitrine } = useVitrine()
  const { produtoSlug = '' } = useParams()
  const consulta = useQuery({
    queryKey: ['vitrine', slug, 'produto', produtoSlug],
    queryFn: () => api.produto(produtoSlug),
    retry: (n, erro) => !naoEncontrado(erro) && n < 1,
  })
  const produto = consulta.data
  const loja = vitrine.empresa.nome
  const link = linkProduto(window.location.origin, produto?.slug ?? produtoSlug)
  const preco = produto ? textoPreco(produto.preco) : ''
  useTituloPagina(
    produto?.nome ?? (consulta.isError ? 'Produto não encontrado' : null),
    produto ? descricaoProduto({ nome: produto.nome, preco, texto: paragrafos(produto.descricao)[0] ?? null, loja }) : null,
  )
  useMensagemWhatsappPagina(produto ? mensagemInteresse(produto.nome, link) : null)

  if (consulta.isPending) return <Carregando />
  if (!produto) {
    return naoEncontrado(consulta.error) ? (
      <NaoEncontradoPagina titulo="Produto não encontrado" texto="Este produto saiu do catálogo ou o endereço mudou. Veja os outros produtos da loja." />
    ) : (
      <NaoEncontradoPagina titulo="Não foi possível carregar o produto" texto={consulta.error?.message ?? 'Tente de novo em instantes.'} />
    )
  }
  return (
    <Container className="pt-3 lg:pt-10">
      <nav aria-label="Você está em" className="mb-3 truncate text-sm text-slate-500 lg:mb-6">
        <Link to="/" className="hover:text-slate-900 hover:underline">
          Início
        </Link>
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        {produto.categoria ? (
          <Link to={`/categoria/${produto.categoria.id}`} className="hover:text-slate-900 hover:underline">
            {produto.categoria.nome}
          </Link>
        ) : (
          <Link to="/produtos" className="hover:text-slate-900 hover:underline">
            Produtos
          </Link>
        )}
        <span className="mx-2" aria-hidden="true">
          /
        </span>
        <span className="text-slate-900">{produto.nome}</span>
      </nav>
      <div className="grid gap-5 sm:gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 xl:gap-20">
        <Galeria imagens={produto.imagens} nome={produto.nome} />
        <div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              {produto.categoria && (
                <Link to={`/categoria/${produto.categoria.id}`} className="-my-3 inline-block py-3 text-xs font-bold uppercase tracking-[0.16em] text-marca-escuro hover:underline">
                  {produto.categoria.nome}
                </Link>
              )}
              <h1 className={cn('vt-titulo text-[1.75rem] font-extrabold leading-tight text-slate-900 sm:text-4xl', produto.categoria && 'mt-1.5 sm:mt-2')}>{produto.nome}</h1>
            </div>
            <BotaoCompartilhar dados={dadosCompartilharProduto({ nome: produto.nome, preco, loja, link })} className="shrink-0" />
          </div>
          <PrecoGrande produto={produto} />
          <Descricao textos={paragrafos(produto.descricao)} />
          <FormularioLista key={produto.slug} produto={produto} link={link} />
        </div>
      </div>
      <Relacionados produto={produto} />
    </Container>
  )
}
