import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { ArrowLeft, Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'
import { TIPO_PRODUTO_ROTULOS, produtoSchema, type ProdutoDetalhe, type ProdutoInput } from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ResumoEstoqueProduto } from '@/features/estoque/components/KardexDialog'
import { usePermission } from '@/hooks/usePermission'
import { useMutacao, useProduto } from '../hooks'
import { AbaEstoque } from '../components/produto/AbaEstoque'
import { AbaGeral } from '../components/produto/AbaGeral'
import { AbaPreco } from '../components/produto/AbaPreco'
import { AcabamentosEditor } from '../components/produto/AcabamentosEditor'
import { FichaTecnicaEditor } from '../components/produto/FichaTecnicaEditor'
import { ProcessosEditor } from '../components/produto/ProcessosEditor'
import { SimuladorPreco } from '../components/produto/SimuladorPreco'
import { ABA_DO_CAMPO, valoresProduto, type ProdutoSaida } from '../components/produto/formProduto'

/** Abas que dependem do produto já salvo */
const ABAS_COMPOSICAO = [
  { valor: 'acabamentos', titulo: 'Acabamentos' },
  { valor: 'ficha', titulo: 'Ficha técnica' },
  { valor: 'processos', titulo: 'Processos' },
  { valor: 'simulador', titulo: 'Simulador de preço' },
] as const

function Formulario({ produto }: { produto?: ProdutoDetalhe }) {
  const navigate = useNavigate()
  const podeSalvar = usePermission('produtos', produto ? 'editar' : 'criar')
  const veCustos = usePermission('produtos', 'editar')
  const podeVerEstoque = usePermission('estoque')
  const [aba, setAba] = useState('geral')
  const form = useForm<ProdutoInput, unknown, ProdutoSaida>({ resolver: zodResolver(produtoSchema), defaultValues: valoresProduto(produto) })
  const salvar = useMutacao(['produtos'], (d: ProdutoSaida) => (produto ? produtosApi.atualizar(produto.id, d) : produtosApi.criar(d)))
  const { isDirty } = form.formState

  const onSubmit = form.handleSubmit(
    async (dados) => {
      try {
        const salvo = await salvar.mutateAsync(dados)
        toast.success(produto ? 'Produto atualizado.' : `Produto ${salvo.codigo} cadastrado.`)
        if (produto) form.reset(valoresProduto(salvo))
        else navigate(`/produtos/${salvo.id}`, { replace: true })
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

  // Todas as abas do formulário ficam montadas (só escondidas) para manter os campos registrados
  const conteudo = 'pt-6 data-[state=inactive]:hidden'

  return (
    <Tabs value={aba} onValueChange={setAba}>
      <TabsList>
        <TabsTrigger value="geral">Geral</TabsTrigger>
        <TabsTrigger value="preco">Preço e cálculo</TabsTrigger>
        {ABAS_COMPOSICAO.map((a) => (
          <TabsTrigger key={a.valor} value={a.valor} disabled={!produto} title={produto ? undefined : 'Disponível após salvar'}>
            {a.titulo}
          </TabsTrigger>
        ))}
        <TabsTrigger value="estoque">Estoque</TabsTrigger>
      </TabsList>

      <form onSubmit={onSubmit} noValidate>
        <fieldset disabled={!podeSalvar || salvar.isPending}>
          <TabsContent value="geral" forceMount className={conteudo}>
            <AbaGeral form={form} produto={produto} podeEditar={podeSalvar} />
          </TabsContent>
          <TabsContent value="preco" forceMount className={conteudo}>
            <AbaPreco form={form} veCustos={veCustos} />
          </TabsContent>
          <TabsContent value="estoque" forceMount className={conteudo}>
            <AbaEstoque form={form} siglaUnidade={produto?.unidadeMedida?.sigla} />
          </TabsContent>
        </fieldset>
        {podeSalvar && ['geral', 'preco', 'estoque'].includes(aba) && (
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
          <TabsContent value="acabamentos">
            <AcabamentosEditor key={produto.updatedAt} produto={produto} podeEditar={podeSalvar} />
          </TabsContent>
          <TabsContent value="ficha">
            <FichaTecnicaEditor key={produto.updatedAt} produto={produto} podeEditar={podeSalvar} veCustos={veCustos} />
          </TabsContent>
          <TabsContent value="processos">
            <ProcessosEditor key={produto.updatedAt} produto={produto} podeEditar={podeSalvar} />
          </TabsContent>
          <TabsContent value="simulador">
            <SimuladorPreco produto={produto} alteracoesPendentes={isDirty} />
          </TabsContent>
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
        <PageHeader titulo="Novo produto ou serviço" subtitulo="Acabamentos, ficha técnica, processos e simulador ficam disponíveis após salvar." acoes={voltar} />
        <Formulario />
      </>
    )
  }
  if (consulta.isPending) return <Skeleton className="h-96 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>

  const p = consulta.data
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
      <Formulario key={p.id} produto={p} />
    </>
  )
}
