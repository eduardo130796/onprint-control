import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, FileText, Paperclip, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EXTENSOES_PERMITIDAS, formatarDataHora, type Arquivo, type Modulo } from '@onprint/shared'
import { arquivosApi, type EntidadeAnexo } from '@/api/cadastros'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/usePermission'
import { ConfirmDialog } from './ConfirmDialog'
import { EmptyState } from './EmptyState'
import { EstadoErro } from './EstadoErro'
import { FileUploader } from './FileUploader'

function tamanhoLegivel(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / 1024 / 1024).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} MB`
}

interface AnexosProps {
  entidade: EntidadeAnexo
  entidadeId: string
  modulo: Modulo
}

/** Aba "Anexos": envio, download (URL temporária) e remoção de arquivos de um registro. */
export function Anexos({ entidade, entidadeId, modulo }: AnexosProps) {
  const queryClient = useQueryClient()
  const podeEditar = usePermission(modulo, 'editar')
  const chave = ['arquivos', entidade, entidadeId]
  const lista = useQuery({ queryKey: chave, queryFn: () => arquivosApi.listar(entidade, entidadeId) })
  const [removendo, setRemovendo] = useState<Arquivo | null>(null)
  const remover = useMutation({
    mutationFn: (id: string) => arquivosApi.remover(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: chave }),
  })

  async function abrir(arquivo: Arquivo) {
    try {
      const { url } = await arquivosApi.urlTemporaria(arquivo.id)
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      {podeEditar && (
        <FileUploader
          extensoes={EXTENSOES_PERMITIDAS}
          onEnviar={async (arquivo, progresso) => {
            await arquivosApi.enviar(entidade, entidadeId, arquivo, progresso)
            await queryClient.invalidateQueries({ queryKey: chave })
          }}
        />
      )}

      {lista.isPending ? (
        <Skeleton className="h-16 w-full" />
      ) : lista.isError ? (
        <EstadoErro erro={lista.error} onTentarNovamente={() => void lista.refetch()} />
      ) : lista.data.length === 0 ? (
        <EmptyState icone={Paperclip} titulo="Nenhum anexo" descricao="Arquivos enviados aparecem aqui." />
      ) : (
        <ul className="divide-y divide-border rounded-2xl border border-border">
          {lista.data.map((a) => (
            <li key={a.id} className="flex items-center gap-3 p-3">
              <FileText className="h-8 w-8 shrink-0 text-grafite" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{a.nomeOriginal}</p>
                <p className="text-xs text-texto-secundario">
                  {tamanhoLegivel(a.tamanho)} · {formatarDataHora(a.createdAt)}
                  {a.enviadoPor && ` · ${a.enviadoPor.nome}`}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => void abrir(a)} aria-label={`Abrir ${a.nomeOriginal}`}>
                <Download />
              </Button>
              {podeEditar && (
                <Button variant="ghost" size="icon" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setRemovendo(a)} aria-label={`Remover ${a.nomeOriginal}`}>
                  <Trash2 />
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}

      <ConfirmDialog
        aberto={Boolean(removendo)}
        onAbertoChange={(v) => !v && setRemovendo(null)}
        titulo="Remover anexo"
        descricao={<>O arquivo <strong>{removendo?.nomeOriginal}</strong> será apagado definitivamente.</>}
        textoConfirmar="Remover"
        perigoso
        onConfirmar={() => remover.mutateAsync(removendo!.id)}
      />
    </div>
  )
}
