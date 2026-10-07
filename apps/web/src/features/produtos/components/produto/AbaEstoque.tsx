import { Boxes } from 'lucide-react'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import type { FormProduto } from './formProduto'

export function AbaEstoque({ form, siglaUnidade }: { form: FormProduto; siglaUnidade?: string }) {
  const { errors } = form.formState
  const controla = Boolean(form.watch('controlaEstoque'))

  return (
    <Card>
      <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
        <label className="flex items-center gap-2 text-sm md:col-span-2">
          <Checkbox {...form.register('controlaEstoque')} /> Controlar estoque deste item
        </label>
        <CampoFormulario id="pd-estmin" rotulo="Estoque mínimo (gera alerta)" erro={errors.estoqueMinimo?.message}>
          <NumberInput id="pd-estmin" casas={3} sufixo={siglaUnidade} disabled={!controla} {...form.register('estoqueMinimo')} />
        </CampoFormulario>
        <div className="flex items-start gap-3 rounded-2xl bg-fundo p-4 text-sm text-texto-secundario">
          <Boxes className="h-5 w-5 shrink-0 text-marca-escuro" />
          <p>
            O saldo só muda por movimentação (entradas, produção, ajustes). Os insumos da ficha técnica são baixados automaticamente
            quando a OP é concluída; abaixo do mínimo, o item aparece em Estoque → Alertas.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}
