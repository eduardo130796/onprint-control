import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatarDataHora, formatarDataSimples, type Relatorio } from '@onprint/shared'
import { FaixaMarca, RodapePdf, TabelaPdf } from '@/features/impressao/PecasPdf'
import { COR, base } from '@/features/impressao/tema'
import { formatarValor } from '@/lib/formatoValor'

const s = StyleSheet.create({
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', paddingTop: 34, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: COR.linha, marginBottom: 14 },
  tipo: { fontSize: 7.5, fontWeight: 700, color: COR.destaqueTexto, letterSpacing: 2, textTransform: 'uppercase' },
  titulo: { fontFamily: 'Manrope', fontWeight: 800, fontSize: 18, color: COR.principal, marginTop: 2 },
  resumo: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  cartao: { flexGrow: 1, minWidth: 110, backgroundColor: COR.fundo, borderRadius: 6, paddingVertical: 8, paddingHorizontal: 10, borderLeftWidth: 3, borderLeftColor: COR.destaque },
  valor: { fontFamily: 'Manrope', fontWeight: 800, fontSize: 13, color: COR.principal, marginTop: 1 },
  vazio: { marginTop: 12, color: COR.suave },
  obs: { marginTop: 12, fontSize: 7.5, color: COR.suave },
})

/** Relatório em PDF (retrato; paisagem quando há muitas colunas): resumo em cartões, tabela e nota. */
export function DocumentoRelatorio({ r, empresa }: { r: Relatorio; empresa: string }) {
  const numerico = (f: string) => !['texto', 'data'].includes(f)
  const periodo = r.periodo ? `${formatarDataSimples(r.periodo.de)} a ${formatarDataSimples(r.periodo.ate)}` : 'Posição atual'
  return (
    <Document title={r.titulo} author={empresa}>
      <Page size="A4" orientation={r.colunas.length > 6 ? 'landscape' : 'portrait'} style={base.pagina}>
        <FaixaMarca />
        <View style={s.topo}>
          <View>
            <Text style={[s.tipo, { color: COR.destaqueTexto }]}>Relatório · {empresa}</Text>
            <Text style={s.titulo}>{r.titulo}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={base.rotulo}>Período</Text>
            <Text style={base.forte}>{periodo}</Text>
          </View>
        </View>

        {r.resumo.length > 0 && (
          <View style={s.resumo} wrap={false}>
            {r.resumo.map((x) => (
              <View key={x.rotulo} style={[s.cartao, { borderLeftColor: COR.destaque }]}>
                <Text style={base.rotulo}>{x.rotulo}</Text>
                <Text style={s.valor}>{formatarValor(x.valor, x.formato)}</Text>
              </View>
            ))}
          </View>
        )}

        {r.linhas.length === 0 ? (
          <Text style={s.vazio}>Nenhum registro no período.</Text>
        ) : (
          <TabelaPdf
            colunas={r.colunas.map((c, i) => ({ titulo: c.titulo, largura: i === 0 ? 2.2 : 1, numero: numerico(c.formato) }))}
            linhas={r.linhas.map((l) => r.colunas.map((c) => formatarValor(l[c.chave], c.formato)))}
          />
        )}
        {r.observacao ? <Text style={s.obs}>{r.observacao}</Text> : null}
        <RodapePdf empresa={empresa} documento={`${r.titulo} · gerado em ${formatarDataHora(new Date())}`} />
      </Page>
    </Document>
  )
}
