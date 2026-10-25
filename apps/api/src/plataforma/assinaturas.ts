import type { Assinatura, Plano, Prisma, PrismaClient } from '@prisma/client'
import { MODULOS, adicionarDias, calcularAcesso, hojeISO, modulosLiberados, type AcessoAssinatura, type Modulo, type SituacaoAssinatura } from '@onprint/shared'

/** Resumo da assinatura que acompanha a empresa no contexto de cada requisição. */
export interface AssinaturaContexto {
  plano: { codigo: string; nome: string }
  modulos: Modulo[]
  limiteUsuarios: number | null
  acesso: AcessoAssinatura
}

/** Tudo o que o sistema tem (os essenciais entram sempre, em qualquer plano) */
export const MODULOS_DO_PLANO_UNICO = ['orcamentos', 'pedidos', 'artes', 'producao', 'pcp', 'clientes', 'fornecedores', 'produtos', 'estoque', 'financeiro', 'caixa', 'relatorios', 'whatsapp', 'vitrine'] as const

/** Código do plano único (o que a página de venda, o cadastro e a assinatura mostram) */
export const PLANO_UNICO = 'grafygo'

/**
 * Plano criado numa plataforma nova (preço e prazos se ajustam depois, no painel): um plano só, com tudo incluído e
 * usuários ilimitados; o anual sai por 10 mensalidades (2 meses grátis).
 */
export const PLANOS_PADRAO = [
  {
    codigo: PLANO_UNICO,
    nome: 'GrafyGo',
    descricao: 'Tudo incluído: orçamentos, pedidos, arte, produção, estoque, financeiro, WhatsApp automático e vitrine online.',
    valorMensal: '99.00',
    valorAnual: '990.00',
    modulos: [...MODULOS_DO_PLANO_UNICO],
    limiteUsuarios: null,
    ordem: 0,
  },
] as const

/** Preços do plano como texto (para valorDoCiclo) */
export const precosDoPlano = (p: { valorMensal: { toFixed(n: number): string }; valorAnual: { toFixed(n: number): string } | null }) => ({ valorMensal: p.valorMensal.toFixed(2), valorAnual: p.valorAnual?.toFixed(2) ?? null })

/** Datas de dia (@db.Date) chegam como meia-noite UTC. */
export const diaISO = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)
export const paraDia = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`)

export function resumirAssinatura(a: Assinatura & { plano: Plano }, hoje = hojeISO()): AssinaturaContexto {
  return {
    plano: { codigo: a.plano.codigo, nome: a.plano.nome },
    // Teste grátis com tudo liberado (inclusive WhatsApp e vitrine): a pessoa experimenta o sistema inteiro antes de assinar
    modulos: a.situacao === 'teste' ? modulosLiberados(MODULOS, a.modulosExtras) : modulosLiberados(a.plano.modulos, a.modulosExtras),
    limiteUsuarios: a.plano.limiteUsuarios,
    acesso: calcularAcesso(
      {
        situacao: a.situacao as SituacaoAssinatura,
        testeAte: diaISO(a.testeAte),
        cortesiaAte: diaISO(a.cortesiaAte),
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

/**
 * Plano das empresas novas: o configurado (PLANO_PADRAO), se estiver à venda; senão o primeiro à venda
 * (um PLANO_PADRAO antigo no .env não quebra o cadastro).
 */
export async function planoPadraoAVenda(plataforma: PrismaClient, configurado: string) {
  const plano = await plataforma.plano.findUnique({ where: { codigo: configurado } })
  if (plano?.ativo && plano.publico) return plano
  return plataforma.plano.findFirst({ where: { ativo: true, publico: true }, orderBy: { ordem: 'asc' } })
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

/**
 * Cria a assinatura de uma empresa: em teste (dias do plano), já ativa (migração) ou cortesia sem prazo
 * (empresa da própria plataforma, parceiros).
 */
export async function criarAssinatura(plataforma: PrismaClient, assinanteId: string, codigoPlano: string, situacao: SituacaoAssinatura, autor = 'sistema') {
  const plano = await planoPorCodigo(plataforma, codigoPlano)
  const motivoCortesia = autor === 'seed' ? 'Empresa da plataforma' : 'Criada como cortesia pelo suporte'
  return plataforma.$transaction(async (tx) => {
    const assinatura = await tx.assinatura.create({
      data: {
        assinanteId,
        planoId: plano.id,
        situacao,
        testeAte: situacao === 'teste' ? paraDia(adicionarDias(hojeISO(), plano.diasTeste)) : null,
        cortesiaMotivo: situacao === 'cortesia' ? motivoCortesia : null,
      },
    })
    const descricao =
      situacao === 'teste'
        ? `Teste grátis de ${plano.diasTeste} dias no plano ${plano.nome}`
        : situacao === 'cortesia'
          ? `Cortesia sem prazo no plano ${plano.nome} (${motivoCortesia})`
          : `Assinatura ativa no plano ${plano.nome}`
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
