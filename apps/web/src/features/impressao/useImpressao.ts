import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { EmpresaConfig, OrcamentoDetalhe, RecebimentosPedido } from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import { empresaApi } from '@/api/configuracoes'
import { pedidosApi } from '@/api/producao'
import { CHAVE_EMPRESA } from '@/features/configuracoes/hooks'
import { baixarArquivo } from '@/lib/csv'
import { imprimirPdf } from '@/lib/imprimir'

export type ModoImpressao = 'imprimir' | 'baixar'
type Gerador = typeof import('./gerar')

/**
 * Impressão e download dos documentos (orçamento, pedido, etiquetas). "Imprimir" abre o diálogo
 * do navegador sem baixar arquivo; a biblioteca de PDF só é carregada na primeira vez.
 * `ocupado` traz a chave do documento sendo gerado (para o spinner do botão certo).
 */
export function useImpressao() {
  const queryClient = useQueryClient()
  const [ocupado, setOcupado] = useState<string | null>(null)

  async function rodar(chave: string, modo: ModoImpressao, gerar: (g: Gerador, empresa: EmpresaConfig) => Promise<{ blob: Blob; nome: string }>) {
    setOcupado(chave)
    try {
      const [g, empresa] = await Promise.all([import('./gerar'), queryClient.fetchQuery({ queryKey: CHAVE_EMPRESA, queryFn: empresaApi.obter, staleTime: 5 * 60 * 1000 })])
      const { blob, nome } = await gerar(g, empresa)
      if (modo === 'imprimir') imprimirPdf(blob)
      else baixarArquivo(blob, nome, 'application/pdf')
    } catch (e) {
      toast.error(`Não foi possível gerar o documento: ${(e as Error).message}`)
    } finally {
      setOcupado(null)
    }
  }

  return {
    ocupado,
    orcamento: (o: OrcamentoDetalhe | string, modo: ModoImpressao) =>
      rodar(`orcamento:${typeof o === 'string' ? o : o.id}:${modo}`, modo, async (g, e) => g.pdfOrcamento(typeof o === 'string' ? await orcamentosApi.obter(o) : o, e)),
    pedido: (id: string, modo: ModoImpressao) => rodar(`pedido:${id}:${modo}`, modo, async (g, e) => g.pdfPedido(await pedidosApi.obter(id), e)),
    /** Recibo dos pagamentos escolhidos do pedido */
    recibo: (pedidoId: string, recebimentos: RecebimentosPedido, modo: ModoImpressao) =>
      rodar(`recibo:${pedidoId}:${modo}`, modo, async (g, e) => g.pdfRecibo(await pedidosApi.obter(pedidoId), recebimentos, e)),
    /** Etiquetas de entrega do pedido inteiro, ou só das OPs informadas */
    etiquetas: (pedidoId: string, opIds?: string[]) =>
      rodar(`etiquetas:${opIds?.join(',') ?? pedidoId}`, 'imprimir', async (g, e) => g.pdfEtiquetas(await pedidosApi.obter(pedidoId), e, opIds)),
  }
}
