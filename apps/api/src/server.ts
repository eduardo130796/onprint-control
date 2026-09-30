import { buildApp } from './app'
import { carregarEnv } from './config/env'

async function iniciar() {
  const config = carregarEnv()
  const app = await buildApp(config)

  const encerrar = async (sinal: string) => {
    app.log.info(`${sinal} recebido, encerrando…`)
    await app.close()
    process.exit(0)
  }
  process.on('SIGINT', () => void encerrar('SIGINT'))
  process.on('SIGTERM', () => void encerrar('SIGTERM'))

  await app.listen({ port: config.PORT, host: config.HOST })
  if (config.NODE_ENV !== 'production') {
    app.log.info(`Swagger em http://localhost:${config.PORT}/docs`)
  }
}

iniciar().catch((erro) => {
  console.error(erro)
  process.exit(1)
})
