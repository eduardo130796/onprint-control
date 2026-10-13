import type { EventoWhatsapp, StatusPedido } from '@onprint/shared'

/** Mesmo aviso do mesmo pedido (e da mesma arte/pagamento) dentro desta janela não é repetido */
export const JANELA_DUPLICADO_MS = 12 * 3_600_000
/** Intervalo entre duas mensagens da mesma empresa (com sorteio, para não parecer robô) */
export const INTERVALO_MIN_MS = 20_000
export const INTERVALO_MAX_MS = 40_000
/** Teto por empresa por hora (aviso de pedido, nunca disparo em massa) */
export const MAX_POR_HORA = 30
/** Tentativas antes de marcar "falhou" (só nas falhas temporárias) */
export const MAX_TENTATIVAS = 3
/** Aviso que não saiu neste prazo (conexão caída, pausa) é descartado: "saiu para entrega" dias depois confunde */
export const VALIDADE_PENDENTE_MS = 48 * 3_600_000
export const FUSO = 'America/Sao_Paulo'

/** Status do pedido que geram aviso */
export const EVENTO_DO_STATUS: Partial<Record<StatusPedido, EventoWhatsapp>> = {
  pronto: 'pedido_pronto',
  em_entrega: 'pedido_em_entrega',
  entregue: 'pedido_entregue',
}

export interface SituacaoAviso {
  /** Evento ligado nas configurações */
  eventoLigado: boolean
  /** Provedor só registra (log) */
  simulado: boolean
  /** A empresa conectou o WhatsApp (e não desconectou de propósito); queda de conexão ainda conta */
  conectou: boolean
  /** Cliente marcou "não receber avisos" */
  clienteRecusa: boolean
  /** Número já normalizado (null = sem WhatsApp válido) */
  numero: string | null
  /** Já existe o mesmo aviso na fila ou enviado há pouco */
  duplicado: boolean
}

/**
 * Por que o aviso não entra na fila. `registrar` = grava como "não enviada" para a gráfica ver o motivo
 * (cliente sem WhatsApp, cliente recusou); o resto é descartado em silêncio.
 */
export function motivoParaNaoAvisar(s: SituacaoAviso): { motivo: string; registrar: boolean } | null {
  if (!s.eventoLigado) return { motivo: 'Aviso desligado', registrar: false }
  if (!s.simulado && !s.conectou) return { motivo: 'WhatsApp não conectado', registrar: false }
  if (s.duplicado) return { motivo: 'Aviso repetido', registrar: false }
  if (s.clienteRecusa) return { motivo: 'O cliente não quer receber avisos pelo WhatsApp.', registrar: true }
  if (!s.numero) return { motivo: 'Cliente sem WhatsApp válido no cadastro.', registrar: true }
  return null
}

const minutos = (hhmm: string) => {
  const [h, m] = hhmm.split(':').map(Number)
  return h! * 60 + m!
}

/** Hora local (minutos desde a meia-noite) no fuso de Brasília */
export function minutosLocais(agora: Date, fuso = FUSO): number {
  const partes = new Intl.DateTimeFormat('en-GB', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(agora)
  const valor = (tipo: string) => Number(partes.find((p) => p.type === tipo)?.value ?? 0)
  return valor('hour') * 60 + valor('minute')
}

export function dentroDoHorario(agora: Date, inicio: string, fim: string, fuso = FUSO): boolean {
  const m = minutosLocais(agora, fuso)
  return m >= minutos(inicio) && m < minutos(fim)
}

/** Quando a próxima mensagem pode sair: agora (dentro do horário) ou na abertura da próxima janela. */
export function proximoEnvioPermitido(agora: Date, inicio: string, fim: string, fuso = FUSO): Date {
  if (dentroDoHorario(agora, inicio, fim, fuso)) return agora
  const atual = minutosLocais(agora, fuso)
  const abertura = minutos(inicio)
  const espera = (abertura - atual + 24 * 60) % (24 * 60) || 24 * 60
  const resultado = new Date(agora.getTime() + espera * 60_000)
  resultado.setUTCSeconds(0, 0)
  return resultado
}

/** Intervalo sorteado entre duas mensagens (aleatorio em [0, 1)) */
export function intervaloEntreEnvios(aleatorio = Math.random()): number {
  return Math.round(INTERVALO_MIN_MS + (INTERVALO_MAX_MS - INTERVALO_MIN_MS) * aleatorio)
}

/** Espera antes da próxima tentativa (1 min, 5 min, 15 min) */
export function esperaDaTentativa(tentativas: number): number {
  return [60_000, 5 * 60_000, 15 * 60_000][Math.min(Math.max(tentativas, 1), 3) - 1]!
}
