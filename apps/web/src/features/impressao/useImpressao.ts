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
type GrupoEtiquetas = import('./gerar').GrupoEtiquetas
type OpcoesEtiquetas = import('./gerar').OpcoesEtiquetas

/**
 * Impressão e download dos documentos (orçamento, pedido, etiquetas). "Imprimir" abre o diálogo
 * do navegador sem baixar arquivo; a biblioteca de PDF só é carregada na primeira vez.
 * `ocupado` traz a chave do documento sendo gerado (para o spinner do botão certo).
 */
export function useImpressao() {
  const queryClient = useQueryClient()
  const [ocupado, setOcupado] = useState<string | null>(null)

  /** Gera e imprime/baixa; devolve true se deu certo (a fila de etiquetas só marca impressas nesse caso). */
  async function rodar(chave: string, modo: ModoImpressao, gerar: (g: Gerador, empresa: EmpresaConfig) => Promise<{ blob: Blob; nome: string }>) {
    setOcupado(chave)
    try {
      const [g, empresa] = await Promise.all([import('./gerar'), queryClient.fetchQuery({ queryKey: CHAVE_EMPRESA, queryFn: empresaApi.obter, staleTime: 5 * 60 * 1000 })])
      const { blob, nome } = await gerar(g, empresa)
      if (modo === 'imprimir') imprimirPdf(blob)
      else baixarArquivo(blob, nome, 'application/pdf')
      return true
    } catch (e) {
      toast.error(`Não foi possível gerar o documento: ${(e as Error).message}`)
      return false
    } finally {
      setOcupado(null)
    }
  }

  return {
    ocupado,
    orcamento: (o: OrcamentoDetalhe | string, modo: ModoImpressao) =>
      rodar(`orcamento:${typeof o === 'string' ? o : o.id}:${modo}`, modo, async (g, e) => g.pdfOrcamento(typeof o === 'string' ? await orcamentosApi.obter(o) : o, e)),
    pedido: (id: string, modo: ModoImpressao) =>
      rodar(`pedido:${id}:${modo}`, modo, async (g, e) => {
        // Os pagamentos recebidos (data e forma) vão junto; sem eles, o PDF sai só com as parcelas
        const [p, recebimentos] = await Promise.all([pedidosApi.obter(id), pedidosApi.recebimentos(id).catch(() => null)])
        return g.pdfPedido(p, e, recebimentos)
      }),
    /** Recibo dos pagamentos escolhidos do pedido */
    recibo: (pedidoId: string, recebimentos: RecebimentosPedido, modo: ModoImpressao) =>
      rodar(`recibo:${pedidoId}:${modo}`, modo, async (g, e) => g.pdfRecibo(await pedidosApi.obter(pedidoId), recebimentos, e)),
    /** Etiquetas de entrega de um ou vários pedidos (diálogo "Imprimir etiquetas") */
    etiquetas: (grupos: GrupoEtiquetas[], opcoes: OpcoesEtiquetas, modo: ModoImpressao) =>
      rodar(`etiquetas:${modo}`, modo, (g, e) => g.pdfEtiquetas(grupos, e, opcoes)),
  }
}
