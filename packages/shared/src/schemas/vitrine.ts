import { z } from 'zod'
import type { ModoCalculo } from '../enums'
import { normalizarDecimal, telefoneOpcional } from './campos'

/** Texto opcional com limite: vazio vira null */
const textoOpcional = (max: number) =>
  z.preprocess((v) => (typeof v === 'string' && v.trim() === '' ? null : v), z.string().trim().max(max, `Use até ${max} caracteres.`).nullable().optional())

/**
 * Vitrine online (módulo `vitrine`, Etapa 1 — ver docs/VITRINE.md): site público de cada gráfica em
 * `{slug}.{DOMINIO_VITRINE}`, com os produtos escolhidos e a "lista de orçamento" que vira Solicitação.
 */

// ─── Configuração (Vitrine → Configurar vitrine) ────────────────────────────

/** Rede social: aceita @usuario ou o endereço completo */
const rede = textoOpcional(200)

export const vitrineConfigSchema = z.object({
  /** Site no ar (com o módulo liberado no plano) */
  ativa: z.boolean(),
  /** Título no topo; vazio = nome fantasia da empresa */
  titulo: textoOpcional(80),
  slogan: textoOpcional(140),
  /** "Quem somos" */
  sobre: textoOpcional(2000),
  /** Ex.: "Seg a sex, 8h às 18h · Sáb, 8h às 12h" */
  horario: textoOpcional(300),
  instagram: rede,
  facebook: rede,
  tiktok: rede,
  youtube: rede,
  mostrarEndereco: z.boolean(),
  mostrarTelefone: z.boolean(),
  mostrarWhatsapp: z.boolean(),
  /** Mensagem pronta do botão "Chamar no WhatsApp" */
  mensagemWhatsapp: textoOpcional(300),
  /** Texto exibido depois que o visitante envia a lista de orçamento */
  mensagemPedidoEnviado: textoOpcional(500),
  /** Descrição curta para buscadores e para o link compartilhado (até 160 letras) */
  seoDescricao: textoOpcional(160),
})
export type VitrineConfigInput = z.input<typeof vitrineConfigSchema>

/** Resposta do GET /vitrine/config (área logada) */
export interface VitrineConfig extends z.output<typeof vitrineConfigSchema> {
  /** Imagens do banner (até 3), na ordem */
  banners: { arquivoId: string; url: string }[]
  /** Endereço público: https://{slug}.{DOMINIO_VITRINE} (em desenvolvimento, http://{slug}.localhost:5173) */
  urlPublica: string
  /** O plano da empresa inclui o módulo (sem ele o site não abre, mesmo com `ativa`) */
  liberadaNoPlano: boolean
  /** Quantos produtos estão publicados */
  produtosPublicados: number
}

export const MAX_BANNERS_VITRINE = 3
export const MAX_IMAGENS_PRODUTO = 8

// ─── Produto na vitrine (aba "Vitrine" do produto e Vitrine → Produtos) ─────

export const MODOS_PRECO_VITRINE = ['fixo', 'a_partir_de', 'sob_consulta'] as const
export type ModoPrecoVitrine = (typeof MODOS_PRECO_VITRINE)[number]
export const MODO_PRECO_VITRINE_ROTULOS: Record<ModoPrecoVitrine, string> = {
  fixo: 'Preço fixo',
  a_partir_de: 'A partir de',
  sob_consulta: 'Sob consulta',
}

/** Endereço do produto no site: letras minúsculas, números e hífen (ex.: banner-em-lona) */
export const slugVitrine = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, 'Use ao menos 2 caracteres.')
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use só letras minúsculas, números e hífen (ex.: banner-em-lona).')

export const produtoVitrineSchema = z.object({
  publicado: z.boolean(),
  destaque: z.boolean(),
  /** Vazio = nome do produto */
  nomePublico: textoOpcional(120),
  /** Texto de venda (parágrafos separados por linha em branco) */
  descricaoPublica: textoOpcional(4000),
  modoPreco: z.enum(MODOS_PRECO_VITRINE),
  /** Vazio = gerado a partir do nome */
  slug: z.preprocess((v) => (v === '' ? null : v), slugVitrine.nullable().optional()),
  ordem: z.coerce.number().int().min(0).max(9999).default(0),
})
export type ProdutoVitrineInput = z.input<typeof produtoVitrineSchema>

export interface ImagemProdutoVitrine {
  id: string
  arquivoId: string
  ordem: number
  /** Miniatura (480 px) para a área logada */
  url: string
}

/** Linha de Vitrine → Produtos (área logada) */
export interface ProdutoVitrineResumo {
  id: string
  codigo: string
  nome: string
  categoria: { id: string; nome: string } | null
  modoCalculo: ModoCalculo
  precoVenda: string
  ativo: boolean
  publicado: boolean
  destaque: boolean
  nomePublico: string | null
  descricaoPublica: string | null
  modoPreco: ModoPrecoVitrine
  slug: string | null
  ordem: number
  imagens: ImagemProdutoVitrine[]
}

export const produtosVitrineQuerySchema = z.object({
  busca: z.string().trim().optional(),
  categoriaId: z.string().uuid().optional(),
  publicado: z.enum(['true', 'false']).optional(),
})
export type ProdutosVitrineQuery = z.input<typeof produtosVitrineQuerySchema>

export const ordemImagensSchema = z.object({ ids: z.array(z.string().uuid()).max(MAX_IMAGENS_PRODUTO) })

// ─── Site público (sem login) ───────────────────────────────────────────────

export interface PrecoVitrine {
  modo: ModoPrecoVitrine
  /** Valor em reais ("12.50"); null quando sob consulta */
  valor: string | null
  /** Rótulo da unidade da cobrança: "m²", "metro", "unidade", "milheiro", "hora" */
  unidade: string
}

export interface ProdutoCardVitrine {
  slug: string
  nome: string
  categoria: { id: string; nome: string } | null
  /** Capa (480 px) */
  capaUrl: string | null
  preco: PrecoVitrine
  prazoDias: number
  destaque: boolean
}

export interface AcabamentoVitrine {
  id: string
  nome: string
  descricao: string | null
  obrigatorio: boolean
  /** Já vem marcado */
  padrao: boolean
}

export interface ProdutoVitrine extends ProdutoCardVitrine {
  descricao: string | null
  /** Imagens grandes (1200 px), na ordem; a primeira é a capa */
  imagens: string[]
  modoCalculo: ModoCalculo
  /** Medidas em metros (só para m² e metro linear) */
  medidas: { larguraPadrao: string | null; alturaPadrao: string | null; larguraMaxima: string | null; alturaMaxima: string | null } | null
  acabamentos: AcabamentoVitrine[]
}

export interface VitrinePublica {
  slug: string
  empresa: {
    nome: string
    titulo: string
    slogan: string | null
    sobre: string | null
    horario: string | null
    logoUrl: string | null
    /** Código do tema (TEMAS); null = padrão */
    corTema: string | null
    whatsapp: string | null
    telefone: string | null
    email: string | null
    endereco: string | null
    redes: { instagram: string | null; facebook: string | null; tiktok: string | null; youtube: string | null }
    mensagemWhatsapp: string | null
    mensagemPedidoEnviado: string | null
    seoDescricao: string | null
  }
  banners: string[]
  categorias: { id: string; nome: string; quantidade: number }[]
  destaques: ProdutoCardVitrine[]
}

export const produtosPublicosQuerySchema = z.object({
  busca: z.string().trim().max(80).optional(),
  categoriaId: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
})
export type ProdutosPublicosQuery = z.input<typeof produtosPublicosQuerySchema>

const medidaPublica = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? null : normalizarDecimal(v as string)),
  z
    .string()
    .regex(/^\d{1,5}(\.\d{1,3})?$/, 'Medida inválida (use metros, ex.: 1,50).')
    .refine((v) => Number(v) > 0, 'A medida deve ser maior que zero.')
    .nullable()
    .optional(),
)

export const itemPedidoVitrineSchema = z.object({
  produtoSlug: slugVitrine,
  quantidade: z.coerce.number().int('Use um número inteiro.').min(1).max(1_000_000),
  largura: medidaPublica,
  altura: medidaPublica,
  acabamentoIds: z.array(z.string().uuid()).max(20).default([]),
  observacao: textoOpcional(500),
})
export type ItemPedidoVitrineInput = z.input<typeof itemPedidoVitrineSchema>

/** Lista de orçamento enviada pelo visitante → Solicitação (origem "site") com os itens */
export const pedidoVitrineSchema = z.object({
  nome: z.string().trim().min(2, 'Informe seu nome.').max(120),
  whatsapp: telefoneOpcional.refine((v) => Boolean(v), 'Informe seu WhatsApp.'),
  email: z.preprocess((v) => (v === '' ? null : v), z.string().trim().email('E-mail inválido.').max(200).nullable().optional()),
  mensagem: textoOpcional(2000),
  itens: z.array(itemPedidoVitrineSchema).min(1, 'Adicione ao menos um produto à lista.').max(30),
  /** Campo-isca: invisível para pessoas; robôs preenchem (a API descarta em silêncio) */
  site: z.string().max(200).optional(),
})
export type PedidoVitrineInput = z.input<typeof pedidoVitrineSchema>

export interface PedidoVitrineEnviado {
  /** Número da solicitação (ex.: SOL-2026-0012) */
  numero: string
  mensagem: string
}

// ─── Itens da solicitação (vindos da vitrine) ───────────────────────────────

export interface SolicitacaoItem {
  id: string
  produtoId: string | null
  /** Nome do produto no momento do pedido */
  descricao: string
  quantidade: number
  largura: string | null
  altura: string | null
  acabamentos: { id: string; nome: string }[]
  observacao: string | null
}

// ─── Endereço (subdomínio) ──────────────────────────────────────────────────

/** Subdomínios que nunca são vitrine (e que a criação de empresa não aceita como slug) */
export const SUBDOMINIOS_RESERVADOS = [
  'www', 'app', 'api', 'admin', 'plataforma', 'painel', 'mail', 'smtp', 'ftp',
  'status', 'blog', 'ajuda', 'suporte', 'docs', 'cdn', 'static', 'assets',
] as const

export function subdominioReservado(slug: string): boolean {
  return (SUBDOMINIOS_RESERVADOS as readonly string[]).includes(slug.trim().toLowerCase())
}
