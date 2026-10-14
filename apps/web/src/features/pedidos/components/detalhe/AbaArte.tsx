import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCheck, Loader2, Palette, Send } from 'lucide-react'
import { toast } from 'sonner'
import { artesParaAprovarTodas, nomeCliente, type PedidoDetalhe, type StatusArte } from '@onprint/shared'
import { artesApi } from '@/api/producao'
import { Can } from '@/components/shared/Can'
import { EmptyState } from '@/components/shared/EmptyState'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { EnviarWhatsappDialog, type EnvioWhatsapp } from '@/features/whatsapp/components/EnviarWhatsappDialog'
import { useAuth } from '@/hooks/useAuth'
import { useTemplates } from '../../hooks'
import { mensagemDasArtes } from '../../mensagens'
import { ArteDoItem } from './ArteDoItem'

const ENCERRADO = ['cancelado', 'entregue']
/** Pode ir (ou voltar) para o cliente: com arquivo e ainda não aprovada */
const PODE_IR_AO_CLIENTE: StatusArte[] = ['em_criacao', 'ajuste_solicitado', 'enviada_cliente']

/**
 * Aba "Arte" do pedido. A aprovação normalmente fica com a equipe ("Marcar como aprovada" em cada arte, ou
 * "Cliente aprovou todas as artes" num clique). Mandar para o cliente é uma escolha: "Enviar para o cliente" abre
 * UMA mensagem para o pedido com as artes escolhidas (texto, arquivos logo depois e um link só).
 */
export function AbaArte({ pedido }: { pedido: PedidoDetalhe }) {
  const queryClient = useQueryClient()
  const templates = useTemplates()
  const { usuario } = useAuth()
  const [envio, setEnvio] = useState<EnvioWhatsapp | null>(null)
  const [aprovando, setAprovando] = useState(false)
  const encerrado = ENCERRADO.includes(pedido.status)

  const ultimas = pedido.itens.flatMap((item) => (item.artes[0] ? [{ item, arte: item.artes[0] }] : []))
  const prontas = ultimas.filter(({ arte }) => arte.arquivo && PODE_IR_AO_CLIENTE.includes(arte.status))
  const paraAprovarTodas = artesParaAprovarTodas(ultimas.map(({ arte }) => ({ ...arte, arquivoId: arte.arquivo?.id ?? null })))
  const aprovadas = ultimas.filter(({ arte }) => arte.status === 'aprovada').length

  /** Uma mensagem para o pedido: a arte clicada (ou todas) e as que já estão com o cliente vão juntas */
  function abrirEnvio(arteId?: string) {
    const nomeDe = (id: string) => prontas.find((p) => p.arte.id === id)
    setEnvio({
      titulo: 'Enviar as artes para o cliente',
      tipo: 'arte_aprovacao',
      destinatario: { nome: nomeCliente(pedido.cliente), numero: pedido.cliente.whatsapp || pedido.cliente.telefone, clienteId: pedido.clienteId },
      vinculo: { pedidoId: pedido.id },
      selecao: {
        rotulo: 'Artes desta mensagem',
        itens: prontas.map(({ item, arte }) => {
          const original = arte.arquivo!
          const abre = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'].includes(original.mime)
          return {
            id: arte.id,
            titulo: `${item.descricao} — v${arte.versao}`,
            detalhe: arte.status === 'enviada_cliente' ? 'Já está com o cliente' : arte.status === 'ajuste_solicitado' ? 'Nova versão depois do ajuste' : undefined,
            miniaturaUrl: arte.miniaturaUrl,
            // CDR/AI/PSD: vai a miniatura (o tamanho real a API confere)
            arquivo: abre
              ? { id: original.id, nome: original.nomeOriginal, mime: original.mime, tamanho: original.tamanho }
              : arte.miniaturaId
                ? { id: arte.miniaturaId, nome: `${item.descricao} v${arte.versao}.jpg`, mime: 'image/jpeg', tamanho: 0 }
                : null,
            marcado: !arteId || arte.id === arteId || arte.status === 'enviada_cliente',
          }
        }),
      },
      mensagem: (_pdf, selecionados) =>
        mensagemDasArtes(
          pedido,
          selecionados.flatMap((id) => {
            const p = nomeDe(id)
            return p ? [{ descricao: p.item.descricao, versao: p.arte.versao }] : []
          }),
          templates.data,
          usuario?.empresa.exibicao ?? '',
        ),
      // A mensagem já saiu (ou o WhatsApp abriu): as artes ficam "com o cliente", sem outro aviso automático
      onEnviado: (_via, selecionados) => {
        void artesApi
          .enviarVarias(pedido.id, selecionados, false)
          .then(() => queryClient.invalidateQueries({ queryKey: ['pedidos'] }))
          .catch((e: Error) => toast.error(e.message))
      },
    })
  }

  async function aprovarTodas() {
    setAprovando(true)
    try {
      const r = await artesApi.aprovarTodas(pedido.id, 'whatsapp')
      toast.success(r.aprovadas === 1 ? 'Arte aprovada.' : `${r.aprovadas} artes aprovadas.`)
      await queryClient.invalidateQueries({ queryKey: ['pedidos'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAprovando(false)
    }
  }

  return (
    <div className="space-y-4">
      {ultimas.length > 0 && (
        <Card>
          <CardContent className="flex flex-col gap-3 pt-6 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium text-tinta">
                {aprovadas} de {pedido.itens.length} {pedido.itens.length === 1 ? 'arte aprovada' : 'artes aprovadas'}
              </p>
              <p className="text-sm text-texto-secundario">Aprove aqui mesmo. Envie ao cliente só quando ele precisar ver antes.</p>
            </div>
            {!encerrado && (
              <div className="flex flex-wrap gap-2">
                {paraAprovarTodas.length > 0 && (
                  <Can modulo="artes" acao="aprovar">
                    <Button onClick={() => void aprovarTodas()} disabled={aprovando} title="Aprova as artes com arquivo que estão em criação ou com o cliente">
                      {aprovando ? <Loader2 className="animate-spin" /> : <CheckCheck />} Cliente aprovou todas as artes
                    </Button>
                  </Can>
                )}
                {prontas.length > 0 && (
                  <Can modulo="artes" acao="editar">
                    <Button variant="outline" onClick={() => abrirEnvio()}>
                      <Send /> Enviar para o cliente
                    </Button>
                  </Can>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}
      {pedido.itens.length === 0 ? (
        <Card>
          <EmptyState icone={Palette} titulo="Sem itens" />
        </Card>
      ) : (
        pedido.itens.map((item) => <ArteDoItem key={item.id} pedido={pedido} item={item} onEnviar={abrirEnvio} />)
      )}
      <EnviarWhatsappDialog envio={envio} onFechar={() => setEnvio(null)} />
    </div>
  )
}
