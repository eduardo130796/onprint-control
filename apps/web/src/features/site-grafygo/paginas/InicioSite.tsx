import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowRight, BadgeCheck, Check, ChevronDown, CreditCard, FileText, Lock, Menu, MessageCircle, QrCode, Receipt, ShieldCheck, Sparkles, X } from 'lucide-react'
import { MARCA, anosDireitos, documentoTitular } from '@/app/marca'
import { Logo } from '@/components/layout/Logo'
import { cn } from '@/lib/utils'
import { FLUXO, PERGUNTAS, RECURSOS, VITRINE_ITENS } from '../conteudo'
import { baseSistema, linkCadastro, usePlanosPublicos, whatsappSuporte, type PlanosPublicos } from '../dados'
import { MockAprovacao, MockArte, MockPainel, MockVitrine } from '../componentes/Mockups'
import { Planos } from '../componentes/Planos'
import { Tour } from '../componentes/Tour'

const NAV = [
  { href: '#por-dentro', rotulo: 'Por dentro' },
  { href: '#recursos', rotulo: 'Recursos' },
  { href: '#vitrine', rotulo: 'Vitrine online' },
  { href: '#planos', rotulo: 'Planos' },
  { href: '#duvidas', rotulo: 'Dúvidas' },
]

function Container({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6', className)}>{children}</div>
}

function Sobretitulo({ children, claro }: { children: React.ReactNode; claro?: boolean }) {
  return <p className={cn('text-xs font-bold uppercase tracking-[0.18em]', claro ? 'text-[#02BAF8]' : 'text-[#0265DC]')}>{children}</p>
}

function BotaoTestar({ dados, cupom, className, children = 'Testar grátis por 14 dias' }: { dados: PlanosPublicos | null; cupom: string | null; className?: string; children?: React.ReactNode }) {
  return (
    <a
      href={linkCadastro(dados, { cupom })}
      className={cn(
        'inline-flex h-12 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-[#0265DC] px-7 text-[0.9375rem] font-bold text-white shadow-lg shadow-[#0265DC]/30 transition hover:bg-[#024DCC] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC] focus-visible:ring-offset-2',
        className,
      )}
    >
      {children} <ArrowRight className="h-4 w-4" aria-hidden="true" />
    </a>
  )
}

function Topo({ dados, cupom }: { dados: PlanosPublicos | null; cupom: string | null }) {
  const [aberto, setAberto] = useState(false)
  const [rolou, setRolou] = useState(false)
  useEffect(() => {
    const medir = () => setRolou(window.scrollY > 8)
    medir()
    window.addEventListener('scroll', medir, { passive: true })
    return () => window.removeEventListener('scroll', medir)
  }, [])
  return (
    <header className={cn('sticky top-0 z-40 transition', rolou || aberto ? 'bg-white/90 shadow-sm backdrop-blur-xl' : 'bg-transparent')}>
      <Container className="flex h-16 items-center gap-6 lg:h-[4.5rem]">
        <a href="#inicio" aria-label={`${MARCA.produto}: início`} className="shrink-0">
          <Logo className="h-8 lg:h-9" />
        </a>
        <nav aria-label="Seções" className="hidden flex-1 items-center justify-center gap-1 lg:flex">
          {NAV.map((n) => (
            <a key={n.href} href={n.href} className="rounded-full px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100 hover:text-slate-900">
              {n.rotulo}
            </a>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-2 lg:ml-0">
          <a href={`${baseSistema(dados)}/login`} className="hidden rounded-full px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 sm:inline-flex">
            Entrar
          </a>
          <a href={linkCadastro(dados, { cupom })} className="inline-flex h-10 items-center rounded-full bg-[#0265DC] px-5 text-sm font-bold text-white transition hover:bg-[#024DCC]">
            Testar grátis
          </a>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full text-slate-800 hover:bg-slate-100 lg:hidden"
            aria-label={aberto ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={aberto}
            onClick={() => setAberto((x) => !x)}
          >
            {aberto ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </Container>
      {aberto && (
        <nav aria-label="Seções" className="border-t border-slate-100 bg-white lg:hidden">
          <Container className="flex flex-col py-3">
            {NAV.map((n) => (
              <a key={n.href} href={n.href} onClick={() => setAberto(false)} className="rounded-lg px-3 py-3 font-medium text-slate-800 hover:bg-slate-50">
                {n.rotulo}
              </a>
            ))}
            <a href={`${baseSistema(dados)}/login`} className="rounded-lg px-3 py-3 font-medium text-slate-800 hover:bg-slate-50">
              Entrar
            </a>
          </Container>
        </nav>
      )}
    </header>
  )
}

function Hero({ dados, cupom }: { dados: PlanosPublicos | null; cupom: string | null }) {
  return (
    <section id="inicio" className="relative overflow-hidden pb-16 pt-10 sm:pt-16 lg:pb-24">
      <div className="pointer-events-none absolute -right-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-[#02BAF8]/20 blur-3xl" aria-hidden="true" />
      <div className="pointer-events-none absolute -left-40 top-40 h-[28rem] w-[28rem] rounded-full bg-[#0265DC]/10 blur-3xl" aria-hidden="true" />
      <Container className="relative grid items-center gap-12 lg:grid-cols-[1fr_1.1fr] lg:gap-14">
        <div>
          <p className="inline-flex items-center gap-2 rounded-full bg-white px-3.5 py-1.5 text-xs font-semibold text-[#021A40] shadow-sm ring-1 ring-slate-200">
            <Sparkles className="h-3.5 w-3.5 text-[#F97316]" aria-hidden="true" /> Feito para gráficas e comunicação visual
          </p>
          <h1 className="mt-6 font-titulo text-[2.5rem] font-extrabold leading-[1.05] tracking-tight text-[#021A40] sm:text-6xl lg:text-[3.5rem] xl:text-[3.75rem]">
            Gestão inteligente para quem <span className="text-[#0265DC]">transforma ideias.</span>
          </h1>
          <p className="mt-6 max-w-xl text-lg leading-relaxed text-slate-600">
            Orçamento, pedido, arte, produção, estoque e financeiro num só lugar. E um site de produtos que traz pedidos direto para o seu WhatsApp.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row lg:flex-col xl:flex-row">
            <BotaoTestar dados={dados} cupom={cupom} />
            <a href="#planos" className="inline-flex h-12 items-center justify-center whitespace-nowrap rounded-full bg-white px-7 text-[0.9375rem] font-bold text-[#021A40] ring-1 ring-slate-300 transition hover:ring-slate-500">
              Ver planos e preços
            </a>
          </div>
          <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">
            {['14 dias grátis', 'Sem cartão de crédito', 'Cancele quando quiser'].map((t) => (
              <li key={t} className="flex items-center gap-1.5">
                <Check className="h-4 w-4 text-emerald-600" aria-hidden="true" /> {t}
              </li>
            ))}
          </ul>
        </div>
        <div className="relative">
          <MockPainel />
          <MockAprovacao className="absolute -bottom-16 -left-4 hidden w-44 rotate-[-4deg] sm:block lg:-left-2 xl:-left-8" />
          <MockArte className="absolute -right-2 -top-6 hidden w-52 rotate-[3deg] sm:block" />
        </div>
      </Container>
    </section>
  )
}

function Dores() {
  const dores = [
    { antes: 'Orçamento perdido no meio da conversa do WhatsApp', depois: 'Todos os orçamentos num lugar, com status e lembrete do que está para vencer.' },
    { antes: 'Cliente que "não aprovou aquela arte"', depois: 'Aprovação por link, com data e hora registradas no pedido.' },
    { antes: 'Não saber se o trabalho dá lucro', depois: 'Custo de material e máquina em cada produto e o lucro de cada pedido.' },
  ]
  return (
    <section className="bg-[#021A40] py-16 text-white sm:py-20" aria-labelledby="titulo-dores">
      <Container>
        <div className="max-w-2xl">
          <Sobretitulo claro>Chega de planilha, papel e caderninho</Sobretitulo>
          <h2 id="titulo-dores" className="mt-3 font-titulo text-3xl font-extrabold sm:text-4xl">
            A gráfica organizada, do balcão à entrega.
          </h2>
        </div>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {dores.map((d) => (
            <div key={d.antes} className="rounded-2xl bg-white/5 p-6 ring-1 ring-white/10">
              <p className="flex items-start gap-2 text-sm text-white/60 line-through decoration-[#F97316]/70">
                <X className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" aria-hidden="true" /> {d.antes}
              </p>
              <p className="mt-4 flex items-start gap-2 font-medium leading-relaxed">
                <BadgeCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#02BAF8]" aria-hidden="true" /> {d.depois}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  )
}

function PorDentro() {
  return (
    <section id="por-dentro" className="scroll-mt-20 bg-white py-20 sm:py-28" aria-labelledby="titulo-por-dentro">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Sobretitulo>Conheça por dentro</Sobretitulo>
          <h2 id="titulo-por-dentro" className="mt-3 font-titulo text-3xl font-extrabold text-[#021A40] sm:text-4xl">
            Veja cada parte do sistema funcionando
          </h2>
          <p className="mt-4 text-lg text-slate-600">Telas reais de uma gráfica usando a GrafyGo. Escolha uma área e veja o que ela faz por você.</p>
        </div>
        <div className="mt-14">
          <Tour />
        </div>
      </Container>
    </section>
  )
}

function Recursos() {
  return (
    <section id="recursos" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="titulo-recursos">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Sobretitulo>Tudo o que a gráfica precisa</Sobretitulo>
          <h2 id="titulo-recursos" className="mt-3 font-titulo text-3xl font-extrabold text-[#021A40] sm:text-4xl">
            Um sistema, da primeira mensagem ao dinheiro no caixa
          </h2>
          <p className="mt-4 text-lg text-slate-600">Feito com quem vive o dia a dia de comunicação visual: m², acabamentos, arte, máquina e prazo apertado.</p>
        </div>
        <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {RECURSOS.map((r) => (
            <article key={r.titulo} className="flex flex-col rounded-3xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F2FE] text-[#0265DC]">
                <r.icone className="h-5 w-5" aria-hidden="true" />
              </span>
              <h3 className="mt-5 font-titulo text-lg font-extrabold text-[#021A40]">{r.titulo}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">{r.texto}</p>
              <ul className="mt-4 space-y-1.5 border-t border-slate-100 pt-4 text-sm text-slate-700">
                {r.itens.map((i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#0265DC]" aria-hidden="true" /> {i}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
      </Container>
    </section>
  )
}

function Fluxo() {
  return (
    <section className="bg-white py-20 sm:py-24" aria-labelledby="titulo-fluxo">
      <Container>
        <div className="mx-auto max-w-2xl text-center">
          <Sobretitulo>Como funciona</Sobretitulo>
          <h2 id="titulo-fluxo" className="mt-3 font-titulo text-3xl font-extrabold text-[#021A40] sm:text-4xl">
            Do orçamento à entrega, sem retrabalho
          </h2>
        </div>
        <ol className="mt-14 grid gap-6 sm:grid-cols-2 lg:grid-cols-6">
          {FLUXO.map((f, i) => (
            <li key={f.titulo} className="relative text-center">
              {i < FLUXO.length - 1 && <span className="absolute left-1/2 top-7 hidden h-0.5 w-full bg-gradient-to-r from-[#0265DC]/40 to-[#02BAF8]/20 lg:block" aria-hidden="true" />}
              <span className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#021A40] text-white shadow-lg">
                <f.icone className="h-6 w-6" aria-hidden="true" />
                <span className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[#F97316] text-xs font-bold">{i + 1}</span>
              </span>
              <h3 className="mt-4 font-titulo font-extrabold text-[#021A40]">{f.titulo}</h3>
              <p className="mt-1 text-sm text-slate-600">{f.texto}</p>
            </li>
          ))}
        </ol>
      </Container>
    </section>
  )
}

function Vitrine({ dados, cupom }: { dados: PlanosPublicos | null; cupom: string | null }) {
  return (
    <section id="vitrine" className="relative scroll-mt-20 overflow-hidden bg-gradient-to-br from-[#021A40] via-[#03306E] to-[#0265DC] py-20 text-white sm:py-28" aria-labelledby="titulo-vitrine">
      <div className="pointer-events-none absolute -right-32 top-10 h-96 w-96 rounded-full bg-[#02BAF8]/25 blur-3xl" aria-hidden="true" />
      <Container className="relative grid items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
        <div>
          <Sobretitulo claro>Vitrine online · plano Completo</Sobretitulo>
          <h2 id="titulo-vitrine" className="mt-3 font-titulo text-3xl font-extrabold leading-tight sm:text-5xl">
            Seu catálogo vendendo no WhatsApp, 24 horas por dia
          </h2>
          <p className="mt-5 max-w-xl text-lg text-white/75">
            Um site com os seus produtos e preços, montado a partir do que já está no sistema. O cliente monta a lista e o pedido de orçamento chega organizado, pronto para responder.
          </p>
          <ul className="mt-9 grid gap-5 sm:grid-cols-2">
            {VITRINE_ITENS.map((v) => (
              <li key={v.titulo} className="rounded-2xl bg-white/[0.07] p-5 ring-1 ring-white/15">
                <p className="flex items-center gap-2 font-semibold">
                  <Check className="h-4 w-4 text-[#02BAF8]" aria-hidden="true" /> {v.titulo}
                </p>
                <p className="mt-1.5 text-sm leading-relaxed text-white/70">{v.texto}</p>
              </li>
            ))}
          </ul>
          <BotaoTestar dados={dados} cupom={cupom} className="mt-9 bg-white text-[#021A40] shadow-none hover:bg-[#E6F2FE]">
            Criar minha vitrine grátis
          </BotaoTestar>
        </div>
        <MockVitrine className="mx-auto w-full max-w-sm pb-8" />
      </Container>
    </section>
  )
}

function Pagamento({ notaFiscal }: { notaFiscal: boolean }) {
  const formas = [
    { icone: CreditCard, titulo: 'Cartão de crédito', texto: 'Renova sozinho, sem você lembrar.' },
    { icone: QrCode, titulo: 'PIX', texto: 'Na hora, pelo app do banco.' },
    { icone: Receipt, titulo: 'Boleto', texto: 'Para quem prefere pagar no banco.' },
    notaFiscal ? { icone: FileText, titulo: 'Nota fiscal', texto: 'Emitida a cada pagamento.' } : { icone: FileText, titulo: 'Comprovante', texto: 'Cada pagamento registrado no sistema.' },
  ]
  return (
    <section className="py-16" aria-labelledby="titulo-pagamento">
      <Container>
        <div className="grid items-center gap-10 rounded-3xl bg-white p-8 shadow-sm ring-1 ring-slate-200 sm:p-10 lg:grid-cols-[1fr_1.4fr]">
          <div>
            <h2 id="titulo-pagamento" className="font-titulo text-2xl font-extrabold text-[#021A40] sm:text-3xl">
              Assine como preferir
            </h2>
            <p className="mt-3 text-slate-600">Pagamento processado pelo Asaas, instituição autorizada pelo Banco Central. Os dados do cartão não passam pela GrafyGo.</p>
            <p className="mt-4 flex items-center gap-2 text-sm font-medium text-slate-700">
              <Lock className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Ambiente seguro e sem fidelidade
            </p>
          </div>
          <ul className="grid gap-4 sm:grid-cols-2">
            {formas.map((f) => (
              <li key={f.titulo} className="flex items-start gap-3 rounded-2xl bg-slate-50 p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white text-[#0265DC] ring-1 ring-slate-200">
                  <f.icone className="h-5 w-5" aria-hidden="true" />
                </span>
                <span>
                  <span className="block font-semibold text-[#021A40]">{f.titulo}</span>
                  <span className="text-sm text-slate-600">{f.texto}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      </Container>
    </section>
  )
}

function Duvidas() {
  return (
    <section id="duvidas" className="scroll-mt-20 py-20 sm:py-24" aria-labelledby="titulo-duvidas">
      <Container className="max-w-3xl">
        <div className="text-center">
          <Sobretitulo>Dúvidas frequentes</Sobretitulo>
          <h2 id="titulo-duvidas" className="mt-3 font-titulo text-3xl font-extrabold text-[#021A40] sm:text-4xl">
            Ficou alguma pergunta?
          </h2>
        </div>
        <div className="mt-10 space-y-3">
          {PERGUNTAS.map((p) => (
            <details key={p.pergunta} className="group rounded-2xl bg-white shadow-sm ring-1 ring-slate-200 open:ring-[#0265DC]/40">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 rounded-2xl px-6 py-5 font-semibold text-[#021A40] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC] [&::-webkit-details-marker]:hidden">
                {p.pergunta}
                <ChevronDown className="h-5 w-5 shrink-0 text-slate-400 transition group-open:rotate-180" aria-hidden="true" />
              </summary>
              <p className="px-6 pb-6 leading-relaxed text-slate-600">{p.resposta}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  )
}

function ChamadaFinal({ dados, cupom }: { dados: PlanosPublicos | null; cupom: string | null }) {
  const wa = whatsappSuporte(dados?.suporte, 'Olá! Quero saber mais sobre a GrafyGo.')
  return (
    <section className="pb-20" aria-labelledby="titulo-final">
      <Container>
        <div className="relative overflow-hidden rounded-[2rem] bg-[#021A40] px-6 py-14 text-center text-white sm:px-12 sm:py-16">
          <div className="pointer-events-none absolute -left-20 -top-20 h-72 w-72 rounded-full bg-[#0265DC]/40 blur-3xl" aria-hidden="true" />
          <div className="pointer-events-none absolute -bottom-24 -right-10 h-72 w-72 rounded-full bg-[#02BAF8]/25 blur-3xl" aria-hidden="true" />
          <div className="relative">
            <h2 id="titulo-final" className="mx-auto max-w-2xl font-titulo text-3xl font-extrabold sm:text-4xl">
              Comece hoje. Em 14 dias você não volta para a planilha.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-white/70">Crie a conta em 1 minuto, cadastre seus produtos e mande o primeiro orçamento com a sua marca ainda hoje.</p>
            <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
              <BotaoTestar dados={dados} cupom={cupom} className="bg-white text-[#021A40] shadow-none hover:bg-[#E6F2FE]" />
              {wa && (
                <a href={wa} target="_blank" rel="noopener noreferrer" className="inline-flex h-12 items-center gap-2 rounded-full px-6 font-semibold text-white ring-1 ring-white/30 transition hover:bg-white/10">
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> Falar com a gente
                </a>
              )}
            </div>
          </div>
        </div>
      </Container>
    </section>
  )
}

function Rodape({ dados }: { dados: PlanosPublicos | null }) {
  const sistema = baseSistema(dados)
  return (
    <footer className="border-t border-slate-200 bg-white">
      <Container className="grid gap-10 py-12 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-3 lg:col-span-2">
          <Logo className="h-8" />
          <p className="max-w-sm text-sm text-slate-600">{MARCA.slogan} Sistema de gestão para gráficas, comunicação visual e personalizados.</p>
          <p className="flex items-center gap-2 text-sm text-slate-600">
            <ShieldCheck className="h-4 w-4 text-emerald-600" aria-hidden="true" /> Dados protegidos conforme a LGPD
          </p>
        </div>
        <nav aria-label="Rodapé">
          <h2 className="text-sm font-bold text-[#021A40]">GrafyGo</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <a href="#recursos" className="hover:text-slate-900 hover:underline">
                Recursos
              </a>
            </li>
            <li>
              <a href="#planos" className="hover:text-slate-900 hover:underline">
                Planos e preços
              </a>
            </li>
            <li>
              <a href={`${sistema}/login`} className="hover:text-slate-900 hover:underline">
                Entrar
              </a>
            </li>
            <li>
              <a href={`${sistema}/criar-conta`} className="hover:text-slate-900 hover:underline">
                Criar conta grátis
              </a>
            </li>
          </ul>
        </nav>
        <div>
          <h2 className="text-sm font-bold text-[#021A40]">Contato e legal</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            <li>
              <a href={`mailto:${MARCA.contato}`} className="hover:text-slate-900 hover:underline">
                {MARCA.contato}
              </a>
            </li>
            {dados?.suporte && !dados.suporte.includes('@') && <li>{dados.suporte}</li>}
            <li>
              <Link to="/termos" className="hover:text-slate-900 hover:underline">
                Termos de uso
              </Link>
            </li>
            <li>
              <Link to="/privacidade" className="hover:text-slate-900 hover:underline">
                Política de privacidade
              </Link>
            </li>
          </ul>
        </div>
      </Container>
      <div className="border-t border-slate-100">
        <Container className="flex flex-col items-center justify-between gap-2 py-6 text-xs text-slate-500 sm:flex-row">
          <p>
            © {anosDireitos()} {MARCA.empresa}
            {MARCA.titular ? ` · ${MARCA.titular}` : ''}
            {documentoTitular() ? ` · ${documentoTitular()}` : ''} · Todos os direitos reservados
          </p>
          <p>Feito no Brasil para quem imprime o Brasil.</p>
        </Container>
      </div>
    </footer>
  )
}

/** grafygo.com.br: a página de venda (recursos, vitrine, planos com mensal/anual, pagamento e dúvidas) */
export function InicioSite() {
  const { dados } = usePlanosPublicos()
  const [params] = useSearchParams()
  // Cupom de divulgação (grafygo.com.br/?cupom=X) segue para o cadastro
  const cupom = params.get('cupom')?.trim().toUpperCase() || null

  return (
    <div className="min-h-screen bg-[#F5F8FC] text-slate-900">
      <a href="#conteudo" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:shadow">
        Pular para o conteúdo
      </a>
      <Topo dados={dados} cupom={cupom} />
      <main id="conteudo">
        <Hero dados={dados} cupom={cupom} />
        <Dores />
        <PorDentro />
        <Recursos />
        <Fluxo />
        <Vitrine dados={dados} cupom={cupom} />
        <section id="planos" className="scroll-mt-20 py-20 sm:py-28" aria-labelledby="titulo-planos">
          <Container>
            <div className="mx-auto max-w-2xl text-center">
              <Sobretitulo>Planos e preços</Sobretitulo>
              <h2 id="titulo-planos" className="mt-3 font-titulo text-3xl font-extrabold text-[#021A40] sm:text-4xl">
                Preço justo para gráfica de todo tamanho
              </h2>
              <p className="mt-4 text-lg text-slate-600">Teste 14 dias com tudo liberado. Escolha o plano só quando for assinar.</p>
            </div>
            <div className="mt-10">
              <Planos dados={dados} cupom={cupom} />
            </div>
          </Container>
        </section>
        <Pagamento notaFiscal={Boolean(dados?.notaFiscal)} />
        <Duvidas />
        <ChamadaFinal dados={dados} cupom={cupom} />
      </main>
      <Rodape dados={dados} />
    </div>
  )
}
