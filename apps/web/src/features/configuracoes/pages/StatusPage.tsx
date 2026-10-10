import { useState } from 'react'
import { Info, Plus } from 'lucide-react'
import { ENTIDADES_COM_STATUS_PROPRIO, ENTIDADES_STATUS, ENTIDADE_STATUS_ROTULOS, type EntidadeComStatusProprio, type EntidadeStatus } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermissoes } from '@/hooks/usePermission'
import { useStatusConfig } from '@/hooks/useStatusConfig'
import { ordenarStatus } from '@/lib/colunasStatus'
import { LinhaStatus } from '../components/LinhaStatus'
import { NovoStatusDialog } from '../components/NovoStatusDialog'

const comQuadro = (e: EntidadeStatus): e is EntidadeComStatusProprio => (ENTIDADES_COM_STATUS_PROPRIO as readonly string[]).includes(e)

/**
 * Status do sistema: nome, cor e ordem de todos; nas telas com kanban (orçamentos, pedidos, produção)
 * também criar/excluir status próprios (que contam como um do sistema) e ocultar colunas.
 */
export function StatusPage() {
  const consulta = useStatusConfig()
  const pode = usePermissoes()
  const podeEditar = pode('configuracoes', 'editar')
  const [novo, setNovo] = useState<EntidadeComStatusProprio | null>(null)

  return (
    <>
      <PageHeader titulo="Status do sistema" subtitulo="Nomes, cores e ordem dos status. Nos quadros (orçamentos, pedidos e produção), crie colunas próprias e oculte as que não usa." />
      {consulta.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <Tabs defaultValue="orcamento">
          <TabsList className="flex-wrap">
            {ENTIDADES_STATUS.map((e) => (
              <TabsTrigger key={e} value={e}>
                {ENTIDADE_STATUS_ROTULOS[e]}
              </TabsTrigger>
            ))}
          </TabsList>
          {ENTIDADES_STATUS.map((entidade) => {
            const lista = ordenarStatus(consulta.data.filter((s) => s.entidade === entidade))
            const quadro = comQuadro(entidade)
            return (
              <TabsContent key={entidade} value={entidade} className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <p className="flex max-w-3xl items-start gap-2 text-sm text-texto-secundario">
                    <Info className="mt-0.5 h-4 w-4 shrink-0" />
                    {quadro
                      ? 'Os status do sistema não podem ser excluídos (as regras automáticas dependem deles), mas podem ser renomeados, reordenados e ocultados. Status próprios viram colunas no kanban e “contam como” um status do sistema; excluir um deles devolve os registros para a coluna da base.'
                      : 'Estes status são definidos pelas regras do sistema: dá para mudar o nome, a cor e a ordem em que aparecem.'}
                  </p>
                  {quadro && pode('configuracoes', 'criar') && (
                    <Button onClick={() => setNovo(entidade)}>
                      <Plus /> Novo status
                    </Button>
                  )}
                </div>
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[51.25rem] text-sm">
                    <thead className="bg-fundo/60 text-left text-xs uppercase tracking-wide text-texto-secundario">
                      <tr>
                        <th className="px-4 py-3 font-medium">Status</th>
                        <th className="px-4 py-3 font-medium">Cor</th>
                        <th className="px-4 py-3 font-medium">Ordem</th>
                        {quadro && <th className="px-4 py-3 font-medium">No kanban</th>}
                        <th className="px-4 py-3 font-medium">Prévia</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                      {lista.map((s) => (
                        <LinhaStatus
                          key={`${s.id}-${s.rotulo}-${s.cor}-${s.ordem}-${s.ativo}`}
                          status={s}
                          rotuloBase={s.base ? lista.find((b) => b.codigo === s.base)?.rotulo : undefined}
                          podeEditar={podeEditar}
                          podeExcluir={pode('configuracoes', 'excluir')}
                          comQuadro={quadro}
                        />
                      ))}
                    </tbody>
                  </table>
                </Card>
              </TabsContent>
            )
          })}
        </Tabs>
      )}
      {novo && (
        <NovoStatusDialog entidade={novo} sistema={ordenarStatus(consulta.data?.filter((s) => s.entidade === novo && s.sistema) ?? [])} onFechar={() => setNovo(null)} />
      )}
    </>
  )
}
