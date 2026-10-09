import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { z } from 'zod'
import { CODIGOS_ERRO, cadastroPublicoSchema, codigoCupom, formatarDataSimples, hojeISO } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { emailBoasVindas } from '../../integrations/email/modelos'
import { diaISO } from '../../plataforma/assinaturas'
import { aplicarCupom, descricaoCupom, validarCupom } from '../../plataforma/beneficios'
import { provisionarEmpresa } from '../../plataforma/provisionar'

/** Sem login: planos à venda e o cadastro com teste grátis ("Criar conta"). */
export const cadastroRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get('/planos-publicos', { schema: { tags: ['plataforma'], summary: 'Planos à venda (página de cadastro)' } }, async () => {
    const planos = await app.plataforma.plano.findMany({ where: { ativo: true, publico: true }, orderBy: { ordem: 'asc' } })
    return {
      cadastroAberto: app.config.CADASTRO_PUBLICO,
      planoPadrao: app.config.PLANO_PADRAO,
      planos: planos.map((p) => ({ codigo: p.codigo, nome: p.nome, descricao: p.descricao, valorMensal: p.valorMensal.toFixed(2), limiteUsuarios: p.limiteUsuarios, diasTeste: p.diasTeste, modulos: p.modulos })),
    }
  })

  // Confere o cupom digitado no cadastro (mostra o desconto antes de criar a conta).
  // Poucas consultas por IP e mensagem única: não serve para descobrir quais códigos existem
  app.get(
    '/cupons/validar',
    {
      config: { rateLimit: { max: 10, timeWindow: '10 minutes' } },
      schema: { tags: ['plataforma'], summary: 'Confere um cupom (cadastro)', querystring: z.object({ codigo: codigoCupom, plano: z.string().max(40).optional() }) },
    },
    async (request) => {
      if (!request.query.codigo) throw AppError.regraNegocio('Informe o cupom.')
      const c = await validarCupom(app.plataforma, request.query.codigo, request.query.plano ?? null, hojeISO(), { publico: true }).catch((erro: Error) => {
        throw AppError.regraNegocio(erro.message)
      })
      return { codigo: c.codigo, descricao: c.descricao || descricaoCupom(c), tipo: c.tipo, valor: c.valor.toFixed(2), duracaoMeses: c.duracaoMeses, planos: c.planos }
    },
  )

  app.post(
    '/cadastro',
    {
      // Criar empresa custa (schema + migrations): poucos cadastros por IP
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: { tags: ['plataforma'], summary: 'Cria a empresa em teste grátis com o primeiro administrador', body: cadastroPublicoSchema },
    },
    async (request, reply) => {
      if (!app.config.CADASTRO_PUBLICO) throw AppError.semPermissao('O cadastro pela internet está fechado. Fale com o suporte.')
      // Teto geral por hora (além do limite por IP): cadastro em massa de vários IPs não esgota o servidor
      const ultimaHora = await app.plataforma.eventoAssinatura.count({ where: { tipo: 'cadastro', createdAt: { gte: new Date(Date.now() - 3_600_000) } } })
      if (ultimaHora >= app.config.CADASTROS_POR_HORA) {
        request.log.warn({ ultimaHora }, 'Teto de cadastros por hora atingido')
        throw new AppError(429, CODIGOS_ERRO.MUITAS_TENTATIVAS, 'Muitos cadastros neste momento. Tente de novo em alguns minutos ou fale com o suporte.')
      }
      const d = request.body
      const codigoPlano = d.plano || app.config.PLANO_PADRAO
      const plano = await app.plataforma.plano.findUnique({ where: { codigo: codigoPlano } })
      if (!plano?.ativo || !plano.publico) throw AppError.regraNegocio('Plano indisponível.')
      if (d.cupom) {
        await validarCupom(app.plataforma, d.cupom, codigoPlano, hojeISO(), { publico: true }).catch((erro: Error) => {
          throw AppError.regraNegocio(erro.message, { campo: 'cupom' })
        })
      }
      const assinante = await provisionarEmpresa(
        { plataforma: app.plataforma, databaseUrl: app.config.DATABASE_URL, clienteDe: app.empresas.clienteDe },
        // A pessoa escolheu a própria senha: não precisa trocar no primeiro login
        { nome: d.empresa, plano: codigoPlano, situacao: 'teste', admin: { nome: d.nome, email: d.email, senha: d.senha, deveTrocarSenha: false } },
      )
      // Contato informado no cadastro já aparece nos dados da empresa (orçamentos, documentos)
      if (d.telefone) await app.empresas.clienteDe(assinante.schema).empresaConfig.updateMany({ data: { telefone: d.telefone, whatsapp: d.telefone, email: d.email } })
      // Cupom guardado: o desconto começa na 1ª mensalidade, quando assinar
      if (d.cupom) await aplicarCupom({ plataforma: app.plataforma, pagamentos: app.pagamentos }, assinante.id, d.cupom, d.email).catch((erro: Error) => app.log.warn({ err: erro }, 'Cupom do cadastro não aplicado'))
      const assinatura = await app.plataforma.assinatura.findUnique({ where: { assinanteId: assinante.id } })
      const testeAte = diaISO(assinatura?.testeAte)
      await app.plataforma.eventoAssinatura.create({ data: { assinanteId: assinante.id, tipo: 'cadastro', descricao: `Cadastro pela internet (${d.nome}, ${d.email})`, autor: d.email } })
      void app.email.enviar(d.email, emailBoasVindas({ nome: d.nome, empresa: d.empresa, email: d.email, link: `${app.config.APP_URL}/login`, testeAte: testeAte ? formatarDataSimples(testeAte) : null }))
      app.empresas.esquecer()
      return reply.status(201).send({ slug: assinante.slug, testeAte })
    },
  )
}
