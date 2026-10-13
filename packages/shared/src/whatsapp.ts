/**
 * Avisos automáticos do pedido pelo WhatsApp da própria gráfica (Evolution API, conexão por QR code).
 * Só alguns eventos do pedido, para clientes que já conversam com a gráfica: nada de envio em massa.
 */
import { z } from 'zod'
import { somenteDigitos } from './format'
import type { VariavelTemplate } from './enums'

/** Eventos que geram aviso; cada um usa o template da categoria de mesmo nome. */
export const EVENTOS_WHATSAPP = ['pedido_confirmado', 'arte_aprovacao', 'pedido_pronto', 'pedido_em_entrega', 'pagamento_recebido', 'pedido_entregue'] as const
export type EventoWhatsapp = (typeof EVENTOS_WHATSAPP)[number]

/** Ligados numa empresa nova */
export const EVENTOS_WHATSAPP_PADRAO: readonly EventoWhatsapp[] = ['pedido_confirmado', 'arte_aprovacao', 'pedido_pronto', 'pedido_em_entrega']

export const EVENTO_WHATSAPP_ROTULOS: Record<EventoWhatsapp, string> = {
  pedido_confirmado: 'Pedido confirmado',
  arte_aprovacao: 'Arte para aprovação',
  pedido_pronto: 'Pedido pronto',
  pedido_em_entrega: 'Saiu para entrega',
  pagamento_recebido: 'Pagamento recebido',
  pedido_entregue: 'Pedido entregue',
}

export const EVENTO_WHATSAPP_DESCRICOES: Record<EventoWhatsapp, string> = {
  pedido_confirmado: 'Quando o orçamento aprovado vira pedido. Leva o link para acompanhar o pedido.',
  arte_aprovacao: 'Quando a arte é enviada ao cliente. Leva o link para ver e aprovar a arte.',
  pedido_pronto: 'Quando o pedido fica pronto para retirada ou entrega.',
  pedido_em_entrega: 'Quando o pedido sai para entrega.',
  pagamento_recebido: 'A cada pagamento do pedido registrado no financeiro ou no caixa.',
  pedido_entregue: 'Quando a entrega ou retirada é registrada.',
}

/**
 * Textos padrão (também os templates criados para cada empresa). A última linha assina com o nome da gráfica.
 * Linhas com link vazio somem (preencherMensagem).
 */
export const TEXTOS_PADRAO_WHATSAPP: Record<EventoWhatsapp, string> = {
  pedido_confirmado:
    'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} foi confirmado. Previsão de entrega: {{data_entrega}}.\n' +
    'Acompanhe o andamento por aqui: {{link_acompanhamento}}\n{{empresa_nome}}',
  arte_aprovacao: 'Olá, {{cliente_nome}}! A arte do seu pedido está pronta para aprovação.\nConfira e aprove pelo link: {{link_aprovacao}}',
  pedido_pronto:
    'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} está pronto. Previsão de entrega/retirada: {{data_entrega}}.\n' +
    'Detalhes e andamento: {{link_acompanhamento}}',
  pedido_em_entrega: 'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} saiu para entrega.\nAcompanhe: {{link_acompanhamento}}\n{{empresa_nome}}',
  pagamento_recebido: 'Olá, {{cliente_nome}}! Recebemos o seu pagamento de {{valor_pago}} do pedido {{numero_pedido}}. Obrigado!\n{{empresa_nome}}',
  pedido_entregue: 'Olá, {{cliente_nome}}! Seu pedido {{numero_pedido}} foi entregue. Obrigado pela preferência!\n{{empresa_nome}}',
}

export const STATUS_MENSAGEM_WHATSAPP = ['pendente', 'enviada', 'falhou', 'ignorada'] as const
export type StatusMensagemWhatsapp = (typeof STATUS_MENSAGEM_WHATSAPP)[number]

export const STATUS_MENSAGEM_WHATSAPP_ROTULOS: Record<StatusMensagemWhatsapp, string> = {
  pendente: 'Na fila',
  enviada: 'Enviada',
  falhou: 'Falhou',
  ignorada: 'Não enviada',
}

/**
 * Número no formato do WhatsApp: 55 + DDD + número (celular com 9 dígitos ou fixo com 8, WhatsApp Business).
 * Aceita máscara, +55, 0 de operadora/DDD e só DDD + número; devolve null se não for um telefone brasileiro válido.
 */
export function normalizarNumeroWhatsapp(texto: string | null | undefined): string | null {
  let d = somenteDigitos(texto ?? '')
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) d = d.slice(2)
  else if (d.startsWith('0')) d = d.replace(/^0+/, '')
  if (d.length !== 10 && d.length !== 11) return null
  const ddd = d.slice(0, 2)
  const numero = d.slice(2)
  if (!/^[1-9][1-9]$/.test(ddd)) return null
  // Celular: 9 + 8 dígitos; fixo: começa com 2 a 5
  if (numero.length === 9 ? !numero.startsWith('9') : !/^[2-5]/.test(numero)) return null
  return `55${ddd}${numero}`
}

/** Horário "HH:MM" (00:00 a 23:59) */
export const horarioSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use o formato 08:00')

export const whatsappConfigSchema = z
  .object({
    eventos: z.array(z.enum(EVENTOS_WHATSAPP)).max(EVENTOS_WHATSAPP.length),
    horarioInicio: horarioSchema,
    horarioFim: horarioSchema,
    pausado: z.boolean(),
  })
  .refine((v) => v.horarioInicio < v.horarioFim, { message: 'O fim precisa ser depois do início.', path: ['horarioFim'] })
export type WhatsappConfigInput = z.input<typeof whatsappConfigSchema>

export const mensagensWhatsappQuerySchema = z.object({
  status: z.enum(STATUS_MENSAGEM_WHATSAPP).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})

export type EstadoConexaoWhatsapp = 'conectado' | 'conectando' | 'desconectado'

export interface WhatsappConfig {
  /** Provedor do servidor: "log" só registra (desenvolvimento/testes), "evolution" envia de verdade */
  provedor: 'log' | 'evolution'
  /** Módulo WhatsApp no plano da empresa */
  liberadoNoPlano: boolean
  estado: EstadoConexaoWhatsapp
  numero: string | null
  nomePerfil: string | null
  conectadoEm: string | null
  desconectadoEm: string | null
  eventos: EventoWhatsapp[]
  horarioInicio: string
  horarioFim: string
  pausado: boolean
  /** Mensagens na fila agora */
  pendentes: number
}

export interface ConexaoWhatsapp {
  estado: EstadoConexaoWhatsapp
  numero: string | null
  /** QR code (data:image/png;base64,...) enquanto espera a leitura */
  qrBase64: string | null
}

export interface MensagemWhatsapp {
  id: string
  evento: EventoWhatsapp
  telefone: string
  texto: string
  status: StatusMensagemWhatsapp
  tentativas: number
  erro: string | null
  enviadaEm: string | null
  createdAt: string
  cliente: { id: string; nome: string; fantasia: string | null } | null
  pedido: { id: string; numero: string } | null
}

/**
 * Preenche o template como preencherTemplate e tira as linhas que ficaram sem o conteúdo da variável
 * (ex.: "Acompanhe: " sem o link, assinatura sem o nome da gráfica).
 */
export function preencherMensagem(conteudo: string, valores: Partial<Record<VariavelTemplate, string>>): string {
  return conteudo
    .split('\n')
    .flatMap((linha) => {
      let vazia = false
      const preenchida = linha.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (_t, nome: string) => {
        const valor = valores[nome as VariavelTemplate]?.trim() ?? ''
        if (!valor) vazia = true
        return valor
      })
      // Linha que só existia para a variável vazia (ou terminava nela, como "Acompanhe: {{link}}") sai inteira
      if (vazia && (!preenchida.trim() || /:\s*$/.test(preenchida))) return []
      return [preenchida]
    })
    .join('\n')
    .trim()
}

/** Link do WhatsApp com o texto pronto (envio manual quando a conexão caiu) */
export function linkWaMe(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}
