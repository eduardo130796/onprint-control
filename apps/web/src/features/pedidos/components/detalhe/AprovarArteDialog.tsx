import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ArteVersao } from '@onprint/shared'
import { artesApi } from '@/api/producao'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Input } from '@/components/ui/input'

/** Aprovação registrada pela equipe (ex.: cliente aprovou por telefone ou pessoalmente). */
export function AprovarArteDialog({ arte, onFechar }: { arte: ArteVersao | null; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const [nome, setNome] = useState('')
  const [salvando, setSalvando] = useState(false)
  const valido = nome.trim().length >= 2

  async function salvar(e: React.FormEvent) {
    e.preventDefault()
    if (!arte || !valido) return
    setSalvando(true)
    try {
      await artesApi.aprovar(arte.id, nome.trim())
      toast.success(`Arte v${arte.versao} aprovada.`)
      setNome('')
      await queryClient.invalidateQueries({ queryKey: ['pedidos'] })
      onFechar()
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <FormDialog
      aberto={Boolean(arte)}
      onAbertoChange={(v) => !v && onFechar()}
      titulo={`Registrar aprovação da v${arte?.versao ?? ''}`}
      descricao="Use quando o cliente aprovou fora do link (telefone, balcão, e-mail). Fica registrado no histórico."
      salvando={salvando}
      onSubmit={(e) => void salvar(e)}
      textoSalvar="Aprovar arte"
    >
      <CampoFormulario id="aprovado-por" rotulo="Quem aprovou *" erro={nome && !valido ? 'Informe o nome.' : undefined}>
        <Input id="aprovado-por" autoFocus value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Carlos (por telefone)" />
      </CampoFormulario>
    </FormDialog>
  )
}
