import type { Cupom, CupomUso, PrismaClient } from '@prisma/client'
import {
  MENSALIDADE_MINIMA,
  adicionarDias,
  adicionarMeses,
  cupomIndisponivel,
  descontoDoCupom,
  descreverCupom,
  fimDoDesconto,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
  mesesGratis,
  valorDaMensalidade,
  type CupomEmUso,
  type RegrasMensalidade,
  type TipoCupom,
} from '@onprint/shared'
import type { GatewayPagamentos } from '../integrations/pagamentos'
import { diaISO, paraDia } from './assinaturas'
import { inicioPeriodoAtual, registrarEvento, vencimentoQueConta } from './cobrancas'

/**
 * Benefícios da assinatura: cupom de desconto, meses grátis, cortesia e abono de cobrança.
 * Regra geral (a mesma da troca de plano): cobrança vencida ou do período em curso nunca muda de valor;
 * só as mensalidades de períodos que ainda não começaram (vencimento depois de hoje) são recalculadas.
 */

export interface Deps {
  plataforma: PrismaClient
  pagamentos: GatewayPagamentos | null
}

type UsoComCupom = CupomUso & { cupom: Cupom }

export const descricaoCupom = (c: Pick<Cupom, 'tipo' | 'valor' | 'duracaoMeses'>) => descreverCupom({ tipo: c.tipo as TipoCupom, valor: c.valor.toFixed(2), duracaoMeses: c.duracaoMeses })

export async function cupomEmVigor(plataforma: PrismaClient, assinanteId: string): Promise<UsoComCupom | null> {
  return plataforma.cupomUso.findFirst({ where: { assinanteId, encerradoEm: null }, include: { cupom: true }, orderBy: { createdAt: 'desc' } })
}

/** Plano em vigor, downgrade agendado e cupom: o que define o valor de cada mensalidade. */
export async function regrasDeValor(plataforma: PrismaClient, assinanteId: string): Promise<RegrasMensalidade> {
  const a = await plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId }, include: { plano: true } })
  const agendado = a.planoAgendadoId && a.planoAgendadoEm ? await plataforma.plano.findUnique({ where: { id: a.planoAgendadoId } }) : null
  const uso = await cupomEmVigor(plataforma, assinanteId)
  return {
    valorPlano: a.plano.valorMensal.toFixed(2),
    agendado: agendado && a.planoAgendadoEm ? { valor: agendado.valorMensal.toFixed(2), em: diaISO(a.planoAgendadoEm) as string } : null,
    desconto: uso ? { tipo: uso.cupom.tipo as TipoCupom, valor: uso.cupom.valor.toFixed(2), desde: diaISO(uso.desde), ate: diaISO(uso.ate) } : null,
  }
}

/** Para as telas: o cupom em vigor e quanto ele desconta no plano atual. */
export function resumoCupom(uso: UsoComCupom | null, valorPlano: string): CupomEmUso | null {
  if (!uso) return null
  return {
    codigo: uso.cupom.codigo,
    descricao: uso.cupom.descricao || descricaoCupom(uso.cupom),
    desconto: descontoDoCupom({ tipo: uso.cupom.tipo as TipoCupom, valor: uso.cupom.valor.toFixed(2) }, valorPlano),
    duracaoMeses: uso.cupom.duracaoMeses,
    desde: diaISO(uso.desde),
    ate: diaISO(uso.ate),
  }
}

/** Desconto de cupom numa mensalidade nova (vinda do gateway), para o relatório do cupom. */
export async function descontoDaMensalidade(plataforma: PrismaClient, assinanteId: string, vencimento: string): Promise<string | null> {
  const uso = await cupomEmVigor(plataforma, assinanteId)
  if (!uso) return null
  const d = valorDaMensalidade(await regrasDeValor(plataforma, assinanteId), vencimento).desconto
  return Number(d) > 0 ? d : null
}

/** Próxima mensalidade que o gateway vai gerar: um mês depois da última registrada (ou o próximo vencimento). */
async function proximaAGerar(plataforma: PrismaClient, assinanteId: string, hoje: string) {
  const a = await plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId } })
  const ultima = (await plataforma.cobranca.findMany({ where: { assinanteId, tipo: 'mensalidade', situacao: { notIn: ['cancelada', 'estornada'] } } })).map(vencimentoQueConta).sort().at(-1)
  const data = ultima ? adicionarMeses(ultima, 1) : (diaISO(a.proximoVencimento) ?? hoje)
  return data > hoje ? data : hoje
}

/**
 * Coloca cada mensalidade de período futuro no valor certo (plano, agendamento e cupom) e ajusta o valor que o
 * gateway usa para gerar as próximas. Chamado na troca de plano, ao aplicar/remover cupom e a cada mensalidade nova.
 */
export async function aplicarValores(deps: Deps, assinanteId: string, hoje = hojeISO()) {
  const { plataforma, pagamentos } = deps
  const regras = await regrasDeValor(plataforma, assinanteId)
  const a = await plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId } })
  const futuras = await plataforma.cobranca.findMany({ where: { assinanteId, tipo: 'mensalidade', situacao: 'pendente', vencimento: { gt: paraDia(hoje) } } })
  const falhas: string[] = []
  for (const c of futuras) {
    const vencimento = diaISO(c.vencimento) as string
    const v = valorDaMensalidade(regras, vencimento)
    const desconto = Number(v.desconto) > 0 ? v.desconto : null
    if (c.valor.toFixed(2) === v.valor && (c.desconto?.toFixed(2) ?? null) === desconto) continue
    try {
      if (c.valor.toFixed(2) !== v.valor && c.gatewayId && c.gateway === 'asaas') {
        if (!pagamentos) throw new Error('pagamento online desligado')
        await pagamentos.alterarCobranca(c.gatewayId, { valor: v.valor, vencimento, tipo: c.forma ?? 'UNDEFINED' })
      }
      await plataforma.cobranca.update({ where: { id: c.id }, data: { valor: v.valor, desconto } })
    } catch (erro) {
      falhas.push(`${vencimento}: ${(erro as Error).message}`)
    }
  }
  if (a.gatewayAssinaturaId && pagamentos) {
    const valor = valorDaMensalidade(regras, await proximaAGerar(plataforma, assinanteId, hoje)).valor
    await pagamentos.alterarAssinatura(a.gatewayAssinaturaId, { valor }).catch((erro: Error) => falhas.push(`assinatura no gateway: ${erro.message}`))
  }
  // Janela do cupom terminou (todas as mensalidades com desconto já passaram): encerra o uso
  const uso = await cupomEmVigor(plataforma, assinanteId)
  const ate = diaISO(uso?.ate)
  if (uso && ate && ate < hoje) {
    await plataforma.cupomUso.update({ where: { id: uso.id }, data: { encerradoEm: new Date() } })
    await registrarEvento(plataforma, assinanteId, 'cupom', `Cupom ${uso.cupom.codigo} concluído: as mensalidades voltam ao valor cheio`)
  }
  if (falhas.length) await registrarEvento(plataforma, assinanteId, 'falha_reajuste', `Mensalidade futura não foi para o valor certo (${falhas.join('; ')})`)
  return falhas
}

/** Primeira mensalidade de um período que ainda não começou (onde um cupom aplicado hoje passa a valer). */
async function primeiraNaoIniciada(plataforma: PrismaClient, assinanteId: string, hoje: string): Promise<string | null> {
  const a = await plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId } })
  const pendente = await plataforma.cobranca.findFirst({ where: { assinanteId, tipo: 'mensalidade', situacao: 'pendente', vencimento: { gt: paraDia(hoje) } }, orderBy: { vencimento: 'asc' } })
  if (pendente) return diaISO(pendente.vencimento)
  const proximo = diaISO(a.proximoVencimento)
  if (proximo && proximo > hoje) return proximo
  const inicio = await inicioPeriodoAtual(plataforma, assinanteId, hoje)
  return inicio ? adicionarMeses(inicio, 1) : null
}

export const CUPOM_INVALIDO_PUBLICO = 'Cupom inválido ou indisponível.'
const CUPOM_OUTRO_PLANO = 'Este cupom não vale para este plano.'

/**
 * Confere o cupom (existe, válido, com usos, vale para o plano).
 * publico: cadastro e empresas recebem uma mensagem só (não dá para sondar quais códigos existem);
 * o painel da plataforma vê o motivo exato.
 */
export async function validarCupom(plataforma: PrismaClient, codigo: string, planoCodigo: string | null, hoje = hojeISO(), opcoes: { publico?: boolean } = {}) {
  const recusar = (motivo: string) => new Error(opcoes.publico && motivo !== CUPOM_OUTRO_PLANO ? CUPOM_INVALIDO_PUBLICO : motivo)
  const cupom = await plataforma.cupom.findUnique({ where: { codigo: codigo.trim().toUpperCase() } })
  if (!cupom) throw recusar('Cupom não encontrado.')
  const usos = await plataforma.cupomUso.count({ where: { cupomId: cupom.id } })
  const motivo = cupomIndisponivel({ ativo: cupom.ativo, validoAte: diaISO(cupom.validoAte), limiteUsos: cupom.limiteUsos, usos, planos: cupom.planos }, planoCodigo, hoje)
  if (motivo) throw recusar(motivo)
  return cupom
}

/** Mensalidade com o desconto não pode ficar abaixo do mínimo do gateway. */
function conferirMinimo(cupom: Cupom, valorPlano: string) {
  const d = descontoDoCupom({ tipo: cupom.tipo as TipoCupom, valor: cupom.valor.toFixed(2) }, valorPlano)
  if (Number(valorPlano) - Number(d) < MENSALIDADE_MINIMA) throw new Error(`Com este desconto a mensalidade fica abaixo de ${formatarMoeda(MENSALIDADE_MINIMA)}. Use meses grátis ou cortesia.`)
}

/**
 * Aplica um cupom: o desconto vale a partir da primeira mensalidade de período ainda não iniciado (ou da 1ª,
 * se ainda não assinou) pelos meses do cupom. Substitui o cupom anterior.
 */
export async function aplicarCupom(deps: Deps, assinanteId: string, codigo: string, autor: string, hoje = hojeISO()) {
  const { plataforma } = deps
  const a = await plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId }, include: { plano: true } })
  if (a.situacao === 'cortesia') throw new Error('A assinatura é cortesia: não há mensalidade para descontar.')
  const cupom = await validarCupom(plataforma, codigo, a.plano.codigo, hoje)
  conferirMinimo(cupom, a.plano.valorMensal.toFixed(2))
  const comPagamento = Boolean(a.gatewayAssinaturaId || (await plataforma.cobranca.count({ where: { assinanteId, tipo: 'mensalidade' } })))
  const desde = comPagamento ? await primeiraNaoIniciada(plataforma, assinanteId, hoje) : null
  await plataforma.cupomUso.updateMany({ where: { assinanteId, encerradoEm: null }, data: { encerradoEm: new Date() } })
  await plataforma.cupomUso.create({ data: { cupomId: cupom.id, assinanteId, desde: desde ? paraDia(desde) : null, ate: desde && cupom.duracaoMeses ? paraDia(fimDoDesconto(desde, cupom.duracaoMeses) as string) : null, autor } })
  const quando = desde ? ` a partir da mensalidade de ${formatarDataSimples(desde)}` : ' a partir da 1ª mensalidade'
  await registrarEvento(plataforma, assinanteId, 'cupom', `Cupom ${cupom.codigo} aplicado (${descricaoCupom(cupom)})${quando}`, { cupom: cupom.codigo }, autor)
  if (comPagamento) await aplicarValores(deps, assinanteId, hoje)
  return cupom
}

/** Ao assinar: o cupom guardado no cadastro (ou digitado agora) começa a contar na 1ª mensalidade. */
export async function iniciarCupom(plataforma: PrismaClient, assinanteId: string, primeiroVencimento: string) {
  const uso = await cupomEmVigor(plataforma, assinanteId)
  if (!uso || uso.desde) return
  await plataforma.cupomUso.update({
    where: { id: uso.id },
    data: { desde: paraDia(primeiroVencimento), ate: uso.cupom.duracaoMeses ? paraDia(fimDoDesconto(primeiroVencimento, uso.cupom.duracaoMeses) as string) : null },
  })
}

export async function removerCupom(deps: Deps, assinanteId: string, autor: string, hoje = hojeISO()) {
  const uso = await cupomEmVigor(deps.plataforma, assinanteId)
  if (!uso) throw new Error('A assinatura não tem cupom.')
  await deps.plataforma.cupomUso.update({ where: { id: uso.id }, data: { encerradoEm: new Date() } })
  await registrarEvento(deps.plataforma, assinanteId, 'cupom', `Cupom ${uso.cupom.codigo} removido: as próximas mensalidades voltam ao valor cheio`, undefined, autor)
  await aplicarValores(deps, assinanteId, hoje)
}

/** Abona (perdoa) uma cobrança em aberto: some do gateway e fica registrada com o motivo. */
export async function abonarCobranca(deps: Deps, assinanteId: string, cobrancaId: string, motivo: string, autor = 'sistema') {
  const { plataforma, pagamentos } = deps
  const c = await plataforma.cobranca.findFirst({ where: { id: cobrancaId, assinanteId } })
  if (!c) throw new Error('Cobrança não encontrada.')
  if (!['pendente', 'vencida'].includes(c.situacao)) throw new Error('Só dá para abonar cobrança em aberto.')
  if (c.gatewayId && c.gateway === 'asaas') {
    if (!pagamentos) throw new Error('O pagamento online está desligado: não dá para cancelar a cobrança no gateway.')
    await pagamentos.cancelarCobranca(c.gatewayId)
  }
  await plataforma.cobranca.update({ where: { id: c.id }, data: { situacao: 'abonada', motivoAbono: motivo, linkPagamento: null } })
  await registrarEvento(plataforma, assinanteId, 'abono', `Cobrança de ${formatarMoeda(c.valor.toFixed(2))} (vencimento ${formatarDataSimples(vencimentoQueConta(c))}) abonada: ${motivo}`, undefined, autor)
}

/**
 * Meses grátis: as N próximas mensalidades (a partir da primeira de período ainda não iniciado) ficam abonadas
 * e o gateway passa a gerar a seguinte só depois delas. No teste grátis, o teste é que se estende.
 */
export async function darMesesGratis(deps: Deps, assinanteId: string, meses: number, motivo: string, autor = 'sistema', hoje = hojeISO()) {
  const { plataforma, pagamentos } = deps
  const a = await plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId }, include: { plano: true } })
  const rotulo = meses === 1 ? '1 mês grátis' : `${meses} meses grátis`
  if (a.situacao === 'cortesia') throw new Error('A assinatura já é cortesia.')
  if (a.situacao === 'cancelada') throw new Error('A assinatura está cancelada: reative ou dê uma cortesia.')
  if (a.situacao === 'teste' && !a.gatewayAssinaturaId) {
    const base = diaISO(a.testeAte) && (diaISO(a.testeAte) as string) > hoje ? (diaISO(a.testeAte) as string) : hoje
    const ate = adicionarMeses(base, meses)
    await plataforma.assinatura.update({ where: { assinanteId }, data: { testeAte: paraDia(ate) } })
    await registrarEvento(plataforma, assinanteId, 'meses_gratis', `${rotulo} (${motivo}): teste grátis estendido até ${formatarDataSimples(ate)}`, undefined, autor)
    return
  }
  const base = (await primeiraNaoIniciada(plataforma, assinanteId, hoje)) ?? adicionarDias(hoje, 1)
  const { abonados, proximo } = mesesGratis(base, meses)
  const regras = await regrasDeValor(plataforma, assinanteId)
  const pendentes = await plataforma.cobranca.findMany({ where: { assinanteId, tipo: 'mensalidade', situacao: 'pendente', vencimento: { gt: paraDia(hoje) } } })
  const texto = `Mês grátis: ${motivo}`
  for (const dia of abonados) {
    const existente = pendentes.find((c) => (diaISO(c.vencimento) as string).slice(0, 7) === dia.slice(0, 7))
    if (existente) {
      if (existente.gatewayId && existente.gateway === 'asaas') {
        if (!pagamentos) throw new Error('O pagamento online está desligado: não dá para cancelar a cobrança no gateway.')
        await pagamentos.cancelarCobranca(existente.gatewayId)
      }
      await plataforma.cobranca.update({ where: { id: existente.id }, data: { situacao: 'abonada', motivoAbono: texto, linkPagamento: null } })
    } else {
      const v = valorDaMensalidade(regras, dia)
      await plataforma.cobranca.create({ data: { assinanteId, gateway: 'manual', valor: v.valor, vencimento: paraDia(dia), situacao: 'abonada', motivoAbono: texto } })
    }
  }
  // Mensalidades já geradas depois do período grátis seguem; o gateway só gera a próxima a partir de `proximo`
  const depois = pendentes.some((c) => (diaISO(c.vencimento) as string) >= proximo)
  if (a.gatewayAssinaturaId && pagamentos && !depois) await pagamentos.alterarAssinatura(a.gatewayAssinaturaId, { proximoVencimento: proximo })
  await plataforma.assinatura.update({ where: { assinanteId }, data: { proximoVencimento: paraDia(proximo) } })
  await registrarEvento(plataforma, assinanteId, 'meses_gratis', `${rotulo} (${motivo}): ${abonados.map(formatarDataSimples).join(', ')} abonada${meses > 1 ? 's' : ''}; próxima cobrança em ${formatarDataSimples(proximo)}`, undefined, autor)
}

/**
 * Cortesia (assinatura grátis): sem prazo, a recorrência no gateway é encerrada; com prazo, as mensalidades
 * até lá são abonadas e a próxima cobrança fica para o fim da cortesia (as já geradas depois dele são removidas:
 * o gateway recomeça a sequência dali). Cobranças vencidas continuam (o suporte abona se quiser).
 */
export async function darCortesia(deps: Deps, assinanteId: string, ate: string | null, motivo: string, autor = 'sistema', hoje = hojeISO()) {
  const { plataforma, pagamentos } = deps
  const a = await plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId } })
  if (ate && ate <= hoje) throw new Error('A cortesia precisa terminar depois de hoje.')
  const futuras = await plataforma.cobranca.findMany({
    where: { assinanteId, situacao: 'pendente', vencimento: { gt: paraDia(hoje), ...(ate ? { lt: paraDia(ate) } : {}) } },
  })
  for (const c of futuras) {
    if (c.gatewayId && c.gateway === 'asaas' && pagamentos) await pagamentos.cancelarCobranca(c.gatewayId)
    await plataforma.cobranca.update({ where: { id: c.id }, data: { situacao: 'abonada', motivoAbono: `Cortesia: ${motivo}`, linkPagamento: null } })
  }
  const dados: Parameters<typeof plataforma.assinatura.update>[0]['data'] = { situacao: 'cortesia', cortesiaAte: ate ? paraDia(ate) : null, cortesiaMotivo: motivo, testeAte: null, canceladaEm: null, cancelarEm: null }
  if (pagamentos && !ate) {
    if (a.gatewayAutorizacaoId) await pagamentos.cancelarAutorizacaoPix(a.gatewayAutorizacaoId).catch(() => undefined)
    if (a.gatewayAssinaturaId) await pagamentos.cancelarAssinatura(a.gatewayAssinaturaId).catch(() => undefined)
    Object.assign(dados, { gatewayAssinaturaId: null, gatewayAutorizacaoId: null, pixQrPayload: null, pixQrImagem: null, pixQrExpiraEm: null, formaPagamento: null })
  } else if (pagamentos && ate && a.gatewayAssinaturaId) {
    await pagamentos.alterarAssinatura(a.gatewayAssinaturaId, { proximoVencimento: ate })
    dados.proximoVencimento = paraDia(ate)
  }
  if (ate) {
    const depois = await plataforma.cobranca.findMany({ where: { assinanteId, tipo: 'mensalidade', situacao: 'pendente', vencimento: { gte: paraDia(ate) } } })
    for (const c of depois) {
      if (c.gatewayId && c.gateway === 'asaas' && pagamentos) await pagamentos.cancelarCobranca(c.gatewayId)
      await plataforma.cobranca.update({ where: { id: c.id }, data: { situacao: 'cancelada', linkPagamento: null } })
    }
  }
  await plataforma.cupomUso.updateMany({ where: { assinanteId, encerradoEm: null }, data: { encerradoEm: new Date() } })
  await plataforma.assinatura.update({ where: { assinanteId }, data: dados })
  const n = futuras.length
  const abonadas = n ? `; ${n === 1 ? '1 cobrança futura abonada' : `${n} cobranças futuras abonadas`}` : ''
  await registrarEvento(plataforma, assinanteId, 'cortesia', `Cortesia ${ate ? `até ${formatarDataSimples(ate)}` : 'sem prazo'} (${motivo})${abonadas}`, undefined, autor)
}
