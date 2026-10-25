import type { ProvedorIA as NomeProvedorIA } from '@onprint/shared'

/** Tipos do provedor de IA (ver index.ts) */

/** Tarefas conhecidas (o simulado responde cada uma com regras simples) */
export type TarefaIA = 'classificar_resposta'

export interface PedidoEstruturado<T> {
  tarefa: TarefaIA
  /** Instruções (persona e regras), em português */
  sistema: string
  /** O conteúdo a analisar (só o necessário: nada de telefone ou documento) */
  conteudo: string
  /** JSON Schema da resposta (objeto, todas as propriedades obrigatórias, additionalProperties false) */
  esquema: Record<string, unknown>
  /** Confere e normaliza o objeto devolvido (lança se não servir) */
  validar: (bruto: unknown) => T
  maxTokens?: number
}

export interface UsoTokens {
  entrada: number
  saida: number
}

export interface RespostaEstruturada<T> {
  dados: T
  uso: UsoTokens
  modelo: string
}

export interface ProvedorIA {
  readonly nome: NomeProvedorIA
  readonly modelo: string
  estruturado<T>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<T>>
}

export type TipoErroIA = 'autenticacao' | 'permissao' | 'modelo' | 'limite_provedor' | 'tempo' | 'indisponivel' | 'requisicao' | 'recusa' | 'resposta_invalida'

/** Falha do provedor já traduzida (o núcleo registra e cai no comportamento sem IA). `uso`: tokens gastos mesmo assim. */
export class ErroIA extends Error {
  constructor(
    readonly tipo: TipoErroIA,
    mensagem: string,
    readonly uso: UsoTokens = { entrada: 0, saida: 0 },
  ) {
    super(mensagem)
    this.name = 'ErroIA'
  }
}

export const MENSAGENS_ERRO_IA: Record<TipoErroIA, string> = {
  autenticacao: 'Chave da API recusada pelo provedor.',
  permissao: 'A chave não tem permissão para este modelo.',
  modelo: 'Modelo não encontrado (ou não liberado para esta conta).',
  limite_provedor: 'Limite de uso do provedor atingido (tente mais tarde).',
  tempo: 'O provedor demorou demais para responder.',
  indisponivel: 'Provedor de IA indisponível agora.',
  requisicao: 'O provedor recusou a requisição.',
  recusa: 'O modelo se recusou a responder.',
  resposta_invalida: 'A resposta do modelo não veio no formato esperado.',
}

/** Tempo máximo de cada tentativa (o SDK ainda tenta de novo erros temporários) */
export const TEMPO_LIMITE_IA_MS = 15_000
