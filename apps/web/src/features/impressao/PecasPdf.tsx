import type { ReactNode } from 'react'
import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatarCpfCnpj, type EmpresaConfig } from '@onprint/shared'
import { dadosEmpresa } from './pdfComum'
import { COR, MARGEM, base } from './tema'

const s = StyleSheet.create({
  faixa: { position: 'absolute', top: 0, left: 0, right: 0, height: 6, flexDirection: 'row' },
  cabecalho: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingTop: 34, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: COR.linha, marginBottom: 16 },
  logo: { maxWidth: 150, maxHeight: 54, objectFit: 'contain', marginBottom: 6 },
  empresa: { fontFamily: 'Manrope', fontWeight: 800, fontSize: 14, color: COR.principal, marginBottom: 3 },
  linhaEmpresa: { fontSize: 7.6, color: COR.suave, marginTop: 1.5 },
  tipo: { fontSize: 7.5, fontWeight: 700, color: COR.destaqueTexto, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'right' },
  numero: { fontFamily: 'Manrope', fontWeight: 800, fontSize: 20, color: COR.principal, textAlign: 'right', marginTop: 2 },
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

/** Faixa de marca no topo da página (cinza escuro + verde), repetida em todas as páginas. */
export function FaixaMarca() {
  return (
    <View style={s.faixa} fixed>
      <View style={{ flex: 7, backgroundColor: COR.principal }} />
      <View style={{ flex: 2.6, backgroundColor: COR.destaque }} />
      <View style={{ flex: 0.4, backgroundColor: COR.laranja }} />
    </View>
  )
}

/** Cabeçalho: logo e dados da empresa; à direita o tipo do documento, o número e metadados (emissão, validade…). */
export function CabecalhoPdf({ empresa, logo, tipo, numero, meta = [] }: { empresa: EmpresaConfig; logo: string | null; tipo: string; numero: string; meta?: { rotulo: string; valor: string }[] }) {
  const e = dadosEmpresa(empresa)
  return (
    <View style={s.cabecalho}>
      <View style={{ maxWidth: 300 }}>
        {logo ? <Image src={logo} style={s.logo} /> : null}
        <Text style={logo ? [s.empresa, { fontSize: 10.5 }] : s.empresa}>{e.nome}</Text>
        {empresa.cnpj ? <Text style={s.linhaEmpresa}>CNPJ {formatarCpfCnpj(empresa.cnpj)}</Text> : null}
        {e.endereco ? <Text style={s.linhaEmpresa}>{e.endereco}</Text> : null}
        {e.contato ? <Text style={s.linhaEmpresa}>{e.contato}</Text> : null}
      </View>
      <View>
        <Text style={[s.tipo, { color: COR.destaqueTexto }]}>{tipo}</Text>
        <Text style={s.numero}>{numero}</Text>
        <View style={s.meta}>
          {meta.map((m) => (
            <View key={m.rotulo}>
              <Text style={[base.rotulo, { textAlign: 'right' }]}>{m.rotulo}</Text>
              <Text style={{ fontWeight: 600, textAlign: 'right' }}>{m.valor}</Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  )
}

/** Faixa de informações (cliente, entrega, atendimento…) em colunas sobre fundo claro. */
export function BlocoInfo({ colunas }: { colunas: { rotulo: string; conteudo: ReactNode; largura?: number }[] }) {
  return (
    <View style={s.bloco} wrap={false}>
      {colunas.map((c, i) => (
        <View key={c.rotulo} style={{ flexDirection: 'row', flex: c.largura ?? 1 }}>
          {i > 0 && <View style={s.divisor} />}
          <View style={s.celulaBloco}>
            <Text style={base.rotulo}>{c.rotulo}</Text>
            {c.conteudo}
          </View>
        </View>
      ))}
    </View>
  )
}

export interface ColunaTabela {
  titulo: string
  /** flex (número < 10) ou largura fixa em pt */
  largura: number
  numero?: boolean
}

const estiloColuna = (c: ColunaTabela) => ({ ...(c.largura < 10 ? { flex: c.largura } : { width: c.largura }), textAlign: c.numero ? ('right' as const) : ('left' as const), paddingRight: 4 })

/** Tabela com cabeçalho em destaque e linhas alternadas (cada linha não quebra entre páginas). */
export function TabelaPdf({ colunas, linhas }: { colunas: ColunaTabela[]; linhas: ReactNode[][] }) {
  return (
    <View>
      <View style={s.tabCab} fixed>
        {colunas.map((c) => (
          <Text key={c.titulo} style={[base.rotulo, { marginBottom: 0, color: COR.principal }, estiloColuna(c)]}>
            {c.titulo}
          </Text>
        ))}
      </View>
      {linhas.map((l, i) => (
        <View key={i} style={[s.tabLinha, i % 2 === 1 ? { backgroundColor: COR.fundo } : {}]} wrap={false}>
          {l.map((celula, j) => (
            <View key={j} style={estiloColuna(colunas[j]!)}>
              {typeof celula === 'string' ? <Text style={colunas[j]!.numero ? { textAlign: 'right' } : undefined}>{celula}</Text> : celula}
            </View>
          ))}
        </View>
      ))}
    </View>
  )
}

/** Quadro de totais à direita; o total vai numa faixa petróleo. */
export function TotaisPdf({ linhas, total, depois = [] }: { linhas: { rotulo: string; valor: string }[]; total: { rotulo: string; valor: string }; depois?: { rotulo: string; valor: string; destaque?: boolean }[] }) {
  return (
    <View style={s.totais} wrap={false}>
      {linhas.map((l) => (
        <View key={l.rotulo} style={s.totLinha}>
          <Text style={base.suave}>{l.rotulo}</Text>
          <Text>{l.valor}</Text>
        </View>
      ))}
      <View style={s.totFaixa}>
        <Text style={{ color: COR.branco, fontWeight: 600, fontSize: 9 }}>{total.rotulo}</Text>
        <Text style={{ color: COR.branco, fontFamily: 'Manrope', fontWeight: 800, fontSize: 14 }}>{total.valor}</Text>
      </View>
      {depois.map((l) => (
        <View key={l.rotulo} style={[s.totLinha, { marginTop: 2 }]}>
          <Text style={l.destaque ? base.forte : base.suave}>{l.rotulo}</Text>
          <Text style={l.destaque ? [base.forte, { color: COR.principal }] : undefined}>{l.valor}</Text>
        </View>
      ))}
    </View>
  )
}

/** Bloco de texto com título (condições, observações…). */
export function TextoPdf({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <View style={{ marginTop: 14 }} wrap={false}>
      <Text style={base.rotulo}>{titulo}</Text>
      <Text style={{ color: COR.tinta }}>{children}</Text>
    </View>
  )
}

/** Nota em destaque (borda verde): ex. link de aprovação online. */
export function NotaPdf({ children }: { children: ReactNode }) {
  return (
    <View style={[s.nota, { borderLeftColor: COR.destaque, backgroundColor: COR.fundoDestaque }]} wrap={false}>
      {children}
    </View>
  )
}

/** Assinatura: linha, nome, documento e o que a assinatura confirma; campo de data à direita. */
export function AssinaturaPdf({ nome, documento, rotulo }: { nome: string; documento?: string | null; rotulo: string }) {
  return (
    <View style={s.assinatura} wrap={false}>
      <View style={s.linhaAss}>
        <Text style={{ fontWeight: 600 }}>{nome}</Text>
        {documento ? <Text style={[base.suave, { fontSize: 8 }]}>{formatarCpfCnpj(documento)}</Text> : null}
        <Text style={[base.suave, { fontSize: 7.5, marginTop: 1 }]}>{rotulo}</Text>
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <Text style={base.rotulo}>Data</Text>
        <Text style={{ color: COR.suave }}>____/____/________</Text>
      </View>
    </View>
  )
}

/** Rodapé fixo: empresa e contato à esquerda; documento e paginação à direita. */
export function RodapePdf({ empresa, documento }: { empresa: EmpresaConfig | string; documento: string }) {
  const e = typeof empresa === 'string' ? { nome: empresa, contato: '' } : dadosEmpresa(empresa)
  return (
    <View style={s.rodape} fixed>
      <Text>{[e.nome, e.contato].filter(Boolean).join('  ·  ')}</Text>
      <Text render={({ pageNumber, totalPages }) => `${documento}  ·  página ${pageNumber} de ${totalPages}  ·  Gerado com GrafyGo`} />
    </View>
  )
}
