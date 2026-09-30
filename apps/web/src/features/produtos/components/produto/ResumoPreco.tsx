import { AlertTriangle } from 'lucide-react'
import { TIPO_COBRANCA_ROTULOS, formatarMoeda, type ResultadoPreco } from '@onprint/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const num = (v: string, casas = 3) => Number(v).toLocaleString('pt-BR', { maximumFractionDigits: casas })

/** Memória de cálculo: área, perímetro, produto, cada acabamento e total. */
export function ResumoPreco({ resultado: r, sufixo }: { resultado: ResultadoPreco; sufixo: string }) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Resultado</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {!r.ok ? (
          <ul className="space-y-1 text-coral-escuro">
            {r.erros.map((e) => (
              <li key={e} className="flex gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {e}
              </li>
            ))}
          </ul>
        ) : (
          <>
            <dl className="space-y-1 text-texto-secundario">
              {Number(r.areaUnitaria) > 0 && (
                <div className="flex justify-between">
                  <dt>Área por peça</dt>
                  <dd>
                    {num(r.areaUnitaria)} m²{r.areaCobradaUnitaria !== r.areaUnitaria && ` (cobrado ${num(r.areaCobradaUnitaria)} m²)`}
                  </dd>
                </div>
              )}
              {Number(r.perimetroUnitario) > 0 && (
                <div className="flex justify-between">
                  <dt>Perímetro por peça</dt>
                  <dd>{num(r.perimetroUnitario)} m</dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt>Quantidade cobrada</dt>
                <dd>
                  {num(r.quantidadeCobrada)} {sufixo}
                </dd>
              </div>
            </dl>
            <div className="space-y-1 border-t border-border pt-3">
              <div className="flex justify-between">
                <span>Produto</span>
                <span>{formatarMoeda(r.valorProduto)}</span>
              </div>
              {r.acabamentos.map((a) => (
                <div key={a.id ?? a.nome} className="flex justify-between gap-2">
                  <span className="min-w-0">
                    {a.nome}
                    <span className="block text-xs text-texto-secundario">
                      {num(a.base)} × {TIPO_COBRANCA_ROTULOS[a.tipoCobranca].toLowerCase()}
                    </span>
                  </span>
                  <span>{formatarMoeda(a.valor)}</span>
                </div>
              ))}
            </div>
            <div className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="font-semibold text-petroleo">Total</span>
              <span className="text-2xl font-bold text-petroleo">{formatarMoeda(r.total)}</span>
            </div>
            <p className="text-right text-xs text-texto-secundario">{formatarMoeda(r.valorPorPeca)} por peça</p>
            {r.abaixoDoMinimo && (
              <p className="flex items-center gap-2 rounded-lg bg-ambar/10 p-2 text-xs text-amber-800">
                <AlertTriangle className="h-4 w-4" /> Preço abaixo do mínimo: no orçamento exigirá aprovação.
              </p>
            )}
            {r.margemPercentual !== null && Number(r.custoTotal) > 0 && (
              <p className="text-xs text-texto-secundario">
                Custo estimado {formatarMoeda(r.custoTotal)} · margem {num(r.margemPercentual, 2)}%
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
