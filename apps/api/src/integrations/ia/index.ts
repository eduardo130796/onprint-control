import type { ProvedorIA as NomeProvedorIA } from '@onprint/shared'
import { AnthropicProvider } from './anthropic'
import { SimuladoProvider } from './simulado'
import { ErroIA, TEMPO_LIMITE_IA_MS, type ProvedorIA } from './tipos'

/*
 * Provedor de IA do Assistente GrafyGo. O núcleo (modules/assistente) só conhece esta interface: pede uma resposta
 * estruturada (JSON que segue um schema) e recebe o objeto já validado, os tokens gastos e o modelo que respondeu.
 *
 * Implementados: AnthropicProvider (SDK oficial, Claude) e SimuladoProvider (desenvolvimento/testes, sem rede).
 * Para outro provedor (OpenAI, Gemini): uma classe que implementa ProvedorIA (structured output do provedor +
 * validar(), erros traduzidos para ErroIA), um "case" em criarProvedorIA e o provedor em PROVEDORES_IA_DISPONIVEIS
 * (shared/assistente.ts). Ver docs/ARQUITETURA.md → "Assistente GrafyGo".
 */

export interface OpcoesProvedorIA {
  provedor: NomeProvedorIA
  modelo: string
  chave: string | null
}

/** Provedor da configuração da central. Lança ErroIA('requisicao') se o provedor ainda não existe ou falta a chave. */
export function criarProvedorIA(o: OpcoesProvedorIA): ProvedorIA {
  switch (o.provedor) {
    case 'anthropic':
      if (!o.chave) throw new ErroIA('autenticacao', 'Nenhuma chave da API configurada.')
      return new AnthropicProvider({ chave: o.chave, modelo: o.modelo, tempoLimiteMs: TEMPO_LIMITE_IA_MS })
    case 'simulado':
      return new SimuladoProvider()
    default:
      // openai, gemini: ponto de extensão (ver o comentário no topo)
      throw new ErroIA('requisicao', `O provedor ${o.provedor} ainda não está disponível.`)
  }
}

export * from './tipos'
export { AnthropicProvider } from './anthropic'
export { SimuladoProvider } from './simulado'
