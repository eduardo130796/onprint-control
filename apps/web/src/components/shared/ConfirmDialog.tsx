import { useState, type ReactNode } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

interface ConfirmDialogProps {
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
  titulo: string
  descricao: ReactNode
  textoConfirmar?: string
  perigoso?: boolean
  onConfirmar: () => Promise<unknown>
}

/** Confirmação de ações sensíveis; mostra o erro da API se a ação falhar. */
export function ConfirmDialog({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  textoConfirmar = 'Confirmar',
  perigoso,
  onConfirmar,
}: ConfirmDialogProps) {
  const [executando, setExecutando] = useState(false)

  async function confirmar() {
    setExecutando(true)
    try {
      await onConfirmar()
      onAbertoChange(false)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setExecutando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !executando && onAbertoChange(v)}>
      <DialogContent>
        <DialogTitle>{titulo}</DialogTitle>
        <DialogDescription asChild>
          <div>{descricao}</div>
        </DialogDescription>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onAbertoChange(false)} disabled={executando}>
            Cancelar
          </Button>
          <Button variant={perigoso ? 'destructive' : 'default'} onClick={() => void confirmar()} disabled={executando}>
            {executando && <Loader2 className="animate-spin" />}
            {textoConfirmar}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
