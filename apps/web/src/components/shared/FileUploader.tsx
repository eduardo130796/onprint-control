import { useEffect, useRef, useState } from 'react'
import { FileUp, Loader2, UploadCloud } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

interface FileUploaderProps {
  /** Extensões aceitas, sem ponto (ex.: ['png', 'jpg']) */
  extensoes: readonly string[]
  tamanhoMaxMb?: number
  /** Faz o envio e informa o progresso (0–100) */
  onEnviar: (arquivo: File, aoProgredir: (pct: number) => void) => Promise<unknown>
  desabilitado?: boolean
  texto?: string
}

/** Área de arrastar e soltar com validação, pré-visualização de imagens e barra de progresso. */
export function FileUploader({ extensoes, tamanhoMaxMb = 200, onEnviar, desabilitado, texto }: FileUploaderProps) {
  const input = useRef<HTMLInputElement>(null)
  const [arrastando, setArrastando] = useState(false)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [progresso, setProgresso] = useState<number | null>(null)
  const [preview, setPreview] = useState<string | null>(null)

  useEffect(() => {
    if (!arquivo || !arquivo.type.startsWith('image/')) return setPreview(null)
    const url = URL.createObjectURL(arquivo)
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [arquivo])

  async function selecionar(novo: File | undefined) {
    if (!novo) return
    const ext = novo.name.split('.').pop()?.toLowerCase() ?? ''
    if (!extensoes.includes(ext)) return toast.error(`Tipo não permitido. Aceitos: ${extensoes.join(', ').toUpperCase()}.`)
    if (novo.size > tamanhoMaxMb * 1024 * 1024) return toast.error(`Arquivo maior que ${tamanhoMaxMb} MB.`)
    setArquivo(novo)
    setProgresso(0)
    try {
      await onEnviar(novo, setProgresso)
      toast.success('Arquivo enviado.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setArquivo(null)
      setProgresso(null)
      if (input.current) input.current.value = ''
    }
  }

  const enviando = progresso !== null

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!desabilitado && !enviando) setArrastando(true)
      }}
      onDragLeave={() => setArrastando(false)}
      onDrop={(e) => {
        e.preventDefault()
        setArrastando(false)
        if (!desabilitado && !enviando) void selecionar(e.dataTransfer.files[0])
      }}
      className={cn(
        'rounded-2xl border-2 border-dashed border-border p-6 text-center transition-colors',
        arrastando && 'border-marca bg-accent',
        desabilitado && 'opacity-50',
      )}
    >
      <input
        ref={input}
        type="file"
        className="hidden"
        accept={extensoes.map((e) => `.${e}`).join(',')}
        onChange={(e) => void selecionar(e.target.files?.[0])}
        disabled={desabilitado || enviando}
      />
      {enviando && arquivo ? (
        <div className="mx-auto flex max-w-sm items-center gap-3 text-left">
          {preview ? (
            <img src={preview} alt="" className="h-12 w-12 rounded-lg object-cover" />
          ) : (
            <FileUp className="h-10 w-10 shrink-0 text-marca-escuro" />
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{arquivo.name}</p>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-fundo">
              <div className="h-full rounded-full bg-marca transition-all" style={{ width: `${progresso}%` }} />
            </div>
            <p className="mt-1 text-xs text-texto-secundario">{progresso}%</p>
          </div>
          <Loader2 className="h-5 w-5 animate-spin text-marca-escuro" />
        </div>
      ) : (
        <>
          <UploadCloud className="mx-auto h-8 w-8 text-texto-secundario" />
          <p className="mt-2 text-sm">{texto ?? 'Arraste um arquivo para cá ou'}</p>
          <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => input.current?.click()} disabled={desabilitado}>
            Escolher arquivo
          </Button>
          <p className="mt-2 text-xs text-texto-secundario">
            {extensoes.join(', ').toUpperCase()} · até {tamanhoMaxMb} MB
          </p>
        </>
      )}
    </div>
  )
}
