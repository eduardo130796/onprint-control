import { semAcentos } from './texto'
import type { AnexoIA } from './tipos'

/*
 * Provedor simulado para "Peça ao Assistente": entender o pedido (palavras-chave) e ler a nota de compra por foto/PDF.
 * A leitura da nota é de demonstração: só os arquivos de exemplo (nome com "demo") devolvem uma nota preenchida; os
 * outros voltam vazios, com o aviso de que é o simulador. Determinístico, sem rede.
 */

/** Texto da pessoa entre <pedido_da_pessoa> */
const pedidoDaPessoa = (conteudo: string) => /<pedido_da_pessoa>\n?([\s\S]*?)\n?<\/pedido_da_pessoa>/.exec(conteudo)?.[1]?.trim() ?? conteudo

function periodo(t: string): string | null {
  if (/\bontem\b/.test(t)) return 'ontem'
  if (/\bhoje\b|\bdo dia\b/.test(t)) return 'hoje'
  if (/semana/.test(t)) return 'semana'
  if (/mes passado|ultimo mes/.test(t)) return 'mes_passado'
  if (/\bmes\b/.test(t)) return 'mes'
  return null
}

/** Intenção por palavras-chave (imita o modelo nos casos comuns) */
export function intencaoSimulada(conteudo: string) {
  const original = pedidoDaPessoa(conteudo)
  const t = semAcentos(original)
  const r = (intencao: string, extra: Record<string, unknown> = {}) => ({ intencao, pergunta: null, periodo: null, nome_cliente: null, confianca: 0.9, ...extra })
  if (/devendo|\bdevem\b|\bdeve\b|inadimpl|em aberto|a receber|me deve/.test(t)) return r('pergunta', { pergunta: 'quem_deve' })
  if (/vendi|vendemos|vendas|faturei|faturamos|faturamento/.test(t)) return r('pergunta', { pergunta: 'vendas', periodo: periodo(t) ?? 'mes' })
  if (/atrasad/.test(t) && /pedido|entrega/.test(t)) return r('pergunta', { pergunta: 'pedidos_atrasados' })
  if (/pedido|entrega|entregar/.test(t) && /\bhoje\b|pra hoje|para hoje/.test(t)) return r('pergunta', { pergunta: 'pedidos_hoje' })
  if (/orcamento/.test(t) && /esperando|aguardando|sem resposta|pendente|parado|resposta/.test(t)) return r('pergunta', { pergunta: 'orcamentos_esperando' })
  if (/\b(nota|nf|nfe|danfe)\b|nota fiscal|lancar (a )?compra/.test(t)) return r('nota_compra')
  if (/(cadastr\w*|novo|nova|criar)\s+(o |um |uma )?(cliente)|cliente nov[oa]/.test(t)) {
    const nome = /cliente\s+(?:nov[oa]\s+)?(?:chamad[oa]\s+)?([A-ZÀ-Ú][\p{L}]+(?:\s+[A-ZÀ-Ú][\p{L}]+)*)/u.exec(original)?.[1] ?? null
    return r('cliente', { nome_cliente: nome })
  }
  if (/(cadastr\w*|novo|criar)\s+(o |um )?(produto|servico)|produto novo/.test(t)) return r('produto')
  if (/\d|\bmil\b|orcamento|quero|preciso|gostaria|cotacao/.test(t)) return r('orcamento', { confianca: 0.8 })
  return r('desconhecido', { confianca: 0.4 })
}

/** Nota de exemplo do simulador (a mesma do DANFE de demonstração) */
export const NOTA_DEMO = {
  eh_nota: true,
  fornecedor_cnpj: '44.555.666/0001-81',
  fornecedor_nome: 'Distribuidora Lona Forte Ltda',
  numero: '4821',
  serie: '1',
  emissao: '2026-10-20',
  itens: [
    { codigo: 'LF-440', descricao: 'LONA FRONT 440G BRANCA ROLO 3,20X50M', unidade: 'RL', quantidade: 2, valor_unitario: 1450, valor_total: 2900 },
    { codigo: 'IL-10', descricao: 'ILHOS LATAO N10 CX 1000', unidade: 'CX', quantidade: 3, valor_unitario: 38.5, valor_total: 115.5 },
    { codigo: 'TS-CY', descricao: 'TINTA ECO SOLVENTE CIANO 1L', unidade: 'UN', quantidade: 2, valor_unitario: 189.9, valor_total: 379.8 },
  ],
  total_nota: 3440.3,
  parcelas: [
    { vencimento: '2026-11-19', valor: 1720.15 },
    { vencimento: '2026-12-19', valor: 1720.15 },
  ],
}

/** Leitura da foto/PDF: o exemplo de demonstração ou uma nota vazia (o simulador não lê imagens de verdade) */
export function notaCompraSimulada(_conteudo: string, anexos: AnexoIA[] = []) {
  if (anexos.some((a) => /demo/i.test(a.nome))) return NOTA_DEMO
  return { eh_nota: false, fornecedor_cnpj: null, fornecedor_nome: null, numero: null, serie: null, emissao: null, itens: [], total_nota: null, parcelas: [] }
}
