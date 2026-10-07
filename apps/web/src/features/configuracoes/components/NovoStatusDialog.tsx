import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BASES_SEM_STATUS_PROPRIO, type EntidadeComStatusProprio, type StatusConfig } from '@onprint/shared'
import { statusApi } from '@/api/configuracoes'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { CHAVE_STATUS } from '@/hooks/useStatusConfig'

const DICAS: Record<EntidadeComStatusProprio, string> = {
  orcamento: 'Ex.: "Aguardando retorno do cliente" contando como "Enviado".',
  pedido: 'Ex.: "Aguardando pagamento" contando como "Pronto".',
  producao: 'Ex.: "Laminação" contando como "Acabamento".',
}

/**
 * Novo status próprio: vira uma coluna no kanban ao lado da base escolhida.
 * As regras automáticas enxergam a base, então nada no sistema deixa de funcionar.
 */
export function NovoStatusDialog({ entidade, sistema, onFechar }: { entidade: EntidadeComStatusProprio; sistema: StatusConfig[]; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const bases = sistema.filter((s) => !BASES_SEM_STATUS_PROPRIO[entidade].includes(s.codigo))
  const [rotulo, setRotulo] = useState('')
  const [cor, setCor] = useState('#0EA5E9')
  const [base, setBase] = useState(bases[0]?.codigo ?? '')
  const [salvando, setSalvando] = useState(false)

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await statusApi.criar({ entidade, rotulo: rotulo.trim(), cor, base })
      await queryClient.invalidateQueries({ queryKey: CHAVE_STATUS })
      toast.success('Status criado. Ele já aparece como coluna no kanban.')
      onFechar()
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo="Novo status"
      descricao={`Vira uma coluna no kanban, ao lado do status do sistema escolhido. ${DICAS[entidade]}`}
      textoSalvar="Criar status"
      salvando={salvando}
      onSubmit={(e) => void salvar(e)}
    >
      <div className="grid gap-4 sm:grid-cols-[1fr_auto]">
        <CampoFormulario id="ns-rotulo" rotulo="Nome *">
          <Input id="ns-rotulo" autoFocus value={rotulo} onChange={(e) => setRotulo(e.target.value)} maxLength={60} placeholder="Ex.: Laminação" />
        </CampoFormulario>
        <CampoFormulario id="ns-cor" rotulo="Cor">
          <input id="ns-cor" type="color" value={cor} onChange={(e) => setCor(e.target.value.toUpperCase())} className="h-10 w-14 cursor-pointer rounded border border-input bg-card p-0.5" />
        </CampoFormulario>
      </div>
      <CampoFormulario id="ns-base" rotulo="Conta como (status do sistema) *">
        <Select id="ns-base" value={base} onChange={(e) => setBase(e.target.value)}>
          {bases.map((s) => (
            <option key={s.codigo} value={s.codigo}>
              {s.rotulo}
            </option>
          ))}
        </Select>
      </CampoFormulario>
      <p className="rounded-lg bg-fundo p-3 text-xs text-texto-secundario">
        Para o sistema, quem está em “{rotulo.trim() || 'novo status'}” está em “{bases.find((s) => s.codigo === base)?.rotulo}”: prazos, avisos, relatórios e regras automáticas continuam iguais.
      </p>
    </FormDialog>
  )
}
