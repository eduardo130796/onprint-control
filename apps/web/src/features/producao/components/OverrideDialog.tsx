import { useState } from 'react'
import { Loader2, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import type { OrdemProducao } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/form-controls'

interface OverrideDialogProps {
  op: OrdemProducao | null
  onConfirmar: (motivo: string) => Promise<void>
  onCancelar: () => void
}

/** Liberação da OP sem arte aprovada (gerente). O motivo fica na auditoria e na linha do tempo do pedido. */
export function OverrideDialog({ op, onConfirmar, onCancelar }: OverrideDialogProps) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const valido = motivo.trim().length >= 5

  async function confirmar() {
    setEnviando(true)
    try {
      await onConfirmar(motivo.trim())
      setMotivo('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEnviando(false)
    }
  }

  return (
    <Dialog open={Boolean(op)} onOpenChange={(v) => !v && !enviando && onCancelar()}>
      <DialogContent>
        <DialogTitle className="flex items-center gap-2">
          <ShieldAlert className="h-5 w-5 text-ambar" /> Arte ainda não aprovada
        </DialogTitle>
        <DialogDescription>
          A {op?.numero} ({op?.item.descricao}) não tem arte aprovada pelo cliente. Você pode liberar a impressão mesmo assim — a
          liberação fica registrada com seu nome e o motivo.
        </DialogDescription>
        <CampoFormulario id="motivo-override" rotulo="Motivo da liberação" erro={motivo && !valido ? 'Explique em poucas palavras.' : undefined}>
          <Textarea id="motivo-override" value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: cliente aprovou por telefone" />
        </CampoFormulario>
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onCancelar} disabled={enviando}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={() => void confirmar()} disabled={!valido || enviando}>
            {enviando && <Loader2 className="animate-spin" />} Liberar sem arte
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
