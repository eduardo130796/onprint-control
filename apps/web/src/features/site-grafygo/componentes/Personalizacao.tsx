import { useEffect, useState } from 'react'
import { Check, FileText, Mail, Moon, Palette, Type } from 'lucide-react'
import { TEMAS } from '@onprint/shared'
import { cn } from '@/lib/utils'

/** Cores mostradas na página (capturas da empresa de demonstração em cada tema; ficam em public/site/) */
const CORES = ['grafygo', 'roxo', 'petroleo', 'laranja', 'vinho'] as const
type Cor = (typeof CORES)[number]

const FONTES = [
  { nome: 'Inter', familia: "'Inter Variable', sans-serif" },
  { nome: 'Manrope', familia: "'Manrope Variable', sans-serif" },
  { nome: 'Plus Jakarta', familia: "'Plus Jakarta Sans Variable', sans-serif" },
  { nome: 'Lexend', familia: "'Lexend Variable', sans-serif" },
  { nome: 'Nunito Sans', familia: "'Nunito Sans Variable', sans-serif" },
]

function Janela({ children, endereco, escura }: { children: React.ReactNode; endereco: string; escura?: boolean }) {
  return (
    <div className={cn('overflow-hidden rounded-2xl shadow-[0_2rem_4rem_-1.5rem_rgba(2,26,64,0.35)] ring-1', escura ? 'bg-[#0F172A] ring-white/10' : 'bg-white ring-slate-900/10')}>
      <div className={cn('flex items-center gap-1.5 border-b px-4 py-2.5', escura ? 'border-white/10 bg-[#111827]' : 'border-slate-200 bg-slate-50')}>
        <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" aria-hidden="true" />
        <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" aria-hidden="true" />
        <span className={cn('ml-3 flex-1 truncate rounded-md px-3 py-1 text-[0.6875rem]', escura ? 'bg-white/5 text-slate-400' : 'bg-white text-slate-400 ring-1 ring-slate-200')}>{endereco}</span>
      </div>
      {children}
    </div>
  )
}

/**
 * "Com a cara da sua gráfica": cor do tema (o sistema muda na hora ao escolher), documentos com a logo e a cor,
 * modo escuro, vitrine nas cores da gráfica e letra/tamanho de cada pessoa.
 */
export function Personalizacao() {
  const [cor, setCor] = useState<Cor>('grafygo')
  const tema = TEMAS[cor]

  // Pré-carrega as outras cores: a troca é instantânea
  useEffect(() => {
    for (const c of CORES) new Image().src = `/site/tema-${c}.webp`
  }, [])

  return (
    <div className="space-y-16">
      {/* Cor do tema: troca ao vivo */}
      <div className="grid items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
        <div>
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E6F2FE] text-[#0265DC]">
            <Palette className="h-5 w-5" aria-hidden="true" />
          </span>
          <h3 className="mt-5 font-titulo text-2xl font-extrabold text-[#021A40] sm:text-3xl">O sistema na cor da sua marca</h3>
          <p className="mt-3 text-lg leading-relaxed text-slate-600">Coloque a sua logo e escolha a cor: botões, menus, gráficos e destaques mudam na hora, para toda a equipe.</p>
          <p className="mt-6 text-sm font-semibold text-[#021A40]">Toque numa cor e veja:</p>
          <div role="radiogroup" aria-label="Cor do tema" className="mt-3 flex flex-wrap gap-2.5">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={cor === c}
                onClick={() => setCor(c)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full py-1.5 pl-1.5 pr-3.5 text-sm font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0265DC] focus-visible:ring-offset-2',
                  cor === c ? 'bg-[#021A40] text-white shadow' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:ring-slate-400',
                )}
              >
                <span className="flex h-6 w-6 items-center justify-center rounded-full ring-2 ring-white" style={{ backgroundColor: TEMAS[c].cor }}>
                  {cor === c && <Check className="h-3.5 w-3.5" style={{ color: TEMAS[c].contraste }} aria-hidden="true" />}
                </span>
                {TEMAS[c].nome}
              </button>
            ))}
          </div>
          <p className="mt-4 text-sm text-slate-500">São {Object.keys(TEMAS).length} cores para escolher, e a sua logo aparece no topo do sistema e nos documentos.</p>
        </div>
        <Janela endereco="app.grafygo.com.br">
          <img
            key={cor}
            src={`/site/tema-${cor}.webp`}
            alt={`Painel do sistema no tema ${tema.nome}`}
            width={1600}
            height={1000}
            loading="lazy"
            decoding="async"
            className="block aspect-[16/10] w-full bg-slate-100 object-cover object-top motion-safe:animate-[vt-surgir_0.3s_ease-out]"
          />
        </Janela>
      </div>

      {/* Documentos, modo escuro e vitrine */}
      <div className="grid gap-6 lg:grid-cols-3">
        <article className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="relative h-72 overflow-hidden bg-gradient-to-br from-slate-100 to-[#E6F2FE]" aria-hidden="true">
            {(['laranja', 'roxo', 'grafygo'] as const).map((c, i) => (
              <img
                key={c}
                src={`/site/pdf-${c}.webp`}
                alt=""
                loading="lazy"
                decoding="async"
                className="absolute top-8 w-44 rounded-md shadow-xl ring-1 ring-slate-900/10"
                style={{ left: `calc(50% - 5.5rem + ${(i - 1) * 4.25}rem)`, transform: `rotate(${(i - 1) * 6}deg) translateY(${i === 1 ? 0 : 0.75}rem)`, zIndex: i === 1 ? 2 : 1 }}
              />
            ))}
          </div>
          <div className="flex flex-1 flex-col p-6">
            <h3 className="flex items-center gap-2 font-titulo text-lg font-extrabold text-[#021A40]">
              <FileText className="h-5 w-5 text-[#0265DC]" aria-hidden="true" /> Documentos com a sua marca
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Orçamentos, pedidos, recibos, etiquetas e a ficha da produção saem com a sua logo, as suas cores e os seus contatos.</p>
          </div>
        </article>

        <article className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="h-72 overflow-hidden bg-[#0B1220] p-5 pb-0" aria-hidden="true">
            <img src="/site/escuro.webp" alt="" loading="lazy" decoding="async" className="h-full w-full rounded-t-xl object-cover object-left-top ring-1 ring-white/10" />
          </div>
          <div className="flex flex-1 flex-col p-6">
            <h3 className="flex items-center gap-2 font-titulo text-lg font-extrabold text-[#021A40]">
              <Moon className="h-5 w-5 text-[#0265DC]" aria-hidden="true" /> Claro ou escuro
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">Cada pessoa escolhe o modo da tela: claro de dia, escuro à noite ou igual ao do computador. Descanso para a vista no turno longo.</p>
          </div>
        </article>

        <article className="flex flex-col overflow-hidden rounded-3xl bg-white shadow-sm ring-1 ring-slate-200">
          <div className="h-72 overflow-hidden bg-gradient-to-br from-violet-100 to-violet-50 p-5 pb-0" aria-hidden="true">
            <img src="/site/vitrine-roxo.webp" alt="" loading="lazy" decoding="async" className="h-full w-full rounded-t-xl object-cover object-left-top shadow-lg ring-1 ring-slate-900/10" />
          </div>
          <div className="flex flex-1 flex-col p-6">
            <h3 className="flex items-center gap-2 font-titulo text-lg font-extrabold text-[#021A40]">
              <Palette className="h-5 w-5 text-[#0265DC]" aria-hidden="true" /> A vitrine com a sua identidade
            </h3>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">O site de produtos usa a sua logo, a sua cor, os seus banners e, se quiser, o seu domínio. O cliente vê a sua gráfica, não a nossa.</p>
          </div>
        </article>
      </div>

      {/* Letra, tamanho e e-mails */}
      <div className="grid gap-6 rounded-3xl bg-white p-7 shadow-sm ring-1 ring-slate-200 sm:p-9 lg:grid-cols-2 lg:gap-12">
        <div>
          <h3 className="flex items-center gap-2 font-titulo text-lg font-extrabold text-[#021A40]">
            <Type className="h-5 w-5 text-[#0265DC]" aria-hidden="true" /> Letra e tamanho do seu jeito
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Cada pessoa escolhe a fonte, a espessura do texto e o tamanho da tela. Quem prefere letra maior ou mais leve trabalha com conforto.</p>
          <div className="mt-5 flex flex-wrap gap-2">
            {FONTES.map((f) => (
              <span key={f.nome} className="rounded-xl bg-slate-50 px-3.5 py-2 text-[0.9375rem] text-[#021A40] ring-1 ring-slate-200" style={{ fontFamily: f.familia }}>
                {f.nome} <span className="text-slate-400">Aa</span>
              </span>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap gap-2 text-sm text-slate-600">
            {['Compacto', 'Padrão', 'Grande'].map((t, i) => (
              <span key={t} className="rounded-full bg-[#E6F2FE] px-3 py-1 font-medium text-[#024DCC]" style={{ fontSize: `${0.8125 + i * 0.125}rem` }}>
                {t}
              </span>
            ))}
          </div>
        </div>
        <div>
          <h3 className="flex items-center gap-2 font-titulo text-lg font-extrabold text-[#021A40]">
            <Mail className="h-5 w-5 text-[#0265DC]" aria-hidden="true" /> E-mails no nome da gráfica
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-600">Confirmações de pedido e avisos chegam com o nome e a cor da sua gráfica. Se o cliente responder, a resposta vai direto para o seu e-mail de atendimento.</p>
          <div className="mt-5 overflow-hidden rounded-2xl ring-1 ring-slate-200" aria-hidden="true">
            <div className="px-4 py-3 text-sm font-bold text-white" style={{ backgroundColor: tema.cor, color: tema.contraste }}>
              Ponto Visual
            </div>
            <div className="space-y-1.5 bg-white p-4 text-sm">
              <p className="font-semibold text-[#021A40]">Recebemos seu pedido de orçamento SOL-0042</p>
              <p className="text-slate-500">De: Ponto Visual · Responder para: contato@pontovisual.com.br</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
