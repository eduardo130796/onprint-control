import { useState } from 'react'
import { AlertTriangle, Wallet } from 'lucide-react'
import { normalizarDecimal } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { resumoPagamentoDoForm, type FormOrcamento } from './formOrcamento'

interface PagamentoProps {
  form: FormOrcamento
  onChange: (dados: Partial<FormOrcamento>) => void
  total: string
  editavel: boolean
}

/**
 * Pagamento combinado numa linha ("À vista na aprovação · Alterar"); "Alterar" abre a entrada, as parcelas do saldo
 * (0 = restante na retirada/entrega) e o intervalo. A observação de pagamento fica atrás de "+ observação". O resumo
 * é o mesmo texto da mensagem, do PDF e da página de aprovação, e o pedido gera exatamente essas contas.
 */
export function PagamentoOrcamento({ form, onChange, total, editavel }: PagamentoProps) {
  const resumo = resumoPagamentoDoForm(form, Number(total) > 0 ? total : '0')
  const aVista = Number(normalizarDecimal(form.sinalPercentual || '0')) >= 100
  const semParcelas = !aVista && Number(form.parcelas || '0') === 0
  // Plano inválido já começa aberto (para corrigir)
  const [aberto, setAberto] = useState(!resumo)
  const [comObservacao, setComObservacao] = useState(Boolean(form.condicoes.trim()))

  return (
    <Card className="space-y-3 p-4">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
        <Wallet className="h-4 w-4 shrink-0 text-texto-secundario" aria-hidden="true" />
        <span className="font-medium text-tinta">Pagamento:</span>
        {resumo ? (
          // Entrada e parcelas saem do total: para o olho do topo, também são valor final
          <span className="min-w-0 [overflow-wrap:anywhere]" aria-live="polite" data-valor-tipo="total">
            {resumo}
          </span>
        ) : (
          <span className="flex items-center gap-1 text-coral-escuro">
            <AlertTriangle className="h-4 w-4 shrink-0" /> confira os números
          </span>
        )}
        {editavel && (
          <button type="button" className="font-medium text-marca-escuro hover:underline" aria-expanded={aberto} onClick={() => setAberto((v) => !v)}>
            · {aberto ? 'Fechar' : 'Alterar'}
          </button>
        )}
      </div>

      {aberto && editavel && (
        <div className="space-y-2">
          <div className="grid grid-cols-3 items-end gap-3">
            <CampoFormulario id="orc-sinal" rotulo="Entrada">
              <NumberInput id="orc-sinal" sufixo="%" value={form.sinalPercentual} onChange={(e) => onChange({ sinalPercentual: e.target.value })} />
            </CampoFormulario>
            <CampoFormulario id="orc-parcelas" rotulo="Parcelas do resto">
              <NumberInput id="orc-parcelas" casas={0} disabled={aVista} value={form.parcelas} onChange={(e) => onChange({ parcelas: e.target.value })} />
            </CampoFormulario>
            <CampoFormulario id="orc-intervalo" rotulo="A cada">
              <NumberInput id="orc-intervalo" casas={0} sufixo="dias" disabled={aVista || semParcelas} value={form.intervaloDias} onChange={(e) => onChange({ intervaloDias: e.target.value })} />
            </CampoFormulario>
          </div>
          <p className="text-xs text-texto-secundario">Entrada de 100% = à vista. 0 parcelas = o resto na retirada ou entrega.</p>
          {!resumo && <p className="text-xs text-coral-escuro">Entrada entre 0 e 100%, até 24 parcelas, a cada 1 a 120 dias.</p>}
        </div>
      )}

      {comObservacao ? (
        <CampoFormulario id="orc-cond" rotulo="Observação de pagamento">
          <Textarea id="orc-cond" rows={2} disabled={!editavel} value={form.condicoes} placeholder="Ex.: Pix, cartão ou boleto." onChange={(e) => onChange({ condicoes: e.target.value })} />
        </CampoFormulario>
      ) : (
        editavel && (
          <button type="button" className="text-xs font-medium text-marca-escuro hover:underline" onClick={() => setComObservacao(true)}>
            + observação
          </button>
        )
      )}
    </Card>
  )
}
