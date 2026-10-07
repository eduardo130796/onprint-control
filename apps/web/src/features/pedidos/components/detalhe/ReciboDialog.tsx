import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileDown, Loader2, Printer, ReceiptText } from 'lucide-react'
import { formatarDataSimples, formatarMoeda, valorPorExtenso } from '@onprint/shared'
import { pedidosApi } from '@/api/producao'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { useImpressao } from '@/features/impressao/useImpressao'

/**
 * Recibo do pedido: lista os pagamentos já recebidos (sem estornos), todos marcados.
 * Desmarcando, o recibo sai só do que ficou marcado (ex.: só o sinal). Duas vias na mesma folha.
 */
export function ReciboDialog({ pedidoId, numero, onFechar }: { pedidoId: string; numero: string; onFechar: () => void }) {
  const consulta = useQuery({ queryKey: ['pedidos', 'recebimentos', pedidoId], queryFn: () => pedidosApi.recebimentos(pedidoId) })
  const impressao = useImpressao()
  const [marcados, setMarcados] = useState<Set<string>>(new Set())
  useEffect(() => {
    if (consulta.data) setMarcados(new Set(consulta.data.pagamentos.map((p) => p.id)))
  }, [consulta.data])

  const pagamentos = consulta.data?.pagamentos ?? []
  const escolhidos = pagamentos.filter((p) => marcados.has(p.id))
  const total = escolhidos.reduce((s, p) => s + Number(p.valor), 0)
  const gerar = (modo: 'imprimir' | 'baixar') => consulta.data && void impressao.recibo(pedidoId, { ...consulta.data, pagamentos: escolhidos }, modo)
  const alternar = (id: string) =>
    setMarcados((m) => {
      const novo = new Set(m)
      if (novo.has(id)) novo.delete(id)
      else novo.add(id)
      return novo
    })

  return (
    <Dialog open onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Recibo do pedido {numero}</DialogTitle>
        <DialogDescription>Marque os pagamentos que entram no recibo. Sai em duas vias (cliente e empresa) na mesma folha.</DialogDescription>
        {consulta.isPending ? (
          <Skeleton className="h-32 w-full" />
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : pagamentos.length === 0 ? (
          <EmptyState icone={ReceiptText} titulo="Nenhum pagamento recebido" descricao="O recibo fica disponível depois do primeiro recebimento." />
        ) : (
          <>
            <ul className="divide-y divide-border rounded-lg border border-border text-sm">
              {pagamentos.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 hover:bg-fundo/60">
                    <Checkbox checked={marcados.has(p.id)} onChange={() => alternar(p.id)} aria-label={`Incluir ${p.descricao}`} />
                    <span className="w-20 text-texto-secundario">{formatarDataSimples(p.data)}</span>
                    <span className="min-w-0 flex-1 truncate">
                      {p.descricao}
                      {p.forma && <span className="text-texto-secundario"> · {p.forma}</span>}
                    </span>
                    <span className="font-medium tabular-nums">{formatarMoeda(p.valor)}</span>
                  </label>
                </li>
              ))}
            </ul>
            <p className="rounded-lg bg-fundo p-3 text-sm">
              Total do recibo: <strong>{formatarMoeda(total)}</strong>
              {total > 0 && <span className="block text-xs text-texto-secundario">({valorPorExtenso(total)})</span>}
            </p>
          </>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={onFechar}>
            Fechar
          </Button>
          <Button variant="outline" onClick={() => gerar('baixar')} disabled={escolhidos.length === 0 || Boolean(impressao.ocupado)}>
            {impressao.ocupado === `recibo:${pedidoId}:baixar` ? <Loader2 className="animate-spin" /> : <FileDown />} Baixar PDF
          </Button>
          <Button onClick={() => gerar('imprimir')} disabled={escolhidos.length === 0 || Boolean(impressao.ocupado)}>
            {impressao.ocupado === `recibo:${pedidoId}:imprimir` ? <Loader2 className="animate-spin" /> : <Printer />} Imprimir recibo
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
