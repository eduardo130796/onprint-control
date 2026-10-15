import { AlertTriangle, Wallet } from 'lucide-react'
import { normalizarDecimal } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { resumoPagamentoDoForm, type FormOrcamento } from './formOrcamento'

interface PagamentoProps {
  form: FormOrcamento
  onChange: (dados: Partial<FormOrcamento>) => void
  total: string
  editavel: boolean
}

/**
 * Pagamento combinado no orçamento: entrada na aprovação + saldo em parcelas (0 = restante na retirada/entrega).
 * O resumo é o mesmo texto da mensagem, do PDF e da página de aprovação, e o pedido gera exatamente essas contas.
 */
export function PagamentoOrcamento({ form, onChange, total, editavel }: PagamentoProps) {
  const resumo = resumoPagamentoDoForm(form, Number(total) > 0 ? total : '0')
  const aVista = Number(normalizarDecimal(form.sinalPercentual || '0')) >= 100
  const semParcelas = !aVista && Number(form.parcelas || '0') === 0

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Wallet className="h-4 w-4 text-texto-secundario" /> Pagamento
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 items-end gap-3">
          <CampoFormulario id="orc-sinal" rotulo="Entrada">
            <NumberInput id="orc-sinal" sufixo="%" disabled={!editavel} value={form.sinalPercentual} onChange={(e) => onChange({ sinalPercentual: e.target.value })} />
          </CampoFormulario>
          <CampoFormulario id="orc-parcelas" rotulo="Parcelas do saldo">
            <NumberInput id="orc-parcelas" casas={0} disabled={!editavel || aVista} value={form.parcelas} onChange={(e) => onChange({ parcelas: e.target.value })} />
          </CampoFormulario>
          <CampoFormulario id="orc-intervalo" rotulo="A cada">
            <NumberInput
              id="orc-intervalo"
              casas={0}
              sufixo="dias"
              disabled={!editavel || aVista || semParcelas}
              value={form.intervaloDias}
              onChange={(e) => onChange({ intervaloDias: e.target.value })}
            />
          </CampoFormulario>
        </div>
        {resumo ? (
          <p className="rounded-xl bg-marca-suave px-3 py-2 text-sm font-medium text-marca-escuro" aria-live="polite">
            {resumo}
          </p>
        ) : (
          <p className="flex items-center gap-2 rounded-xl bg-coral/10 px-3 py-2 text-sm text-coral-escuro">
            <AlertTriangle className="h-4 w-4 shrink-0" /> Entrada entre 0 e 100%, até 24 parcelas, intervalo de 1 a 120 dias.
          </p>
        )}
        {editavel && <p className="text-xs text-texto-secundario">0 parcelas: o restante é pago na retirada/entrega. Vai na mensagem, no PDF e nas contas a receber do pedido.</p>}
        <CampoFormulario id="orc-cond" rotulo="Observações de pagamento (opcional)">
          <Textarea
            id="orc-cond"
            rows={2}
            disabled={!editavel}
            value={form.condicoes}
            placeholder="Ex.: Pix, cartão ou boleto."
            onChange={(e) => onChange({ condicoes: e.target.value })}
          />
        </CampoFormulario>
      </CardContent>
    </Card>
  )
}
