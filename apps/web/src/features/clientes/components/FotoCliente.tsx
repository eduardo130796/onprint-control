import { useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { ImagePlus, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { EXTENSOES_FOTO_CLIENTE, TAMANHO_MAX_FOTO_CLIENTE_MB, type Cliente, type ClienteDetalhe } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { AvatarCliente } from '@/components/shared/AvatarCliente'
import { Button } from '@/components/ui/button'
import { chavesClientes } from '../hooks'

/**
 * Foto ou logo do cliente (aparece na lista e no painel). Troca só a foto no cache da ficha, sem mexer
 * no "atualizado em": o formulário de dados não é recarregado e nada do que está sendo digitado se perde.
 */
export function FotoCliente({ cliente, podeEditar }: { cliente: ClienteDetalhe; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const input = useRef<HTMLInputElement>(null)
  const [progresso, setProgresso] = useState<number | null>(null)
  const [removendo, setRemovendo] = useState(false)

  function aplicar(salvo: Cliente) {
    queryClient.setQueryData<ClienteDetalhe>(chavesClientes.detalhe(cliente.id), (atual) =>
      atual ? { ...atual, fotoArquivoId: salvo.fotoArquivoId, fotoUrl: salvo.fotoUrl } : atual,
    )
    void queryClient.invalidateQueries({ queryKey: ['clientes', 'lista'] })
  }

  async function enviar(arquivo: File | undefined) {
    if (!arquivo) return
    const ext = arquivo.name.split('.').pop()?.toLowerCase() ?? ''
    if (!(EXTENSOES_FOTO_CLIENTE as readonly string[]).includes(ext)) return toast.error('Envie uma imagem PNG ou JPG.')
    if (arquivo.size > TAMANHO_MAX_FOTO_CLIENTE_MB * 1024 * 1024) return toast.error(`Imagem maior que ${TAMANHO_MAX_FOTO_CLIENTE_MB} MB.`)
    setProgresso(0)
    try {
      aplicar(await clientesApi.enviarFoto(cliente.id, arquivo, setProgresso))
      toast.success('Foto do cliente atualizada.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setProgresso(null)
      if (input.current) input.current.value = ''
    }
  }

  async function remover() {
    setRemovendo(true)
    try {
      aplicar(await clientesApi.removerFoto(cliente.id))
      toast.success('Foto removida.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setRemovendo(false)
    }
  }

  const enviando = progresso !== null
  return (
    <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-card p-4">
      <AvatarCliente cliente={cliente} tamanho="lg" />
      <div className="min-w-0 flex-1 basis-48">
        <p className="font-medium text-tinta">Foto ou logo do cliente</p>
        <p className="text-sm text-texto-secundario">Aparece na lista de clientes e no painel. PNG ou JPG, até {TAMANHO_MAX_FOTO_CLIENTE_MB} MB.</p>
      </div>
      {podeEditar && (
        <div className="flex gap-2">
          <input
            ref={input}
            type="file"
            accept={EXTENSOES_FOTO_CLIENTE.map((e) => `.${e}`).join(',')}
            className="hidden"
            onChange={(e) => void enviar(e.target.files?.[0])}
          />
          <Button type="button" variant="outline" size="sm" disabled={enviando || removendo} onClick={() => input.current?.click()}>
            {enviando ? <Loader2 className="animate-spin" /> : <ImagePlus />}
            {enviando ? `Enviando ${progresso}%` : cliente.fotoArquivoId ? 'Trocar' : 'Enviar foto'}
          </Button>
          {cliente.fotoArquivoId && (
            <Button type="button" variant="ghost" size="sm" disabled={enviando || removendo} onClick={() => void remover()} aria-label="Remover foto">
              {removendo ? <Loader2 className="animate-spin" /> : <Trash2 />}
              Remover
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
