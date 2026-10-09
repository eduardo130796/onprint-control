import { useId, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { formatarMoeda, type AnaliseLucro, type SituacaoLucro } from '@onprint/shared'
import { cn } from '@/lib/utils'
import { ROTULO_SEMAFORO, SITUACAO_LUCRO, agruparLinhasCusto } from '../../custos'
import { SemaforoLucro } from './SemaforoLucro'

/**
 * Lucro do item e do total no orçamento/pedido. Todo mundo vê o semáforo; os números (custo, lucro e a
 * composição) só aparecem quando a API os manda — e ela só manda para quem vê custos.
 */

/** Só a cor e o rótulo ("Lucro ok", "Lucro baixo", "Prejuízo"): o que o vendedor vê. */
export function SeloSemaforo({ situacao, className }: { situacao: SituacaoLucro; className?: string }) {
  const s = SITUACAO_LUCRO[situacao]
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', s.classe, className)}>
      <span className={cn('h-2 w-2 rounded-full', s.ponto)} aria-hidden="true" />
      {ROTULO_SEMAFORO[situacao]}
    </span>
  )
}

// Sem custo cadastrado o "lucro" seria o preço inteiro: mostra só o aviso
const temNumeros = (a: AnaliseLucro): a is AnaliseLucro & { custoDireto: string; lucro: string; lucroPercentual: string } =>
  a.situacao !== 'sem_custo' && a.custoDireto !== undefined && a.lucro !== undefined && a.lucroPercentual !== undefined

const qtd = (v: string) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 })

/** Detalhamento do custo do item, agrupado (produto e materiais, produção, acabamentos, outros). */
function ComposicaoCusto({ linhas, id }: { linhas: NonNullable<AnaliseLucro['linhas']>; id: string }) {
  const grupos = agruparLinhasCusto(linhas)
  if (!grupos.length) return <p id={id} className="mt-2 text-xs text-texto-secundario">Sem custo cadastrado para este item.</p>
  return (
    <div id={id} className="mt-2 space-y-2 rounded-2xl bg-fundo p-3 text-xs">
      {grupos.map((g) => (
        <div key={g.grupo}>
          <p className="flex justify-between gap-3 font-semibold text-tinta">
            <span>{g.rotulo}</span>
            <span className="tabular-nums">{formatarMoeda(g.valor)}</span>
          </p>
          <ul className="mt-0.5 space-y-0.5 text-texto-secundario">
            {g.linhas.map((l, i) => (
              <li key={i} className="flex justify-between gap-3 pl-3">
                <span className="min-w-0">
                  {l.nome}
                  {l.unidade && Number(l.quantidade) > 0 && <span className="opacity-80"> · {qtd(l.quantidade)} {l.unidade}</span>}
                </span>
                <span className="shrink-0 tabular-nums">{formatarMoeda(l.valor)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

interface Props {
  analise: AnaliseLucro | null | undefined
  /** Mudou algo e a análise nova ainda não chegou: esmaece sem piscar */
  desatualizado?: boolean
  className?: string
  /** Rótulo do total sem números ("Lucro do orçamento", "Lucro do pedido") */
  rotulo?: string
}

/** Linha de lucro embaixo do item (orçamento e pedido). */
export function LucroDoItem({ analise, desatualizado, className }: Props) {
  const [aberto, setAberto] = useState(false)
  const idComposicao = useId()
  if (!analise) return null
  const base = cn('transition-opacity duration-300', desatualizado && 'opacity-60', className)
  if (!temNumeros(analise)) return <div className={base}><SeloSemaforo situacao={analise.situacao} /></div>
  return (
    <div className={base}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-texto-secundario">
        <SemaforoLucro situacao={analise.situacao} lucroPercentual={analise.lucroPercentual} />
        <span>
          Custo <strong className="font-semibold text-tinta">{formatarMoeda(analise.custoDireto)}</strong>
        </span>
        <span>
          Lucro <strong className={cn('font-semibold', Number(analise.lucro) < 0 ? 'text-coral-escuro' : 'text-tinta')}>{formatarMoeda(analise.lucro)}</strong>
        </span>
        {analise.linhas && (
          <button
            type="button"
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-semibold text-marca-escuro hover:bg-marca-suave focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-expanded={aberto}
            aria-controls={idComposicao}
            onClick={() => setAberto((v) => !v)}
          >
            Composição do custo <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto && 'rotate-180')} aria-hidden="true" />
          </button>
        )}
      </div>
      {aberto && analise.linhas && <ComposicaoCusto linhas={analise.linhas} id={idComposicao} />}
    </div>
  )
}

/** Bloco de lucro dos totais (orçamento e pedido). */
export function LucroDoTotal({ analise, desatualizado, className, rotulo = 'Lucro do orçamento' }: Props) {
  if (!analise) return null
  const base = cn('transition-opacity duration-300', desatualizado && 'opacity-60', className)
  if (!temNumeros(analise)) {
    return (
      <div className={cn('flex items-center justify-between gap-3', base)}>
        <span className="text-texto-secundario">{rotulo}</span>
        <SeloSemaforo situacao={analise.situacao} />
      </div>
    )
  }
  return (
    <div className={cn('space-y-1.5', base)}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-texto-secundario">Lucro estimado</span>
        <SemaforoLucro situacao={analise.situacao} lucroPercentual={analise.lucroPercentual} />
      </div>
      <dl className="grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-xl bg-fundo px-3 py-2">
          <dt className="text-texto-secundario">Custo direto</dt>
          <dd className="font-semibold tabular-nums text-tinta">{formatarMoeda(analise.custoDireto)}</dd>
        </div>
        <div className="rounded-xl bg-fundo px-3 py-2">
          <dt className="text-texto-secundario">Lucro</dt>
          <dd className={cn('font-semibold tabular-nums', Number(analise.lucro) < 0 ? 'text-coral-escuro' : 'text-tinta')}>{formatarMoeda(analise.lucro)}</dd>
        </div>
      </dl>
      {analise.despesasSobrePreco !== undefined && Number(analise.despesasSobrePreco) > 0 && (
        <p className="text-xs text-texto-secundario">Já descontados impostos, comissão e custos fixos: {formatarMoeda(analise.despesasSobrePreco)}.</p>
      )}
    </div>
  )
}
