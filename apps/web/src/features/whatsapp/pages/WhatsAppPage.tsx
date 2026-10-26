import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Lock, PauseCircle } from 'lucide-react'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Card } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissoes } from '@/hooks/usePermission'
import { AvisosCard } from '../components/AvisosCard'
import { ConexaoCard } from '../components/ConexaoCard'
import { CopilotoCard } from '../components/CopilotoCard'
import { MensagensCard } from '../components/MensagensCard'

function Faixa({ icone: Icone, children, tom }: { icone: typeof Lock; children: React.ReactNode; tom: 'alerta' | 'info' }) {
  return (
    <div role="status" className={tom === 'alerta' ? 'flex gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900' : 'flex gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900'}>
      <Icone className="mt-0.5 h-4 w-4 shrink-0" />
      <div>{children}</div>
    </div>
  )
}

/** WhatsApp: o Assistente nas conversas (📝 e a conversa "Você"), a conexão do número da gráfica pelo QR code e os avisos automáticos dos pedidos. */
export function WhatsAppPage({ titulo = 'WhatsApp' }: { titulo?: string }) {
  const pode = usePermissoes()
  const podeEditar = pode('whatsapp', 'editar')
  const consulta = useQuery({ queryKey: CHAVE_WHATSAPP, queryFn: whatsappApi.config })
  const c = consulta.data

  return (
    <>
      <PageHeader titulo={titulo} subtitulo="O Assistente nas suas conversas e os avisos dos pedidos, pelo número da própria gráfica." />
      {consulta.isPending ? (
        <div className="space-y-4">
          <Skeleton className="h-36 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : consulta.isError ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-6">
          {!c!.liberadoNoPlano && (
            <Faixa icone={Lock} tom="alerta">
              <strong>O WhatsApp não faz parte do seu plano.</strong> Deixe os avisos prontos: eles começam a sair quando o módulo for liberado (fale com a GrafyGo).
            </Faixa>
          )}
          {c!.provedor === 'log' && (
            <Faixa icone={FlaskConical} tom="info">
              <strong>Modo de teste.</strong> Este servidor não está ligado ao WhatsApp: os avisos aparecem na lista abaixo como enviados, mas nenhuma mensagem sai de verdade.
            </Faixa>
          )}
          {c!.pausado && (
            <Faixa icone={PauseCircle} tom="alerta">
              <strong>Avisos pausados.</strong> {c!.pendentes ? `${c!.pendentes} aviso(s) esperando na fila.` : 'Nenhum aviso sai enquanto estiver pausado.'}
            </Faixa>
          )}
          {/* O dia a dia primeiro: como usar o Assistente no WhatsApp (📝 e a conversa "Você") e o interruptor */}
          <CopilotoCard config={c!} podeEditar={podeEditar} />
          <ConexaoCard config={c!} podeEditar={podeEditar} />
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            {/* A chave remonta o formulário quando a configuração salva muda */}
            <AvisosCard key={`${c!.eventos.join()}|${c!.horarioInicio}|${c!.horarioFim}|${c!.pausado}|${c!.aprovarPelaResposta}|${c!.formatoAprovacao}|${c!.assistenteRespostas}`} config={c!} podeEditar={podeEditar} />
            <MensagensCard podeEditar={podeEditar} conectado={c!.estado === 'conectado'} />
          </div>
        </div>
      )}
    </>
  )
}
