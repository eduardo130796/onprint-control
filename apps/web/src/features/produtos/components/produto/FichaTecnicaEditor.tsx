import { useState } from 'react'
import { ListTree, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { BASES_INSUMO, BASE_INSUMO_ROTULOS, formatarMoeda, type BaseInsumo, type ProdutoDetalhe } from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { EmptyState } from '@/components/shared/EmptyState'
import { NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { decimalParaInput } from '@/lib/mascaras'
import { useInsumosOpcoes, useMutacao } from '../../hooks'

interface Linha {
  insumoId: string
  quantidade: string
  base: BaseInsumo
  perdaPercentual: string
}

/** Ficha técnica: insumos consumidos por peça, m² ou metro (base da baixa automática de estoque). */
export function FichaTecnicaEditor({ produto, podeEditar, veCustos }: { produto: ProdutoDetalhe; podeEditar: boolean; veCustos: boolean }) {
  const insumos = useInsumosOpcoes()
  const [linhas, setLinhas] = useState<Linha[]>(() =>
    produto.insumos.map((i) => ({
      insumoId: i.insumoId,
      quantidade: decimalParaInput(i.quantidade, 4).replace(/,?0+$/, ''),
      base: i.base,
      perdaPercentual: decimalParaInput(i.perdaPercentual),
    })),
  )
  const salvar = useMutacao(['produtos'], () => produtosApi.salvarInsumos(produto.id, linhas))
  const disponiveis = (insumos.data ?? []).filter((i) => i.id !== produto.id)
  const baseSugerida: BaseInsumo = produto.modoCalculo === 'm2' ? 'por_m2' : produto.modoCalculo === 'metro_linear' ? 'por_metro_linear' : 'por_unidade'

  const alterar = (indice: number, dados: Partial<Linha>) => setLinhas((l) => l.map((linha, i) => (i === indice ? { ...linha, ...dados } : linha)))
  const custoLinha = (l: Linha) => {
    const insumo = disponiveis.find((i) => i.id === l.insumoId)
    const qtd = Number(l.quantidade.replace(/\./g, '').replace(',', '.')) || 0
    const perda = Number(l.perdaPercentual.replace(',', '.')) || 0
    return insumo?.custo ? Number(insumo.custo) * qtd * (1 + perda / 100) : null
  }

  return (
    <Card>
      {linhas.length === 0 ? (
        <EmptyState icone={ListTree} titulo="Ficha técnica vazia" descricao="Informe os insumos consumidos para produzir este item (ex.: 1 m² de lona por m², com 5% de perda)." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-fundo/60 text-left text-xs uppercase tracking-wide text-texto-secundario">
              <tr>
                <th className="px-4 py-3 font-medium">Insumo</th>
                <th className="w-32 px-4 py-3 font-medium">Quantidade</th>
                <th className="w-44 px-4 py-3 font-medium">Consumo</th>
                <th className="w-28 px-4 py-3 font-medium">Perda</th>
                {veCustos && <th className="w-28 px-4 py-3 font-medium">Custo</th>}
                <th className="w-12" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {linhas.map((l, i) => {
                const custo = custoLinha(l)
                return (
                  <tr key={i}>
                    <td className="px-4 py-2">
                      <Select value={l.insumoId} disabled={!podeEditar} onChange={(e) => alterar(i, { insumoId: e.target.value })} aria-label="Insumo">
                        <option value="">Selecione…</option>
                        {disponiveis.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.codigo} · {d.nome}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <NumberInput casas={4} value={l.quantidade} disabled={!podeEditar} onChange={(e) => alterar(i, { quantidade: e.target.value })} aria-label="Quantidade" />
                    </td>
                    <td className="px-4 py-2">
                      <Select value={l.base} disabled={!podeEditar} onChange={(e) => alterar(i, { base: e.target.value as BaseInsumo })} aria-label="Consumo">
                        {BASES_INSUMO.map((b) => (
                          <option key={b} value={b}>
                            {BASE_INSUMO_ROTULOS[b]}
                          </option>
                        ))}
                      </Select>
                    </td>
                    <td className="px-4 py-2">
                      <NumberInput sufixo="%" value={l.perdaPercentual} disabled={!podeEditar} onChange={(e) => alterar(i, { perdaPercentual: e.target.value })} aria-label="Perda" />
                    </td>
                    {veCustos && <td className="px-4 py-2 text-texto-secundario">{custo === null ? '—' : formatarMoeda(custo)}</td>}
                    <td className="px-2 py-2">
                      {podeEditar && (
                        <Button type="button" variant="ghost" size="icon" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setLinhas((ls) => ls.filter((_, j) => j !== i))} aria-label="Remover insumo">
                          <Trash2 />
                        </Button>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
      {podeEditar && (
        <div className="flex flex-wrap justify-between gap-2 border-t border-border p-4">
          <Button type="button" variant="outline" onClick={() => setLinhas((l) => [...l, { insumoId: '', quantidade: '1', base: baseSugerida, perdaPercentual: '0' }])}>
            <Plus /> Adicionar insumo
          </Button>
          <Button
            disabled={salvar.isPending || linhas.some((l) => !l.insumoId)}
            onClick={() => salvar.mutate(undefined, { onSuccess: () => toast.success('Ficha técnica salva.'), onError: (e) => toast.error(e.message) })}
          >
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar ficha técnica
          </Button>
        </div>
      )}
    </Card>
  )
}
