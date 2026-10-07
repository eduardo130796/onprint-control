/**
 * Operações de assinatura pela linha de comando (até o painel da plataforma; também usado nos testes).
 * Uso: npm run assinatura -w @onprint/api -- --listar
 *      npm run assinatura -w @onprint/api -- --empresa principal [opções]
 * Opções (podem ser combinadas):
 *   --plano essencial|profissional|completo     troca de plano
 *   --ativar                                    assinatura paga e em dia (sai do teste, limpa o atraso)
 *   --atraso-desde AAAA-MM-DD | nenhum          vencimento da cobrança mais antiga não paga
 *   --proximo-vencimento AAAA-MM-DD
 *   --teste-ate AAAA-MM-DD                      volta/estende o teste grátis
 *   --liberar-ate AAAA-MM-DD | nenhum           acesso normal até a data, mesmo com atraso
 *   --bloquear "motivo" | --desbloquear         suspensão manual
 *   --cancelar | --reativar
 *   --modulos-extras estoque,relatorios | nenhum
 *   --cobranca-manual AAAA-MM-DD [--valor 279.00]   lança uma cobrança (modo manual; valor padrão = do plano)
 *   --registrar-pagamento                       marca como paga a cobrança aberta mais antiga (modo manual)
 * Sem --empresa:
 *   --conciliar                                 confere todas as assinaturas com o Asaas e recalcula
 */
import { parseArgs } from 'node:util'
import type { Prisma } from '@prisma/client'
import { MODULOS, NIVEL_ACESSO_ROTULOS, hojeISO } from '@onprint/shared'
import type { FastifyInstance } from 'fastify'
import { carregarEnv } from '../src/config/env'
import { criarGateway } from '../src/integrations/pagamentos'
import { alterarAssinatura, paraDia, planoPorCodigo, resumirAssinatura } from '../src/plataforma/assinaturas'
import { conciliarAssinaturas, lancarCobrancaManual, registrarPagamentoManual } from '../src/plataforma/cobrancas'
import { conexoesDosScripts, executarScript } from './scripts-banco'

const { values: v } = parseArgs({
  options: {
    listar: { type: 'boolean', default: false },
    empresa: { type: 'string' },
    plano: { type: 'string' },
    ativar: { type: 'boolean', default: false },
    'atraso-desde': { type: 'string' },
    'proximo-vencimento': { type: 'string' },
    'teste-ate': { type: 'string' },
    'liberar-ate': { type: 'string' },
    bloquear: { type: 'string' },
    desbloquear: { type: 'boolean', default: false },
    cancelar: { type: 'boolean', default: false },
    reativar: { type: 'boolean', default: false },
    'modulos-extras': { type: 'string' },
    autor: { type: 'string', default: 'cli' },
    'cobranca-manual': { type: 'string' },
    valor: { type: 'string' },
    'registrar-pagamento': { type: 'boolean', default: false },
    conciliar: { type: 'boolean', default: false },
  },
})

const banco = conexoesDosScripts()
const DATA = /^\d{4}-\d{2}-\d{2}$/
function dia(valor: string, opcao: string) {
  if (!DATA.test(valor)) throw new Error(`--${opcao}: use AAAA-MM-DD (ou "nenhum").`)
  return paraDia(valor)
}
const diaOuNada = (valor: string, opcao: string) => (valor === 'nenhum' ? null : dia(valor, opcao))

async function listar() {
  const empresas = await banco.plataforma.assinante.findMany({ include: { assinatura: { include: { plano: true } } }, orderBy: { createdAt: 'asc' } })
  for (const e of empresas) {
    if (!e.assinatura) {
      console.log(`${e.slug.padEnd(28)} (sem assinatura)`)
      continue
    }
    const r = resumirAssinatura(e.assinatura, hojeISO())
    console.log(`${e.slug.padEnd(28)} ${r.plano.nome.padEnd(13)} ${e.assinatura.situacao.padEnd(10)} ${NIVEL_ACESSO_ROTULOS[r.acesso.nivel].padEnd(11)} ${r.acesso.mensagem}`)
  }
}

executarScript(async () => {
  if (v.listar) return listar()
  if (v.conciliar) {
    // O mesmo serviço da API, com o mínimo que ele usa (sem cache para limpar fora do servidor)
    const config = carregarEnv()
    const app = { plataforma: banco.plataforma, pagamentos: criarGateway(config), config, empresas: { esquecer: () => undefined }, log: console } as unknown as FastifyInstance
    const r = await conciliarAssinaturas(app)
    console.log(`Conferência: ${r.cobrancas} cobrança(s) do Asaas, ${r.assinaturas} assinatura(s) recalculada(s).`)
    for (const falha of r.falhas) console.log(`Falha: ${falha}`)
    return
  }
  if (!v.empresa) throw new Error('Informe --empresa <slug>, --listar ou --conciliar.')
  const empresa = await banco.plataforma.assinante.findUnique({ where: { slug: v.empresa }, include: { assinatura: { include: { plano: true } } } })
  if (!empresa?.assinatura) throw new Error(`Empresa "${v.empresa}" não encontrada ou sem assinatura.`)
  if (v['cobranca-manual']) {
    const c = await lancarCobrancaManual(banco.plataforma, empresa.id, dia(v['cobranca-manual'], 'cobranca-manual').toISOString().slice(0, 10), v.valor ?? empresa.assinatura.plano.valorMensal.toFixed(2))
    console.log(`${empresa.slug}: cobrança manual de R$ ${c.valor.toFixed(2)} com vencimento ${v['cobranca-manual']}.`)
    return
  }
  if (v['registrar-pagamento']) {
    const c = await registrarPagamentoManual(banco.plataforma, empresa.id)
    console.log(`${empresa.slug}: pagamento registrado (R$ ${c.valor.toFixed(2)}).`)
    return
  }

  const dados: Prisma.AssinaturaUncheckedUpdateInput = {}
  const feito: string[] = []
  if (v.plano) {
    const plano = await planoPorCodigo(banco.plataforma, v.plano)
    dados.planoId = plano.id
    feito.push(`plano ${plano.nome}`)
  }
  if (v.ativar) {
    Object.assign(dados, { situacao: 'ativa', testeAte: null, atrasoDesde: null, canceladaEm: null })
    feito.push('assinatura ativada e em dia')
  }
  if (v['atraso-desde']) {
    dados.atrasoDesde = diaOuNada(v['atraso-desde'], 'atraso-desde')
    feito.push(v['atraso-desde'] === 'nenhum' ? 'atraso quitado' : `em atraso desde ${v['atraso-desde']}`)
  }
  if (v['proximo-vencimento']) {
    dados.proximoVencimento = dia(v['proximo-vencimento'], 'proximo-vencimento')
    feito.push(`próximo vencimento ${v['proximo-vencimento']}`)
  }
  if (v['teste-ate']) {
    Object.assign(dados, { situacao: 'teste', testeAte: dia(v['teste-ate'], 'teste-ate') })
    feito.push(`teste grátis até ${v['teste-ate']}`)
  }
  if (v['liberar-ate']) {
    dados.liberadoAte = diaOuNada(v['liberar-ate'], 'liberar-ate')
    feito.push(v['liberar-ate'] === 'nenhum' ? 'liberação manual removida' : `liberado até ${v['liberar-ate']}`)
  }
  if (v.bloquear) {
    Object.assign(dados, { bloqueioManual: true, motivoBloqueio: v.bloquear })
    feito.push(`bloqueio manual: ${v.bloquear}`)
  }
  if (v.desbloquear) {
    Object.assign(dados, { bloqueioManual: false, motivoBloqueio: null })
    feito.push('bloqueio manual removido')
  }
  if (v.cancelar) {
    Object.assign(dados, { situacao: 'cancelada', canceladaEm: new Date() })
    feito.push('assinatura cancelada')
  }
  if (v.reativar) {
    Object.assign(dados, { situacao: 'ativa', canceladaEm: null })
    feito.push('assinatura reativada')
  }
  if (v['modulos-extras']) {
    const extras = v['modulos-extras'] === 'nenhum' ? [] : v['modulos-extras'].split(',').map((m) => m.trim())
    const invalidos = extras.filter((m) => !(MODULOS as readonly string[]).includes(m))
    if (invalidos.length) throw new Error(`Módulos inexistentes: ${invalidos.join(', ')}`)
    dados.modulosExtras = extras
    feito.push(extras.length ? `módulos extras: ${extras.join(', ')}` : 'sem módulos extras')
  }
  if (feito.length === 0) throw new Error('Nada para alterar. Veja as opções no topo de prisma/assinatura.ts.')

  const a = await alterarAssinatura(banco.plataforma, empresa.id, dados, { tipo: 'alterada', descricao: feito.join('; '), autor: v.autor })
  const r = resumirAssinatura(a, hojeISO())
  console.log(`${empresa.slug}: ${feito.join('; ')}.`)
  console.log(`Agora: plano ${r.plano.nome}, ${NIVEL_ACESSO_ROTULOS[r.acesso.nivel]}. ${r.acesso.mensagem}`)
}, banco.fechar)
