import { palavras, pontuar, semAcentos } from './texto'

/*
 * Respostas do provedor simulado para as ajudas internas (orçamento a partir de texto, produto, descrição): regras
 * simples por palavras-chave sobre o mesmo conteúdo que iria ao modelo, para a tela poder ser usada sem rede e os
 * testes serem determinísticos. Devolvem o JSON no formato do schema de cada tarefa (prompts-equipe.ts).
 */

/** Texto entre <tag> e </tag> */
const entre = (conteudo: string, tag: string) => new RegExp(`<${tag}>\\n?([\\s\\S]*?)\\n?</${tag}>`).exec(conteudo)?.[1]?.trim() ?? ''

/** Linhas "REF | a | b" de uma lista do conteúdo (as que começam com o prefixo da referência) */
function linhas(conteudo: string, prefixo: string) {
  return conteudo
    .split('\n')
    .filter((l) => new RegExp(`^${prefixo}\\d+ \\| `).test(l))
    .map((l) => l.split(' | '))
}

/** "1.000" → 1000; "2,5" → 2.5 */
const numero = (t: string) => Number(/^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t.replace(',', '.'))

/** O que tem mais palavras em comum (e, no empate, a maior parte do nome dele) */
function melhor<T>(pedido: string[], opcoes: T[], nome: (x: T) => string): { item: T; nota: number } | null {
  let achado: { item: T; nota: number; pontos: number } | null = null
  for (const item of opcoes) {
    const alvo = palavras(nome(item))
    const pontos = pontuar(pedido, alvo)
    if (!pontos) continue
    const nota = pontos / Math.max(1, alvo.length)
    if (!achado || pontos > achado.pontos || (pontos === achado.pontos && nota > achado.nota)) achado = { item, nota, pontos }
  }
  return achado
}

const DIAS = 'segunda|terça|terca|quarta|quinta|sexta|sábado|sabado|domingo|amanhã|amanha|hoje'

export function orcamentoSimulado(conteudo: string) {
  // Telefone e e-mail já chegam mascarados ("[número omitido]"): não viram item
  const pedido = entre(conteudo, 'pedido_do_cliente').replace(/\[[^\]]*omitido\]/g, ' ')
  const catalogo = linhas(conteudo, 'P').map(([ref, nome, categoria, cobra, ...resto]) => {
    const acabs = (resto.find((r) => r.startsWith('acabamentos: ')) ?? '').replace('acabamentos: ', '')
    return {
      ref: ref!,
      nome: nome!,
      categoria: categoria ?? '',
      medidas: /m²|metro linear/.test(cobra ?? ''),
      acabamentos: acabs === 'nenhum' ? [] : acabs.split(', ').flatMap((a) => (/\(sempre incluído\)/.test(a) ? [] : [{ ref: a.split(' ')[0]!, nome: a.slice(a.indexOf(' ') + 1) }])),
    }
  })
  const partes = pedido.split(/\n|;|,|\s+e\s+(?=\d)|\s+mais\s+/i).map((p) => p.trim()).filter(Boolean)
  const itens: unknown[] = []
  const naoIdentificados: string[] = []
  let prazo: string | null = null
  for (const parte of partes) {
    const dataPedida = new RegExp(`(?:entrega|entregar|para|até|ate|prazo)\\s+(?:na |no |dia |até )?((?:${DIAS})(?:-feira)?|dia \\d+(?:/\\d+)?)`, 'i').exec(parte)
    const p = melhor(palavras(parte), catalogo, (x) => x.nome)
    if (!p) {
      if (dataPedida) prazo ??= dataPedida[1]!
      else if (/\d/.test(parte) || palavras(parte).length) naoIdentificados.push(parte)
      continue
    }
    const medida = /(\d+(?:[.,]\d+)?)\s*[x×]\s*(\d+(?:[.,]\d+)?)\s*(cm|mm|m)?\b/i.exec(parte)
    const semMedida = medida ? parte.replace(medida[0], ' ') : parte
    const qtd = /(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(mil\b)?/i.exec(semMedida)
    const quantidade = qtd ? numero(qtd[1]!) * (qtd[2] ? 1000 : 1) : /\bmil\b/i.test(semMedida) ? 1000 : null
    let largura: number | null = null
    let altura: number | null = null
    if (medida && p.item.medidas) {
      const [a, b] = [numero(medida[1]!), numero(medida[2]!)]
      const div = medida[3]?.toLowerCase() === 'mm' ? 1000 : medida[3]?.toLowerCase() === 'cm' || (!medida[3] && a > 10 && b > 10) ? 100 : 1
      largura = a / div
      altura = b / div
    }
    const palavrasParte = palavras(parte)
    itens.push({
      produto: p.item.ref,
      descricao: parte.replace(/\s+/g, ' ').slice(0, 120),
      quantidade: quantidade ?? 1,
      largura_m: largura,
      altura_m: altura,
      // Metade das palavras do acabamento no pedido ("frente e verso" não vira "Laminação fosca frente")
      acabamentos: p.item.acabamentos.filter((a) => pontuar(palavrasParte, palavras(a.nome)) >= Math.max(1, Math.ceil(palavras(a.nome).length / 2))).map((a) => a.ref),
      observacao: /frente e verso/i.test(parte) ? 'Frente e verso' : null,
      confianca: p.nota >= 0.5 && quantidade !== null ? 0.9 : 0.62,
      motivo: `O pedido fala em “${parte.slice(0, 40)}”, que combina com ${p.item.nome}.`,
    })
    if (dataPedida) prazo ??= dataPedida[1]!
  }
  const cliente = /\b(?:cliente|sou (?:o|a)|aqui (?:é|e) (?:o|a))\s+([A-ZÀ-Ú][\p{L}]+(?:\s+[A-ZÀ-Ú][\p{L}]+)?)/u.exec(pedido)
  return {
    itens,
    cliente_nome: cliente?.[1] ?? null,
    prazo_desejado: prazo,
    observacoes: /pix|cart[aã]o de cr[eé]dito|retir/i.test(pedido) ? 'O cliente comentou sobre pagamento ou retirada.' : null,
    nao_identificados: naoIdentificados,
  }
}

export function produtoSimulado(conteudo: string) {
  const texto = entre(conteudo, 'descricao_da_equipe')
  const t = semAcentos(texto)
  const pal = palavras(texto)
  const modo = /m²|m2|metro quadrado/.test(t) ? 'm2' : /milheiro|\bmil\b/.test(t) ? 'milheiro' : /metro linear|por metro\b/.test(t) ? 'metro_linear' : /por hora/.test(t) ? 'hora' : 'unidade'
  const sigla = { m2: 'm²', milheiro: 'mil', metro_linear: 'm', hora: 'h', unidade: 'un' }[modo]
  const unidade = linhas(conteudo, 'U').find(([, s]) => s!.startsWith(`${sigla} (`))?.[0] ?? null
  const categoria = melhor(pal, linhas(conteudo, 'C'), (l) => l[1]!)
  const insumos = linhas(conteudo, 'I').filter((l) => {
    const alvo = palavras(l[1]!)
    const pontos = pontuar(pal, alvo)
    return pontos >= 2 || (pontos >= 1 && pontos / alvo.length >= 0.5)
  })
  const comuns = (l: string[]) => pontuar(pal, palavras(l[1]!)) > 0
  const margem = /(\d+(?:[.,]\d+)?)\s*%/.exec(texto)
  const prazo = /(\d+)\s*dias?/.exec(t)
  const nome = texto.split(/[,;.\n]/)[0]!.trim().slice(0, 80)
  const acabamentos = linhas(conteudo, 'A').filter(comuns)
  return {
    nome: nome.charAt(0).toUpperCase() + nome.slice(1),
    tipo: /instala|servico|criacao de arte/.test(t) ? 'servico' : 'produto',
    categoria: categoria ? categoria.item[0]! : null,
    categoria_nova: null,
    modo_cobranca: modo,
    unidade,
    largura_padrao_m: null,
    altura_padrao_m: null,
    prazo_producao_dias: prazo ? Number(prazo[1]) : null,
    precisa_arte: /impress|personaliz|arte/.test(t),
    insumos: insumos.map((l) => ({ insumo: l[0]!, quantidade: 1, base: modo === 'm2' && l[2] === 'm²' ? 'por_m2' : modo === 'metro_linear' && l[2] === 'm' ? 'por_metro_linear' : 'por_unidade' })),
    insumos_nao_encontrados: [],
    etapas: linhas(conteudo, 'E')
      .filter(comuns)
      .map((l) => ({ etapa: l[0]!, maquina: /máquina padrão (M\d+)/.exec(l[2] ?? '')?.[1] ?? null })),
    acabamentos: acabamentos.map((l) => l[0]!),
    margem_percentual: margem ? numero(margem[1]!) : null,
    descricao: `${nome.charAt(0).toUpperCase()}${nome.slice(1)}${insumos.length ? `, feito com ${insumos.map((l) => l[1]!.replace(/\s*\(.*\)$/, '').toLowerCase()).join(' e ')}` : ''}.${acabamentos.length ? ` Pode ter ${acabamentos.map((l) => l[1]!.toLowerCase()).join(' e ')}.` : ''}`,
  }
}

export function descricaoSimulada(conteudo: string) {
  const dados = entre(conteudo, 'produto')
  const campo = (nome: string) => new RegExp(`^${nome}: (.+)$`, 'm').exec(dados)?.[1]?.trim() ?? null
  const grafica = /^Gráfica: (.+)$/m.exec(conteudo)?.[1] ?? 'a gráfica'
  const vitrine = /Destino: site/.test(conteudo)
  const nome = campo('Nome') ?? 'Produto'
  const materiais = campo('Materiais')
  const acabamentos = campo('Acabamentos disponíveis')
  const base = `${nome}${materiais ? `, feito com ${materiais.toLowerCase()}` : ''}.${acabamentos ? ` Acabamentos disponíveis: ${acabamentos.toLowerCase()}.` : ''}`
  return { texto: vitrine ? `${base}\n\nFale com a ${grafica} para combinar quantidade, medidas e arte do seu pedido.` : base }
}

/** Percentuais da frase ("5%", "3 por cento") */
const percentuais = (t: string) => [...t.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:%|por cento)/g)].map((m) => numero(m[1]!))
const POR_EXTENSO: Record<string, number> = { um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9, dez: 10 }

/** "sempre" | "sugerir" | "se_pedir" pelas palavras da frase (null = não disse) */
function comoUsar(t: string): string | null {
  if (/\b(se (o cliente )?(pedir|chorar|negociar)|so se|so quando (o cliente )?pedir|quando (o cliente )?pedir)\b/.test(t)) return 'se_pedir'
  if (/\b(sugerir|sugira|sugere|oferecer|ofereca|oferece|lembrar|lembre)\b/.test(t)) return 'sugerir'
  if (/\b(sempre|automatic|todo pedido|todos os pedidos)/.test(t)) return 'sempre'
  return null
}

/**
 * "Explique com suas palavras": cada frase do dono vira uma pergunta pelas palavras-chave (urgência, mínimo, à vista,
 * cliente especial, quantidade, limite do vendedor, nessa ordem); o que não encaixa vai para nao_entendido.
 */
export function regrasSimuladas(conteudo: string) {
  const texto = entre(conteudo, 'texto_do_dono')
  const etiquetas = (/^Etiquetas que a gráfica já usa nos clientes: (.+)$/m.exec(conteudo)?.[1] ?? '').split(', ').filter(Boolean)
  const r: Record<string, unknown> = { quantidade: null, a_vista: null, clientes_especiais: null, urgencia: null, pedido_minimo: null, limite_vendedor: null, nao_entendido: [] }
  const naoEntendido: string[] = []
  for (const frase of texto.split(/(?<=[.;!?])\s+|\n+/).map((f) => f.trim()).filter(Boolean)) {
    const t = semAcentos(frase)
    const pct = percentuais(t)
    if (/urgen|pressa|correria/.test(t) && pct.length) {
      const dias = /(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+dias?/.exec(t)?.[1]
      r.urgencia = { percentual: pct[0]!, dias_uteis: dias ? (POR_EXTENSO[dias] ?? Number(dias)) : null }
    } else if (/minimo/.test(t) && /r\$|reais/.test(t)) {
      const valor = /r\$\s*(\d+(?:[.,]\d+)?)|(\d+(?:[.,]\d+)?)\s*reais/.exec(t)
      if (valor) r.pedido_minimo = { valor: numero(valor[1] ?? valor[2]!) }
      else naoEntendido.push(frase)
    } else if (/\bpix\b|a vista/.test(t) && pct.length) {
      r.a_vista = { percentual: pct[0]!, como_usar: comoUsar(t) }
    } else if (/revend|\bvip\b|parceir|etiqueta|cliente especial/.test(t) && pct.length) {
      const citada = /etiqueta\s+["“]?([\p{L}\d]+)/u.exec(frase)?.[1]
      const palavra = citada ?? (/revend/.test(t) ? 'Revenda' : /\bvip\b/.test(t) ? 'VIP' : /parceir/.test(t) ? 'Parceiro' : null)
      // Combina com uma etiqueta que a gráfica já usa ("revendedores" → "Revenda")
      const etiqueta = palavra ? (etiquetas.find((e) => semAcentos(e).slice(0, 5) === semAcentos(palavra).slice(0, 5)) ?? palavra) : null
      if (etiqueta) r.clientes_especiais = { lista: [{ etiqueta, percentual: pct[0]! }], como_usar: comoUsar(t) }
      else naoEntendido.push(frase)
    } else if (/unidade|peca|quantidade|acima de|a partir de/.test(t) && pct.length) {
      const qtds = [...t.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+)\s*(?:un\b|unidades|pecas|copias)/g)].map((m) => numero(m[1]!))
      const faixas = qtds.map((q, i) => ({ a_partir_de: q, percentual: pct[i] ?? pct[pct.length - 1]! }))
      if (faixas.length) r.quantidade = { faixas, como_usar: comoUsar(t) }
      else naoEntendido.push(frase)
    } else if (/vendedor|equipe|sem (me )?(perguntar|consultar|falar)/.test(t) && pct.length) {
      r.limite_vendedor = { percentual: pct[0]! }
    } else naoEntendido.push(frase)
  }
  r.nao_entendido = naoEntendido
  return r
}
