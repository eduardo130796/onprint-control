import type { ReactNode } from 'react'
import { Controller, useWatch } from 'react-hook-form'
import { Eye, Loader2, Save, Star } from 'lucide-react'
import { MAX_IMAGENS_PRODUTO, MODOS_PRECO_VITRINE, MODO_PRECO_VITRINE_ROTULOS } from '@onprint/shared'
import { vitrineApi } from '@/api/vitrine'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { NumberInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useAtualizarVitrine, useVitrineConfig } from '../hooks'
import type { EditorVitrine } from '../useEditorVitrine'
import { precoExibido, sugerirSlug } from '../utils'
import { GradeImagens } from './GradeImagens'
import { Interruptor } from './Interruptor'

/** Botão "Salvar" do editor (pode ficar fora do <form>, pelo atributo `form`) */
export function BotaoSalvarVitrine({ editor, className }: { editor: EditorVitrine; className?: string }) {
  const { isDirty } = editor.form.formState
  return (
    <Button type="submit" form={editor.idFormulario} disabled={editor.salvar.isPending || !isDirty} className={className}>
      {editor.salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />}
      Salvar na vitrine
    </Button>
  )
}

interface EditorProdutoVitrineProps {
  editor: EditorVitrine
  podeEditar: boolean
  /** Quem cuida das fotos: vitrine:editar ou produtos:editar */
  podeEditarFotos: boolean
}

/** Editor do produto na vitrine: publicar/destacar, textos do site, preço exibido, endereço, ordem e galeria. */
export function EditorProdutoVitrine({ editor, podeEditar, podeEditarFotos }: EditorProdutoVitrineProps) {
  const { produto, form, salvar, onSubmit, idFormulario } = editor
  const { errors } = form.formState
  const r = form.register
  const atualizar = useAtualizarVitrine()
  const config = useVitrineConfig()
  const [publicado, modoPreco, slug, nomePublico] = useWatch({ control: form.control, name: ['publicado', 'modoPreco', 'slug', 'nomePublico'] })
  const base = config.data?.urlPublica?.replace(/\/$/, '')
  const id = (campo: string) => `${idFormulario}-${campo}`

  return (
    <div className="space-y-6">
      <form id={idFormulario} onSubmit={onSubmit} noValidate>
        <fieldset disabled={!podeEditar || salvar.isPending} className="space-y-5">
          {/* Publicar e destacar */}
          <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-fundo/40">
            <LinhaInterruptor
              icone={Eye}
              titulo="Publicado no site"
              descricao={produto.ativo ? 'Aparece na vitrine para qualquer visitante.' : 'Produto desativado no cadastro: ative-o para publicar.'}
            >
              <Controller
                control={form.control}
                name="publicado"
                render={({ field }) => (
                  <Interruptor
                    rotulo="Publicado no site"
                    marcado={Boolean(field.value)}
                    onMudar={field.onChange}
                    desabilitado={!podeEditar || (!produto.ativo && !field.value)}
                  />
                )}
              />
            </LinhaInterruptor>
            <LinhaInterruptor icone={Star} titulo="Destaque" descricao="Entra na vitrine de destaques do início do site (até 12).">
              <Controller
                control={form.control}
                name="destaque"
                render={({ field }) => <Interruptor rotulo="Destaque" marcado={Boolean(field.value)} onMudar={field.onChange} desabilitado={!podeEditar} />}
              />
            </LinhaInterruptor>
          </div>
          {!publicado && podeEditar && produto.ativo && <p className="-mt-2 text-xs text-texto-secundario">Rascunho: você pode preparar tudo e publicar depois.</p>}

          <CampoFormulario id={id('nome')} rotulo="Nome no site" erro={errors.nomePublico?.message}>
            <Input id={id('nome')} placeholder={produto.nome} {...r('nomePublico')} />
          </CampoFormulario>

          <CampoFormulario id={id('texto')} rotulo="Texto de venda" erro={errors.descricaoPublica?.message}>
            <Textarea
              id={id('texto')}
              rows={6}
              placeholder="Conte o que o cliente recebe: material, acabamento, para que serve, prazos… Separe parágrafos com uma linha em branco."
              {...r('descricaoPublica')}
            />
          </CampoFormulario>

          <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
            <CampoFormulario id={id('preco')} rotulo="Preço no site" erro={errors.modoPreco?.message}>
              <Select id={id('preco')} {...r('modoPreco')}>
                {MODOS_PRECO_VITRINE.map((m) => (
                  <option key={m} value={m}>
                    {MODO_PRECO_VITRINE_ROTULOS[m]}
                  </option>
                ))}
              </Select>
            </CampoFormulario>
            <CampoFormulario id={id('ordem')} rotulo="Ordem" erro={errors.ordem?.message}>
              <NumberInput id={id('ordem')} casas={0} {...r('ordem')} />
            </CampoFormulario>
          </div>
          <p className="-mt-2 rounded-xl bg-marca-suave px-3 py-2 text-sm text-tinta">
            O visitante vê: <strong className="font-semibold">{precoExibido({ ...produto, modoPreco: modoPreco ?? produto.modoPreco })}</strong>
            {modoPreco !== 'sob_consulta' && <span className="block text-xs text-texto-secundario">Vem do preço de venda do cadastro. Ordem menor aparece primeiro.</span>}
          </p>

          <CampoFormulario id={id('slug')} rotulo="Endereço do produto" erro={errors.slug?.message}>
            <div className="flex min-w-0 items-stretch overflow-hidden rounded-lg border border-input bg-card focus-within:ring-2 focus-within:ring-ring">
              <span className="hidden shrink-0 items-center border-r border-input bg-fundo px-3 text-xs text-texto-secundario sm:flex">/produto/</span>
              <input
                id={id('slug')}
                className="h-10 min-w-0 flex-1 bg-transparent px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                placeholder="gerado a partir do nome"
                autoCapitalize="none"
                spellCheck={false}
                aria-invalid={Boolean(errors.slug)}
                {...r('slug')}
              />
            </div>
          </CampoFormulario>
          <p className="-mt-3 break-all text-xs text-texto-secundario">
            {base ? `${base.replace(/^https?:\/\//, '')}/produto/` : '/produto/'}
            <span className="font-medium text-tinta">{(slug as string) || sugerirSlug((nomePublico as string) || produto.nome)}</span>
            {!slug && ' (sugestão; a definitiva é gerada ao salvar)'}
          </p>
        </fieldset>
      </form>

      <section aria-labelledby={id('galeria')} className="space-y-3">
        <div>
          <h3 id={id('galeria')} className="font-semibold text-tinta">
            Fotos
          </h3>
          <p className="text-xs text-texto-secundario">A primeira é a capa (e vira a imagem do produto no sistema). Fotos quadradas ficam melhores.</p>
        </div>
        <GradeImagens
          itens={produto.imagens}
          maximo={MAX_IMAGENS_PRODUTO}
          podeEditar={podeEditarFotos}
          rotuloPrimeira="Capa"
          textoAdicionar="Adicionar fotos"
          onEnviar={async (arquivo, progresso) => {
            await vitrineApi.enviarImagem(produto.id, arquivo, progresso)
            await atualizar()
          }}
          onRemover={async (img) => {
            await vitrineApi.removerImagem(produto.id, img.id)
            await atualizar()
          }}
          onReordenar={async (ids) => {
            await vitrineApi.ordenarImagens(produto.id, ids)
            await atualizar()
          }}
        />
      </section>
    </div>
  )
}

function LinhaInterruptor({ icone: Icone, titulo, descricao, children }: { icone: typeof Eye; titulo: string; descricao: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-card text-marca-escuro ring-1 ring-border">
        <Icone className="h-4 w-4" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-tinta">{titulo}</p>
        <p className="text-xs text-texto-secundario">{descricao}</p>
      </div>
      {children}
    </div>
  )
}
