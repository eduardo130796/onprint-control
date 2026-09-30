import type { Prisma } from '@prisma/client'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import { EXTENSOES_IMAGEM, type produtoSchema, type produtosQuerySchema } from '@onprint/shared'
import type { z } from 'zod'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { proximoCodigo } from '../../core/numeracao'
import { filtroAtivo, paginacao, paginado } from '../../core/paginacao'
import { comConflitoAmigavel } from '../../core/prisma-erros'
import type { ArquivosService } from '../arquivos/service'

type Dados = z.output<typeof produtoSchema>
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

export function criarProdutosService(app: FastifyInstance, arquivos: ArquivosService) {
  const { prisma } = app

  async function validarReferencias(dados: Dados) {
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
        ...(q.tipo ? { tipo: q.tipo } : {}),
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
            let codigo = dados.codigo
            // Código automático (PRD-0001…); pula números já usados manualmente
            for (let tentativa = 0; !codigo && tentativa < 20; tentativa++) {
              const candidato = await proximoCodigo(tx, 'produto')
              if (!(await tx.produto.findUnique({ where: { codigo: candidato }, select: { id: true } }))) codigo = candidato
            }
            if (!codigo) throw AppError.conflito('Não foi possível gerar o código do produto. Informe um código.')
            const p = await tx.produto.create({ data: { ...dados, codigo, createdBy: usuarioId }, include: incluirResumo })
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: p.id, acao: 'criar', depois: p, usuarioId })
            return p
          }),
        CONFLITOS,
      )
    },

    async atualizar(id: string, dados: Dados, usuarioId: string) {
      const antes = await obterBase(id)
      await validarReferencias(dados)
      return comConflitoAmigavel(
        () =>
          prisma.$transaction(async (tx) => {
            const p = await tx.produto.update({
              where: { id },
              data: { ...dados, codigo: dados.codigo ?? antes.codigo },
              include: incluirResumo,
            })
            await registrarAuditoria(tx, { tabela: 'produtos', registroId: id, acao: 'editar', antes, depois: p, usuarioId })
            return p
          }),
        CONFLITOS,
      )
    },

    async alterarAtivo(id: string, ativo: boolean, usuarioId: string) {
      const antes = await obterBase(id)
      return prisma.$transaction(async (tx) => {
        const p = await tx.produto.update({ where: { id }, data: { ativo }, include: incluirResumo })
        await registrarAuditoria(tx, { tabela: 'produtos', registroId: id, acao: ativo ? 'editar' : 'desativar', antes, depois: p, usuarioId })
        return p
      })
    },

    /** Imagem do produto (PNG, JPG ou SVG); a anterior é apagada. */
    async trocarImagem(request: FastifyRequest, id: string, usuarioId: string) {
      const antes = await obterBase(id)
      const arquivo = await arquivos.receberUpload(
        request,
        { entidade: 'produto', entidadeId: id, categoria: 'imagem_produto', extensoes: EXTENSOES_IMAGEM },
        usuarioId,
      )
      const p = await prisma.produto.update({ where: { id }, data: { imagemArquivoId: arquivo.id }, include: incluirResumo })
      if (antes.imagemArquivoId) await arquivos.remover(antes.imagemArquivoId, usuarioId)
      return p
    },
  }
}

export type ProdutosService = ReturnType<typeof criarProdutosService>
