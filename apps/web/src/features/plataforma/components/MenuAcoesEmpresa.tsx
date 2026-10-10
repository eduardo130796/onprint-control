import { Link } from 'react-router-dom'
import { CalendarPlus, Crown, ExternalLink, Gift, Lock, MoreHorizontal, TicketPercent, Unlock } from 'lucide-react'
import { adicionarDias, formatarDataSimples, hojeISO, type EmpresaPlataformaResumo } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { useExecutarAcao, type PedidoAcao, type TipoAcao } from './acoes'

/** Ações rápidas de uma linha da tabela de assinaturas (as que pedem dados abrem o diálogo). */
export function MenuAcoesEmpresa({ empresa: e, onPedir }: { empresa: EmpresaPlataformaResumo; onPedir: (p: PedidoAcao) => void }) {
  const executar = useExecutarAcao()
  const pedir = (tipo: TipoAcao) => onPedir({ tipo, empresa: { id: e.id, nome: e.nome, planoCodigo: e.planoCodigo } })
  const semAssinatura = !e.situacao
  const cancelada = e.situacao === 'cancelada'
  const daqui7 = adicionarDias(hojeISO(), 7)

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Ações de ${e.nome}`}>
          <MoreHorizontal />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-60">
        <DropdownMenuLabel className="truncate text-xs font-semibold uppercase tracking-wide text-texto-secundario">{e.nome}</DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link to={`/plataforma/empresas/${e.id}`}>
            <ExternalLink /> Abrir ficha
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={semAssinatura || cancelada} onSelect={() => void executar(e.id, { acao: 'liberar_ate', data: daqui7 })}>
          <CalendarPlus /> Liberar 7 dias <span className="ml-auto text-[0.6875rem] text-texto-secundario">até {formatarDataSimples(daqui7).slice(0, 5)}</span>
        </DropdownMenuItem>
        <DropdownMenuItem disabled={semAssinatura || cancelada || e.situacao === 'cortesia'} onSelect={() => pedir('meses_gratis')}>
          <Gift /> Dar mês grátis
        </DropdownMenuItem>
        {e.situacao === 'cortesia' ? (
          <DropdownMenuItem onSelect={() => pedir('encerrar_cortesia')}>
            <Crown /> Encerrar cortesia
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={semAssinatura || cancelada} onSelect={() => pedir('cortesia')}>
            <Crown /> Dar cortesia
          </DropdownMenuItem>
        )}
        <DropdownMenuItem disabled={semAssinatura || cancelada || e.situacao === 'cortesia'} onSelect={() => pedir('aplicar_cupom')}>
          <TicketPercent /> Aplicar cupom
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {e.bloqueioManual ? (
          <DropdownMenuItem disabled={semAssinatura} onSelect={() => pedir('desbloquear')}>
            <Unlock /> Desbloquear
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem disabled={semAssinatura || cancelada} className="text-coral-escuro focus:text-coral-escuro" onSelect={() => pedir('bloquear')}>
            <Lock /> Bloquear
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
