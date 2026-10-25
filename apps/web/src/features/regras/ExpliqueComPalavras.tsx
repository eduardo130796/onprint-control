import { useState } from 'react'
import { Loader2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { RegrasDeTexto } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { Gaveta } from '@/components/shared/Gaveta'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/form-controls'
import { useAtualizarUsoAssistente } from '@/features/assistente/useAssistente'

interface Props {
  aberta: boolean
  onAbertaChange: (v: boolean) => void
  /** O que o Assistente entendeu: a tela preenche as perguntas (nada é salvo aqui) */
  onEntendido: (r: RegrasDeTexto) => void
}

/**
 * "Explique com suas palavras como você dá desconto": o dono escreve como faz e o Assistente GrafyGo preenche as
 * perguntas. Só o que o dono disse; ele confere e salva.
 */
export function ExpliqueComPalavras({ aberta, onAbertaChange, onEntendido }: Props) {
  const atualizarUso = useAtualizarUsoAssistente()
  const [texto, setTexto] = useState('')
  const [lendo, setLendo] = useState(false)

  async function ler() {
    setLendo(true)
    try {
      const r = await assistenteApi.regrasDeTexto(texto.trim())
      const respondidas = [r.quantidade, r.aVista, r.especiais, r.urgencia, r.minimo, r.limite].filter(Boolean).length
      if (!respondidas) toast.info('O Assistente não achou números de desconto no texto. Tente dizer o percentual e quando vale.')
      else {
        onEntendido(r)
        onAbertaChange(false)
        toast.success(`${respondidas} pergunta(s) preenchida(s). Confira e salve.`)
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLendo(false)
      atualizarUso()
    }
  }

  return (
    <Gaveta aberta={aberta} onAbertaChange={onAbertaChange} titulo="Explique com suas palavras">
      <div className="space-y-4">
        <p className="text-sm text-texto-secundario">Conte como você dá desconto, como explicaria para um funcionário novo. O Assistente preenche as perguntas e você confere antes de salvar.</p>
        <Textarea
          aria-label="Como você dá desconto"
          rows={7}
          maxLength={2000}
          autoFocus
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={'Ex.: Acima de 10 unidades dou 5%, o vendedor pode sugerir. No Pix dou 3%, só se o cliente pedir. Revenda tem 10%. Urgência para menos de 2 dias úteis cobro 20% a mais. Pedido mínimo de R$ 50. O vendedor pode dar até 5% sem me perguntar.'}
        />
        <div className="flex justify-end">
          <Button type="button" onClick={() => void ler()} disabled={lendo || texto.trim().length < 10}>
            {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />} {lendo ? 'Lendo…' : 'Preencher as perguntas'}
          </Button>
        </div>
      </div>
    </Gaveta>
  )
}
