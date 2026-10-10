import { resolve4 } from 'node:dns/promises'
import { Prisma } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import type { DominioVitrine, VerificacaoDominio } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { registrarAuditoria } from '../../core/auditoria'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { dominioVitrine, dominioReservado, hostDoSubdominio } from './regras'

/**
 * Domínio próprio da vitrine (docs/VITRINE.md, seção 1.1): a gráfica aponta www.suagrafica.com.br para o
 * subdomínio dela na GrafyGo (CNAME) e o site passa a abrir também por lá. O índice domínio → empresa fica no
 * banco da plataforma (assinantes.dominio_vitrine), como o slug.
 */

/** IP do servidor (para quem usa o domínio sem "www": registro A) — consultado no DNS e guardado por 10 minutos */
const ipsGuardados = new Map<string, { ip: string | null; expira: number }>()
async function ipDoServidor(host: string): Promise<string | null> {
  const guardado = ipsGuardados.get(host)
  if (guardado && guardado.expira > Date.now()) return guardado.ip
  const ip = await Promise.race([resolve4(host).then((ips) => ips[0] ?? null), new Promise<null>((ok) => setTimeout(() => ok(null), 3000).unref())]).catch(() => null)
  ipsGuardados.set(host, { ip, expira: Date.now() + 10 * 60_000 })
  return ip
}

export function criarDominioVitrine(app: FastifyInstance) {
  async function lerAssinante() {
    const { id } = contextoEmpresa.exigir()
    return app.plataforma.assinante.findUnique({ where: { id }, select: { dominioVitrine: true, dominioVitrineVerificadoEm: true } })
  }

  async function info(): Promise<DominioVitrine> {
    const a = await lerAssinante()
    const subdominio = hostDoSubdominio(contextoEmpresa.exigir().slug, app.config)
    return {
      endereco: a?.dominioVitrine ?? null,
      verificadoEm: a?.dominioVitrineVerificadoEm?.toISOString() ?? null,
      subdominio,
      // Em desenvolvimento ({slug}.localhost) não há DNS para consultar
      ip: a?.dominioVitrine && dominioVitrine(app.config) !== 'localhost' ? await ipDoServidor(subdominio) : null,
    }
  }

  return {
    info,

    /** Grava (ou tira, com null) o domínio próprio; trocar de domínio volta a pedir a verificação */
    async salvar(dominio: string | null, usuarioId: string): Promise<DominioVitrine> {
      const empresa = contextoEmpresa.exigir()
      const antes = await lerAssinante()
      if (dominio && dominioReservado(dominio, app.config)) {
        throw AppError.regraNegocio('Este endereço já é da GrafyGo. Use o domínio que você registrou para a sua gráfica (ex.: www.suagrafica.com.br).')
      }
      if (dominio === (antes?.dominioVitrine ?? null)) return info()
      try {
        await app.plataforma.assinante.update({ where: { id: empresa.id }, data: { dominioVitrine: dominio, dominioVitrineVerificadoEm: null } })
      } catch (erro) {
        if (erro instanceof Prisma.PrismaClientKnownRequestError && erro.code === 'P2002') {
          throw AppError.conflito('Este domínio já está ligado a outra vitrine. Se ele é seu, fale com o suporte da GrafyGo.')
        }
        throw erro
      }
      app.empresas.esquecer()
      await app.prisma.$transaction((tx) =>
        registrarAuditoria(tx, { tabela: 'vitrine_config', registroId: empresa.id, acao: 'editar', antes: { dominio: antes?.dominioVitrine ?? null }, depois: { dominio }, usuarioId }),
      )
      return info()
    },

    /**
     * Abre https://{domínio} e confere se é esta vitrine que responde (o DNS aponta para cá e o certificado saiu).
     * Verificado, os links que o sistema gera (compartilhar, catálogo, QR code) passam a usar o domínio próprio.
     */
    async verificar(): Promise<Omit<VerificacaoDominio, 'config'>> {
      const empresa = contextoEmpresa.exigir()
      const a = await lerAssinante()
      const dominio = a?.dominioVitrine
      if (!dominio) throw AppError.regraNegocio('Cadastre o domínio antes de verificar.')
      let slug: string | null = null
      try {
        const resposta = await fetch(`https://${dominio}/api/v1/publico/vitrine-dominio?host=${encodeURIComponent(dominio)}`, {
          signal: AbortSignal.timeout(10_000),
          redirect: 'error',
        })
        if (resposta.ok) slug = ((await resposta.json()) as { slug?: string }).slug ?? null
      } catch {
        slug = null
      }
      if (slug !== empresa.slug) {
        return {
          verificado: false,
          mensagem: `Ainda não encontramos a sua vitrine em ${dominio}. Confira o apontamento no DNS: a mudança costuma valer em minutos, mas pode levar algumas horas.`,
        }
      }
      if (!a?.dominioVitrineVerificadoEm) await marcarVerificado(app, empresa.id)
      return { verificado: true, mensagem: `Tudo certo! A vitrine já abre em ${dominio}.` }
    },
  }
}

/** Domínio respondendo por esta vitrine: passa a valer nos links (chamado também quando o Caddy emite o certificado) */
export async function marcarVerificado(app: FastifyInstance, assinanteId: string) {
  await app.plataforma.assinante.updateMany({ where: { id: assinanteId, dominioVitrine: { not: null }, dominioVitrineVerificadoEm: null }, data: { dominioVitrineVerificadoEm: new Date() } })
  app.empresas.esquecer()
}
