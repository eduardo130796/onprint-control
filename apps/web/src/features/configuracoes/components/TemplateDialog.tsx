import { useRef } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CATEGORIAS_TEMPLATE,
  CATEGORIA_TEMPLATE_ROTULOS,
  VARIAVEIS_TEMPLATE,
  preencherTemplate,
  templateSchema,
  type MensagemTemplate,
  type TemplateInput,
} from '@onprint/shared'
import type { z } from 'zod'
import { templatesApi } from '@/api/configuracoes'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'

type Saida = z.output<typeof templateSchema>

/** Valores de exemplo para a prévia da mensagem. */
const EXEMPLO = {
  cliente_nome: 'Maria Silva',
  numero_orcamento: 'ORC-2026-0042',
  numero_pedido: 'PED-2026-0017',
  link_aprovacao: 'http://localhost:5173/aprovar/abc123',
  valor_total: 'R$ 1.250,00',
  data_entrega: '15/10/2026',
}

export function TemplateDialog({ template, onFechar }: { template?: MensagemTemplate; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const areaTexto = useRef<HTMLTextAreaElement | null>(null)
  const form = useForm<TemplateInput, unknown, Saida>({
    resolver: zodResolver(templateSchema),
    defaultValues: {
      nome: template?.nome ?? '',
      categoria: template?.categoria ?? 'orcamento_enviado',
      conteudo: template?.conteudo ?? '',
      ativo: template?.ativo ?? true,
    },
  })
  const { errors } = form.formState
  const conteudo = form.watch('conteudo')
  const salvar = useMutation({
    mutationFn: (d: Saida) => (template ? templatesApi.atualizar(template.id, d) : templatesApi.criar(d)),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['templates'] }),
  })

  /** Insere {{variavel}} na posição do cursor. */
  function inserir(variavel: string) {
    const el = areaTexto.current
    const atual = form.getValues('conteudo') ?? ''
    const inicio = el?.selectionStart ?? atual.length
    const fim = el?.selectionEnd ?? atual.length
    form.setValue('conteudo', `${atual.slice(0, inicio)}{{${variavel}}}${atual.slice(fim)}`, { shouldDirty: true })
    requestAnimationFrame(() => el?.focus())
  }

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      await salvar.mutateAsync(dados)
      toast.success('Template salvo.')
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  const registroConteudo = form.register('conteudo')
  return (
    <FormDialog aberto onAbertoChange={(v) => !v && onFechar()} titulo={template ? 'Editar template' : 'Novo template'} salvando={salvar.isPending} onSubmit={onSubmit} largo>
      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="tp-nome" rotulo="Nome *" erro={errors.nome?.message}>
          <Input id="tp-nome" autoFocus {...form.register('nome')} />
        </CampoFormulario>
        <CampoFormulario id="tp-categoria" rotulo="Categoria">
          <Select id="tp-categoria" {...form.register('categoria')}>
            {CATEGORIAS_TEMPLATE.map((c) => (
              <option key={c} value={c}>
                {CATEGORIA_TEMPLATE_ROTULOS[c]}
              </option>
            ))}
          </Select>
        </CampoFormulario>
      </div>
      <CampoFormulario id="tp-conteudo" rotulo="Mensagem *" erro={errors.conteudo?.message}>
        <div className="mb-2 flex flex-wrap gap-1.5">
          {VARIAVEIS_TEMPLATE.map((v) => (
            <button key={v} type="button" onClick={() => inserir(v)} className="rounded-full border border-border px-2.5 py-0.5 font-mono text-xs hover:border-marca hover:text-marca-escuro">
              {`{{${v}}}`}
            </button>
          ))}
        </div>
        <Textarea
          id="tp-conteudo"
          rows={6}
          {...registroConteudo}
          ref={(el) => {
            registroConteudo.ref(el)
            areaTexto.current = el
          }}
        />
      </CampoFormulario>
      <div>
        <p className="mb-1.5 text-sm font-medium">Prévia</p>
        <div className="whitespace-pre-wrap rounded-2xl rounded-tl-sm bg-[#DCF8C6] p-3 text-sm text-texto shadow-sm">
          {preencherTemplate(String(conteudo ?? ''), EXEMPLO) || <span className="text-texto-secundario">A mensagem aparece aqui.</span>}
        </div>
      </div>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Template ativo
      </label>
    </FormDialog>
  )
}
