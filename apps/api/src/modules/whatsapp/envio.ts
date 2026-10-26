import type { FastifyInstance } from 'fastify'
import { contextoEmpresa, type EmpresaAtual } from '../../core/contexto-empresa'
import { linkAcompanhamento } from '../../core/links'
import { ErroWhatsapp, instanciaDaEmpresa, type ProvedorWhatsapp } from '../../integrations/whatsapp'
import { combinarAvisos } from './agrupar'
import { anexosJson, enviarAnexos, lerAnexos, nomesDosAnexos } from './anexos-arte'
import { obterConfigWhatsapp, whatsappNoPlano } from './avisos'
import { MAX_POR_HORA, MAX_TENTATIVAS, VALIDADE_PENDENTE_MS, dentroDoHorario, esperaDaTentativa, intervaloEntreEnvios } from './regras'

/** De quanto em quanto tempo o envio olha as filas */
export const CICLO_ENVIO_MS = 10_000

/**
 * Envio dos avisos na fila, uma empresa por vez e no máximo uma mensagem por empresa a cada ciclo:
 * dentro do horário, com intervalo sorteado entre mensagens, teto por hora e novas tentativas nas falhas temporárias.
 * Só as empresas com fila são consultadas (o conjunto em memória é refeito ao subir a API).
 */
export function criarEnvioWhatsapp(app: FastifyInstance, provedor: ProvedorWhatsapp) {
  const comFila = new Set<string>()
  const proximoEnvio = new Map<string, number>()
  let rodando = false

  /** Conexão caiu: avisos ficam na fila e os administradores recebem a notificação (só na primeira vez). */
  async function marcarDesconectado(configId: string, estavaConectado: boolean) {
    if (!estavaConectado) return
    const { prisma } = app
    await prisma.whatsappConfig.update({ where: { id: configId }, data: { conectado: false, desconectadoEm: new Date() } })
    const admins = await prisma.usuario.findMany({ where: { ativo: true, papel: { codigo: 'admin' } }, select: { id: true } })
    const titulo = 'WhatsApp desconectado — leia o QR de novo'
    for (const a of admins) {
      await prisma.notificacao.create({
        data: { usuarioId: a.id, titulo, mensagem: 'Os avisos automáticos dos pedidos estão parados na fila. Abra WhatsApp e conecte de novo pelo QR code.', link: '/whatsapp' },
      })
      app.tempoReal.emitir(`usuario:${a.id}`, 'notificacao:nova', { titulo })
    }
    app.log.warn({ empresa: contextoEmpresa.atual()?.slug }, 'WhatsApp desconectado: avisos parados na fila')
  }

  /** Envia (no máximo) uma mensagem da empresa. Devolve se ainda há fila. */
  async function processarEmpresa(empresa: EmpresaAtual): Promise<boolean> {
    const { prisma } = app
    const agora = new Date()
    await prisma.mensagemWhatsapp.updateMany({
      where: { status: 'pendente', createdAt: { lt: new Date(agora.getTime() - VALIDADE_PENDENTE_MS) } },
      data: { status: 'ignorada', erro: 'Não saiu em 48 horas (WhatsApp desconectado ou pausado).' },
    })
    if ((await prisma.mensagemWhatsapp.count({ where: { status: 'pendente' } })) === 0) return false
    if (!whatsappNoPlano(empresa)) return true
    const config = await obterConfigWhatsapp(prisma)
    if (config.pausado || !dentroDoHorario(agora, config.horarioInicio, config.horarioFim)) return true
    if ((proximoEnvio.get(empresa.id) ?? 0) > agora.getTime()) return true
    // Só os avisos automáticos contam (os envios da equipe saem na hora; os agrupados foram dentro de outra mensagem)
    const naUltimaHora = await prisma.mensagemWhatsapp.count({ where: { status: 'enviada', manual: false, agrupadaComId: null, enviadaEm: { gte: new Date(agora.getTime() - 3_600_000) } } })
    if (naUltimaHora >= MAX_POR_HORA) return true

    const msg = await prisma.mensagemWhatsapp.findFirst({
      where: { status: 'pendente', OR: [{ proximaTentativaEm: null }, { proximaTentativaEm: { lte: agora } }] },
      orderBy: { createdAt: 'asc' },
      include: { cliente: { select: { receberAvisosWhatsapp: true } }, pedido: { select: { tokenPublico: true } } },
    })
    if (!msg) return true
    // O cliente pode ter pedido para não receber depois que o aviso entrou na fila
    if (msg.cliente && !msg.cliente.receberAvisosWhatsapp) {
      await prisma.mensagemWhatsapp.updateMany({
        where: { status: 'pendente', clienteId: msg.clienteId, manual: false },
        data: { status: 'ignorada', erro: 'O cliente não quer receber avisos pelo WhatsApp.' },
      })
      return true
    }
    // Outros avisos do mesmo pedido para o mesmo número na fila vão juntos, numa mensagem só
    const juntos = msg.pedidoId
      ? await prisma.mensagemWhatsapp.findMany({
          where: { status: 'pendente', manual: false, pedidoId: msg.pedidoId, telefone: msg.telefone, id: { not: msg.id } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, texto: true, anexos: true },
        })
      : []
    const acompanhamento = msg.pedido ? linkAcompanhamento(msg.pedido.tokenPublico, empresa.slug) : null
    const texto = juntos.length ? combinarAvisos([msg, ...juntos].map((m) => ({ texto: m.texto, linkDispensavel: acompanhamento }))) : msg.texto

    const instancia = instanciaDaEmpresa(empresa.id)
    try {
      if (!provedor.simulado) {
        const situacao = await provedor.estado(instancia)
        if (situacao.estado !== 'conectado') {
          await marcarDesconectado(config.id, config.conectado)
          return true
        }
        // Voltou sozinha (a Evolution reconecta depois de reiniciar)
        if (!config.conectado) await prisma.whatsappConfig.update({ where: { id: config.id }, data: { conectado: true, numero: situacao.numero ?? config.numero } })
      }
      const r = await provedor.enviarTexto(instancia, msg.telefone, texto)
      // Arquivos das artes logo depois do texto (os dos avisos juntos também, sem repetir)
      const anexos = [msg, ...juntos].flatMap((m) => lerAnexos(m.anexos)).filter((a, i, l) => l.findIndex((b) => b.arquivoId === a.arquivoId) === i)
      const avisoAnexos = anexos.length ? await enviarAnexos(app, provedor, instancia, msg.telefone, anexos) : null
      const enviadaEm = new Date()
      await prisma.$transaction([
        // O primeiro guarda o texto que saiu de fato (com os outros avisos dentro) e os arquivos que foram
        prisma.mensagemWhatsapp.update({
          where: { id: msg.id },
          data: {
            status: 'enviada',
            enviadaEm,
            texto,
            idExterno: r.id,
            tentativas: { increment: 1 },
            erro: avisoAnexos,
            proximaTentativaEm: null,
            ...(juntos.length && anexos.length ? { anexos: anexosJson(anexos), anexoNome: nomesDosAnexos(anexos) } : {}),
          },
        }),
        prisma.mensagemWhatsapp.updateMany({
          where: { id: { in: juntos.map((j) => j.id) } },
          data: { status: 'enviada', enviadaEm, idExterno: r.id, agrupadaComId: msg.id, erro: null, proximaTentativaEm: null },
        }),
      ])
    } catch (erro) {
      const e = erro instanceof ErroWhatsapp ? erro : new ErroWhatsapp('temporario', (erro as Error).message)
      if (e.tipo === 'desconectado') {
        await marcarDesconectado(config.id, config.conectado)
      } else if (e.tipo === 'numero_invalido') {
        await prisma.mensagemWhatsapp.update({ where: { id: msg.id }, data: { status: 'falhou', erro: e.message, tentativas: { increment: 1 } } })
      } else {
        const tentativas = msg.tentativas + 1
        await prisma.mensagemWhatsapp.update({
          where: { id: msg.id },
          data:
            tentativas >= MAX_TENTATIVAS
              ? { status: 'falhou', erro: e.message, tentativas }
              : { erro: e.message, tentativas, proximaTentativaEm: new Date(Date.now() + esperaDaTentativa(tentativas)) },
        })
      }
      app.log.warn({ err: e, empresa: empresa.slug, mensagem: msg.id }, 'Aviso do WhatsApp não enviado')
    }
    // No modo de teste (log) não há o que espaçar
    proximoEnvio.set(empresa.id, Date.now() + (provedor.simulado ? 1_000 : intervaloEntreEnvios()))
    return true
  }

  async function ciclo() {
    if (rodando) return
    rodando = true
    try {
      for (const id of [...comFila]) {
        const empresa = await app.empresas.porId(id)
        if (!empresa) {
          comFila.delete(id)
          continue
        }
        try {
          if (!(await contextoEmpresa.com(empresa, () => processarEmpresa(empresa)))) comFila.delete(id)
        } catch (erro) {
          app.log.error({ err: erro, empresa: empresa.slug }, 'Envio dos avisos do WhatsApp falhou')
        }
      }
    } finally {
      rodando = false
    }
  }

  /** Ao subir: empresas que ficaram com aviso na fila */
  async function recuperarFilas() {
    for (const empresa of await app.empresas.listar()) {
      try {
        const pendentes = await contextoEmpresa.com(empresa, () => app.prisma.mensagemWhatsapp.count({ where: { status: 'pendente' } }))
        if (pendentes) comFila.add(empresa.id)
      } catch (erro) {
        app.log.error({ err: erro, empresa: empresa.slug }, 'Não foi possível ler a fila do WhatsApp')
      }
    }
  }

  return {
    /** Empresa ganhou aviso na fila */
    marcarFila: (empresaId: string) => void comFila.add(empresaId),
    ciclo,
    recuperarFilas,
    processarEmpresa,
    marcarDesconectado,
  }
}
