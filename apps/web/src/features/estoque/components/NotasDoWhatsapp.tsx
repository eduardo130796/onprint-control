import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Loader2, MessageCircle } from 'lucide-react'
import { toast } from 'sonner'
import { formatarDataHora, formatarMoeda } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { Button } from '@/components/ui/button'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermission } from '@/hooks/usePermission'

/**
 * Faixa "Notas lidas pelo WhatsApp esperando conferência" (tela de Entradas): a foto, o PDF ou o XML que o dono mandou
 * na conversa "Você". "Conferir" abre a Nova entrada preenchida; registrada ou descartada, a nota sai daqui.
 */
export function NotasDoWhatsapp() {
  const pode = usePermission('estoque', 'criar')
  const consulta = useQuery({ queryKey: ['estoque', 'notas-whatsapp'], queryFn: assistenteApi.notasWhatsapp, enabled: pode, refetchInterval: 2 * 60 * 1000 })
  const descartar = useMutacao(['estoque'], (id: string) => assistenteApi.descartarNotaWhatsapp(id))
  const notas = consulta.data ?? []
  if (!pode || !notas.length) return null

  return (
    <section className="mb-4 rounded-2xl border border-marca/20 bg-marca-suave/60 p-3 sm:p-4" aria-label="Notas lidas pelo WhatsApp">
      <p className="mb-2 flex items-center gap-2 text-sm font-medium text-marca-escuro">
        <MessageCircle className="h-4 w-4 shrink-0" /> Notas lidas pelo WhatsApp esperando conferência
      </p>
      <ul className="space-y-2">
        {notas.map((n) => (
          <li key={n.id} className="flex flex-col gap-2 rounded-xl bg-card p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="truncate font-medium text-tinta">
                {n.numero ? `Nota ${n.numero}` : 'Nota'} · {n.fornecedor}
              </p>
              <p className="text-xs text-texto-secundario">
                {n.itens} {n.itens === 1 ? 'item' : 'itens'} · {formatarMoeda(n.total)} · recebida {formatarDataHora(n.recebidaEm)}
              </p>
              {n.jaLancada && (
                <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-800">
                  <AlertTriangle className="h-3 w-3 shrink-0" /> Parece já lançada na entrada {n.jaLancada.numero}
                </p>
              )}
            </div>
            <div className="flex shrink-0 gap-2">
              <Button asChild size="sm">
                <Link to={`/estoque/entradas/novo?notaWhatsapp=${n.id}`}>Conferir</Link>
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={descartar.isPending}
                onClick={() => descartar.mutate(n.id, { onSuccess: () => toast.success('Nota descartada.'), onError: (e) => toast.error(e.message) })}
              >
                {descartar.isPending && descartar.variables === n.id ? <Loader2 className="animate-spin" /> : null} Descartar
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
