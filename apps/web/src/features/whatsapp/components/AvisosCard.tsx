import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, Pencil, Save, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import { EVENTOS_WHATSAPP, EVENTO_WHATSAPP_DESCRICOES, EVENTO_WHATSAPP_ROTULOS, whatsappConfigSchema, type EventoWhatsapp, type WhatsappConfig } from '@onprint/shared'
import { templatesApi } from '@/api/configuracoes'
import { CHAVE_ASSISTENTE } from '@/api/assistente'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { useAssistente } from '@/features/assistente/useAssistente'
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
  // Chave geral do Assistente na empresa (Configurações → Assistente GrafyGo)
  const assistenteEmpresa = useAssistente()
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
      // O mesmo ajuste aparece em Configurações → Assistente GrafyGo
      void queryClient.invalidateQueries({ queryKey: CHAVE_ASSISTENTE })
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
          O cliente recebe estes avisos no WhatsApp quando o pedido avança. Avisos do mesmo pedido que saem juntos viram uma mensagem só.
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
                <p className="text-xs text-texto-secundario">Nada sai enquanto estiver pausado. O que ficar parado mais de 2 dias não sai mais.</p>
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
                  {formato === 'enquete' ? 'O cliente tocou em Aprovado (ou escreveu APROVADO)' : formato === 'numeros' ? 'O cliente respondeu 1 (ou escreveu APROVADO)' : 'O cliente respondeu “pode fazer”, “fechado”, 👍…'}: o orçamento é aprovado sem ninguém clicar.
                  Aprova sozinho só quando nada mudou depois do envio; se vocês conversaram ou o orçamento mudou, ele te pergunta no “Você” (ou avisa no sino). Desligado, o vendedor recebe o aviso e confirma. Pedido de mudança sempre avisa o vendedor.
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
                  Entende respostas como “tá ótimo, pode mandar ver” ou “dá pra entregar sexta?”. Só aprova quando tem certeza{aprovarSozinho ? '' : ' (e, com “aprovar sozinho” desligado, pede para o vendedor confirmar)'}; no resto, avisa o vendedor com um resumo.
                </p>
                {!config.assistenteDisponivel && (
                  <p className="mt-1 text-xs font-medium text-amber-800">O Assistente ainda não foi liberado pela GrafyGo. A escolha vale quando ele for liberado.</p>
                )}
                {config.assistenteDisponivel && assistenteEmpresa.data && !assistenteEmpresa.data.controles.ativo && (
                  <p className="mt-1 text-xs font-medium text-amber-800">
                    O Assistente está desligado para a empresa em{' '}
                    <Link to="/configuracoes/assistente" className="underline">
                      Configurações → Assistente GrafyGo
                    </Link>
                    : a escolha vale quando ele for ligado.
                  </p>
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
