import { describe, expect, it } from 'vitest'
import {
  CONTROLES_ASSISTENTE_PADRAO,
  FUNCOES_ASSISTENTE,
  FUNCOES_ASSISTENTE_INFO,
  RECURSOS_IA,
  RECURSO_IA_ROTULOS,
  controlesAssistenteSchema,
  descricaoAssistenteSchema,
  funcaoLiberada,
  orcamentoDeTextoSchema,
} from './assistente'

describe('Assistente: controles da empresa', () => {
  it('padrão: tudo ligado, falando com clientes permitido', () => {
    for (const f of FUNCOES_ASSISTENTE) expect(funcaoLiberada(CONTROLES_ASSISTENTE_PADRAO, f)).toBe(true)
  })
  it('chave geral desligada desliga tudo; cada função tem o próprio interruptor', () => {
    for (const f of FUNCOES_ASSISTENTE) expect(funcaoLiberada({ ...CONTROLES_ASSISTENTE_PADRAO, ativo: false }, f)).toBe(false)
    const semOrcamento = { ...CONTROLES_ASSISTENTE_PADRAO, orcamentoTexto: false }
    expect(funcaoLiberada(semOrcamento, 'orcamentoTexto')).toBe(false)
    expect(funcaoLiberada(semOrcamento, 'produtos')).toBe(true)
  })
  it('"nunca falar com meus clientes" deixa só as ajudas internas (as que falam com o cliente param)', () => {
    const c = { ...CONTROLES_ASSISTENTE_PADRAO, semClientes: true }
    for (const f of FUNCOES_ASSISTENTE) expect(funcaoLiberada(c, f)).toBe(!FUNCOES_ASSISTENTE_INFO[f].falaComCliente)
    // Hoje nenhuma função escreve ao cliente: todas continuam
    expect(FUNCOES_ASSISTENTE.filter((f) => FUNCOES_ASSISTENTE_INFO[f].falaComCliente)).toEqual([])
    // Uma função futura que fale com o cliente para (simulada aqui)
    const info = FUNCOES_ASSISTENTE_INFO.descricoes
    info.falaComCliente = true
    try {
      expect(funcaoLiberada(c, 'descricoes')).toBe(false)
      expect(funcaoLiberada(CONTROLES_ASSISTENTE_PADRAO, 'descricoes')).toBe(true)
    } finally {
      info.falaComCliente = false
    }
  })
  it('todo recurso tem rótulo e cada função aponta para um recurso', () => {
    for (const r of RECURSOS_IA) expect(RECURSO_IA_ROTULOS[r]).toBeTruthy()
    for (const f of FUNCOES_ASSISTENTE) expect(RECURSOS_IA).toContain(FUNCOES_ASSISTENTE_INFO[f].recurso)
  })
  it('schemas de entrada', () => {
    expect(controlesAssistenteSchema.safeParse({ ...CONTROLES_ASSISTENTE_PADRAO, extra: 1 }).success).toBe(true)
    expect(controlesAssistenteSchema.safeParse({ ativo: true }).success).toBe(false)
    expect(orcamentoDeTextoSchema.safeParse({ texto: ' oi ' }).success).toBe(false)
    expect(orcamentoDeTextoSchema.parse({ texto: '  2 banners 3x1  ' }).texto).toBe('2 banners 3x1')
    expect(descricaoAssistenteSchema.safeParse({ destino: 'vitrine' }).success).toBe(true)
    expect(descricaoAssistenteSchema.safeParse({ destino: 'site' }).success).toBe(false)
  })
})
