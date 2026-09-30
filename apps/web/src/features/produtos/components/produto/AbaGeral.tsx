import { ImageIcon } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { EXTENSOES_IMAGEM, TIPOS_PRODUTO, TIPO_PRODUTO_ROTULOS, type Produto } from '@onprint/shared'
import { produtosApi } from '@/api/produtos'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FileUploader } from '@/components/shared/FileUploader'
import { NumberInput } from '@/components/shared/inputs'
import { Card, CardContent } from '@/components/ui/card'
import { Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useUrlArquivo } from '@/features/configuracoes/hooks'
import { useCategorias, useUnidades } from '../../hooks'
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
}

export function AbaGeral({ form, produto, podeEditar }: AbaGeralProps) {
  const categorias = useCategorias('true')
  const unidades = useUnidades()
  const { errors } = form.formState
  const r = form.register

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <Card>
        <CardContent className="grid gap-4 pt-6 md:grid-cols-6">
          <div className="md:col-span-4">
            <CampoFormulario id="pd-nome" rotulo="Nome *" erro={errors.nome?.message}>
              <Input id="pd-nome" aria-invalid={Boolean(errors.nome)} {...r('nome')} />
            </CampoFormulario>
          </div>
          <div className="md:col-span-2">
            <CampoFormulario id="pd-codigo" rotulo="Código" erro={errors.codigo?.message}>
              <Input id="pd-codigo" placeholder="Automático" className="font-mono uppercase" {...r('codigo')} />
            </CampoFormulario>
          </div>
          <div className="md:col-span-2">
            <CampoFormulario id="pd-tipo" rotulo="Tipo">
              <Select id="pd-tipo" {...r('tipo')}>
                {TIPOS_PRODUTO.map((t) => (
                  <option key={t} value={t}>
                    {TIPO_PRODUTO_ROTULOS[t]}
                  </option>
                ))}
              </Select>
            </CampoFormulario>
          </div>
          <div className="md:col-span-4">
            <CampoFormulario id="pd-categoria" rotulo="Categoria">
              <Select id="pd-categoria" {...r('categoriaId')}>
                <option value="">Sem categoria</option>
                {categorias.data?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.caminho}
                  </option>
                ))}
              </Select>
            </CampoFormulario>
          </div>
          <div className="md:col-span-3">
            <CampoFormulario id="pd-unidade" rotulo="Unidade de medida">
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
            <CampoFormulario id="pd-prazo" rotulo="Prazo de produção" erro={errors.prazoProducaoDias?.message}>
              <NumberInput id="pd-prazo" casas={0} sufixo="dias úteis" className="pr-20" {...r('prazoProducaoDias')} />
            </CampoFormulario>
          </div>
          <div className="md:col-span-6">
            <CampoFormulario id="pd-descricao" rotulo="Descrição (aparece no orçamento)">
              <Textarea id="pd-descricao" rows={3} {...r('descricao')} />
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
  )
}
