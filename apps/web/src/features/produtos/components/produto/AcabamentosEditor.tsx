import { useState } from 'react'
import { Loader2, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { TIPO_COBRANCA_ROTULOS, formatarMoeda, type ProdutoDetalhe } from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { SeloSugerido } from '@/features/assistente/SeloSugerido'
import { useAcabamentosOpcoes, useMutacao } from '../../hooks'

interface Marcacao {
  permitido: boolean
  padrao: boolean
  obrigatorio: boolean
}

interface AcabamentosEditorProps {
  produto: ProdutoDetalhe
  podeEditar: boolean
  /** Sugeridos pelo Assistente: entram como permitidos (sem salvar), com o selo, até a pessoa salvar */
  sugeridos?: string[]
  onSalvo?: () => void
}

/** Quais acabamentos o produto aceita, quais vêm marcados (padrão) e quais são obrigatórios. */
export function AcabamentosEditor({ produto, podeEditar, sugeridos = [], onSalvo }: AcabamentosEditorProps) {
  const opcoes = useAcabamentosOpcoes()
  const [marcas, setMarcas] = useState<Record<string, Marcacao>>(() => ({
    ...Object.fromEntries(sugeridos.map((id) => [id, { permitido: true, padrao: false, obrigatorio: false }])),
    ...Object.fromEntries(produto.acabamentos.map((a) => [a.acabamentoId, { permitido: true, padrao: a.padrao, obrigatorio: a.obrigatorio }])),
  }))
  // Selo só nos que o Assistente acrescentou (os que já eram do produto não mudam)
  const [comSelo, setComSelo] = useState(() => new Set(sugeridos.filter((id) => !produto.acabamentos.some((a) => a.acabamentoId === id))))
  const salvar = useMutacao(['produtos'], () =>
    produtosApi.salvarAcabamentos(
      produto.id,
      Object.entries(marcas)
        .filter(([, m]) => m.permitido)
        .map(([acabamentoId, m]) => ({ acabamentoId, padrao: m.padrao, obrigatorio: m.obrigatorio })),
    ),
  )

  function alterar(id: string, campo: keyof Marcacao, valor: boolean) {
    setComSelo((s) => (s.has(id) ? new Set([...s].filter((x) => x !== id)) : s))
    setMarcas((atual) => {
      const m = { ...(atual[id] ?? { permitido: false, padrao: false, obrigatorio: false }), [campo]: valor }
      if (campo === 'permitido' && !valor) Object.assign(m, { padrao: false, obrigatorio: false })
      if (campo !== 'permitido' && valor) m.permitido = true
      if (campo === 'obrigatorio' && valor) m.padrao = true
      return { ...atual, [id]: m }
    })
  }

  if (opcoes.isPending) return <Skeleton className="h-48 w-full" />
  if (opcoes.isError) return <Card><EstadoErro erro={opcoes.error} onTentarNovamente={() => void opcoes.refetch()} /></Card>

  return (
    <Card className="overflow-x-auto">
      {comSelo.size > 0 && (
        <p className="flex items-start gap-2 border-b border-border bg-marca-suave px-4 py-3 text-sm text-marca-escuro">
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />O Assistente marcou {comSelo.size} acabamento(s) como permitido(s). Confira e clique em “Salvar acabamentos”.
        </p>
      )}
      <table className="w-full min-w-[40rem] text-sm">
        <thead className="bg-fundo/60 text-left text-xs uppercase tracking-wide text-texto-secundario">
          <tr>
            <th className="px-4 py-3 font-medium">Acabamento</th>
            <th className="px-4 py-3 font-medium">Cobrança</th>
            <th className="px-4 py-3 text-center font-medium">Permitido</th>
            <th className="px-4 py-3 text-center font-medium">Vem marcado</th>
            <th className="px-4 py-3 text-center font-medium">Obrigatório</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {opcoes.data.map((a) => {
            const m = marcas[a.id]
            return (
              <tr key={a.id} className="hover:bg-fundo/50">
                <td className="px-4 py-2.5 font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {a.nome}
                    {comSelo.has(a.id) && <SeloSugerido curto />}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-texto-secundario">
                  {formatarMoeda(a.valor)} · {TIPO_COBRANCA_ROTULOS[a.tipoCobranca].toLowerCase()}
                </td>
                {(['permitido', 'padrao', 'obrigatorio'] as const).map((campo) => (
                  <td key={campo} className="px-4 py-2.5 text-center">
                    <Checkbox
                      checked={Boolean(m?.[campo])}
                      disabled={!podeEditar}
                      onChange={(e) => alterar(a.id, campo, e.target.checked)}
                      aria-label={`${a.nome}: ${campo}`}
                    />
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
      {podeEditar && (
        <div className="flex justify-end border-t border-border p-4">
          <Button
            disabled={salvar.isPending}
            onClick={() =>
              salvar.mutate(undefined, {
                onSuccess: () => {
                  setComSelo(new Set())
                  onSalvo?.()
                  toast.success('Acabamentos salvos.')
                },
                onError: (e) => toast.error(e.message),
              })
            }
          >
            {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar acabamentos
          </Button>
        </div>
      )}
    </Card>
  )
}
