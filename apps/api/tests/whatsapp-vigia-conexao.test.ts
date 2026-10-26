import { describe, expect, it } from 'vitest'
import { QUEDAS_FECHADA, QUEDAS_RECONECTANDO, proximaConferencia } from '../src/modules/whatsapp/vigia-conexao'

describe('Vigia da conexão do WhatsApp', () => {
  it('conectado zera as falhas e nunca derruba', () => {
    expect(proximaConferencia(0, 'conectado')).toEqual({ falhas: 0, derrubar: false })
    expect(proximaConferencia(5, 'conectado')).toEqual({ falhas: 0, derrubar: false })
  })

  it('fechada: derruba na segunda conferência seguida (uma piscada não basta)', () => {
    expect(QUEDAS_FECHADA).toBe(2)
    const primeira = proximaConferencia(0, 'desconectado')
    expect(primeira).toEqual({ falhas: 1, derrubar: false })
    expect(proximaConferencia(primeira.falhas, 'desconectado')).toEqual({ falhas: 2, derrubar: true })
  })

  it('reconectando espera mais (pode voltar sozinha)', () => {
    let falhas = 0
    for (let i = 1; i < QUEDAS_RECONECTANDO; i++) {
      const r = proximaConferencia(falhas, 'conectando')
      expect(r.derrubar).toBe(false)
      falhas = r.falhas
    }
    expect(proximaConferencia(falhas, 'conectando').derrubar).toBe(true)
  })

  it('voltou no meio do caminho: recomeça a contagem', () => {
    const r1 = proximaConferencia(0, 'desconectado')
    const voltou = proximaConferencia(r1.falhas, 'conectado')
    expect(voltou.falhas).toBe(0)
    expect(proximaConferencia(voltou.falhas, 'desconectado').derrubar).toBe(false)
  })
})
