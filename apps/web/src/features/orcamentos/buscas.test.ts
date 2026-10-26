import { describe, expect, it } from 'vitest'
import { CONTATO_WHATSAPP, numeroDoContato } from './buscas'

describe('Busca de cliente com os contatos do WhatsApp', () => {
  it('o contato escolhido vira o número do pré-cadastro (DDD + número, sem o 55)', () => {
    expect(numeroDoContato(`${CONTATO_WHATSAPP}5511988887777`)).toBe('11988887777')
    expect(numeroDoContato(`${CONTATO_WHATSAPP}551133334444`)).toBe('1133334444')
  })
})
