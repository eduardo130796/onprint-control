import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Loader2, Pencil, Plus, Star } from 'lucide-react'
import { toast } from 'sonner'
import { localEstoqueSchema, type LocalEstoque } from '@onprint/shared'
import { estoqueApi } from '@/api/estoque'
import { Can } from '@/components/shared/Can'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Checkbox } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useLocaisEstoque } from '../hooks'

type Edicao = { id?: string; nome: string; descricao: string; padrao: boolean; ativo: boolean }

/** Locais de estoque: um é o padrão (baixa da produção). */
export function LocaisDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const locais = useLocaisEstoque()
  const [edicao, setEdicao] = useState<Edicao | null>(null)
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState<string>()

  const editar = (l?: LocalEstoque) => {
    setErro(undefined)
    setEdicao(l ? { id: l.id, nome: l.nome, descricao: l.descricao ?? '', padrao: l.padrao, ativo: l.ativo } : { nome: '', descricao: '', padrao: false, ativo: true })
  }

  async function salvar() {
    if (!edicao) return
    const r = localEstoqueSchema.safeParse(edicao)
    if (!r.success) return setErro(r.error.issues[0]?.message)
    setSalvando(true)
    try {
      await estoqueApi.salvarLocal(r.data, edicao.id)
      toast.success('Local salvo.')
      await queryClient.invalidateQueries({ queryKey: ['estoque'] })
      setEdicao(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && !salvando && onFechar()}>
      <DialogContent className="max-w-lg">
        <DialogTitle>Locais de estoque</DialogTitle>
        <DialogDescription>A produção baixa os insumos do local padrão (★).</DialogDescription>
        <ul className="divide-y divide-border rounded-xl border border-border text-sm">
          {locais.data?.map((l) => (
            <li key={l.id} className="flex items-center gap-2 px-3 py-2">
              {l.padrao && <Star className="h-4 w-4 fill-ambar text-ambar" aria-label="Padrão" />}
              <span className={l.ativo ? 'font-medium' : 'text-texto-secundario line-through'}>{l.nome}</span>
              {l.descricao && <span className="truncate text-xs text-texto-secundario">{l.descricao}</span>}
              <Can modulo="estoque" acao="editar">
                <Button variant="ghost" size="icon" className="ml-auto h-8 w-8" aria-label={`Editar ${l.nome}`} onClick={() => editar(l)}>
                  <Pencil />
                </Button>
              </Can>
            </li>
          ))}
        </ul>
        <Can modulo="estoque" acao="editar">
          {edicao ? (
            <div className="space-y-3 rounded-xl bg-fundo p-3">
              <CampoFormulario id="local-nome" rotulo="Nome *" erro={erro}>
                <Input id="local-nome" autoFocus value={edicao.nome} onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })} />
              </CampoFormulario>
              <CampoFormulario id="local-desc" rotulo="Descrição">
                <Input id="local-desc" value={edicao.descricao} onChange={(e) => setEdicao({ ...edicao, descricao: e.target.value })} />
              </CampoFormulario>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <Checkbox checked={edicao.padrao} onChange={(e) => setEdicao({ ...edicao, padrao: e.target.checked })} /> Local padrão
                </label>
                <label className="flex items-center gap-2">
                  <Checkbox checked={edicao.ativo} onChange={(e) => setEdicao({ ...edicao, ativo: e.target.checked })} /> Ativo
                </label>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEdicao(null)} disabled={salvando}>
                  Cancelar
                </Button>
                <Button size="sm" onClick={() => void salvar()} disabled={salvando}>
                  {salvando && <Loader2 className="animate-spin" />} Salvar
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="outline" onClick={() => editar()}>
              <Plus /> Novo local
            </Button>
          )}
        </Can>
      </DialogContent>
    </Dialog>
  )
}
