import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Loader2, Lock, Save, ShieldCheck, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  FUNCOES_ASSISTENTE,
  FUNCOES_ASSISTENTE_INFO,
  NOME_ASSISTENTE,
  RECURSO_IA_ROTULOS,
  type AssistenteEmpresa,
  type ControlesAssistente,
} from '@onprint/shared'
import { CHAVE_ASSISTENTE, assistenteApi } from '@/api/assistente'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Interruptor } from '@/features/vitrine/components/Interruptor'
import { usePermission } from '@/hooks/usePermission'
import { cn } from '@/lib/utils'
import { fraseDoMes } from './frase'
import { useAssistente } from './useAssistente'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

function LinhaControle({ titulo, descricao, marcado, onMudar, desabilitado, children }: { titulo: string; descricao: string; marcado: boolean; onMudar: (v: boolean) => void; desabilitado: boolean; children?: ReactNode }) {
  return (
    <li className={cn('flex items-start gap-3 py-4 first:pt-0 last:pb-0', desabilitado && 'opacity-60')}>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-tinta">{titulo}</p>
        <p className="text-xs text-texto-secundario">{descricao}</p>
        {children}
      </div>
      <Interruptor rotulo={titulo} marcado={marcado} onMudar={onMudar} desabilitado={desabilitado} className="mt-0.5" />
    </li>
  )
}

function Formulario({ dados, podeEditar }: { dados: AssistenteEmpresa; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const [controles, setControles] = useState<ControlesAssistente>(dados.controles)
  const [salvando, setSalvando] = useState(false)
  const alterado = JSON.stringify(controles) !== JSON.stringify(dados.controles)
  const mudar = (d: Partial<ControlesAssistente>) => setControles((c) => ({ ...c, ...d }))

  async function salvar() {
    setSalvando(true)
    try {
      const novo = await assistenteApi.salvar(controles)
      queryClient.setQueryData(CHAVE_ASSISTENTE, novo)
      // A tela do WhatsApp mostra o mesmo ajuste das respostas
      await queryClient.invalidateQueries({ queryKey: ['whatsapp'] })
      toast.success('Assistente salvo.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const { uso } = dados
  const frase = fraseDoMes(uso)
  const [ano, mes] = uso.mes.split('-')
  const pctChamadas = uso.limiteChamadas ? Math.min(100, Math.round((uso.chamadas / uso.limiteChamadas) * 100)) : null
  const pctUso = Math.max(pctChamadas ?? 0, uso.percentualCusto ?? 0)

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
      <div className="min-w-0 space-y-6">
        {!dados.disponivel && (
          <p className="flex items-start gap-2 rounded-2xl bg-ambar/15 p-4 text-sm text-amber-900 dark:text-amber-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />O {NOME_ASSISTENTE} ainda não foi liberado pela GrafyGo. Você já pode escolher o que fica ligado: vale assim que ele for liberado.
          </p>
        )}

        <Card className="p-5 sm:p-6">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-marca text-marca-contraste">
              <Sparkles className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-titulo text-lg font-extrabold text-tinta">Usar o {NOME_ASSISTENTE}</p>
              <p className="text-sm text-texto-secundario">Desligado, nenhuma ajuda funciona e nada vai para o provedor de IA.</p>
            </div>
            <Interruptor rotulo={`Usar o ${NOME_ASSISTENTE}`} marcado={controles.ativo} onMudar={(v) => mudar({ ativo: v })} desabilitado={!podeEditar} className="mt-1" />
          </div>
          <ul className="mt-6 divide-y divide-border border-t border-border pt-4">
            {FUNCOES_ASSISTENTE.map((f) => (
              <LinhaControle
                key={f}
                titulo={FUNCOES_ASSISTENTE_INFO[f].titulo}
                descricao={FUNCOES_ASSISTENTE_INFO[f].descricao}
                marcado={controles[f]}
                onMudar={(v) => mudar({ [f]: v })}
                desabilitado={!podeEditar || !controles.ativo}
              >
                {f === 'respostasWhatsapp' && (
                  <p className="mt-1 text-xs text-texto-secundario">
                    O mesmo ajuste da tela{' '}
                    <Link to="/configuracoes/whatsapp" className="font-medium text-marca-escuro hover:underline">
                      Conexão do WhatsApp
                    </Link>
                    .
                  </p>
                )}
              </LinhaControle>
            ))}
          </ul>
        </Card>

        <Card className="p-5 sm:p-6">
          <ul>
            <LinhaControle
              titulo="Nunca falar com meus clientes"
              descricao="O Assistente fica só nas ajudas da equipe: nada escrito ou decidido por ele chega aos seus clientes. Hoje ele não conversa com clientes; com isto ligado, também não sai a resposta automática do WhatsApp depois de uma leitura dele, e funções futuras que falem com clientes ficam desligadas."
              marcado={controles.semClientes}
              onMudar={(v) => mudar({ semClientes: v })}
              desabilitado={!podeEditar || !controles.ativo}
            />
          </ul>
        </Card>

        {podeEditar ? (
          <div className="flex justify-end">
            <Button onClick={() => void salvar()} disabled={!alterado || salvando}>
              {salvando ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        ) : (
          <p className="flex items-center gap-2 text-sm text-texto-secundario">
            <Lock className="h-4 w-4" /> Só quem edita as configurações da empresa muda estes ajustes.
          </p>
        )}
      </div>

      <aside className="space-y-4">
        <Card className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-texto-secundario">
            Uso em {MESES[Number(mes) - 1]} de {ano}
          </p>
          <p className="mt-1 font-titulo text-2xl font-extrabold tabular-nums text-tinta">
            {uso.chamadas}
            {uso.limiteChamadas !== null && <span className="text-base font-semibold text-texto-secundario"> de {uso.limiteChamadas}</span>}
          </p>
          <p className="text-xs text-texto-secundario">usos do Assistente{uso.limiteChamadas !== null ? ' no limite do mês' : ' (sem limite de usos)'}</p>
          {(pctChamadas !== null || uso.percentualCusto !== null) && (
            <div className="mt-3">
              <div className="h-2 overflow-hidden rounded-full bg-fundo" role="progressbar" aria-valuenow={pctUso} aria-valuemin={0} aria-valuemax={100} aria-label="Uso do limite do mês">
                <div className={cn('h-full rounded-full', pctUso >= 90 ? 'bg-coral' : pctUso >= 70 ? 'bg-ambar' : 'bg-marca')} style={{ width: `${pctUso}%` }} />
              </div>
              <p className="mt-1 text-xs text-texto-secundario">
                {pctUso}% do limite do mês{pctUso >= 100 ? ': as ajudas voltam no mês que vem (ou fale com a GrafyGo).' : '.'}
              </p>
            </div>
          )}
          {frase && <p className="mt-4 rounded-xl bg-marca-suave p-3 text-sm text-marca-escuro">{frase}</p>}
          <ul className="mt-4 space-y-1.5 text-sm">
            {uso.porRecurso.map((r) => (
              <li key={r.recurso} className="flex justify-between gap-2">
                <span className="text-texto-secundario">{RECURSO_IA_ROTULOS[r.recurso]}</span>
                <span className="tabular-nums text-tinta">{r.chamadas}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="space-y-2 p-5 text-sm text-texto-secundario">
          <p className="flex items-center gap-2 font-semibold text-tinta">
            <ShieldCheck className="h-4 w-4 text-marca-escuro" /> O que vai para a IA
          </p>
          <p>Só o texto necessário para cada ajuda e os nomes do seu cadastro. Telefone, CPF/CNPJ e e-mail dos clientes ficam no sistema.</p>
          <p>Preços e custos nunca vêm da IA: o sistema calcula com o seu cadastro. Tudo o que o Assistente sugere aparece marcado para você conferir antes de salvar.</p>
        </Card>
      </aside>
    </div>
  )
}

/** Configurações → Assistente GrafyGo: o que fica ligado na empresa e o uso do mês */
export function AssistentePage() {
  const consulta = useAssistente()
  const podeEditar = usePermission('configuracoes', 'editar')
  return (
    <>
      <PageHeader titulo={NOME_ASSISTENTE} subtitulo="A IA que ajuda a sua equipe no dia a dia. Você escolhe o que fica ligado; tudo o que ela sugere passa por você." />
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full rounded-3xl" />
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <Formulario key={JSON.stringify(consulta.data.controles)} dados={consulta.data} podeEditar={podeEditar} />
      )}
    </>
  )
}
