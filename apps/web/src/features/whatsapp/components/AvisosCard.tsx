import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Pencil, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { EVENTOS_WHATSAPP, EVENTO_WHATSAPP_DESCRICOES, EVENTO_WHATSAPP_ROTULOS, whatsappConfigSchema, type EventoWhatsapp, type WhatsappConfig } from '@onprint/shared'
import { templatesApi } from '@/api/configuracoes'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { Interruptor } from '@/features/vitrine/components/Interruptor'
import { previaDoEvento } from '../previa'
import { BolhaWhatsapp } from './BolhaWhatsapp'
import { FormatoAprovacaoEscolha } from './FormatoAprovacao'

/** Quais avisos saem, em que horário, e a pausa geral. Cada aviso mostra a prévia do texto (template da categoria). */
export function AvisosCard({ config, podeEditar }: { config: WhatsappConfig; podeEditar: boolean }) {
  const queryClient = useQueryClient()
  const { usuario } = useAuth()
  const templates = useQuery({ queryKey: ['templates'], queryFn: templatesApi.listar })
  const [eventos, setEventos] = useState<EventoWhatsapp[]>(config.eventos)
  const [inicio, setInicio] = useState(config.horarioInicio)
  const [fim, setFim] = useState(config.horarioFim)
  const [pausado, setPausado] = useState(config.pausado)
  const [aprovarSozinho, setAprovarSozinho] = useState(config.aprovarPelaResposta)
  const [formato, setFormato] = useState(config.formatoAprovacao)
  const [assistente, setAssistente] = useState(config.assistenteRespostas)
  const [aberto, setAberto] = useState<EventoWhatsapp | null>(null)
  const alterado =
    aprovarSozinho !== config.aprovarPelaResposta ||
    formato !== config.formatoAprovacao ||
    assistente !== config.assistenteRespostas ||
    pausado !== config.pausado || inicio !== config.horarioInicio || fim !== config.horarioFim || [...eventos].sort().join() !== [...config.eventos].sort().join()

  const salvar = useMutation({
    mutationFn: whatsappApi.salvar,
    onSuccess: (c) => {
      queryClient.setQueryData(CHAVE_WHATSAPP, c)
      toast.success('Avisos do WhatsApp salvos.')
    },
    onError: (e) => toast.error((e as Error).message),
  })

  function enviar() {
    const dados = whatsappConfigSchema.safeParse({ eventos, horarioInicio: inicio, horarioFim: fim, pausado, aprovarPelaResposta: aprovarSozinho, formatoAprovacao: formato, assistenteRespostas: assistente })
    if (!dados.success) return toast.error(dados.error.issues[0]?.message ?? 'Verifique o horário.')
    salvar.mutate(dados.data)
  }

  const empresa = { nome: usuario?.empresa.exibicao ?? 'Sua gráfica', slug: usuario?.empresa.slug ?? 'sua-grafica', origem: window.location.origin }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avisos automáticos</CardTitle>
        <CardDescription>
          O cliente recebe estes avisos no WhatsApp quando o pedido avança. O texto vem das mensagens prontas. Cada aviso espera 2 minutos na fila: avisos do
          mesmo pedido que se encontram ali (ex.: pedido confirmado e a arte) saem numa mensagem só.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <fieldset disabled={!podeEditar || salvar.isPending} className="space-y-5">
          <ul className="divide-y divide-tinta/10 rounded-xl border border-tinta/10">
            {EVENTOS_WHATSAPP.map((evento) => {
              const ligado = eventos.includes(evento)
              return (
                <li key={evento} className="p-3">
                  <div className="flex items-start gap-3">
                    <Interruptor
                      rotulo={EVENTO_WHATSAPP_ROTULOS[evento]}
                      marcado={ligado}
                      desabilitado={!podeEditar}
                      onMudar={(v) => setEventos((atual) => (v ? [...atual, evento] : atual.filter((e) => e !== evento)))}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-tinta">{EVENTO_WHATSAPP_ROTULOS[evento]}</p>
                      <p className="text-xs text-texto-secundario">{EVENTO_WHATSAPP_DESCRICOES[evento]}</p>
                      <button
                        type="button"
                        className="-ml-2 mt-1 flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-marca-escuro hover:bg-marca-suave"
                        aria-expanded={aberto === evento}
                        onClick={() => setAberto(aberto === evento ? null : evento)}
                      >
                        Ver mensagem <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', aberto === evento && 'rotate-180')} />
                      </button>
                    </div>
                  </div>
                  {aberto === evento && (
                    <div className="mt-3 space-y-2 sm:pl-14">
                      <BolhaWhatsapp texto={previaDoEvento(evento, templates.data, empresa)} />
                      <Link to="/configuracoes/templates" className="inline-flex items-center gap-1 text-xs font-medium text-marca-escuro hover:underline">
                        <Pencil className="h-3 w-3" /> Editar o texto em Mensagens prontas
                      </Link>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1 text-sm font-medium text-tinta">Horário de envio</p>
              <div className="flex items-center gap-2">
                <Input type="time" aria-label="Início" value={inicio} onChange={(e) => setInicio(e.target.value)} className="w-28" />
                <span className="text-sm text-texto-secundario">às</span>
                <Input type="time" aria-label="Fim" value={fim} onChange={(e) => setFim(e.target.value)} className="w-28" />
              </div>
              <p className="mt-1 text-xs text-texto-secundario">Fora do horário (de Brasília), os avisos esperam e saem na abertura.</p>
            </div>
            <div className="flex items-start gap-3">
              <Interruptor rotulo="Pausar os avisos" marcado={pausado} onMudar={setPausado} desabilitado={!podeEditar} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-tinta">Pausar os avisos</p>
                <p className="text-xs text-texto-secundario">Nada sai enquanto estiver pausado. Avisos parados há mais de 48 horas são descartados.</p>
              </div>
            </div>
          </div>

          <div className="space-y-4 rounded-xl border border-tinta/10 p-3">
            <FormatoAprovacaoEscolha valor={formato} onMudar={setFormato} desabilitado={!podeEditar} />
            <div className="flex items-start gap-3 border-t border-tinta/10 pt-3">
              <Interruptor rotulo="Aprovar sozinho quando o cliente responder Aprovado" marcado={aprovarSozinho} onMudar={setAprovarSozinho} desabilitado={!podeEditar} className="mt-0.5" />
              <div>
                <p className="text-sm font-medium text-tinta">Aprovar sozinho quando o cliente responder Aprovado</p>
                <p className="text-xs text-texto-secundario">
                  {formato === 'enquete' ? 'Se o cliente tocar em Aprovado' : 'Se o cliente responder 1'} (ou escrever APROVADO), o orçamento é aprovado e vira pedido
                  conforme Configurações → Empresa → Pedidos. Desligado, o vendedor recebe a notificação e confirma. Pedido de modificação
                  {formato === 'enquete' ? '' : ' (o 2)'} sempre volta para negociação e avisa o vendedor.
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 border-t border-tinta/10 pt-3">
              <Interruptor rotulo="Usar o Assistente GrafyGo para entender respostas fora do padrão" marcado={assistente} onMudar={setAssistente} desabilitado={!podeEditar} className="mt-0.5" />
              <div>
                <p className="flex items-center gap-1.5 text-sm font-medium text-tinta">
                  <Sparkles className="h-3.5 w-3.5 shrink-0 text-marca-escuro" aria-hidden="true" /> Usar o Assistente GrafyGo para entender respostas fora do padrão
                </p>
                <p className="text-xs text-texto-secundario">
                  Quando o cliente escreve algo que não é um “aprovado” claro (ex.: “tá ótimo, pode mandar ver” ou “dá pra entregar sexta?”), o Assistente lê a
                  resposta: aprova só quando tem certeza e não há pergunta{aprovarSozinho ? '' : ' (com “aprovar sozinho” desligado, avisa para confirmar)'}, passa
                  para negociação se o cliente pedir ajustes e, no resto, avisa o vendedor com um resumo. O texto vai a um provedor de IA, sem o telefone do cliente.
                </p>
                {!config.assistenteDisponivel && (
                  <p className="mt-1 text-xs font-medium text-amber-800">O Assistente ainda não foi liberado pela GrafyGo: a escolha passa a valer assim que ele for ligado.</p>
                )}
              </div>
            </div>
          </div>
        </fieldset>
        {podeEditar && (
          <div className="flex justify-end">
            <Button onClick={enviar} disabled={!alterado || salvar.isPending}>
              {salvar.isPending ? <Loader2 className="animate-spin" /> : <Save />} Salvar
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
