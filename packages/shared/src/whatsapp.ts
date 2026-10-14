/**
 * Avisos automáticos do pedido pelo WhatsApp da própria gráfica (Evolution API, conexão por QR code).
 * Só alguns eventos do pedido, para clientes que já conversam com a gráfica: nada de envio em massa.
 * Também os envios feitos pela equipe ("Enviar pelo WhatsApp": orçamento, arte, catálogo...), um a um.
 */
import { z } from 'zod'
import { somenteDigitos } from './format'
import type { CategoriaTemplate, VariavelTemplate } from './enums'

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
  pedido_confirmado: 'Quando o orçamento aprovado vira pedido. Diz o próximo passo e leva o link para acompanhar o pedido.',
  arte_aprovacao: 'Quando a arte é enviada ao cliente: uma mensagem por pedido, com as artes anexadas e um link só para aprovar todas.',
  pedido_pronto: 'Quando o pedido fica pronto para retirada ou entrega.',
  pedido_em_entrega: 'Quando o pedido sai para entrega.',
  pagamento_recebido: 'A cada pagamento do pedido registrado no financeiro ou no caixa.',
  pedido_entregue: 'Quando a entrega ou retirada é registrada.',
}

/** Envios feitos pela equipe pelo diálogo "Enviar pelo WhatsApp" (saem na hora, fora da fila dos avisos) */
export const TIPOS_ENVIO_WHATSAPP = ['orcamento_enviado', 'arte_aprovacao', 'pedido_acompanhamento', 'pedido_pronto', 'recibo', 'catalogo', 'produto', 'vitrine'] as const
export type TipoEnvioWhatsapp = (typeof TIPOS_ENVIO_WHATSAPP)[number]

/** O que está registrado em mensagens_whatsapp: aviso automático ou envio da equipe */
export type TipoMensagemWhatsapp = EventoWhatsapp | TipoEnvioWhatsapp

export const TIPO_MENSAGEM_WHATSAPP_ROTULOS: Record<TipoMensagemWhatsapp, string> = {
  ...EVENTO_WHATSAPP_ROTULOS,
  orcamento_enviado: 'Orçamento',
  pedido_acompanhamento: 'Acompanhamento do pedido',
  recibo: 'Recibo',
  catalogo: 'Catálogo',
  produto: 'Produto',
  vitrine: 'Vitrine',
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
 * fica vazia somem (preencherMensagem). Empresas antigas com o texto anterior intacto recebem estes pela
 * migration 20261020100000_mensagens_whatsapp_formatadas.
 */
export const TEXTOS_PADRAO_MENSAGEM = {
  orcamento_enviado: [
    'Olá, {{cliente_nome}}!',
    '',
    'Segue o seu orçamento *{{numero_orcamento}}*:',
    '{{itens_orcamento}}',
    '',
    'Total: *{{valor_total}}*',
    'Prazo de produção: *{{prazo_producao}}*',
    'Válido até *{{validade}}*',
    '',
    ASSINATURA,
    '',
    'Veja os detalhes e aprove aqui:',
    '{{link_aprovacao}}',
  ].join('\n'),
  pedido_confirmado: [
    'Olá, {{cliente_nome}}!',
    '',
    'Recebemos a aprovação do orçamento *{{numero_orcamento}}*.',
    'Seu pedido *{{numero_pedido}}* está confirmado ✅',
    '',
    '{{proximo_passo}}',
    'Previsão de entrega: *{{data_entrega}}*',
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
    '{{forma_entrega}}',
    'Valor em aberto: *{{valor_em_aberto}}*',
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
    'Previsão de entrega: *{{data_entrega}}*',
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
    'Logo chega até você.',
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
    'Valor em aberto: *{{valor_em_aberto}}*',
    'Obrigado!',
    '',
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
