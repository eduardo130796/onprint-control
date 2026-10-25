import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Plus, Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import type { ProdutoSugerido } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { categoriasApi } from '@/api/produtos'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { useAtualizarUsoAssistente } from '@/features/assistente/useAssistente'
import { preencherFormulario, type FormProduto } from './formProduto'

interface Props {
  form: FormProduto
  /** Produto já salvo: materiais e acabamentos vão direto para as abas; novo: ficam para depois de cadastrar */
  salvo: boolean
  onSugestao: (s: ProdutoSugerido, campos: string[]) => void
  /** Vindo do "Peça ao Assistente": já abre e preenche com este texto */
  textoInicial?: string
}

/**
 * "Preencher com o Assistente" no cadastro do produto: a pessoa descreve o produto e o Assistente GrafyGo preenche a
 * aba Geral e sugere materiais, etapas e acabamentos do cadastro. Nada é salvo: a pessoa revisa (principalmente os
 * custos) e salva.
 */
export function PreencherComAssistente({ form, salvo, onSugestao, textoInicial }: Props) {
  const queryClient = useQueryClient()
  const atualizarUso = useAtualizarUsoAssistente()
  const [aberto, setAberto] = useState(Boolean(textoInicial))
  const [texto, setTexto] = useState(textoInicial ?? '')
  const [lendo, setLendo] = useState(false)
  const [sugestao, setSugestao] = useState<ProdutoSugerido | null>(null)
  const [criandoCategoria, setCriandoCategoria] = useState(false)
  // "Peça ao Assistente": preenche uma vez ao abrir (o produto já chega preenchido)
  const automatico = useRef(Boolean(textoInicial))
  useEffect(() => {
    if (!automatico.current || !textoInicial) return
    automatico.current = false
    void preencher(textoInicial)
    // Só na montagem
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function preencher(pedido = texto) {
    if (pedido.trim().length < 5) return toast.error('Descreva o produto.')
    setLendo(true)
    try {
      const s = await assistenteApi.produtoDeTexto(pedido.trim())
      const campos = preencherFormulario(form, s)
      setSugestao(s)
      onSugestao(s, campos)
      toast.success('Cadastro preenchido pelo Assistente: confira os campos marcados antes de salvar.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLendo(false)
      atualizarUso()
    }
  }

  /** Categoria nova sugerida: cria na hora (a pessoa pediu) e marca no formulário */
  async function criarCategoria(nome: string) {
    setCriandoCategoria(true)
    try {
      const c = await categoriasApi.criar({ nome })
      await queryClient.invalidateQueries({ queryKey: ['categorias'] })
      form.setValue('categoriaId', c.id, { shouldDirty: true })
      setSugestao((s) => (s ? { ...s, categoria: { id: c.id, nome: c.nome } } : s))
      toast.success(`Categoria “${c.nome}” criada.`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCriandoCategoria(false)
    }
  }

  if (!aberto) {
    return (
      <Card className="flex flex-col gap-3 border border-dashed border-marca/40 bg-marca-suave/40 p-4 sm:flex-row sm:items-center">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca text-marca-contraste">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <p className="min-w-0 flex-1 text-sm text-texto-secundario">
          <span className="block font-semibold text-tinta">Descreva o produto e o Assistente preenche</span>
          Nome, categoria, como cobra, materiais e acabamentos do seu cadastro. Você confere tudo antes de salvar.
        </p>
        <Button type="button" variant="outline" onClick={() => setAberto(true)}>
          <Sparkles /> Preencher com o Assistente
        </Button>
      </Card>
    )
  }

  const extras = sugestao ? [...sugestao.insumos.map((i) => i.nome), ...sugestao.processos.map((p) => p.nome), ...sugestao.acabamentos.map((a) => a.nome)] : []

  return (
    <Card className="space-y-3 border border-marca/40 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca text-marca-contraste">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-tinta">Preencher com o Assistente</p>
          <p className="text-sm text-texto-secundario">Conte o que é, como você cobra, os materiais e, se quiser, a margem. Preço e custo ficam com você.</p>
        </div>
        <AcaoIcone icone={X} rotulo="Fechar o Assistente" onClick={() => setAberto(false)} />
      </div>
      <Textarea
        aria-label="Descrição do produto para o Assistente"
        rows={3}
        maxLength={2000}
        value={texto}
        placeholder="Ex.: adesivo vinil com recorte, cobro por m², vinil branco brilho, margem 60%"
        onChange={(e) => setTexto(e.target.value)}
      />
      <div className="flex justify-end">
        <Button type="button" onClick={() => void preencher()} disabled={lendo || texto.trim().length < 5}>
          {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />} {lendo ? 'Preenchendo…' : sugestao ? 'Preencher de novo' : 'Preencher'}
        </Button>
      </div>

      {sugestao && (
        <div className="space-y-2 rounded-xl bg-fundo p-3 text-sm">
          <p>Os campos preenchidos estão marcados com “sugerido”. Confira e salve.</p>
          {sugestao.categoria && !sugestao.categoria.id && (
            <p className="flex flex-wrap items-center gap-2">
              Categoria sugerida: <strong>{sugestao.categoria.nome}</strong> (nova)
              <Button type="button" size="sm" variant="outline" disabled={criandoCategoria} onClick={() => void criarCategoria(sugestao.categoria!.nome)}>
                {criandoCategoria ? <Loader2 className="animate-spin" /> : <Plus />} Criar categoria
              </Button>
            </p>
          )}
          {extras.length > 0 && (
            <p className="[overflow-wrap:anywhere]">
              Também sugeriu: {extras.join(', ')}
              {sugestao.margem && ` · lucro desejado ${sugestao.margem.replace('.', ',')}%`}.{' '}
              {salvo ? 'Veja nas abas “Custo e preço” e “Acabamentos”.' : 'Depois de cadastrar, aparecem nas abas “Custo e preço” e “Acabamentos” para você conferir.'}
            </p>
          )}
          {sugestao.avisos.map((a) => (
            <p key={a} className="flex items-start gap-1.5 text-amber-800">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {a}
            </p>
          ))}
        </div>
      )}
    </Card>
  )
}
