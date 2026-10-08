import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod'
import { cadastroPublicoSchema, formatarDataSimples } from '@onprint/shared'
import { AppError } from '../../core/AppError'
import { emailBoasVindas } from '../../integrations/email/modelos'
import { diaISO } from '../../plataforma/assinaturas'
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

  app.post(
    '/cadastro',
    {
      // Criar empresa custa (schema + migrations): poucos cadastros por IP
      config: { rateLimit: { max: 5, timeWindow: '1 hour' } },
      schema: { tags: ['plataforma'], summary: 'Cria a empresa em teste grátis com o primeiro administrador', body: cadastroPublicoSchema },
    },
    async (request, reply) => {
      if (!app.config.CADASTRO_PUBLICO) throw AppError.semPermissao('O cadastro pela internet está fechado. Fale com o suporte.')
      const d = request.body
      const codigoPlano = d.plano || app.config.PLANO_PADRAO
      const plano = await app.plataforma.plano.findUnique({ where: { codigo: codigoPlano } })
      if (!plano?.ativo || !plano.publico) throw AppError.regraNegocio('Plano indisponível.')
      const assinante = await provisionarEmpresa(
        { plataforma: app.plataforma, databaseUrl: app.config.DATABASE_URL, clienteDe: app.empresas.clienteDe },
        // A pessoa escolheu a própria senha: não precisa trocar no primeiro login
        { nome: d.empresa, plano: codigoPlano, situacao: 'teste', admin: { nome: d.nome, email: d.email, senha: d.senha, deveTrocarSenha: false } },
      )
      // Contato informado no cadastro já aparece nos dados da empresa (orçamentos, documentos)
      if (d.telefone) await app.empresas.clienteDe(assinante.schema).empresaConfig.updateMany({ data: { telefone: d.telefone, whatsapp: d.telefone, email: d.email } })
      const assinatura = await app.plataforma.assinatura.findUnique({ where: { assinanteId: assinante.id } })
      const testeAte = diaISO(assinatura?.testeAte)
      await app.plataforma.eventoAssinatura.create({ data: { assinanteId: assinante.id, tipo: 'cadastro', descricao: `Cadastro pela internet (${d.nome}, ${d.email})`, autor: d.email } })
      void app.email.enviar(d.email, emailBoasVindas({ nome: d.nome, empresa: d.empresa, email: d.email, link: `${app.config.APP_URL}/login`, testeAte: testeAte ? formatarDataSimples(testeAte) : null }))
      app.empresas.esquecer()
      return reply.status(201).send({ slug: assinante.slug, testeAte })
    },
  )
}
