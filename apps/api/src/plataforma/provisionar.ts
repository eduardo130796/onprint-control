import { randomBytes } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'
import { semearEmpresa, type AdminInicial } from '../../prisma/seed/empresa'
import { AppError } from '../core/AppError'
import { criarAssinatura, planoPorCodigo, semearPlanos } from './assinaturas'
import { criarIndiceLogin } from './indice-login'
import { migrarSchema } from './migracoes'

export interface DadosNovaEmpresa {
  nome: string
  /** Vazio = gerado a partir do nome */
  slug?: string
  email?: string
  cnpj?: string
  admin: AdminInicial
  exemplos?: boolean
  /** Código do plano (padrão: profissional) */
  plano?: string
  /** Começa em teste grátis (padrão) ou já ativa */
  situacao?: 'teste' | 'ativa'
}

export interface DependenciasProvisionamento {
  plataforma: PrismaClient
  databaseUrl: string
  /** Cliente Prisma do schema (a API reaproveita o pool; os scripts criam um e fecham depois) */
  clienteDe: (schema: string) => PrismaClient
}

/** "Gráfica São João Ltda." → "grafica-sao-joao-ltda" */
export function gerarSlug(nome: string): string {
  const slug = nome
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
  return slug || 'empresa'
}

async function slugDisponivel(plataforma: PrismaClient, desejado: string): Promise<string> {
  for (let n = 1; n < 100; n++) {
    const slug = n === 1 ? desejado : `${desejado}-${n}`
    if (!(await plataforma.assinante.findUnique({ where: { slug } }))) return slug
  }
  throw AppError.conflito('Não foi possível gerar um identificador para a empresa. Informe outro.')
}

/**
 * Cria uma empresa assinante: registro na plataforma, schema próprio com as migrations,
 * dados padrão, administrador e índice de login. Se algo falhar, desfaz tudo (inclusive o schema).
 */
export async function provisionarEmpresa(deps: DependenciasProvisionamento, dados: DadosNovaEmpresa) {
  const { plataforma } = deps
  const email = dados.admin.email.trim().toLowerCase()
  if (await plataforma.indiceLogin.findUnique({ where: { email } })) {
    throw AppError.conflito('Este e-mail já é usado por outro usuário. Cada e-mail entra em uma única empresa.', { campo: 'email' })
  }
  await semearPlanos(plataforma)
  const codigoPlano = dados.plano ?? 'profissional'
  await planoPorCodigo(plataforma, codigoPlano).catch((erro: Error) => {
    throw AppError.regraNegocio(erro.message)
  })
  const slug = await slugDisponivel(plataforma, gerarSlug(dados.slug || dados.nome))
  const schema = `emp_${randomBytes(6).toString('hex')}`
  // Inativa até terminar: ninguém entra numa empresa pela metade
  const assinante = await plataforma.assinante.create({ data: { nome: dados.nome, slug, schema, email: dados.email ?? email, cnpj: dados.cnpj, ativo: false } })

  try {
    await migrarSchema(plataforma, deps.databaseUrl, schema)
    const resultado = await semearEmpresa(deps.clienteDe(schema), {
      nomeEmpresa: dados.nome,
      admin: { ...dados.admin, email },
      exemplos: dados.exemplos ?? false,
    })
    if (!resultado.adminCriado) throw new Error('O administrador da empresa nova não foi criado.')
    await criarIndiceLogin(plataforma).reservar(email, assinante.id, resultado.adminCriado.id)
    await criarAssinatura(plataforma, assinante.id, codigoPlano, dados.situacao ?? 'teste')
    return await plataforma.assinante.update({ where: { id: assinante.id }, data: { ativo: true } })
  } catch (erro) {
    await plataforma.indiceLogin.deleteMany({ where: { assinanteId: assinante.id } })
    // Assinatura e eventos saem junto com a empresa (cascata)
    await plataforma.assinante.delete({ where: { id: assinante.id } })
    await plataforma.$executeRawUnsafe(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    throw erro
  }
}
