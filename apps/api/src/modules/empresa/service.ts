import type { FastifyInstance, FastifyRequest } from 'fastify'
import { EXTENSOES_IMAGEM, type empresaSchema } from '@onprint/shared'
import type { z } from 'zod'
import { registrarAuditoria } from '../../core/auditoria'
import type { ArquivosService } from '../arquivos/service'

type Dados = z.output<typeof empresaSchema>

export function criarEmpresaService(app: FastifyInstance, arquivos: ArquivosService) {
  const { prisma } = app

  /** Linha única: cria com valores padrão se ainda não existir. */
  async function obter() {
    const existente = await prisma.empresaConfig.findFirst({ orderBy: { createdAt: 'asc' } })
    return existente ?? prisma.empresaConfig.create({ data: { razaoSocial: 'Minha Empresa' } })
  }

  return {
    obter,

    async atualizar(dados: Dados, usuarioId: string) {
      const antes = await obter()
      return prisma.$transaction(async (tx) => {
        const empresa = await tx.empresaConfig.update({ where: { id: antes.id }, data: dados })
        await registrarAuditoria(tx, { tabela: 'empresa_config', registroId: empresa.id, acao: 'editar', antes, depois: empresa, usuarioId })
        return empresa
      })
    },

    /** Recebe o novo logo (PNG, JPG ou SVG), vincula à empresa e remove o anterior. */
    async trocarLogo(request: FastifyRequest, usuarioId: string) {
      const antes = await obter()
      const arquivo = await arquivos.receberUpload(
        request,
        { entidade: 'empresa', entidadeId: antes.id, categoria: 'logo', extensoes: EXTENSOES_IMAGEM },
        usuarioId,
      )
      const empresa = await prisma.empresaConfig.update({ where: { id: antes.id }, data: { logoArquivoId: arquivo.id } })
      if (antes.logoArquivoId) await arquivos.remover(antes.logoArquivoId, usuarioId)
      return empresa
    },
  }
}
