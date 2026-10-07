import { Loader2 } from 'lucide-react'

export function TelaCarregando({ mensagem = 'Carregando…' }: { mensagem?: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center gap-2 text-texto-secundario" role="status">
      <Loader2 className="h-5 w-5 animate-spin text-marca-escuro" />
      <span className="text-sm">{mensagem}</span>
    </div>
  )
}
