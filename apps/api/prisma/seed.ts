/**
 * Seed idempotente: roda a cada subida do container da API (local e produção).
 * Só cria o que falta; nunca sobrescreve o que foi editado pelo usuário.
 * Produção: o admin inicial vem de ADMIN_EMAIL / ADMIN_SENHA_INICIAL e o catálogo de exemplo
 * só é criado com SEED_EXEMPLOS=true.
 */
import { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { ACOES, ENTIDADES_STATUS, MODULOS, PAPEIS, PAPEL_ROTULOS } from '@onprint/shared'
import { UNIDADES, criarCatalogoExemplo } from './seed/catalogo'
import { criarFinanceiroPadrao } from './seed/financeiro'
import { STATUS_PADRAO, TEMPLATES_PADRAO } from './seed/dados-padrao'
import { permissoesPadrao } from './seed/permissoes-padrao'

const prisma = new PrismaClient()

const PRODUCAO = process.env.NODE_ENV === 'production'
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@onprint.local'
const ADMIN_SENHA = process.env.ADMIN_SENHA_INICIAL || 'admin123'
const EXEMPLOS = (process.env.SEED_EXEMPLOS ?? (PRODUCAO ? 'false' : 'true')) === 'true'

async function papeisEPermissoes() {
  for (const codigo of PAPEIS) {
    await prisma.papel.upsert({ where: { codigo }, update: {}, create: { codigo, nome: PAPEL_ROTULOS[codigo] } })
  }
  for (const modulo of MODULOS) {
    for (const acao of ACOES) {
      await prisma.permissao.upsert({
        where: { modulo_acao: { modulo, acao } },
        update: {},
        create: { modulo, acao },
      })
    }
  }

  const catalogo = new Map<string, string>(
    (await prisma.permissao.findMany()).map((p) => [`${p.modulo}:${p.acao}`, p.id] as const),
  )
  for (const codigo of PAPEIS) {
    const papel = await prisma.papel.findUniqueOrThrow({
      where: { codigo },
      include: { _count: { select: { permissoes: true } } },
    })
    // Admin sempre com tudo; os demais só recebem a matriz padrão se ainda estiverem vazios
    if (codigo !== 'admin' && papel._count.permissoes > 0) continue
    await prisma.papelPermissao.createMany({
      data: permissoesPadrao(codigo).map((chave) => ({ papelId: papel.id, permissaoId: catalogo.get(chave)! })),
      skipDuplicates: true,
    })
  }
  return catalogo.size
}

async function adminInicial() {
  // Só num banco sem usuários: renomear ou desativar o admin não o recria com a senha inicial
  if ((await prisma.usuario.count()) > 0) return
  const admin = await prisma.papel.findUniqueOrThrow({ where: { codigo: 'admin' } })
  await prisma.usuario.create({
    data: {
      nome: 'Administrador',
      email: ADMIN_EMAIL,
      senhaHash: await argon2.hash(ADMIN_SENHA),
      papelId: admin.id,
      deveTrocarSenha: true,
    },
  })
  console.log(`Admin criado: ${ADMIN_EMAIL}${PRODUCAO ? '' : ` / ${ADMIN_SENHA}`} (troca de senha obrigatória no 1º login)`)
}

async function statusTemplatesEmpresa() {
  for (const entidade of ENTIDADES_STATUS) {
    for (const [ordem, s] of STATUS_PADRAO[entidade].entries()) {
      await prisma.statusConfig.upsert({
        where: { entidade_codigo: { entidade, codigo: s.codigo } },
        update: {},
        create: { entidade, codigo: s.codigo, rotulo: s.rotulo, cor: s.cor, ordem, ehFinal: s.final ?? false },
      })
    }
  }
  if ((await prisma.mensagemTemplate.count()) === 0) {
    await prisma.mensagemTemplate.createMany({ data: TEMPLATES_PADRAO })
  }
  if ((await prisma.empresaConfig.count()) === 0) {
    await prisma.empresaConfig.create({
      data: {
        razaoSocial: 'Minha Empresa de Comunicação Visual',
        condicoesPadrao: '50% de entrada na aprovação e o restante na entrega.',
      },
    })
  }
}

async function main() {
  const permissoes = await papeisEPermissoes()
  await adminInicial()
  await statusTemplatesEmpresa()
  // Local de estoque padrão (baixa da produção e PDV)
  if ((await prisma.estoqueLocal.count()) === 0) await prisma.estoqueLocal.create({ data: { nome: 'Almoxarifado', padrao: true } })
  for (const u of UNIDADES) await prisma.unidadeMedida.upsert({ where: { sigla: u.sigla }, update: {}, create: u })
  if (await criarFinanceiroPadrao(prisma)) console.log('Financeiro inicial criado (contas, categorias e formas de pagamento).')
  if (EXEMPLOS && (await criarCatalogoExemplo(prisma))) console.log('Catálogo de exemplo criado (produtos, insumos, acabamentos, máquinas e processos).')
  console.log(`Seed concluído: ${PAPEIS.length} papéis, ${permissoes} permissões, status, templates e empresa.`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
