import type { Cobranca } from '@prisma/client'
import type { FastifyInstance } from 'fastify'
import {
  FORMAS_ASSINATURA,
  FORMA_ASSINATURA_ROTULOS,
  adicionarMeses,
  MODULOS,
  MODULOS_ESSENCIAIS,
  MODULO_ROTULOS,
  formatarDataSimples,
  hojeISO,
  type AssinarInput,
  type CobrancaResumo,
  type FormaAssinatura,
  type MinhaAssinatura,
  type SituacaoAssinatura,
} from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { ErroGateway } from '../../integrations/pagamentos'
import { alterarAssinatura, diaISO, paraDia, planoPorCodigo, resumirAssinatura } from '../../plataforma/assinaturas'
import { recalcularAssinatura, salvarCobranca } from '../../plataforma/cobrancas'

const ABERTAS = ['pendente', 'vencida']

function resumoCobranca(c: Cobranca): CobrancaResumo {
  const aberta = ABERTAS.includes(c.situacao)
  return {
    id: c.id,
    valor: c.valor.toFixed(2),
    vencimento: diaISO(c.vencimento) as string,
    situacao: c.situacao as CobrancaResumo['situacao'],
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
      const aberta = [...cobrancas].reverse().find((c) => ABERTAS.includes(c.situacao))
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
        cobrancas: cobrancas.map(resumoCobranca),
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

    async trocarPlano(codigo: string, email: string) {
      const { empresa, a } = await carregar()
      const plano = await planoPorCodigo(plataforma, codigo).catch(() => {
        throw AppError.regraNegocio('Plano indisponível.')
      })
      if (plano.id === a.planoId) throw AppError.regraNegocio('Este já é o seu plano.')
      if (a.gatewayAutorizacaoId && !a.gatewayAssinaturaId) throw AppError.regraNegocio('Conclua a autorização do PIX Automático antes de trocar de plano (ou gere um QR Code novo).')
      if (!a.gatewayAssinaturaId && a.situacao !== 'teste') throw AppError.regraNegocio('Para trocar de plano, fale com o suporte.')
      await limiteNoPlano(plano.limiteUsuarios, plano.nome)
      // As cobranças em aberto acompanham o valor novo
      if (a.gatewayAssinaturaId) await noGateway(() => gateway().alterarAssinatura(a.gatewayAssinaturaId as string, { valor: plano.valorMensal.toFixed(2) }))
      await alterarAssinatura(plataforma, empresa.id, { planoId: plano.id }, { tipo: 'plano', descricao: `Plano trocado de ${a.plano.nome} para ${plano.nome}`, autor: email })
      if (a.gatewayAssinaturaId) await sincronizar(empresa.id, a.gatewayAssinaturaId)
      app.empresas.esquecer()
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
