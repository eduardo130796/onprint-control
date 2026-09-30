import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Check, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { ENTIDADES_STATUS, ENTIDADE_STATUS_ROTULOS, type StatusConfig } from '@onprint/shared'
import { statusApi } from '@/api/configuracoes'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { CHAVE_STATUS, useStatusConfig } from '@/hooks/useStatusConfig'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { usePermission } from '@/hooks/usePermission'
import { fundoSuave, textoLegivel } from '@/lib/contraste'

/** Uma linha editável: rótulo, cor e ordem. O código é fixo (usado pelas regras de negócio). */
function LinhaStatus({ status, podeEditar }: { status: StatusConfig; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const [rotulo, setRotulo] = useState(status.rotulo)
  const [cor, setCor] = useState(status.cor)
  const [ordem, setOrdem] = useState(String(status.ordem))
  const alterado = rotulo !== status.rotulo || cor.toUpperCase() !== status.cor.toUpperCase() || Number(ordem) !== status.ordem
  const salvar = useMutation({
    mutationFn: () => statusApi.salvar(status.id, { rotulo: rotulo.trim(), cor, ordem: Number(ordem) || 0 }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: CHAVE_STATUS })
      toast.success('Status atualizado.')
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <tr className="hover:bg-fundo/50">
      <td className="px-4 py-2 font-mono text-xs text-texto-secundario">{status.codigo}</td>
      <td className="px-4 py-2">
        <Input value={rotulo} onChange={(e) => setRotulo(e.target.value)} disabled={!podeEditar} aria-label={`Rótulo de ${status.codigo}`} className="h-9" />
      </td>
      <td className="px-4 py-2">
        <div className="flex items-center gap-2">
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value.toUpperCase())} disabled={!podeEditar} aria-label={`Cor de ${status.codigo}`} className="h-9 w-10 cursor-pointer rounded border border-input bg-card p-0.5" />
          <span className="font-mono text-xs">{cor}</span>
        </div>
      </td>
      <td className="px-4 py-2">
        <Input value={ordem} onChange={(e) => setOrdem(e.target.value.replace(/\D/g, ''))} disabled={!podeEditar} aria-label={`Ordem de ${status.codigo}`} className="h-9 w-20" inputMode="numeric" />
      </td>
      <td className="px-4 py-2 text-xs text-texto-secundario">{status.ehFinal ? 'Sim' : '—'}</td>
      <td className="px-4 py-2">
        <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium" style={{ backgroundColor: fundoSuave(cor), color: textoLegivel(cor) }}>
          <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cor }} />
          {rotulo || status.codigo}
        </span>
      </td>
      <td className="px-4 py-2 text-right">
        {podeEditar && (
          <Button size="sm" variant={alterado ? 'default' : 'ghost'} disabled={!alterado || salvar.isPending || !rotulo.trim()} onClick={() => salvar.mutate()}>
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Check />} Salvar
          </Button>
        )}
      </td>
    </tr>
  )
}

export function StatusPage() {
  const consulta = useStatusConfig()
  const podeEditar = usePermission('configuracoes', 'editar')

  return (
    <>
      <PageHeader titulo="Status do sistema" subtitulo="Rótulos e cores exibidos nos badges de todo o sistema." />
      {consulta.isPending ? (
        <Skeleton className="h-80 w-full" />
      ) : consulta.isError ? (
        <Card><EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} /></Card>
      ) : (
        <Tabs defaultValue="orcamento">
          <TabsList>
            {ENTIDADES_STATUS.map((e) => (
              <TabsTrigger key={e} value={e}>
                {ENTIDADE_STATUS_ROTULOS[e]}
              </TabsTrigger>
            ))}
          </TabsList>
          {ENTIDADES_STATUS.map((entidade) => (
            <TabsContent key={entidade} value={entidade}>
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead className="bg-fundo/60 text-left text-xs uppercase tracking-wide text-texto-secundario">
                    <tr>
                      <th className="px-4 py-3 font-medium">Código</th>
                      <th className="px-4 py-3 font-medium">Rótulo</th>
                      <th className="px-4 py-3 font-medium">Cor</th>
                      <th className="px-4 py-3 font-medium">Ordem</th>
                      <th className="px-4 py-3 font-medium">Final</th>
                      <th className="px-4 py-3 font-medium">Prévia</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {consulta.data
                      .filter((s) => s.entidade === entidade)
                      .map((s) => (
                        <LinhaStatus key={`${s.id}-${s.rotulo}-${s.cor}-${s.ordem}`} status={s} podeEditar={podeEditar} />
                      ))}
                  </tbody>
                </table>
              </Card>
              <p className="mt-3 text-xs text-texto-secundario">
                Exemplo atual: {consulta.data.filter((s) => s.entidade === entidade).slice(0, 3).map((s) => (
                  <StatusBadge key={s.id} entidade={entidade} codigo={s.codigo} className="ml-1" />
                ))}
              </p>
            </TabsContent>
          ))}
        </Tabs>
      )}
    </>
  )
}
