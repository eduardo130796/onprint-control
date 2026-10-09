import { Link } from 'react-router-dom'
import { ArrowRight, Loader2, Save, Sparkles } from 'lucide-react'
import { formatarMoeda, type ParametrosPreco } from '@onprint/shared'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { usePermission } from '@/hooks/usePermission'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { formatarPercentual } from '../../custos'
import { SemaforoLucro } from './SemaforoLucro'
import type { EstadoComposicao, ResultadoCusto } from './estadoComposicao'

const PARTES = [
  { chave: 'materiais', rotulo: 'Materiais', cor: 'bg-marca' },
  { chave: 'producao', rotulo: 'Produção', cor: 'bg-sky-500' },
  { chave: 'rateio', rotulo: 'Custos fixos', cor: 'bg-amber-500' },
  { chave: 'extras', rotulo: 'Outros', cor: 'bg-violet-500' },
] as const

interface Props {
  estado: EstadoComposicao
  resultado: ResultadoCusto
  parametros: ParametrosPreco
  nota: string
  editavel: boolean
  alterado: boolean
  salvando: boolean
  onChange: (dados: Partial<EstadoComposicao>) => void
  onSalvar: () => void
}

/** Resumo ao vivo: custo por unidade (com as partes), percentuais da empresa, preço sugerido e lucro. */
export function ResumoCusto({ estado, resultado: r, parametros, nota, editavel, alterado, salvando, onChange, onSalvar }: Props) {
  const podeVerPrecificacao = usePermission('configuracoes')
  const custo = Number(r.custo)
  const composicao = estado.modoCusto === 'composicao'
  const totalPartes = Object.values(r.partes).reduce((s, v) => s + v, 0)
  const pct = parametros.percentuais
  const sufixo = r.unidade

  return (
    <aside className="space-y-4" aria-label="Resumo do custo e do preço">
      <div className="rounded-3xl bg-grafite p-5 text-white shadow-suave">
        <p className="text-xs font-semibold uppercase tracking-wide text-white/70">Custo por {sufixo}</p>
        <p className="mt-1 font-titulo text-3xl font-extrabold">{custo > 0 ? formatarMoeda(custo) : 'R$ —'}</p>
        <p className="mt-1 text-xs text-white/70">{composicao ? nota : 'Custo que você informou'}</p>
        {composicao && totalPartes > 0 && (
          <>
            <div className="mt-4 flex h-2.5 overflow-hidden rounded-full bg-white/10" role="img" aria-label="Partes do custo">
              {PARTES.map((p) => (r.partes[p.chave] > 0 ? <span key={p.chave} className={p.cor} style={{ width: `${(r.partes[p.chave] / totalPartes) * 100}%` }} /> : null))}
            </div>
            <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              {PARTES.filter((p) => r.partes[p.chave] > 0).map((p) => (
                <li key={p.chave} className="flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5 text-white/80">
                    <span className={cn('h-2 w-2 rounded-full', p.cor)} aria-hidden="true" />
                    {p.rotulo}
                  </span>
                  <span className="font-semibold">{formatarMoeda(r.partes[p.chave])}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>

      <div className="space-y-4 rounded-3xl bg-card p-5 shadow-suave">
        <div className="rounded-2xl bg-fundo p-3 text-xs text-texto-secundario">
          <p className="flex flex-wrap gap-x-3 gap-y-1">
            <span>
              Impostos <strong className="text-tinta">{formatarPercentual(pct.impostos)}</strong>
            </span>
            <span>
              Comissão <strong className="text-tinta">{formatarPercentual(pct.comissao)}</strong>
            </span>
            {Number(pct.custoFixo) > 0 && (
              <span>
                Custo fixo <strong className="text-tinta">{formatarPercentual(pct.custoFixo)}</strong>
              </span>
            )}
          </p>
          <p className="mt-1">
            Saem do preço de venda.{' '}
            {podeVerPrecificacao && (
              <Link to="/configuracoes/precificacao" className="font-semibold text-marca-escuro underline-offset-2 hover:underline">
                Ajustar em Precificação
              </Link>
            )}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cp-lucro">Lucro desejado</Label>
            <NumberInput id="cp-lucro" sufixo="%" value={estado.lucroDesejado} placeholder={decimalParaInput(parametros.lucroDesejadoPadrao).replace(',00', '')} disabled={!editavel} onChange={(e) => onChange({ lucroDesejado: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-lucromin">Lucro mínimo</Label>
            <NumberInput id="cp-lucromin" sufixo="%" value={estado.lucroMinimo} placeholder={decimalParaInput(parametros.lucroMinimoPadrao).replace(',00', '')} disabled={!editavel} onChange={(e) => onChange({ lucroMinimo: e.target.value })} />
          </div>
          <p className="col-span-2 -mt-1 text-xs text-texto-secundario">Em % do preço, depois de custos, impostos e comissão. Vazio = padrão da empresa.</p>
        </div>

        <div className="rounded-2xl bg-marca-suave p-4">
          <p className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-marca-escuro">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Preço sugerido
          </p>
          {r.sugerido ? (
            <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
              <p className="font-titulo text-2xl font-extrabold text-tinta">
                {formatarMoeda(r.sugerido)} <span className="text-sm font-semibold text-texto-secundario">/ {sufixo}</span>
              </p>
              {editavel && (
                <Button type="button" size="sm" disabled={decimalParaInput(r.sugerido) === estado.precoVenda} onClick={() => onChange({ precoVenda: decimalParaInput(r.sugerido) })}>
                  Usar este preço <ArrowRight />
                </Button>
              )}
            </div>
          ) : (
            <p className="mt-1 text-sm text-texto-secundario">{custo > 0 ? 'Os percentuais somam 95% ou mais: não há preço possível.' : 'Informe o custo para ver o preço sugerido.'}</p>
          )}
          {r.sugerido && <p className="mt-1 text-xs text-texto-secundario">Para um lucro de {formatarPercentual(r.lucroDesejado)}.</p>}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="cp-preco">Preço de venda / {sufixo}</Label>
            <MoneyInput id="cp-preco" value={estado.precoVenda} disabled={!editavel} onChange={(e) => onChange({ precoVenda: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cp-minimo">Preço mínimo</Label>
            <MoneyInput id="cp-minimo" value={estado.precoMinimo} placeholder="Sem mínimo" disabled={!editavel} onChange={(e) => onChange({ precoMinimo: e.target.value === '0,00' ? '' : e.target.value })} />
          </div>
          {r.sugeridoMinimo && editavel && (
            <p className="col-span-2 -mt-1 text-xs text-texto-secundario">
              Com o lucro mínimo, o preço seria {formatarMoeda(r.sugeridoMinimo)}.{' '}
              <button type="button" className="font-semibold text-marca-escuro underline-offset-2 hover:underline" onClick={() => onChange({ precoMinimo: decimalParaInput(r.sugeridoMinimo) })}>
                Usar como mínimo
              </button>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-4">
          <SemaforoLucro situacao={r.analise.situacao} lucroPercentual={r.analise.lucroPercentual} className="px-3 py-1 text-sm" />
          {r.analise.situacao !== 'sem_custo' && (
            <p className="text-xs text-texto-secundario">
              Sobra {formatarMoeda(r.analise.lucro)} / {sufixo}
            </p>
          )}
        </div>
        {r.analise.situacao === 'baixo' && <p className="text-xs text-amber-700">Abaixo do lucro mínimo de {formatarPercentual(r.lucroMinimo)}.</p>}

        {editavel && (
          <Button type="button" className="w-full" disabled={!alterado || salvando} onClick={onSalvar}>
            {salvando ? <Loader2 className="animate-spin" /> : <Save />} {alterado ? 'Salvar custo e preço' : 'Tudo salvo'}
          </Button>
        )}
      </div>
    </aside>
  )
}
