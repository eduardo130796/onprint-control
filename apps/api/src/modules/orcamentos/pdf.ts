import { createRequire } from 'node:module'
import { createElement as h, type ReactElement, type ReactNode } from 'react'
import { Document, Font, Image, Page, StyleSheet, Text, View, renderToBuffer, type DocumentProps } from '@react-pdf/renderer'
import {
  TEMAS,
  ajustesDoOrcamentoParaCliente,
  formatarCpfCnpj,
  formatarDataHora,
  formatarDataSimples,
  formatarMoeda,
  formatarTelefone,
  lerRegrasDoOrcamento,
  nomeCliente,
  resumoCondicoesPagamento,
  temaOuPadrao,
  textosDoItemParaCliente,
  textosParaCliente,
} from '@onprint/shared'

/*
 * PDF do orçamento gerado no servidor, para o "ok" na conversa "Você" do WhatsApp (o Assistente envia sem ninguém
 * abrir a tela). O mesmo desenho do PDF da web (apps/web/src/features/orcamentos/components/pdf/DocumentoOrcamento.tsx
 * e impressao/PecasPdf.tsx): faixa da marca, cabeçalho da empresa, cliente, itens, totais, pagamento, link de aprovação
 * e assinatura. Mudou um, mude o outro.
 */

// ─── Fontes: as mesmas da web (Manrope nos títulos, Inter no texto), com Helvetica se o pacote não estiver lá ───

let fontes: { texto: string; titulo: string } | null = null
function registrarFontes() {
  if (fontes) return fontes
  try {
    const req = createRequire(import.meta.url)
    const arquivo = (familia: string, peso: number) => req.resolve(`@fontsource/${familia}/files/${familia}-latin-${peso}-normal.woff`)
    Font.register({ family: 'Inter', fonts: [400, 500, 600, 700].map((p) => ({ src: arquivo('inter', p), fontWeight: p })) })
    Font.register({ family: 'Manrope', fonts: [600, 700, 800].map((p) => ({ src: arquivo('manrope', p), fontWeight: p })) })
    // Sem hifenização automática (palavras inteiras quebram melhor em português)
    Font.registerHyphenationCallback((palavra) => [palavra])
    fontes = { texto: 'Inter', titulo: 'Manrope' }
  } catch {
    fontes = { texto: 'Helvetica', titulo: 'Helvetica-Bold' }
  }
  return fontes
}

export interface EmpresaPdf {
  nomeFantasia: string | null
  razaoSocial: string
  cnpj: string | null
  whatsapp: string | null
  telefone: string | null
  email: string | null
  site: string | null
  logradouro: string | null
  numero: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  chavePix: string | null
  corTema: string | null
}

type Dec = { toString(): string }

export interface OrcamentoPdf {
  numero: string
  createdAt: Date
  validade: Date
  prazoDias: number
  subtotal: Dec
  desconto: Dec
  acrescimo: Dec
  frete: Dec
  total: Dec
  sinalPercentual: Dec
  parcelas: number
  intervaloDias: number
  condicoes: string | null
  observacoes: string | null
  regras: unknown
  cliente: { nome: string; fantasia: string | null; whatsapp: string | null; telefone: string | null; email: string | null; cpfCnpj: string | null }
  vendedor: { nome: string } | null
  itens: { descricao: string; quantidade: Dec; largura: Dec | null; altura: Dec | null; precoUnitario: Dec; desconto: Dec; total: Dec; observacao: string | null; acabamentos: { nome: string }[] }[]
}

const metros = (v: Dec | null) => (v ? Number(v.toString()).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')
const moeda = (v: Dec | number) => formatarMoeda(typeof v === 'number' ? v.toFixed(2) : v.toString())

function dadosEmpresa(e: EmpresaPdf) {
  const nome = e.nomeFantasia || e.razaoSocial
  const contato = [formatarTelefone(e.whatsapp ?? e.telefone), e.email, e.site].filter(Boolean).join('  ·  ')
  const endereco = [e.logradouro && `${e.logradouro}${e.numero ? `, ${e.numero}` : ''}`, e.bairro, e.cidade && `${e.cidade}/${e.uf ?? ''}`].filter(Boolean).join(' - ')
  return { nome, contato, endereco }
}

/** PDF (Buffer) do orçamento. `logo`: PNG/JPEG como data URL (ou null); `linkAprovacao`: o link público de aprovação. */
export async function pdfDoOrcamento(o: OrcamentoPdf, empresa: EmpresaPdf, opcoes: { logo: string | null; linkAprovacao: string }): Promise<Buffer> {
  const f = registrarFontes()
  const tema = TEMAS[temaOuPadrao(empresa.corTema)]
  const COR = {
    principal: '#2B3036',
    destaque: tema.cor,
    destaqueTexto: tema.escuro,
    fundoDestaque: tema.suave,
    tinta: '#1F2328',
    suave: '#4A5259',
    claro: '#7A838A',
    linha: '#E1E5E8',
    fundo: '#F3F5F6',
    laranja: '#F97316',
    branco: '#FFFFFF',
  }
  const MARGEM = 40
  const s = StyleSheet.create({
    pagina: { fontFamily: f.texto, fontSize: 9, color: COR.tinta, paddingTop: 0, paddingBottom: 64, paddingHorizontal: MARGEM },
    rotulo: { fontSize: 6.8, fontWeight: 600, color: COR.suave, letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 3 },
    forte: { fontWeight: 600 },
    suave: { color: COR.suave },
    faixa: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, flexDirection: 'row' },
    cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 34, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COR.linha, marginBottom: 16 },
    logo: { maxWidth: 150, maxHeight: 54, objectFit: 'contain', marginBottom: 6 },
    empresa: { fontFamily: f.titulo, fontWeight: 800, fontSize: 14, color: COR.principal, marginBottom: 3 },
    linhaEmpresa: { fontSize: 7.6, color: COR.suave, marginTop: 1.5 },
    tipo: { fontSize: 7.5, fontWeight: 700, color: COR.destaqueTexto, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'right' },
    numero: { fontFamily: f.titulo, fontWeight: 800, fontSize: 20, color: COR.principal, textAlign: 'right', marginTop: 2 },
    meta: { flexDirection: 'row', justifyContent: 'flex-end', gap: 14, marginTop: 6 },
    bloco: { flexDirection: 'row', backgroundColor: COR.fundo, borderRadius: 6, marginBottom: 16 },
    celulaBloco: { flex: 1, paddingVertical: 10, paddingHorizontal: 12 },
    divisor: { width: 1, backgroundColor: COR.linha, marginVertical: 8 },
    tabCab: { flexDirection: 'row', borderBottomWidth: 1.2, borderBottomColor: COR.principal, paddingBottom: 5, paddingHorizontal: 6 },
    tabLinha: { flexDirection: 'row', paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 0.6, borderBottomColor: COR.linha },
    totais: { marginLeft: 'auto', width: 240, marginTop: 12 },
    totLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2.5, paddingHorizontal: 10 },
    totFaixa: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COR.principal, borderRadius: 5, paddingVertical: 8, paddingHorizontal: 10, marginTop: 4 },
    nota: { borderLeftWidth: 3, borderLeftColor: COR.destaque, backgroundColor: COR.fundoDestaque, borderRadius: 4, paddingVertical: 8, paddingHorizontal: 12, marginTop: 14 },
    assinatura: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: 44 },
    linhaAss: { width: 270, borderTopWidth: 1, borderTopColor: COR.tinta, paddingTop: 5 },
    rodape: { position: 'absolute', left: MARGEM, right: MARGEM, bottom: 24, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.6, borderTopColor: COR.linha, paddingTop: 7, fontSize: 7, color: COR.claro },
  })

  const e = dadosEmpresa(empresa)
  const exibicao = nomeCliente(o.cliente)
  const razaoSocial = exibicao !== o.cliente.nome ? o.cliente.nome : null
  const contato = [formatarTelefone(o.cliente.whatsapp ?? o.cliente.telefone), o.cliente.email].filter(Boolean).join('  ·  ')
  const legal = [razaoSocial, o.cliente.cpfCnpj && formatarCpfCnpj(o.cliente.cpfCnpj)].filter(Boolean).join(' · ')
  // Regras comerciais: o que mudou no item (já no total dele), as do orçamento nos totais e as frases para o cliente
  const regras = lerRegrasDoOrcamento(o.regras)
  const condicoesEspeciais = textosParaCliente(regras)
  const n = (v: Dec) => Number(v.toString())
  const totais = [
    { rotulo: 'Subtotal', valor: moeda(o.subtotal) },
    ...(n(o.desconto) > 0 ? [{ rotulo: 'Desconto', valor: `− ${moeda(o.desconto)}` }] : []),
    ...(n(o.acrescimo) > 0 ? [{ rotulo: 'Acréscimo', valor: moeda(o.acrescimo) }] : []),
    ...ajustesDoOrcamentoParaCliente(regras).map((a) => ({ rotulo: a.rotulo, valor: `${Number(a.valor) < 0 ? '− ' : ''}${moeda(Math.abs(Number(a.valor)))}` })),
    ...(n(o.frete) > 0 ? [{ rotulo: 'Frete / instalação', valor: moeda(o.frete) }] : []),
  ]
  const colunas = [
    { titulo: 'Item', largura: 5 },
    { titulo: 'Qtd.', largura: 46, numero: true },
    { titulo: 'Medidas (m)', largura: 74, numero: true },
    { titulo: 'Unitário', largura: 70, numero: true },
    { titulo: 'Total', largura: 76, numero: true },
  ]
  const estiloColuna = (c: (typeof colunas)[number]) => ({ ...(c.largura < 10 ? { flex: c.largura } : { width: c.largura }), textAlign: c.numero ? ('right' as const) : ('left' as const), paddingRight: 4 })
  const textoPdf = (titulo: string, conteudo: string) =>
    h(View, { style: { marginTop: 14 }, wrap: false }, h(Text, { style: s.rotulo }, titulo), h(Text, { style: { color: COR.tinta } }, conteudo))
  const colunaInfo = (rotulo: string, conteudo: ReactNode, i: number, largura = 1) =>
    h(View, { key: rotulo, style: { flexDirection: 'row', flex: largura } }, i > 0 ? h(View, { style: s.divisor }) : null, h(View, { style: s.celulaBloco }, h(Text, { style: s.rotulo }, rotulo), conteudo))

  const doc = h(
    Document,
    { title: `Orçamento ${o.numero}`, author: e.nome },
    h(
      Page,
      { size: 'A4', style: s.pagina },
      // Faixa da marca (cinza escuro + a cor do tema + a lasca laranja)
      h(
        View,
        { style: s.faixa, fixed: true },
        h(View, { style: { flex: 7, backgroundColor: COR.principal } }),
        h(View, { style: { flex: 2.6, backgroundColor: COR.destaque } }),
        h(View, { style: { flex: 0.4, backgroundColor: COR.laranja } }),
      ),
      // Cabeçalho: empresa à esquerda; tipo, número, emissão e validade à direita
      h(
        View,
        { style: s.cabecalho },
        h(
          View,
          { style: { maxWidth: 300 } },
          opcoes.logo ? h(Image, { src: opcoes.logo, style: s.logo }) : null,
          h(Text, { style: opcoes.logo ? [s.empresa, { fontSize: 10.5 }] : s.empresa }, e.nome),
          empresa.cnpj ? h(Text, { style: s.linhaEmpresa }, `CNPJ ${formatarCpfCnpj(empresa.cnpj)}`) : null,
          e.endereco ? h(Text, { style: s.linhaEmpresa }, e.endereco) : null,
          e.contato ? h(Text, { style: s.linhaEmpresa }, e.contato) : null,
        ),
        h(
          View,
          null,
          h(Text, { style: s.tipo }, 'Orçamento'),
          h(Text, { style: s.numero }, o.numero),
          h(
            View,
            { style: s.meta },
            ...[
              { rotulo: 'Emissão', valor: formatarDataHora(o.createdAt.toISOString()).slice(0, 10) },
              { rotulo: 'Válido até', valor: formatarDataSimples(o.validade.toISOString()) },
            ].map((m) => h(View, { key: m.rotulo }, h(Text, { style: [s.rotulo, { textAlign: 'right' }] }, m.rotulo), h(Text, { style: { fontWeight: 600, textAlign: 'right' } }, m.valor))),
          ),
        ),
      ),
      // Cliente, prazo e atendimento
      h(
        View,
        { style: s.bloco, wrap: false },
        colunaInfo(
          'Cliente',
          h(
            View,
            null,
            h(Text, { style: { fontFamily: f.titulo, fontWeight: 700, fontSize: 11 } }, exibicao),
            legal ? h(Text, { style: s.suave }, legal) : null,
            contato ? h(Text, { style: s.suave }, contato) : null,
          ),
          0,
          2,
        ),
        colunaInfo('Prazo de produção', h(Text, { style: s.forte }, `${o.prazoDias} dia(s) úteis após a aprovação`), 1),
        colunaInfo('Atendimento', h(Text, { style: s.forte }, o.vendedor?.nome ?? '—'), 2),
      ),
      // Itens
      h(
        View,
        null,
        h(View, { style: s.tabCab, fixed: true }, ...colunas.map((c) => h(Text, { key: c.titulo, style: [s.rotulo, { marginBottom: 0, color: COR.principal }, estiloColuna(c)] }, c.titulo))),
        ...o.itens.map((i, k) => {
          const celulas: ReactNode[] = [
            h(
              View,
              null,
              h(Text, { style: { fontWeight: 600 } }, i.descricao),
              i.acabamentos.length ? h(Text, { style: [s.suave, { fontSize: 7.8 }] }, `Acabamentos: ${i.acabamentos.map((a) => a.nome).join(', ')}`) : null,
              i.observacao ? h(Text, { style: [s.suave, { fontSize: 7.8 }] }, i.observacao) : null,
              n(i.desconto) > 0 ? h(Text, { style: { fontSize: 7.8, color: COR.destaqueTexto } }, `Desconto no item: ${moeda(i.desconto)}`) : null,
              (regras.itens[k] ?? []).length ? h(Text, { style: { fontSize: 7.8, color: COR.destaqueTexto } }, `${textosDoItemParaCliente(regras.itens[k]!).join(' · ')} (já no total)`) : null,
            ),
            h(Text, { style: { textAlign: 'right' } }, Number(i.quantidade.toString()).toLocaleString('pt-BR')),
            h(Text, { style: { textAlign: 'right' } }, i.largura ? `${metros(i.largura)}${i.altura ? ` × ${metros(i.altura)}` : ''}` : '—'),
            h(Text, { style: { textAlign: 'right' } }, moeda(i.precoUnitario)),
            h(Text, { style: { textAlign: 'right', fontWeight: 600 } }, moeda(i.total)),
          ]
          return h(View, { key: k, style: [s.tabLinha, k % 2 === 1 ? { backgroundColor: COR.fundo } : {}], wrap: false }, ...celulas.map((c, j) => h(View, { key: j, style: estiloColuna(colunas[j]!) }, c)))
        }),
      ),
      // Totais
      h(
        View,
        { style: s.totais, wrap: false },
        ...totais.map((l) => h(View, { key: l.rotulo, style: s.totLinha }, h(Text, { style: s.suave }, l.rotulo), h(Text, null, l.valor))),
        h(
          View,
          { style: s.totFaixa },
          h(Text, { style: { color: COR.branco, fontWeight: 600, fontSize: 9 } }, 'Total do orçamento'),
          h(Text, { style: { color: COR.branco, fontFamily: f.titulo, fontWeight: 800, fontSize: 14 } }, moeda(o.total)),
        ),
      ),
      // Pagamento (o mesmo resumo da mensagem e da página de aprovação) e a chave Pix
      h(
        View,
        { style: { flexDirection: 'row', gap: 24 } },
        h(
          View,
          { style: { flex: 1 } },
          textoPdf(
            'Pagamento',
            `${resumoCondicoesPagamento({ total: o.total.toString(), sinalPercentual: o.sinalPercentual.toString(), parcelas: o.parcelas, intervaloDias: o.intervaloDias })}${o.condicoes ? `\n${o.condicoes}` : ''}`,
          ),
        ),
        empresa.chavePix ? h(View, { style: { flex: 1 } }, textoPdf('Chave PIX', empresa.chavePix)) : null,
      ),
      condicoesEspeciais.length ? textoPdf('Condições especiais', condicoesEspeciais.join('\n')) : null,
      o.observacoes ? textoPdf('Observações', o.observacoes) : null,
      h(
        View,
        { style: s.nota, wrap: false },
        h(Text, { style: { fontWeight: 600, color: COR.principal } }, 'Aprove online, sem precisar imprimir'),
        h(Text, { style: { color: COR.destaqueTexto, marginTop: 2 } }, opcoes.linkAprovacao),
      ),
      // Assinatura do cliente
      h(
        View,
        { style: s.assinatura, wrap: false },
        h(
          View,
          { style: s.linhaAss },
          h(Text, { style: { fontWeight: 600 } }, o.cliente.nome),
          o.cliente.cpfCnpj ? h(Text, { style: [s.suave, { fontSize: 8 }] }, formatarCpfCnpj(o.cliente.cpfCnpj)) : null,
          h(Text, { style: [s.suave, { fontSize: 7.5, marginTop: 1 }] }, 'De acordo com este orçamento'),
        ),
        h(View, { style: { alignItems: 'flex-end' } }, h(Text, { style: s.rotulo }, 'Data'), h(Text, { style: { color: COR.suave } }, '____/____/________')),
      ),
      // Rodapé fixo: empresa e contato; documento e paginação
      h(
        View,
        { style: s.rodape, fixed: true },
        h(Text, null, [e.nome, e.contato].filter(Boolean).join('  ·  ')),
        h(Text, { render: ({ pageNumber, totalPages }: { pageNumber: number; totalPages: number }) => `Orçamento ${o.numero}  ·  página ${pageNumber} de ${totalPages}  ·  Gerado com GrafyGo` }),
      ),
    ),
  )
  return renderToBuffer(doc as unknown as ReactElement<DocumentProps>)
}
