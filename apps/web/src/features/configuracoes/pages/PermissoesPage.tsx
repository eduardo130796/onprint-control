import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Lock, Save, Undo2 } from 'lucide-react'
import { toast } from 'sonner'
import { ACAO_ROTULOS, MODULO_ROTULOS, type Acao, type Modulo } from '@onprint/shared'
import { permissoesApi } from '@/api/configuracoes'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'

/** Matriz papel × módulo × ação. O papel admin é fixo (sempre com tudo). */
export function PermissoesPage() {
  const queryClient = useQueryClient()
  const podeEditar = usePermission('permissoes', 'editar')
  const matriz = useQuery({ queryKey: ['permissoes'], queryFn: permissoesApi.matriz })
  const [papelId, setPapelId] = useState<string>()
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())

  const papel = matriz.data?.papeis.find((p) => p.id === papelId) ?? matriz.data?.papeis[0]
  const originais = useMemo(() => new Set(papel ? (matriz.data?.concedidas[papel.id] ?? []) : []), [papel, matriz.data])
  useEffect(() => setMarcadas(new Set(originais)), [originais])

  const alterado = marcadas.size !== originais.size || [...marcadas].some((m) => !originais.has(m))
  const bloqueado = !podeEditar || papel?.codigo === 'admin'
  const salvar = useMutation({
    mutationFn: () => permissoesApi.salvar(papel!.id, [...marcadas]),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['permissoes'] }),
  })

  function alternar(chave: string) {
    setMarcadas((atual) => {
      const nova = new Set(atual)
      if (nova.has(chave)) nova.delete(chave)
      else nova.add(chave)
      return nova
    })
  }

  function alternarLinha(modulo: string, acoes: string[]) {
    const chaves = acoes.map((a) => `${modulo}:${a}`)
    const todas = chaves.every((c) => marcadas.has(c))
    setMarcadas((atual) => {
      const nova = new Set(atual)
      chaves.forEach((c) => (todas ? nova.delete(c) : nova.add(c)))
      return nova
    })
  }

  if (matriz.isPending) return <Skeleton className="h-96 w-full" />
  if (matriz.isError) return <Card><EstadoErro erro={matriz.error} onTentarNovamente={() => void matriz.refetch()} /></Card>
  const { papeis, modulos, acoes } = matriz.data

  return (
    <>
      <PageHeader
        titulo="Permissões"
        subtitulo="O que cada papel pode fazer em cada módulo. A regra vale também na API."
        acoes={
          !bloqueado && (
            <>
              <Button variant="outline" disabled={!alterado || salvar.isPending} onClick={() => setMarcadas(new Set(originais))}>
                <Undo2 /> Desfazer
              </Button>
              <Button
                disabled={!alterado || salvar.isPending}
                onClick={() =>
                  salvar.mutate(undefined, {
                    onSuccess: () => toast.success(`Permissões de ${papel?.nome} salvas.`),
                    onError: (e) => toast.error(e.message),
                  })
                }
              >
                {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
              </Button>
            </>
          )
        }
      />

      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label="Papéis">
        {papeis.map((p) => (
          <button
            key={p.id}
            role="tab"
            aria-selected={p.id === papel?.id}
            onClick={() => setPapelId(p.id)}
            className={cn(
              'shrink-0 rounded-xl border px-4 py-2 text-sm transition-colors',
              p.id === papel?.id ? 'border-petroleo bg-petroleo text-white' : 'border-border bg-card hover:border-turquesa',
            )}
          >
            {p.nome}
            <span className={cn('ml-2 text-xs', p.id === papel?.id ? 'text-white/70' : 'text-texto-secundario')}>{p.usuarios} usuário(s)</span>
          </button>
        ))}
      </div>

      {papel?.codigo === 'admin' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-accent p-3 text-sm text-petroleo">
          <Lock className="h-4 w-4" /> O administrador sempre tem acesso a tudo; esta matriz não pode ser alterada.
        </p>
      )}

      <Card className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-fundo/60 text-xs uppercase tracking-wide text-texto-secundario">
            <tr>
              <th className="sticky left-0 bg-fundo px-4 py-3 text-left font-medium">Módulo</th>
              {acoes.map((a) => (
                <th key={a} className="px-2 py-3 text-center font-medium">
                  {ACAO_ROTULOS[a as Acao]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {modulos.map((m) => (
              <tr key={m} className="hover:bg-fundo/50">
                <th scope="row" className="sticky left-0 bg-card px-4 py-2.5 text-left font-medium">
                  <button type="button" disabled={bloqueado} onClick={() => alternarLinha(m, acoes)} className="text-left hover:text-turquesa-escuro disabled:hover:text-inherit" title="Marcar/desmarcar a linha">
                    {MODULO_ROTULOS[m as Modulo] ?? m}
                  </button>
                </th>
                {acoes.map((a) => {
                  const chave = `${m}:${a}`
                  return (
                    <td key={a} className="px-2 py-2.5 text-center">
                      <Checkbox
                        checked={marcadas.has(chave)}
                        disabled={bloqueado}
                        onChange={() => alternar(chave)}
                        aria-label={`${MODULO_ROTULOS[m as Modulo]}: ${ACAO_ROTULOS[a as Acao]}`}
                      />
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  )
}
