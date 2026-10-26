/**
 * Avisos automáticos do pedido pelo WhatsApp da própria gráfica (Evolution API, conexão por QR code).
 * Só alguns eventos do pedido, para clientes que já conversam com a gráfica: nada de envio em massa.
 * Também os envios feitos pela equipe ("Enviar pelo WhatsApp": orçamento, arte, catálogo...), um a um.
 */
import { z } from 'zod'
import { somenteDigitos } from './format'
import type { CategoriaTemplate, VariavelTemplate } from './enums'
import { NOME_ASSISTENTE, type IntencaoRespostaIA } from './assistente'

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
  pedido_confirmado: 'Quando o orçamento aprovado vira pedido: itens, total, pagamento, previsão e local de entrega, e o link para acompanhar.',
  arte_aprovacao: 'Quando a arte é enviada ao cliente: uma mensagem por pedido, com as artes anexadas e um link só para aprovar todas.',
  pedido_pronto: 'Quando o pedido fica pronto para retirada ou entrega.',
  pedido_em_entrega: 'Quando o pedido sai para entrega.',
  pagamento_recebido: 'A cada pagamento do pedido registrado no financeiro ou no caixa.',
  pedido_entregue: 'Quando a entrega ou retirada é registrada.',
}

/** Envios feitos pela equipe pelo diálogo "Enviar pelo WhatsApp" (saem na hora, fora da fila dos avisos) */
export const TIPOS_ENVIO_WHATSAPP = ['orcamento_enviado', 'arte_aprovacao', 'pedido_acompanhamento', 'pedido_pronto', 'recibo', 'catalogo', 'produto', 'vitrine', 'resposta_conversa'] as const
export type TipoEnvioWhatsapp = (typeof TIPOS_ENVIO_WHATSAPP)[number]

/**
 * Mensagens do pedido com tudo no corpo (itens, pagamento, entrega). O texto vem da API (GET
 * /whatsapp/pedidos/:id/mensagem) para o envio da equipe sair igual ao aviso automático.
 */
export const CATEGORIAS_MENSAGEM_PEDIDO = ['pedido_confirmado', 'pedido_pronto', 'pedido_em_entrega', 'pagamento_recebido', 'pedido_entregue', 'pedido_acompanhamento'] as const
export type CategoriaMensagemPedido = (typeof CATEGORIAS_MENSAGEM_PEDIDO)[number]

export const mensagemPedidoQuerySchema = z.object({ tipo: z.enum(CATEGORIAS_MENSAGEM_PEDIDO) })

/**
 * O que está registrado em mensagens_whatsapp: aviso automático, envio da equipe ou a resposta curta que o sistema
 * manda sozinho quando o cliente responde o orçamento na conversa ("resposta_orcamento")
 */
export type TipoMensagemWhatsapp = EventoWhatsapp | TipoEnvioWhatsapp | 'resposta_orcamento'

export const TIPO_MENSAGEM_WHATSAPP_ROTULOS: Record<TipoMensagemWhatsapp, string> = {
  ...EVENTO_WHATSAPP_ROTULOS,
  orcamento_enviado: 'Orçamento',
  resposta_orcamento: 'Resposta ao cliente',
  pedido_acompanhamento: 'Acompanhamento do pedido',
  recibo: 'Recibo',
  catalogo: 'Catálogo',
  produto: 'Produto',
  vitrine: 'Vitrine',
  resposta_conversa: 'Resposta na conversa',
}

/**
 * Padrão de toda mensagem ao cliente (automática ou enviada pela equipe):
 * saudação na primeira linha; frases curtas; linha em branco entre os blocos; *negrito* nos dados principais
 * (número, total, data, situação); no máximo um emoji; assinatura curta com o nome da gráfica; e UM link,
 * sozinho na última linha, depois de uma linha curta que diz o que ele abre (assim o WhatsApp mostra a prévia).
 */
const ASSINATURA = '— {{empresa_nome}}'

/**
 * Textos padrão das mensagens (também os templates criados para cada empresa). As linhas cuja variável
 * fica vazia somem (preencherMensagem). Empresas antigas com o texto anterior intacto recebem estes pelas
 * migrations 20261020100000_mensagens_whatsapp_formatadas, 20261022100000_arte_aprovacao_simples,
 * 20261024100000_mensagens_pedido_completas, 20261025100000_orcamento_pagamento, 20261027100000_whatsapp_respostas e
 * 20261101100000_regras_comerciais (as editadas ficam como estão).
 */
export const TEXTOS_PADRAO_MENSAGEM = {
  // Já com o pagamento combinado (o "pedido confirmado" fala das parcelas: o cliente viu aqui antes) e a aprovação na
  // própria conversa. A linha de aprovação abaixo é trocada na hora do envio pela do formato que a gráfica escolheu
  // (textoParaFormato): conversa natural (padrão), enquete "✅ Aprovado / ✏️ Quero modificações" ou "responda 1 ou 2";
  // sem a conexão da gráfica (wa.me, copiar) não há enquete. O link fica para quem preferir
  orcamento_enviado: [
    'Olá, {{cliente_nome}}!',
    '',
    'Segue o seu orçamento *{{numero_orcamento}}*:',
    '{{itens_orcamento}}',
    '',
    'Total: *{{valor_total}}*',
    // Frases das regras comerciais ("Desconto de 5% por quantidade"); sem regra, a linha some
    '{{descontos}}',
    'Pagamento: {{condicoes_pagamento}}',
    'Prazo de produção: *{{prazo_producao}}*',
    'Válido até *{{validade}}*',
    '',
    'Toque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.',
    '',
    ASSINATURA,
    '',
    'Se preferir, veja e aprove pelo link:',
    '{{link_aprovacao}}',
  ].join('\n'),
  // Tudo no corpo (itens, pagamento, entrega): o cliente não precisa abrir o link. Não fala da arte (a arte só vai
  // ao cliente quando a gráfica escolhe, numa mensagem própria)
  pedido_confirmado: [
    'Olá, {{cliente_nome}}!',
    '',
    'Seu pedido *{{numero_pedido}}* está confirmado ✅',
    '{{itens_pedido}}',
    '',
    'Total: *{{valor_total}}*',
    '{{resumo_pagamento}}',
    '{{proximo_vencimento}}',
    'Previsão de entrega: *{{data_entrega}}*',
    '{{local_entrega}}',
    '',
    'Avisamos por aqui quando estiver pronto.',
    '',
    ASSINATURA,
    '',
    'Acompanhe o pedido aqui:',
    '{{link_acompanhamento}}',
  ].join('\n'),
  // Uma mensagem por pedido: todas as artes listadas; os arquivos vão logo depois do texto (imagem ou PDF)
  // e o link (página do pedido, seção das artes) é só para quem preferir aprovar por lá
  arte_aprovacao: [
    'Olá, {{cliente_nome}}!',
    '',
    'Segue a arte do pedido *{{numero_pedido}}* para a sua aprovação 🎨',
    '{{itens_arte}}',
    '',
    'Confira textos, cores e medidas.',
    'Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.',
    '',
    ASSINATURA,
    '',
    'Se preferir, veja e aprove pelo link:',
    '{{link_aprovacao}}',
  ].join('\n'),
  pedido_pronto: [
    'Olá, {{cliente_nome}}!',
    '',
    'Seu pedido *{{numero_pedido}}* está *pronto* 📦',
    '{{itens_pedido}}',
    '',
    '{{local_entrega}}',
    '{{resumo_pagamento}}',
    '{{pix_pagamento}}',
    '',
    ASSINATURA,
    '',
    'Detalhes do pedido:',
    '{{link_acompanhamento}}',
  ].join('\n'),
  pedido_acompanhamento: [
    'Olá, {{cliente_nome}}!',
    '',
    'Você pode acompanhar o andamento do pedido *{{numero_pedido}}* pelo link abaixo.',
    '{{itens_pedido}}',
    '',
    'Previsão de entrega: *{{data_entrega}}*',
    '{{resumo_pagamento}}',
    '',
    ASSINATURA,
    '',
    'Acompanhe aqui:',
    '{{link_acompanhamento}}',
  ].join('\n'),
  pedido_em_entrega: [
    'Olá, {{cliente_nome}}!',
    '',
    'Seu pedido *{{numero_pedido}}* *saiu para entrega* 🚚',
    '{{local_entrega}}',
    '{{resumo_pagamento}}',
    '{{pix_pagamento}}',
    '',
    ASSINATURA,
    '',
    'Acompanhe a entrega aqui:',
    '{{link_acompanhamento}}',
  ].join('\n'),
  pedido_entregue: [
    'Olá, {{cliente_nome}}!',
    '',
    'Seu pedido *{{numero_pedido}}* foi *entregue* ✅',
    'Obrigado pela preferência! Qualquer coisa, é só responder esta mensagem.',
    '',
    ASSINATURA,
  ].join('\n'),
  pagamento_recebido: [
    'Olá, {{cliente_nome}}!',
    '',
    'Recebemos o seu pagamento de *{{valor_pago}}* do pedido *{{numero_pedido}}* ✅',
    '{{resumo_pagamento}}',
    '{{proximo_vencimento}}',
    '',
    'Obrigado!',
    ASSINATURA,
  ].join('\n'),
  cobranca: [
    'Olá, {{cliente_nome}}!',
    '',
    'Lembramos que há um valor em aberto de *{{valor_total}}*.',
    'Se você já fez o pagamento, por favor desconsidere esta mensagem.',
    '',
    ASSINATURA,
  ].join('\n'),
  boas_vindas: ['Olá, {{cliente_nome}}!', '', 'Obrigado pelo contato. Em que podemos ajudar?', '', ASSINATURA].join('\n'),
} satisfies Record<CategoriaTemplate, string>

// ─── Aprovação do orçamento pela própria conversa (enquete ou resposta em texto) ───

/** Linha do orçamento enviado pela conexão da gráfica (logo depois vai a enquete) */
export const LINHA_APROVACAO_COM_ENQUETE = 'Toque em uma opção logo abaixo ou responda *APROVADO* aqui mesmo.'
/** A mesma linha quando não há enquete (wa.me, copiar): o texto da versão anterior */
export const LINHA_APROVACAO_SEM_ENQUETE = 'Responda *APROVADO* aqui mesmo ou peça o ajuste que precisar.'

/** Opções da enquete que segue o orçamento (o voto chega pelo webhook com o nome da opção) */
export const OPCOES_ENQUETE_ORCAMENTO = { aprovar: '✅ Aprovado', modificar: '✏️ Quero modificações' } as const

export const perguntaEnqueteOrcamento = (numero: string) => `Aprovar o orçamento ${numero}?`

/** A mesma linha quando a gráfica escolheu "Responder 1 ou 2" (sem enquete) */
export const LINHA_APROVACAO_NUMEROS = 'Para aprovar, responda *1*.\nPara pedir alguma mudança, responda *2*.'

/**
 * A mesma linha no formato "conversa" (o padrão): sem enquete nem número, o cliente responde do jeito dele ("pode
 * fazer", "fechado", "👍", "dá pra trocar a cor?") e as regras + o Assistente GrafyGo entendem.
 */
export const LINHA_APROVACAO_CONVERSA = 'Se estiver tudo certo, é só responder por aqui que já colocamos em produção. Quer mudar alguma coisa? É só falar.'

/**
 * Como o cliente aprova o orçamento enviado pela conexão da gráfica (tela WhatsApp, por empresa): respondendo na
 * conversa, do jeito dele (padrão); tocando na enquete que vai logo depois; ou respondendo 1 (aprovar) / 2 (pedir
 * mudança). Escrever "aprovado" vale nos três.
 */
export const FORMATOS_APROVACAO = ['conversa', 'enquete', 'numeros'] as const
export type FormatoAprovacao = (typeof FORMATOS_APROVACAO)[number]
/** Empresa nova (e valor desconhecido no banco) */
export const FORMATO_APROVACAO_PADRAO: FormatoAprovacao = 'conversa'
export const FORMATO_APROVACAO_ROTULOS: Record<FormatoAprovacao, string> = {
  conversa: 'Conversa natural',
  enquete: 'Enquete (o cliente toca na opção)',
  numeros: 'Responder 1 ou 2',
}

/**
 * Como saiu cada orçamento (gravado na mensagem): na conversa natural, com enquete, pedindo 1/2, ou só texto (wa.me,
 * copiar, enquete que não foi, linha editada sem o "responda 1"). O "1"/"2" do cliente só vale para o orçamento que
 * saiu como "numeros".
 */
export type FormatoRespostaOrcamento = FormatoAprovacao | 'texto'

const LINHA_POR_FORMATO: Record<FormatoRespostaOrcamento, string> = {
  conversa: LINHA_APROVACAO_CONVERSA,
  enquete: LINHA_APROVACAO_COM_ENQUETE,
  numeros: LINHA_APROVACAO_NUMEROS,
  texto: LINHA_APROVACAO_SEM_ENQUETE,
}

/**
 * Um template só (Mensagens prontas) para todos os jeitos: na hora do envio, a linha de aprovação padrão que estiver no
 * texto (qualquer uma delas) vira a do formato. Linha editada pela gráfica não é reconhecida e fica como está.
 */
export function textoParaFormato(texto: string, formato: FormatoRespostaOrcamento): string {
  const destino = LINHA_POR_FORMATO[formato]
  return Object.values(LINHA_POR_FORMATO)
    .filter((l) => l !== destino)
    .reduce((t, l) => t.split(l).join(destino), texto)
}

/** Sem a enquete (o "Abrir no WhatsApp" e o "Copiar" não levam enquete), a linha que fala dela vira "Responda APROVADO..." */
export function textoSemEnquete(texto: string): string {
  return textoParaFormato(texto, 'texto')
}

/** O texto pede ao cliente para responder 1 (a linha padrão ou uma editada que diga "responda 1") */
export const textoPedeNumeros = (texto: string) => /responda\s*\*?\s*1\b/i.test(texto)

/** O que o cliente respondeu ao orçamento na conversa */
export type TipoRespostaWhatsapp = 'aprovado' | 'modificacoes' | 'outra'
export const TIPO_RESPOSTA_WHATSAPP_ROTULOS: Record<TipoRespostaWhatsapp, string> = {
  aprovado: '✅ Aprovado',
  modificacoes: '✏️ Quero modificações',
  outra: 'Respondeu',
}

export interface RespostaWhatsapp {
  tipo: TipoRespostaWhatsapp
  /** Votou na enquete, escreveu na conversa (regras) ou escreveu e o Assistente GrafyGo entendeu */
  via: 'enquete' | 'texto' | 'assistente'
  /** O que o cliente escreveu (texto) ou a opção da enquete */
  texto: string | null
  em: string
  /** O que o Assistente entendeu (via "assistente"); pendente = ainda lendo a resposta */
  assistente?: { intencao: IntencaoRespostaIA; confianca: number; resumo: string } | { pendente: true } | null
}

/** "Resposta: ✅ Aprovado (enquete)" / "Resposta: ✏️ Quero modificações — “mudar a cor”" / "Resposta: “bom dia”" */
export function descreverRespostaWhatsapp(r: RespostaWhatsapp): string {
  if (r.assistente && 'pendente' in r.assistente) return `Resposta: “${r.texto ?? ''}” · o ${NOME_ASSISTENTE} está lendo`
  if (r.via === 'assistente' && r.assistente) {
    const base = r.tipo === 'outra' ? `${NOME_ASSISTENTE}: ${r.assistente.resumo}` : `Resposta: ${TIPO_RESPOSTA_WHATSAPP_ROTULOS[r.tipo]} — “${r.texto ?? ''}”`
    return `${base} · entendido pelo ${NOME_ASSISTENTE}`
  }
  if (r.tipo === 'outra') return r.texto ? `Resposta: “${r.texto}”` : `Resposta na enquete (opção não lida)`
  const base = `Resposta: ${TIPO_RESPOSTA_WHATSAPP_ROTULOS[r.tipo]}`
  if (r.via === 'enquete') return `${base} (enquete)`
  return r.texto ? `${base} — “${r.texto}”` : base
}

/** Textos padrão dos avisos automáticos (os mesmos das categorias de template de mesmo nome) */
export const TEXTOS_PADRAO_WHATSAPP: Record<EventoWhatsapp, string> = {
  pedido_confirmado: TEXTOS_PADRAO_MENSAGEM.pedido_confirmado,
  arte_aprovacao: TEXTOS_PADRAO_MENSAGEM.arte_aprovacao,
  pedido_pronto: TEXTOS_PADRAO_MENSAGEM.pedido_pronto,
  pedido_em_entrega: TEXTOS_PADRAO_MENSAGEM.pedido_em_entrega,
  pagamento_recebido: TEXTOS_PADRAO_MENSAGEM.pagamento_recebido,
  pedido_entregue: TEXTOS_PADRAO_MENSAGEM.pedido_entregue,
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
    /** Cliente respondeu "Aprovado" (enquete ou texto): aprova sozinho (e vira pedido se a empresa deixou ligado) */
    aprovarPelaResposta: z.boolean().optional(),
    /** Como o cliente aprova o orçamento: conversa natural, enquete ou responder 1/2 */
    formatoAprovacao: z.enum(FORMATOS_APROVACAO).optional(),
    /** Usar o Assistente GrafyGo para entender respostas fora do padrão */
    assistenteRespostas: z.boolean().optional(),
  })
  .refine((v) => v.horarioInicio < v.horarioFim, { message: 'O fim precisa ser depois do início.', path: ['horarioFim'] })
export type WhatsappConfigInput = z.input<typeof whatsappConfigSchema>

export const mensagensWhatsappQuerySchema = z.object({
  status: z.enum(STATUS_MENSAGEM_WHATSAPP).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
})

/** PDF que vai junto do envio da equipe (orçamento, recibo, catálogo) */
export const ANEXO_WHATSAPP_MAX_MB = 10

/** Arquivos das artes que vão logo depois do texto: até 6 e 15 MB no total (o resto fica pelo link) */
export const ANEXOS_ARTE_MAX = 6
export const ANEXOS_ARTE_MAX_MB = 15

/** Imagens que o WhatsApp mostra na conversa (as outras vão como documento) */
const MIMES_IMAGEM_WHATSAPP = ['image/jpeg', 'image/png', 'image/webp']
export const vaiComoImagem = (mime: string) => MIMES_IMAGEM_WHATSAPP.includes(mime)

export interface ArquivoArte {
  id: string
  nome: string
  mime: string
  tamanho: number
}

/**
 * Arquivo da arte que o cliente consegue abrir no celular: a própria arte quando é imagem ou PDF; senão
 * (CDR, AI, PSD...) a miniatura gerada no upload; sem ela, nenhum (essa arte fica só pelo link).
 */
export function arquivoVisivelDaArte(arte: { arquivo: ArquivoArte | null; miniatura?: ArquivoArte | null }): ArquivoArte | null {
  const a = arte.arquivo
  if (a && (vaiComoImagem(a.mime) || a.mime === 'application/pdf')) return a
  return arte.miniatura ?? null
}

/** Escolhe, na ordem, os arquivos que cabem no limite (quantidade e tamanho total); os outros ficam pelo link */
export function escolherAnexosArte<T extends { tamanho: number }>(arquivos: T[], max = ANEXOS_ARTE_MAX, maxMb = ANEXOS_ARTE_MAX_MB): { anexos: T[]; ficaram: T[] } {
  const limite = maxMb * 1024 * 1024
  const anexos: T[] = []
  const ficaram: T[] = []
  let total = 0
  for (const a of arquivos) {
    if (anexos.length < max && total + a.tamanho <= limite) {
      anexos.push(a)
      total += a.tamanho
    } else ficaram.push(a)
  }
  return { anexos, ficaram }
}

const uuidOpcional = z.string().uuid().nullish()

/**
 * "Enviar pelo WhatsApp" da equipe: a mensagem sai na hora pela conexão da gráfica (respeita a pausa, não o horário).
 * O vínculo diz de onde veio (orçamento, pedido, arte) para o histórico e para não repetir o aviso automático.
 */
export const envioWhatsappSchema = z
  .object({
    tipo: z.enum(TIPOS_ENVIO_WHATSAPP),
    telefone: z
      .string()
      .trim()
      .max(30)
      .refine((v) => normalizarNumeroWhatsapp(v) !== null, 'Informe um WhatsApp válido com DDD.'),
    texto: z.string().trim().min(1, 'Escreva a mensagem.').max(4000, 'A mensagem passou de 4.000 caracteres.'),
    clienteId: uuidOpcional,
    orcamentoId: uuidOpcional,
    pedidoId: uuidOpcional,
    /** Arte (link de aprovação) */
    arteId: uuidOpcional,
    /** Arquivos das artes do pedido que vão logo depois do texto (o servidor busca e confere cada um) */
    arquivoIds: z.array(z.string().uuid()).max(ANEXOS_ARTE_MAX, `Até ${ANEXOS_ARTE_MAX} arquivos por mensagem.`).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === 'orcamento_enviado' && !v.orcamentoId) ctx.addIssue({ code: 'custom', path: ['orcamentoId'], message: 'Informe o orçamento.' })
    if (['arte_aprovacao', 'pedido_acompanhamento', 'pedido_pronto', 'recibo'].includes(v.tipo) && !v.pedidoId) ctx.addIssue({ code: 'custom', path: ['pedidoId'], message: 'Informe o pedido.' })
    if (v.arquivoIds?.length && (v.tipo !== 'arte_aprovacao' || !v.pedidoId)) ctx.addIssue({ code: 'custom', path: ['arquivoIds'], message: 'Só as artes do pedido vão como arquivo.' })
  })
export type EnvioWhatsappInput = z.input<typeof envioWhatsappSchema>

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
  /** Aprova sozinho quando o cliente responde "Aprovado" na conversa (enquete ou texto) */
  aprovarPelaResposta: boolean
  /** Como o cliente aprova o orçamento enviado por aqui */
  formatoAprovacao: FormatoAprovacao
  /** Usar o Assistente GrafyGo para entender respostas fora do padrão (escolha da empresa) */
  assistenteRespostas: boolean
  /** A GrafyGo ligou o Assistente na central (sem isso a escolha acima não tem efeito) */
  assistenteDisponivel: boolean
  /** Mensagens na fila agora */
  pendentes: number
}

/**
 * Se o diálogo "Enviar pelo WhatsApp" manda pela conexão da gráfica ou abre o WhatsApp (wa.me).
 * Qualquer usuário logado consulta (o designer manda a arte sem ver a tela WhatsApp).
 */
export interface DisponibilidadeWhatsapp {
  /** true = "Enviar" sai pela conexão da gráfica; false = "Abrir no WhatsApp" */
  conectado: boolean
  /** Por que não dá para enviar daqui (null quando conectado) */
  motivo: string | null
  /** Número conectado (55DDD…) */
  numero: string | null
  /** Modo de teste (WHATSAPP_PROVEDOR=log): a mensagem só é registrada */
  teste: boolean
  /** Orçamento pela conexão: conversa natural, enquete ou o texto pede 1/2 */
  formatoAprovacao: FormatoAprovacao
}

export interface ConexaoWhatsapp {
  estado: EstadoConexaoWhatsapp
  numero: string | null
  /** QR code (data:image/png;base64,...) enquanto espera a leitura */
  qrBase64: string | null
}

export interface MensagemWhatsapp {
  id: string
  evento: TipoMensagemWhatsapp
  /** Enviada pela equipe (diálogo "Enviar pelo WhatsApp"), não aviso automático */
  manual: boolean
  telefone: string
  texto: string
  status: StatusMensagemWhatsapp
  tentativas: number
  erro: string | null
  /** Nome do PDF que foi junto */
  anexoNome: string | null
  /** Saiu junto com outro aviso do mesmo pedido (uma mensagem só) */
  agrupadaComId: string | null
  enviadaEm: string | null
  createdAt: string
  cliente: { id: string; nome: string; fantasia: string | null } | null
  pedido: { id: string; numero: string } | null
  orcamento: { id: string; numero: string } | null
  usuario: { id: string; nome: string } | null
  /** Orçamento: a resposta do cliente na conversa (enquete ou texto), a mais recente */
  resposta: RespostaWhatsapp | null
}

/** Resposta do "Enviar pelo WhatsApp" (aviso: o texto foi, mas o PDF não) */
export interface ResultadoEnvioWhatsapp {
  mensagem: MensagemWhatsapp
  aviso: string | null
}

const VARIAVEL = /\{\{\s*([a-z_]+)\s*\}\}/g

/**
 * Preenche o template como preencherTemplate e tira as linhas que ficaram sem o conteúdo da variável
 * (ex.: "Acompanhe aqui:" sem o link, "— " sem o nome da gráfica, "Total: **" sem o valor).
 * Variável de várias linhas (itens do orçamento) entra inteira. Sobra no máximo uma linha em branco entre os blocos.
 */
export function preencherMensagem(conteudo: string, valores: Partial<Record<VariavelTemplate, string>>): string {
  const linhas = conteudo.replace(/\r\n?/g, '\n').split('\n')
  const saida: string[] = []
  for (let i = 0; i < linhas.length; i++) {
    const linha = linhas[i]!
    let vazia = false
    const preenchida = linha.replace(VARIAVEL, (_t, nome: string) => {
      const valor = valores[nome as VariavelTemplate]?.trim() ?? ''
      if (!valor) vazia = true
      return valor
    })
    const semVariavel = !preenchida.replace(/[\s*_~—–\-•.,;:!?]/g, '')
    // Linha que só existia para a variável vazia, ou que terminava nela ("Total: *{{valor}}*") sai inteira
    if (vazia && (semVariavel || /:\s*$/.test(preenchida) || /\*\s*\*|_\s*_/.test(preenchida))) continue
    // Rótulo ("Acompanhe aqui:") cuja linha seguinte é só um link que ficou vazio: sai junto
    const link = /^\s*\{\{\s*(link_[a-z_]+)\s*\}\}\s*$/.exec(linhas[i + 1] ?? '')
    if (link && /:\s*$/.test(preenchida) && !valores[link[1] as VariavelTemplate]?.trim()) continue
    saida.push(preenchida.trimEnd())
  }
  return (
    saida
      .join('\n')
      // Sem o nome do cliente: "Olá!" (não "Olá, !")
      .replace(/^(Olá|Oi),\s*!/gim, '$1!')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  )
}

/** Link do WhatsApp com o texto pronto (envio manual quando a conexão caiu) */
export function linkWaMe(numero: string, texto: string): string {
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}

/** Número para mostrar: "5511988887777" → "(11) 98888-7777" (outros ficam como vieram) */
export function formatarNumeroWhatsapp(numero: string | null | undefined): string {
  const d = somenteDigitos(numero ?? '').replace(/^55(?=\d{10,11}$)/, '')
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  return numero ?? ''
}
