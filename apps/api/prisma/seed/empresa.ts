import type { PrismaClient } from '@prisma/client'
import argon2 from 'argon2'
import { ACOES, ENTIDADES_STATUS, MODULOS, PAPEIS, PAPEL_ROTULOS } from '@onprint/shared'
import { UNIDADES, criarCatalogoExemplo } from './catalogo'
import { STATUS_PADRAO, TEMPLATES_PADRAO } from './dados-padrao'
import { criarFinanceiroPadrao } from './financeiro'
import { permissoesPadrao } from './permissoes-padrao'

export interface AdminInicial {
  nome: string
  email: string
  senha: string
  /** Obriga a troca da senha no primeiro login (senha gerada pelo sistema) */
  deveTrocarSenha: boolean
}

export interface OpcoesSemeadura {
  /** Nome que aparece nos documentos enquanto a empresa não preenche os dados dela */
  nomeEmpresa: string
  /** Criado só se a empresa ainda não tiver nenhum usuário */
  admin?: AdminInicial
  /** Catálogo de exemplo (produtos, insumos, acabamentos, máquinas) */
  exemplos: boolean
}

export interface ResultadoSemeadura {
  permissoes: number
  /** Admin criado nesta execução (para o índice de login) */
  adminCriado: { id: string; email: string } | null
  financeiro: boolean
  catalogo: boolean
}

async function papeisEPermissoes(prisma: PrismaClient) {
  for (const codigo of PAPEIS) {
    await prisma.papel.upsert({ where: { codigo }, update: {}, create: { codigo, nome: PAPEL_ROTULOS[codigo] } })
  }
  for (const modulo of MODULOS) {
    for (const acao of ACOES) {
      await prisma.permissao.upsert({ where: { modulo_acao: { modulo, acao } }, update: {}, create: { modulo, acao } })
    }
  }

  const catalogo = new Map<string, string>((await prisma.permissao.findMany()).map((p) => [`${p.modulo}:${p.acao}`, p.id] as const))
  for (const codigo of PAPEIS) {
    const papel = await prisma.papel.findUniqueOrThrow({ where: { codigo }, include: { _count: { select: { permissoes: true } } } })
    // Admin sempre com tudo; os demais só recebem a matriz padrão se ainda estiverem vazios
    if (codigo !== 'admin' && papel._count.permissoes > 0) continue
    await prisma.papelPermissao.createMany({
      data: permissoesPadrao(codigo).map((chave) => ({ papelId: papel.id, permissaoId: catalogo.get(chave)! })),
      skipDuplicates: true,
    })
  }
  return catalogo.size
}

async function adminInicial(prisma: PrismaClient, admin: AdminInicial) {
  // Só numa empresa sem usuários: renomear ou desativar o admin não o recria com a senha inicial
  if ((await prisma.usuario.count()) > 0) return null
  const papel = await prisma.papel.findUniqueOrThrow({ where: { codigo: 'admin' } })
  return prisma.usuario.create({
    data: { nome: admin.nome, email: admin.email, senhaHash: await argon2.hash(admin.senha), papelId: papel.id, deveTrocarSenha: admin.deveTrocarSenha },
    select: { id: true, email: true },
  })
}

async function statusTemplatesEmpresa(prisma: PrismaClient, nomeEmpresa: string) {
  for (const entidade of ENTIDADES_STATUS) {
    for (const [ordem, s] of STATUS_PADRAO[entidade].entries()) {
      await prisma.statusConfig.upsert({
        where: { entidade_codigo: { entidade, codigo: s.codigo } },
        update: {},
        create: { entidade, codigo: s.codigo, rotulo: s.rotulo, cor: s.cor, ordem, ehFinal: s.final ?? false },
      })
    }
  }
  if ((await prisma.mensagemTemplate.count()) === 0) await prisma.mensagemTemplate.createMany({ data: TEMPLATES_PADRAO })
  if ((await prisma.empresaConfig.count()) === 0) {
    await prisma.empresaConfig.create({ data: { razaoSocial: nomeEmpresa, condicoesPadrao: '50% de entrada na aprovação e o restante na entrega.' } })
  }
}

/**
 * Dados padrão de uma empresa (idempotente: só cria o que falta, nunca sobrescreve o que foi editado).
 * Roda a cada subida da API para todas as empresas (módulos e status novos chegam a todas)
 * e ao criar uma empresa nova.
 */
export async function semearEmpresa(prisma: PrismaClient, opcoes: OpcoesSemeadura): Promise<ResultadoSemeadura> {
  const permissoes = await papeisEPermissoes(prisma)
  const adminCriado = opcoes.admin ? await adminInicial(prisma, opcoes.admin) : null
  await statusTemplatesEmpresa(prisma, opcoes.nomeEmpresa)
  // Local de estoque padrão (baixa da produção e PDV)
  if ((await prisma.estoqueLocal.count()) === 0) await prisma.estoqueLocal.create({ data: { nome: 'Almoxarifado', padrao: true } })
  for (const u of UNIDADES) await prisma.unidadeMedida.upsert({ where: { sigla: u.sigla }, update: {}, create: u })
  const financeiro = await criarFinanceiroPadrao(prisma)
  const catalogo = opcoes.exemplos && (await criarCatalogoExemplo(prisma))
  return { permissoes, adminCriado, financeiro, catalogo }
}
