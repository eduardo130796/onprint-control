import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import type { WhatsappConfig } from '@onprint/shared'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { useAssistente } from '@/features/assistente/useAssistente'
import { Interruptor } from '@/features/vitrine/components/Interruptor'

const PASSOS = [
  { titulo: 'Reaja com 📝', texto: 'numa mensagem do cliente pedindo preço, no celular ou no WhatsApp Web.' },
  { titulo: 'O Assistente monta', texto: 'o orçamento com o que o cliente escreveu e te avisa na sua conversa "Você" (mensagem para você mesmo).' },
  { titulo: 'Responda ok', texto: 'em cima do aviso para enviar ao cliente, com o PDF. Ou abra o link para ajustar antes.' },
]

/**
 * Assistente no WhatsApp: como usar (📝 na conversa e a conversa "Você") e o interruptor. A conversa continua no
 * WhatsApp; o sistema trabalha nos bastidores (o orçamento fica salvo como rascunho, com o selo "do WhatsApp").
 */
export function CopilotoCard({ config, podeEditar }: { config: WhatsappConfig; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const assistente = useAssistente()
  const salvar = useMutation({
    mutationFn: (ligado: boolean) =>
      whatsappApi.salvar({
        eventos: config.eventos,
        horarioInicio: config.horarioInicio,
        horarioFim: config.horarioFim,
        pausado: config.pausado,
        assistenteWhatsapp: ligado,
      }),
    onSuccess: (c) => {
      queryClient.setQueryData(CHAVE_WHATSAPP, c)
      toast.success(c.assistenteWhatsapp ? 'Assistente no WhatsApp ligado.' : 'Assistente no WhatsApp desligado.')
    },
    onError: (e) => toast.error((e as Error).message),
  })
  const desligadoNaEmpresa = config.assistenteDisponivel && assistente.data && !assistente.data.controles.ativo

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <NotebookPen className="h-5 w-5 text-marca-escuro" aria-hidden="true" /> Assistente no WhatsApp
        </CardTitle>
        <CardDescription>Converse com o cliente no WhatsApp, como sempre. O sistema trabalha nos bastidores.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <ol className="grid gap-3 sm:grid-cols-3">
          {PASSOS.map((p, i) => (
            <li key={p.titulo} className="rounded-xl bg-fundo p-3 text-sm">
              <p className="font-medium text-tinta">
                {i + 1}. {p.titulo}
              </p>
              <p className="mt-0.5 text-texto-secundario">{p.texto}</p>
            </li>
          ))}
        </ol>
        <p className="text-xs text-texto-secundario">
          Na conversa "Você" também dá para perguntar ("quem está devendo?", "quanto vendi hoje?"), pedir um orçamento ("orçamento pra Ana: 2 banners 2x1") ou mandar a
          foto da nota de compra. Nada sai para o cliente sem o seu ok. Quando o cliente aprova, o Assistente aprova sozinho só se nada mudou depois do envio; se vocês conversaram ou o orçamento mudou, ele te pergunta no “Você”.
        </p>
        <div className="flex items-start gap-3 rounded-xl border border-tinta/10 p-3">
          <Interruptor
            rotulo="Assistente no WhatsApp (📝 e conversa Você)"
            marcado={config.assistenteWhatsapp}
            desabilitado={!podeEditar || salvar.isPending}
            onMudar={(v) => salvar.mutate(v)}
            className="mt-0.5"
          />
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-sm font-medium text-tinta">
              Assistente no WhatsApp (📝 e conversa Você) {salvar.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            </p>
            <p className="text-xs text-texto-secundario">Desligado, a 📝 e a conversa "Você" não fazem nada. Usa o limite do mês do Assistente GrafyGo.</p>
            {!config.assistenteDisponivel && <p className="mt-1 text-xs font-medium text-amber-800">O Assistente ainda não foi liberado pela GrafyGo.</p>}
            {desligadoNaEmpresa && (
              <p className="mt-1 text-xs font-medium text-amber-800">
                O Assistente está desligado em{' '}
                <Link to="/configuracoes/assistente" className="underline">
                  Configurações → Assistente GrafyGo
                </Link>
                .
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
