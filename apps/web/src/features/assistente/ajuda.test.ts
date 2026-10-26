import { describe, expect, it } from 'vitest'
import { TEMAS_AJUDA_LISTA } from '@onprint/shared'
import { TUTORIAIS } from '@/features/ajuda/conteudo'
import { pareceTabela, passosCurtos, tutorialDaDuvida } from './ajuda'

describe('Peça ao Assistente: dúvidas de uso pela central de ajuda', () => {
  it('cada tema que a IA pode escolher tem o tutorial (e cada tutorial é um tema)', () => {
    expect([...TEMAS_AJUDA_LISTA].sort()).toEqual(TUTORIAIS.map((t) => t.slug).sort())
  })

  it('o tema escolhido decide; sem tema, as palavras da pergunta', () => {
    expect(tutorialDaDuvida('conectar-whatsapp', 'qualquer coisa')?.slug).toBe('conectar-whatsapp')
    expect(tutorialDaDuvida(null, 'como cadastro um produto?')?.slug).toBe('cadastrar-produto')
    expect(tutorialDaDuvida(null, 'onde vendo no balcão?')?.slug).toBe('venda-balcao')
    expect(tutorialDaDuvida(null, 'oi')).toBeNull()
  })

  it('passos curtos: só os títulos, até 5', () => {
    const t = TUTORIAIS.find((x) => x.slug === 'configurar-empresa')!
    expect(passosCurtos(t).length).toBeLessThanOrEqual(5)
    expect(passosCurtos(t)[0]).toBe(t.passos[0]!.titulo)
  })

  it('tabela colada vai para o cadastro em lote; um produto, não', () => {
    expect(pareceTabela('Banner m² R$ 65\nCartão milheiro R$ 120')).toBe(true)
    expect(pareceTabela('Banner m² R$ 65 / Caneca R$ 32')).toBe(true)
    expect(pareceTabela('novo produto: chaveiro acrílico R$ 4 a unidade')).toBe(false)
  })
})
