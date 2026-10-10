import type { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { EXTENSOES_IMAGEM, type produtoAtualizacaoSchema, type produtoSchema, type produtosQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { proximoCodigo } from '../../core/numeracao'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import type { ArquivosService } from '../arquivos/service'
import { sincronizarCapa } from '../vitrine/galeria'
import type { CustosService } from './custos.service'

type Dados = z.output<typeof produtoSchema>
type DadosEdicao = z.output<typeof produtoAtualizacaoSchema>
type Query = z.output<typeof produtosQuerySchema>

const CONFLITOS = { codigo: 'Já existe um produto com este código.' }

export const incluirResumo = {
  categoria: { select: { id: true, nome: true } },
  unidadeMedida: { select: { id: true, sigla: true, nome: true } },
} as const

export const incluirDetalhe = {
  ...incluirResumo,
  acabamentos: { include: { acabamento: true }, orderBy: { createdAt: 'asc' } },
  insumos: {
    include: { insumo: { select: { id: true, codigo: true, nome: true, custo: true, unidadeMedida: { select: { id: true, sigla: true, nome: true } } } } },
    orderBy: { createdAt: 'asc' },
  },
  processos: {
    include: { processo: { select: { id: true, nome: true } }, maquina: { select: { id: true, nome: true } } },
    orderBy: { ordem: 'asc' },
  },
} satisfies Prisma.ProdutoInclude

/** Código automático (PRD-0001…) de produtos e insumos; pula números já usados manualmente. */
export async function gerarCodigoProduto(tx: Prisma.TransactionClient) {
  for (let tentativa = 0; tentativa < 20; tentativa++) {
    const candidato = await proximoCodigo(tx, 'produto')
    if (!(await tx.produto.findUnique({ where: { codigo: candidato }, select: { id: true } }))) return candidato
  }
  throw AppError.conflito('Não foi possível gerar o código do produto. Informe um código.')
}

export function criarProdutosService(app: FastifyInstance, arquivos: ArquivosService, custos: CustosService) {
  const { prisma } = app

  async function validarReferencias(dados: Pick<Dados, 'categoriaId' | 'unidadeMedidaId'>) {
    if (dados.categoriaId) {
      const c = await prisma.categoria.findUnique({ where: { id: dados.categoriaId } })
      if (!c?.ativo) throw AppError.regraNegocio('Categoria inválida ou desativada.')
    }
    if (dados.unidadeMedidaId && !(await prisma.unidadeMedida.findUnique({ where: { id: dados.unidadeMedidaId } }))) {
      throw AppError.regraNegocio('Unidade de medida inválida.')
    }
  }

  async function obterBase(id: string) {
    const p = await prisma.produto.findUnique({ where: { id } })
    if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
    return p
  }

  return {
    obterBase,

    async listar(q: Query) {
      const texto = q.busca ? { contains: q.busca, mode: 'insensitive' as const } : undefined
      const where: Prisma.ProdutoWhereInput = {
        ...filtroAtivo(q.ativo),
        // Insumos têm tela própria: só aparecem pedindo tipo=insumo
        tipo: q.tipo ?? { not: 'insumo' },
        ...(q.modoCalculo ? { modoCalculo: q.modoCalculo } : {}),
        ...(q.categoriaId ? { categoriaId: q.categoriaId } : {}),
        ...(texto ? { OR: [{ nome: texto }, { codigo: texto }, { descricao: texto }] } : {}),
      }
      const pag = paginacao(q, ['nome', 'codigo', 'precoVenda', 'createdAt'] as const, { campo: 'nome', direcao: 'asc' })
      const [total, data] = await prisma.$transaction([
        prisma.produto.count({ where }),
        prisma.produto.findMany({ where, ...pag, include: incluirResumo }),
      ])
      return paginado(data, total, q)
    },

    async obter(id: string) {
      const p = await prisma.produto.findUnique({ where: { id }, include: incluirDetalhe })
      if (!p) throw AppError.naoEncontrado('Produto não encontrado.')
      return p
    },

    async criar(dados: Dados, usuarioId: string) {
      await validarReferencias(dados)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const codigo = dados.codigo ?? (await gerarCodigoProduto(tx))
            const p = await tx.produto.create({ data: { ...dados, codigo, createdBy: usuarioId }, include: incluirResumo })
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: p.id, acao: 'criar', depois: p, usuarioId })
            return p
          }),
        CONFLITOS,
      )
    },

    /** Preço, custo, margem, preço mínimo e lucro só mudam quando enviados (ausente = mantém). */
    async atualizar(id: string, dados: DadosEdicao, usuarioId: string) {
      const antes = await obterBase(id)
      await validarReferencias(dados)
      const modoCusto = dados.modoCusto ?? antes.modoCusto
      // Na composição o custo é calculado: o digitado é ignorado
      const custo = modoCusto === 'composicao' ? undefined : dados.custo
      const precoVenda = dados.precoVenda ?? antes.precoVenda.toString()
      const precoMinimo = dados.precoMinimo !== undefined ? dados.precoMinimo : antes.precoMinimo?.toString()
      if (precoMinimo && Number(precoMinimo) > Number(precoVenda)) throw AppError.regraNegocio('O preço mínimo não pode ser maior que o preço de venda.')
      const p = await comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const p = await tx.produto.update({
              where: { id },
              data: { ...dados, custo, codigo: dados.codigo ?? antes.codigo },
              include: incluirResumo,
            })
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: id, acao: 'editar', antes, depois: p, usuarioId })
            return p
          }),
        CONFLITOS,
      )
      // Medidas/modo podem mudar o custo de referência; custo de insumo/revenda muda os produtos que o usam
      if (p.modoCusto === 'composicao') await custos.recalcularCustos([id])
      if (!antes.custo.eq(p.custo)) await custos.aposMudarCustoInsumo({ id, nome: p.nome, unidade: p.unidadeMedida?.sigla ?? null }, antes.custo.toString(), p.custo.toString())
      return p.modoCusto === 'composicao' ? { ...p, ...(await prisma.produto.findUniqueOrThrow({ where: { id }, select: { custo: true, custoCalculadoEm: true } })) } : p
    },

    async alterarAtivo(id: string, ativo: boolean, usuarioId: string) {
      const antes = await obterBase(id)
      return prisma.$transaction(async (tx) => {
        const p = await tx.produto.update({ where: { id }, data: { ativo }, include: incluirResumo })
        await registrarAuditoria(tx, { tabela: 'produtos', registroId: id, acao: ativo ? 'editar' : 'desativar', antes, depois: p, usuarioId })
        return p
      })
    },

    /** Imagem do produto (PNG, JPG ou SVG): troca a capa (primeira da galeria da vitrine); a anterior é apagada. */
    async trocarImagem(request: FastifyRequest, id: string, usuarioId: string) {
      const antes = await obterBase(id)
      const arquivo = await arquivos.receberUpload(
        request,
        { entidade: 'produto', entidadeId: id, categoria: 'imagem_produto', extensoes: EXTENSOES_IMAGEM },
        usuarioId,
      )
      await prisma.$transaction(async (tx) => {
        await tx.produtoImagem.create({ data: { produtoId: id, arquivoId: arquivo.id, ordem: -1 } })
        await tx.produto.update({ where: { id }, data: { imagemArquivoId: arquivo.id } })
      })
      // Apagar o arquivo leva junto a linha dele na galeria
      if (antes.imagemArquivoId) await arquivos.remover(antes.imagemArquivoId, usuarioId)
      await prisma.$transaction((tx) => sincronizarCapa(tx, id))
      return prisma.produto.findUniqueOrThrow({ where: { id }, include: incluirResumo })
    },
  }
}

export type ProdutosService = ReturnType<typeof criarProdutosService>
