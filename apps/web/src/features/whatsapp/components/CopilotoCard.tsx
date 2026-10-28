import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, NotebookPen } from 'lucide-react'
import { toast } from 'sonner'
import { formatarMoeda, type WhatsappConfig, type WhatsappConfigInput } from '@onprint/shared'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useAssistente } from '@/features/assistente/useAssistente'
import { Interruptor } from '@/features/vitrine/components/Interruptor'

const ESPERAS = [3, 5, 10, 15] as const
type Mudanca = Pick<WhatsappConfigInput, 'assistenteWhatsapp' | 'atendenteAtivo' | 'atendenteEsperaMin' | 'atendenteEnvia' | 'atendenteLimite'>

/** "500", "R$ 1.250,50" → número; vazio → null (sem limite); inválido → undefined */
function lerLimite(texto: string): number | null | undefined {
  const t = texto.replace(/r\$|\s/gi, '')
  if (!t) return null
  const n = Number(t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : t)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/**
 * Envio sozinho: o atendente manda o orçamento quando está tudo certo (itens no catálogo, nada a confirmar, sem
 * liberação de gerente, sem o cliente pedir desconto) e o total vai até o limite. Fora disso, fica o rascunho para o ok.
 */
function EnvioSozinho({ config, podeEditar, salvando, onSalvar }: { config: WhatsappConfig; podeEditar: boolean; salvando: boolean; onSalvar: (m: Mudanca) => void }) {
  const [limite, setLimite] = useState(config.atendenteLimite === null ? '' : String(config.atendenteLimite).replace('.', ','))
  const gravarLimite = () => {
    const v = lerLimite(limite)
    if (v === undefined) return toast.error('Limite inválido: use um valor como 500 ou 1.200,00 (vazio = sem limite).')
    if (v !== config.atendenteLimite) onSalvar({ atendenteLimite: v })
  }
  return (
    <div className="mt-3 space-y-2 rounded-lg bg-fundo p-3">
      <div className="flex items-start gap-3">
        <Interruptor rotulo="Enviar o orçamento sozinho" marcado={config.atendenteEnvia} desabilitado={!podeEditar || salvando} onMudar={(v) => onSalvar({ atendenteEnvia: v })} className="mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-tinta">Enviar o orçamento sozinho quando estiver tudo certo</p>
          <p className="text-xs text-texto-secundario">
            Só envia com todos os itens no catálogo, nada a confirmar com o cliente, nenhuma regra pedindo liberação e sem o cliente pedir desconto. O valor é sempre o do sistema.
            Fora disso, o orçamento fica esperando o seu ok. Você recebe no “Você” o que foi enviado.
          </p>
        </div>
      </div>
      {config.atendenteEnvia && (
        <label className="flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
          Até
          <Input
            aria-label="Limite de valor para enviar sozinho"
            className="h-8 w-32 text-xs"
            inputMode="decimal"
            placeholder="sem limite"
            value={limite}
            disabled={!podeEditar || salvando}
            onChange={(e) => setLimite(e.target.value)}
            onBlur={gravarLimite}
            onKeyDown={(e) => e.key === 'Enter' && gravarLimite()}
          />
          por orçamento (vazio = sem limite).
        </label>
      )}
    </div>
  )
}

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
    mutationFn: (mudanca: Mudanca) =>
      whatsappApi.salvar({
        eventos: config.eventos,
        horarioInicio: config.horarioInicio,
        horarioFim: config.horarioFim,
        pausado: config.pausado,
        ...mudanca,
      }),
    onSuccess: (c, mudanca) => {
      queryClient.setQueryData(CHAVE_WHATSAPP, c)
      if (mudanca.assistenteWhatsapp !== undefined) toast.success(c.assistenteWhatsapp ? 'Assistente no WhatsApp ligado.' : 'Assistente no WhatsApp desligado.')
      else if (mudanca.atendenteAtivo !== undefined) toast.success(c.atendenteAtivo ? 'Atendente ligado.' : 'Atendente desligado.')
      else if (mudanca.atendenteEnvia !== undefined) toast.success(c.atendenteEnvia ? 'O atendente envia o orçamento sozinho quando estiver tudo certo.' : 'O atendente só prepara o orçamento; o envio é com você.')
      else if (mudanca.atendenteLimite !== undefined) toast.success(c.atendenteLimite === null ? 'Envio sozinho sem limite de valor.' : `Envio sozinho até ${formatarMoeda(c.atendenteLimite)}.`)
      else toast.success(`O atendente entra depois de ${c.atendenteEsperaMin} minutos sem resposta.`)
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
            onMudar={(v) => salvar.mutate({ assistenteWhatsapp: v })}
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
        <div className="flex items-start gap-3 rounded-xl border border-tinta/10 p-3">
          <Interruptor
            rotulo="Atender quando ninguém responder"
            marcado={config.atendenteAtivo}
            desabilitado={!podeEditar || salvar.isPending || !config.assistenteWhatsapp}
            dica={config.assistenteWhatsapp ? undefined : 'Ligue o Assistente no WhatsApp primeiro'}
            onMudar={(v) => salvar.mutate({ atendenteAtivo: v })}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-tinta">Atender quando ninguém responder</p>
            <p className="text-xs text-texto-secundario">
              Se o cliente ficar sem resposta, o Assistente atende pela gráfica: diz o que anotou, pergunta o que falta e deixa o orçamento pronto no seu “Você” para o ok (ou envia
              sozinho, se você ligar abaixo). Quando você ou a equipe falam com o cliente, ele sai da conversa; se o cliente pedir uma pessoa, ele te chama e para.
            </p>
            <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-texto-secundario">
              Entra depois de
              <Select
                aria-label="Minutos sem resposta"
                className="h-8 w-28 text-xs"
                value={config.atendenteEsperaMin}
                disabled={!podeEditar || salvar.isPending || !config.assistenteWhatsapp}
                onChange={(e) => salvar.mutate({ atendenteEsperaMin: Number(e.target.value) as Mudanca['atendenteEsperaMin'] })}
              >
                {ESPERAS.map((m) => (
                  <option key={m} value={m}>
                    {m} minutos
                  </option>
                ))}
              </Select>
              sem resposta.
            </label>
            {config.atendenteAtivo && <EnvioSozinho config={config} podeEditar={podeEditar} salvando={salvar.isPending} onSalvar={(m) => salvar.mutate(m)} />}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
