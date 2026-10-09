import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { FolderTree, Pencil, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { categoriaSchema, type Categoria, type CategoriaInput } from '@onprint/shared'
import type { z } from 'zod'
import { categoriasApi } from '@/api/produtos'
import { PageHeader } from '@/components/layout/PageHeader'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { BadgeInativo } from '@/components/shared/CadastroLista'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissoes } from '@/hooks/usePermission'
import { useCategorias, useMutacao } from '../hooks'

type Saida = z.output<typeof categoriaSchema>

const nivel = (c: Categoria) => c.caminho.split(' › ').length - 1

function CategoriaDialog({ categoria, todas, onFechar }: { categoria?: Categoria; todas: Categoria[]; onFechar: () => void }) {
  const form = useForm<CategoriaInput, unknown, Saida>({
    resolver: zodResolver(categoriaSchema),
    defaultValues: { nome: categoria?.nome ?? '', paiId: categoria?.paiId ?? '', ativo: categoria?.ativo ?? true },
  })
  const { errors } = form.formState
  const salvar = useMutacao(['categorias'], (d: Saida) => (categoria ? categoriasApi.atualizar(categoria.id, d) : categoriasApi.criar(d)))
  // Não oferece a própria categoria nem as subcategorias dela como pai
  const possiveisPais = todas.filter((c) => !categoria || (c.id !== categoria.id && !c.caminho.startsWith(`${categoria.caminho} › `)))

  const onSubmit = form.handleSubmit(async (d) => {
    try {
      await salvar.mutateAsync(d)
      toast.success('Categoria salva.')
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={categoria ? 'Editar categoria' : 'Nova categoria'} salvando={salvar.isPending} onSubmit={onSubmit}>
      <CampoFormulario id="cat-nome" rotulo="Nome *" erro={errors.nome?.message}>
        <Input id="cat-nome" autoFocus {...form.register('nome')} />
      </CampoFormulario>
      <CampoFormulario id="cat-pai" rotulo="Dentro de (categoria pai)">
        <Select id="cat-pai" {...form.register('paiId')}>
          <option value="">Nenhuma (categoria principal)</option>
          {possiveisPais.map((c) => (
            <option key={c.id} value={c.id}>
              {c.caminho}
            </option>
          ))}
        </Select>
      </CampoFormulario>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Ativa
      </label>
    </FormDialog>
  )
}

export function CategoriasPage() {
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const pode = usePermissoes()
  const consulta = useCategorias('todos')
  const [editando, setEditando] = useState<Categoria | 'nova' | null>(null)
  const alternar = useMutacao(['categorias'], (c: Categoria) => categoriasApi.atualizar(c.id, { nome: c.nome, paiId: c.paiId, ativo: !c.ativo }))
  const criandoPelaRota = pathname === '/produtos/categorias/novo'
  const aberto = criandoPelaRota ? 'nova' : editando

  return (
    <>
      <PageHeader
        titulo="Categorias"
        subtitulo="Organize produtos e serviços em categorias e subcategorias."
        acoes={
          pode('produtos', 'criar') && (
            <Button onClick={() => setEditando('nova')}>
              <Plus /> Nova categoria
            </Button>
          )
        }
      />
      <Card>
        {consulta.isPending ? (
          <div className="space-y-2 p-4">{Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <EmptyState icone={FolderTree} titulo="Nenhuma categoria" descricao="Crie categorias como “Comunicação visual” e subcategorias como “Banners”." />
        ) : (
          <ul className="divide-y divide-border">
            {consulta.data.map((c) => (
              <li key={c.id} className="flex items-center gap-3 px-4 py-3 hover:bg-fundo/60" style={{ paddingLeft: `${16 + nivel(c) * 24}px` }}>
                <FolderTree className="h-4 w-4 shrink-0 text-marca-escuro" />
                <span className="flex-1 text-sm">
                  <span className={nivel(c) === 0 ? 'font-semibold text-tinta' : ''}>{c.nome}</span>
                  <BadgeInativo ativo={c.ativo} />
                </span>
                <span className="text-xs text-texto-secundario">{c._count?.produtos ?? 0} produto(s)</span>
                {pode('produtos', 'editar') && (
                  <>
                    <AcaoIcone icone={Pencil} rotulo="Editar" onClick={() => setEditando(c)} />
                    <AcaoIcone
                      icone={c.ativo ? Trash2 : RotateCcw}
                      rotulo={c.ativo ? 'Desativar' : 'Reativar'}
                      perigo={c.ativo}
                      onClick={() =>
                        alternar.mutate(c, {
                          onSuccess: () => toast.success(c.ativo ? 'Categoria desativada.' : 'Categoria reativada.'),
                          onError: (e) => toast.error(e.message),
                        })
                      }
                    />
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {aberto && consulta.data && (
        <CategoriaDialog
          categoria={aberto === 'nova' ? undefined : aberto}
          todas={consulta.data.filter((c) => c.ativo)}
          onFechar={() => {
            setEditando(null)
            if (criandoPelaRota) navigate('/produtos/categorias', { replace: true })
          }}
        />
      )}
    </>
  )
}
