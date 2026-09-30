import type { FormEventHandler, ReactNode } from 'react'
import { Loader2, Save } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'

interface FormDialogProps {
  aberto: boolean
  onAbertoChange: (aberto: boolean) => void
  titulo: string
  descricao?: string
  salvando: boolean
  onSubmit: FormEventHandler<HTMLFormElement>
  children: ReactNode
  textoSalvar?: string
  largo?: boolean
}

/** Diálogo com formulário, rolagem interna e botões Cancelar/Salvar fixos no rodapé. */
export function FormDialog({
  aberto,
  onAbertoChange,
  titulo,
  descricao,
  salvando,
  onSubmit,
  children,
  textoSalvar = 'Salvar',
  largo,
}: FormDialogProps) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !salvando && onAbertoChange(v)}>
      <DialogContent className={cn('top-[5%] max-h-[90vh] gap-0 p-0', largo ? 'max-w-2xl' : 'max-w-lg')}>
        <form onSubmit={onSubmit} noValidate className="flex max-h-[90vh] flex-col">
          <div className="border-b border-border px-6 py-4">
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription className={descricao ? 'mt-1' : 'sr-only'}>{descricao ?? titulo}</DialogDescription>
          </div>
          <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">{children}</div>
          <div className="flex justify-end gap-2 border-t border-border px-6 py-4">
            <Button type="button" variant="outline" onClick={() => onAbertoChange(false)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />}
              {textoSalvar}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
