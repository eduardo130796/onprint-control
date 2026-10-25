import fp from 'fastify-plugin'
import { contextoEmpresa } from '../core/contexto-empresa'
import { criarProvedorWhatsapp, instanciaDaEmpresa, type ProvedorWhatsapp } from '../integrations/whatsapp'
import { criarAvisosWhatsapp, obterConfigWhatsapp, type AvisosWhatsapp } from '../modules/whatsapp/avisos'
import { CICLO_ENVIO_MS, criarEnvioWhatsapp } from '../modules/whatsapp/envio'
import { recuperarLeiturasPresas } from '../modules/whatsapp/leituras-presas'
import { segredoDaEmpresa, segredoDoServidor, urlDoWebhook } from '../modules/whatsapp/webhook'

declare module 'fastify' {
  interface FastifyInstance {
    whatsapp: AvisosWhatsapp & {
      provedor: ProvedorWhatsapp
      /** Empresa com aviso na fila (reenviar) */
      marcarFila: (empresaId: string) => void
      /** Liga o webhook da instância da empresa (respostas do cliente e conexão). Nunca lança. */
      ligarWebhook: (empresaId: string) => Promise<boolean>
    }
  }
}

/**
 * Avisos do pedido pelo WhatsApp da gráfica: os services chamam `app.whatsapp.avisar(...)` depois do commit
 * e o envio roda em segundo plano (fora dos testes automatizados). As respostas do cliente chegam pelo webhook
 * (modules/whatsapp/webhook.routes.ts), ligado ao conectar e, ao subir a API, nas empresas já conectadas.
 */
export const whatsappPlugin = fp(async (app) => {
  const provedor = criarProvedorWhatsapp(app.config, app.log)
  if (provedor.simulado) app.log.info('WhatsApp em modo de teste (WHATSAPP_PROVEDOR=log): os avisos vão só para o log.')
  const envio = criarEnvioWhatsapp(app, provedor)
  const segredoServidor = segredoDoServidor(app.config)

  async function ligarWebhook(empresaId: string): Promise<boolean> {
    try {
      await provedor.configurarWebhook(instanciaDaEmpresa(empresaId), urlDoWebhook(app.config, segredoDaEmpresa(segredoServidor, empresaId)))
      return true
    } catch (erro) {
      app.log.warn({ err: erro, empresaId }, 'Webhook do WhatsApp não configurado (as respostas dos clientes não chegam até ligar)')
      return false
    }
  }

  app.decorate('whatsapp', { ...criarAvisosWhatsapp(app, envio.marcarFila), provedor, marcarFila: envio.marcarFila, ligarWebhook })
  app.addHook('onClose', async () => provedor.fechar?.())

  if (app.config.NODE_ENV === 'test') return
  let timer: NodeJS.Timeout | undefined

  // Respostas presas em "lendo" (a API reiniciou no meio da leitura do Assistente): avisa a equipe, empresa por empresa
  async function recuperarLeituras() {
    let empresas
    try {
      empresas = await app.empresas.listar()
    } catch (erro) {
      return app.log.warn({ err: erro }, 'Leituras presas do Assistente: não foi possível listar as empresas')
    }
    for (const empresa of empresas) {
      try {
        await contextoEmpresa.com(empresa, () => recuperarLeiturasPresas(app))
      } catch (erro) {
        app.log.warn({ err: erro, empresa: empresa.slug }, 'Leituras presas do Assistente: falhou nesta empresa')
      }
    }
  }
  let timerLeituras: NodeJS.Timeout | undefined

  app.addHook('onReady', async () => {
    void recuperarLeituras()
    timerLeituras = setInterval(() => void recuperarLeituras(), 60_000)
    timerLeituras.unref()
    // Em segundo plano: com muitas empresas a leitura das filas passaria do tempo de subida
    void envio.recuperarFilas().then(() => {
      timer = setInterval(() => void envio.ciclo(), CICLO_ENVIO_MS)
      timer.unref()
    })
    // Empresas já conectadas: o webhook aponta para o endereço/segredo atual (upsert na Evolution)
    if (!provedor.simulado) {
      void (async () => {
        for (const empresa of await app.empresas.listar()) {
          try {
            const config = await contextoEmpresa.com(empresa, () => obterConfigWhatsapp(app.prisma))
            if (config.conectado) await ligarWebhook(empresa.id)
          } catch (erro) {
            app.log.warn({ err: erro, empresa: empresa.slug }, 'Não foi possível conferir o webhook do WhatsApp')
          }
        }
      })()
    }
  })
  app.addHook('onClose', async () => {
    clearInterval(timer)
    clearInterval(timerLeituras)
  })
})
