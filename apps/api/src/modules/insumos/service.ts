import type { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { z } from 'zod'
import {
  Decimal,
  custoPorUnidadeDeUso,
  fatorEmbalagem,
  type InsumoDetalhe,
  type InsumoResumo,
  type TipoEmbalagem,
  type insumoSchema,
  type insumosQuerySchema,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import { consolidar } from '../estoque/consultas'
import { modoDoInsumo, situacaoDoProduto, usoDaUnidade } from '../produtos/custos'
import type { CustosService } from '../produtos/custos.service'
import { gerarCodigoProduto } from '../produtos/produtos.service'

type Dados = z.output<typeof insumoSchema>
type Query = z.output<typeof insumosQuerySchema>

const CONFLITOS = { codigo: 'Já existe um produto ou insumo com este código.' }

const incluir = {
  categoria: { select: { id: true, nome: true } },
  unidadeMedida: { select: { id: true, sigla: true, nome: true } },
  saldosEstoque: { select: { quantidade: true, custoMedio: true, local: { select: { id: true, nome: true } } } },
  _count: { select: { usadoComo: true } },
} satisfies Prisma.ProdutoInclude

type InsumoBanco = Prisma.ProdutoGetPayload<{ include: typeof incluir }>

/** Campos da embalagem que, mudando, recalculam o custo por unidade de uso. */
const CAMPOS_EMBALAGEM = ['embalagem', 'embalagemLargura', 'embalagemComprimento', 'embalagemConteudo', 'precoEmbalagem', 'unidadeMedidaId'] as const

/**
 * Insumos e materiais (Produtos → Insumos): produtos do tipo "insumo" com tela própria. O custo por unidade
 * de uso nasce da embalagem (preço ÷ fator) e depois acompanha o custo médio das compras.
 */
export function criarInsumosService(app: FastifyInstance, custos: CustosService) {
  const { prisma } = app

  function resumo(i: InsumoBanco, veCusto: boolean): InsumoResumo {
    const c = consolidar(i.saldosEstoque, i.estoqueMinimo)
    return {
      id: i.id,
      codigo: i.codigo,
      nome: i.nome,
      categoria: i.categoria,
      unidadeMedida: i.unidadeMedida,
      embalagem: (i.embalagem ?? 'unidade') as TipoEmbalagem,
      ...(veCusto ? { custo: i.custo.toFixed(4), precoEmbalagem: i.precoEmbalagem?.toFixed(2) ?? null } : {}),
      controlaEstoque: i.controlaEstoque,
      estoqueMinimo: i.estoqueMinimo.toFixed(3),
      saldo: i.controlaEstoque ? c.saldo : null,
      // Sem estoque mínimo definido (0), não há alerta de "abaixo do mínimo"
      abaixoMinimo: i.controlaEstoque && new Decimal(i.estoqueMinimo.toString()).gt(0) && new Decimal(c.saldo).lte(i.estoqueMinimo.toString()),
      usadoEm: i._count.usadoComo,
      ativo: i.ativo,
    }
  }

  async function validar(d: Dados) {
    if (d.categoriaId) {
      const c = await prisma.categoria.findUnique({ where: { id: d.categoriaId } })
      if (!c?.ativo) throw AppError.regraNegocio('Categoria inválida ou desativada.')
    }
    const unidade = await prisma.unidadeMedida.findUnique({ where: { id: d.unidadeMedidaId } })
    if (!unidade) throw AppError.regraNegocio('Unidade de uso inválida.')
    if (d.fornecedorPreferidoId && !(await prisma.fornecedor.findUnique({ where: { id: d.fornecedorPreferidoId }, select: { id: true } }))) {
      throw AppError.regraNegocio('Fornecedor não encontrado.')
    }
    return unidade
  }

  /** Custo por unidade de uso pela embalagem (null = não dá para calcular). */
  function custoDaEmbalagem(d: Dados, sigla: string) {
    if (!d.precoEmbalagem) return null
    const fator = fatorEmbalagem({ embalagem: d.embalagem, largura: d.embalagemLargura, comprimento: d.embalagemComprimento, conteudo: d.embalagemConteudo }, usoDaUnidade(sigla))
    return custoPorUnidadeDeUso(d.precoEmbalagem, fator)
  }

  const dadosBanco = (d: Dados, sigla: string) => {
    // Rolo/chapa usam medidas; pacote/caixa/galão usam conteúdo
    const medidas = d.embalagem === 'rolo' || d.embalagem === 'chapa'
    return {
      ...d,
      embalagemLargura: medidas ? (d.embalagemLargura ?? null) : null,
      embalagemComprimento: medidas ? (d.embalagemComprimento ?? null) : null,
      embalagemConteudo: !medidas && d.embalagem !== 'unidade' ? (d.embalagemConteudo ?? null) : null,
      precoEmbalagem: d.precoEmbalagem ?? null,
      fornecedorPreferidoId: d.fornecedorPreferidoId ?? null,
      tipo: 'insumo' as const,
      modoCalculo: modoDoInsumo(sigla),
    }
  }

  async function base(id: string) {
    const i = await prisma.produto.findUnique({ where: { id }, include: incluir })
    if (!i || i.tipo !== 'insumo') throw AppError.naoEncontrado('Insumo não encontrado.')
    return i
  }

  async function obter(id: string, veCusto: boolean): Promise<InsumoDetalhe> {
    const i = await base(id)
    const extra = await prisma.produto.findUniqueOrThrow({
      where: { id },
      select: {
        fornecedorPreferido: { select: { id: true, nome: true } },
        usadoComo: {
          select: { quantidade: true, base: true, produto: { select: { id: true, codigo: true, nome: true, precoVenda: true, custo: true, lucroMinimo: true } } },
          orderBy: { produto: { nome: 'asc' } },
        },
      },
    })
    const par = veCusto ? await custos.parametros() : null
    return {
      ...resumo(i, veCusto),
      descricao: i.descricao,
      categoriaId: i.categoriaId,
      unidadeMedidaId: i.unidadeMedidaId,
      embalagemLargura: i.embalagemLargura?.toString() ?? null,
      embalagemComprimento: i.embalagemComprimento?.toString() ?? null,
      embalagemConteudo: i.embalagemConteudo?.toString() ?? null,
      fornecedorPreferidoId: i.fornecedorPreferidoId,
      fornecedorPreferido: extra.fornecedorPreferido,
      ...(veCusto ? { custoMedio: i.saldosEstoque.length ? consolidar(i.saldosEstoque, i.estoqueMinimo).custoMedio : null } : {}),
      produtos: extra.usadoComo.map((u) => ({
        id: u.produto.id,
        codigo: u.produto.codigo,
        nome: u.produto.nome,
        quantidade: u.quantidade.toString(),
        base: u.base,
        ...(par ? { situacao: situacaoDoProduto(u.produto, par).situacao } : {}),
      })),
    }
  }

  return {
    obter,

    async listar(q: Query, veCusto: boolean) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.ProdutoWhereInput = {
        tipo: 'insumo',
        ...filtroAtivo(q.ativo),
        ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}),
        ...(texto ? { OR: [{ nome: texto }, { codigo: texto }, { descricao: texto }] } : {}),
      }
      const ordenaveis = veCusto ? (['nome', 'codigo', 'custo', 'createdAt'] as const) : (['nome', 'codigo', 'createdAt'] as const)
      const pag = paginacao(q, ordenaveis, { campo: 'nome', direcao: 'asc' })
      if (q.abaixoMinimo === 'true') {
        // Saldo é somado dos locais: filtra em memória (poucos insumos por empresa)
        const todos = (await prisma.produto.findMany({ where: { ...where, controlaEstoque: true }, orderBy: pag.orderBy, include: incluir })).map((i) => resumo(i, veCusto)).filter((i) => i.abaixoMinimo)
        return paginado(todos.slice(pag.skip, pag.skip + pag.take), todos.length, q)
      }
      const [total, data] = await prisma.$transaction([prisma.produto.count({ where }), prisma.produto.findMany({ where, ...pag, include: incluir })])
      return paginado(
        data.map((i) => resumo(i, veCusto)),
        total,
        q,
      )
    },

    async criar(d: Dados, usuarioId: string, veCusto: boolean) {
      const unidade = await validar(d)
      const custo = custoDaEmbalagem(d, unidade.sigla) ?? '0'
      const id = await comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const codigo = d.codigo ?? (await gerarCodigoProduto(tx))
            const i = await tx.produto.create({ data: { ...dadosBanco(d, unidade.sigla), codigo, custo, createdBy: usuarioId } })
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: i.id, acao: 'criar', depois: i, usuarioId })
            return i.id
          }),
        CONFLITOS,
      )
      return obter(id, veCusto)
    },

    async atualizar(id: string, d: Dados, usuarioId: string, veCusto: boolean) {
      const antes = await base(id)
      const unidade = await validar(d)
      const novos = dadosBanco(d, unidade.sigla)
      const valor = (v: unknown) => (v === null || v === undefined ? '' : String(v))
      const mudouEmbalagem = CAMPOS_EMBALAGEM.some((c) => normalizar(valor(antes[c])) !== normalizar(valor(novos[c])))
      const custoNovo = mudouEmbalagem ? custoDaEmbalagem(d, unidade.sigla) : null
      await comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const depois = await tx.produto.update({ where: { id }, data: { ...novos, codigo: d.codigo ?? antes.codigo, ...(custoNovo ? { custo: custoNovo } : {}) } })
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: id, acao: 'editar', antes: { ...antes, saldosEstoque: undefined, _count: undefined }, depois, usuarioId })
          }),
        CONFLITOS,
      )
      if (custoNovo && !antes.custo.eq(custoNovo)) await custos.aposMudarCustoInsumo({ id, nome: d.nome, unidade: unidade.sigla }, antes.custo.toString(), custoNovo)
      return obter(id, veCusto)
    },
  }
}

/** "3.200" e "3.2" são a mesma medida. */
function normalizar(v: string) {
  if (v === '' || Number.isNaN(Number(v))) return v
  return new Decimal(v).toString()
}

export type InsumosService = ReturnType<typeof criarInsumosService>
