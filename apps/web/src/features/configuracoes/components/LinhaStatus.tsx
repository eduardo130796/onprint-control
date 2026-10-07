import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Eye, EyeOff, Loader2, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type { StatusConfig } from '@onprint/shared'
import { statusApi } from '@/api/configuracoes'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CHAVE_STATUS } from '@/hooks/useStatusConfig'
import { fundoSuave, textoLegivel } from '@/lib/contraste'
import { cn } from '@/lib/utils'

interface LinhaStatusProps {
  status: StatusConfig
  /** Rótulo da base (status próprio "conta como") */
  rotuloBase?: string
  podeEditar: boolean
  podeExcluir: boolean
  /** Entidade com kanban: mostra o controle de visível/oculto */
  comQuadro: boolean
}

/**
 * Uma linha da tabela de status: rótulo, cor, ordem e visível. Os do sistema não podem ser excluídos
 * (as regras de negócio usam o código); os próprios podem, e os registros neles voltam para a base.
 */
export function LinhaStatus({ status, rotuloBase, podeEditar, podeExcluir, comQuadro }: LinhaStatusProps) {
  const queryClient = useQueryClient()
  const [rotulo, setRotulo] = useState(status.rotulo)
  const [cor, setCor] = useState(status.cor)
  const [ordem, setOrdem] = useState(String(status.ordem))
  const [ativo, setAtivo] = useState(status.ativo)
  const [excluindo, setExcluindo] = useState(false)
  const alterado = rotulo !== status.rotulo || cor.toUpperCase() !== status.cor.toUpperCase() || Number(ordem) !== status.ordem || ativo !== status.ativo
  const salvar = useMutation({
    mutationFn: () => statusApi.salvar(status.id, { rotulo: rotulo.trim(), cor, ordem: Number(ordem) || 0, ativo }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHAVE_STATUS })
      toast.success('Status atualizado.')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <tr className={cn('hover:bg-fundo/50', !ativo && 'opacity-60')}>
      <td className="px-4 py-2">
        <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} disabled={!podeEditar} aria-label={`Nome de ${status.rotulo}`} className="h-9" />
        <p className="mt-1 text-[11px] text-texto-secundario">
          {status.sistema ? (
            <>
              Do sistema · <span className="font-mono">{status.codigo}</span>
              {status.ehFinal && ' · final'}
            </>
          ) : (
            <span className="font-medium text-turquesa-escuro">Próprio · conta como “{rotuloBase ?? status.base}”</span>
          )}
        </p>
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value.toUpperCase())} disabled={!podeEditar} aria-label={`Cor de ${status.rotulo}`} className="h-9 w-10 cursor-pointer rounded border border-input bg-card p-0.5" />
          <span className="font-mono text-xs">{cor}</span>
        </div>
      </td>
      <td className="px-4 py-2">
        <Input value={ordem} onChange={(e) => setOrdem(e.target.value.replace(/\D/g, ''))} disabled={!podeEditar} aria-label={`Ordem de ${status.rotulo}`} className="h-9 w-20" inputMode="numeric" />
      </td>
      {comQuadro && (
        <td className="px-4 py-2">
          <Button
            type="button"
            size="sm"
            variant="ghost"
            disabled={!podeEditar}
            onClick={() => setAtivo((a) => !a)}
            aria-pressed={ativo}
            title={ativo ? 'Visível no kanban (clique para ocultar)' : 'Oculto no kanban quando vazio (clique para mostrar)'}
          >
            {ativo ? <Eye /> : <EyeOff />} {ativo ? 'Visível' : 'Oculto'}
          </Button>
        </td>
      )}
      <td className="px-4 py-2">
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: fundoSuave(cor), color: textoLegivel(cor) }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cor }} />
          {rotulo || status.codigo}
        </span>
      </td>
      <td className="whitespace-nowrap px-4 py-2 text-right">
        {podeEditar && (
          <Button size="sm" variant={alterado ? 'default' : 'ghost'} disabled={!alterado || salvar.isPending || !rotulo.trim()} onClick={() => salvar.mutate()}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Check />} Salvar
          </Button>
        )}
        {podeExcluir && !status.sistema && (
          <Button size="sm" variant="ghost" className="text-coral-escuro hover:text-coral-escuro" onClick={() => setExcluindo(true)} aria-label={`Excluir ${status.rotulo}`}>
            <Trash2 />
          </Button>
        )}
      </td>
      <ConfirmDialog
        aberto={excluindo}
        onAbertoChange={setExcluindo}
        titulo={`Excluir "${status.rotulo}"?`}
        descricao={`Os registros que estão nesta coluna voltam para "${rotuloBase ?? status.base}". Nada é perdido.`}
        textoConfirmar="Excluir"
        perigoso
        onConfirmar={async () => {
          await statusApi.remover(status.id)
          await queryClient.invalidateQueries({ queryKey: CHAVE_STATUS })
          toast.success('Status excluído.')
        }}
      />
    </tr>
  )
}
