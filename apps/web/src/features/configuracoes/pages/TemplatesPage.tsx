import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, MessageSquareText, Pencil, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { CATEGORIAS_TEMPLATE, CATEGORIA_TEMPLATE_ROTULOS, type MensagemTemplate } from '@onprint/shared'
import { templatesApi } from '@/api/configuracoes'
import { messagingProvider } from '@/integrations/messaging'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { Can } from '@/components/shared/Can'
import { ConfirmDialog } from '@/components/shared/ConfirmDialog'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissoes } from '@/hooks/usePermission'
import { TemplateDialog } from '../components/TemplateDialog'

export function TemplatesPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pode = usePermissoes()
  const queryClient = useQueryClient()
  const consulta = useQuery({ queryKey: ['templates'], queryFn: templatesApi.listar })
  const [editando, setEditando] = useState<MensagemTemplate | null>(null)
  const [removendo, setRemovendo] = useState<MensagemTemplate | null>(null)
  const criando = pathname.endsWith('/novo')
  const remover = useMutation({
    mutationFn: (id: string) => templatesApi.remover(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  })

  async function copiar(t: MensagemTemplate) {
    await messagingProvider.enviar({ texto: t.conteudo })
    toast.success('Texto copiado. As variáveis são preenchidas automaticamente nos orçamentos e pedidos.')
  }

  return (
    <>
      <PageHeader
        titulo="Templates de mensagens"
        subtitulo="Textos usados no botão “Copiar mensagem” para colar no WhatsApp."
        acoes={
          <Can modulo="configuracoes" acao="criar">
            <Button onClick={() => navigate('/configuracoes/templates/novo')}>
              <Plus /> Novo template
            </Button>
          </Can>
        }
      />
      {consulta.isPending ? (
        <Skeleton className="h-64 w-full" />
      ) : consulta.isError ? (
        <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
      ) : consulta.data.length === 0 ? (
        <Card><EmptyState icone={MessageSquareText} titulo="Nenhum template" /></Card>
      ) : (
        <div className="space-y-6">
          {CATEGORIAS_TEMPLATE.map((categoria) => {
            const itens = consulta.data.filter((t) => t.categoria === categoria)
            if (!itens.length) return null
            return (
              <section key={categoria}>
                <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-texto-secundario">{CATEGORIA_TEMPLATE_ROTULOS[categoria]}</h2>
                <div className="grid gap-4 md:grid-cols-2">
                  {itens.map((t) => (
                    <Card key={t.id} className="flex flex-col p-5">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-semibold text-tinta">{t.nome}</h3>
                        {!t.ativo && <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs">Inativo</span>}
                      </div>
                      <p className="mt-2 line-clamp-4 flex-1 whitespace-pre-wrap text-sm text-texto-secundario">{t.conteudo}</p>
                      <div className="mt-3 flex justify-end gap-1">
                        <AcaoIcone icone={Copy} rotulo="Copiar texto" onClick={() => void copiar(t)} />
                        {pode('configuracoes', 'editar') && <AcaoIcone icone={Pencil} rotulo="Editar" onClick={() => setEditando(t)} />}
                        {pode('configuracoes', 'excluir') && <AcaoIcone icone={Trash2} rotulo="Excluir" perigo onClick={() => setRemovendo(t)} />}
                      </div>
                    </Card>
                  ))}
                </div>
              </section>
            )
          })}
        </div>
      )}

      {(criando || editando) && (
        <TemplateDialog
          template={editando ?? undefined}
          onFechar={() => {
            setEditando(null)
            if (criando) navigate('/configuracoes/templates', { replace: true })
          }}
        />
      )}
      <ConfirmDialog
        aberto={Boolean(removendo)}
        onAbertoChange={(v) => !v && setRemovendo(null)}
        titulo="Excluir template"
        descricao={<>O template <strong>{removendo?.nome}</strong> será excluído.</>}
        textoConfirmar="Excluir"
        perigoso
        onConfirmar={() => remover.mutateAsync(removendo!.id)}
      />
    </>
  )
}
