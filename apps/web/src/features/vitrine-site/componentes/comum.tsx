import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRight, ChevronLeft, ChevronRight, Clock, Printer } from 'lucide-react'
import type { PrecoVitrine, ProdutoCardVitrine } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { classeGrade } from '../estilos'
import { useRolagemLateral } from '../rolagem'
import { partesPreco, textoPrazo } from '../formato'

/** Largura máxima e respiros laterais do site */
export function Container({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cn('mx-auto w-full max-w-[90rem] px-4 sm:px-6 lg:px-10', className)}>{children}</div>
}

/** Foto do produto; sem foto (ou se falhar), um fundo na cor do tema com o ícone */
export function ImagemProduto({ src, alt, className, prioridade }: { src: string | null; alt: string; className?: string; prioridade?: boolean }) {
  const [falhou, setFalhou] = useState(false)
  if (!src || falhou) {
    return (
      <div className={cn('flex h-full w-full items-center justify-center bg-gradient-to-br from-marca-suave via-white to-marca-suave', className)} role="img" aria-label={alt}>
        <Printer className="h-1/4 w-1/4 max-h-16 max-w-16 text-marca/40" strokeWidth={1.4} />
      </div>
    )
  }
  return (
    <img
      src={src}
      alt={alt}
      loading={prioridade ? 'eager' : 'lazy'}
      decoding="async"
      onError={() => setFalhou(true)}
      className={cn('h-full w-full object-cover', className)}
    />
  )
}

/** Preço do cartão: "A partir de" discreto, valor forte, unidade discreta */
export function PrecoCompacto({ preco, className }: { preco: PrecoVitrine; className?: string }) {
  const p = partesPreco(preco)
  if (p.valor === 'Sob consulta') return <p className={cn('text-[0.9375rem] font-semibold text-marca-escuro', className)}>Sob consulta</p>
  return (
    <p className={cn('flex flex-wrap items-baseline gap-x-1 text-slate-500', className)}>
      {p.prefixo && <span className="text-xs">{p.prefixo}</span>}
      <span className="text-[1.0625rem] font-bold tracking-tight text-slate-900">{p.valor}</span>
      {p.sufixo && <span className="text-xs">{p.sufixo}</span>}
    </p>
  )
}

export function CartaoProduto({ produto, prioridade }: { produto: ProdutoCardVitrine; prioridade?: boolean }) {
  const prazo = textoPrazo(produto.prazoDias)
  return (
    <Link
      to={`/produto/${produto.slug}`}
      className="group flex flex-col rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-marca focus-visible:ring-offset-4"
    >
      <div className="relative aspect-square overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-inset ring-slate-900/5">
        <ImagemProduto
          src={produto.capaUrl}
          alt={produto.nome}
          prioridade={prioridade}
          className="transition duration-700 ease-out group-hover:scale-[1.04]"
        />
        <span className="pointer-events-none absolute inset-x-3 bottom-3 hidden translate-y-2 items-center justify-center gap-1.5 rounded-full bg-white/95 py-2.5 text-sm font-semibold text-slate-900 opacity-0 shadow-lg backdrop-blur transition duration-300 group-hover:translate-y-0 group-hover:opacity-100 md:flex">
          Ver detalhes <ArrowRight className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-3.5 flex flex-1 flex-col gap-1 px-0.5">
        {produto.categoria && <p className="truncate text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-slate-500">{produto.categoria.nome}</p>}
        <h3 className="line-clamp-2 text-[0.9375rem] font-semibold leading-snug text-slate-900 transition-colors group-hover:text-marca-escuro">{produto.nome}</h3>
        <PrecoCompacto preco={produto.preco} className="mt-auto pt-1" />
        {prazo && (
          <p className="flex items-center gap-1 text-xs text-slate-500">
            <Clock className="h-3.5 w-3.5" aria-hidden="true" /> {prazo}
          </p>
        )}
      </div>
    </Link>
  )
}

export function GradeProdutos({ produtos, prioridade = 0 }: { produtos: ProdutoCardVitrine[]; prioridade?: number }) {
  return (
    <ul className={classeGrade}>
      {produtos.map((p, i) => (
        <li key={p.slug}>
          <CartaoProduto produto={p} prioridade={i < prioridade} />
        </li>
      ))}
    </ul>
  )
}

export function Esqueleto({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-xl bg-slate-200/70', className)} aria-hidden="true" />
}

export function GradeEsqueleto({ quantidade = 8 }: { quantidade?: number }) {
  return (
    <div className={classeGrade} role="status" aria-label="Carregando produtos">
      {Array.from({ length: quantidade }, (_, i) => (
        <div key={i} className="space-y-3">
          <Esqueleto className="aspect-square rounded-2xl" />
          <Esqueleto className="h-3 w-1/3" />
          <Esqueleto className="h-4 w-4/5" />
          <Esqueleto className="h-4 w-1/2" />
        </div>
      ))}
    </div>
  )
}

/** Cabeçalho de seção: sobretítulo na cor, título e ação à direita */
export function TituloSecao({ sobretitulo, titulo, descricao, acao, id }: { sobretitulo?: string; titulo: string; descricao?: string; acao?: ReactNode; id?: string }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4 lg:mb-10">
      <div className="min-w-0 max-w-2xl">
        {sobretitulo && <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-marca-escuro">{sobretitulo}</p>}
        <h2 id={id} className="vt-titulo text-2xl font-extrabold text-slate-900 sm:text-3xl">
          {titulo}
        </h2>
        {descricao && <p className="mt-2 text-slate-600">{descricao}</p>}
      </div>
      {acao}
    </div>
  )
}

/** Produtos numa faixa que rola para o lado (destaques): qualquer quantidade fica bem, com setas no computador */
export function FaixaProdutos({ produtos, titulo, sobretitulo, id }: { produtos: ProdutoCardVitrine[]; titulo: string; sobretitulo?: string; id: string }) {
  const { ref: trilho, ...pos } = useRolagemLateral<HTMLUListElement>(produtos.length)
  const rolar = (dir: 1 | -1) => trilho.current?.scrollBy({ left: dir * trilho.current.clientWidth * 0.9, behavior: 'smooth' })
  const seta =
    'flex h-10 w-10 items-center sm:h-11 sm:w-11 justify-center rounded-full border border-slate-200 bg-white text-slate-900 transition hover:border-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca disabled:opacity-35 disabled:hover:border-slate-200'
  return (
    <section aria-labelledby={id} className="mt-20 lg:mt-28">
      <TituloSecao
        id={id}
        sobretitulo={sobretitulo}
        titulo={titulo}
        acao={
          !(pos.inicio && pos.fim) && (
            <div className="flex gap-2">
              <button type="button" className={seta} onClick={() => rolar(-1)} disabled={pos.inicio} aria-label="Ver anteriores">
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button type="button" className={seta} onClick={() => rolar(1)} disabled={pos.fim} aria-label="Ver próximos">
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )
        }
      />
      <ul
        ref={trilho}
        className="vt-sem-barra grid snap-x snap-mandatory auto-cols-[calc((100%-1rem)/2)] grid-flow-col gap-x-4 overflow-x-auto pb-2 sm:auto-cols-[calc((100%-1.5rem)/2)] sm:gap-x-6 md:auto-cols-[calc((100%-3rem)/3)] lg:auto-cols-[calc((100%-4.5rem)/4)]"
      >
        {produtos.map((p, i) => (
          <li key={p.slug} className="snap-start">
            <CartaoProduto produto={p} prioridade={i < 4} />
          </li>
        ))}
      </ul>
    </section>
  )
}
