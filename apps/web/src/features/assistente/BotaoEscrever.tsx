import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { DescricaoAssistenteInput } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { Button } from '@/components/ui/button'
import { useAjudaLiberada, useAtualizarUsoAssistente } from './useAssistente'

interface BotaoEscreverProps {
  /** O que mandar (produto salvo ou o rascunho do formulário); null = ainda não dá (falta o nome) */
  pedido: () => DescricaoAssistenteInput | null
  /** O texto pronto vai para o campo (a pessoa revisa e salva) */
  onTexto: (texto: string) => void
  desabilitado?: boolean
}

/** "Escrever com o Assistente" ao lado de um campo de descrição. Só aparece com a ajuda liberada. */
export function BotaoEscrever({ pedido, onTexto, desabilitado }: BotaoEscreverProps) {
  const liberado = useAjudaLiberada('descricoes')
  const atualizarUso = useAtualizarUsoAssistente()
  const [escrevendo, setEscrevendo] = useState(false)
  if (!liberado) return null

  async function escrever() {
    const dados = pedido()
    if (!dados) return toast.error('Preencha o nome do produto antes.')
    setEscrevendo(true)
    try {
      const r = await assistenteApi.descricao(dados)
      onTexto(r.texto)
      toast.success('Descrição escrita pelo Assistente: revise antes de salvar.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEscrevendo(false)
      atualizarUso()
    }
  }

  return (
    <Button type="button" variant="ghost" size="sm" className="h-7 gap-1.5 px-2 text-xs text-marca-escuro" disabled={desabilitado || escrevendo} onClick={() => void escrever()}>
      {escrevendo ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
      {escrevendo ? 'Escrevendo…' : 'Escrever com o Assistente'}
    </Button>
  )
}
