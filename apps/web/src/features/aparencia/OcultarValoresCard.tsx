import { useEffect, useRef } from 'react'
import { useLocation } from 'react-router-dom'
import { EyeOff, RotateCcw } from 'lucide-react'
import { toast } from 'sonner'
import { NIVEIS_OCULTAR, OCULTAR_VALORES_PADRAO, OCULTAR_VALORES_TUDO, type NivelOcultar, type OcultarValoresPrefs } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { Interruptor } from '@/features/vitrine/components/Interruptor'
import { useAuth } from '@/hooks/useAuth'
import { useOcultarValores } from '@/lib/ocultarValores'
import { cn } from '@/lib/utils'

type ChaveSimNao = { [K in keyof OcultarValoresPrefs]: OcultarValoresPrefs[K] extends boolean ? K : never }[keyof OcultarValoresPrefs]
type ChaveNivel = 'orcamentos' | 'pedidos'

const ROTULO_NIVEL: Record<NivelOcultar, string> = { nada: 'Nada', totais: 'Só totais', tudo: 'Tudo' }

/** As opções na ordem da tela: o que cada uma cobre, em palavras da gráfica */
const OPCOES: ({ chave: ChaveSimNao; nivel?: false } | { chave: ChaveNivel; nivel: true })[] = [
  { chave: 'painel' },
  { chave: 'financeiro' },
  { chave: 'orcamentos', nivel: true },
  { chave: 'pedidos', nivel: true },
  { chave: 'custoLucro' },
  { chave: 'produtos' },
  { chave: 'campos' },
]
const TEXTOS: Record<keyof OcultarValoresPrefs, { titulo: string; descricao: string }> = {
  painel: { titulo: 'Painel inicial', descricao: 'Faturamento e indicadores da Visão geral.' },
  financeiro: { titulo: 'Financeiro', descricao: 'Contas a receber e a pagar, fluxo de caixa, caixa/PDV, relatórios e as abas Financeiro do cliente e do pedido.' },
  orcamentos: { titulo: 'Orçamentos', descricao: 'Só totais: o valor final (no editor, no kanban e nas listas); os preços dos itens continuam à vista.' },
  pedidos: { titulo: 'Pedidos', descricao: 'Pedidos, entregas e produção. Só totais: o valor final do pedido.' },
  custoLucro: { titulo: 'Custo, lucro e margem', descricao: 'Em qualquer tela: o custo e o lucro do orçamento e dos itens, e a precificação dos produtos.' },
  produtos: { titulo: 'Preços do cadastro', descricao: 'Produtos, acabamentos, insumos, estoque e o catálogo.' },
  campos: { titulo: 'Campos de dinheiro', descricao: 'Também borra os campos onde se digita valor (o que você está digitando fica visível).' },
}

const iguais = (a: OcultarValoresPrefs, b: OcultarValoresPrefs) => JSON.stringify(a) === JSON.stringify(b)

/** Mini orçamento para ver o efeito das escolhas de orçamentos e de custo/lucro, sem sair da página */
function Previa({ prefs }: { prefs: OcultarValoresPrefs }) {
  const item = prefs.orcamentos === 'tudo'
  const total = prefs.orcamentos !== 'nada'
  const custo = prefs.custoLucro || prefs.orcamentos === 'tudo'
  const borra = (sim: boolean) => cn('transition-[filter]', sim && 'select-none blur-[6px]')
  return (
    <div className="rounded-2xl bg-fundo p-4 text-sm ring-1 ring-border" aria-hidden="true" data-mostrar-valor>
      <p className="text-[0.6875rem] font-semibold uppercase tracking-wide text-texto-secundario">Prévia · orçamento</p>
      <div className="mt-2 space-y-1.5">
        <div className="flex justify-between gap-3">
          <span className="truncate text-tinta">Banner lona 440g · 2 un</span>
          <span className={cn('shrink-0 tabular-nums text-tinta', borra(item))}>R$ 380,00</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="truncate text-tinta">Cartão de visita · 1.000 un</span>
          <span className={cn('shrink-0 tabular-nums text-tinta', borra(item))}>R$ 120,00</span>
        </div>
        <div className="flex justify-between gap-3 text-xs text-texto-secundario">
          <span>Lucro estimado</span>
          <span className={cn('tabular-nums', borra(custo))}>R$ 196,00 · 39,2%</span>
        </div>
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-3 border-t border-border pt-2.5">
        <span className="font-semibold text-tinta">Total</span>
        <span className={cn('font-titulo text-lg font-extrabold tabular-nums text-tinta', borra(total))}>R$ 500,00</span>
      </div>
    </div>
  )
}

/**
 * Aparência → Ocultar valores: o que o olho do topo esconde. Preferência de cada pessoa, salva na conta (vale em
 * qualquer computador) e salva sozinha a cada clique; com o olho ligado, a tela muda na hora.
 */
export function OcultarValoresCard() {
  const { usuario, definirPreferencias } = useAuth()
  const [olhoLigado, setOlhoLigado] = useOcultarValores()
  const prefs = usuario?.ocultarValores ?? OCULTAR_VALORES_PADRAO
  const secao = useRef<HTMLElement>(null)
  const { hash } = useLocation()
  // Veio do menu da conta ("O que ocultar…"): rola até aqui
  useEffect(() => {
    if (hash === '#ocultar-valores') secao.current?.scrollIntoView({ block: 'start' })
  }, [hash])

  const salvar = (novas: OcultarValoresPrefs) => void definirPreferencias({ ocultarValores: novas }).catch((erro: Error) => toast.error(erro.message))
  const mudar = <K extends keyof OcultarValoresPrefs>(chave: K, valor: OcultarValoresPrefs[K]) => salvar({ ...prefs, [chave]: valor })

  return (
    <section ref={secao} id="ocultar-valores" className="scroll-mt-24 rounded-3xl bg-card p-6 shadow-suave sm:p-8" aria-label="Ocultar valores">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca-suave text-marca-escuro">
          <EyeOff className="h-5 w-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="font-titulo text-xl font-extrabold text-tinta">Ocultar valores</h2>
          <p className="text-sm text-texto-secundario">
            Só para você. O olho no topo liga e desliga. Aqui você escolhe o que ele esconde. PDFs, mensagens e páginas do cliente não mudam.
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_17rem]">
        <ul className="divide-y divide-border">
          {OPCOES.map((o) => {
            const t = TEXTOS[o.chave]
            return (
              <li key={o.chave} className={cn('flex gap-3 py-3.5 first:pt-0', o.nivel ? 'flex-col sm:flex-row sm:items-center' : 'items-center')}>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-tinta">{t.titulo}</p>
                  <p className="text-xs text-texto-secundario">{t.descricao}</p>
                </div>
                {o.nivel ? (
                  <div role="radiogroup" aria-label={t.titulo} className="grid shrink-0 grid-cols-3 gap-1 rounded-xl bg-fundo p-1 sm:w-64">
                    {NIVEIS_OCULTAR.map((nivel) => {
                      const marcado = prefs[o.chave] === nivel
                      return (
                        <button
                          key={nivel}
                          type="button"
                          role="radio"
                          aria-checked={marcado}
                          onClick={() => mudar(o.chave, nivel)}
                          className={cn(
                            'rounded-lg px-2 py-1.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                            marcado ? 'bg-card text-tinta shadow-sm ring-1 ring-marca' : 'text-texto-secundario hover:text-tinta',
                          )}
                        >
                          {ROTULO_NIVEL[nivel]}
                        </button>
                      )
                    })}
                  </div>
                ) : (
                  <Interruptor marcado={prefs[o.chave]} onMudar={(v) => mudar(o.chave, v)} rotulo={t.titulo} />
                )}
              </li>
            )
          })}
        </ul>

        <div className="space-y-3">
          <Previa prefs={prefs} />
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={() => setOlhoLigado(!olhoLigado)} aria-pressed={olhoLigado}>
              <EyeOff /> {olhoLigado ? 'Olho ligado' : 'Ligar o olho'}
            </Button>
            {!iguais(prefs, OCULTAR_VALORES_TUDO) && (
              <Button variant="ghost" size="sm" onClick={() => salvar(OCULTAR_VALORES_TUDO)}>
                Esconder tudo
              </Button>
            )}
            {!iguais(prefs, OCULTAR_VALORES_PADRAO) && (
              <Button variant="ghost" size="sm" onClick={() => salvar(OCULTAR_VALORES_PADRAO)}>
                <RotateCcw /> Padrão
              </Button>
            )}
          </div>
          <p className="text-xs text-texto-secundario">Padrão: só o faturamento (painel inicial e financeiro).</p>
        </div>
      </div>
    </section>
  )
}
