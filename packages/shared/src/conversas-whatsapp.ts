/**
 * Conversas do WhatsApp (copiloto da equipe, nível 1): toda mensagem de cliente que chega no WhatsApp conectado e não
 * é uma resposta já tratada de orçamento vira um item da lista "Conversas" (tela WhatsApp), com quem é, o resumo e as
 * ações de um toque — montar o orçamento, ver o pedido (com a resposta pronta), marcar como resolvida. Nada sai para o
 * cliente sem o toque de uma pessoa. Mensagens seguidas do mesmo contato em poucos minutos viram uma conversa só.
 */
import { z } from 'zod'
import type { OrcamentoDeTexto } from './assistente'
import type { StatusPedido } from './enums-comercial'

/** Do que a conversa trata (regras na hora; o Assistente GrafyGo refina quando está ligado) */
export const ASSUNTOS_CONVERSA = ['orcamento', 'pedido', 'duvida', 'outro'] as const
export type AssuntoConversa = (typeof ASSUNTOS_CONVERSA)[number]
export const ASSUNTO_CONVERSA_ROTULOS: Record<AssuntoConversa, string> = {
  orcamento: 'Pedido de orçamento',
  pedido: 'Pergunta sobre pedido',
  duvida: 'Dúvida',
  outro: 'Conversa',
}

/** Mídia recebida (por enquanto só o tipo fica registrado, sem o arquivo) */
export const MIDIAS_CONVERSA = ['foto', 'video', 'audio', 'documento', 'figurinha', 'contato', 'localizacao'] as const
export type MidiaConversa = (typeof MIDIAS_CONVERSA)[number]
export const MIDIA_CONVERSA_ROTULOS: Record<MidiaConversa, string> = {
  foto: 'Foto',
  video: 'Vídeo',
  audio: 'Áudio',
  documento: 'Documento',
  figurinha: 'Figurinha',
  contato: 'Contato',
  localizacao: 'Localização',
}

export const SITUACOES_CONVERSA = ['aberta', 'resolvida'] as const
export type SituacaoConversa = (typeof SITUACOES_CONVERSA)[number]

export interface MensagemConversa {
  id: string
  texto: string | null
  midia: MidiaConversa | null
  em: string
}

export interface ConversaWhatsapp {
  id: string
  /** Número do remetente (55DDD…); null quando o WhatsApp só mandou o identificador (LID) */
  numero: string | null
  /** Nome do perfil no WhatsApp (pushName) */
  nomeWhatsapp: string | null
  /** Cliente do cadastro com o mesmo número (com e sem o 9º dígito) */
  cliente: { id: string; rotulo: string } | null
  assunto: AssuntoConversa
  /** regras = na hora, por palavras; assistente = lido pelo Assistente GrafyGo */
  assuntoVia: 'regras' | 'assistente'
  resumo: string | null
  mensagens: MensagemConversa[]
  /** Orçamento ligado: o aberto que a mensagem citava (resposta que não deu para tratar sozinha) ou o montado daqui */
  orcamento: { id: string; numero: string } | null
  situacao: SituacaoConversa
  resolvidaEm: string | null
  primeiraEm: string
  ultimaEm: string
}

export const conversasWhatsappQuerySchema = z.object({
  situacao: z.enum(SITUACOES_CONVERSA).default('aberta'),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(50).default(20),
})

/** "Montar orçamento" da conversa: o editor abre com os itens lidos e o cliente (achado ou pré-cadastro do remetente) */
export interface OrcamentoDaConversa {
  texto: string
  leitura: OrcamentoDeTexto
  /** false = o Assistente está desligado (ou falhou): só o cliente e o texto vão para o editor */
  assistente: boolean
  /** Por que veio sem os itens (null quando o Assistente montou) */
  aviso: string | null
}

/** "Ver pedido": os pedidos em andamento do cliente e a resposta pronta (só sai com o toque em Enviar) */
export interface PedidosDaConversa {
  pedidos: { id: string; numero: string; status: StatusPedido; dataPrevistaEntrega: string; atrasado: boolean }[]
  /** Texto pronto para o cliente sobre o pedido mais recente (editável antes de enviar) */
  respostaPronta: string | null
}

/** Contato do WhatsApp para achar pelo nome (conversas recebidas e clientes com WhatsApp) — sem copiar número */
export interface ContatoWhatsapp {
  /** 55DDD… */
  numero: string
  nome: string
  cliente: { id: string; rotulo: string } | null
}

export const contatosWhatsappQuerySchema = z.object({ busca: z.string().trim().max(60).optional() })

export const vincularConversaSchema = z.object({ orcamentoId: z.string().uuid() })
