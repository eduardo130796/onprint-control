/**
 * Operações de assinatura pela linha de comando (as mesmas do painel da plataforma; também usado nos testes).
 * Uso: npm run assinatura -w @onprint/api -- --listar
 *      npm run assinatura -w @onprint/api -- --empresa principal [opções]
 * Opções (podem ser combinadas; executadas nesta ordem):
 *   --plano essencial|profissional|completo     troca de plano (também no Asaas, se assinar online)
 *   --ativar                                    assinatura paga e em dia (sai do teste, limpa o atraso)
 *   --atraso-desde AAAA-MM-DD | nenhum          vencimento da cobrança mais antiga não paga
 *   --proximo-vencimento AAAA-MM-DD             (junto com --ativar)
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
import type { FastifyInstance } from 'fastify'
import { MODULOS, NIVEL_ACESSO_ROTULOS, acaoAssinaturaSchema, hojeISO, type AcaoAssinatura } from '@onprint/shared'
import { carregarEnv } from '../src/config/env'
import { criarGateway } from '../src/integrations/pagamentos'
import { resumirAssinatura } from '../src/plataforma/assinaturas'
import { conciliarAssinaturas } from '../src/plataforma/cobrancas'
import { executarAcao } from '../src/plataforma/operacoes'
import { conexoesDosScripts, executarScript } from './scripts-banco'

const { values: v } = parseArgs({
  options: {
    listar: { type: 'boolean', default: false },
    conciliar: { type: 'boolean', default: false },
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
    'cobranca-manual': { type: 'string' },
    valor: { type: 'string' },
    'registrar-pagamento': { type: 'boolean', default: false },
    autor: { type: 'string', default: 'cli' },
  },
})

const banco = conexoesDosScripts()
const nenhum = (valor: string) => (valor === 'nenhum' ? null : valor)

/** Opções da linha de comando → ações (validadas pelo mesmo schema do painel). */
function acoesDasOpcoes(): AcaoAssinatura[] {
  const brutas: unknown[] = []
  if (v.plano) brutas.push({ acao: 'plano', plano: v.plano })
  if (v.ativar) brutas.push({ acao: 'ativar', proximoVencimento: v['proximo-vencimento'] })
  if (v['atraso-desde']) brutas.push({ acao: 'atraso_desde', data: nenhum(v['atraso-desde']) })
  if (v['teste-ate']) brutas.push({ acao: 'teste_ate', data: v['teste-ate'] })
  if (v['liberar-ate']) brutas.push({ acao: 'liberar_ate', data: nenhum(v['liberar-ate']) })
  if (v.bloquear) brutas.push({ acao: 'bloquear', motivo: v.bloquear })
  if (v.desbloquear) brutas.push({ acao: 'desbloquear' })
  if (v.cancelar) brutas.push({ acao: 'cancelar' })
  if (v.reativar) brutas.push({ acao: 'reativar' })
  if (v['modulos-extras']) {
    const modulos = v['modulos-extras'] === 'nenhum' ? [] : v['modulos-extras'].split(',').map((m) => m.trim())
    const invalidos = modulos.filter((m) => !(MODULOS as readonly string[]).includes(m))
    if (invalidos.length) throw new Error(`Módulos inexistentes: ${invalidos.join(', ')}`)
    brutas.push({ acao: 'modulos_extras', modulos })
  }
  if (v['cobranca-manual']) brutas.push({ acao: 'cobranca_manual', vencimento: v['cobranca-manual'], valor: v.valor })
  if (v['registrar-pagamento']) brutas.push({ acao: 'registrar_pagamento' })
  return brutas.map((b) => {
    const r = acaoAssinaturaSchema.safeParse(b)
    if (!r.success) throw new Error(`Opção inválida (${(b as { acao: string }).acao}): ${r.error.issues[0]?.message}. Datas em AAAA-MM-DD.`)
    return r.data
  })
}

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
  const config = carregarEnv()
  const pagamentos = criarGateway(config)
  if (v.conciliar) {
    // O mesmo serviço da API, com o mínimo que ele usa (sem cache para limpar fora do servidor)
    const app = { plataforma: banco.plataforma, pagamentos, config, empresas: { esquecer: () => undefined }, log: console } as unknown as FastifyInstance
    const r = await conciliarAssinaturas(app)
    console.log(`Conferência: ${r.cobrancas} cobrança(s) do Asaas, ${r.assinaturas} assinatura(s) recalculada(s).`)
    for (const falha of r.falhas) console.log(`Falha: ${falha}`)
    return
  }
  if (!v.empresa) throw new Error('Informe --empresa <slug>, --listar ou --conciliar.')
  const empresa = await banco.plataforma.assinante.findUnique({ where: { slug: v.empresa } })
  if (!empresa) throw new Error(`Empresa "${v.empresa}" não encontrada.`)
  const acoes = acoesDasOpcoes()
  if (acoes.length === 0) throw new Error('Nada para alterar. Veja as opções no topo de prisma/assinatura.ts.')

  for (const acao of acoes) await executarAcao({ plataforma: banco.plataforma, pagamentos }, empresa.id, acao, v.autor)
  const a = await banco.plataforma.assinatura.findUniqueOrThrow({ where: { assinanteId: empresa.id }, include: { plano: true } })
  const r = resumirAssinatura(a, hojeISO())
  console.log(`${empresa.slug}: ${acoes.map((x) => x.acao).join(', ')}.`)
  console.log(`Agora: plano ${r.plano.nome}, ${NIVEL_ACESSO_ROTULOS[r.acesso.nivel]}. ${r.acesso.mensagem}`)
}, banco.fechar)
