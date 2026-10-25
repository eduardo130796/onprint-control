import { useState } from 'react'
import { Ban, Check, Info, Lightbulb, Loader2, MessageCircleQuestion, Plus, ShieldAlert, ShieldCheck, Undo2, X } from 'lucide-react'
import { formatarDataHora, formatarMoeda, textosParaCliente, type ResultadoRegras } from '@onprint/shared'
import type { OrcamentoComAnalise } from '@/api/comercial'
import { Gaveta } from '@/components/shared/Gaveta'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/*
 * Regras comerciais no editor do orçamento, em pedaços pequenos onde fazem sentido:
 * - AvisosDasRegras: bloqueio, aprovação do gerente (com "Liberar") e avisos para a equipe — só quando existem;
 * - SugestoesDasRegras: "Pode aplicar: 5% por quantidade [Aplicar]" (uma linha por sugestão, dá para dispensar), o que
 *   já foi aplicado (com "desfazer") e, atrás de um link, a margem para negociar ("só se o cliente pedir");
 * - DetalhesDasRegras: a gaveta do "ver detalhes" dos totais (explicação, o que o cliente vê, o que não somou).
 */

/** Valor com sinal: "− R$ 5,00" / "+ R$ 10,00" */
const comSinal = (v: string) => `${Number(v) < 0 ? '−' : '+'} ${formatarMoeda(Math.abs(Number(v)).toFixed(2))}`

interface AvisosProps {
  regras: ResultadoRegras | null
  orcamento?: OrcamentoComAnalise
  alterado: boolean
  editavel: boolean
  /** Pode aprovar orçamentos (gerente): libera ao salvar e pode clicar em "Liberar" */
  podeAprovar: boolean
  liberando: boolean
  onLiberar: () => void
}

/** Bloqueio e aprovação (travam o envio) e os avisos para a equipe, numa linha fina cada */
export function AvisosDasRegras({ regras, orcamento, alterado, editavel, podeAprovar, liberando, onLiberar }: AvisosProps) {
  const pendenteSalvo = Boolean(orcamento?.liberacaoPendente) && !alterado
  const precisaGerente = Boolean(regras && (regras.aprovacoes.length || regras.bloqueios.length))
  const liberado = !pendenteSalvo && !alterado && precisaGerente && orcamento?.liberadoPor
  if (!regras?.bloqueios.length && !regras?.aprovacoes.length && !regras?.avisos.length && !pendenteSalvo && !liberado) return null

  return (
    <div className="space-y-2 text-sm">
      {regras && regras.bloqueios.length > 0 && (
        <div role="alert" className="rounded-xl bg-coral/10 p-3 text-coral-escuro">
          <p className="flex items-center gap-2 font-medium">
            <Ban className="h-4 w-4 shrink-0" /> Bloqueado pelas regras
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6">
            {regras.bloqueios.map((b, i) => (
              <li key={i}>{b.motivo}</li>
            ))}
          </ul>
          <p className="mt-1 text-xs">Dá para salvar. Só vai para o cliente depois que um gerente liberar.</p>
        </div>
      )}
      {regras && regras.aprovacoes.length > 0 && (
        <div role="status" className="rounded-xl bg-ambar/10 p-3 text-amber-900 dark:text-amber-200">
          <p className="flex items-center gap-2 font-medium">
            <ShieldAlert className="h-4 w-4 shrink-0" /> Precisa da aprovação de um gerente
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-6">
            {regras.aprovacoes.map((a, i) => (
              <li key={i}>{a.motivo}</li>
            ))}
          </ul>
          {editavel && (alterado || !orcamento) && (
            <p className="mt-1 text-xs">{podeAprovar && regras.bloqueios.length === 0 ? 'Você é gerente: ao salvar, já fica liberado.' : 'Dá para salvar. Só vai para o cliente depois que um gerente liberar.'}</p>
          )}
        </div>
      )}
      {pendenteSalvo && (
        <div className="flex flex-col gap-2 rounded-xl border border-ambar/40 p-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
            Esperando um gerente liberar: ainda não pode ir para o cliente.
          </p>
          {podeAprovar && (
            <Button size="sm" onClick={onLiberar} disabled={liberando}>
              {liberando ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {regras?.bloqueios.length ? 'Liberar mesmo assim' : 'Liberar'}
            </Button>
          )}
        </div>
      )}
      {liberado && (
        <p className="flex items-center gap-2 text-green-800 dark:text-green-300">
          <ShieldCheck className="h-4 w-4 shrink-0" /> Liberado por {orcamento!.liberadoPor!.nome}
          {orcamento!.liberadoEm && ` em ${formatarDataHora(orcamento!.liberadoEm)}`}.
        </p>
      )}
      {regras?.avisos.map((a, i) => (
        <p key={i} role="note" className="flex items-start gap-2 rounded-lg border-l-4 border-marca bg-marca-suave px-3 py-1.5 text-marca-escuro">
          <Info className="mt-0.5 h-4 w-4 shrink-0" /> <span className="[overflow-wrap:anywhere]">{a.texto}</span>
        </p>
      ))}
    </div>
  )
}

interface SugestoesProps {
  regras: ResultadoRegras | null
  editavel: boolean
  onAplicar: (regraId: string) => void
  onDesfazer: (regraId: string) => void
  /** Sugestão com produto ("oferecer a criação da arte"): adiciona o item (nunca entra sozinho) */
  onAdicionarProduto: (produtoId: string) => void
}

/** A faixa de sugestões logo acima dos totais (some quando não há nada) */
export function SugestoesDasRegras({ regras, editavel, onAplicar, onDesfazer, onAdicionarProduto }: SugestoesProps) {
  const [dispensadas, setDispensadas] = useState<Set<string>>(new Set())
  const [margemAberta, setMargemAberta] = useState(false)
  if (!regras) return null
  const sugeridas = regras.ofertas.filter((o) => o.modo === 'sugerir' && !dispensadas.has(o.regraId))
  const sePedir = regras.ofertas.filter((o) => o.modo === 'se_pedir')
  const aplicadas = [...new Map(regras.aplicadas.filter((a) => a.aceita).map((a) => [a.regraId, a])).values()]
  const itens = regras.sugestoes.filter((s) => !dispensadas.has(`item-${s.regraId}`))
  const temMargem = sePedir.length > 0 || regras.limiteNegociacao !== null
  if (!sugeridas.length && !aplicadas.length && !itens.length && !temMargem) return null
  const dispensar = (chave: string) => setDispensadas((d) => new Set(d).add(chave))

  return (
    <div className="space-y-1.5 text-sm" aria-label="Sugestões das regras comerciais">
      {sugeridas.map((o) => (
        <div key={o.regraId} className="flex items-center gap-2 rounded-xl bg-ambar/10 px-3 py-2">
          <Lightbulb className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            Pode aplicar: <strong className="font-medium">{o.texto}</strong> <span className="whitespace-nowrap text-texto-secundario">(−{formatarMoeda(o.valor)})</span>
          </span>
          {editavel && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5" onClick={() => onAplicar(o.regraId)}>
              Aplicar
            </Button>
          )}
          <button type="button" className="shrink-0 rounded p-1 text-texto-secundario hover:text-tinta" aria-label={`Dispensar a sugestão ${o.texto}`} onClick={() => dispensar(o.regraId)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      {itens.map((s) => (
        <div key={s.regraId} className={cn('flex items-center gap-2 rounded-xl px-3 py-2', s.obrigatorio ? 'bg-ambar/10' : 'bg-fundo')}>
          <Lightbulb className="h-4 w-4 shrink-0 text-amber-700" aria-hidden="true" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
            {s.obrigatorio ? 'Falta: ' : 'Oferecer: '}
            {s.texto}
          </span>
          {s.produtoId && editavel && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5" onClick={() => onAdicionarProduto(s.produtoId!)}>
              <Plus /> Adicionar
            </Button>
          )}
          {!s.obrigatorio && (
            <button type="button" className="shrink-0 rounded p-1 text-texto-secundario hover:text-tinta" aria-label={`Dispensar: ${s.texto}`} onClick={() => dispensar(`item-${s.regraId}`)}>
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      ))}
      {aplicadas.map((a) => (
        <div key={a.regraId} className="flex items-center gap-2 px-3 py-1 text-green-800 dark:text-green-300">
          <Check className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">Aplicado: {a.texto ?? a.nome}</span>
          {editavel && (
            <button type="button" className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-texto-secundario hover:text-tinta hover:underline" onClick={() => onDesfazer(a.regraId)}>
              <Undo2 className="h-3.5 w-3.5" /> desfazer
            </button>
          )}
        </div>
      ))}
      {temMargem && (
        <div className="px-1">
          <button type="button" aria-expanded={margemAberta} onClick={() => setMargemAberta((v) => !v)} className="inline-flex items-center gap-1 text-xs font-medium text-marca-escuro hover:underline">
            <MessageCircleQuestion className="h-3.5 w-3.5" /> Margem para negociar
          </button>
          {margemAberta && (
            <ul className="mt-1.5 space-y-1.5 rounded-xl border border-border p-3">
              {sePedir.map((o) => (
                <li key={o.regraId} className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                    Se o cliente pedir, pode oferecer até <strong className="font-medium">{o.condicao ? o.efeito : o.texto}</strong>
                    {o.condicao ? ` ${o.condicao}` : ''} <span className="whitespace-nowrap text-texto-secundario">(−{formatarMoeda(o.valor)})</span>
                  </span>
                  {editavel && !o.condicao && (
                    <Button size="sm" variant="outline" className="h-7 shrink-0 px-2.5" onClick={() => onAplicar(o.regraId)}>
                      Aplicar
                    </Button>
                  )}
                </li>
              ))}
              {regras.limiteNegociacao !== null && (
                <li className="text-texto-secundario">
                  Desconto extra até {Number(regras.limiteNegociacao).toLocaleString('pt-BR')}% sem pedir ao gerente
                  {Number(regras.descontoManualPercentual) > 0 && ` (agora: ${Number(regras.descontoManualPercentual).toLocaleString('pt-BR')}%)`}.
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

/** "ver detalhes" dos totais: cada regra com a explicação, o que o cliente vê e o que não somou */
export function DetalhesDasRegras({ regras, aberta, onAbertaChange }: { regras: ResultadoRegras | null; aberta: boolean; onAbertaChange: (v: boolean) => void }) {
  const comValor = regras?.aplicadas.filter((a) => Number(a.valor) !== 0) ?? []
  const paraCliente = regras ? textosParaCliente(regras) : []
  return (
    <Gaveta aberta={aberta} onAbertaChange={onAbertaChange} titulo="Descontos e acréscimos">
      <div className="space-y-5 text-sm">
        {comValor.length === 0 ? (
          <p className="text-texto-secundario">Nenhum desconto ou acréscimo das regras neste orçamento.</p>
        ) : (
          <ul className="divide-y divide-border">
            {comValor.map((a) => (
              <li key={`${a.regraId}-${a.nivel}`} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  <span className="font-medium text-tinta">{a.nome}</span> ({a.efeito.replace(/^[−+]/, '')})
                  <span className="block text-xs text-texto-secundario">
                    {a.nivel === 'item' && a.itens.length > 0 ? `${a.itens.length > 1 ? 'Nos itens' : 'No item'} ${a.itens.map((k) => k + 1).join(', ')}` : 'No total'}
                    {a.aceita ? ' · aplicado pelo vendedor' : ' · automático'}
                  </span>
                </span>
                <span className={cn('shrink-0 font-medium', Number(a.valor) < 0 ? 'text-green-800 dark:text-green-300' : 'text-tinta')}>{comSinal(a.valor)}</span>
              </li>
            ))}
          </ul>
        )}
        {paraCliente.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-texto-secundario">O cliente vê</p>
            <ul className="list-disc space-y-0.5 pl-5">
              {paraCliente.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        {regras && regras.ignoradas.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-texto-secundario">Não entraram</p>
            <ul className="space-y-1 text-texto-secundario">
              {regras.ignoradas.map((g, i) => (
                <li key={i}>
                  <span className="text-texto">{g.nome}</span>: {g.motivo}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </Gaveta>
  )
}
