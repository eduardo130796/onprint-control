import { z } from 'zod'
import { BASES_INSUMO, MODOS_CALCULO, TIPOS_COBRANCA, type BaseInsumo, type ModoCalculo, type TipoCobranca } from './enums'
import { normalizarDecimal, percentual, valorMonetario } from './schemas/campos'
import { produtoBase } from './schemas/produtos'

/*
 * "Cadastrar vários de uma vez": a tabela de preços que a gráfica já tem (texto colado do WhatsApp, foto ou PDF,
 * planilha CSV) ou os modelos prontos do catálogo inicial viram linhas de revisão. A IA só estrutura o que está
 * escrito: preço que não aparece fica vazio ("falta preço") e nada é salvo antes de a pessoa tocar em "Criar". As
 * regras daqui (normalizar, achar duplicado, validar) valem na tela e na API.
 */

/** Acabamento citado na linha: o do cadastro (id) ou um novo, criado junto com o produto (só com o preço) */
export interface AcabamentoDaLinha {
  /** Acabamento do cadastro (null = novo) */
  id: string | null
  nome: string
  tipoCobranca: TipoCobranca
  /** Decimal da API; novo sem preço = null (fica de fora até a pessoa digitar) */
  valor: string | null
}

/** Material da composição de custo (insumo do cadastro) */
export interface MaterialDaLinha {
  insumoId: string
  nome: string
  unidade: string
  quantidade: string
  base: BaseInsumo
}

/** De onde veio a linha */
export const ORIGENS_LINHA = ['texto', 'foto', 'planilha', 'modelo', 'whatsapp'] as const
export type OrigemLinha = (typeof ORIGENS_LINHA)[number]

/** Uma linha da revisão (um produto a criar) */
export interface LinhaCadastro {
  /** Identifica a linha na tela */
  chave: string
  nome: string
  tipo: 'produto' | 'servico'
  /** Categoria do cadastro ou uma nova (pelo nome, criada junto) */
  categoriaId: string | null
  categoriaNova: string | null
  modoCalculo: ModoCalculo
  /** Sigla da unidade (m², un, m, mil, h); a API acha o id */
  unidadeSigla: string | null
  /** Decimal da API; null = falta preço */
  precoVenda: string | null
  larguraPadrao: string | null
  alturaPadrao: string | null
  larguraMaxima: string | null
  alturaMaxima: string | null
  prazoProducaoDias: number | null
  precisaArte: boolean
  acabamentos: AcabamentoDaLinha[]
  materiais: MaterialDaLinha[]
  descricao: string | null
  /** Por que conferir (vazio = a leitura foi clara) */
  conferir: string[]
  /** Produto do cadastro com nome parecido */
  duplicado: { id: string; nome: string } | null
  origem: OrigemLinha
}

/** O que a leitura devolve para a revisão */
export interface LeituraCadastroLote {
  linhas: LinhaCadastro[]
  /** O que não virou produto ou precisa de atenção ("a foto não parece uma tabela de preços") */
  avisos: string[]
  /** Leitura guardada do WhatsApp (o "Criar" marca como criada) */
  leituraId?: string | null
}

/** Resultado do "Criar N produtos" */
export interface ResultadoCadastroLote {
  criados: { id: string; codigo: string; nome: string }[]
  categoriasNovas: string[]
  acabamentosNovos: string[]
}

/** Até quantos produtos por vez (a revisão no celular continua legível) */
export const MAX_PRODUTOS_LOTE = 100

// ─── Normalização ───

/** "  banner  lona 440g " → "Banner lona 440g" (uma linha, primeira letra maiúscula, até 160) */
export function normalizarNomeProduto(nome: string): string {
  const t = nome.replace(/\s+/g, ' ').trim().slice(0, 160)
  return t ? t[0]!.toLocaleUpperCase('pt-BR') + t.slice(1) : ''
}

/** "R$ 1.250,50", "65", "4,00 a unidade", "R$65" → "1250.50"; sem número ou zero → null */
export function valorDoTexto(texto: string | number | null | undefined): string | null {
  if (texto === null || texto === undefined) return null
  if (typeof texto === 'number') return Number.isFinite(texto) && texto > 0 && texto < 10_000_000 ? texto.toFixed(2) : null
  const m = /\d[\d.,]*/.exec(texto.replace(/\s+/g, ''))
  if (!m) return null
  let n = m[0].replace(/[.,]$/, '')
  // "1.250" (milhar) × "12.5" (decimal com ponto): ponto seguido de 3 dígitos no fim é milhar
  if (!n.includes(',') && /^\d{1,3}(\.\d{3})+$/.test(n)) n = n.replace(/\./g, '')
  const v = Number(normalizarDecimal(n))
  return Number.isFinite(v) && v > 0 && v < 10_000_000 ? v.toFixed(2) : null
}

/** A unidade ou forma de cobrança escrita na tabela ("m²", "metro", "milheiro", "hora", "un") → modo de cálculo */
export function modoDaUnidade(texto: string | null | undefined): ModoCalculo | null {
  const t = semAcento(texto ?? '').toLowerCase().trim()
  if (!t) return null
  if (/(m2|m²|metro quadrado|\/m2|por m2)/.test(t)) return 'm2'
  if (/(milheiro|\bmil\b|cento|1000|1\.000)/.test(t)) return 'milheiro'
  if (/(metro linear|\bml\b|metro corrido|\bmetro\b|\bm\b|\/m\b)/.test(t)) return 'metro_linear'
  if (/(hora|\bh\b|\/h\b)/.test(t)) return 'hora'
  if (/(unidade|\bun\b|\bund\b|unid|peca|cada|\bpc\b)/.test(t)) return 'unidade'
  return null
}

/** Sigla da unidade de medida de cada modo (a do seed: un, m², m, mil, h) */
export const SIGLA_DO_MODO: Record<ModoCalculo, string> = { unidade: 'un', m2: 'm²', metro_linear: 'm', milheiro: 'mil', hora: 'h' }

const semAcento = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')

/** Palavras que não distinguem um produto do outro */
const PALAVRAS_VAZIAS = new Set(['de', 'da', 'do', 'das', 'dos', 'em', 'com', 'para', 'pra', 'a', 'o', 'e', 'p', 'c', 'na', 'no', 'impresso', 'impressao'])

/**
 * Chave para comparar nomes: sem acento, minúsculas, "440 g" = "440g", "4x4" = "4×4", sem pontuação e sem palavras
 * vazias, palavras em ordem alfabética ("Banner em lona 440 g" = "banner lona 440g").
 */
export function chaveDoNome(nome: string): string {
  return palavrasDoNome(nome).sort().join(' ')
}

function palavrasDoNome(nome: string): string[] {
  const t = semAcento(nome)
    .toLowerCase()
    .replace(/(\d)\s*[x×]\s*(\d)/g, '$1x$2')
    .replace(/(\d)\s+(g|gr|mm|cm|m|m2|ml|kg)\b/g, '$1$2')
    .replace(/[^a-z0-9²,.x ]+/g, ' ')
    .replace(/[,.](?!\d)/g, ' ')
  return [...new Set(t.split(/\s+/).filter((p) => p && !PALAVRAS_VAZIAS.has(p)))]
}

/**
 * Nomes do mesmo produto: a mesma chave, ou quase as mesmas palavras (no máximo uma diferente, sem número, nos dois
 * com 3 ou mais palavras). "Banner lona 440g" × "Banner em lona 440 g" = sim; "Banner lona 440g" × "Faixa lona 440g" = não.
 */
export function nomesParecidos(a: string, b: string): boolean {
  const pa = palavrasDoNome(a)
  const pb = palavrasDoNome(b)
  if (!pa.length || !pb.length) return false
  if (pa.slice().sort().join(' ') === pb.slice().sort().join(' ')) return true
  const comuns = pa.filter((p) => pb.includes(p)).length
  const maior = Math.max(pa.length, pb.length)
  // Medida, gramatura ou cores diferentes ("4x4" × "4x0", "300g" × "250g") são outro produto
  const diferentes = [...pa.filter((p) => !pb.includes(p)), ...pb.filter((p) => !pa.includes(p))]
  if (diferentes.some((p) => /\d/.test(p))) return false
  // A primeira palavra (o que é: banner, faixa, adesivo) precisa ser a mesma
  // Os dois com 3 palavras ou mais ("Adesivo vinil" × "Adesivo vinil fosco" não: o curto é genérico demais)
  return pa[0] === pb[0] && Math.min(pa.length, pb.length) >= 3 && maior - comuns <= 1
}

/** Produto do cadastro (ou de outra linha) com nome parecido, ou null */
export function acharDuplicado<T extends { nome: string }>(nome: string, existentes: readonly T[]): T | null {
  return existentes.find((e) => nomesParecidos(nome, e.nome)) ?? null
}

/** Acabamento do cadastro pelo nome ("ilhós" acha "Ilhós a cada 50 cm"; "laminação" acha "Laminação fosca") */
export function acabamentoPeloNome<T extends { nome: string }>(nome: string, existentes: readonly T[]): T | null {
  const alvo = palavrasDoNome(nome)
  if (!alvo.length) return null
  const exato = existentes.find((e) => chaveDoNome(e.nome) === alvo.slice().sort().join(' '))
  if (exato) return exato
  // Todas as palavras citadas estão no nome do cadastro (a primeira, no começo)
  const candidatos = existentes.filter((e) => {
    const pe = palavrasDoNome(e.nome)
    return pe[0] === alvo[0] && alvo.every((p) => pe.includes(p))
  })
  return candidatos.length === 1 ? candidatos[0]! : null
}

/** O que impede a linha de ser criada (null = pode criar) */
export function impedimentoDaLinha(l: Pick<LinhaCadastro, 'nome' | 'precoVenda'>): string | null {
  if (normalizarNomeProduto(l.nome).length < 2) return 'Falta o nome.'
  if (!l.precoVenda || !(Number(l.precoVenda) > 0)) return 'Falta o preço.'
  return null
}

// ─── Planilha (CSV) ───

/** Linhas e colunas de um CSV (separador ; , ou tab, aspas com "" dentro). Linhas vazias saem. */
export function linhasDoCsv(texto: string): string[][] {
  const limpo = texto.replace(/^﻿/, '').replace(/\r\n?/g, '\n')
  const primeira = limpo.split('\n').find((l) => l.trim()) ?? ''
  const sep = [';', '\t', ','].map((s) => ({ s, n: primeira.split(s).length })).sort((a, b) => b.n - a.n)[0]!.s
  const linhas: string[][] = []
  let linha: string[] = []
  let campo = ''
  let aspas = false
  for (let i = 0; i < limpo.length; i++) {
    const c = limpo[i]!
    if (aspas) {
      if (c === '"' && limpo[i + 1] === '"') {
        campo += '"'
        i++
      } else if (c === '"') aspas = false
      else campo += c
    } else if (c === '"') aspas = true
    else if (c === sep) {
      linha.push(campo.trim())
      campo = ''
    } else if (c === '\n') {
      linha.push(campo.trim())
      if (linha.some(Boolean)) linhas.push(linha)
      linha = []
      campo = ''
    } else campo += c
  }
  linha.push(campo.trim())
  if (linha.some(Boolean)) linhas.push(linha)
  return linhas
}

/** A planilha como texto para a leitura ("Banner lona | m² | 65,00"), até 200 linhas */
export function textoDaPlanilha(linhas: string[][]): string {
  return linhas
    .slice(0, 200)
    .map((l) => l.filter(Boolean).join(' | '))
    .filter(Boolean)
    .join('\n')
}

// ─── Criar ───

const nomeAcabamento = z.string().trim().min(2, 'Informe o nome do acabamento.').max(160)

/** Um produto do lote: os campos do cadastro + categoria nova, acabamentos (novos com preço) e materiais */
export const itemLoteSchema = produtoBase
  .extend({
    precoVenda: valorMonetario,
    categoriaNova: z.preprocess((v) => (typeof v === 'string' && !v.trim() ? null : v), z.string().trim().min(2).max(160).nullable().optional()),
    /** Sigla da unidade (sem unidadeMedidaId): a API acha */
    unidadeSigla: z.string().trim().max(10).nullable().optional(),
    acabamentos: z
      .array(
        z.object({
          id: z.string().uuid().nullable(),
          nome: nomeAcabamento,
          tipoCobranca: z.enum(TIPOS_COBRANCA),
          valor: valorMonetario.nullable().optional(),
          padrao: z.boolean().default(false),
        }),
      )
      .max(30)
      .default([]),
    materiais: z
      .array(
        z.object({
          insumoId: z.string().uuid(),
          quantidade: z
            .union([z.string(), z.number()])
            .transform(normalizarDecimal)
            .refine((v) => /^\d{1,8}(\.\d{1,4})?$/.test(v) && Number(v) > 0, 'Quantidade inválida.'),
          base: z.enum(BASES_INSUMO).default('por_unidade'),
          perdaPercentual: percentual.default('0'),
        }),
      )
      .max(50)
      .default([]),
    /** A pessoa viu o aviso de nome parecido e quer criar mesmo assim */
    permitirDuplicado: z.boolean().default(false),
  })
  .refine((p) => Number(p.precoVenda) > 0, { message: 'Falta o preço.', path: ['precoVenda'] })
  .refine((p) => !p.precoMinimo || Number(p.precoMinimo) <= Number(p.precoVenda), { message: 'O preço mínimo não pode ser maior que o preço de venda.', path: ['precoMinimo'] })
export type ItemLoteInput = z.input<typeof itemLoteSchema>

export const cadastroLoteSchema = z.object({
  itens: z.array(itemLoteSchema).min(1, 'Marque ao menos um produto.').max(MAX_PRODUTOS_LOTE, `Até ${MAX_PRODUTOS_LOTE} produtos por vez.`),
  /** Leitura do WhatsApp que originou a revisão (vira "criada") */
  leituraId: z.string().uuid().nullable().optional(),
})
export type CadastroLoteInput = z.input<typeof cadastroLoteSchema>

/** Linha da revisão → item do POST (acabamento novo sem preço fica de fora) */
export function itemDaLinha(l: LinhaCadastro, permitirDuplicado = false): ItemLoteInput {
  return {
    nome: normalizarNomeProduto(l.nome),
    tipo: l.tipo,
    categoriaId: l.categoriaId,
    categoriaNova: l.categoriaId ? null : l.categoriaNova,
    modoCalculo: l.modoCalculo,
    unidadeSigla: l.unidadeSigla ?? SIGLA_DO_MODO[l.modoCalculo],
    precoVenda: l.precoVenda ?? '0',
    larguraPadrao: l.larguraPadrao,
    alturaPadrao: l.alturaPadrao,
    larguraMaxima: l.larguraMaxima,
    alturaMaxima: l.alturaMaxima,
    prazoProducaoDias: l.prazoProducaoDias ?? 0,
    precisaArte: l.precisaArte,
    descricao: l.descricao,
    acabamentos: l.acabamentos.filter((a) => a.id || a.valor).map((a) => ({ id: a.id, nome: a.nome, tipoCobranca: a.tipoCobranca, valor: a.valor })),
    materiais: l.materiais.map((m) => ({ insumoId: m.insumoId, quantidade: m.quantidade, base: m.base })),
    permitirDuplicado,
  }
}

// ─── Leitura (texto ou arquivo) ───

export const lerTabelaSchema = z.object({
  texto: z.string().trim().min(3, 'Cole a tabela ou descreva os produtos.').max(12_000, 'Use até 12.000 caracteres (ou mande em partes).'),
  origem: z.enum(['texto', 'planilha']).default('texto'),
})
export type LerTabelaInput = z.input<typeof lerTabelaSchema>

/** Rótulo curto do modo para a tabela de revisão */
export const MODO_CURTO: Record<ModoCalculo, string> = { unidade: 'un', m2: 'm²', metro_linear: 'metro', milheiro: 'milheiro', hora: 'hora' }

export const modoValido = (m: string): m is ModoCalculo => (MODOS_CALCULO as readonly string[]).includes(m)
