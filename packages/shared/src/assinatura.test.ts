import { describe, expect, it } from 'vitest'
import { calcularAcesso, diasEntre, filtrarPermissoes, modulosLiberados, type DadosAcesso } from './assinatura'
import { adicionarMeses } from './datas'
import { assinarSchema, economiaAnual, mensalNoAnual, mesesDoCiclo, sufixoCiclo, valorDoCiclo } from './schemas/assinatura'
import { calcularTrocaPlano } from './troca-plano'

const prazos = { diasAteSomenteLeitura: 5, diasAteBloqueio: 15 }
const ativa = (extra: Partial<DadosAcesso> = {}): DadosAcesso => ({ situacao: 'ativa', ...prazos, ...extra })
const HOJE = '2026-10-20'

describe('diasEntre', () => {
  it('conta dias de calendário, inclusive na virada de mês e horário de verão', () => {
    expect(diasEntre('2026-10-20', '2026-10-20')).toBe(0)
    expect(diasEntre('2026-09-30', '2026-10-01')).toBe(1)
    expect(diasEntre('2026-10-25', '2026-10-20')).toBe(-5)
    expect(diasEntre('2026-02-20', '2026-03-10')).toBe(18)
  })
})

describe('adicionarMeses (fim do período pago)', () => {
  it('mês seguinte, virada de ano e meses curtos', () => {
    expect(adicionarMeses('2026-10-21', 1)).toBe('2026-11-21')
    expect(adicionarMeses('2026-12-15', 1)).toBe('2027-01-15')
    expect(adicionarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(adicionarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(adicionarMeses('2026-03-31', 1)).toBe('2026-04-30')
  })
})

describe('calcularAcesso: atraso escalonado (5 dias aviso, 15 bloqueio)', () => {
  it('em dia', () => {
    expect(calcularAcesso(ativa(), HOJE)).toMatchObject({ nivel: 'normal', motivo: 'em_dia', diasAtraso: 0 })
  })
  it('vence hoje ainda não é atraso', () => {
    expect(calcularAcesso(ativa({ atrasoDesde: HOJE }), HOJE).nivel).toBe('normal')
  })
  it('1 a 4 dias: aviso, com contagem até o modo leitura', () => {
    const a = calcularAcesso(ativa({ atrasoDesde: '2026-10-17' }), HOJE)
    expect(a).toMatchObject({ nivel: 'aviso', motivo: 'atraso', diasAtraso: 3, diasParaSomenteLeitura: 2, diasParaBloqueio: 12 })
    expect(a.mensagem).toBe('A mensalidade está vencida há 3 dias. Em 2 dias o sistema fica só para consulta.')
    expect(calcularAcesso(ativa({ atrasoDesde: '2026-10-16' }), HOJE).nivel).toBe('aviso')
  })
  it('5 a 14 dias: só leitura', () => {
    expect(calcularAcesso(ativa({ atrasoDesde: '2026-10-15' }), HOJE)).toMatchObject({ nivel: 'somente_leitura', diasAtraso: 5, diasParaBloqueio: 10, diasParaSomenteLeitura: null })
    const a = calcularAcesso(ativa({ atrasoDesde: '2026-10-06' }), HOJE)
    expect(a).toMatchObject({ nivel: 'somente_leitura', diasAtraso: 14, diasParaBloqueio: 1 })
    expect(a.mensagem).toContain('em 1 dia ele será bloqueado')
  })
  it('15 dias ou mais: bloqueado', () => {
    expect(calcularAcesso(ativa({ atrasoDesde: '2026-10-05' }), HOJE)).toMatchObject({ nivel: 'bloqueado', diasAtraso: 15, diasParaBloqueio: null })
    expect(calcularAcesso(ativa({ atrasoDesde: '2026-01-01' }), HOJE).nivel).toBe('bloqueado')
  })
  it('prazos são do plano', () => {
    expect(calcularAcesso(ativa({ atrasoDesde: '2026-10-18', diasAteSomenteLeitura: 1, diasAteBloqueio: 2 }), HOJE).nivel).toBe('bloqueado')
  })
})

describe('calcularAcesso: teste grátis', () => {
  const teste = (testeAte: string) => calcularAcesso({ situacao: 'teste', testeAte, ...prazos }, HOJE)
  it('em andamento', () => {
    expect(teste('2026-11-03')).toMatchObject({ nivel: 'normal', motivo: 'teste', diasRestantesTeste: 14 })
  })
  it('últimos 3 dias: aviso', () => {
    expect(teste('2026-10-22')).toMatchObject({ nivel: 'aviso', motivo: 'teste_acabando', diasRestantesTeste: 2 })
    expect(teste(HOJE).mensagem).toBe('O teste grátis termina hoje. Assine para continuar usando sem interrupção.')
  })
  it('terminou: conta como atraso a partir do fim do teste', () => {
    expect(teste('2026-10-19')).toMatchObject({ nivel: 'aviso', motivo: 'teste_expirado', diasAtraso: 1 })
    expect(teste('2026-10-10')).toMatchObject({ nivel: 'somente_leitura', motivo: 'teste_expirado' })
    expect(teste('2026-09-01').nivel).toBe('bloqueado')
  })
})

describe('calcularAcesso: ações manuais', () => {
  it('liberação manual vence o atraso até a data (inclusive)', () => {
    expect(calcularAcesso(ativa({ atrasoDesde: '2026-09-01', liberadoAte: HOJE }), HOJE)).toMatchObject({ nivel: 'normal', motivo: 'liberacao_manual' })
    expect(calcularAcesso(ativa({ atrasoDesde: '2026-09-01', liberadoAte: '2026-10-19' }), HOJE).nivel).toBe('bloqueado')
  })
  it('bloqueio manual vence tudo, até a liberação', () => {
    expect(calcularAcesso(ativa({ bloqueioManual: true, liberadoAte: '2026-12-31' }), HOJE)).toMatchObject({ nivel: 'bloqueado', motivo: 'bloqueio_manual' })
  })
  it('cancelada fica bloqueada', () => {
    expect(calcularAcesso({ situacao: 'cancelada', ...prazos }, HOJE)).toMatchObject({ nivel: 'bloqueado', motivo: 'cancelada' })
  })
  it('cancelada que assinou de novo: continua bloqueada, mas a mensagem diz que falta só pagar', () => {
    const a = calcularAcesso({ situacao: 'cancelada', renovacaoPendente: true, ...prazos }, HOJE)
    expect(a).toMatchObject({ nivel: 'bloqueado', motivo: 'renovacao_pendente' })
    expect(a.mensagem).toContain('falta só o pagamento')
  })
})

describe('módulos e permissões', () => {
  it('plano + extras + essenciais, na ordem oficial e sem repetir', () => {
    expect(modulosLiberados(['pedidos', 'clientes'], ['estoque', 'pedidos'])).toEqual(['dashboard', 'pedidos', 'clientes', 'estoque', 'configuracoes', 'usuarios', 'permissoes'])
  })
  const permissoes = ['pedidos:visualizar', 'pedidos:criar', 'pedidos:exportar', 'estoque:visualizar', 'usuarios:editar']
  const modulos = modulosLiberados(['pedidos'])
  it('tira módulos fora do plano', () => {
    expect(filtrarPermissoes(permissoes, modulos, 'normal')).toEqual(['pedidos:visualizar', 'pedidos:criar', 'pedidos:exportar', 'usuarios:editar'])
    expect(filtrarPermissoes(permissoes, modulos, 'aviso')).toHaveLength(4)
  })
  it('só leitura: consultar e exportar', () => {
    expect(filtrarPermissoes(permissoes, modulos, 'somente_leitura')).toEqual(['pedidos:visualizar', 'pedidos:exportar'])
  })
  it('bloqueado: nenhuma', () => {
    expect(filtrarPermissoes(permissoes, modulos, 'bloqueado')).toEqual([])
  })
})

describe('ciclo de cobrança (mensal ou anual)', () => {
  it('anual cobra a anuidade do plano; sem ela, 12 mensalidades', () => {
    expect(valorDoCiclo({ valorMensal: '69.00', valorAnual: '690.00' }, 'anual')).toBe('690.00')
    expect(valorDoCiclo({ valorMensal: '69.00', valorAnual: '690.00' }, 'mensal')).toBe('69.00')
    expect(valorDoCiclo({ valorMensal: '69.00', valorAnual: null }, 'anual')).toBe('828.00')
    expect(mesesDoCiclo('anual')).toBe(12)
    expect(mesesDoCiclo('mensal')).toBe(1)
    expect(mesesDoCiclo(null)).toBe(1)
  })
  it('economia e quanto sai por mês no anual', () => {
    expect(economiaAnual('129.00', '1290.00')).toBe('258.00')
    expect(economiaAnual('129.00', null)).toBe('0.00')
    expect(economiaAnual('100.00', '1300.00')).toBe('0.00')
    expect(mensalNoAnual('1990.00')).toBe('165.83')
    expect(sufixoCiclo('anual')).toBe('/ano')
    expect(sufixoCiclo('mensal')).toBe('/mês')
  })
  it('troca de plano no anual: período de 12 meses e proporcional pelos dias do ano', () => {
    const r = calcularTrocaPlano({ valorAtual: '690.00', valorNovo: '1290.00', inicioPeriodo: '2026-01-10', hoje: '2026-07-10', meses: 12 })
    expect(r.tipo).toBe('upgrade')
    expect(r.periodo).toEqual({ inicio: '2026-01-10', fim: '2027-01-10' })
    expect(r.diasPeriodo).toBe(365)
    expect(r.diasRestantes).toBe(184)
    expect(r.valorProporcional).toBe('302.47')
  })
  it('assinar aceita o ciclo e assume mensal', () => {
    const base = { plano: 'completo', cpfCnpj: '11.222.333/0001-81', forma: 'cartao' }
    expect(assinarSchema.parse(base).ciclo).toBe('mensal')
    expect(assinarSchema.parse({ ...base, ciclo: 'anual' }).ciclo).toBe('anual')
    expect(assinarSchema.safeParse({ ...base, ciclo: 'semanal' }).success).toBe(false)
  })
})
