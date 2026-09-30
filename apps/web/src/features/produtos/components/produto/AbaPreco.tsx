import { Calculator } from 'lucide-react'
import { MODOS_CALCULO, MODO_CALCULO_ROTULOS, MODO_CALCULO_SUFIXO, normalizarDecimal, precoPelaMargem, type ModoCalculo } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { decimalParaInput } from '@/lib/mascaras'
import type { FormProduto } from './formProduto'

const EXPLICACAO: Record<ModoCalculo, string> = {
  unidade: 'Quantidade × preço.',
  m2: 'Largura × altura (respeitando a área mínima por peça da empresa) × quantidade × preço do m².',
  metro_linear: 'Comprimento × quantidade × preço do metro.',
  milheiro: 'A quantidade é arredondada para cima em lotes de 1.000 e cada lote é cobrado pelo preço do milheiro.',
  hora: 'Horas × preço da hora.',
}

export function AbaPreco({ form, veCustos }: { form: FormProduto; veCustos: boolean }) {
  const { errors } = form.formState
  const r = form.register
  const modo = (form.watch('modoCalculo') ?? 'unidade') as ModoCalculo
  const sufixo = MODO_CALCULO_SUFIXO[modo]

  function aplicarMargem() {
    const custo = normalizarDecimal(String(form.getValues('custo') ?? '0'))
    const margem = normalizarDecimal(String(form.getValues('margem') ?? '0'))
    form.setValue('precoVenda', decimalParaInput(precoPelaMargem(custo, margem)), { shouldDirty: true, shouldValidate: true })
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Forma de cálculo e preço</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="md:col-span-2">
            <CampoFormulario id="pd-modo" rotulo="Cobrar">
              <Select id="pd-modo" {...r('modoCalculo')}>
                {MODOS_CALCULO.map((m) => (
                  <option key={m} value={m}>
                    {MODO_CALCULO_ROTULOS[m]}
                  </option>
                ))}
              </Select>
            </CampoFormulario>
            <p className="mt-1.5 text-xs text-texto-secundario">{EXPLICACAO[modo]}</p>
          </div>
          <CampoFormulario id="pd-preco" rotulo={`Preço de venda / ${sufixo}`} erro={errors.precoVenda?.message}>
            <MoneyInput id="pd-preco" {...r('precoVenda')} />
          </CampoFormulario>
          <CampoFormulario id="pd-minimo" rotulo={`Preço mínimo / ${sufixo}`} erro={errors.precoMinimo?.message}>
            <MoneyInput id="pd-minimo" placeholder="Sem mínimo" {...r('precoMinimo')} />
          </CampoFormulario>
          {veCustos && (
            <>
              <CampoFormulario id="pd-custo" rotulo={`Custo / ${sufixo}`} erro={errors.custo?.message}>
                <MoneyInput id="pd-custo" {...r('custo')} />
              </CampoFormulario>
              <CampoFormulario id="pd-margem" rotulo="Margem sobre o custo" erro={errors.margem?.message}>
                <NumberInput id="pd-margem" sufixo="%" {...r('margem')} />
              </CampoFormulario>
              <div className="flex items-end md:col-span-2">
                <Button type="button" variant="outline" onClick={aplicarMargem}>
                  <Calculator /> Calcular preço pela margem
                </Button>
              </div>
            </>
          )}
          <p className="text-xs text-texto-secundario md:col-span-4">
            Vender abaixo do preço mínimo exigirá a permissão “aprovar” nos orçamentos.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Medidas (em metros)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <CampoFormulario id="pd-lp" rotulo={modo === 'metro_linear' ? 'Comprimento padrão' : 'Largura padrão'} erro={errors.larguraPadrao?.message}>
            <NumberInput id="pd-lp" casas={3} sufixo="m" {...r('larguraPadrao')} />
          </CampoFormulario>
          <CampoFormulario id="pd-ap" rotulo="Altura padrão" erro={errors.alturaPadrao?.message}>
            <NumberInput id="pd-ap" casas={3} sufixo="m" {...r('alturaPadrao')} />
          </CampoFormulario>
          <CampoFormulario id="pd-lm" rotulo="Largura máxima" erro={errors.larguraMaxima?.message}>
            <NumberInput id="pd-lm" casas={3} sufixo="m" {...r('larguraMaxima')} />
          </CampoFormulario>
          <CampoFormulario id="pd-am" rotulo="Altura máxima" erro={errors.alturaMaxima?.message}>
            <NumberInput id="pd-am" casas={3} sufixo="m" {...r('alturaMaxima')} />
          </CampoFormulario>
          <p className="text-xs text-texto-secundario md:col-span-4">
            As medidas máximas valem em qualquer orientação: uma peça de 3 × 1,5 m cabe num limite de 1,6 × 50 m (é girada).
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
