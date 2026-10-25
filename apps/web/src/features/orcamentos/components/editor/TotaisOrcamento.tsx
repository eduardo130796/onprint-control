import { useState } from 'react'
import { formatarDataSimples, formatarMoeda, normalizarDecimal, type AnaliseLucro } from '@onprint/shared'
import { MoneyInput } from '@/components/shared/inputs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { LucroDoTotal } from '@/features/produtos/components/custo/LucroAnalise'
import type { FormOrcamento } from './formOrcamento'

interface TotaisProps {
  form: FormOrcamento
  onChange: (dados: Partial<FormOrcamento>) => void
  /** Itens antes das regras comerciais (só com o desconto de cada item) */
  subtotal: string
  /** O que as regras tiraram e somaram (positivos) */
  descontosRegras: string
  acrescimosRegras: string
  total: string
  prazoDias: number
  previsaoEntrega: string
  editavel: boolean
  /** Lucro do orçamento (semáforo para todos; números só para quem vê custos) */
  analise?: AnaliseLucro | null
  analiseDesatualizada?: boolean
  /** "ver detalhes": as regras com a explicação e o que o cliente vê */
  onVerDetalhes: () => void
}

/**
 * Totais do orçamento: itens, uma linha "Descontos" (e "Acréscimos") das regras com "ver detalhes", o desconto e o
 * frete do vendedor, o total, o lucro, o prazo e as datas. O acréscimo manual fica escondido até ser preciso.
 */
export function TotaisOrcamento({ form, onChange, subtotal, descontosRegras, acrescimosRegras, total, prazoDias, previsaoEntrega, editavel, analise, analiseDesatualizada, onVerDetalhes }: TotaisProps) {
  const [comAcrescimo, setComAcrescimo] = useState(Number(normalizarDecimal(form.acrescimo || '0')) !== 0)
  const temDesconto = Number(descontosRegras) > 0
  const temAcrescimo = Number(acrescimosRegras) > 0
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
  const detalhes = (
    <button type="button" onClick={onVerDetalhes} className="ml-1.5 text-xs font-medium text-marca-escuro hover:underline">
      ver detalhes
    </button>
  )

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Totais</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div className="flex justify-between">
          <span className="text-texto-secundario">Itens</span>
          <span>{formatarMoeda(subtotal)}</span>
        </div>
        {temDesconto && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-texto-secundario">
              Descontos
              {detalhes}
            </span>
            <span className="shrink-0 font-medium text-green-800 dark:text-green-300">−{formatarMoeda(descontosRegras)}</span>
          </div>
        )}
        {temAcrescimo && (
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-texto-secundario">
              Acréscimos
              {!temDesconto && detalhes}
            </span>
            <span className="shrink-0">+{formatarMoeda(acrescimosRegras)}</span>
          </div>
        )}
        {linha('Desconto extra', 'desconto')}
        {comAcrescimo && linha('Acréscimo extra', 'acrescimo')}
        {linha('Frete / instalação', 'frete')}
        {editavel && !comAcrescimo && (
          <button type="button" className="text-xs font-medium text-marca-escuro hover:underline" onClick={() => setComAcrescimo(true)}>
            + acréscimo
          </button>
        )}
        <div className="flex items-baseline justify-between border-t border-border pt-3">
          <span className="font-semibold text-tinta">Total</span>
          <span data-valor-tipo="total" className={Number(total) < 0 ? 'text-2xl font-bold text-coral-escuro' : 'text-2xl font-bold text-tinta'}>
            {formatarMoeda(total)}
          </span>
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
        {/* Prazo pedido pelo cliente: as regras de urgência olham esta data */}
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="tot-desejada" className="font-normal text-texto-secundario">
            Cliente precisa até
          </Label>
          <Input id="tot-desejada" type="date" className="h-9 w-40" value={form.dataDesejada} disabled={!editavel} onChange={(e) => onChange({ dataDesejada: e.target.value })} />
        </div>
      </CardContent>
    </Card>
  )
}
