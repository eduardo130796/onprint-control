import type {
  CategoriaMensagemPedido,
  ConexaoWhatsapp,
  ContatoWhatsapp,
  ConversaWhatsapp,
  DisponibilidadeWhatsapp,
  EnvioWhatsappInput,
  MensagemWhatsapp,
  OrcamentoDaConversa,
  Paginado,
  PedidosDaConversa,
  ResultadoEnvioWhatsapp,
  SituacaoConversa,
  StatusMensagemWhatsapp,
  WhatsappConfig,
  WhatsappConfigInput,
} from '@onprint/shared'
import { http, qs, upload } from './http'

export const CHAVE_WHATSAPP = ['whatsapp'] as const

/** WhatsApp da gráfica: conexão pelo QR code e avisos automáticos dos pedidos. */
export const whatsappApi = {
  config: () => http<WhatsappConfig>('/whatsapp'),
  salvar: (dados: WhatsappConfigInput) => http<WhatsappConfig>('/whatsapp', { method: 'PUT', body: dados }),
  /** Consulta a conexão agora (repetido enquanto o QR está na tela) */
  estado: () => http<WhatsappConfig>('/whatsapp/estado'),
  conectar: () => http<ConexaoWhatsapp>('/whatsapp/conectar', { method: 'POST' }),
  desconectar: () => http<WhatsappConfig>('/whatsapp/desconectar', { method: 'POST' }),
  mensagens: (q: { status?: StatusMensagemWhatsapp; page?: number; pageSize?: number }) => http<Paginado<MensagemWhatsapp>>(`/whatsapp/mensagens${qs(q)}`),
  reenviar: (id: string) => http<MensagemWhatsapp>(`/whatsapp/mensagens/${id}/reenviar`, { method: 'POST' }),
  ignorar: (id: string) => http<MensagemWhatsapp>(`/whatsapp/mensagens/${id}/ignorar`, { method: 'POST' }),

  /** "Enviar pelo WhatsApp": sai pela conexão da gráfica ou o diálogo abre o WhatsApp (qualquer usuário logado) */
  disponivel: () => http<DisponibilidadeWhatsapp>('/whatsapp/disponivel'),
  /** Mensagem do pedido já preenchida pela API (o mesmo texto do aviso automático) */
  mensagemPedido: (pedidoId: string, tipo: CategoriaMensagemPedido) => http<{ texto: string }>(`/whatsapp/pedidos/${pedidoId}/mensagem${qs({ tipo })}`),
  enviar: (dados: EnvioWhatsappInput) => http<ResultadoEnvioWhatsapp>('/whatsapp/enviar', { method: 'POST', body: dados }),
  /** Com o PDF junto (o texto sai primeiro, com o link no fim; depois o arquivo) */
  enviarComPdf: (dados: EnvioWhatsappInput, pdf: File) => upload<ResultadoEnvioWhatsapp>('/whatsapp/enviar-com-pdf', pdf, undefined, false, { dados: JSON.stringify(dados) }),

  // ─── Conversas do WhatsApp (mensagens dos clientes com as ações de um toque) ───
  conversas: (q: { situacao?: SituacaoConversa; page?: number; pageSize?: number }) => http<Paginado<ConversaWhatsapp>>(`/whatsapp/conversas${qs(q)}`),
  contagemConversas: () => http<{ abertas: number }>('/whatsapp/conversas/contagem'),
  /** O texto da conversa vira o orçamento (itens pelo Assistente; cliente achado ou pré-cadastro do remetente) */
  montarOrcamento: (id: string) => http<OrcamentoDaConversa>(`/whatsapp/conversas/${id}/orcamento`, { method: 'POST' }),
  pedidosDaConversa: (id: string) => http<PedidosDaConversa>(`/whatsapp/conversas/${id}/pedidos`),
  resolverConversa: (id: string) => http<ConversaWhatsapp>(`/whatsapp/conversas/${id}/resolver`, { method: 'POST' }),
  reabrirConversa: (id: string) => http<ConversaWhatsapp>(`/whatsapp/conversas/${id}/reabrir`, { method: 'POST' }),
  /** O orçamento montado a partir da conversa foi salvo: liga os dois (e resolve a conversa) */
  vincularConversa: (id: string, orcamentoId: string) => http<ConversaWhatsapp>(`/whatsapp/conversas/${id}/vincular`, { method: 'POST', body: { orcamentoId } }),
  /** Contatos pelo nome ou número (quem já escreveu e os clientes com WhatsApp): sem copiar número */
  contatos: (busca: string) => http<ContatoWhatsapp[]>(`/whatsapp/contatos${qs({ busca: busca || undefined })}`),
}

export const CHAVE_CONVERSAS = [...CHAVE_WHATSAPP, 'conversas'] as const
