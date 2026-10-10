import { Link, useNavigate, useParams } from 'react-router-dom'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { formatarDataHora } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { Anexos } from '@/components/shared/Anexos'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission } from '@/hooks/usePermission'
import { useEnviarCatalogo } from '@/features/vitrine/useEnviarCatalogo'
import { ClienteForm } from '../components/ClienteForm'
import { ContatosTab } from '../components/ContatosTab'
import { EnderecosTab } from '../components/EnderecosTab'
import { FinanceiroDoCliente } from '../components/FinanceiroDoCliente'
import { OrcamentosDoCliente } from '../components/OrcamentosDoCliente'
import { PedidosDoCliente } from '../components/PedidosDoCliente'
import { useCliente } from '../hooks'


/** Ficha do cliente (/clientes/:id) e cadastro novo (/clientes/novo). */
export function ClienteFichaPage() {
  const { id } = useParams()
  const novo = !id || id === 'novo'
  const navigate = useNavigate()
  const consulta = useCliente(novo ? undefined : id)
  const podeFinanceiro = usePermission('financeiro')
  const catalogo = useEnviarCatalogo()

  const voltar = (
    <Button asChild variant="outline">
      <Link to="/clientes">
        <ArrowLeft /> Clientes
      </Link>
    </Button>
  )

  if (novo) {
    return (
      <>
        <PageHeader titulo="Novo cliente" subtitulo="Endereços, contatos e anexos ficam disponíveis após salvar." acoes={voltar} />
        <ClienteForm onSalvo={(c) => navigate(`/clientes/${c.id}`, { replace: true })} />
      </>
    )
  }

  if (consulta.isPending) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    )
  }
  if (consulta.isError) {
    return (
      <Card>
        <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
      </Card>
    )
  }

  const cliente = consulta.data
  return (
    <>
      <PageHeader
        titulo={cliente.nome}
        subtitulo={
          <span className="flex flex-wrap items-center gap-2">
            <StatusBadge entidade="cliente" codigo={cliente.situacao} />
            {!cliente.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Desativado</span>}
            <span>Atualizado em {formatarDataHora(cliente.updatedAt)}</span>
          </span>
        }
        acoes={
          <>
            {catalogo.disponivel && (cliente.whatsapp || cliente.telefone) && (
              <Button type="button" variant="outline" onClick={() => catalogo.enviar(cliente)}>
                <BookOpen /> Enviar catálogo
              </Button>
            )}
            {voltar}
          </>
        }
      />
      <Tabs defaultValue="dados">
        <TabsList>
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="enderecos">Endereços ({cliente.enderecos.length})</TabsTrigger>
          <TabsTrigger value="contatos">Contatos ({cliente.contatos.length})</TabsTrigger>
          <TabsTrigger value="orcamentos">Orçamentos</TabsTrigger>
          <TabsTrigger value="pedidos">Pedidos</TabsTrigger>
          {podeFinanceiro && <TabsTrigger value="financeiro">Financeiro</TabsTrigger>}
          <TabsTrigger value="anexos">Anexos</TabsTrigger>
        </TabsList>
        <TabsContent value="dados">
          <ClienteForm key={cliente.updatedAt} cliente={cliente} onSalvo={() => void consulta.refetch()} />
        </TabsContent>
        <TabsContent value="enderecos">
          <EnderecosTab cliente={cliente} />
        </TabsContent>
        <TabsContent value="contatos">
          <ContatosTab cliente={cliente} />
        </TabsContent>
        <TabsContent value="orcamentos">
          <OrcamentosDoCliente clienteId={cliente.id} />
        </TabsContent>
        <TabsContent value="pedidos">
          <PedidosDoCliente clienteId={cliente.id} />
        </TabsContent>
        {podeFinanceiro && (
          <TabsContent value="financeiro">
            <FinanceiroDoCliente clienteId={cliente.id} />
          </TabsContent>
        )}
        <TabsContent value="anexos">
          <Anexos entidade="cliente" entidadeId={cliente.id} modulo="clientes" />
        </TabsContent>
      </Tabs>
    </>
  )
}
