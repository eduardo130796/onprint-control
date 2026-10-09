import { formatarDataSimples, formatarMoeda, type AnaliseLucro } from '@onprint/shared'
import { MoneyInput } from '@/components/shared/inputs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LucroDoTotal } from '@/features/produtos/components/custo/LucroAnalise'
import type { FormOrcamento } from './formOrcamento'

interface TotaisProps {
  form: FormOrcamento
  onChange: (dados: Partial<FormOrcamento>) => void
  subtotal: string
  total: string
  prazoDias: number
  previsaoEntrega: string
  editavel: boolean
  /** Lucro do orçamento (semáforo para todos; números só para quem vê custos) */
  analise?: AnaliseLucro | null
  analiseDesatualizada?: boolean
}

export function TotaisOrcamento({ form, onChange, subtotal, total, prazoDias, previsaoEntrega, editavel, analise, analiseDesatualizada }: TotaisProps) {
  const linha = (rotulo: string, campo: 'desconto' | 'acrescimo' | 'frete') => (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={`tot-${campo}`} className="font-normal text-texto-secundario">
        {rotulo}
      </Label>
      <div className="w-36">
        <MoneyInput id={`tot-${campo}`} className="h-9" value={form[campo]} disabled={!editavel} onChange={(e) => onChange({ [campo]: e.target.value })} />
      </div>
    </div>
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Totais</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-texto-secundario">Subtotal dos itens</span>
          <span>{formatarMoeda(subtotal)}</span>
        </div>
        {linha('(−) Desconto', 'desconto')}
        {linha('(+) Acréscimo', 'acrescimo')}
        {linha('(+) Frete / instalação', 'frete')}
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-semibold text-tinta">Total</span>
          <span className={Number(total) < 0 ? 'text-2xl font-bold text-coral-escuro' : 'text-2xl font-bold text-tinta'}>{formatarMoeda(total)}</span>
        </div>
        {analise && <LucroDoTotal analise={analise} desatualizado={analiseDesatualizada} className="border-t border-border pt-3" />}
        <div className="space-y-1 border-t border-border pt-3 text-texto-secundario">
          <p>
            Produção: <strong className="text-texto">{prazoDias} dia(s) úteis</strong>
          </p>
          <p>
            Previsão se aprovado hoje: <strong className="text-texto">{formatarDataSimples(previsaoEntrega)}</strong>
          </p>
        </div>
        <div className="flex items-center justify-between gap-3 border-t border-border pt-3">
          <Label htmlFor="tot-validade" className="font-normal text-texto-secundario">
            Válido até
          </Label>
          <Input id="tot-validade" type="date" className="h-9 w-40" value={form.validade} disabled={!editavel} onChange={(e) => onChange({ validade: e.target.value })} />
        </div>
        {!form.validade && editavel && <p className="text-xs text-texto-secundario">Em branco: validade padrão da empresa.</p>}
      </CardContent>
    </Card>
  )
}
