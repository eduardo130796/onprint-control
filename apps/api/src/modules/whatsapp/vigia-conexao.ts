import type { FastifyInstance } from 'fastify'
import type { EstadoConexaoWhatsapp } from '@onprint/shared'
import { contextoEmpresa } from '../../core/contexto-empresa'
import { instanciaDaEmpresa, type ProvedorWhatsapp } from '../../integrations/whatsapp'
import { obterConfigWhatsapp } from './avisos'

/**
 * Vigia da conexão: a tela e os envios confiavam no último estado guardado, e uma sessão que caiu sem avisar (outro
 * aparelho, celular sem internet por dias, conexão fechada na Evolution) seguia "conectada" para sempre — nada chegava
 * nem saía. De tempos em tempos a conexão de cada empresa "conectada" é conferida na Evolution; fechada de verdade
 * (duas conferências seguidas) vira "desconectado" e os administradores recebem o aviso para ler o QR de novo.
 */

/** De quanto em quanto tempo confere */
export const CICLO_VIGIA_MS = 5 * 60_000
/** Conferências seguidas com a conexão fechada até marcar como desconectado (~10 min) */
export const QUEDAS_FECHADA = 2
/** "Reconectando" pode voltar sozinho: espera mais (~15 min) */
export const QUEDAS_RECONECTANDO = 3

/** Depois de uma conferência: quantas falhas seguidas e se é hora de marcar como desconectado */
export function proximaConferencia(falhasSeguidas: number, estado: EstadoConexaoWhatsapp): { falhas: number; derrubar: boolean } {
  if (estado === 'conectado') return { falhas: 0, derrubar: false }
  const falhas = falhasSeguidas + 1
  return { falhas, derrubar: falhas >= (estado === 'conectando' ? QUEDAS_RECONECTANDO : QUEDAS_FECHADA) }
}

export function criarVigiaConexao(app: FastifyInstance, provedor: ProvedorWhatsapp, marcarDesconectado: (configId: string, estavaConectado: boolean) => Promise<void>) {
  const falhas = new Map<string, number>()
  let rodando = false

  async function conferir() {
    if (rodando || provedor.simulado) return
    rodando = true
    try {
      for (const empresa of await app.empresas.listar()) {
        try {
          await contextoEmpresa.com(empresa, async () => {
            const config = await obterConfigWhatsapp(app.prisma)
            if (!config.conectado) return void falhas.delete(empresa.id)
            let estado: EstadoConexaoWhatsapp
            try {
              estado = (await provedor.estado(instanciaDaEmpresa(empresa.id))).estado
            } catch (erro) {
              // Evolution fora do ar ou lenta: é problema do servidor, não do celular; não conta como queda
              return void app.log.warn({ err: erro, empresa: empresa.slug }, 'Vigia do WhatsApp: não foi possível conferir a conexão')
            }
            const r = proximaConferencia(falhas.get(empresa.id) ?? 0, estado)
            if (!r.derrubar) return void (r.falhas ? falhas.set(empresa.id, r.falhas) : falhas.delete(empresa.id))
            falhas.delete(empresa.id)
            app.log.warn({ empresa: empresa.slug, estado }, 'Vigia do WhatsApp: a conexão caiu sem avisar; marcada como desconectada')
            await marcarDesconectado(config.id, true)
          })
        } catch (erro) {
          app.log.warn({ err: erro, empresa: empresa.slug }, 'Vigia do WhatsApp: falhou nesta empresa')
        }
      }
    } catch (erro) {
      app.log.warn({ err: erro }, 'Vigia do WhatsApp: não foi possível listar as empresas')
    } finally {
      rodando = false
    }
  }

  return { conferir }
}
