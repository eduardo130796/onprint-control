import { describe, expect, it } from 'vitest'
import { SimuladoProvider } from '../src/integrations/ia/simulado'
import { pedeMenu, textoMenuVoce } from '../src/modules/whatsapp/copiloto'
import { soCortesia, soSaudacao } from '../src/modules/whatsapp/conversas'
import { conteudoAtendimento, pedidoAtendimento, validarAtendimento, type ContextoAtendimento } from '../src/modules/assistente/prompts-atendimento'
import {
  ATENDER_ATE_MS,
  DONO_NA_CONVERSA_MS,
  agoraPorExtenso,
  ajustarAbertura,
  comApresentacao,
  paradaValendo,
  esperaDoAtendente,
  esperaSeguida,
  funcionamentoAgora,
  fraseDoPedido,
  legendaDoProduto,
  linhaDoProduto,
  motivoSemEnvio,
  negociando,
  pedePessoa,
  quandoAtender,
  temValor,
  valorNovo,
  textoChamarPessoa,
  textoMenuCliente,
  opcoesDoMenu,
  pedidoDoCliente,
  semCabecalho,
  textoCatalogo,
  textoConviteOrcamento,
  saudacaoDaHora,
  textoEnviadoSozinho,
  textoRecepcao,
  type ConversaParaAtender,
} from '../src/modules/whatsapp/atendente'

const agora = new Date('2026-10-27T01:14:00Z') // segunda-feira, 26/10, 22:14 em Brasília
const min = 60_000
const antes = (ms: number) => new Date(agora.getTime() - ms)
const espera = 5 * min

const conversa = (p: Partial<ConversaParaAtender> = {}): ConversaParaAtender => ({
  situacao: 'aberta',
  assunto: 'orcamento',
  assuntoVia: 'assistente',
  classificar: false,
  numero: '5561993526884',
  ultimaEm: antes(6 * min),
  ultimaPendenteEm: antes(6 * min),
  atendidaEm: null,
  atendenteParou: null,
  ...p,
})
const ctx = (p: { ultimaDoDonoEm?: Date | null; ultimoEnvioEquipeEm?: Date | null } = {}) => ({ agora, esperaMs: espera, ultimaDoDonoEm: null, ultimoEnvioEquipeEm: null, ...p })

describe('Atendente: quando entra', () => {
  it('cliente sem resposta há mais que a espera: atende', () => {
    expect(quandoAtender(conversa(), ctx())).toEqual({ atender: true })
    for (const assunto of ['pedido', 'duvida']) expect(quandoAtender(conversa({ assunto }), ctx()).atender).toBe(true)
  })
  it('cada mensagem nova recomeça a contagem (o cliente escrevendo em partes)', () => {
    expect(quandoAtender(conversa({ ultimaEm: antes(4 * min), ultimaPendenteEm: antes(4 * min) }), ctx())).toEqual({ atender: false, motivo: 'cedo' })
  })
  it('já respondeu essa mensagem: só de novo depois de mensagem nova do cliente', () => {
    expect(quandoAtender(conversa({ ultimaEm: antes(10 * min), ultimaPendenteEm: antes(10 * min), atendidaEm: antes(4 * min) }), ctx())).toEqual({ atender: false, motivo: 'ja_atendida' })
    expect(quandoAtender(conversa({ atendidaEm: antes(20 * min) }), ctx())).toEqual({ atender: true })
    // Depois da resposta dele, só veio a aprovação (já respondida pelo sistema): nada a dizer
    expect(quandoAtender(conversa({ ultimaEm: antes(6 * min), ultimaPendenteEm: antes(30 * min), atendidaEm: antes(20 * min) }), ctx())).toEqual({ atender: false, motivo: 'ja_atendida' })
    expect(quandoAtender(conversa({ ultimaPendenteEm: null }), ctx())).toEqual({ atender: false, motivo: 'ja_atendida' })
  })
  it('o dono falou com o cliente há menos de 2 horas (celular, WhatsApp Web, áudio): fica de fora', () => {
    expect(quandoAtender(conversa(), ctx({ ultimaDoDonoEm: antes(30 * min) }))).toEqual({ atender: false, motivo: 'dono' })
    expect(quandoAtender(conversa(), ctx({ ultimaDoDonoEm: antes(DONO_NA_CONVERSA_MS + min) }))).toEqual({ atender: true })
    expect(quandoAtender(conversa(), ctx({ ultimoEnvioEquipeEm: antes(10 * min) }))).toEqual({ atender: false, motivo: 'equipe' })
  })
  it('só cliente: assunto "outro" (família, amigos) ou só pelas palavras não atende', () => {
    expect(quandoAtender(conversa({ assunto: 'outro' }), ctx())).toEqual({ atender: false, motivo: 'sem_assunto' })
    expect(quandoAtender(conversa({ assuntoVia: 'regras' }), ctx())).toEqual({ atender: false, motivo: 'sem_assunto' })
    expect(quandoAtender(conversa({ classificar: true }), ctx())).toEqual({ atender: false, motivo: 'lendo' })
  })
  it('resolvida (📝 do dono), parou de vez ou antiga: não atende', () => {
    expect(quandoAtender(conversa({ situacao: 'resolvida' }), ctx()).atender).toBe(false)
    expect(quandoAtender(conversa({ atendenteParou: 'pessoa' }), ctx())).toEqual({ atender: false, motivo: 'parou' })
    expect(quandoAtender(conversa({ ultimaEm: antes(ATENDER_ATE_MS + min), ultimaPendenteEm: antes(ATENDER_ATE_MS + min) }), ctx())).toEqual({ atender: false, motivo: 'antiga' })
    expect(quandoAtender(conversa({ numero: null }), ctx())).toEqual({ atender: false, motivo: 'sem_numero' })
  })
  it('espera: só 3, 5, 10 ou 15 minutos (o resto volta aos 5)', () => {
    expect(esperaDoAtendente(10)).toBe(10)
    expect(esperaDoAtendente(7)).toBe(5)
    expect(esperaDoAtendente(null)).toBe(5)
  })
})

describe('Atendente: o que ele diz', () => {
  it('"quero falar com uma pessoa", "é robô?": chama a equipe', () => {
    for (const t of ['quero falar com uma pessoa', 'Posso falar com alguém?', 'chama um atendente', 'é robô?', 'to falando com um bot?', 'quero falar com o dono', 'não quero robô']) expect(pedePessoa([t])).toBe(true)
    for (const t of ['quero 2 banners', 'pode falar com meu sócio sobre a arte', 'qual o horário?']) expect(pedePessoa([t])).toBe(false)
  })
  it('nunca passa valor: R$, "50 reais", "45,90"', () => {
    for (const t of ['Fica R$ 50', 'sai por 50 reais', 'o banner fica 45,90', 'Total 1.200,00']) expect(temValor(t)).toBe(true)
    for (const t of ['Anotei: 2× Banner 2×1 m.', 'Já já a equipe te passa o valor.', 'Abrimos às 8h']) expect(temValor(t)).toBe(false)
  })
  it('valor: só o que a gráfica já mandou na conversa (nunca inventado)', () => {
    const orcamento = 'Segue o seu orçamento *ORC-1*: 2× Banner — R$ 202,00. Total: *R$ 202,00*. Entrada de R$ 101,00 (50%)'
    expect(valorNovo('O total ficou R$ 202,00, com entrada de 101,00.', [orcamento])).toBe(false)
    expect(valorNovo('Fica pronto em 2 dias úteis.', [orcamento])).toBe(false)
    expect(valorNovo('Com desconto sai por R$ 180', [orcamento])).toBe(true)
    expect(valorNovo('Sai por 150 reais', [])).toBe(true)
  })
  it('apresenta-se só na primeira resposta; recepção pronta sem a IA', () => {
    const c = { grafica: 'Ponto Visual', nome: 'Maria', assunto: 'orcamento' }
    expect(textoRecepcao({ ...c, seApresentar: true })).toBe('Oi, Maria! Aqui é o assistente da Ponto Visual 😊\n\nAnotei o seu pedido! Já já a equipe te passa o valor por aqui.')
    expect(textoRecepcao({ ...c, seApresentar: false, assunto: 'duvida' })).toBe('Recebemos sua mensagem! Logo a equipe te responde por aqui.')
    expect(textoChamarPessoa({ ...c, seApresentar: false })).toBe('Claro! Já avisei a equipe, logo alguém te responde por aqui.')
  })
  it('resposta pronta do pedido: a apresentação entra no lugar do "Olá"', () => {
    const pronta = 'Olá, Maria!\n\nSeu pedido *PED-1* já está pronto ✅\n\n— Ponto Visual'
    expect(comApresentacao(pronta, { grafica: 'Ponto Visual', nome: 'Maria', seApresentar: true })).toBe('Oi, Maria! Aqui é o assistente da Ponto Visual 😊\n\nSeu pedido *PED-1* já está pronto ✅\n\n— Ponto Visual')
    expect(comApresentacao(pronta, { grafica: 'Ponto Visual', nome: 'Maria', seApresentar: false })).toBe(pronta)
  })
  it('abertura: apresenta-se na primeira; nas seguintes, sem saudação de novo', () => {
    const c = { grafica: 'Ponto Visual', nome: 'Carla' }
    expect(ajustarAbertura('Boa noite, Carla! Anotei: 500 cartões.', { ...c, seApresentar: false })).toBe('Anotei: 500 cartões.')
    expect(ajustarAbertura('Oi! anotei sim.', { ...c, seApresentar: false })).toBe('Anotei sim.')
    expect(ajustarAbertura('Anotei: 2 banners.', { ...c, seApresentar: false })).toBe('Anotei: 2 banners.')
    // Só a saudação e o nome saem: o resto da frase fica
    expect(ajustarAbertura('Olá, seu pedido já está pronto.', { ...c, seApresentar: false })).toBe('Seu pedido já está pronto.')
    expect(ajustarAbertura('Oito banners anotados.', { ...c, seApresentar: false })).toBe('Oito banners anotados.')
    expect(ajustarAbertura('Boa noite! Anotei: 2 banners.', { ...c, seApresentar: true })).toBe('Oi, Carla! Aqui é o assistente da Ponto Visual 😊\n\nAnotei: 2 banners.')
    expect(ajustarAbertura('Oi, Carla! Aqui é o assistente da Ponto Visual 😊 Anotei.', { ...c, seApresentar: true })).toBe('Oi, Carla! Aqui é o assistente da Ponto Visual 😊 Anotei.')
  })
  it('pediu uma pessoa: vale para o número por 12 horas; contato pessoal, 30 dias', () => {
    expect(paradaValendo([{ motivo: 'pessoa', em: antes(30 * min) }], agora)).toBe(true)
    expect(paradaValendo([{ motivo: 'pessoa', em: antes(13 * 60 * min) }], agora)).toBe(false)
    expect(paradaValendo([{ motivo: 'pessoal', em: antes(10 * 24 * 60 * min) }], agora)).toBe(true)
    expect(paradaValendo([], agora)).toBe(false)
  })
  it('a hora no horário de Brasília (para dizer quando a gráfica volta)', () => {
    expect(agoraPorExtenso(agora)).toBe('segunda-feira, 26/10, 22:14 (amanhã é terça-feira, 27/10)')
  })
})

describe('Atendente: o pedido ao Assistente', () => {
  const base: ContextoAtendimento = {
    grafica: 'Ponto Visual',
    agora: 'segunda-feira, 26/10, 22:14',
    funcionamento: 'fechada agora; abre amanhã às 8h',
    sobre: ['Horário: seg a sex, 8h às 18h'],
    manual: 'Sempre oferecer a criação da arte.',
    assunto: 'orcamento',
    cliente: 'Maria',
    seApresentar: true,
    situacao: ['Contato novo: não está no cadastro da gráfica (primeiro contato)'],
    catalogo: 'https://pontovisual.grafygo.com.br/catalogo/1',
    produtos: ['Adesivo vinil · Comunicação visual · https://pontovisual.grafygo.com.br/produto/adesivo'],
    rascunho: { itens: ['2× Banner 2×1 m'], fora: ['50× chaveiro'], faltando: ['Banner: acabamento'] },
    conversa: [{ de: 'cliente', texto: 'oi, queria 2 banners 2x1 e 50 chaveiros, meu cel 61 99352-6884' }],
  }
  it('vai o necessário, sem telefone; manual como orientação do dono', () => {
    const c = conteudoAtendimento(base)
    expect(c).toContain('<rascunho>\n- 2× Banner 2×1 m\n</rascunho>')
    expect(c).toContain('<fora_do_catalogo>\n- 50× chaveiro')
    expect(c).toContain('Apresente-se: sim')
    expect(c).not.toContain('99352')
    expect(pedidoAtendimento(base).sistema).toContain('<manual_do_atendente>')
  })
  it('validação: responder sem texto vira "não responder"; texto longo é cortado', () => {
    expect(validarAtendimento({ responder: true, texto: '  ', chamar_equipe: false, pergunta: '' }).responder).toBe(false)
    expect(validarAtendimento({ responder: true, texto: 'x'.repeat(900), chamar_equipe: false, pergunta: '' }).texto).toHaveLength(700)
  })
  it('simulado: orçamento confirma o anotado e pergunta o que falta; "[pessoal]" fica quieto', async () => {
    const ia = new SimuladoProvider()
    const r = await ia.estruturado(pedidoAtendimento(base))
    expect(r.dados.responder).toBe(true)
    expect(r.dados.texto).toContain('Aqui é o assistente da Ponto Visual')
    expect(r.dados.texto).toContain('2× Banner 2×1 m')
    const pessoal = await ia.estruturado(pedidoAtendimento({ ...base, assunto: 'duvida', rascunho: null, conversa: [{ de: 'cliente', texto: 'mãe, chego tarde hoje [pessoal]' }] }))
    expect(pessoal.dados.responder).toBe(false)
  })
})

describe('Atendente: envio sozinho', () => {
  const certo = { negociando: false, fora: [], faltando: [], liberacaoPendente: false, total: '440.00', limite: '500' }
  it('tudo certo e dentro do limite: envia', () => {
    expect(motivoSemEnvio(certo)).toBeNull()
    expect(motivoSemEnvio({ ...certo, limite: null })).toBeNull()
    expect(motivoSemEnvio({ ...certo, total: '500.00' })).toBeNull()
  })
  it('qualquer coisa fora do lugar: fica o rascunho para o ok (e o dono vê o porquê)', () => {
    expect(motivoSemEnvio({ ...certo, total: '500.01' })).toBe('passou do seu limite de R$ 500')
    expect(motivoSemEnvio({ ...certo, negociando: true })).toBe('o cliente falou em desconto')
    expect(motivoSemEnvio({ ...certo, fora: ['50× chaveiro'] })).toBe('tem item fora do catálogo')
    expect(motivoSemEnvio({ ...certo, faltando: ['Banner: acabamento'] })).toBe('falta confirmar detalhes com o cliente')
    expect(motivoSemEnvio({ ...certo, liberacaoPendente: true })).toBe('as regras pedem a liberação de um gerente')
    expect(motivoSemEnvio({ ...certo, total: '0' })).toBe('o total ficou zerado')
  })
  it('negociação: desconto, "faz por", "mais barato"', () => {
    for (const t of ['tem desconto?', 'faz por 300?', 'vi mais barato em outro lugar', 'dá pra fazer por 200', 'consegue um descontinho?']) expect(negociando([t])).toBe(true)
    for (const t of ['quero 2 banners 2x1', 'pra sexta', 'quanto fica?']) expect(negociando([t])).toBe(false)
  })
  it('aviso ao dono: o que saiu, para quem e por quanto', () => {
    expect(
      textoEnviadoSozinho({ numero: 'ORC-2026-0142', cliente: 'Carla Teste', total: '440.00', itens: [{ descricao: 'Banner', quantidade: '2', largura: '2', altura: '1', total: '320' }], link: 'http://x/o/1', alerta: null }),
    ).toBe('🤖 Ninguém respondeu Carla Teste, então enviei o ORC-2026-0142 (R$ 440): tudo no catálogo e dentro do seu limite.\n1) 2× Banner 2×1 m — R$ 320\nhttp://x/o/1')
  })
})

describe('Atendente: já atendendo', () => {
  it('respondeu esse número há pouco e ninguém entrou: a próxima sai entre 15 e 35 segundos', () => {
    const c = conversa({ ultimaEm: antes(36_000), ultimaPendenteEm: antes(36_000) })
    expect(quandoAtender(c, ctx())).toEqual({ atender: false, motivo: 'cedo' })
    expect(quandoAtender(c, { ...ctx(), ultimaDoAtendenteEm: antes(10 * min) })).toEqual({ atender: true })
    // Ainda escrevendo (menos de 15 segundos): espera
    expect(quandoAtender(conversa({ ultimaEm: antes(10_000), ultimaPendenteEm: antes(10_000) }), { ...ctx(), ultimaDoAtendenteEm: antes(10 * min) })).toEqual({ atender: false, motivo: 'cedo' })
    // O sorteio fica sempre entre 15 e 35 segundos e é o mesmo para a mesma mensagem
    for (let i = 0; i < 50; i++) {
      const e = esperaSeguida(new Date(agora.getTime() - i * 7_919))
      expect(e).toBeGreaterThanOrEqual(15_000)
      expect(e).toBeLessThan(35_000)
    }
    expect(esperaSeguida(agora)).toBe(esperaSeguida(new Date(agora)))
    // O dono entrou depois: fica de fora
    expect(quandoAtender(c, { ...ctx(), ultimaDoAtendenteEm: antes(10 * min), ultimaDoDonoEm: antes(5 * min) })).toEqual({ atender: false, motivo: 'dono' })
  })
})

describe('Atendente: só "oi" (o menu)', () => {
  it('saudação sozinha não nasce resolvida; agradecimento sim', () => {
    for (const t of ['oi', 'Oiii', 'Bom dia!', 'boa tarde, tudo bem?', 'olá pessoal', 'tem alguém aí?']) expect(soSaudacao([t])).toBe(true)
    for (const t of ['obrigado', 'ok', 'oi, quanto fica um banner?', 'oi amor', '👍']) expect(soSaudacao([t])).toBe(false)
    expect(soCortesia(['bom dia'])).toBe(true)
  })
  it('a saudação entra mesmo com assunto "outro" (o resto do "outro" não)', () => {
    expect(quandoAtender(conversa({ assunto: 'outro', assuntoVia: 'regras', saudacao: true }), ctx())).toEqual({ atender: true })
    expect(quandoAtender(conversa({ assunto: 'outro', saudacao: false }), ctx())).toEqual({ atender: false, motivo: 'sem_assunto' })
  })
  it('menu de quem já é cliente: o que está em aberto (só o número) e as opções numeradas', () => {
    const manha = new Date('2026-10-28T12:00:00Z') // 9h em Brasília
    expect(textoMenuCliente({ grafica: 'Ponto Visual', nome: 'Eduardo', agora: manha, orcamentos: ['ORC-2026-0104'], pedido: 'PED-2026-0069', catalogo: true })).toBe(
      [
        'Bom dia, Eduardo! 😊 Aqui é o assistente da Ponto Visual.',
        'No momento o pessoal não pode atender, mas vi que você tem o orçamento *ORC-2026-0104* esperando sua aprovação e o pedido *PED-2026-0069* em andamento.',
        '',
        'Posso te ajudar a:',
        '1️⃣ Ver o orçamento',
        '2️⃣ Ver como está o pedido',
        '3️⃣ Fazer um novo orçamento',
        '4️⃣ Receber nosso catálogo',
        '',
        'Pode responder com o número ou me contar do seu jeito. Fico à disposição!',
      ].join('\n'),
    )
  })
  it('primeiro contato: fazer um orçamento e o catálogo; a saudação segue a hora', () => {
    expect(textoMenuCliente({ grafica: 'Ponto Visual', nome: null, agora, orcamentos: [], pedido: null, catalogo: true })).toBe(
      [
        'Boa noite! 😊 Aqui é o assistente da Ponto Visual.',
        'No momento o pessoal não pode atender, mas já posso te ajudar.',
        '',
        'Posso te ajudar a:',
        '1️⃣ Fazer um orçamento',
        '2️⃣ Receber nosso catálogo',
        '',
        'Pode responder com o número ou me contar do seu jeito. Fico à disposição!',
      ].join('\n'),
    )
    expect(textoMenuCliente({ grafica: 'X', nome: null, agora, orcamentos: [], pedido: null, catalogo: false })).not.toContain('catálogo')
    expect(saudacaoDaHora(new Date('2026-10-28T17:00:00Z'))).toBe('Boa tarde')
    expect(fraseDoPedido('em_producao', 'amanhã')).toBe('está em produção (previsão: amanhã)')
  })
  it('com o atendente na conversa, a mensagem sem assunto ("1", "o catálogo") é atendida', () => {
    const escolha = conversa({ assunto: 'outro', assuntoVia: 'assistente' })
    expect(quandoAtender(escolha, ctx())).toEqual({ atender: false, motivo: 'sem_assunto' })
    expect(quandoAtender(escolha, { ...ctx(), emAtendimento: true })).toEqual({ atender: true })
  })
})

describe('"Você": o menu', () => {
  it('"menu", "ajuda", "oi", "o que você faz?" pedem o menu; comandos não', () => {
    for (const t of ['menu', 'Ajuda', 'oi', 'o que você faz?', 'o que posso fazer aqui?', 'bom dia']) expect(pedeMenu(t)).toBe(true)
    for (const t of ['ok', 'quem está devendo?', 'orçamento pra Ana: 2 banners', '10% de desconto']) expect(pedeMenu(t)).toBe(false)
  })
  it('o menu diz como está o atendente', () => {
    const ligado = textoMenuVoce({ grafica: 'Ponto Visual', atendente: { ativo: true, esperaMin: 5, envia: true, limite: '500' } })
    expect(ligado).toContain('🤖 *Atendente*: ligado: respondo o cliente quando ninguém responde em 5 min, e envio o orçamento sozinho quando está tudo certo (até R$ 500)')
    expect(textoMenuVoce({ grafica: 'X', atendente: { ativo: false, esperaMin: 5, envia: false, limite: null } })).toContain('🤖 *Atendente*: desligado')
  })
})

describe('Atendente: o que o cliente pediu (sem depender da IA)', () => {
  const tudo = { orcamento: true, pedido: true }
  const opcoes = opcoesDoMenu({ orcamento: true, pedido: true, catalogo: true })
  it('pelo número do menu', () => {
    expect(opcoes).toEqual(['ver_orcamento', 'ver_pedido', 'novo_orcamento', 'catalogo'])
    expect(pedidoDoCliente('1', { ...tudo, opcoes })).toBe('ver_orcamento')
    expect(pedidoDoCliente('4️⃣', { ...tudo, opcoes })).toBe('catalogo')
    expect(pedidoDoCliente('opção 2', { ...tudo, opcoes })).toBe('ver_pedido')
    // Sem o menu aberto, o número não quer dizer nada
    expect(pedidoDoCliente('1', { ...tudo, opcoes: null })).toBeNull()
    // Primeiro contato: 1 = orçamento, 2 = catálogo
    expect(pedidoDoCliente('2', { orcamento: false, pedido: false, opcoes: opcoesDoMenu({ orcamento: false, pedido: false, catalogo: true }) })).toBe('catalogo')
  })
  it('pelas palavras, do jeito que o cliente escreve', () => {
    const c = { ...tudo, opcoes: null }
    for (const t of ['Quero ver que orçamento é esse', 'me manda o orçamento de novo', 'qual o valor do orçamento?', 'não achei o orçamento']) expect(pedidoDoCliente(t, c)).toBe('ver_orcamento')
    for (const t of ['e como está o meu pedido', 'meu pedido já ficou pronto?', 'qual a previsão?']) expect(pedidoDoCliente(t, c)).toBe('ver_pedido')
    for (const t of ['quero o catalogo', 'queria conhecer mais o que vocês produzem', 'tem catálogo?', 'quais são os produtos']) expect(pedidoDoCliente(t, c)).toBe('catalogo')
    for (const t of ['quero fazer um orçamento', 'queria um novo orçamento']) expect(pedidoDoCliente(t, c)).toBe('novo_orcamento')
  })
  it('o resto vai à IA (orçamento com produto, pergunta de filtro, sem pedido/orçamento em aberto)', () => {
    const c = { ...tudo, opcoes: null }
    expect(pedidoDoCliente('quero um orçamento de 2 banners 2x1', c)).toBeNull()
    expect(pedidoDoCliente('vocês fazem adesivo pra carro?', c)).toBeNull()
    expect(pedidoDoCliente('me manda o orçamento', { orcamento: false, pedido: false, opcoes: null })).toBeNull()
    expect(pedidoDoCliente('como está meu pedido?', { orcamento: false, pedido: false, opcoes: null })).toBeNull()
  })
  it('respostas prontas no meio da conversa: sem "Olá" e sem assinatura', () => {
    expect(semCabecalho('Olá, Eduardo!\n\nSeu pedido *PED-1* está esperando a arte.\n\n— Ponto Visual')).toBe('Seu pedido *PED-1* está esperando a arte.')
    // O PDF na conversa (o principal) e o link do site como opção
    expect(textoCatalogo('http://site', true)).toBe('Claro! Segue o nosso catálogo 👇\nSe preferir, veja também pelo site: http://site')
    expect(textoCatalogo(null, true)).toBe('Claro! Segue o nosso catálogo 👇')
    // Depois da mídia, o convite para o orçamento
    expect(textoConviteOrcamento('fotos')).toBe('Gostou de algum? Me diz qual e a quantidade que eu já preparo o orçamento 😊')
    expect(textoConviteOrcamento('catalogo')).toBe('Viu algo que te interessou? É só me dizer o produto e a quantidade que eu já preparo o orçamento 😊')
    expect(textoCatalogo('http://site', false)).toBe('Claro! Aqui está o nosso catálogo: http://site')
  })
  it('produtos: a IA escolhe pelo código; a foto vai com o nome e a descrição na legenda', () => {
    const p = { codigo: 'P3', nome: 'Adesivo perfurado para vidro', categoria: 'Comunicação visual', descricao: 'Vê de dentro, imprime de fora.', imagemArquivoId: 'a1', link: null as string | null }
    expect(linhaDoProduto(p)).toBe('P3 · Adesivo perfurado para vidro · Comunicação visual · com foto · Vê de dentro, imprime de fora.')
    expect(legendaDoProduto(p)).toBe('*Adesivo perfurado para vidro*\nVê de dentro, imprime de fora.')
    expect(legendaDoProduto({ ...p, link: 'http://site/produto/adesivo' })).toBe('*Adesivo perfurado para vidro*\nVê de dentro, imprime de fora.\nVer no site: http://site/produto/adesivo')
    expect(linhaDoProduto({ ...p, descricao: null, imagemArquivoId: null })).toBe('P3 · Adesivo perfurado para vidro · Comunicação visual · sem foto')
    // Só códigos válidos, no máximo 3
    expect(validarAtendimento({ responder: true, texto: 'Fazemos sim!', chamar_equipe: false, pergunta: '', reenviar_orcamento: '', mostrar_produtos: ['p3', 'P1', 'banner', 'P2', 'P9'] }).mostrarProdutos).toEqual(['P3', 'P1', 'P2'])
  })
})

describe('Atendente: o horário calculado pelo sistema (a IA não faz conta)', () => {
  const horario = 'Seg a sex, 8h às 18h · Sáb, 9h às 13h'
  // Horário de Brasília = UTC−3
  const em = (iso: string) => new Date(`${iso}-03:00`)
  it('aberta agora: até quando', () => {
    expect(funcionamentoAgora(horario, em('2026-10-27T10:34:00'))).toBe('aberta agora (até 18h)')
    expect(funcionamentoAgora(horario, em('2026-10-31T10:00:00'))).toBe('aberta agora (até 13h)')
  })
  it('fechada: quando abre de novo (hoje mais tarde, amanhã ou o próximo dia)', () => {
    expect(funcionamentoAgora(horario, em('2026-10-27T07:10:00'))).toBe('fechada agora; abre hoje às 8h')
    expect(funcionamentoAgora(horario, em('2026-10-27T22:14:00'))).toBe('fechada agora; abre amanhã às 8h')
    expect(funcionamentoAgora(horario, em('2026-10-30T19:00:00'))).toBe('fechada agora; abre amanhã às 9h')
    expect(funcionamentoAgora(horario, em('2026-10-31T15:00:00'))).toBe('fechada agora; abre na segunda às 8h')
  })
  it('outros jeitos de escrever; sem horário entendível, nada (ele não fala de horário)', () => {
    expect(funcionamentoAgora('Segunda a sexta das 8:30 às 17:30', em('2026-10-27T17:45:00'))).toBe('fechada agora; abre amanhã às 8h30')
    expect(funcionamentoAgora('seg-sex 9h-18h', em('2026-10-27T12:00:00'))).toBe('aberta agora (até 18h)')
    expect(funcionamentoAgora('Atendimento combinado pelo WhatsApp', em('2026-10-27T12:00:00'))).toBeNull()
    expect(funcionamentoAgora(null, em('2026-10-27T12:00:00'))).toBeNull()
  })
})
