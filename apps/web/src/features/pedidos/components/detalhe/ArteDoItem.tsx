import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronDown, Download, ExternalLink, FileImage, MessageSquare, Send } from 'lucide-react'
import { toast } from 'sonner'
import {
  EXTENSOES_PERMITIDAS,
  VIAS_APROVACAO_ARTE,
  VIA_APROVACAO_ARTE_ROTULOS,
  formatarDataHora,
  type ArteVersao,
  type PedidoDetalhe,
  type PedidoItemDetalhe,
  type StatusArte,
  type ViaAprovacaoArte,
} from '@onprint/shared'
import { arquivosApi } from '@/api/cadastros'
import { artesApi } from '@/api/producao'
import { Can } from '@/components/shared/Can'
import { FileUploader } from '@/components/shared/FileUploader'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Textarea } from '@/components/ui/form-controls'
import { usePermissoes } from '@/hooks/usePermission'
import { linkAcompanhamento } from '@/lib/empresaAtual'
import { cn } from '@/lib/utils'

const ENCERRADO = ['cancelado', 'entregue']
/** Arte que pode ir (ou voltar) para o cliente: com arquivo, ainda não aprovada */
const PODE_IR_AO_CLIENTE: StatusArte[] = ['em_criacao', 'ajuste_solicitado', 'enviada_cliente']

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

/**
 * "Marcar como aprovada" (o caminho normal: a aprovação fica com a equipe): escolhe como o cliente aprovou
 * (WhatsApp, pessoalmente...) ou aprovação interna. Fica a nota na conversa da arte, com quem registrou.
 */
export function MarcarAprovada({ rotulo = 'Marcar como aprovada', onEscolher, size = 'sm' }: { rotulo?: string; onEscolher: (via: ViaAprovacaoArte) => void; size?: 'sm' | 'default' }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size}>
          <CheckCircle2 /> {rotulo} <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        {VIAS_APROVACAO_ARTE.map((via) => (
          <DropdownMenuItem key={via} onSelect={() => onEscolher(via)}>
            {VIA_APROVACAO_ARTE_ROTULOS[via]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** Arte de um item: versão atual (miniatura, status, aprovação, envio e comentários) e versões anteriores. */
export function ArteDoItem({ pedido, item, onEnviar }: { pedido: PedidoDetalhe; item: PedidoItemDetalhe; onEnviar: (arteId: string) => void }) {
  const queryClient = useQueryClient()
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
      <CardContent className="grid gap-5 md:grid-cols-[13.75rem_1fr]">
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
              {atual.status !== 'aprovada' && atual.arquivo && !encerrado && (
                <Can modulo="artes" acao="aprovar">
                  <MarcarAprovada
                    onEscolher={(via) => void executar(() => artesApi.aprovar(atual.id, via), `Arte v${atual.versao} aprovada. ${VIA_APROVACAO_ARTE_ROTULOS[via]}.`)}
                  />
                </Can>
              )}
              {PODE_IR_AO_CLIENTE.includes(atual.status) && atual.arquivo && !encerrado && (
                <Can modulo="artes" acao="editar">
                  <Button size="sm" variant="outline" onClick={() => onEnviar(atual.id)}>
                    <Send /> {atual.status === 'enviada_cliente' ? 'Reenviar para o cliente' : 'Enviar para o cliente'}
                  </Button>
                </Can>
              )}
              {atual.status === 'enviada_cliente' && !encerrado && (
                <Button size="sm" variant="ghost" asChild>
                  <a href={`${linkAcompanhamento(pedido.tokenPublico)}#artes`} target="_blank" rel="noreferrer">
                    <ExternalLink /> Página do cliente
                  </a>
                </Button>
              )}
              {atual.designer && <span className="self-center text-xs text-texto-secundario">Designer: {atual.designer.nome}</span>}
              {atual.status === 'enviada_cliente' && !encerrado && (
                <p className="w-full text-xs text-texto-secundario">Com o cliente. Quando ele responder APROVADO no WhatsApp, é só marcar como aprovada.</p>
              )}
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
    </Card>
  )
}
