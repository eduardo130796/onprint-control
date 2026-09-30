import { extname } from 'node:path'
import type { FastifyInstance, FastifyRequest } from 'fastify'
import {
  CATEGORIAS_ARQUIVO,
  ENTIDADES_ARQUIVO,
  EXTENSOES_PERMITIDAS,
  type Arquivo,
  type CategoriaArquivo,
  type EntidadeArquivo,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

const MIMES: Record<string, string> = {
  pdf: 'application/pdf',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  tif: 'image/tiff',
  tiff: 'image/tiff',
  zip: 'application/zip',
  psd: 'image/vnd.adobe.photoshop',
  ai: 'application/postscript',
  eps: 'application/postscript',
  cdr: 'application/x-coreldraw',
}

/** Tipos exibidos no navegador; o resto é sempre baixado. */
const INLINE = new Set(['application/pdf', 'image/png', 'image/jpeg'])

interface OpcoesUpload {
  entidade: EntidadeArquivo
  entidadeId: string | null
  categoria: CategoriaArquivo
  extensoes?: readonly string[]
}

const selecionar = {
  id: true,
  entidade: true,
  entidadeId: true,
  categoria: true,
  nomeOriginal: true,
  mime: true,
  tamanho: true,
  createdAt: true,
  enviadoPor: { select: { id: true, nome: true } },
} as const

export function criarArquivosService(app: FastifyInstance) {
  const { prisma, storage } = app

  async function entidadeExiste(entidade: EntidadeArquivo, id: string | null) {
    if (entidade === 'empresa') return true
    if (!id) return false
    if (entidade === 'cliente') return Boolean(await prisma.cliente.findUnique({ where: { id }, select: { id: true } }))
    if (entidade === 'produto') return Boolean(await prisma.produto.findUnique({ where: { id }, select: { id: true } }))
    if (entidade === 'pedido') return Boolean(await prisma.pedido.findUnique({ where: { id }, select: { id: true } }))
    if (entidade === 'arte') return Boolean(await prisma.arte.findUnique({ where: { id }, select: { id: true } }))
    if (entidade === 'entrega') return Boolean(await prisma.entrega.findUnique({ where: { id }, select: { id: true } }))
    if (entidade === 'conta_receber') return Boolean(await prisma.contaReceber.findUnique({ where: { id }, select: { id: true } }))
    if (entidade === 'conta_pagar') return Boolean(await prisma.contaPagar.findUnique({ where: { id }, select: { id: true } }))
    return Boolean(await prisma.fornecedor.findUnique({ where: { id }, select: { id: true } }))
  }

  return {
    moduloDaEntidade(entidade: string) {
      const modulo = ENTIDADES_ARQUIVO[entidade as EntidadeArquivo]
      if (!modulo) throw AppError.regraNegocio('Entidade de arquivo inválida.')
      return modulo
    },

    /** Lê o arquivo do multipart, valida tipo/tamanho e grava no storage. */
    async receberUpload(request: FastifyRequest, opcoes: OpcoesUpload, usuarioId: string): Promise<Arquivo> {
      const parte = await request.file()
      if (!parte) throw AppError.regraNegocio('Nenhum arquivo enviado.')

      const extensao = extname(parte.filename).slice(1).toLowerCase()
      const permitidas = opcoes.extensoes ?? EXTENSOES_PERMITIDAS
      if (!permitidas.includes(extensao)) {
        parte.file.resume()
        throw AppError.regraNegocio(`Tipo de arquivo não permitido. Aceitos: ${permitidas.join(', ').toUpperCase()}.`)
      }
      if (!(await entidadeExiste(opcoes.entidade, opcoes.entidadeId))) {
        parte.file.resume()
        throw AppError.naoEncontrado('Registro do arquivo não encontrado.')
      }

      const salvo = await storage.salvar(parte.file, { categoria: opcoes.categoria, nomeOriginal: parte.filename })
      if (parte.file.truncated) {
        await storage.remover(salvo.caminho)
        throw new AppError(413, 'VALIDACAO', `Arquivo maior que o limite de ${app.config.UPLOAD_MAX_MB} MB.`)
      }

      return prisma.$transaction(async (tx) => {
        const arquivo = await tx.arquivo.create({
          data: {
            entidade: opcoes.entidade,
            entidadeId: opcoes.entidadeId,
            categoria: opcoes.categoria,
            nomeOriginal: parte.filename.slice(0, 255),
            caminho: salvo.caminho,
            mime: MIMES[extensao] ?? 'application/octet-stream',
            tamanho: salvo.tamanho,
            enviadoPorId: usuarioId,
          },
          select: selecionar,
        })
        await registrarAuditoria(tx, { tabela: 'arquivos', registroId: arquivo.id, acao: 'criar', depois: arquivo, usuarioId })
        return arquivo as unknown as Arquivo
      })
    },

    async listar(entidade: string, entidadeId: string) {
      return prisma.arquivo.findMany({
        where: { entidade, entidadeId, categoria: { not: 'logo' } },
        orderBy: { createdAt: 'desc' },
        select: selecionar,
      })
    },

    async obter(id: string) {
      const arquivo = await prisma.arquivo.findUnique({ where: { id } })
      if (!arquivo) throw AppError.naoEncontrado('Arquivo não encontrado.')
      return arquivo
    },

    abrir(arquivo: { caminho: string; mime: string; nomeOriginal: string }) {
      return {
        stream: storage.abrir(arquivo.caminho),
        disposicao: `${INLINE.has(arquivo.mime) ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(arquivo.nomeOriginal)}`,
      }
    },

    async remover(id: string, usuarioId: string) {
      const arquivo = await this.obter(id)
      await prisma.$transaction(async (tx) => {
        await tx.empresaConfig.updateMany({ where: { logoArquivoId: id }, data: { logoArquivoId: null } })
        await tx.arquivo.delete({ where: { id } })
        await registrarAuditoria(tx, { tabela: 'arquivos', registroId: id, acao: 'excluir', antes: arquivo, usuarioId })
      })
      await storage.remover(arquivo.caminho)
    },

    categoriaValida(categoria: string): categoria is CategoriaArquivo {
      return (CATEGORIAS_ARQUIVO as readonly string[]).includes(categoria)
    },
  }
}

export type ArquivosService = ReturnType<typeof criarArquivosService>
