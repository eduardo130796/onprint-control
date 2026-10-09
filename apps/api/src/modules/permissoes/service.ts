import type { FastifyInstance } from 'fastify'
import { ACOES, MODULOS, type MatrizPermissoes } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'

export function criarPermissoesService(app: FastifyInstance) {
  const { prisma } = app

  return {
    async matriz(): Promise<MatrizPermissoes> {
      const papeis = await prisma.papel.findMany({
        where: { ativo: true },
        orderBy: { createdAt: 'asc' },
        include: {
          permissoes: { include: { permissao: true } },
          _count: { select: { usuarios: { where: { ativo: true } } } },
        },
      })
      return {
        papeis: papeis.map((p) => ({ id: p.id, codigo: p.codigo, nome: p.nome, usuarios: p._count.usuarios })),
        modulos: [...MODULOS],
        acoes: [...ACOES],
        concedidas: Object.fromEntries(
          papeis.map((p) => [p.id, p.permissoes.map((pp) => `${pp.permissao.modulo}:${pp.permissao.acao}`).sort()]),
        ),
      }
    },

    /** Substitui todas as permissões do papel. O papel admin é fixo (sempre com tudo). */
    async atualizarPapel(papelId: string, chaves: string[], usuarioId: string) {
      const papel = await prisma.papel.findUnique({
        where: { id: papelId },
        include: { permissoes: { include: { permissao: true } } },
      })
      if (!papel) throw AppError.naoEncontrado('Papel não encontrado.')
      if (papel.codigo === 'admin') throw AppError.regraNegocio('As permissões do administrador não podem ser alteradas.')

      // Contra escalada de privilégio: ninguém mexe no próprio papel, e quem não é administrador
      // só concede permissões que ele mesmo tem (papel lido do banco, não do token)
      const autor = await prisma.usuario.findUnique({ where: { id: usuarioId }, select: { papel: { select: { id: true, codigo: true } } } })
      if (!autor) throw AppError.semPermissao()
      if (autor.papel.id === papelId) throw AppError.semPermissao('Você não pode alterar as permissões do seu próprio papel.')

      const catalogo = await prisma.permissao.findMany()
      const porChave = new Map(catalogo.map((p) => [`${p.modulo}:${p.acao}`, p.id]))
      const desconhecidas = chaves.filter((c) => !porChave.has(c))
      if (desconhecidas.length) throw AppError.regraNegocio('Permissões inválidas.', { desconhecidas })

      const unicas = [...new Set(chaves)]
      const antes = papel.permissoes.map((pp) => `${pp.permissao.modulo}:${pp.permissao.acao}`).sort()
      if (autor.papel.codigo !== 'admin') {
        const minhas = await app.permissoesDoPapel(autor.papel.id)
        const novas = unicas.filter((c) => !antes.includes(c) && !minhas.has(c))
        if (novas.length) throw AppError.semPermissao('Você só pode conceder permissões que você mesmo tem.')
      }
      await prisma.$transaction(async (tx) => {
        await tx.papelPermissao.deleteMany({ where: { papelId } })
        await tx.papelPermissao.createMany({
          data: unicas.map((c) => ({ papelId, permissaoId: porChave.get(c) as string, createdBy: usuarioId })),
        })
        await registrarAuditoria(tx, {
          tabela: 'papel_permissoes',
          registroId: papelId,
          acao: 'permissoes',
          antes,
          depois: unicas.sort(),
          usuarioId,
        })
      })
      app.invalidarPermissoes()
      return { papelId, permissoes: unicas }
    },
  }
}
