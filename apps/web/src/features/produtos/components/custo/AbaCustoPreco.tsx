import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Calculator, Layers, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { MODO_CALCULO_SUFIXO, composicaoProdutoSchema, formatarMoeda, type ComposicaoProdutoDetalhe, type Maquina, type ModoCusto, type Processo } from '@onprint/shared'
import { composicaoApi } from '@/api/custos'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { useComposicao, useMaquinasOpcoes, useProcessosOpcoes } from '../../hooks'
import { BlocoMateriais } from './BlocoMateriais'
import { BlocoExtras, BlocoProducao } from './BlocoProducao'
import { ResumoCusto } from './ResumoCusto'
import { CartaoOpcao, Dica, Secao } from './Secao'
import { assinatura, baseSugerida, calcular, dadosDaProducao, estadoDoDetalhe, notaReferencia, paraEnvio, type EstadoComposicao } from './estadoComposicao'

const NIVEIS: { modo: ModoCusto; icone: typeof Calculator; titulo: string; descricao: string }[] = [
  { modo: 'simples', icone: Calculator, titulo: 'Sei meu custo', descricao: 'Digite quanto custa produzir. Rápido: o sistema calcula o preço e o lucro.' },
  { modo: 'composicao', icone: Layers, titulo: 'Montar a composição', descricao: 'Escolha os materiais e o tempo de produção. O custo acompanha o preço dos insumos.' },
]

interface EditorProps {
  inicial: ComposicaoProdutoDetalhe
  processos: Processo[]
  maquinas: Maquina[]
  editavel: boolean
  geralPendente: boolean
}

function Editor({ inicial, processos, maquinas, editavel, geralPendente }: EditorProps) {
  const queryClient = useQueryClient()
  const [detalhe, setDetalhe] = useState(inicial)
  const [estado, setEstado] = useState(() => estadoDoDetalhe(inicial))
  const [salvo, setSalvo] = useState(() => assinatura(estadoDoDetalhe(inicial)))
  const [salvando, setSalvando] = useState(false)

  const dados = estado.producao.map((l) => dadosDaProducao(l, processos, maquinas, detalhe))
  const vivo = calcular(estado, detalhe, dados)
  const alterado = assinatura(estado) !== salvo
  // Sem alterações, vale o que o servidor calculou e gravou
  const resultado = alterado
    ? vivo
    : { ...vivo, custo: estado.modoCusto === 'composicao' ? detalhe.referencia.porUnidade : vivo.custo, analise: detalhe.analise, sugerido: detalhe.precoSugerido ?? vivo.sugerido }
  const unidade = MODO_CALCULO_SUFIXO[detalhe.modoCalculo]
  const base = baseSugerida(detalhe.modoCalculo)
  const composicao = estado.modoCusto === 'composicao'
  const mudar = (d: Partial<EstadoComposicao>) => setEstado((e) => ({ ...e, ...d }))

  async function salvar() {
    if (estado.materiais.some((m) => !m.insumoId)) return toast.error('Escolha o material em todas as linhas (ou remova as vazias).')
    if (estado.producao.some((p) => !p.processoId)) return toast.error('Escolha a etapa em todas as linhas de produção (ou remova as vazias).')
    const corpo = paraEnvio(estado)
    const validacao = composicaoProdutoSchema.safeParse(corpo)
    if (!validacao.success) {
      const erro = validacao.error.issues[0]
      return toast.error(erro ? `${erro.message}${erro.path.length > 1 ? ` (${String(erro.path[0])}, linha ${Number(erro.path[1]) + 1})` : ''}` : 'Verifique os campos.')
    }
    setSalvando(true)
    try {
      const novo = await composicaoApi.salvar(detalhe.produtoId, corpo)
      const e = estadoDoDetalhe(novo)
      setDetalhe(novo)
      setEstado(e)
      setSalvo(assinatura(e))
      queryClient.setQueryData(['produtos', 'composicao', detalhe.produtoId], novo)
      await Promise.all([queryClient.invalidateQueries({ queryKey: ['produtos'] }), queryClient.invalidateQueries({ queryKey: ['insumos'] })])
      toast.success('Custo e preço salvos.')
    } catch (erro) {
      toast.error((erro as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const custoAtual = Number(vivo.custo)
  const custoComposicao = Number(vivo.custoComposicao)
  const temMateriais = estado.materiais.length > 0 || estado.producao.length > 0

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22.5rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {geralPendente && (
          <p className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm text-amber-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> Você alterou a aba Geral. Salve-a para o custo usar a nova forma de cobrança e as medidas.
          </p>
        )}

        <div role="radiogroup" aria-label="Como calcular o custo" className="grid gap-3 sm:grid-cols-2">
          {NIVEIS.map((n) => (
            <CartaoOpcao key={n.modo} className="p-4" marcado={estado.modoCusto === n.modo} onClick={() => mudar({ modoCusto: n.modo })} icone={n.icone} titulo={n.titulo} descricao={n.descricao} desabilitado={!editavel} />
          ))}
        </div>

        {!composicao && (
          <>
            {temMateriais && (
              <div className="flex flex-col gap-3 rounded-3xl bg-marca-suave p-5 sm:flex-row sm:items-center">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-marca text-marca-contraste">
                  <Sparkles className="h-5 w-5" aria-hidden="true" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-tinta">Você já cadastrou os materiais — ative a composição</p>
                  <p className="text-sm text-texto-secundario">
                    Pela composição, o custo seria <strong className="text-tinta">{formatarMoeda(custoComposicao)} / {unidade}</strong>
                    {custoAtual > 0 && (
                      <>
                        {' '}
                        (hoje: {formatarMoeda(custoAtual)}; {custoComposicao >= custoAtual ? '+' : '−'}
                        {formatarMoeda(Math.abs(custoComposicao - custoAtual))})
                      </>
                    )}
                    . E passa a acompanhar o preço dos insumos.
                  </p>
                </div>
                {editavel && (
                  <Button type="button" onClick={() => mudar({ modoCusto: 'composicao' })}>
                    Ativar a composição
                  </Button>
                )}
              </div>
            )}
            <Secao icone={Calculator} titulo="Seu custo" descricao="Some material, tempo de máquina e mão de obra. Impostos e comissão entram depois, no preço.">
              <div className="max-w-xs">
                <CampoFormulario id="cp-custo" rotulo={`Quanto custa produzir 1 ${unidade}?`}>
                  <NumberInput id="cp-custo" casas={4} sufixo="R$" value={estado.custoManual} placeholder="0,00" disabled={!editavel} onChange={(e) => mudar({ custoManual: e.target.value })} />
                </CampoFormulario>
                <Dica>Não sabe? Escolha “Montar a composição” e o sistema calcula para você.</Dica>
              </div>
            </Secao>
          </>
        )}

        {composicao && (
          <>
            <BlocoMateriais linhas={estado.materiais} custos={vivo.linhas.materiais} unidadeProduto={unidade} baseNova={base} produtoId={detalhe.produtoId} editavel={editavel} onChange={(materiais) => mudar({ materiais })} />
            <BlocoProducao
              linhas={estado.producao}
              dados={dados}
              custos={vivo.linhas.producao}
              processos={processos}
              maquinas={maquinas}
              unidadeProduto={unidade}
              baseNova={base === 'por_m2' ? 'por_m2' : base === 'por_metro_linear' ? 'por_metro_linear' : 'por_unidade'}
              editavel={editavel}
              onChange={(producao) => mudar({ producao })}
            />
            <BlocoExtras linhas={estado.extras} custos={vivo.linhas.extras} unidadeProduto={unidade} editavel={editavel} onChange={(extras) => mudar({ extras })} />
          </>
        )}
      </div>

      <div className="lg:sticky lg:top-20">
        <ResumoCusto
          estado={estado}
          resultado={resultado}
          parametros={detalhe.parametros}
          nota={notaReferencia(detalhe)}
          editavel={editavel}
          alterado={alterado}
          salvando={salvando}
          onChange={mudar}
          onSalvar={() => void salvar()}
        />
      </div>
    </div>
  )
}

/** Aba "Custo e preço" do produto: nível (simples/composição), composição e resumo ao vivo. Um Salvar só. */
export function AbaCustoPreco({ produtoId, podeEditar, geralPendente }: { produtoId: string; podeEditar: boolean; geralPendente: boolean }) {
  const consulta = useComposicao(produtoId)
  const processos = useProcessosOpcoes()
  const maquinas = useMaquinasOpcoes()
  if (consulta.isPending) return <Skeleton className="h-96 w-full rounded-3xl" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
  const d = consulta.data
  // Mudou a forma de cobrança/medidas (aba Geral salva): recomeça com o detalhe novo
  return <Editor key={`${produtoId}-${d.modoCalculo}-${d.larguraPadrao}-${d.alturaPadrao}`} inicial={consulta.data} processos={processos.data ?? []} maquinas={maquinas.data ?? []} editavel={podeEditar} geralPendente={geralPendente} />
}
