import { useState, type ReactNode } from 'react'
import { ArrowDownToLine, ArrowUpFromLine, Lock } from 'lucide-react'
import { formatarDataHora, formatarMoeda, type CaixaSessaoDetalhe } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useCaixaAtual } from '../hooks'
import { AbrirCaixa, FecharCaixaDialog, SangriaDialog } from './CaixaDialogs'

/**
 * Moldura das telas do caixa: exige caixa aberto (senão mostra a abertura) e oferece
 * sangria, suprimento e fechamento. O conteúdo recebe a sessão aberta.
 */
export function TelaDeCaixa({ titulo, subtitulo, children }: { titulo: string; subtitulo: string; children: (sessao: CaixaSessaoDetalhe) => ReactNode }) {
  const atual = useCaixaAtual()
  const [dialogo, setDialogo] = useState<'sangria' | 'suprimento' | 'fechar' | null>(null)
  const s = atual.data

  return (
    <>
      <PageHeader
        titulo={titulo}
        subtitulo={s ? `${s.numero} · aberto em ${formatarDataHora(s.abertaEm)} · dinheiro na gaveta ${formatarMoeda(s.dinheiroEsperado)}` : subtitulo}
        acoes={
          s ? (
            <>
              <Button variant="outline" onClick={() => setDialogo('suprimento')}>
                <ArrowDownToLine /> Suprimento
              </Button>
              <Button variant="outline" onClick={() => setDialogo('sangria')}>
                <ArrowUpFromLine /> Sangria
              </Button>
              <Button variant="secondary" onClick={() => setDialogo('fechar')}>
                <Lock /> Fechar caixa
              </Button>
            </>
          ) : undefined
        }
      />
      {atual.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : atual.isError ? (
        <Card>
          <EstadoErro erro={atual.error} onTentarNovamente={() => void atual.refetch()} />
        </Card>
      ) : s ? (
        children(s)
      ) : (
        <AbrirCaixa />
      )}
      {s && (dialogo === 'sangria' || dialogo === 'suprimento') && <SangriaDialog tipo={dialogo} onFechar={() => setDialogo(null)} />}
      {s && dialogo === 'fechar' && <FecharCaixaDialog sessao={s} onFechar={() => setDialogo(null)} />}
    </>
  )
}
