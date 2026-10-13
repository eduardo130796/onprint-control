import fp from 'fastify-plugin'
import { criarProvedorWhatsapp, type ProvedorWhatsapp } from '../integrations/whatsapp'
import { criarAvisosWhatsapp, type AvisosWhatsapp } from '../modules/whatsapp/avisos'
import { CICLO_ENVIO_MS, criarEnvioWhatsapp } from '../modules/whatsapp/envio'

declare module 'fastify' {
  interface FastifyInstance {
    whatsapp: AvisosWhatsapp & {
      provedor: ProvedorWhatsapp
      /** Empresa com aviso na fila (reenviar) */
      marcarFila: (empresaId: string) => void
    }
  }
}

/**
 * Avisos do pedido pelo WhatsApp da gráfica: os services chamam `app.whatsapp.avisar(...)` depois do commit
 * e o envio roda em segundo plano (fora dos testes automatizados).
 */
export const whatsappPlugin = fp(async (app) => {
  const provedor = criarProvedorWhatsapp(app.config, app.log)
  if (provedor.simulado) app.log.info('WhatsApp em modo de teste (WHATSAPP_PROVEDOR=log): os avisos vão só para o log.')
  const envio = criarEnvioWhatsapp(app, provedor)
  app.decorate('whatsapp', { ...criarAvisosWhatsapp(app, envio.marcarFila), provedor, marcarFila: envio.marcarFila })

  if (app.config.NODE_ENV === 'test') return
  let timer: NodeJS.Timeout | undefined
  app.addHook('onReady', async () => {
    // Em segundo plano: com muitas empresas a leitura das filas passaria do tempo de subida
    void envio.recuperarFilas().then(() => {
      timer = setInterval(() => void envio.ciclo(), CICLO_ENVIO_MS)
      timer.unref()
    })
  })
  app.addHook('onClose', async () => clearInterval(timer))
})
