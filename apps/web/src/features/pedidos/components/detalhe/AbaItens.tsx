import { Fragment } from 'react'
import { formatarMoeda } from '@onprint/shared'
import type { PedidoComAnalise } from '@/api/producao'
import { Card, CardContent } from '@/components/ui/card'
import { LucroDoItem, LucroDoTotal } from '@/features/produtos/components/custo/LucroAnalise'

const num = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR') : '')

/** Itens do pedido (congelados na conversão do orçamento) e totais. */
export function AbaItens({ pedido }: { pedido: PedidoComAnalise }) {
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
                <Fragment key={i.id}>
                  <tr className="align-top">
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
                  {/* Lucro numa linha inteira: no celular a coluna do item é estreita para a composição */}
                  {i.analise && (
                    <tr className="!border-t-0">
                      <td colSpan={4} className="px-4 pb-3 pt-0">
                        <LucroDoItem analise={i.analise} className="sticky left-4 max-w-[calc(100vw-4rem)] sm:static sm:max-w-none" />
                      </td>
                    </tr>
                  )}
                </Fragment>
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
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold text-tinta">
            <dt>Total</dt>
            <dd>{formatarMoeda(pedido.total)}</dd>
          </div>
          {pedido.analise && <LucroDoTotal analise={pedido.analise} rotulo="Lucro do pedido" className="!mt-3 border-t border-border pt-3" />}
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
