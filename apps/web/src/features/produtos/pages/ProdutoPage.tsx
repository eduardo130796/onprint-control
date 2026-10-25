import { Suspense, lazy, useEffect, useState } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { TIPO_PRODUTO_ROTULOS, produtoSchema, type ProdutoDetalhe, type ProdutoInput, type ProdutoSugerido } from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResumoEstoqueProduto } from '@/features/estoque/components/KardexDialog'
import { useAjudaLiberada } from '@/features/assistente/useAssistente'
import { usePermission } from '@/hooks/usePermission'
import { useCategorias, useMutacao, useProduto, useUnidades } from '../hooks'
import { AbaEstoque } from '../components/produto/AbaEstoque'
import { AbaGeral } from '../components/produto/AbaGeral'
import { AcabamentosEditor } from '../components/produto/AcabamentosEditor'
import { SimuladorPreco } from '../components/produto/SimuladorPreco'
import { AbaCustoPreco } from '../components/custo/AbaCustoPreco'
import { temSugestaoCusto } from '../components/custo/estadoComposicao'
import { ABA_DO_CAMPO, semPrecoECusto, valoresProduto, type ProdutoSaida } from '../components/produto/formProduto'
import { PreencherComAssistente } from '../components/produto/PreencherComAssistente'

/** Estado da navegação depois de cadastrar: o que o Assistente sugeriu e ainda falta conferir (custo, acabamentos) */
interface EstadoNavegacao {
  sugestaoAssistente?: ProdutoSugerido
}

// Aba "Vitrine" (módulo vitrine): carregada só quando aberta (traz o arrastar e soltar da galeria)
const AbaVitrineProduto = lazy(() => import('@/features/vitrine/components/AbaVitrineProduto').then((m) => ({ default: m.AbaVitrineProduto })))

function Formulario({ produto, sugestaoInicial }: { produto?: ProdutoDetalhe; sugestaoInicial?: ProdutoSugerido | null }) {
  const navigate = useNavigate()
  const podeSalvar = usePermission('produtos', produto ? 'editar' : 'criar')
  const veCustos = usePermission('produtos', 'editar')
  const podeVerEstoque = usePermission('estoque')
  const veVitrine = usePermission('vitrine')
  // ?aba=custo abre direto na aba (links do reajuste e do insumo)
  const [params] = useSearchParams()
  const [aba, setAba] = useState(() => (produto && params.get('aba')) || 'geral')
  // A aba "Custo e preço" fica montada depois da primeira visita (não perde o que foi digitado ao trocar de aba)
  const [custoVisitado, setCustoVisitado] = useState(aba === 'custo')
  const form = useForm<ProdutoInput, unknown, ProdutoSaida>({ resolver: zodResolver(produtoSchema), defaultValues: valoresProduto(produto) })
  // Na edição, preço e custo não vão: quem cuida deles é a aba "Custo e preço"
  const salvar = useMutacao(['produtos'], (d: ProdutoSaida) => (produto ? produtosApi.atualizar(produto.id, semPrecoECusto(d)) : produtosApi.criar(d)))
  const { isDirty } = form.formState

  // Assistente GrafyGo: campos preenchidos por ele (selo até a pessoa mexer ou salvar) e o resto da sugestão
  // (materiais, etapas, acabamentos), que as abas mostram para conferir
  const assistenteLiberado = useAjudaLiberada('produtos')
  const [sugestao, setSugestao] = useState<ProdutoSugerido | null>(sugestaoInicial ?? null)
  const [sugeridos, setSugeridos] = useState<Set<string>>(() => new Set())
  useEffect(() => {
    // Só a digitação tira o selo (o preenchimento pelo Assistente chega sem "type")
    const assinatura = form.watch((_valores, { name, type }) => {
      if (type === 'change' && name) setSugeridos((s) => (s.has(name) ? new Set([...s].filter((c) => c !== name)) : s))
    })
    return () => assinatura.unsubscribe()
  }, [form])
  // A sugestão veio pela navegação (produto recém-cadastrado): fica no estado da tela; recarregar não a traz de volta
  const location = useLocation()
  useEffect(() => {
    if (sugestaoInicial) navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
    // Só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onSubmit = form.handleSubmit(
    async (dados) => {
      try {
        const salvo = await salvar.mutateAsync(dados)
        toast.success(produto ? 'Produto atualizado.' : `Produto ${salvo.codigo} cadastrado.`)
        setSugeridos(new Set())
        if (produto) form.reset(valoresProduto(salvo))
        // O que o Assistente sugeriu para o custo e os acabamentos segue para as abas do produto cadastrado
        else navigate(`/produtos/${salvo.id}`, { replace: true, state: sugestao ? ({ sugestaoAssistente: sugestao } satisfies EstadoNavegacao) : undefined })
      } catch (e) {
        toast.error((e as Error).message)
      }
    },
    // Leva o usuário à aba do primeiro campo com erro
    (erros) => {
      const campo = Object.keys(erros)[0]
      if (campo && ABA_DO_CAMPO[campo]) setAba(ABA_DO_CAMPO[campo])
      toast.error('Verifique os campos destacados.')
    },
  )

  // Custo e preço só para quem vê custos (quem edita produtos)
  const abas = [
    ...(veCustos ? [{ valor: 'custo', titulo: 'Custo e preço' }] : []),
    { valor: 'acabamentos', titulo: 'Acabamentos' },
    { valor: 'simulador', titulo: 'Simulador de preço' },
    ...(veVitrine ? [{ valor: 'vitrine', titulo: 'Vitrine' }] : []),
  ]

  // Todas as abas do formulário ficam montadas (só escondidas) para manter os campos registrados
  const conteudo = 'pt-6 data-[state=inactive]:hidden'

  return (
    <Tabs
      value={aba}
      onValueChange={(v) => {
        setAba(v)
        if (v === 'custo') setCustoVisitado(true)
      }}
    >
      <TabsList>
        <TabsTrigger value="geral">Geral</TabsTrigger>
        {abas.map((a) => (
          <TabsTrigger key={a.valor} value={a.valor} disabled={!produto} title={produto ? undefined : 'Disponível após salvar'}>
            {a.titulo}
          </TabsTrigger>
        ))}
        <TabsTrigger value="estoque">Estoque</TabsTrigger>
      </TabsList>

      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!podeSalvar || salvar.isPending}>
          <TabsContent value="geral" forceMount className={conteudo}>
            {assistenteLiberado && podeSalvar && (
              <div className="mb-6">
                <PreencherComAssistente
                  form={form}
                  salvo={Boolean(produto)}
                  onSugestao={(s, campos) => {
                    setSugestao(s)
                    setSugeridos(new Set(campos))
                  }}
                />
              </div>
            )}
            {produto && sugestao && (temSugestaoCusto(sugestao) || sugestao.acabamentos.length > 0) && (
              <p className="mb-4 rounded-xl bg-marca-suave p-3 text-sm text-marca-escuro">
                O Assistente também sugeriu materiais, etapas ou acabamentos: confira nas abas “Custo e preço” e “Acabamentos”.
              </p>
            )}
            <AbaGeral form={form} produto={produto} podeEditar={podeSalvar} sugeridos={sugeridos} />
          </TabsContent>
          <TabsContent value="estoque" forceMount className={conteudo}>
            <AbaEstoque form={form} siglaUnidade={produto?.unidadeMedida?.sigla} />
          </TabsContent>
        </fieldset>
        {podeSalvar && ['geral', 'estoque'].includes(aba) && (
          <div className="mt-6 flex justify-end">
            <Button type="submit" disabled={salvar.isPending || (Boolean(produto) && !isDirty)}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
              {produto ? 'Salvar alterações' : 'Cadastrar produto'}
            </Button>
          </div>
        )}
      </form>

      {/* Saldo e extrato ficam fora do formulário (os botões do extrato não enviam o cadastro) */}
      {aba === 'estoque' && produto?.controlaEstoque && podeVerEstoque && (
        <Card className="mt-4 p-6">
          <ResumoEstoqueProduto produtoId={produto.id} />
        </Card>
      )}

      {produto && (
        <>
          {veCustos && custoVisitado && (
            <TabsContent value="custo" forceMount className="pt-6 data-[state=inactive]:hidden">
              <AbaCustoPreco
                produtoId={produto.id}
                podeEditar={podeSalvar}
                geralPendente={isDirty}
                sugestao={sugestao}
                onSugestaoAplicada={() => setSugestao((s) => (s ? { ...s, insumos: [], processos: [], margem: null } : s))}
              />
            </TabsContent>
          )}
          <TabsContent value="acabamentos">
            <AcabamentosEditor
              key={`${produto.updatedAt}-${sugestao?.acabamentos.length ?? 0}`}
              produto={produto}
              podeEditar={podeSalvar}
              sugeridos={sugestao?.acabamentos.map((a) => a.id)}
              onSalvo={() => setSugestao((s) => (s ? { ...s, acabamentos: [] } : s))}
            />
          </TabsContent>
          <TabsContent value="simulador">
            <SimuladorPreco produto={produto} alteracoesPendentes={isDirty} />
          </TabsContent>
          {veVitrine && (
            <TabsContent value="vitrine">
              <Suspense fallback={<Skeleton className="h-96 w-full" />}>
                <AbaVitrineProduto produtoId={produto.id} />
              </Suspense>
            </TabsContent>
          )}
        </>
      )}
    </Tabs>
  )
}

/** Cadastro (/produtos/novo) e edição (/produtos/:id) de produtos e serviços. */
export function ProdutoPage() {
  const { id } = useParams()
  const novo = !id || id === 'novo'
  const consulta = useProduto(novo ? undefined : id)
  const sugestaoAssistente = (useLocation().state as EstadoNavegacao | null)?.sugestaoAssistente ?? null
  // Os selects (categoria, unidade) precisam das opções antes de montar o formulário, senão perdem o valor salvo
  const unidades = useUnidades()
  const categorias = useCategorias('true')
  const listasProntas = !unidades.isPending && !categorias.isPending
  const voltar = (
    <Button asChild variant="outline">
      <Link to="/produtos">
        <ArrowLeft /> Produtos
      </Link>
    </Button>
  )

  if (novo) {
    return (
      <>
        <PageHeader titulo="Novo produto ou serviço" subtitulo="Custo e preço, acabamentos e simulador ficam disponíveis após salvar." acoes={voltar} />
        {listasProntas ? <Formulario /> : <Skeleton className="h-96 w-full" />}
      </>
    )
  }
  if (consulta.isPending || !listasProntas) return <Skeleton className="h-96 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>

  const p = consulta.data
  // Insumo tem tela própria
  if (p.tipo === 'insumo') return <Navigate to={`/produtos/insumos/${p.id}`} replace />
  return (
    <>
      <PageHeader
        titulo={p.nome}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono">{p.codigo}</span>· {TIPO_PRODUTO_ROTULOS[p.tipo]}
            {p.categoria && <>· {p.categoria.nome}</>}
            {!p.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Desativado</span>}
          </span>
        }
        acoes={voltar}
      />
      <Formulario key={p.id} produto={p} sugestaoInicial={sugestaoAssistente} />
    </>
  )
}
