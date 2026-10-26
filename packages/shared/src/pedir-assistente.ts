import { z } from 'zod'
import { cnpjValido, cpfValido } from './documentos'
import type { OrcamentoDeTexto } from './assistente'

/*
 * "Peça ao Assistente" (barra do topo, junto da busca Ctrl+K): uma caixa só, onde a pessoa escreve, cola um texto ou
 * anexa a foto/PDF/XML de uma nota. O Assistente entende o que ela quer (tarefa "intencao", barata) e o sistema faz:
 * abre o orçamento já montado, a entrada da nota já preenchida, o cadastro do cliente com os dados da Receita, o do
 * produto preenchido, ou responde na hora as perguntas do dia a dia com números do banco (a IA só escolhe a pergunta;
 * quem conta é o sistema). Nada é salvo sem a pessoa confirmar.
 */

/** O que a pessoa quer */
export const INTENCOES_PEDIDO = ['orcamento', 'nota_compra', 'cliente', 'produto', 'pergunta', 'desconhecido'] as const
export type IntencaoPedido = (typeof INTENCOES_PEDIDO)[number]

/** Perguntas que o sistema responde com os dados (sem abrir relatório) */
export const PERGUNTAS_RAPIDAS = ['quem_deve', 'vendas', 'pedidos_hoje', 'pedidos_atrasados', 'orcamentos_esperando'] as const
export type PerguntaRapida = (typeof PERGUNTAS_RAPIDAS)[number]
export const PERGUNTA_RAPIDA_ROTULOS: Record<PerguntaRapida, string> = {
  quem_deve: 'Quem está devendo?',
  vendas: 'Quanto vendi?',
  pedidos_hoje: 'Pedidos para hoje',
  pedidos_atrasados: 'Pedidos atrasados',
  orcamentos_esperando: 'Orçamentos esperando resposta',
}

/** Período das vendas ("quanto vendi hoje / este mês") */
export const PERIODOS_PERGUNTA = ['hoje', 'ontem', 'semana', 'mes', 'mes_passado'] as const
export type PeriodoPergunta = (typeof PERIODOS_PERGUNTA)[number]

export const pedirAssistenteSchema = z.object({
  texto: z.string().trim().min(2, 'Escreva o que você precisa.').max(3000, 'Use até 3.000 caracteres.'),
})

/** Sugestões que aparecem na caixa vazia (um toque já pergunta) */
export const EXEMPLOS_PEDIDO = ['Quem está devendo?', 'Quanto vendi este mês?', 'Pedidos para hoje', 'Orçamentos esperando resposta'] as const

/** Frase quando o Assistente não sabe fazer o que foi pedido */
export const NAO_SEI_FAZER =
  'Ainda não sei fazer isso. Posso montar um orçamento, lançar uma nota de compra, cadastrar um cliente ou produto, ou responder sobre vendas, cobranças e pedidos.'

/** CPF ou CNPJ válido escrito no texto (só dígitos), ou null. O documento fica no servidor: nunca vai para a IA. */
export function documentoDoTexto(texto: string): string | null {
  for (const m of texto.matchAll(/\d[\d./-]{9,20}\d/g)) {
    const d = m[0].replace(/\D/g, '')
    if ((d.length === 14 && cnpjValido(d)) || (d.length === 11 && cpfValido(d))) return d
  }
  return null
}

// ─── Respostas das perguntas rápidas (números do banco) ───

export interface LinhaResposta {
  titulo: string
  detalhe: string | null
  /** Decimal da API ("1234.56") quando a linha tem valor em dinheiro */
  valor: string | null
  /** Para onde abrir (ficha do cliente, pedido, orçamento) */
  link: string | null
}

export interface RespostaPergunta {
  pergunta: PerguntaRapida
  /** "Quem está devendo" */
  titulo: string
  /** A resposta em uma frase, montada pelo sistema com os números ("3 clientes devem R$ 1.250,00 (R$ 400,00 vencidos).") */
  resumo: string
  linhas: LinhaResposta[]
  /** Mais linhas do que as mostradas */
  mais: number
  /** Relatório completo (a mesma informação, com filtros) */
  link: { rotulo: string; path: string } | null
}

// ─── Nota de compra (XML da NF-e, foto ou PDF do DANFE) ───

/** Um item da nota com o insumo do cadastro que combina */
export interface ItemNotaCompra {
  /** Código do produto no fornecedor (cProd) */
  codigo: string | null
  descricao: string
  ncm: string | null
  cfop: string | null
  /** Unidade da nota (uCom: "UN", "RL", "CX") */
  unidade: string | null
  /** Decimais da API ("2", "1450.5") */
  quantidade: string
  /** Valor unitário da nota (vUnCom) */
  valorUnitario: string
  /** Valor do item na nota (vProd) */
  valorTotal: string
  /**
   * Custo unitário para a entrada: o da nota com o rateio de frete, impostos e descontos da nota (vNF ÷ soma dos
   * itens), para o custo médio ficar com o que a gráfica pagou de verdade. 4 casas.
   */
  custoUnitario: string
  /** Insumo do cadastro que combina (null = a pessoa escolhe ou cadastra) */
  insumo: { id: string; nome: string; codigo: string; unidade: string | null } | null
  /** memoria = o fornecedor já mandou este código e a pessoa confirmou o insumo; nome = nome parecido (conferir) */
  comoAchou: 'memoria' | 'nome' | null
  /** Lançar em embalagens (rolos, caixas): a quantidade da nota é de embalagens (vem da memória ou da unidade da nota) */
  emEmbalagem: boolean
  /** Conferir este item (achado pelo nome, sem insumo ou lido pela IA) */
  conferir: boolean
}

export interface ParcelaNotaCompra {
  /** nDup ("001") */
  numero: string | null
  /** AAAA-MM-DD */
  vencimento: string
  valor: string
}

export interface FornecedorNotaCompra {
  /** Só dígitos */
  cnpj: string | null
  nome: string
  fantasia: string | null
  ie: string | null
  telefone: string | null
  endereco: { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null } | null
  /** Fornecedor do cadastro com o mesmo CNPJ (null = novo: cadastrado ao confirmar a entrada) */
  existente: { id: string; nome: string } | null
}

export interface NotaCompraLida {
  /** xml = leitura exata (sem IA); foto/pdf = lido pelo Assistente (tudo marcado "confira") */
  origem: 'xml' | 'foto' | 'pdf'
  /** Lido pela IA: confira cada campo */
  conferir: boolean
  /** Chave de acesso (44 dígitos), quando há */
  chave: string | null
  numero: string | null
  serie: string | null
  /** AAAA-MM-DD */
  emissao: string | null
  fornecedor: FornecedorNotaCompra
  itens: ItemNotaCompra[]
  /** Soma dos itens (vProd) */
  totalProdutos: string
  /** Total da nota (vNF: com frete, impostos e descontos) */
  totalNota: string
  /** Duplicatas (cobr/dup); vazio = à vista (ou não informado) */
  parcelas: ParcelaNotaCompra[]
  /** Uma entrada desta nota já foi lançada (mesmo número e fornecedor) */
  jaLancada: { id: string; numero: string } | null
  avisos: string[]
}

// ─── Resposta da caixa ───

export type RespostaPedir =
  /** Orçamento montado (o editor abre com os itens; os incertos com "confira") */
  | { tipo: 'orcamento'; texto: string; leitura: OrcamentoDeTexto }
  /** Cliente novo: o cadastro abre com o documento (e a busca da Receita) ou o nome; existente = já cadastrado */
  | { tipo: 'cliente'; documento: string | null; nome: string | null; existente: { id: string; rotulo: string } | null }
  /** Produto novo: o cadastro abre e o Assistente preenche com o texto */
  | { tipo: 'produto'; texto: string }
  /** Nota de compra: a entrada abre preenchida para conferir */
  | { tipo: 'nota_compra'; nota: NotaCompraLida }
  /** Pediu para lançar nota, mas sem o arquivo */
  | { tipo: 'anexar_nota'; mensagem: string }
  | { tipo: 'pergunta'; resposta: RespostaPergunta }
  | { tipo: 'nao_sei'; mensagem: string }

/** Estado da navegação para o editor do orçamento, a entrada e o cadastro (o que o Assistente já montou) */
export interface EstadoDoAssistente {
  orcamentoAssistente?: { texto: string; leitura: OrcamentoDeTexto }
  notaAssistente?: NotaCompraLida
  produtoAssistente?: string
}

// ─── Nota de compra lida pelo WhatsApp (conversa "Você"), esperando conferência em Entradas de estoque ───

/** pendente: na faixa "Notas lidas pelo WhatsApp"; registrada: virou entrada; descartada: tirada da faixa */
export const SITUACOES_NOTA_WHATSAPP = ['pendente', 'registrada', 'descartada'] as const
export type SituacaoNotaWhatsapp = (typeof SITUACOES_NOTA_WHATSAPP)[number]

/** Uma nota da faixa (o resumo da leitura guardada) */
export interface NotaWhatsappPendente {
  id: string
  numero: string | null
  fornecedor: string
  /** Decimal da API (vNF) */
  total: string
  itens: number
  /** Quando chegou pelo WhatsApp (ISO) */
  recebidaEm: string
  /** Já existe entrada com o mesmo número e fornecedor (lançada por outro caminho) */
  jaLancada: { id: string; numero: string } | null
}
