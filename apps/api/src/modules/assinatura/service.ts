import type { Cobranca } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  FORMAS_ASSINATURA,
  FORMA_ASSINATURA_ROTULOS,
  adicionarDias,
  adicionarMeses,
  MODULOS,
  MODULOS_ESSENCIAIS,
  MODULO_ROTULOS,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
  calcularTrocaPlano,
  type AssinarInput,
  type PreviaTrocaPlano,
  type CobrancaResumo,
  type FormaAssinatura,
  type MinhaAssinatura,
  type SituacaoAssinatura,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { ErroGateway } from '../../integrations/pagamentos'
import { alterarAssinatura, diaISO, paraDia, planoPorCodigo, resumirAssinatura } from '../../plataforma/assinaturas'
import { inicioPeriodoAtual, reajustarCobrancasFuturas, recalcularAssinatura, salvarCobranca, vencimentoQueConta } from '../../plataforma/cobrancas'

const ABERTAS = ['pendente', 'vencida']

/** Para a tela: vencimento que conta (o original, se foi reajustada) e "vencida" se ele já passou. */
export function resumoCobranca(c: Cobranca, hoje = hojeISO()): CobrancaResumo {
  const aberta = ABERTAS.includes(c.situacao)
  const vencimento = vencimentoQueConta(c)
  return {
    id: c.id,
    tipo: c.tipo as CobrancaResumo['tipo'],
    descricao: c.descricao,
    valor: c.valor.toFixed(2),
    vencimento,
    situacao: (aberta && vencimento < hoje ? 'vencida' : c.situacao) as CobrancaResumo['situacao'],
    forma: c.forma,
    pagoEm: c.pagoEm?.toISOString() ?? null,
    linkPagamento: aberta ? c.linkPagamento : null,
    falha: aberta ? c.falha : null,
    notaFiscal: c.nfSituacao ? { situacao: c.nfSituacao, numero: c.nfNumero, linkPdf: c.nfLinkPdf } : null,
  }
}

/** Erro do gateway vira mensagem para o usuário (422), sem derrubar a tela. */
async function noGateway<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (erro) {
    if (erro instanceof ErroGateway) throw AppError.regraNegocio(erro.message)
    throw erro
  }
}

/** A assinatura da própria empresa: consulta (qualquer usuário) e gestão (administrador). */
export function criarAssinaturaService(app: FastifyInstance) {
  const { plataforma } = app

  async function carregar() {
    const empresa = contextoEmpresa.exigir()
    const a = await plataforma.assinatura.findUnique({ where: { assinanteId: empresa.id }, include: { plano: true } })
    if (!a) throw AppError.naoEncontrado('Esta empresa ainda não tem assinatura.')
    return { empresa, a }
  }

  function gateway() {
    if (!app.pagamentos) throw AppError.regraNegocio('O pagamento online ainda não está disponível. Fale com o suporte.')
    return app.pagamentos
  }

  /** Traz do gateway as cobranças da assinatura e recalcula a situação na hora. */
  async function sincronizar(assinanteId: string, gatewayAssinaturaId: string) {
    for (const c of await gateway().cobrancasDaAssinatura(gatewayAssinaturaId)) await salvarCobranca(plataforma, assinanteId, c)
    await recalcularAssinatura(plataforma, assinanteId)
    app.empresas.esquecer()
  }

  /**
   * PIX Automático: cria a autorização com o QR Code da 1ª mensalidade (paga agora, registra o consentimento).
   * As próximas são debitadas todo mês a partir de um mês depois; o Asaas cria a assinatura quando o banco autoriza.
   */
  async function autorizarPix(
    assinanteId: string,
    clienteId: string,
    plano: { nome: string; valorMensal: { toFixed(n: number): string } },
    nomeEmpresa: string,
    dados: Parameters<typeof alterarAssinatura>[2],
    autor: string,
  ) {
    const inicio = adicionarMeses(hojeISO(), 1)
    const aut = await noGateway(() =>
      gateway().criarAutorizacaoPix({
        clienteId,
        valor: plano.valorMensal.toFixed(2),
        inicio,
        descricao: `ONPrint ${plano.nome}`,
        contrato: `ONP-${assinanteId.slice(0, 8)}-${Date.now().toString(36)}`,
      }),
    )
    await alterarAssinatura(
      plataforma,
      assinanteId,
      { ...dados, gateway: 'asaas', gatewayAutorizacaoId: aut.id, pixQrPayload: aut.copiaECola, pixQrImagem: aut.imagem, pixQrExpiraEm: aut.expiraEm },
      { tipo: 'assinatura_online', descricao: `PIX Automático solicitado (plano ${plano.nome} de ${nomeEmpresa}); próximas mensalidades a partir de ${formatarDataSimples(inicio)}`, autor },
    )
    app.empresas.esquecer()
  }

  async function planoTroca(codigo: string) {
    return planoPorCodigo(plataforma, codigo).catch(() => {
      throw AppError.regraNegocio('Plano indisponível.')
    })
  }

  /** Prévia da troca: compara com o plano em vigor, no período em curso (se houver). */
  async function previa(a: { assinanteId: string; plano: { valorMensal: { toFixed(n: number): string } } }, plano: { codigo: string; nome: string; valorMensal: { toFixed(n: number): string } }, hoje = hojeISO()): Promise<PreviaTrocaPlano> {
    const inicio = await inicioPeriodoAtual(plataforma, a.assinanteId, hoje)
    const r = calcularTrocaPlano({ valorAtual: a.plano.valorMensal.toFixed(2), valorNovo: plano.valorMensal.toFixed(2), inicioPeriodo: inicio, hoje })
    return { ...r, plano: { codigo: plano.codigo, nome: plano.nome, valorMensal: plano.valorMensal.toFixed(2) } }
  }

  /** Diferença proporcional do upgrade: cobrança avulsa (no gateway, ou lançada no modo manual), vencendo hoje. */
  async function cobrarProporcional(assinanteId: string, clienteId: string | null, valor: string, descricao: string, hoje: string) {
    if (app.pagamentos && clienteId) {
      const c = await noGateway(() => gateway().criarCobranca({ clienteId, valor, vencimento: hoje, descricao, referencia: assinanteId }))
      await salvarCobranca(plataforma, assinanteId, c)
      await plataforma.cobranca.update({ where: { gatewayId: c.gatewayId }, data: { tipo: 'proporcional', descricao } })
    } else {
      await plataforma.cobranca.create({ data: { assinanteId, gateway: 'manual', valor, vencimento: paraDia(hoje), tipo: 'proporcional', descricao } })
    }
  }

  async function limiteNoPlano(limite: number | null, nome: string) {
    if (limite == null) return
    const ativos = await app.prisma.usuario.count({ where: { ativo: true } })
    if (ativos > limite) throw AppError.regraNegocio(`O plano ${nome} permite até ${limite} usuários ativos e a empresa tem ${ativos}. Desative alguns antes de trocar.`)
  }

  return {
    async obter(podeGerenciar: boolean): Promise<MinhaAssinatura> {
      const { a } = await carregar()
      const [planos, usuariosAtivos, cobrancas, config] = await Promise.all([
        plataforma.plano.findMany({ where: { ativo: true, publico: true }, orderBy: { ordem: 'asc' } }),
        app.prisma.usuario.count({ where: { ativo: true } }),
        plataforma.cobranca.findMany({ where: { assinanteId: a.assinanteId }, orderBy: { vencimento: 'desc' }, take: 24 }),
        app.prisma.empresaConfig.findFirst({ select: { cnpj: true } }),
      ])
      const resumo = resumirAssinatura(a, hojeISO())
      // Em aberto pela data que conta (o vencimento original, se a cobrança ganhou data nova no gateway)
      const abertas = cobrancas.filter((c) => ABERTAS.includes(c.situacao)).sort((x, y) => vencimentoQueConta(x).localeCompare(vencimentoQueConta(y)))
      const aberta = abertas[0]
      const agendado = a.planoAgendadoId ? planos.find((p) => p.id === a.planoAgendadoId) ?? (await plataforma.plano.findUnique({ where: { id: a.planoAgendadoId } })) : null
      return {
        situacao: a.situacao as SituacaoAssinatura,
        plano: {
          codigo: a.plano.codigo,
          nome: a.plano.nome,
          descricao: a.plano.descricao,
          valorMensal: a.plano.valorMensal.toFixed(2),
          limiteUsuarios: a.plano.limiteUsuarios,
          diasTeste: a.plano.diasTeste,
          diasAteSomenteLeitura: a.plano.diasAteSomenteLeitura,
          diasAteBloqueio: a.plano.diasAteBloqueio,
        },
        acesso: resumo.acesso,
        testeAte: diaISO(a.testeAte),
        proximoVencimento: diaISO(a.proximoVencimento),
        atrasoDesde: diaISO(a.atrasoDesde),
        liberadoAte: diaISO(a.liberadoAte),
        usuariosAtivos,
        modulos: MODULOS.filter((m) => !MODULOS_ESSENCIAIS.includes(m)).map((m) => ({
          codigo: m,
          rotulo: MODULO_ROTULOS[m],
          incluido: resumo.modulos.includes(m),
          planos: planos.filter((p) => p.modulos.includes(m)).map((p) => p.nome),
        })),
        planos: planos.map((p) => ({ codigo: p.codigo, nome: p.nome, descricao: p.descricao, valorMensal: p.valorMensal.toFixed(2), limiteUsuarios: p.limiteUsuarios, atual: p.id === a.planoId, modulos: p.modulos })),
        suporte: app.config.SUPORTE_CONTATO,
        pagamentoOnline: Boolean(app.pagamentos),
        podeGerenciar,
        assinadaOnline: Boolean(a.gatewayAssinaturaId || a.gatewayAutorizacaoId),
        formaPagamento: (a.formaPagamento as FormaAssinatura | null) ?? null,
        formasDisponiveis: FORMAS_ASSINATURA.filter((f) => f !== 'pix_automatico' || app.config.ASAAS_PIX_AUTOMATICO),
        pixAutomatico: a.pixQrPayload ? { copiaECola: a.pixQrPayload, imagem: a.pixQrImagem, expiraEm: a.pixQrExpiraEm?.toISOString() ?? null } : null,
        cancelarEm: diaISO(a.cancelarEm),
        documentoSugerido: a.documentoCobranca ?? config?.cnpj ?? null,
        cobrancaAberta: aberta ? resumoCobranca(aberta) : null,
        // A pagar agora: vencidas, diferenças proporcionais e mensalidades dos próximos 7 dias (as distantes são "próxima cobrança")
        cobrancasAbertas: abertas.filter((c) => c.tipo === 'proporcional' || vencimentoQueConta(c) <= adicionarDias(hojeISO(), 7)).map((c) => resumoCobranca(c)),
        planoAgendado: agendado && a.planoAgendadoEm ? { nome: agendado.nome, valorMensal: agendado.valorMensal.toFixed(2), em: diaISO(a.planoAgendadoEm) as string } : null,
        cobrancas: cobrancas.map((c) => resumoCobranca(c)),
      }
    },

    /**
     * Assina pelo pagamento online: cliente e assinatura no gateway, NFS-e automática e a primeira cobrança.
     * No teste grátis, a primeira cobrança vence no fim do teste (o cliente não perde dias).
     */
    async assinar(dados: AssinarInput & { cpfCnpj: string }, email: string) {
      const g = gateway()
      const { empresa, a } = await carregar()
      if (a.gatewayAssinaturaId || a.gatewayAutorizacaoId) throw AppError.conflito('A assinatura já está no pagamento online. Use "Trocar plano" ou "Forma de pagamento".')
      const plano = await planoPorCodigo(plataforma, dados.plano).catch(() => {
        throw AppError.regraNegocio('Plano indisponível.')
      })
      await limiteNoPlano(plano.limiteUsuarios, plano.nome)
      const config = await app.prisma.empresaConfig.findFirst({ select: { razaoSocial: true, nomeFantasia: true, telefone: true } })
      const hoje = hojeISO()
      const fimTeste = diaISO(a.testeAte)
      const primeiroVencimento = a.situacao === 'teste' && fimTeste && fimTeste > hoje ? fimTeste : hoje

      let clienteId = a.gatewayClienteId
      if (!clienteId) {
        clienteId = await noGateway(() =>
          g.criarCliente({ nome: config?.razaoSocial || empresa.nome, email, cpfCnpj: dados.cpfCnpj, telefone: config?.telefone, referencia: empresa.id }),
        )
        // Guarda já: se a criação da assinatura falhar, a nova tentativa reaproveita o cliente
        await plataforma.assinatura.update({ where: { assinanteId: empresa.id }, data: { gateway: 'asaas', gatewayClienteId: clienteId, documentoCobranca: dados.cpfCnpj } })
      }
      if (dados.forma === 'pix_automatico' && !app.config.ASAAS_PIX_AUTOMATICO) throw AppError.regraNegocio('O PIX Automático ainda não está disponível. Escolha cartão ou PIX/boleto.')
      if (dados.forma === 'pix_automatico') {
        await autorizarPix(empresa.id, clienteId, plano, config?.nomeFantasia || empresa.nome, { formaPagamento: 'pix_automatico', documentoCobranca: dados.cpfCnpj, planoId: plano.id, cancelarEm: null }, email)
        return { linkPagamento: null }
      }
      const gatewayAssinaturaId = await noGateway(() =>
        g.criarAssinatura({
          clienteId,
          valor: plano.valorMensal.toFixed(2),
          proximoVencimento: primeiroVencimento,
          forma: dados.forma,
          descricao: `ONPrint Control - plano ${plano.nome} (${config?.nomeFantasia || empresa.nome})`,
          referencia: empresa.id,
        }),
      )
      await alterarAssinatura(
        plataforma,
        empresa.id,
        { gateway: 'asaas', gatewayAssinaturaId, formaPagamento: dados.forma, documentoCobranca: dados.cpfCnpj, planoId: plano.id, cancelarEm: null },
        { tipo: 'assinatura_online', descricao: `Assinou o plano ${plano.nome} (${FORMA_ASSINATURA_ROTULOS[dados.forma]}); 1º vencimento ${formatarDataSimples(primeiroVencimento)}`, autor: email },
      )
      // Nota fiscal: uma falha aqui não impede a assinatura (fica no histórico para o suporte resolver)
      await g.configurarNotaFiscal(gatewayAssinaturaId).catch(async (erro: Error) => {
        app.log.error({ err: erro, empresa: empresa.slug }, 'Falha ao configurar a NFS-e da assinatura')
        await plataforma.eventoAssinatura.create({ data: { assinanteId: empresa.id, tipo: 'nota_fiscal_erro', descricao: `Configuração da nota fiscal falhou: ${erro.message}` } })
      })
      await sincronizar(empresa.id, gatewayAssinaturaId)
      const primeira = await plataforma.cobranca.findFirst({ where: { assinanteId: empresa.id, situacao: { in: ABERTAS } }, orderBy: { vencimento: 'asc' } })
      return { linkPagamento: primeira?.linkPagamento ?? null }
    },

    /** O que acontece se trocar para este plano (a tela mostra antes de confirmar). */
    async previaTroca(codigo: string): Promise<PreviaTrocaPlano> {
      const { a } = await carregar()
      return previa(a, await planoTroca(codigo))
    },

    /**
     * Troca de plano (regras do usuário): vencidas e a mensalidade do período em curso não mudam de valor;
     * upgrade vale na hora e cobra a diferença proporcional aos dias que faltam; downgrade vale na próxima
     * renovação (o plano maior já pago segue até lá). Escolher de novo o plano atual desfaz um downgrade agendado.
     */
    async trocarPlano(codigo: string, email: string) {
      const { empresa, a } = await carregar()
      const plano = await planoTroca(codigo)
      const hoje = hojeISO()
      if (plano.id === a.planoId) {
        if (!a.planoAgendadoId) throw AppError.regraNegocio('Este já é o seu plano.')
        if (a.gatewayAssinaturaId) await noGateway(() => gateway().alterarAssinatura(a.gatewayAssinaturaId as string, { valor: plano.valorMensal.toFixed(2) }))
        await alterarAssinatura(plataforma, empresa.id, { planoAgendadoId: null, planoAgendadoEm: null }, { tipo: 'plano', descricao: `Troca de plano agendada desfeita: continua no ${plano.nome}`, autor: email })
        await reajustarCobrancasFuturas(plataforma, app.pagamentos, empresa.id, plano.valorMensal.toFixed(2), hoje)
        return previa(a, plano)
      }
      if (a.planoAgendadoId === plano.id) throw AppError.regraNegocio('A troca para este plano já está agendada.')
      if (a.formaPagamento === 'pix_automatico') {
        throw AppError.regraNegocio('No PIX Automático o valor fica na autorização do seu banco: para trocar de plano, cancele a assinatura e assine de novo no plano novo.')
      }
      if (!a.gatewayAssinaturaId && a.situacao !== 'teste') throw AppError.regraNegocio('Para trocar de plano, fale com o suporte.')
      await limiteNoPlano(plano.limiteUsuarios, plano.nome)
      const p = await previa(a, plano, hoje)
      const valor = plano.valorMensal.toFixed(2)
      // Próximas cobranças que o gateway gerar já saem no valor novo
      if (a.gatewayAssinaturaId) await noGateway(() => gateway().alterarAssinatura(a.gatewayAssinaturaId as string, { valor }))

      if (p.tipo === 'downgrade') {
        await alterarAssinatura(
          plataforma,
          empresa.id,
          { planoAgendadoId: plano.id, planoAgendadoEm: paraDia(p.valeA) },
          { tipo: 'plano_agendado', descricao: `Troca para o ${plano.nome} agendada para ${formatarDataSimples(p.valeA)} (o ${a.plano.nome}, já pago, vale até lá)`, autor: email },
        )
      } else {
        const proporcional = p.valorProporcional ? `; diferença proporcional de ${formatarMoeda(p.valorProporcional)} (${p.diasRestantes} de ${p.diasPeriodo} dias)` : ''
        await alterarAssinatura(
          plataforma,
          empresa.id,
          { planoId: plano.id, planoAgendadoId: null, planoAgendadoEm: null },
          { tipo: 'plano', descricao: `Plano trocado de ${a.plano.nome} para ${plano.nome}${proporcional}`, autor: email },
        )
        if (p.valorProporcional && p.periodo) {
          await cobrarProporcional(empresa.id, a.gatewayClienteId, p.valorProporcional, `Diferença proporcional ${a.plano.nome} → ${plano.nome} (${p.diasRestantes} de ${p.diasPeriodo} dias, até ${formatarDataSimples(p.periodo.fim)})`, hoje)
        }
      }
      // Só mensalidades de períodos que ainda não começaram vão para o valor novo
      await reajustarCobrancasFuturas(plataforma, app.pagamentos, empresa.id, valor, hoje)
      if (a.gatewayAssinaturaId) await sincronizar(empresa.id, a.gatewayAssinaturaId)
      await recalcularAssinatura(plataforma, empresa.id)
      app.empresas.esquecer()
      return p
    },

    async trocarForma(forma: FormaAssinatura, email: string) {
      const { empresa, a } = await carregar()
      if (!a.gatewayAssinaturaId) throw AppError.regraNegocio('Assine pelo pagamento online primeiro.')
      if (a.formaPagamento === forma) throw AppError.regraNegocio('Esta já é a forma de pagamento.')
      if (forma === 'pix_automatico' || a.formaPagamento === 'pix_automatico') {
        throw AppError.regraNegocio('O PIX Automático é uma autorização no seu banco: para entrar ou sair dele, cancele a assinatura atual e assine de novo escolhendo a forma.')
      }
      await noGateway(() => gateway().alterarAssinatura(a.gatewayAssinaturaId as string, { forma }))
      await alterarAssinatura(plataforma, empresa.id, { formaPagamento: forma }, { tipo: 'forma_pagamento', descricao: `Forma de pagamento: ${FORMA_ASSINATURA_ROTULOS[forma]}`, autor: email })
      await sincronizar(empresa.id, a.gatewayAssinaturaId)
    },

    /** PIX Automático: o QR Code expirou ou foi perdido — encerra a autorização pendente e gera outra. */
    async novoQrPix(email: string) {
      const { empresa, a } = await carregar()
      if (!a.gatewayAutorizacaoId || a.gatewayAssinaturaId || !a.gatewayClienteId) throw AppError.regraNegocio('Não há autorização do PIX Automático aguardando.')
      await gateway()
        .cancelarAutorizacaoPix(a.gatewayAutorizacaoId)
        .catch(() => undefined) // já expirada ou cancelada no Asaas: segue
      const config = await app.prisma.empresaConfig.findFirst({ select: { nomeFantasia: true } })
      await autorizarPix(empresa.id, a.gatewayClienteId, a.plano, config?.nomeFantasia || empresa.nome, {}, email)
    },

    /**
     * Cancela a recorrência no gateway. O acesso segue até o próximo vencimento (o período já pago);
     * no teste grátis, até o fim do teste. Para voltar, basta assinar de novo.
     */
    async cancelar(email: string) {
      const { empresa, a } = await carregar()
      if (a.situacao === 'cancelada' || a.cancelarEm) throw AppError.regraNegocio('A assinatura já está cancelada.')
      // PIX Automático: encerrar a autorização no banco é o que para os débitos; a assinatura ligada a ela
      // é removida em seguida (se o Asaas já a tiver encerrado junto, a falha é ignorada)
      if (a.gatewayAutorizacaoId) await noGateway(() => gateway().cancelarAutorizacaoPix(a.gatewayAutorizacaoId as string))
      if (a.gatewayAssinaturaId) {
        const cancelar = gateway().cancelarAssinatura(a.gatewayAssinaturaId)
        if (a.gatewayAutorizacaoId) await cancelar.catch(() => undefined)
        else await noGateway(() => cancelar)
      }
      const hoje = hojeISO()
      const ate = a.situacao === 'teste' ? diaISO(a.testeAte) : diaISO(a.proximoVencimento)
      const cancelarEm = ate && ate > hoje ? ate : hoje
      await plataforma.cobranca.updateMany({ where: { assinanteId: empresa.id, situacao: { in: ABERTAS } }, data: { situacao: 'cancelada' } })
      await alterarAssinatura(
        plataforma,
        empresa.id,
        { gatewayAssinaturaId: null, gatewayAutorizacaoId: null, pixQrPayload: null, pixQrImagem: null, pixQrExpiraEm: null, cancelarEm: paraDia(cancelarEm) },
        { tipo: 'cancelamento', descricao: `Cancelamento pedido; acesso até ${formatarDataSimples(cancelarEm)}`, autor: email },
      )
      await recalcularAssinatura(plataforma, empresa.id)
      app.empresas.esquecer()
      return { cancelarEm }
    },
  }
}
