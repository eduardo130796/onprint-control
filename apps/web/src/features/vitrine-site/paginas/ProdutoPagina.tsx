import { useRef, useState, type FormEvent, type TouchEvent } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, Check, CheckCircle2, ChevronLeft, ChevronRight, Clock, Lock, ShieldCheck } from 'lucide-react'
import type { ProdutoVitrine } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { naoEncontrado } from '../api'
import { Container, Esqueleto, GradeProdutos, ImagemProduto, TituloSecao } from '../componentes/comum'
import { CampoMedida, CampoQuantidade, Rotulo } from '../componentes/campos'
import { IconeWhatsapp } from '../componentes/icones'
import { useTituloPagina, useVitrine } from '../contexto'
import { botao } from '../estilos'
import { formatarMetros, lerMedida, medidaParaCampo, paragrafos, partesPreco, textoPrazo } from '../formato'
import { novoIdItem, type ItemLista } from '../lista'
import { NaoEncontradoPagina } from './NaoEncontradoPagina'

function Galeria({ imagens, nome }: { imagens: string[]; nome: string }) {
  const [atual, setAtual] = useState(0)
  const toque = useRef<number | null>(null)
  const n = imagens.length
  const ir = (i: number) => setAtual(((i % n) + n) % n)
  const aoSoltar = (e: TouchEvent) => {
    if (toque.current === null) return
    const dx = (e.changedTouches[0]?.clientX ?? 0) - toque.current
    toque.current = null
    if (Math.abs(dx) > 40) ir(atual + (dx < 0 ? 1 : -1))
  }
  return (
    <div className="lg:sticky lg:top-28">
      <div
        className="group relative aspect-square overflow-hidden rounded-[1.75rem] bg-slate-50 ring-1 ring-inset ring-slate-900/5"
        onTouchStart={(e) => (toque.current = e.touches[0]?.clientX ?? null)}
        onTouchEnd={aoSoltar}
      >
        {n ? (
          imagens.map((url, i) => (
            <div key={url} className={cn('absolute inset-0 transition-opacity duration-500', i === atual ? 'opacity-100' : 'pointer-events-none opacity-0')} aria-hidden={i !== atual}>
              <ImagemProduto src={url} alt={`${nome} — foto ${i + 1} de ${n}`} prioridade={i === 0} />
            </div>
          ))
        ) : (
          <ImagemProduto src={null} alt={nome} />
        )}
        {n > 1 && (
          <>
            <button
              type="button"
              onClick={() => ir(atual - 1)}
              aria-label="Foto anterior"
              className="absolute left-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              type="button"
              onClick={() => ir(atual + 1)}
              aria-label="Próxima foto"
              className="absolute right-3 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/90 text-slate-900 shadow-lg backdrop-blur transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca md:opacity-0 md:group-hover:opacity-100 md:focus-visible:opacity-100"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
            <span className="absolute bottom-4 right-4 rounded-full bg-slate-900/70 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
              {atual + 1} / {n}
            </span>
          </>
        )}
      </div>
      {n > 1 && (
        <ul className="vt-sem-barra mt-3 flex gap-3 overflow-x-auto p-1" aria-label="Fotos do produto">
          {imagens.map((url, i) => (
            <li key={url} className="shrink-0">
              <button
                type="button"
                onClick={() => ir(i)}
                aria-label={`Ver foto ${i + 1}`}
                aria-current={i === atual}
                className={cn(
                  'block h-[4.5rem] w-[4.5rem] overflow-hidden rounded-xl bg-slate-50 ring-2 transition focus-visible:outline-none focus-visible:ring-marca sm:h-20 sm:w-20',
                  i === atual ? 'ring-slate-900' : 'opacity-70 ring-transparent hover:opacity-100',
                )}
              >
                <ImagemProduto src={url} alt="" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function PrecoGrande({ produto }: { produto: ProdutoVitrine }) {
  const p = partesPreco(produto.preco)
  const prazo = textoPrazo(produto.prazoDias)
  return (
    <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
      {p.valor === 'Sob consulta' ? (
        <p className="vt-titulo text-[1.75rem] font-extrabold text-marca-escuro">Sob consulta</p>
      ) : (
        <p className="flex flex-wrap items-baseline gap-x-2 text-slate-500">
          {p.prefixo && <span className="text-sm font-medium">{p.prefixo}</span>}
          <span className="vt-titulo text-[2rem] font-extrabold leading-none text-slate-900">{p.valor}</span>
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

type Erros = Partial<Record<'quantidade' | 'largura' | 'altura', string>>

function FormularioLista({ produto }: { produto: ProdutoVitrine }) {
  const { lista, whatsapp } = useVitrine()
  const usaMedidas = produto.modoCalculo === 'm2' || produto.modoCalculo === 'metro_linear'
  const medidas = produto.medidas
  const inicial = () => ({
    quantidade: '1',
    largura: medidaParaCampo(medidas?.larguraPadrao),
    altura: medidaParaCampo(medidas?.alturaPadrao),
    acabamentos: new Set(produto.acabamentos.filter((a) => a.obrigatorio || a.padrao).map((a) => a.id)),
    observacao: '',
  })
  const [form, setForm] = useState(inicial)
  const [erros, setErros] = useState<Erros>({})
  const [adicionado, setAdicionado] = useState<string | null>(null)
  const [cheia, setCheia] = useState(false)
  const aviso = useRef<HTMLDivElement>(null)

  const mudar = <K extends keyof ReturnType<typeof inicial>>(campo: K, valor: ReturnType<typeof inicial>[K]) => {
    setForm((f) => ({ ...f, [campo]: valor }))
    setAdicionado(null)
    if (campo in erros) setErros((e) => ({ ...e, [campo]: undefined }))
  }

  const larguraLida = lerMedida(form.largura)
  const alturaLida = lerMedida(form.altura)
  const area = produto.modoCalculo === 'm2' && larguraLida && alturaLida ? Number(larguraLida) * Number(alturaLida) : null
  const qtd = Math.trunc(Number(form.quantidade))

  const validar = (): Erros => {
    const e: Erros = {}
    if (!Number.isFinite(qtd) || qtd < 1 || String(qtd) !== form.quantidade.trim()) e.quantidade = 'Informe uma quantidade inteira, a partir de 1.'
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
    if (Object.keys(e).length) return
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
      setAdicionado(produto.nome)
      setForm(inicial())
    }
    window.setTimeout(() => aviso.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }), 50)
  }

  const wa = whatsapp(`Olá! Tenho interesse em: ${produto.nome}. Pode me ajudar?`)
  const n = lista.itens.length

  return (
    <form onSubmit={enviar} noValidate className="mt-8 space-y-6 rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_1.5rem_3rem_-1.5rem_rgba(15,23,42,0.18)] sm:p-7">
      <div>
        <h2 className="vt-titulo text-lg font-extrabold text-slate-900">Monte seu pedido de orçamento</h2>
        <p className="mt-1 text-sm text-slate-500">Escolha as opções e adicione à lista. Você envia tudo junto no final.</p>
      </div>

      <CampoQuantidade id="qtd" valor={form.quantidade} aoMudar={(v) => mudar('quantidade', v)} erro={erros.quantidade} />

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
          {area !== null && Number.isFinite(qtd) && qtd >= 1 && (
            <p className="mt-3 rounded-xl bg-slate-50 px-4 py-2.5 text-sm text-slate-600">
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
                      'flex items-start gap-3 rounded-xl border p-3.5 transition',
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
          className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[0.9375rem] text-slate-900 transition placeholder:text-slate-400 focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15"
        />
      </div>

      <div ref={aviso} aria-live="polite">
        {adicionado && (
          <div className="vt-surgir rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
            <p className="flex items-center gap-2 font-semibold text-emerald-900">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" /> Adicionado à sua lista de orçamento!
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Link to="/lista" className={cn(botao.base, botao.escuro, 'h-10 px-4 text-sm')}>
                Ver lista ({n}) <ArrowRight />
              </Link>
              <Link to="/produtos" className={cn(botao.base, botao.contorno, 'h-10 px-4 text-sm')}>
                Continuar escolhendo
              </Link>
            </div>
          </div>
        )}
        {cheia && (
          <p className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            Sua lista chegou ao limite de itens. Envie esta lista e depois monte outra.
          </p>
        )}
      </div>

      <button type="submit" className={cn(botao.base, botao.primario, botao.lg, 'w-full')}>
        Adicionar à lista de orçamento
      </button>
      <div className="flex flex-col items-center gap-3 border-t border-slate-100 pt-5 text-sm text-slate-500 sm:flex-row sm:justify-between">
        <span className="flex items-center gap-2">
          <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Orçamento sem compromisso
        </span>
        {wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 font-semibold text-[#128C4B] hover:underline">
            <IconeWhatsapp className="h-4 w-4" /> Dúvidas? Fale no WhatsApp
          </a>
        )}
      </div>
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
    <section aria-labelledby="titulo-relacionados" className="mt-20 lg:mt-28">
      <TituloSecao id="titulo-relacionados" sobretitulo="Veja também" titulo={produto.categoria ? `Mais em ${produto.categoria.nome}` : 'Outros produtos'} />
      <GradeProdutos produtos={outros} />
    </section>
  )
}

function Carregando() {
  return (
    <Container className="pt-8 lg:pt-12">
      <div role="status" aria-label="Carregando produto" className="grid gap-10 lg:grid-cols-2 lg:gap-16">
        <Esqueleto className="aspect-square rounded-[1.75rem]" />
        <div className="space-y-4">
          <Esqueleto className="h-4 w-24" />
          <Esqueleto className="h-10 w-3/4" />
          <Esqueleto className="h-8 w-40" />
          <Esqueleto className="mt-8 h-96 rounded-[1.75rem]" />
        </div>
      </div>
    </Container>
  )
}

export function ProdutoPagina() {
  const { api, slug } = useVitrine()
  const { produtoSlug = '' } = useParams()
  const consulta = useQuery({
    queryKey: ['vitrine', slug, 'produto', produtoSlug],
    queryFn: () => api.produto(produtoSlug),
    retry: (n, erro) => !naoEncontrado(erro) && n < 1,
  })
  const produto = consulta.data
  useTituloPagina(produto?.nome ?? (consulta.isError ? 'Produto não encontrado' : null))

  if (consulta.isPending) return <Carregando />
  if (!produto) {
    return naoEncontrado(consulta.error) ? (
      <NaoEncontradoPagina titulo="Produto não encontrado" texto="Este produto saiu do catálogo ou o endereço mudou. Veja os outros produtos da loja." />
    ) : (
      <NaoEncontradoPagina titulo="Não foi possível carregar o produto" texto={consulta.error?.message ?? 'Tente de novo em instantes.'} />
    )
  }
  const textos = paragrafos(produto.descricao)
  return (
    <Container className="pt-6 lg:pt-10">
      <nav aria-label="Você está em" className="mb-6 truncate text-sm text-slate-500">
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
      <div className="grid gap-10 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-14 xl:gap-20">
        <Galeria imagens={produto.imagens} nome={produto.nome} />
        <div>
          {produto.categoria && (
            <Link to={`/categoria/${produto.categoria.id}`} className="text-xs font-bold uppercase tracking-[0.16em] text-marca-escuro hover:underline">
              {produto.categoria.nome}
            </Link>
          )}
          <h1 className="vt-titulo mt-2 text-3xl font-extrabold leading-tight text-slate-900 sm:text-4xl">{produto.nome}</h1>
          <PrecoGrande produto={produto} />
          {textos[0] && <p className="mt-6 text-[1.0625rem] leading-relaxed text-slate-600 lg:hidden">{textos[0]}</p>}
          <FormularioLista key={produto.slug} produto={produto} />
          {textos.length > 0 && (
            <section aria-labelledby="titulo-descricao" className="mt-12">
              <h2 id="titulo-descricao" className="vt-titulo text-xl font-extrabold text-slate-900">
                Sobre o produto
              </h2>
              <div className="mt-4 space-y-4 text-[1.0625rem] leading-relaxed text-slate-600">
                {textos.map((p, i) => (
                  <p key={i} className="whitespace-pre-line">
                    {p}
                  </p>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
      <Relacionados produto={produto} />
    </Container>
  )
}
