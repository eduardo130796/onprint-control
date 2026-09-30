import { formatarMoeda, type PedidoDetalhe } from '@onprint/shared'
import { Card, CardContent } from '@/components/ui/card'

const num = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR') : '')

/** Itens do pedido (congelados na conversão do orçamento) e totais. */
export function AbaItens({ pedido }: { pedido: PedidoDetalhe }) {
  const linhas: [string, string][] = [
    ['Subtotal', pedido.subtotal],
    ...(Number(pedido.desconto) > 0 ? ([['Desconto', `-${pedido.desconto}`]] as [string, string][]) : []),
    ...(Number(pedido.acrescimo) > 0 ? ([['Acréscimo', pedido.acrescimo]] as [string, string][]) : []),
    ...(Number(pedido.frete) > 0 ? ([['Frete', pedido.frete]] as [string, string][]) : []),
  ]
  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-border text-left text-xs uppercase text-texto-secundario">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3 text-right">Qtd.</th>
                <th className="px-4 py-3 text-right">Unitário</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {pedido.itens.map((i) => (
                <tr key={i.id} className="align-top">
                  <td className="px-4 py-3">
                    <p className="font-medium">{i.descricao}</p>
                    <p className="text-xs text-texto-secundario">
                      {i.produto.codigo}
                      {i.largura && ` · ${num(i.largura)} × ${num(i.altura)} m (${num(i.areaM2)} m²)`}
                      {i.acabamentos.length > 0 && ` · ${i.acabamentos.map((a) => a.nome).join(', ')}`}
                    </p>
                    {i.observacao && <p className="mt-1 text-xs">{i.observacao}</p>}
                  </td>
                  <td className="px-4 py-3 text-right">{num(i.quantidade)}</td>
                  <td className="px-4 py-3 text-right">{formatarMoeda(i.precoUnitario)}</td>
                  <td className="px-4 py-3 text-right font-medium">{formatarMoeda(i.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="ml-auto max-w-xs space-y-1 p-4 text-sm">
          {linhas.map(([rotulo, valor]) => (
            <div key={rotulo} className="flex justify-between">
              <dt className="text-texto-secundario">{rotulo}</dt>
              <dd>{formatarMoeda(valor)}</dd>
            </div>
          ))}
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold text-petroleo">
            <dt>Total</dt>
            <dd>{formatarMoeda(pedido.total)}</dd>
          </div>
        </dl>
        {(pedido.observacoes || pedido.observacoesInternas) && (
          <div className="grid gap-3 border-t border-border p-4 text-sm sm:grid-cols-2">
            {pedido.observacoes && (
              <div>
                <p className="text-xs font-medium uppercase text-texto-secundario">Observações</p>
                <p className="whitespace-pre-line">{pedido.observacoes}</p>
              </div>
            )}
            {pedido.observacoesInternas && (
              <div>
                <p className="text-xs font-medium uppercase text-texto-secundario">Observações internas</p>
                <p className="whitespace-pre-line">{pedido.observacoesInternas}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
