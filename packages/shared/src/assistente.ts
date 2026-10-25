import { z } from 'zod'
import type { BaseInsumo, ModoCalculo } from './enums'

/*
 * Assistente GrafyGo: a IA que fala e age como "Assistente GrafyGo da <gráfica>". O núcleo (API) não depende de um
 * provedor: a central (painel da plataforma) escolhe o provedor, o modelo e a chave; cada uso grava tokens e custo.
 * Usos: entender respostas do cliente ao orçamento no WhatsApp que as regras não entendem e as ajudas internas da
 * equipe (montar orçamento a partir do texto do cliente, preencher produto, escrever descrições). Cada empresa liga e
 * desliga cada uso (Configurações → Assistente); a IA nunca decide preço nem inventa cadastro.
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
export const RECURSOS_IA = ['whatsapp_resposta', 'orcamento_texto', 'produto_texto', 'descricao', 'regras_texto', 'intencao', 'nota_compra', 'teste_central'] as const
export type RecursoIA = (typeof RECURSOS_IA)[number]
export const RECURSO_IA_ROTULOS: Record<RecursoIA, string> = {
  whatsapp_resposta: 'Respostas no WhatsApp',
  orcamento_texto: 'Orçamento a partir de texto',
  produto_texto: 'Ajuda para criar produto',
  descricao: 'Descrições',
  regras_texto: 'Regras de desconto com suas palavras',
  intencao: 'Peça ao Assistente (entender o pedido)',
  nota_compra: 'Nota de compra por foto ou PDF',
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
  /** O mesmo mês por recurso (WhatsApp, orçamento a partir de texto…), todas as empresas juntas */
  porRecurso: (Omit<UsoEmpresaIA, 'empresa'> & { recurso: string; itens: number })[]
  ultimosErros: { id: string; empresa: string | null; recurso: string; situacao: 'erro' | 'limite'; erro: string | null; modelo: string; em: string }[]
}

// ─── Controles da empresa (Configurações → Assistente) ───

/** Cada uso que a empresa liga ou desliga */
export const FUNCOES_ASSISTENTE = ['respostasWhatsapp', 'orcamentoTexto', 'produtos', 'descricoes', 'regras'] as const
export type FuncaoAssistente = (typeof FUNCOES_ASSISTENTE)[number]

export interface InfoFuncaoAssistente {
  recurso: RecursoIA
  titulo: string
  descricao: string
  /**
   * O resultado chega ao cliente da gráfica (mensagem, texto publicado sem revisão…). "Nunca falar com meus clientes"
   * desliga estes. Hoje nenhum fala: a leitura do WhatsApp só entende a resposta e avisa a equipe.
   */
  falaComCliente: boolean
}

export const FUNCOES_ASSISTENTE_INFO: Record<FuncaoAssistente, InfoFuncaoAssistente> = {
  respostasWhatsapp: {
    recurso: 'whatsapp_resposta',
    titulo: 'Respostas do WhatsApp',
    descricao: 'Entende respostas fora do padrão (“tá ótimo, pode mandar ver”) e avisa o vendedor com um resumo.',
    falaComCliente: false,
  },
  orcamentoTexto: {
    recurso: 'orcamento_texto',
    titulo: 'Orçamento a partir de texto',
    descricao: 'Cole o pedido do cliente e o Assistente monta os itens com os seus produtos. Os preços são sempre os do sistema.',
    falaComCliente: false,
  },
  produtos: {
    recurso: 'produto_texto',
    titulo: 'Ajuda para criar produtos',
    descricao: 'Descreva o produto e o Assistente preenche o cadastro para você conferir.',
    falaComCliente: false,
  },
  descricoes: {
    recurso: 'descricao',
    titulo: 'Descrições de produtos',
    descricao: 'Escreve a descrição do produto e o texto do site com os dados do cadastro. Você revisa antes de salvar.',
    falaComCliente: false,
  },
  regras: {
    recurso: 'regras_texto',
    titulo: 'Regras de desconto com suas palavras',
    descricao: 'Você explica como dá desconto e o Assistente preenche as perguntas das regras comerciais. Você confere antes de salvar.',
    falaComCliente: false,
  },
}

export const controlesAssistenteSchema = z.object({
  /** "Usar o Assistente GrafyGo": desligado, nenhum uso funciona */
  ativo: z.boolean(),
  respostasWhatsapp: z.boolean(),
  orcamentoTexto: z.boolean(),
  produtos: z.boolean(),
  descricoes: z.boolean(),
  /** "Explique com suas palavras" nas regras comerciais (ausente = ligado, como as outras ajudas) */
  regras: z.boolean().default(true),
  /** "Nunca falar com meus clientes": só as ajudas internas */
  semClientes: z.boolean(),
})
export type ControlesAssistente = z.infer<typeof controlesAssistenteSchema>

export const CONTROLES_ASSISTENTE_PADRAO: ControlesAssistente = { ativo: true, respostasWhatsapp: true, orcamentoTexto: true, produtos: true, descricoes: true, regras: true, semClientes: false }

/** A empresa deixa usar esta função (a central da GrafyGo ainda precisa estar ligada) */
export function funcaoLiberada(c: ControlesAssistente, funcao: FuncaoAssistente): boolean {
  return c.ativo && c[funcao] && !(c.semClientes && FUNCOES_ASSISTENTE_INFO[funcao].falaComCliente)
}

/** Uso do mês de uma função na empresa */
export interface UsoRecursoEmpresa {
  recurso: RecursoIA
  chamadas: number
  /** Itens de orçamento montados, produtos preenchidos ou descrições escritas */
  itens: number
}

/** Configurações → Assistente (e o que cada tela precisa para mostrar os botões) */
export interface AssistenteEmpresa {
  controles: ControlesAssistente
  /** A central da GrafyGo ligou o Assistente (sem isso nada funciona, mesmo ligado aqui) */
  disponivel: boolean
  /** Provedor simulado (desenvolvimento/demonstração): as telas avisam "modo de demonstração do Assistente" */
  simulado: boolean
  /** Cada função funciona agora (central ligada + controles da empresa) */
  liberado: Record<FuncaoAssistente, boolean>
  uso: {
    /** "2026-10" */
    mes: string
    chamadas: number
    /** Limite de chamadas no mês (null = sem limite) */
    limiteChamadas: number | null
    /** Quanto do limite de custo do mês já foi usado, em % (null = sem limite de custo) */
    percentualCusto: number | null
    porRecurso: UsoRecursoEmpresa[]
  }
}

/** Abaixo disto, o item sugerido aparece com "conferir" */
export const CONFIANCA_CONFERIR = 0.8

// ─── Orçamento a partir de texto ───

export const orcamentoDeTextoSchema = z.object({
  texto: z.string().trim().min(5, 'Escreva ou cole o pedido do cliente.').max(3000, 'Use até 3.000 caracteres.'),
})

export interface ItemOrcamentoSugerido {
  /** Produto do catálogo (null = o Assistente não achou um produto que sirva) */
  produto: { id: string; nome: string; codigo: string; modoCalculo: ModoCalculo; precisaArte: boolean } | null
  /** O que o cliente pediu, com as palavras do pedido */
  descricao: string
  /** Decimal da API ("1000", "2.5") */
  quantidade: string
  /** Metros */
  largura: string | null
  altura: string | null
  /** Só acabamentos que o produto aceita (os obrigatórios entram sempre) */
  acabamentos: { id: string; nome: string }[]
  observacao: string | null
  /** 0 a 1 */
  confianca: number
  /** Por que o Assistente escolheu este produto (ou por que não achou) */
  motivo: string
  /** Precisa conferir: confiança baixa, sem produto, acabamento ou medida que não serviu, preço com erro */
  conferir: boolean
  /** Avisos do sistema sobre o item ("acabamento X não é deste produto"…) */
  avisos: string[]
  /** Preço calculado pelo sistema com o motor de preços (a IA nunca dá preço) */
  preco: { ok: boolean; precoUnitario: string; total: string; erros: string[] } | null
}

/** Cliente novo tirado do texto do pedido (vira pré-cadastro ao salvar o orçamento) */
export interface ClienteNovoSugerido {
  nome: string | null
  tipoPessoa: 'PF' | 'PJ'
  /** CPF ou CNPJ válido (só dígitos); com CNPJ a tela busca razão social e endereço na Receita */
  documento: string | null
  /** DDD + número */
  whatsapp: string | null
  telefone: string | null
  email: string | null
}

export interface OrcamentoDeTexto {
  itens: ItemOrcamentoSugerido[]
  cliente: {
    /** Nome citado no pedido */
    mencionado: string | null
    /** Cliente do cadastro com o mesmo nome ou telefone (procurado pelo sistema, nunca pela IA) */
    encontrado: { id: string; rotulo: string } | null
    /**
     * Memória do cliente achado, tirada do histórico pelo sistema ("Costuma pedir: …", "Paga com: Pix", "Em aberto:
     * R$ …"); vazia sem cliente. A IA nunca escreve isto.
     */
    memoria?: string[]
    /** Mais de um cliente do cadastro pode ser o citado: a pessoa escolhe com um toque (o sistema não chuta) */
    candidatos?: { id: string; rotulo: string; detalhe: string | null }[]
    /**
     * Ninguém no cadastro: o cliente novo com o que o texto trouxe (nome, telefone, e-mail, CPF/CNPJ, lidos pelo
     * servidor — nunca pela IA). Cadastrado como pré-cadastro junto com o orçamento, quando a pessoa salva.
     */
    novo?: ClienteNovoSugerido | null
  }
  /** Prazo como o cliente escreveu ("sexta", "dia 15") */
  prazoDesejado: string | null
  observacoes: string | null
  /** Partes do pedido que não viraram item */
  naoIdentificados: string[]
  /**
   * O que oferecer ao cliente (ex.: "Oferecer a criação da arte"), pelo manual do atendente. Só sugere: nada entra no
   * orçamento sem a pessoa escolher (as sugestões das regras comerciais aparecem no editor, pelo sistema)
   */
  sugestoes: string[]
}

// ─── Ajuda para criar produto ───

export const produtoDeTextoSchema = z.object({
  texto: z.string().trim().min(5, 'Descreva o produto.').max(2000, 'Use até 2.000 caracteres.'),
})

export interface ProdutoSugerido {
  nome: string
  tipo: 'produto' | 'servico'
  /** Categoria existente (id) ou nova (id null: a pessoa cria) */
  categoria: { id: string | null; nome: string } | null
  modoCalculo: ModoCalculo
  unidadeMedidaId: string | null
  /** Metros */
  larguraPadrao: string | null
  alturaPadrao: string | null
  prazoProducaoDias: number | null
  precisaArte: boolean
  /** Insumos do cadastro (ids conferidos) com o consumo por unidade de cobrança */
  insumos: { insumoId: string; nome: string; unidade: string; custoUnitario: string; quantidade: string; base: BaseInsumo }[]
  /** Etapas de produção do cadastro (o tempo fica em branco: vale a velocidade da máquina ou o tempo padrão) */
  processos: { processoId: string; nome: string; maquinaId: string | null }[]
  acabamentos: { id: string; nome: string }[]
  /** Lucro desejado (%), só quando a pessoa disse */
  margem: string | null
  /** Descrição curta (orçamento e vitrine) */
  descricao: string
  /** O que não deu para usar ("material X não está no cadastro") */
  avisos: string[]
}

// ─── Descrições ───

export const descricaoAssistenteSchema = z.object({
  /** Produto salvo (os dados vêm do cadastro); sem ele, valem os campos do formulário */
  produtoId: z.string().uuid().optional(),
  /** produto = descrição do cadastro (aparece no orçamento); vitrine = texto de venda do site */
  destino: z.enum(['produto', 'vitrine']),
  /** Produto ainda não salvo: o que está no formulário */
  rascunho: z
    .object({
      nome: z.string().trim().min(2, 'Preencha o nome do produto.').max(200),
      categoria: z.string().trim().max(120).nullable().optional(),
      modoCalculo: z.enum(['unidade', 'm2', 'metro_linear', 'milheiro', 'hora']).optional(),
    })
    .optional(),
})
export type DescricaoAssistenteInput = z.input<typeof descricaoAssistenteSchema>

export interface DescricaoSugerida {
  texto: string
}

// ─── Regras de desconto com as palavras do dono ───

/** "Explique com suas palavras como você dá desconto": o texto do dono vira as respostas das perguntas (RegrasDeTexto) */
export const regrasDeTextoSchema = z.object({
  texto: z.string().trim().min(10, 'Explique em uma ou duas frases como você dá desconto.').max(2000, 'Use até 2.000 caracteres.'),
})
