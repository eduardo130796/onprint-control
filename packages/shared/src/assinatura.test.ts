import { describe, expect, it } from 'vitest'
import { calcularAcesso, diasEntre, filtrarPermissoes, modulosLiberados, type DadosAcesso } from './assinatura'

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
