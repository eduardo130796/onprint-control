import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react'
import type { StatusCep as Status } from '@/hooks/useBuscaCep'
import { cn } from '@/lib/utils'

const MENSAGENS: Record<Exclude<Status, 'ocioso'>, string> = {
  buscando: 'Buscando endereço…',
  encontrado: 'Endereço preenchido pelo CEP',
  nao_encontrado: 'CEP não encontrado — preencha manualmente',
  indisponivel: 'Consulta indisponível — preencha manualmente',
}

/** Aviso curto embaixo do CEP (lido pelo leitor de tela sem roubar o foco). */
export function StatusCep({ status, id, encontrado }: { status: Status; id?: string; encontrado?: string }) {
  if (status === 'ocioso') return <p id={id} aria-live="polite" className="sr-only" />
  const Icone = status === 'buscando' ? Loader2 : status === 'encontrado' ? CheckCircle2 : AlertCircle
  return (
    <p
      id={id}
      aria-live="polite"
      className={cn(
        'flex items-center gap-1 text-xs',
        status === 'encontrado' ? 'text-marca-escuro' : status === 'buscando' ? 'text-texto-secundario' : 'text-amber-700',
      )}
    >
      <Icone className={cn('h-3.5 w-3.5 shrink-0', status === 'buscando' && 'animate-spin')} aria-hidden />
      {status === 'encontrado' && encontrado ? encontrado : MENSAGENS[status]}
    </p>
  )
}
