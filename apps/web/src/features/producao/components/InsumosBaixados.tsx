import { Boxes } from 'lucide-react'
import { formatarMoeda, type OrdemProducaoDetalhe } from '@onprint/shared'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { formatarQuantidade } from '@/lib/quantidade'

/** Insumos que saíram do estoque quando a OP foi concluída (ficha técnica: área real + perda). */
export function InsumosBaixados({ op }: { op: OrdemProducaoDetalhe }) {
  const custo = op.consumos.reduce((s, c) => s + Math.abs(Number(c.quantidade)) * Number(c.custoUnitario), 0)
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Boxes className="h-4 w-4 text-marca-escuro" /> Insumos baixados
        </CardTitle>
      </CardHeader>
      <CardContent className="text-sm">
        {op.consumos.length === 0 ? (
          <p className="text-texto-secundario">
            {op.etapaAtual === 'concluido' ? 'Nenhum insumo com controle de estoque na ficha técnica.' : 'A baixa acontece quando a OP for concluída.'}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {op.consumos.map((c) => (
              <li key={c.id} className="flex justify-between gap-3 py-2">
                <span>{c.produto.nome}</span>
                <span className="font-medium">{formatarQuantidade(Math.abs(Number(c.quantidade)), c.produto.unidade)}</span>
              </li>
            ))}
            <li className="flex justify-between gap-3 pt-2 text-texto-secundario">
              <span>Custo dos insumos (custo médio)</span>
              <span>{formatarMoeda(custo)}</span>
            </li>
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
