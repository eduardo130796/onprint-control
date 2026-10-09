import { MODOS_CALCULO, MODO_CALCULO_ROTULOS, MODO_CALCULO_SUFIXO, type ModoCalculo, type Produto } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { formatarPrecoUnitario } from '@/lib/produtos'
import type { FormProduto } from './formProduto'

const EXPLICACAO: Record<ModoCalculo, string> = {
  unidade: 'Quantidade × preço.',
  m2: 'Largura × altura (respeitando a área mínima por peça da empresa) × quantidade × preço do m².',
  metro_linear: 'Comprimento × quantidade × preço do metro.',
  milheiro: 'A quantidade é arredondada para cima em lotes de 1.000 e cada lote é cobrado pelo preço do milheiro.',
  hora: 'Horas × preço da hora.',
}

/** Como o produto é vendido: forma de cobrança e medidas (o preço fica na aba "Custo e preço"). */
export function ComoEVendido({ form, produto }: { form: FormProduto; produto?: Produto }) {
  const { errors } = form.formState
  const r = form.register
  const modo = (form.watch('modoCalculo') ?? 'unidade') as ModoCalculo
  const sufixo = MODO_CALCULO_SUFIXO[modo]

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Como é vendido</CardTitle>
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
        {produto ? (
          <div className="rounded-2xl bg-fundo p-3 md:col-span-2">
            <p className="text-xs text-texto-secundario">Preço de venda</p>
            <p className="font-semibold text-tinta">{formatarPrecoUnitario(produto.precoVenda, produto.modoCalculo)}</p>
            <p className="text-xs text-texto-secundario">Custo, lucro e preço ficam na aba “Custo e preço”.</p>
          </div>
        ) : (
          <div className="md:col-span-2">
            <CampoFormulario id="pd-preco" rotulo={`Preço de venda / ${sufixo}`} erro={errors.precoVenda?.message}>
              <MoneyInput id="pd-preco" {...r('precoVenda')} />
            </CampoFormulario>
            <p className="mt-1.5 text-xs text-texto-secundario">Depois de salvar, a aba “Custo e preço” calcula o preço sugerido pelo custo.</p>
          </div>
        )}
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
          Medidas em metros. As máximas valem em qualquer orientação: uma peça de 3 × 1,5 m cabe num limite de 1,6 × 50 m (é girada).
        </p>
      </CardContent>
    </Card>
  )
}
