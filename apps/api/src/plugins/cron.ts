import fp from 'fastify-plugin'
import cron from 'node-cron'
import { contextoEmpresa } from '../core/contexto-empresa'
import { avisosDoDia } from '../jobs/avisos-do-dia'
import { expirarOrcamentos } from '../jobs/expirar-orcamentos'
import { marcarContasVencidas } from '../jobs/marcar-vencidas'

/**
 * Tarefas agendadas (node-cron, fuso America/Sao_Paulo). Seção 10:
 * 00:05 expira orçamentos vencidos; 00:10 marca contas vencidas;
 * 07:00 avisa estoque baixo, contas do dia e entregas do dia.
 * Cada tarefa roda empresa por empresa; a falha em uma não impede as outras.
 */
export const cronPlugin = fp(async (app) => {
  if (app.config.NODE_ENV === 'test') return

  async function executar(nome: string, tarefa: () => Promise<number>) {
    let empresas
    try {
      empresas = await app.empresas.listar()
    } catch (erro) {
      return app.log.error({ err: erro, job: nome }, 'Tarefa agendada falhou ao listar as empresas')
    }
    for (const empresa of empresas) {
      try {
        const afetados = await contextoEmpresa.com(empresa, tarefa)
        if (afetados) app.log.info({ job: nome, empresa: empresa.slug, afetados }, 'Tarefa agendada concluída')
      } catch (erro) {
        app.log.error({ err: erro, job: nome, empresa: empresa.slug }, 'Tarefa agendada falhou')
      }
    }
  }

  const tarefas = [
    cron.schedule('5 0 * * *', () => executar('expirar-orcamentos', () => expirarOrcamentos(app.prisma)), {
      timezone: 'America/Sao_Paulo',
    }),
    cron.schedule('10 0 * * *', () => executar('marcar-vencidas', () => marcarContasVencidas(app.prisma)), { timezone: 'America/Sao_Paulo' }),
    cron.schedule('0 7 * * *', () => executar('avisos-do-dia', () => avisosDoDia(app.prisma)), { timezone: 'America/Sao_Paulo' }),
  ]

  // Ao subir, recupera o que ficou para trás se a API estava desligada à meia-noite
  app.addHook('onReady', async () => {
    await executar('expirar-orcamentos (início)', () => expirarOrcamentos(app.prisma))
    await executar('marcar-vencidas (início)', () => marcarContasVencidas(app.prisma))
  })
  app.addHook('onClose', async () => {
    for (const t of tarefas) await t.stop()
  })
})
