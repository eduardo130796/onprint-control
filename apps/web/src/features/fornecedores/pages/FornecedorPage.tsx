import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, PackageOpen, Receipt } from 'lucide-react'
import { PageHeader } from '@/components/layout/PageHeader'
import { Anexos } from '@/components/shared/Anexos'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { FornecedorForm } from '../components/FornecedorForm'
import { useFornecedor } from '../hooks'

/** Detalhe (/fornecedores/:id) e cadastro novo (/fornecedores/novo). */
export function FornecedorPage() {
  const { id } = useParams()
  const novo = !id || id === 'novo'
  const navigate = useNavigate()
  const consulta = useFornecedor(novo ? undefined : id)

  const voltar = (
    <Button asChild variant="outline">
      <Link to="/fornecedores">
        <ArrowLeft /> Fornecedores
      </Link>
    </Button>
  )

  if (novo) {
    return (
      <>
        <PageHeader titulo="Novo fornecedor" acoes={voltar} />
        <FornecedorForm onSalvo={(f) => navigate(`/fornecedores/${f.id}`, { replace: true })} />
      </>
    )
  }
  if (consulta.isPending) return <Skeleton className="h-64 w-full" />
  if (consulta.isError) {
    return (
      <Card>
        <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
      </Card>
    )
  }

  const f = consulta.data
  return (
    <>
      <PageHeader titulo={f.nome} subtitulo={f.ativo ? f.categoriaFornecimento : 'Fornecedor desativado'} acoes={voltar} />
      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="entradas">Entradas de estoque</TabsTrigger>
          <TabsTrigger value="contas">Contas a pagar</TabsTrigger>
          <TabsTrigger value="anexos">Anexos</TabsTrigger>
        </TabsList>
        <TabsContent value="dados">
          <FornecedorForm key={f.updatedAt} fornecedor={f} onSalvo={() => void consulta.refetch()} />
        </TabsContent>
        <TabsContent value="entradas">
          <Card>
            <EmptyState icone={PackageOpen} titulo="Histórico de entradas" descricao="As entradas de estoque deste fornecedor aparecem aqui a partir da Fase 5." />
          </Card>
        </TabsContent>
        <TabsContent value="contas">
          <Card>
            <EmptyState icone={Receipt} titulo="Contas a pagar" descricao="Os títulos deste fornecedor aparecem aqui a partir da Fase 6." />
          </Card>
        </TabsContent>
        <TabsContent value="anexos">
          <Anexos entidade="fornecedor" entidadeId={f.id} modulo="fornecedores" />
        </TabsContent>
      </Tabs>
    </>
  )
}
