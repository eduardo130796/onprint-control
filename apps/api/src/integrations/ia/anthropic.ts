import Anthropic from '@anthropic-ai/sdk'
import { ErroIA, type PedidoEstruturado, type ProvedorIA, type RespostaEstruturada, type UsoTokens } from './tipos'

/*
 * Claude pela API da Anthropic (SDK oficial @anthropic-ai/sdk). Resposta estruturada com output_config.format
 * (json_schema): o texto que volta é o JSON do schema, conferido depois por pedido.validar().
 * - Sem temperature/top_p/top_k (a API recusa) e sem "prefill" do assistente.
 * - output_config.effort por tarefa (pedido.esforco): "low" por padrão — classificar uma resposta curta não precisa de
 *   raciocínio longo (o padrão do Haiku 5.5 é "medium") —, "medium" onde extrair é mais difícil (montar orçamento,
 *   preencher produto). Modelos antigos sem esforço configurável não recebem o parâmetro. O raciocínio conta em
 *   max_tokens: tarefas de resposta maior pedem mais (pedido.maxTokens).
 * - Tempo limite por tentativa (15 s) e as tentativas automáticas do SDK (2) para 429/5xx/conexão.
 */

/** Modelos que não aceitam output_config.effort (a API responderia 400) */
const SEM_ESFORCO = /^claude-(3|haiku-4|sonnet-4-5|sonnet-4-0|opus-4-0|opus-4-1)/

export class AnthropicProvider implements ProvedorIA {
  readonly nome = 'anthropic' as const
  readonly modelo: string
  private readonly cliente: Anthropic

  constructor(o: { chave: string; modelo: string; tempoLimiteMs: number; cliente?: Anthropic }) {
    this.modelo = o.modelo
    this.cliente = o.cliente ?? new Anthropic({ apiKey: o.chave, timeout: o.tempoLimiteMs })
  }

  async estruturado<T>(pedido: PedidoEstruturado<T>): Promise<RespostaEstruturada<T>> {
    let resposta: Anthropic.Message
    try {
      resposta = await this.cliente.messages.create({
        model: this.modelo,
        max_tokens: pedido.maxTokens ?? 1024,
        system: pedido.sistema,
        messages: [{ role: 'user', content: conteudoDaMensagem(pedido) }],
        output_config: {
          format: { type: 'json_schema', schema: pedido.esquema },
          ...(SEM_ESFORCO.test(this.modelo) ? {} : { effort: pedido.esforco ?? 'low' }),
        },
      })
    } catch (erro) {
      throw traduzirErro(erro)
    }
    const uso: UsoTokens = { entrada: resposta.usage.input_tokens, saida: resposta.usage.output_tokens }
    if (resposta.stop_reason === 'refusal') throw new ErroIA('recusa', 'O modelo se recusou a responder.', uso)
    if (resposta.stop_reason === 'max_tokens') throw new ErroIA('resposta_invalida', 'A resposta passou do limite de tokens.', uso)
    const texto = resposta.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('')
    try {
      return { dados: pedido.validar(JSON.parse(texto)), uso, modelo: resposta.model }
    } catch {
      throw new ErroIA('resposta_invalida', 'A resposta do modelo não veio no formato esperado.', uso)
    }
  }
}

/**
 * Conteúdo da mensagem: só o texto, ou (nota de compra por foto/PDF) os arquivos antes do texto — imagem em bloco
 * "image" e PDF em bloco "document", ambos em base64 (a API lê o PDF página por página, texto e imagem).
 */
export function conteudoDaMensagem(pedido: Pick<PedidoEstruturado<unknown>, 'conteudo' | 'anexos'>): string | Anthropic.ContentBlockParam[] {
  if (!pedido.anexos?.length) return pedido.conteudo
  const arquivos = pedido.anexos.map((a): Anthropic.ContentBlockParam =>
    a.mediaType === 'application/pdf'
      ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: a.dados } }
      : { type: 'image', source: { type: 'base64', media_type: a.mediaType, data: a.dados } },
  )
  return [...arquivos, { type: 'text', text: pedido.conteudo }]
}

/** Erros tipados do SDK → ErroIA (do mais específico ao mais geral; nunca pela mensagem) */
export function traduzirErro(erro: unknown): ErroIA {
  if (erro instanceof ErroIA) return erro
  if (erro instanceof Anthropic.AuthenticationError) return new ErroIA('autenticacao', 'Chave da API recusada pela Anthropic (401).')
  if (erro instanceof Anthropic.PermissionDeniedError) return new ErroIA('permissao', 'A chave não tem permissão para este modelo (403).')
  if (erro instanceof Anthropic.NotFoundError) return new ErroIA('modelo', 'Modelo não encontrado ou não liberado para esta conta (404).')
  if (erro instanceof Anthropic.RateLimitError) return new ErroIA('limite_provedor', 'Limite de uso da Anthropic atingido (429).')
  if (erro instanceof Anthropic.BadRequestError) return new ErroIA('requisicao', `A Anthropic recusou a requisição (400): ${erro.message.slice(0, 200)}`)
  if (erro instanceof Anthropic.APIConnectionTimeoutError) return new ErroIA('tempo', 'A Anthropic demorou demais para responder.')
  if (erro instanceof Anthropic.APIConnectionError) return new ErroIA('indisponivel', 'Sem conexão com a Anthropic.')
  if (erro instanceof Anthropic.InternalServerError) return new ErroIA('indisponivel', `Anthropic indisponível agora (${erro.status}).`)
  if (erro instanceof Anthropic.APIError) return new ErroIA('indisponivel', `Erro da Anthropic${erro.status ? ` (${erro.status})` : ''}.`)
  return new ErroIA('indisponivel', (erro as Error)?.message?.slice(0, 200) ?? 'Erro desconhecido.')
}
