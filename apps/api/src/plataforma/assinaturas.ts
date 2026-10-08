import type { Assinatura, Plano, Prisma, PrismaClient } from '@prisma/client'
import { adicionarDias, calcularAcesso, hojeISO, modulosLiberados, type AcessoAssinatura, type Modulo, type SituacaoAssinatura } from '@onprint/shared'

/** Resumo da assinatura que acompanha a empresa no contexto de cada requisição. */
export interface AssinaturaContexto {
  plano: { codigo: string; nome: string }
  modulos: Modulo[]
  limiteUsuarios: number | null
  acesso: AcessoAssinatura
}

/** Planos criados numa plataforma nova (preços e módulos se ajustam depois, no painel). */
export const PLANOS_PADRAO = [
  {
    codigo: 'essencial',
    nome: 'Essencial',
    descricao: 'Orçamentos, pedidos, arte, clientes, produtos, financeiro e caixa.',
    valorMensal: '149.00',
    modulos: ['orcamentos', 'pedidos', 'artes', 'clientes', 'fornecedores', 'produtos', 'financeiro', 'caixa'],
    limiteUsuarios: 3,
    ordem: 1,
  },
  {
    codigo: 'profissional',
    nome: 'Profissional',
    descricao: 'Tudo do Essencial + produção, PCP, estoque e relatórios.',
    valorMensal: '279.00',
    modulos: ['orcamentos', 'pedidos', 'artes', 'clientes', 'fornecedores', 'produtos', 'financeiro', 'caixa', 'producao', 'pcp', 'estoque', 'relatorios'],
    limiteUsuarios: 10,
    ordem: 2,
  },
  {
    codigo: 'completo',
    nome: 'Completo',
    descricao: 'Todos os módulos e usuários ilimitados.',
    valorMensal: '449.00',
    modulos: ['orcamentos', 'pedidos', 'artes', 'clientes', 'fornecedores', 'produtos', 'financeiro', 'caixa', 'producao', 'pcp', 'estoque', 'relatorios', 'whatsapp'],
    limiteUsuarios: null,
    ordem: 3,
  },
] as const

/** Datas de dia (@db.Date) chegam como meia-noite UTC. */
export const diaISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
export const paraDia = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)

export function resumirAssinatura(a: Assinatura & { plano: Plano }, hoje = hojeISO()): AssinaturaContexto {
  return {
    plano: { codigo: a.plano.codigo, nome: a.plano.nome },
    modulos: modulosLiberados(a.plano.modulos, a.modulosExtras),
    limiteUsuarios: a.plano.limiteUsuarios,
    acesso: calcularAcesso(
      {
        situacao: a.situacao as SituacaoAssinatura,
        testeAte: diaISO(a.testeAte),
        atrasoDesde: diaISO(a.atrasoDesde),
        liberadoAte: diaISO(a.liberadoAte),
        bloqueioManual: a.bloqueioManual,
        renovacaoPendente: a.situacao === 'cancelada' && Boolean(a.gatewayAssinaturaId || a.gatewayAutorizacaoId),
        diasAteSomenteLeitura: a.plano.diasAteSomenteLeitura,
        diasAteBloqueio: a.plano.diasAteBloqueio,
      },
      hoje,
    ),
  }
}

export async function semearPlanos(plataforma: PrismaClient): Promise<boolean> {
  if ((await plataforma.plano.count()) > 0) return false
  for (const p of PLANOS_PADRAO) await plataforma.plano.create({ data: { ...p, modulos: [...p.modulos] } })
  return true
}

export async function planoPorCodigo(plataforma: PrismaClient, codigo: string) {
  const plano = await plataforma.plano.findUnique({ where: { codigo } })
  if (!plano?.ativo) throw new Error(`Plano "${codigo}" não existe ou está inativo.`)
  return plano
}

export interface EventoNovo {
  tipo: string
  descricao: string
  autor?: string
  dados?: Prisma.InputJsonValue
}

/** Cria a assinatura de uma empresa: em teste (dias do plano) ou já ativa (empresa própria / migração). */
export async function criarAssinatura(plataforma: PrismaClient, assinanteId: string, codigoPlano: string, situacao: SituacaoAssinatura, autor = 'sistema') {
  const plano = await planoPorCodigo(plataforma, codigoPlano)
  return plataforma.$transaction(async (tx) => {
    const assinatura = await tx.assinatura.create({
      data: { assinanteId, planoId: plano.id, situacao, testeAte: situacao === 'teste' ? paraDia(adicionarDias(hojeISO(), plano.diasTeste)) : null },
    })
    const descricao = situacao === 'teste' ? `Teste grátis de ${plano.diasTeste} dias no plano ${plano.nome}` : `Assinatura ativa no plano ${plano.nome}`
    await tx.eventoAssinatura.create({ data: { assinanteId, tipo: 'criada', descricao, autor } })
    return assinatura
  })
}

/** Altera a assinatura e registra o evento na mesma transação. */
export async function alterarAssinatura(plataforma: PrismaClient, assinanteId: string, dados: Prisma.AssinaturaUncheckedUpdateInput, evento: EventoNovo) {
  return plataforma.$transaction(async (tx) => {
    const assinatura = await tx.assinatura.update({ where: { assinanteId }, data: dados, include: { plano: true } })
    await tx.eventoAssinatura.create({ data: { assinanteId, tipo: evento.tipo, descricao: evento.descricao, autor: evento.autor ?? 'sistema', dados: evento.dados } })
    return assinatura
  })
}
