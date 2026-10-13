import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { nomeCliente, type ProdutoVitrineResumo } from '@onprint/shared'
import { empresaApi } from '@/api/configuracoes'
import { CHAVE_VITRINE_PRODUTOS, vitrineApi } from '@/api/vitrine'
import { CHAVE_EMPRESA } from '@/features/configuracoes/hooks'
import { EnviarWhatsappDialog, type EnvioWhatsapp } from '@/features/whatsapp/components/EnviarWhatsappDialog'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermission'
import { mensagemCatalogo } from './divulgar'
import { useVitrineConfig } from './hooks'

/** Categorias com mais produtos publicados (os destaques da mensagem) */
export function categoriasEmDestaque(produtos: Pick<ProdutoVitrineResumo, 'publicado' | 'categoria'>[], max = 3): string[] {
  const contagem = new Map<string, number>()
  for (const p of produtos) if (p.publicado && p.categoria) contagem.set(p.categoria.nome, (contagem.get(p.categoria.nome) ?? 0) + 1)
  return [...contagem.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
    .slice(0, max)
    .map(([nome]) => nome)
}

/**
 * "Enviar catálogo" (painel e ficha do cliente, painel da solicitação): o diálogo "Enviar pelo WhatsApp" com a
 * mensagem da vitrine (categorias em destaque, link no fim) e, se quiser, o catálogo em PDF anexado.
 * Só aparece com o módulo `vitrine` e o site no ar. Quem usa renderiza `dialogo`.
 */
export function useEnviarCatalogo() {
  const pode = usePermissoes()
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const permitido = pode('vitrine')
  const config = useVitrineConfig(permitido)
  const [envio, setEnvio] = useState<EnvioWhatsapp | null>(null)
  const c = config.data
  const disponivel = Boolean(permitido && c?.ativa && c.liberadaNoPlano)

  async function enviar(cliente: { id?: string; nome: string; fantasia?: string | null; cpfCnpj?: string | null; whatsapp?: string | null; telefone?: string | null }) {
    if (!c) return
    const q = { publicado: 'true' } as const
    let produtos: ProdutoVitrineResumo[] = []
    try {
      produtos = await queryClient.fetchQuery({ queryKey: [CHAVE_VITRINE_PRODUTOS, q], queryFn: () => vitrineApi.produtos(q), staleTime: 60_000 })
    } catch {
      // Sem a lista, a mensagem sai sem os destaques e sem o PDF
    }
    const loja = (c.titulo || usuario?.empresa.exibicao || '').trim()
    const nome = nomeCliente(cliente)
    const categorias = categoriasEmDestaque(produtos)
    const publicados = produtos.filter((p) => p.publicado)
    setEnvio({
      titulo: 'Enviar catálogo',
      tipo: 'catalogo',
      destinatario: { nome, numero: cliente.whatsapp || cliente.telefone, clienteId: cliente.id ?? null },
      mensagem: (comPdf) => mensagemCatalogo({ nome, documento: cliente.cpfCnpj, loja, link: c.urlPublica, categorias, comPdf }),
      pdf: publicados.length
        ? {
            rotulo: `Catálogo em PDF (${publicados.length} produtos)`,
            marcado: false,
            gerar: async () => {
              const [g, empresa] = await Promise.all([import('./catalogo/gerarCatalogo'), queryClient.fetchQuery({ queryKey: CHAVE_EMPRESA, queryFn: empresaApi.obter, staleTime: 5 * 60 * 1000 })])
              return g.pdfCatalogo(publicados, c, empresa)
            },
          }
        : undefined,
    })
  }

  return {
    disponivel,
    enviar: (cliente: Parameters<typeof enviar>[0]) => void enviar(cliente).catch((e: Error) => toast.error(e.message)),
    dialogo: <EnviarWhatsappDialog envio={envio} onFechar={() => setEnvio(null)} />,
  }
}
