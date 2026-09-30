import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowLeftRight } from 'lucide-react'
import { formatarMoeda } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { Can } from '@/components/shared/Can'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { formatarQuantidade } from '@/lib/quantidade'
import { ListaMovimentacoes } from './ListaMovimentacoes'
import { MovimentacaoDialog } from './MovimentacaoDialog'
import { SeloSituacao } from './SeloSituacao'

/** Resumo de estoque de um produto: saldo por local, custo médio e últimas 50 movimentações. */
export function ResumoEstoqueProduto({ produtoId }: { produtoId: string }) {
  const consulta = useQuery({ queryKey: ['estoque', 'produto', produtoId], queryFn: () => estoqueApi.doProduto(produtoId) })
  const [movimentando, setMovimentando] = useState(false)
  if (consulta.isPending) return <Skeleton className="h-48 w-full" />
  if (consulta.isError) return <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
  const d = consulta.data
  const un = d.produto.unidade

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        {[
          ['Saldo total', formatarQuantidade(d.saldo, un)],
          ['Mínimo', formatarQuantidade(d.produto.estoqueMinimo, un)],
          ['Custo médio', formatarMoeda(d.custoMedio)],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl bg-fundo p-3">
            <p className="text-xs text-texto-secundario">{rotulo}</p>
            <p className="font-semibold text-petroleo">{valor}</p>
          </div>
        ))}
        <div className="flex items-center justify-center rounded-xl bg-fundo p-3">
          <SeloSituacao situacao={d.situacao} />
        </div>
      </div>
      {d.locais.length > 1 && (
        <div className="flex flex-wrap gap-2 text-sm">
          {d.locais.map((l) => (
            <span key={l.local.id} className="rounded-full border border-border px-3 py-1">
              {l.local.nome}: <strong>{formatarQuantidade(l.saldo, un)}</strong>
            </span>
          ))}
        </div>
      )}
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-petroleo">Últimas movimentações</p>
        <Can modulo="estoque" acao="criar">
          <Button size="sm" variant="outline" onClick={() => setMovimentando(true)}>
            <ArrowLeftRight /> Movimentar
          </Button>
        </Can>
      </div>
      <ListaMovimentacoes movimentacoes={d.movimentacoes} />
      {movimentando && <MovimentacaoDialog produtoInicial={{ id: d.produto.id, rotulo: d.produto.nome }} onFechar={() => setMovimentando(false)} />}
    </div>
  )
}

export function KardexDialog({ produto, onFechar }: { produto: { id: string; nome: string } | null; onFechar: () => void }) {
  return (
    <Dialog open={Boolean(produto)} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="top-[5%] max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogTitle>{produto?.nome}</DialogTitle>
        <DialogDescription>Saldo por local e extrato de movimentações.</DialogDescription>
        {produto && <ResumoEstoqueProduto produtoId={produto.id} />}
      </DialogContent>
    </Dialog>
  )
}
