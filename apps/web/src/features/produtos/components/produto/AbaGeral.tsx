import { useState } from 'react'
import { ImageIcon, Plus } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { EXTENSOES_IMAGEM, TIPOS_PRODUTO, TIPO_PRODUTO_ROTULOS, type Produto } from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FileUploader } from '@/components/shared/FileUploader'
import { NumberInput } from '@/components/shared/inputs'
import { Card, CardContent } from '@/components/ui/card'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { BotaoEscrever } from '@/features/assistente/BotaoEscrever'
import { SeloSugerido } from '@/features/assistente/SeloSugerido'
import { useUrlArquivo } from '@/features/configuracoes/hooks'
import { useCategorias, useUnidades } from '../../hooks'
import { NovaCategoriaRapida } from '../CadastroRapido'
import { ComoEVendido } from './ComoEVendido'
import type { FormProduto } from './formProduto'

function ImagemProduto({ produto, podeEditar }: { produto: Produto; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const url = useUrlArquivo(produto.imagemArquivoId)
  return (
    <div className="space-y-3">
      <div className="flex h-40 items-center justify-center rounded-2xl bg-fundo p-3">
        {url.data ? (
          <img src={url.data} alt={produto.nome} className="max-h-full max-w-full object-contain" />
        ) : (
          <ImageIcon className="h-10 w-10 text-texto-secundario" aria-label="Sem imagem" />
        )}
      </div>
      {podeEditar && (
        <FileUploader
          extensoes={EXTENSOES_IMAGEM}
          tamanhoMaxMb={10}
          texto="Imagem do produto:"
          onEnviar={async (arquivo, progresso) => {
            await produtosApi.enviarImagem(produto.id, arquivo, progresso)
            await queryClient.invalidateQueries({ queryKey: ['produtos'] })
          }}
        />
      )}
    </div>
  )
}

interface AbaGeralProps {
  form: FormProduto
  produto?: Produto
  podeEditar: boolean
  /** Campos preenchidos pelo Assistente GrafyGo (selo até a pessoa mexer ou salvar) */
  sugeridos?: Set<string>
}

export function AbaGeral({ form, produto, podeEditar, sugeridos }: AbaGeralProps) {
  const categorias = useCategorias('true')
  const unidades = useUnidades()
  const { errors } = form.formState
  const r = form.register
  const selo = (campo: string) => (sugeridos?.has(campo) ? <SeloSugerido curto /> : undefined)
  const [descricaoSugerida, setDescricaoSugerida] = useState(false)
  // Categoria que falta: criada aqui mesmo (sem sair do cadastro)
  const [novaCategoria, setNovaCategoria] = useState(false)

  // Insumo tem tela própria (Produtos → Insumos)
  const tipos = TIPOS_PRODUTO.filter((t) => t !== 'insumo' || produto?.tipo === 'insumo')

  return (
    <div className="space-y-6">
      <div className="grid gap-6 lg:grid-cols-[1fr_18.75rem]">
        <Card>
          <CardContent className="grid gap-4 pt-6 md:grid-cols-6">
            <div className="md:col-span-4">
              <CampoFormulario id="pd-nome" rotulo="Nome *" erro={errors.nome?.message} acao={selo('nome')}>
                <Input id="pd-nome" aria-invalid={Boolean(errors.nome)} {...r('nome')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="pd-codigo" rotulo="Código" erro={errors.codigo?.message}>
                <Input id="pd-codigo" placeholder="Automático" className="font-mono uppercase" {...r('codigo')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-2">
              <CampoFormulario id="pd-tipo" rotulo="Tipo" acao={selo('tipo')}>
                <Select id="pd-tipo" {...r('tipo')}>
                  {tipos.map((t) => (
                    <option key={t} value={t}>
                      {TIPO_PRODUTO_ROTULOS[t]}
                    </option>
                  ))}
                </Select>
              </CampoFormulario>
            </div>
            <div className="md:col-span-4">
              <CampoFormulario
                id="pd-categoria"
                rotulo="Categoria"
                acao={
                  <span className="flex items-center gap-2">
                    {selo('categoriaId')}
                    {podeEditar && !novaCategoria && (
                      <button type="button" className="inline-flex items-center gap-1 text-xs font-semibold text-marca-escuro hover:underline" onClick={() => setNovaCategoria(true)}>
                        <Plus className="h-3.5 w-3.5" /> Nova
                      </button>
                    )}
                  </span>
                }
              >
                {novaCategoria ? (
                  <NovaCategoriaRapida
                    onCancelar={() => setNovaCategoria(false)}
                    onCriada={(c) => {
                      setNovaCategoria(false)
                      // Espera a lista recarregar com a nova opção antes de marcar
                      void categorias.refetch().then(() => form.setValue('categoriaId', c.id, { shouldDirty: true }))
                    }}
                  />
                ) : (
                  <Select id="pd-categoria" {...r('categoriaId')}>
                    <option value="">Sem categoria</option>
                    {categorias.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.caminho}
                      </option>
                    ))}
                  </Select>
                )}
              </CampoFormulario>
            </div>
            <div className="md:col-span-3">
              <CampoFormulario id="pd-unidade" rotulo="Unidade de medida" acao={selo('unidadeMedidaId')}>
                <Select id="pd-unidade" {...r('unidadeMedidaId')}>
                  <option value="">—</option>
                  {unidades.data?.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.nome} ({u.sigla})
                    </option>
                  ))}
                </Select>
              </CampoFormulario>
            </div>
            <div className="md:col-span-3">
              <CampoFormulario id="pd-prazo" rotulo="Prazo de produção" erro={errors.prazoProducaoDias?.message} acao={selo('prazoProducaoDias')}>
                <NumberInput id="pd-prazo" casas={0} sufixo="dias úteis" className="pr-20" {...r('prazoProducaoDias')} />
              </CampoFormulario>
            </div>
            <div className="md:col-span-6">
              <label className="flex items-start gap-2 text-sm">
                <Checkbox className="mt-0.5" {...r('precisaArte')} />
                <span>
                  <span className="flex flex-wrap items-center gap-2">Costuma precisar de arte {selo('precisaArte')}</span>
                  <span className="block text-xs text-texto-secundario">
                    Vem marcado no item do orçamento (o vendedor decide em cada um). Item com arte: o pedido espera a arte antes de produzir; sem arte, vai direto
                    para a produção.
                  </span>
                </span>
              </label>
            </div>
            <div className="md:col-span-6">
              <CampoFormulario
                id="pd-descricao"
                rotulo="Descrição (aparece no orçamento)"
                acao={
                  <span className="flex items-center gap-2">
                    {(sugeridos?.has('descricao') || descricaoSugerida) && <SeloSugerido curto />}
                    {podeEditar && (
                      <BotaoEscrever
                        pedido={() => {
                          if (produto) return { produtoId: produto.id, destino: 'produto' }
                          const v = form.getValues()
                          if ((v.nome ?? '').trim().length < 2) return null
                          const categoria = categorias.data?.find((c) => c.id === v.categoriaId)
                          return { destino: 'produto', rascunho: { nome: v.nome!.trim(), categoria: categoria?.caminho ?? null, modoCalculo: v.modoCalculo } }
                        }}
                        onTexto={(texto) => {
                          form.setValue('descricao', texto, { shouldDirty: true })
                          setDescricaoSugerida(true)
                        }}
                      />
                    )}
                  </span>
                }
              >
                <Textarea id="pd-descricao" rows={3} {...r('descricao', { onChange: () => setDescricaoSugerida(false) })} />
              </CampoFormulario>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            {produto ? (
              <ImagemProduto produto={produto} podeEditar={podeEditar} />
            ) : (
              <p className="text-sm text-texto-secundario">A imagem pode ser enviada depois de salvar o produto.</p>
            )}
          </CardContent>
        </Card>
      </div>
      <ComoEVendido form={form} produto={produto} sugeridos={sugeridos} />
    </div>
  )
}
