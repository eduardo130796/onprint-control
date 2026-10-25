import { z } from 'zod'

/*
 * Assistente GrafyGo: a IA que fala e age como "Assistente GrafyGo da <gráfica>". O núcleo (API) não depende de um
 * provedor: a central (painel da plataforma) escolhe o provedor, o modelo e a chave; cada uso grava tokens e custo.
 * Primeiro uso: entender respostas do cliente ao orçamento no WhatsApp que as regras não entendem.
 */

export const NOME_ASSISTENTE = 'Assistente GrafyGo'

/** Provedores de IA. Só os "disponiveis" podem ser escolhidos; "simulado" só fora de produção (testes, sem rede). */
export const PROVEDORES_IA = ['anthropic', 'openai', 'gemini', 'simulado'] as const
export type ProvedorIA = (typeof PROVEDORES_IA)[number]
export const PROVEDOR_IA_ROTULOS: Record<ProvedorIA, string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  gemini: 'Google Gemini',
  simulado: 'Simulado (testes, sem rede)',
}
/** Já implementados na API (os outros aparecem como "em breve") */
export const PROVEDORES_IA_DISPONIVEIS: readonly ProvedorIA[] = ['anthropic', 'simulado']

/** Modelo padrão: rápido e barato, bom para classificar respostas curtas */
export const MODELO_PADRAO_IA = 'claude-haiku-5-5'

export interface PrecoModeloIA {
  modelo: string
  /** USD por milhão de tokens de entrada */
  entrada: number
  /** USD por milhão de tokens de saída */
  saida: number
}
export const PRECOS_PADRAO_IA: PrecoModeloIA[] = [{ modelo: 'claude-haiku-5-5', entrada: 0.1, saida: 0.5 }]
export const COTACAO_DOLAR_PADRAO = 5.5

/** Custo estimado (USD) de uma chamada pela tabela de preços; modelo fora da tabela = 0 (aparece como "sem preço") */
export function custoEstimadoUsd(precos: PrecoModeloIA[], modelo: string, tokens: { entrada: number; saida: number }): number {
  const p = precos.find((x) => x.modelo === modelo)
  if (!p) return 0
  return Math.round(((tokens.entrada * p.entrada + tokens.saida * p.saida) / 1_000_000) * 1e6) / 1e6
}

/** Onde a IA foi usada (uso_ia.recurso) */
export const RECURSOS_IA = ['whatsapp_resposta', 'teste_central'] as const
export type RecursoIA = (typeof RECURSOS_IA)[number]
export const RECURSO_IA_ROTULOS: Record<RecursoIA, string> = {
  whatsapp_resposta: 'Respostas no WhatsApp',
  teste_central: 'Teste da central',
}

/** O que o Assistente entendeu da resposta do cliente ao orçamento */
export const INTENCOES_RESPOSTA_IA = ['aprova', 'quer_modificacoes', 'pergunta', 'outro'] as const
export type IntencaoRespostaIA = (typeof INTENCOES_RESPOSTA_IA)[number]
export const INTENCAO_RESPOSTA_IA_ROTULOS: Record<IntencaoRespostaIA, string> = {
  aprova: 'Aprova',
  quer_modificacoes: 'Quer modificações',
  pergunta: 'Pergunta',
  outro: 'Outro assunto',
}

const numeroOuNulo = z.number().min(0).max(1_000_000).nullable()

/** Configuração salva na central. `chave`: só quando o dono digita uma nova (nunca volta para o navegador). */
export const assistenteConfigSchema = z.object({
  ativo: z.boolean(),
  provedor: z.enum(PROVEDORES_IA),
  modelo: z.string().trim().min(1, 'Informe o modelo.').max(100).regex(/^[a-zA-Z0-9._:/-]+$/, 'Use só o identificador do modelo (ex.: claude-haiku-5-5).'),
  chave: z.string().trim().min(10, 'Chave curta demais.').max(500).optional(),
  removerChave: z.boolean().optional(),
  limiteChamadasMes: numeroOuNulo.refine((v) => v === null || Number.isInteger(v), 'Use um número inteiro.'),
  limiteUsdMes: numeroOuNulo,
  precos: z
    .array(z.object({ modelo: z.string().trim().min(1).max(100), entrada: z.number().min(0).max(1000), saida: z.number().min(0).max(1000) }))
    .max(30)
    .refine((l) => new Set(l.map((p) => p.modelo)).size === l.length, 'Modelo repetido na tabela de preços.'),
  cotacaoDolar: z.number().positive('Informe a cotação.').max(100),
})
export type AssistenteConfigInput = z.input<typeof assistenteConfigSchema>

/** Configuração como a central vê (sem a chave) */
export interface AssistenteCentral {
  ativo: boolean
  provedor: ProvedorIA
  modelo: string
  chave: {
    /** banco = cadastrada na central; ambiente = ANTHROPIC_API_KEY do servidor; null = nenhuma */
    origem: 'banco' | 'ambiente' | null
    /** Últimos 4 caracteres ("••••1234") */
    final: string | null
    /** Cadastrada mas não abre (o segredo do servidor mudou): cadastre de novo */
    ilegivel: boolean
  }
  limiteChamadasMes: number | null
  limiteUsdMes: number | null
  precos: PrecoModeloIA[]
  cotacaoDolar: number
  /** Ligado, com provedor disponível e chave (o simulado não precisa): as empresas podem usar */
  pronto: boolean
  /** O servidor aceita o provedor simulado (fora de produção) */
  simuladoDisponivel: boolean
}

/** Resultado do botão "Testar" da central */
export interface TesteAssistente {
  ok: boolean
  provedor: ProvedorIA
  modelo: string
  tokens: { entrada: number; saida: number }
  latenciaMs: number
  custoUsd: number
  /** O que o modelo respondeu à classificação de teste */
  resultado: { intencao: IntencaoRespostaIA; confianca: number; resumo: string } | null
  erro: string | null
}

export interface UsoEmpresaIA {
  empresa: { id: string; nome: string; slug: string } | null
  chamadas: number
  erros: number
  /** Chamadas evitadas pelo limite do mês */
  bloqueadas: number
  tokensEntrada: number
  tokensSaida: number
  custoUsd: number
  custoBrl: number
}

/** Painel de uso do mês (todas as empresas) */
export interface UsoAssistenteMes {
  /** "2026-10" */
  mes: string
  cotacaoDolar: number
  totais: Omit<UsoEmpresaIA, 'empresa'>
  empresas: UsoEmpresaIA[]
  ultimosErros: { id: string; empresa: string | null; recurso: string; situacao: 'erro' | 'limite'; erro: string | null; modelo: string; em: string }[]
}
