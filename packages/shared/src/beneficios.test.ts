import { describe, expect, it } from 'vitest'
import { calcularAcesso } from './assinatura'
import { cupomIndisponivel, descontoDoCupom, descreverCupom, fimDoDesconto, mesesGratis, valorDaMensalidade } from './beneficios'

const regras = { diasAteSomenteLeitura: 5, diasAteBloqueio: 15 }

describe('cupom', () => {
  it('percentual arredonda ao centavo; valor fixo não passa do cheio', () => {
    expect(descontoDoCupom({ tipo: 'percentual', valor: '15' }, '279.00')).toBe('41.85')
    expect(descontoDoCupom({ tipo: 'percentual', valor: '33.33' }, '149.00')).toBe('49.66')
    expect(descontoDoCupom({ tipo: 'valor', valor: '50' }, '149.00')).toBe('50.00')
    expect(descontoDoCupom({ tipo: 'valor', valor: '500' }, '149.00')).toBe('149.00')
  })

  it('descrição curta', () => {
    expect(descreverCupom({ tipo: 'percentual', valor: '20', duracaoMeses: 3 })).toBe('20% de desconto por 3 meses')
    expect(descreverCupom({ tipo: 'valor', valor: '50', duracaoMeses: null })).toBe('R$ 50,00 de desconto para sempre')
    expect(descreverCupom({ tipo: 'percentual', valor: '10', duracaoMeses: 1 })).toBe('10% de desconto na 1ª mensalidade')
  })

  it('janela: 3 meses a partir da 1ª mensalidade com desconto', () => {
    expect(fimDoDesconto('2026-10-10', 3)).toBe('2026-12-10')
    expect(fimDoDesconto('2026-10-10', null)).toBeNull()
  })

  it('valor da mensalidade: desconto só dentro da janela', () => {
    const r = { valorPlano: '149.00', desconto: { tipo: 'percentual' as const, valor: '20', desde: '2026-10-10', ate: '2026-11-10' } }
    expect(valorDaMensalidade(r, '2026-09-10').valor).toBe('149.00') // antes (vencida/prestada): não muda
    expect(valorDaMensalidade(r, '2026-10-10')).toEqual({ cheio: '149.00', desconto: '29.80', valor: '119.20' })
    expect(valorDaMensalidade(r, '2026-11-10').valor).toBe('119.20')
    expect(valorDaMensalidade(r, '2026-12-10').valor).toBe('149.00') // depois: volta o cheio
  })

  it('valor da mensalidade: downgrade agendado vale a partir da data, com o cupom sobre o plano novo', () => {
    const r = {
      valorPlano: '449.00',
      agendado: { valor: '149.00', em: '2026-11-10' },
      desconto: { tipo: 'percentual' as const, valor: '10', desde: null, ate: null },
    }
    expect(valorDaMensalidade(r, '2026-10-10').valor).toBe('404.10')
    expect(valorDaMensalidade(r, '2026-11-10').valor).toBe('134.10')
  })

  it('disponibilidade: inativo, expirado, esgotado, outro plano', () => {
    const c = { ativo: true, validoAte: '2026-10-31', limiteUsos: 10, usos: 3, planos: ['essencial'] }
    expect(cupomIndisponivel(c, 'essencial', '2026-10-08')).toBeNull()
    expect(cupomIndisponivel({ ...c, ativo: false }, 'essencial', '2026-10-08')).toMatch(/não está mais/)
    expect(cupomIndisponivel(c, 'essencial', '2026-11-01')).toMatch(/expirou/)
    expect(cupomIndisponivel({ ...c, usos: 10 }, 'essencial', '2026-10-08')).toMatch(/limite/)
    expect(cupomIndisponivel(c, 'completo', '2026-10-08')).toMatch(/plano/)
    expect(cupomIndisponivel({ ...c, planos: [] }, 'completo', '2026-10-08')).toBeNull()
  })
})

describe('meses grátis', () => {
  it('abona os N vencimentos a partir da base e empurra a próxima cobrança', () => {
    expect(mesesGratis('2026-01-31', 2)).toEqual({ abonados: ['2026-01-31', '2026-02-28'], proximo: '2026-03-31' })
  })
})

describe('cortesia', () => {
  it('sem prazo: acesso normal, mesmo com cobrança antiga em aberto', () => {
    const a = calcularAcesso({ situacao: 'cortesia', atrasoDesde: '2026-08-01', ...regras }, '2026-10-08')
    expect(a).toMatchObject({ nivel: 'normal', motivo: 'cortesia', diasRestantesTeste: null })
    expect(a.mensagem).toBe('Assinatura cortesia, sem mensalidade.')
  })

  it('com prazo: avisa nos últimos dias e, quando acaba, conta como fim de teste', () => {
    expect(calcularAcesso({ situacao: 'cortesia', cortesiaAte: '2026-10-20', ...regras }, '2026-10-08')).toMatchObject({ nivel: 'normal', diasRestantesTeste: 12 })
    expect(calcularAcesso({ situacao: 'cortesia', cortesiaAte: '2026-10-09', ...regras }, '2026-10-08')).toMatchObject({ nivel: 'aviso', motivo: 'cortesia' })
    const fim = calcularAcesso({ situacao: 'cortesia', cortesiaAte: '2026-10-01', ...regras }, '2026-10-08')
    expect(fim).toMatchObject({ nivel: 'somente_leitura', motivo: 'cortesia_encerrada', diasAtraso: 7 })
    expect(fim.mensagem).toMatch(/^A cortesia terminou há 7 dias/)
  })

  it('bloqueio manual vale mesmo na cortesia', () => {
    expect(calcularAcesso({ situacao: 'cortesia', bloqueioManual: true, ...regras }, '2026-10-08').nivel).toBe('bloqueado')
  })
})

describe('liberação manual', () => {
  it('não esconde o teste nem a cortesia; só vale quando o acesso seria restrito', () => {
    const lib = { liberadoAte: '2026-10-15', ...regras }
    expect(calcularAcesso({ situacao: 'teste', testeAte: '2026-10-22', ...lib }, '2026-10-08').motivo).toBe('teste')
    expect(calcularAcesso({ situacao: 'cortesia', ...lib }, '2026-10-08').motivo).toBe('cortesia')
    expect(calcularAcesso({ situacao: 'ativa', atrasoDesde: '2026-09-01', ...lib }, '2026-10-08')).toMatchObject({ nivel: 'normal', motivo: 'liberacao_manual' })
    expect(calcularAcesso({ situacao: 'ativa', ...lib }, '2026-10-08').motivo).toBe('em_dia')
  })
})
