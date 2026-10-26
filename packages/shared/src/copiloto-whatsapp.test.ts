import { describe, expect, it } from 'vitest'
import { dataDoPrazo } from './datas'
import { textoMensagemOrcamento } from './mensagem-orcamento'
import { contaDeEntrada, proximoVencimento } from './mensagens'
import { TEXTOS_PADRAO_MENSAGEM } from './whatsapp'

// 2026-10-26 é segunda-feira
const HOJE = '2026-10-26'

describe('prazo pedido pelo cliente → "Cliente precisa até"', () => {
  it('dia da semana, "dia 15", data escrita, amanhã e hoje', () => {
    expect(dataDoPrazo('pra sexta', HOJE)).toBe('2026-10-30')
    expect(dataDoPrazo('Sexta-feira', HOJE)).toBe('2026-10-30')
    expect(dataDoPrazo('até quarta', HOJE)).toBe('2026-10-28')
    expect(dataDoPrazo('domingo', HOJE)).toBe('2026-11-01')
    expect(dataDoPrazo('dia 30', HOJE)).toBe('2026-10-30')
    // Dia que já passou neste mês: o do mês que vem
    expect(dataDoPrazo('dia 15', HOJE)).toBe('2026-11-15')
    expect(dataDoPrazo('15/11', HOJE)).toBe('2026-11-15')
    expect(dataDoPrazo('até 05/01/2027', HOJE)).toBe('2027-01-05')
    expect(dataDoPrazo('dia 15 de novembro', HOJE)).toBe('2026-11-15')
    expect(dataDoPrazo('amanhã', HOJE)).toBe('2026-10-27')
    expect(dataDoPrazo('depois de amanhã', HOJE)).toBe('2026-10-28')
    expect(dataDoPrazo('hoje ainda', HOJE)).toBe(HOJE)
  })
  it('ambíguo fica vazio (o texto vai para a observação interna)', () => {
    for (const t of ['segunda', 'sexta que vem', 'próxima sexta', 'semana que vem', 'fim do mês', 'urgente', 'o quanto antes', 'sexta ou segunda', 'dia 31/02', '10/10', 'dia 31 de fevereiro', '15 dias', null, '']) {
      expect(dataDoPrazo(t, HOJE)).toBeNull()
    }
    // Duas datas diferentes no mesmo texto
    expect(dataDoPrazo('amanhã, no máximo dia 30', HOJE)).toBeNull()
  })
})

describe('"pedido confirmado": a entrada da aprovação', () => {
  it('a parcela em aberto que é a entrada sai como "Entrada"', () => {
    expect(contaDeEntrada('ORC-2026-0105 · Sinal')).toBe(true)
    expect(contaDeEntrada('ORC-2026-0105 · Parcela 1/2')).toBe(false)
    const parcelas = [
      { vencimento: '2026-10-26', valor: '65', valorPago: '0', status: 'aberto', entrada: true },
      { vencimento: '2026-11-25', valor: '65', valorPago: '0', status: 'aberto' },
    ]
    expect(proximoVencimento(parcelas, '130', '0', HOJE)).toBe('Entrada: *R$ 65,00* em *26/10*')
    expect(proximoVencimento([{ ...parcelas[0]!, valorPago: '65', status: 'pago' }, parcelas[1]!], '130', '65', HOJE)).toBe('Próxima parcela: *R$ 65,00* em *25/11*')
  })
})

describe('texto do orçamento (o mesmo pela tela e pelo "ok" no WhatsApp)', () => {
  it('preenche o template e avisa do PDF', () => {
    const texto = textoMensagemOrcamento(
      {
        numero: 'ORC-2026-0105',
        cliente: { nome: 'Eduardo Júnior', fantasia: null, cpfCnpj: null },
        itens: [{ descricao: 'Banner', quantidade: '1', largura: '2', altura: '1.8', total: '272' }],
        total: '272',
        sinalPercentual: '50',
        parcelas: 1,
        intervaloDias: 30,
        prazoDias: 3,
        validade: '2026-11-02',
        regras: {},
      },
      TEXTOS_PADRAO_MENSAGEM.orcamento_enviado,
      { empresa: 'Ponto Visual', linkAprovacao: 'https://x/aprovar/p/t', comPdf: true },
    )
    expect(texto).toContain('ORC-2026-0105')
    expect(texto).toContain('• 1× Banner 2,0 × 1,8 m — R$ 272,00')
    expect(texto).toContain('O orçamento em PDF vai logo abaixo.')
    expect(texto.trim().endsWith('https://x/aprovar/p/t')).toBe(true)
  })
})
