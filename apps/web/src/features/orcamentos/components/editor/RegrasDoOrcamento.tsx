import { Ban, Info, Lightbulb, Loader2, MessageSquareQuote, Plus, Scale, ShieldAlert, ShieldCheck } from 'lucide-react'
import { formatarDataHora, formatarMoeda, textosParaCliente, type ResultadoRegras } from '@onprint/shared'
import type { OrcamentoComAnalise } from '@/api/comercial'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface RegrasProps {
  /** Resultado ao vivo do motor (o mesmo que a API grava ao salvar) */
  regras: ResultadoRegras | null
  orcamento?: OrcamentoComAnalise
  alterado: boolean
  editavel: boolean
  /** Pode aprovar orçamentos (gerente): libera ao salvar e pode clicar em "Liberar" */
  podeAprovar: boolean
  liberando: boolean
  onLiberar: () => void
  /** Sugestão com produto: adiciona o item (nunca entra sozinho) */
  onAdicionarProduto: (produtoId: string) => void
}

/** Valor com sinal: "− R$ 5,00" / "+ R$ 10,00" */
const comSinal = (v: string) => `${Number(v) < 0 ? '−' : '+'} ${formatarMoeda(Math.abs(Number(v)).toFixed(2))}`

/**
 * Regras comerciais no editor: o que foi aplicado (com a explicação), avisos para a equipe, sugestões com "Adicionar",
 * pedidos de aprovação e bloqueios — e, no orçamento salvo, a liberação do gerente. O sistema aplica; ninguém precisa
 * lembrar das regras.
 */
export function RegrasDoOrcamento({ regras, orcamento, alterado, editavel, podeAprovar, liberando, onLiberar, onAdicionarProduto }: RegrasProps) {
  const pendenteSalvo = Boolean(orcamento?.liberacaoPendente) && !alterado
  const temAlgo = regras && (regras.aplicadas.length || regras.avisos.length || regras.sugestoes.length || regras.aprovacoes.length || regras.bloqueios.length)
  if (!temAlgo && !pendenteSalvo) return null
  const comValor = regras?.aplicadas.filter((a) => Number(a.valor) !== 0) ?? []
  const semValor = regras?.aplicadas.filter((a) => Number(a.valor) === 0 && a.tipo !== 'sugerir_item' && a.tipo !== 'exigir_aprovacao' && a.tipo !== 'bloquear' && a.tipo !== 'aviso') ?? []
  // O mesmo texto da mensagem ({{descontos}}), do PDF e da página de aprovação
  const paraCliente = regras ? textosParaCliente(regras) : []
  const precisaGerente = Boolean(regras && (regras.aprovacoes.length || regras.bloqueios.length))

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Scale className="h-4 w-4 text-texto-secundario" /> Regras comerciais
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {/* Bloqueio e aprovação: o envio fica travado até um gerente liberar */}
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
            <p className="mt-1 text-xs">Dá para salvar; o envio ao cliente só depois de um gerente liberar.</p>
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
              <p className="mt-1 text-xs">
                {podeAprovar && regras.bloqueios.length === 0 ? 'Você pode aprovar: ao salvar, já fica liberado.' : 'Você pode salvar; o envio fica travado até um gerente liberar.'}
              </p>
            )}
          </div>
        )}
        {pendenteSalvo && (
          <div className="flex flex-col gap-2 rounded-xl border border-ambar/40 p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-start gap-2 text-amber-900 dark:text-amber-200">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Esperando um gerente liberar: não pode ser enviado nem aprovado.
            </p>
            {podeAprovar && (
              <Button size="sm" onClick={onLiberar} disabled={liberando}>
                {liberando ? <Loader2 className="animate-spin" /> : <ShieldCheck />} {regras?.bloqueios.length ? 'Liberar mesmo assim' : 'Liberar'}
              </Button>
            )}
          </div>
        )}
        {!pendenteSalvo && !alterado && precisaGerente && orcamento?.liberadoPor && (
          <p className="flex items-center gap-2 text-green-800 dark:text-green-300">
            <ShieldCheck className="h-4 w-4 shrink-0" /> Liberado por {orcamento.liberadoPor.nome}
            {orcamento.liberadoEm && ` em ${formatarDataHora(orcamento.liberadoEm)}`}.
          </p>
        )}

        {regras && regras.avisos.length > 0 && (
          <ul className="space-y-1.5">
            {regras.avisos.map((a, i) => (
              <li key={i} className="flex items-start gap-2 rounded-xl bg-marca-suave px-3 py-2 text-marca-escuro">
                <Info className="mt-0.5 h-4 w-4 shrink-0" /> <span className="[overflow-wrap:anywhere]">{a.texto}</span>
              </li>
            ))}
          </ul>
        )}

        {regras && regras.sugestoes.length > 0 && (
          <ul className="space-y-1.5">
            {regras.sugestoes.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-dashed border-border px-3 py-2">
                <span className="flex items-start gap-2">
                  <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ambar" />
                  <span>
                    {s.obrigatorio ? 'Obrigatório: ' : 'Sugestão: '}
                    {s.texto}
                  </span>
                </span>
                {s.produtoId && editavel && (
                  <Button size="sm" variant="outline" onClick={() => onAdicionarProduto(s.produtoId!)}>
                    <Plus /> Adicionar
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}

        {comValor.length > 0 && (
          <div>
            <p className="mb-1 text-xs font-medium uppercase tracking-wide text-texto-secundario">Regras aplicadas</p>
            <ul className="space-y-1">
              {comValor.map((a) => (
                <li key={`${a.regraId}-${a.nivel}`} className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 [overflow-wrap:anywhere]">
                    {a.nome} ({a.efeito})
                    {a.nivel === 'item' && a.itens.length > 0 && <span className="text-texto-secundario"> · item {a.itens.map((k) => k + 1).join(', ')}</span>}
                  </span>
                  <span className={Number(a.valor) < 0 ? 'shrink-0 font-medium text-green-800 dark:text-green-300' : 'shrink-0 font-medium text-tinta'}>{comSinal(a.valor)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        {semValor.length > 0 && (
          <ul className="space-y-0.5 text-texto-secundario">
            {semValor.map((a) => (
              <li key={a.regraId}>{a.explicacao}</li>
            ))}
          </ul>
        )}
        {regras && regras.ignoradas.length > 0 && (
          <ul className="space-y-0.5 text-xs text-texto-secundario">
            {regras.ignoradas.map((g, i) => (
              <li key={i}>
                <span className="line-through">{g.nome}</span> — {g.motivo}
              </li>
            ))}
          </ul>
        )}
        {paraCliente.length > 0 && (
          <p className="flex items-start gap-2 border-t border-border pt-3 text-texto-secundario">
            <MessageSquareQuote className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              O cliente vê: <span className="text-texto">{paraCliente.join(' · ')}</span>
            </span>
          </p>
        )}
      </CardContent>
    </Card>
  )
}
