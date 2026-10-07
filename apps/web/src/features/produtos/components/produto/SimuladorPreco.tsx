import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, XCircle } from 'lucide-react'
import {
  MODO_CALCULO_SUFIXO,
  calcularPreco,
  formatarMoeda,
  normalizarDecimal,
  type ProdutoDetalhe,
} from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { MoneyInput, NumberInput } from '@/components/shared/inputs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { useDebounce } from '@/hooks/useDebounce'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { ResumoPreco } from './ResumoPreco'

const numero = (v: string) => (v.trim() ? normalizarDecimal(v) : '')

/**
 * Simulador: calcula ao vivo no navegador com o motor compartilhado (@onprint/shared/pricing)
 * e confere com o cálculo da API, que usa os dados gravados no banco.
 */
export function SimuladorPreco({ produto, alteracoesPendentes }: { produto: ProdutoDetalhe; alteracoesPendentes: boolean }) {
  const empresa = useEmpresa()
  const usaMedidas = produto.modoCalculo === 'm2' || produto.acabamentos.length > 0
  const [quantidade, setQuantidade] = useState(produto.modoCalculo === 'milheiro' ? '1000' : '1')
  const [largura, setLargura] = useState(produto.larguraPadrao ? decimalParaInput(produto.larguraPadrao, 3) : '')
  const [altura, setAltura] = useState(produto.alturaPadrao ? decimalParaInput(produto.alturaPadrao, 3) : '')
  const [preco, setPreco] = useState(decimalParaInput(produto.precoVenda))
  const [marcados, setMarcados] = useState<Set<string>>(() => new Set(produto.acabamentos.filter((a) => a.padrao || a.obrigatorio).map((a) => a.acabamentoId)))

  const entrada = {
    quantidade: numero(quantidade) || '0',
    largura: numero(largura) || null,
    altura: numero(altura) || null,
    precoUnitario: numero(preco) || '0',
    acabamentoIds: produto.acabamentos.filter((a) => marcados.has(a.acabamentoId)).map((a) => a.acabamentoId),
  }

  const noFront = useMemo(
    () =>
      calcularPreco({
        modoCalculo: produto.modoCalculo,
        precoUnitario: entrada.precoUnitario,
        custoUnitario: produto.custo,
        precoMinimo: produto.precoMinimo,
        quantidade: entrada.quantidade,
        largura: entrada.largura,
        altura: entrada.altura,
        areaMinimaM2: empresa.data?.areaMinimaM2,
        medidasMaximas: { largura: produto.larguraMaxima, altura: produto.alturaMaxima },
        acabamentos: produto.acabamentos
          .filter((a) => marcados.has(a.acabamentoId))
          .map((a) => ({ id: a.acabamentoId, nome: a.acabamento.nome, tipoCobranca: a.acabamento.tipoCobranca, valor: a.acabamento.valor, custo: a.acabamento.custo })),
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- entrada é derivada dos estados abaixo
    [produto, empresa.data, quantidade, largura, altura, preco, marcados],
  )

  const entradaAtrasada = useDebounce(entrada, 400)
  const naApi = useQuery({
    queryKey: ['simulacao', produto.id, produto.updatedAt, entradaAtrasada],
    queryFn: ({ signal }) => produtosApi.simular(produto.id, entradaAtrasada, signal),
    enabled: noFront.ok,
    retry: false,
  })
  const conferem = naApi.data && naApi.data.total === noFront.total && JSON.stringify(entradaAtrasada) === JSON.stringify(entrada)
  const sufixo = MODO_CALCULO_SUFIXO[produto.modoCalculo]

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_380px]">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Dados da simulação</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {alteracoesPendentes && (
            <p className="flex items-center gap-2 rounded-xl bg-ambar/10 p-3 text-sm text-amber-800">
              <AlertTriangle className="h-4 w-4 shrink-0" /> Há alterações não salvas no produto. O simulador usa os dados já salvos.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <CampoFormulario id="sim-qtd" rotulo={produto.modoCalculo === 'hora' ? 'Horas' : 'Quantidade (peças)'}>
              <NumberInput id="sim-qtd" casas={produto.modoCalculo === 'hora' ? 2 : 0} value={quantidade} onChange={(e) => setQuantidade(e.target.value)} />
            </CampoFormulario>
            <CampoFormulario id="sim-preco" rotulo={`Preço / ${sufixo}`}>
              <MoneyInput id="sim-preco" value={preco} onChange={(e) => setPreco(e.target.value)} />
            </CampoFormulario>
            {(usaMedidas || produto.modoCalculo === 'metro_linear') && (
              <CampoFormulario id="sim-largura" rotulo={produto.modoCalculo === 'metro_linear' ? 'Comprimento' : 'Largura'}>
                <NumberInput id="sim-largura" casas={3} sufixo="m" value={largura} onChange={(e) => setLargura(e.target.value)} />
              </CampoFormulario>
            )}
            {usaMedidas && produto.modoCalculo !== 'metro_linear' && (
              <CampoFormulario id="sim-altura" rotulo="Altura">
                <NumberInput id="sim-altura" casas={3} sufixo="m" value={altura} onChange={(e) => setAltura(e.target.value)} />
              </CampoFormulario>
            )}
          </div>
          {produto.acabamentos.length > 0 && (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">Acabamentos</legend>
              {produto.acabamentos.map((a) => (
                <label key={a.acabamentoId} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={marcados.has(a.acabamentoId)}
                    disabled={a.obrigatorio}
                    onChange={(e) =>
                      setMarcados((m) => {
                        const n = new Set(m)
                        if (e.target.checked) n.add(a.acabamentoId)
                        else n.delete(a.acabamentoId)
                        return n
                      })
                    }
                  />
                  {a.acabamento.nome}
                  <span className="text-xs text-texto-secundario">{formatarMoeda(a.acabamento.valor)}</span>
                  {a.obrigatorio && <span className="rounded-full bg-accent px-2 text-xs text-grafite">obrigatório</span>}
                </label>
              ))}
            </fieldset>
          )}
        </CardContent>
      </Card>

      <div className="space-y-4">
        <ResumoPreco resultado={noFront} sufixo={sufixo} />
        <Card className={cn('p-4 text-sm', conferem ? 'bg-verde/10' : '')}>
          {!noFront.ok ? (
            <p className="text-texto-secundario">Corrija os dados para conferir na API.</p>
          ) : naApi.isFetching || !naApi.data ? (
            <p className="flex items-center gap-2 text-texto-secundario">
              <Loader2 className="h-4 w-4 animate-spin" /> Conferindo na API…
            </p>
          ) : naApi.isError ? (
            <p className="flex items-center gap-2 text-coral-escuro">
              <XCircle className="h-4 w-4" /> {(naApi.error as Error).message}
            </p>
          ) : conferem ? (
            <p className="flex items-center gap-2 font-medium text-green-800">
              <CheckCircle2 className="h-4 w-4" /> A API calculou o mesmo total: {formatarMoeda(naApi.data.total)}
            </p>
          ) : (
            <p className="flex items-center gap-2 text-coral-escuro">
              <XCircle className="h-4 w-4" /> API: {formatarMoeda(naApi.data.total)} — diferente do cálculo local.
            </p>
          )}
        </Card>
      </div>
    </div>
  )
}
