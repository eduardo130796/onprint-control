import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Copy, Download, ExternalLink, FileImage, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import { EXTENSOES_PERMITIDAS, formatarDataHora, type ArteVersao, type PedidoDetalhe, type PedidoItemDetalhe } from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'
import { artesApi } from '@/api/producao'
import { Can } from '@/components/shared/Can'
import { FileUploader } from '@/components/shared/FileUploader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { messagingProvider } from '@/integrations/messaging'
import { usePermissoes } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { useTemplates } from '../../hooks'
import { linkArte, mensagemDaArte } from '../../mensagens'
import { AprovarArteDialog } from './AprovarArteDialog'

const ENCERRADO = ['cancelado', 'entregue']

function Comentarios({ arte, podeComentar }: { arte: ArteVersao; podeComentar: boolean }) {
  const queryClient = useQueryClient()
  const [texto, setTexto] = useState('')
  const [enviando, setEnviando] = useState(false)

  async function comentar() {
    setEnviando(true)
    try {
      await artesApi.comentar(arte.id, texto.trim())
      setTexto('')
      await queryClient.invalidateQueries({ queryKey: ['pedidos'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="space-y-2">
      {arte.comentarios.map((c) => (
        <div key={c.id} className={cn('rounded-lg p-2.5 text-sm', c.origem === 'cliente' ? 'bg-ambar/10' : 'bg-fundo')}>
          <p className="text-xs text-texto-secundario">
            <strong className="text-texto">{c.autorNome}</strong> {c.origem === 'cliente' ? '(cliente)' : ''} · {formatarDataHora(c.createdAt)}
          </p>
          <p className="whitespace-pre-line">{c.texto}</p>
        </div>
      ))}
      {podeComentar && (
        <div className="flex items-end gap-2">
          <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Comentário interno…" aria-label="Comentário" />
          <Button size="icon" variant="outline" disabled={texto.trim().length < 2 || enviando} onClick={() => void comentar()} aria-label="Enviar comentário">
            <MessageSquare />
          </Button>
        </div>
      )}
    </div>
  )
}

/** Arte de um item: versão atual (miniatura, status, envio, link e comentários) e versões anteriores. */
export function ArteDoItem({ pedido, item }: { pedido: PedidoDetalhe; item: PedidoItemDetalhe }) {
  const queryClient = useQueryClient()
  const templates = useTemplates()
  const [aprovando, setAprovando] = useState<ArteVersao | null>(null)
  const pode = usePermissoes()
  const podeComentar = pode('artes', 'visualizar') || pode('pedidos', 'editar')
  const [atual, ...anteriores] = item.artes
  const encerrado = ENCERRADO.includes(pedido.status)
  const atualizar = () => queryClient.invalidateQueries({ queryKey: ['pedidos'] })

  async function executar(acao: () => Promise<unknown>, sucesso: string) {
    try {
      await acao()
      toast.success(sucesso)
      await atualizar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function baixar(id: string) {
    try {
      const { url } = await arquivosApi.urlTemporaria(id)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function copiarMensagem(arte: ArteVersao) {
    try {
      await messagingProvider.enviar({ destinatario: pedido.cliente.whatsapp ?? undefined, texto: mensagemDaArte(pedido, arte.tokenPublico, templates.data) })
      toast.success('Mensagem copiada. Cole no WhatsApp do cliente.')
    } catch {
      toast.error('Não foi possível copiar. Copie o link manualmente.')
    }
  }

  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2 space-y-0 pb-3">
        <CardTitle className="text-base">{item.descricao}</CardTitle>
        {atual && (
          <span className="flex items-center gap-2 text-sm text-texto-secundario">
            v{atual.versao} <StatusBadge entidade="arte" codigo={atual.status} />
          </span>
        )}
      </CardHeader>
      <CardContent className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="space-y-2">
          <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-fundo">
            {atual?.miniaturaUrl ? (
              <img src={atual.miniaturaUrl} alt={`Arte v${atual.versao}`} className="h-full w-full object-contain" />
            ) : (
              <FileImage className="h-10 w-10 text-texto-secundario" />
            )}
          </div>
          {atual?.arquivo && (
            <Button variant="outline" size="sm" className="w-full" onClick={() => void baixar(atual.arquivo!.id)}>
              <Download /> <span className="truncate">{atual.arquivo.nomeOriginal}</span>
            </Button>
          )}
        </div>

        <div className="space-y-4">
          {atual && (
            <div className="flex flex-wrap gap-2">
              {['em_criacao', 'ajuste_solicitado'].includes(atual.status) && atual.arquivo && !encerrado && (
                <Can modulo="artes" acao="editar">
                  <Button size="sm" onClick={() => void executar(() => artesApi.enviarAoCliente(atual.id), 'Arte marcada como enviada ao cliente.')}>
                    <Send /> Enviar ao cliente
                  </Button>
                </Can>
              )}
              {atual.status === 'enviada_cliente' && (
                <>
                  <Button size="sm" onClick={() => void copiarMensagem(atual)}>
                    <Copy /> Copiar mensagem com link
                  </Button>
                  <Button size="sm" variant="outline" asChild>
                    <a href={linkArte(atual.tokenPublico)} target="_blank" rel="noreferrer">
                      <ExternalLink /> Abrir link
                    </a>
                  </Button>
                </>
              )}
              {atual.status !== 'aprovada' && atual.arquivo && !encerrado && (
                <Can modulo="artes" acao="aprovar">
                  <Button size="sm" variant="outline" onClick={() => setAprovando(atual)}>
                    <CheckCircle2 /> Registrar aprovação
                  </Button>
                </Can>
              )}
              {atual.designer && <span className="self-center text-xs text-texto-secundario">Designer: {atual.designer.nome}</span>}
            </div>
          )}

          {!encerrado && (
            <Can modulo="artes" acao="editar">
              <FileUploader
                extensoes={EXTENSOES_PERMITIDAS}
                texto={atual?.arquivo ? `Enviar nova versão (v${atual.versao + 1})` : 'Enviar o arquivo da arte'}
                onEnviar={async (arquivo, progresso) => {
                  await artesApi.enviarArquivo(item.id, arquivo, progresso)
                  await atualizar()
                }}
              />
            </Can>
          )}

          {atual && <Comentarios arte={atual} podeComentar={!encerrado && podeComentar} />}

          {anteriores.length > 0 && (
            <details className="rounded-lg border border-border p-3 text-sm">
              <summary className="cursor-pointer font-medium">Versões anteriores ({anteriores.length})</summary>
              <ul className="mt-2 space-y-2">
                {anteriores.map((a) => (
                  <li key={a.id} className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">v{a.versao}</span>
                    <StatusBadge entidade="arte" codigo={a.status} />
                    <span className="text-xs text-texto-secundario">{formatarDataHora(a.createdAt)}</span>
                    {a.arquivo && (
                      <Button variant="link" size="sm" className="h-auto p-0" onClick={() => void baixar(a.arquivo!.id)}>
                        {a.arquivo.nomeOriginal}
                      </Button>
                    )}
                    {a.comentarios.length > 0 && <span className="w-full text-xs text-texto-secundario">“{a.comentarios[a.comentarios.length - 1]!.texto}”</span>}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </div>
      </CardContent>
      <AprovarArteDialog arte={aprovando} onFechar={() => setAprovando(null)} />
    </Card>
  )
}
