/**
 * Seed idempotente: roda a cada subida do container da API (local e produção), depois das migrations.
 * Só cria o que falta; nunca sobrescreve o que foi editado pelo usuário.
 * - Sem nenhuma empresa na plataforma: registra a empresa padrão no schema "public" (os dados
 *   de antes da multiempresa continuam lá) e move os arquivos dela para a pasta da empresa.
 * - Para cada empresa: papéis, permissões, status, templates, financeiro e (opcional) catálogo.
 * Produção: o admin inicial vem de ADMIN_EMAIL / ADMIN_SENHA_INICIAL e o catálogo de exemplo
 * só é criado com SEED_EXEMPLOS=true.
 */
import { mkdir, readdir, rename } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import type { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { SCHEMA_LEGADO } from '../src/core/banco'
import { StoragePorEmpresa } from '../src/core/storage/por-empresa'
import { criarAssinatura, semearPlanos } from '../src/plataforma/assinaturas'
import { semearEmpresa } from './seed/empresa'
import { conexoesDosScripts, executarScript } from './scripts-banco'

const PRODUCAO = process.env.NODE_ENV === 'production'
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@onprint.local').toLowerCase()
const ADMIN_SENHA = process.env.ADMIN_SENHA_INICIAL || 'admin123'
const EXEMPLOS = (process.env.SEED_EXEMPLOS ?? (PRODUCAO ? 'false' : 'true')) === 'true'
const SLUG_PADRAO = process.env.EMPRESA_PADRAO_SLUG || 'principal'
const UPLOAD_DIR = resolve(process.env.UPLOAD_DIR || './uploads')
const PLANO_PADRAO = process.env.PLANO_PADRAO || 'profissional'
// Painel da plataforma: em produção só com as variáveis definidas
const PLATAFORMA_EMAIL = (process.env.PLATAFORMA_ADMIN_EMAIL || (PRODUCAO ? '' : 'plataforma@onprint.local')).toLowerCase()
const PLATAFORMA_SENHA = process.env.PLATAFORMA_ADMIN_SENHA || (PRODUCAO ? '' : 'plataforma123')

const banco = conexoesDosScripts()

/** Arquivos gravados antes da multiempresa ficam na raiz de uploads: vão para a pasta da empresa padrão. */
async function moverArquivosLegados(empresaId: string) {
  const entradas = await readdir(UPLOAD_DIR).catch(() => [] as string[])
  const mover = entradas.filter((e) => e !== 'empresas')
  if (mover.length === 0) return
  const destino = StoragePorEmpresa.pastaDaEmpresa(UPLOAD_DIR, empresaId)
  await mkdir(destino, { recursive: true })
  for (const entrada of mover) await rename(join(UPLOAD_DIR, entrada), join(destino, entrada))
  console.log(`Arquivos existentes movidos para ${destino}.`)
}

async function registrarEmpresaPadrao() {
  if ((await banco.plataforma.assinante.count()) > 0) return
  const config = await banco.clienteDe(SCHEMA_LEGADO).empresaConfig.findFirst()
  const nome = config?.nomeFantasia || config?.razaoSocial || 'Empresa principal'
  const empresa = await banco.plataforma.assinante.create({ data: { nome, slug: SLUG_PADRAO, schema: SCHEMA_LEGADO, email: config?.email } })
  console.log(`Empresa padrão registrada: ${nome} (/${SLUG_PADRAO}, schema ${SCHEMA_LEGADO}).`)
  await moverArquivosLegados(empresa.id)
}

/** Garante que todo usuário da empresa esteja no índice de login (e-mail → empresa). */
async function sincronizarIndice(empresaId: string, prisma: PrismaClient) {
  for (const u of await prisma.usuario.findMany({ select: { id: true, email: true } })) {
    const existente = await banco.plataforma.indiceLogin.findUnique({ where: { email: u.email } })
    if (!existente) await banco.plataforma.indiceLogin.create({ data: { email: u.email, assinanteId: empresaId, usuarioId: u.id } })
    else if (existente.assinanteId !== empresaId) console.warn(`Atenção: ${u.email} existe em mais de uma empresa; o login vai para a primeira.`)
  }
}

/** Toda empresa tem assinatura: a padrão (dona do sistema) no plano completo, cortesia; as demais em teste. */
async function garantirAssinaturas() {
  const sem = await banco.plataforma.assinante.findMany({ where: { assinatura: null } })
  for (const empresa of sem) {
    const padrao = empresa.schema === SCHEMA_LEGADO
    await criarAssinatura(banco.plataforma, empresa.id, padrao ? 'completo' : PLANO_PADRAO, padrao ? 'cortesia' : 'teste', 'seed')
    console.log(`[${empresa.slug}] Assinatura criada (${padrao ? 'completo, cortesia' : `${PLANO_PADRAO}, teste grátis`}).`)
  }
}

/** Primeiro administrador do painel da plataforma (só se ainda não houver nenhum). */
async function adminPlataforma() {
  if ((await banco.plataforma.adminPlataforma.count()) > 0) return
  if (!PLATAFORMA_EMAIL || !PLATAFORMA_SENHA) {
    console.warn('Painel da plataforma sem administrador: defina PLATAFORMA_ADMIN_EMAIL e PLATAFORMA_ADMIN_SENHA (ou use o comando admin-plataforma).')
    return
  }
  await banco.plataforma.adminPlataforma.create({ data: { nome: 'Administrador da plataforma', email: PLATAFORMA_EMAIL, senhaHash: await argon2.hash(PLATAFORMA_SENHA) } })
  console.log(`Admin da plataforma criado: ${PLATAFORMA_EMAIL}${PRODUCAO ? '' : ` / ${PLATAFORMA_SENHA}`} (painel em /plataforma)`)
}

executarScript(async () => {
  await adminPlataforma()
  if (await semearPlanos(banco.plataforma)) console.log('Planos padrão criados (Essencial, Profissional, Completo).')
  await registrarEmpresaPadrao()
  await garantirAssinaturas()
  const empresas = await banco.plataforma.assinante.findMany({ where: { ativo: true }, orderBy: { createdAt: 'asc' } })
  for (const empresa of empresas) {
    const prisma = banco.clienteDe(empresa.schema)
    const padrao = empresa.schema === SCHEMA_LEGADO
    const r = await semearEmpresa(prisma, {
      nomeEmpresa: empresa.nome,
      // O admin com a senha inicial do .env só existe na empresa padrão
      admin: padrao ? { nome: 'Administrador', email: ADMIN_EMAIL, senha: ADMIN_SENHA, deveTrocarSenha: true } : undefined,
      exemplos: padrao && EXEMPLOS,
    })
    await sincronizarIndice(empresa.id, prisma)
    if (r.adminCriado) console.log(`Admin criado: ${ADMIN_EMAIL}${PRODUCAO ? '' : ` / ${ADMIN_SENHA}`} (troca de senha obrigatória no 1º login)`)
    if (r.financeiro) console.log(`[${empresa.slug}] Financeiro inicial criado (contas, categorias e formas de pagamento).`)
    if (r.catalogo) console.log(`[${empresa.slug}] Catálogo de exemplo criado.`)
  }
  console.log(`Seed concluído: ${empresas.length} empresa(s) com papéis, permissões, status, templates e financeiro em dia.`)
}, banco.fechar)
