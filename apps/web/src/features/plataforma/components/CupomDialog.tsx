import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Copy, TicketPercent } from 'lucide-react'
import { toast } from 'sonner'
import { cupomSchema, descreverCupom, formatarDataSimples, type CupomInput, type CupomPlataforma } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Checkbox } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { SITUACAO_CUPOM, type SituacaoCupom } from './regras'

// ─── Situação do cupom ────────────────────────────────────────────────────

export function SeloCupom({ situacao, className }: { situacao: SituacaoCupom; className?: string }) {
  const s = SITUACAO_CUPOM[situacao]
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1', s.cor, className)}>
      <span className={cn('h-1.5 w-1.5 rounded-full', s.ponto)} aria-hidden="true" />
      {s.rotulo}
    </span>
  )
}

/** Código do cupom em fonte mono com botão de copiar. */
export function CodigoCupom({ codigo, claro, grande }: { codigo: string; claro?: boolean; grande?: boolean }) {
  async function copiar(ev: React.MouseEvent) {
    ev.preventDefault()
    ev.stopPropagation()
    try {
      await navigator.clipboard.writeText(codigo)
      toast.success(`Cupom ${codigo} copiado.`)
    } catch {
      toast.error('Não foi possível copiar.')
    }
  }
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className={cn('truncate font-mono font-bold tracking-wider', grande ? 'text-2xl sm:text-3xl' : 'text-base', claro ? 'text-white' : 'text-tinta')}>{codigo}</span>
      <button type="button" onClick={copiar} className={cn('rounded-md p-1.5 transition-colors', claro ? 'text-white/60 hover:bg-white/10 hover:text-white' : 'text-texto-secundario hover:bg-fundo hover:text-tinta')} aria-label={`Copiar ${codigo}`}>
        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
      </button>
    </span>
  )
}

// ─── Formulário ───────────────────────────────────────────────────────────

const NOVO: CupomInput = { codigo: '', descricao: '', tipo: 'percentual', valor: '', duracaoMeses: 3, validoAte: '', limiteUsos: '', planos: [], ativo: true }

/** Criar ou editar um cupom. Depois de usado, código, tipo, valor e duração ficam travados. */
export function CupomDialog({ cupom, onFechar }: { cupom: CupomPlataforma | null; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const planos = useQuery({ queryKey: ['plataforma', 'planos'], queryFn: plataformaApi.planos })
  const travado = Boolean(cupom && cupom.usos > 0)
  const form = useForm<CupomInput>({
    resolver: zodResolver(cupomSchema) as never,
    defaultValues: cupom
      ? {
          codigo: cupom.codigo,
          descricao: cupom.descricao ?? '',
          tipo: cupom.tipo,
          valor: cupom.valor.replace('.', ','),
          duracaoMeses: cupom.duracaoMeses ?? '',
          validoAte: cupom.validoAte ?? '',
          limiteUsos: cupom.limiteUsos ?? '',
          planos: cupom.planos,
          ativo: cupom.ativo,
        }
      : NOVO,
  })
  const { errors, isSubmitting } = form.formState
  const v = form.watch()
  const paraSempre = v.duracaoMeses === '' || v.duracaoMeses == null
  const planosSel = (v.planos ?? []) as string[]
  const valorNum = Number(String(v.valor ?? '').replace(',', '.'))

  const onSubmit = form.handleSubmit(async (dados) => {
    try {
      await plataformaApi.salvarCupom(cupom?.id ?? null, dados)
      toast.success(cupom ? 'Cupom atualizado.' : `Cupom ${String(dados.codigo).toUpperCase()} criado.`)
      await queryClient.invalidateQueries({ queryKey: ['plataforma'] })
      onFechar()
    } catch (e) {
      toast.error((e as Error).message)
    }
  })

  const segmento = (ativo: boolean) => cn('flex-1 rounded-lg px-3 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50', ativo ? 'bg-grafite text-white shadow-sm' : 'text-tinta hover:bg-white')

  return (
    <FormDialog
      aberto
      largo
      onAbertoChange={(x) => !x && onFechar()}
      titulo={cupom ? `Cupom ${cupom.codigo}` : 'Novo cupom'}
      descricao="O desconto vale nas mensalidades a partir da primeira cobrança depois de aplicado."
      salvando={isSubmitting}
      textoSalvar={cupom ? 'Salvar' : 'Criar cupom'}
      onSubmit={onSubmit}
    >
      {/* Prévia em forma de ingresso */}
      <div className="relative overflow-hidden rounded-2xl bg-grafite p-4 text-white">
        <div className="pointer-events-none absolute -right-10 -top-16 h-40 w-40 rounded-full bg-laranja/25 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-laranja text-white">
            <TicketPercent className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className="truncate font-mono text-lg font-bold tracking-wider">{String(v.codigo || 'CODIGO').toUpperCase()}</p>
            <p className="text-sm text-white/70">{valorNum > 0 ? descreverCupom({ tipo: v.tipo ?? 'percentual', valor: String(valorNum), duracaoMeses: paraSempre ? null : Number(v.duracaoMeses) }) : 'Informe o desconto'}</p>
          </div>
        </div>
      </div>

      {travado && <p className="rounded-lg bg-amber-50 p-2 text-xs text-amber-900 ring-1 ring-amber-200">Este cupom já foi usado: código, desconto e duração não mudam mais (crie outro se precisar).</p>}

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="cp-codigo" rotulo="Código *" erro={errors.codigo?.message}>
          <Input id="cp-codigo" autoFocus={!cupom} disabled={travado} className="font-mono uppercase" placeholder="BEMVINDO20" {...form.register('codigo', { setValueAs: (x: string) => x.toUpperCase() })} />
        </CampoFormulario>
        <CampoFormulario id="cp-desc" rotulo="Descrição (interna)" erro={errors.descricao?.message}>
          <Input id="cp-desc" placeholder="Ex.: campanha feira 2026" {...form.register('descricao')} />
        </CampoFormulario>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm font-medium">Tipo de desconto</p>
          <div className="flex gap-1 rounded-xl bg-fundo p-1 ring-1 ring-border">
            <button type="button" disabled={travado} className={segmento(v.tipo === 'percentual')} onClick={() => form.setValue('tipo', 'percentual')}>
              Percentual (%)
            </button>
            <button type="button" disabled={travado} className={segmento(v.tipo === 'valor')} onClick={() => form.setValue('tipo', 'valor')}>
              Valor fixo (R$)
            </button>
          </div>
        </div>
        <CampoFormulario id="cp-valor" rotulo={v.tipo === 'percentual' ? 'Desconto (%) *' : 'Desconto (R$) *'} erro={errors.valor?.message}>
          <Input id="cp-valor" inputMode="decimal" disabled={travado} placeholder={v.tipo === 'percentual' ? '20' : '50,00'} {...form.register('valor')} />
        </CampoFormulario>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">Duração do desconto</p>
        <div className="flex flex-wrap items-center gap-2">
          {[1, 3, 6, 12].map((m) => (
            <button
              key={m}
              type="button"
              disabled={travado}
              onClick={() => form.setValue('duracaoMeses', m)}
              className={cn('rounded-full px-3 py-1.5 text-sm font-semibold ring-1 disabled:cursor-not-allowed disabled:opacity-50', Number(v.duracaoMeses) === m ? 'bg-grafite text-white ring-tinta' : 'bg-card text-tinta ring-border hover:bg-fundo')}
            >
              {m === 1 ? '1ª mensalidade' : `${m} meses`}
            </button>
          ))}
          <button
            type="button"
            disabled={travado}
            onClick={() => form.setValue('duracaoMeses', '')}
            className={cn('rounded-full px-3 py-1.5 text-sm font-semibold ring-1 disabled:cursor-not-allowed disabled:opacity-50', paraSempre ? 'bg-grafite text-white ring-tinta' : 'bg-card text-tinta ring-border hover:bg-fundo')}
          >
            Para sempre
          </button>
          <span className="flex items-center gap-2 text-sm text-texto-secundario">
            ou
            <Input aria-label="Meses de desconto" type="number" min={1} max={36} className="w-20" disabled={travado} value={paraSempre ? '' : String(v.duracaoMeses)} onChange={(e) => form.setValue('duracaoMeses', e.target.value)} />
            meses
          </span>
        </div>
        {errors.duracaoMeses?.message && <p className="text-xs text-coral-escuro">{errors.duracaoMeses.message}</p>}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <CampoFormulario id="cp-validade" rotulo="Pode ser usado até (opcional)" erro={errors.validoAte?.message}>
          <Input id="cp-validade" type="date" {...form.register('validoAte')} />
        </CampoFormulario>
        <CampoFormulario id="cp-limite" rotulo="Limite de empresas (vazio = sem limite)" erro={errors.limiteUsos?.message}>
          <Input id="cp-limite" type="number" min={1} {...form.register('limiteUsos')} />
        </CampoFormulario>
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Planos (nenhum marcado = vale para todos)</legend>
        <div className="flex flex-wrap gap-2">
          {planos.data
            ?.filter((p) => p.ativo)
            .map((p) => {
              const sel = planosSel.includes(p.codigo)
              return (
                <button
                  key={p.codigo}
                  type="button"
                  aria-pressed={sel}
                  onClick={() => form.setValue('planos', sel ? planosSel.filter((x) => x !== p.codigo) : [...planosSel, p.codigo])}
                  className={cn('inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ring-1', sel ? 'bg-marca-suave text-marca-escuro ring-marca' : 'bg-card text-tinta ring-border hover:bg-fundo')}
                >
                  {sel && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                  {p.nome}
                </button>
              )
            })}
        </div>
      </fieldset>

      <label className="flex items-center gap-2 text-sm">
        <Checkbox {...form.register('ativo')} /> Ativo (pode ser usado em novos cadastros e aplicado pelo suporte)
      </label>
      {cupom && (
        <p className="text-xs text-texto-secundario">
          Criado em {formatarDataSimples(cupom.criadoEm)} · {cupom.usos} uso(s)
        </p>
      )}
    </FormDialog>
  )
}
