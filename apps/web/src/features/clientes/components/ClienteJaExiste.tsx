import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ExternalLink, Loader2, RotateCcw, UserRoundSearch } from 'lucide-react'
import { toast } from 'sonner'
import { clientesApi } from '@/api/cadastros'
import { Button } from '@/components/ui/button'
import { usePermission } from '@/hooks/usePermission'
import { chavesClientes } from '../hooks'

export interface ClienteExistente {
  id: string
  nome: string
  ativo: boolean
  /** O que coincide: o CPF/CNPJ (padrão) ou o WhatsApp */
  campo?: 'cpfCnpj' | 'whatsapp'
}

/**
 * Aviso no cadastro: o CPF/CNPJ (ou WhatsApp) já é de outro cliente. Desativar não apaga, então o caminho
 * é abrir (ou reativar) o cadastro que existe, em vez de criar outro.
 */
export function ClienteJaExiste({ existente }: { existente: ClienteExistente }) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const podeReativar = usePermission('clientes', 'editar')
  const [reativando, setReativando] = useState(false)
  const oQue = existente.campo === 'whatsapp' ? 'Este WhatsApp' : 'Este CPF/CNPJ'

  async function reativar() {
    setReativando(true)
    try {
      await clientesApi.reativar(existente.id)
      await queryClient.invalidateQueries({ queryKey: chavesClientes.todos })
      toast.success(`${existente.nome} foi reativado.`)
      navigate(`/clientes/${existente.id}`)
    } catch (e) {
      toast.error((e as Error).message)
      setReativando(false)
    }
  }

  return (
    <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-100 md:col-span-6">
      <UserRoundSearch className="mt-0.5 h-5 w-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 basis-56">
        <p className="font-medium">
          {oQue} já é de <strong>{existente.nome}</strong>
          {existente.ativo ? '.' : ', um cliente desativado.'}
        </p>
        <p className="mt-0.5 opacity-80">
          {existente.ativo ? 'Abra o cadastro dele em vez de criar outro.' : 'Reative o cadastro para usar de novo, com o histórico de pedidos e orçamentos.'}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        {!existente.ativo && podeReativar && (
          <Button type="button" size="sm" disabled={reativando} onClick={() => void reativar()}>
            {reativando ? <Loader2 className="animate-spin" /> : <RotateCcw />} Reativar e abrir
          </Button>
        )}
        <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/clientes/${existente.id}`)}>
          <ExternalLink /> Abrir cadastro
        </Button>
      </div>
    </div>
  )
}
