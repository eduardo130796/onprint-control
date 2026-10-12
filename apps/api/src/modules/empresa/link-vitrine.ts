import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import { normalizarSlugEmpresa, slugEmpresaSchema, type DisponibilidadeLinkVitrine, type LinkVitrine } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { slugLivre } from '../../plataforma/provisionar'
import { urlPublicaVitrine } from '../vitrine/regras'

/**
 * Endereço da vitrine ({slug}.grafygo.com.br) escolhido pela empresa. O slug também está nos links de aprovação
 * (/aprovar/{slug}/{token}); por isso os nomes anteriores ficam guardados e continuam levando à empresa.
 */

/** Uma troca por dia (desfazer a última troca vale a qualquer hora) */
export const INTERVALO_TROCA_SLUG_MS = 24 * 3_600_000
/** Quantos nomes anteriores continuam valendo (passando disso, o mais antigo fica livre para outras empresas) */
export const MAX_SLUGS_ANTERIORES = 10
const JA_USADO = 'Este nome já é usado por outra empresa. Tente outro.'

/** Lista de nomes anteriores depois de trocar `atual` por `novo` (sem repetir e sem o novo) */
export function anterioresDepoisDaTroca(atual: string, anteriores: string[], novo: string): string[] {
  return [...anteriores.filter((s) => s !== novo && s !== atual), atual].slice(-MAX_SLUGS_ANTERIORES)
}

/** Quando a próxima troca fica liberada (null = já pode); voltar ao nome imediatamente anterior não espera */
export function trocaLiberadaEm(alteradoEm: Date | null, agora: Date, desfazendo = false): Date | null {
  if (!alteradoEm || desfazendo) return null
  const liberada = new Date(alteradoEm.getTime() + INTERVALO_TROCA_SLUG_MS)
  return liberada > agora ? liberada : null
}

export function criarLinkVitrine(app: FastifyInstance) {
  const url = (slug: string) => urlPublicaVitrine(slug, app.config)

  async function lerAssinante() {
    const { id } = contextoEmpresa.exigir()
    return app.plataforma.assinante.findUniqueOrThrow({ where: { id }, select: { id: true, slug: true, slugsAnteriores: true, slugAlteradoEm: true } })
  }

  function montar(a: { slug: string; slugsAnteriores: string[]; slugAlteradoEm: Date | null }): LinkVitrine {
    const endereco = url(a.slug)
    // O nome vem logo depois do protocolo: https://{slug}.grafygo.com.br
    const inicio = endereco.indexOf('//') + 2
    const prefixo = endereco.slice(0, inicio)
    const sufixo = endereco.slice(inicio + a.slug.length)
    return { slug: a.slug, url: endereco, prefixo, sufixo, anteriores: a.slugsAnteriores, trocaLiberadaEm: trocaLiberadaEm(a.slugAlteradoEm, new Date())?.toISOString() ?? null }
  }

  return {
    obter: async () => montar(await lerAssinante()),

    /** Formato, palavra reservada e uso por outra empresa (os nomes anteriores da própria empresa podem voltar) */
    async disponivel(texto: string): Promise<DisponibilidadeLinkVitrine> {
      const empresa = contextoEmpresa.exigir()
      const r = slugEmpresaSchema.safeParse(texto)
      const slug = r.success ? r.data : normalizarSlugEmpresa(texto)
      const resposta = (disponivel: boolean, motivo: string | null) => ({ slug, disponivel, motivo, url: url(slug || 'sua-grafica') })
      if (!r.success) return resposta(false, r.error.issues[0]?.message ?? 'Nome inválido.')
      if (slug === empresa.slug) return resposta(false, 'Este já é o endereço da sua vitrine.')
      if (!(await slugLivre(app.plataforma, slug, empresa.id))) return resposta(false, JA_USADO)
      return resposta(true, null)
    },

    /** Troca o slug: o anterior continua valendo nos links já enviados, na vitrine e no CNAME do domínio próprio */
    async alterar(slug: string, usuarioId: string): Promise<LinkVitrine> {
      const antes = await lerAssinante()
      if (slug === antes.slug) return montar(antes)
      const liberada = trocaLiberadaEm(antes.slugAlteradoEm, new Date(), antes.slugsAnteriores.at(-1) === slug)
      if (liberada) {
        const horas = Math.max(1, Math.ceil((liberada.getTime() - Date.now()) / 3_600_000))
        throw AppError.regraNegocio(`O endereço pode ser trocado uma vez por dia. Tente de novo em ${horas} ${horas === 1 ? 'hora' : 'horas'}.`)
      }
      if (!(await slugLivre(app.plataforma, slug, antes.id))) throw AppError.conflito(JA_USADO, { campo: 'slug' })
      let depois
      try {
        depois = await app.plataforma.assinante.update({
          where: { id: antes.id },
          data: { slug, slugsAnteriores: anterioresDepoisDaTroca(antes.slug, antes.slugsAnteriores, slug), slugAlteradoEm: new Date() },
          select: { id: true, slug: true, slugsAnteriores: true, slugAlteradoEm: true },
        })
      } catch (erro) {
        // Outra empresa pegou o mesmo nome no mesmo instante
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') throw AppError.conflito(JA_USADO, { campo: 'slug' })
        throw erro
      }
      app.empresas.esquecer()
      await app.prisma.$transaction((tx) =>
        registrarAuditoria(tx, { tabela: 'assinantes', registroId: antes.id, acao: 'editar', antes: { slug: antes.slug }, depois: { slug, slugsAnteriores: depois.slugsAnteriores }, usuarioId }),
      )
      return montar(depois)
    },
  }
}
