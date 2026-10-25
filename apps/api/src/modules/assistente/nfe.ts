import { Decimal, cnpjValido, cpfValido } from '@onprint/shared'

/*
 * Leitura do XML da NF-e (sem IA: exata). Aceita o arquivo que o fornecedor manda (nfeProc com a NFe e o protocolo) ou
 * só a NFe, com ou sem prefixo de namespace. Lê o emitente, a identificação (nNF, série, emissão), os itens (det/prod),
 * o total (ICMSTot), as duplicatas (cobr/dup) e as formas de pagamento (pag/detPag). Valores como texto decimal.
 */

export interface NotaBruta {
  /** Chave de acesso (44 dígitos) */
  chave: string | null
  numero: string | null
  serie: string | null
  /** AAAA-MM-DD */
  emissao: string | null
  emitente: {
    /** Só dígitos (CNPJ, ou CPF de produtor) */
    documento: string | null
    nome: string
    fantasia: string | null
    ie: string | null
    telefone: string | null
    endereco: { cep: string | null; logradouro: string | null; numero: string | null; complemento: string | null; bairro: string | null; cidade: string | null; uf: string | null } | null
  }
  itens: { codigo: string | null; descricao: string; ncm: string | null; cfop: string | null; unidade: string | null; quantidade: string; valorUnitario: string; valorTotal: string }[]
  totalProdutos: string
  totalNota: string
  parcelas: { numero: string | null; vencimento: string; valor: string }[]
  /** tPag (01 dinheiro, 03 cartão, 15 boleto, 17 Pix…) e valor */
  pagamentos: { forma: string; valor: string }[]
}

export class ErroNfe extends Error {
  constructor(mensagem: string) {
    super(mensagem)
    this.name = 'ErroNfe'
  }
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function decodificar(t: string): string {
  return t
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e: string) =>
      e[0] === '#' ? String.fromCodePoint(e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (ENTIDADES[e.toLowerCase()] ?? m),
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Conteúdo de cada <tag …>…</tag> (na ordem) */
function blocos(xml: string, tag: string): string[] {
  return [...xml.matchAll(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`, 'g'))].map((m) => m[1]!)
}
const bloco = (xml: string, tag: string) => blocos(xml, tag)[0] ?? ''

/** Texto da primeira <tag> (null = não tem ou vazia) */
function valor(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`).exec(xml)
  const t = m ? decodificar(m[1]!) : ''
  return t || null
}

/** "2.0000" → "2"; inválido = null */
function decimal(t: string | null): string | null {
  if (!t || !/^-?\d+(\.\d+)?$/.test(t)) return null
  return new Decimal(t).toString()
}

/** Lê o XML da NF-e. Lança ErroNfe (mensagem para a pessoa) se não for uma NF-e que dê para usar. */
export function lerNfe(conteudo: string): NotaBruta {
  // Sem prefixos de namespace (<nfe:det> → <det>) e sem a assinatura (não interessa e é grande)
  const sem = conteudo.charCodeAt(0) === 0xfeff ? conteudo.slice(1) : conteudo
  const xml = sem.replace(/<(\/?)[A-Za-z_][\w.-]*:/g, '<$1').replace(/<Signature[\s\S]*?<\/Signature>/g, '')
  const inf = /<infNFe(\s[^>]*)?>([\s\S]*?)<\/infNFe>/.exec(xml)
  if (!inf) throw new ErroNfe('Este arquivo não é o XML de uma NF-e (falta a parte infNFe).')
  const corpo = inf[2]!
  const chave = /Id="NFe(\d{44})"/.exec(inf[1] ?? '')?.[1] ?? null

  const ide = bloco(corpo, 'ide')
  const emit = bloco(corpo, 'emit')
  const end = bloco(emit, 'enderEmit')
  const cnpj = valor(emit, 'CNPJ')
  const cpf = valor(emit, 'CPF')
  const documento = cnpj && cnpjValido(cnpj) ? cnpj : cpf && cpfValido(cpf) ? cpf : null
  const nome = valor(emit, 'xNome')
  if (!nome) throw new ErroNfe('O XML não tem o nome do emitente (fornecedor).')

  const itens = blocos(corpo, 'det').map((det, i) => {
    const prod = bloco(det, 'prod')
    const quantidade = decimal(valor(prod, 'qCom'))
    const valorUnitario = decimal(valor(prod, 'vUnCom'))
    const valorTotal = decimal(valor(prod, 'vProd'))
    const descricao = valor(prod, 'xProd')
    if (!quantidade || !valorUnitario || !valorTotal || !descricao) throw new ErroNfe(`O item ${i + 1} do XML está incompleto (quantidade, valor ou descrição).`)
    return { codigo: valor(prod, 'cProd'), descricao, ncm: valor(prod, 'NCM'), cfop: valor(prod, 'CFOP'), unidade: valor(prod, 'uCom'), quantidade, valorUnitario, valorTotal }
  })
  if (!itens.length) throw new ErroNfe('O XML não tem itens.')

  const tot = bloco(bloco(corpo, 'total'), 'ICMSTot')
  const totalProdutos = decimal(valor(tot, 'vProd')) ?? itens.reduce((s, i) => s.plus(i.valorTotal), new Decimal(0)).toString()
  const totalNota = decimal(valor(tot, 'vNF')) ?? totalProdutos

  const parcelas = blocos(bloco(corpo, 'cobr'), 'dup').flatMap((d) => {
    const vencimento = valor(d, 'dVenc')
    const v = decimal(valor(d, 'vDup'))
    return vencimento && /^\d{4}-\d{2}-\d{2}$/.test(vencimento) && v ? [{ numero: valor(d, 'nDup'), vencimento, valor: v }] : []
  })
  const pagamentos = blocos(bloco(corpo, 'pag'), 'detPag').flatMap((p) => {
    const v = decimal(valor(p, 'vPag'))
    return v ? [{ forma: valor(p, 'tPag') ?? '99', valor: v }] : []
  })
  // dhEmi (2026-10-20T10:15:00-03:00) ou dEmi (layout antigo)
  const emissao = (valor(ide, 'dhEmi') ?? valor(ide, 'dEmi'))?.slice(0, 10) ?? null

  return {
    chave,
    numero: valor(ide, 'nNF'),
    serie: valor(ide, 'serie'),
    emissao: emissao && /^\d{4}-\d{2}-\d{2}$/.test(emissao) ? emissao : null,
    emitente: {
      documento,
      nome,
      fantasia: valor(emit, 'xFant'),
      ie: valor(emit, 'IE'),
      telefone: valor(end, 'fone'),
      endereco: end
        ? { cep: valor(end, 'CEP'), logradouro: valor(end, 'xLgr'), numero: valor(end, 'nro'), complemento: valor(end, 'xCpl'), bairro: valor(end, 'xBairro'), cidade: valor(end, 'xMun'), uf: valor(end, 'UF') }
        : null,
    },
    itens,
    totalProdutos,
    totalNota,
    parcelas,
    pagamentos,
  }
}
