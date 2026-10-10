import { Link } from 'react-router-dom'
import { ExternalLink, Globe } from 'lucide-react'
import type { ProdutoVitrineResumo } from '@onprint/shared'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissoes } from '@/hooks/usePermission'
import { useProdutoVitrine, useVitrineConfig } from '../hooks'
import { useEditorVitrine } from '../useEditorVitrine'
import { BotaoSalvarVitrine, EditorProdutoVitrine } from './EditorProdutoVitrine'

/** Aba "Vitrine" do cadastro do produto: o mesmo editor do painel de Vitrine → Produtos. */
export function AbaVitrineProduto({ produtoId }: { produtoId: string }) {
  const consulta = useProdutoVitrine(produtoId)
  if (consulta.isPending) return <Skeleton className="h-96 w-full" />
  if (consulta.isError) return <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
  if (!consulta.produto) {
    return (
      <Card>
        <EmptyState
          icone={Globe}
          titulo="Este produto não pode ir para a vitrine"
          descricao="Só produtos e serviços ativos aparecem na vitrine. Ative o produto na aba Geral e salve."
        />
      </Card>
    )
  }
  return <Editor key={consulta.produto.id} produto={consulta.produto} />
}

function Editor({ produto }: { produto: ProdutoVitrineResumo }) {
  const pode = usePermissoes()
  const podeEditar = pode('vitrine', 'editar')
  const editor = useEditorVitrine(produto)
  const config = useVitrineConfig()
  const url = config.data && produto.publicado && produto.slug ? `${config.data.urlPublica.replace(/\/$/, '')}/produto/${produto.slug}` : null
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
      <Card>
        <CardContent className="p-5 sm:p-6">
          <EditorProdutoVitrine editor={editor} podeEditar={podeEditar} podeEditarFotos={podeEditar || pode('produtos', 'editar')} />
          {podeEditar && (
            <div className="mt-6 flex justify-end border-t border-border pt-5">
              <BotaoSalvarVitrine editor={editor} />
            </div>
          )}
        </CardContent>
      </Card>
      <aside className="space-y-3 text-sm">
        <Card className="p-5">
          <p className="font-semibold text-tinta">Na vitrine online</p>
          <p className="mt-1 text-texto-secundario">
            {produto.publicado ? 'Publicado: aparece no seu site.' : 'Rascunho: ainda não aparece no site.'}
          </p>
          {url && (
            <a href={url} target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-1.5 font-medium text-marca-escuro hover:underline">
              <ExternalLink className="h-4 w-4" /> Ver no site
            </a>
          )}
          <Link to="/vitrine/produtos" className="mt-3 block font-medium text-marca-escuro hover:underline">
            Todos os produtos na vitrine
          </Link>
        </Card>
      </aside>
    </div>
  )
}
