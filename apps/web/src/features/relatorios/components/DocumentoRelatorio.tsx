import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatarDataHora, formatarDataSimples, type Relatorio } from '@onprint/shared'
import { formatarValor } from '@/lib/formatoValor'

const PETROLEO = '#0B4F5C'
const CINZA = '#6B7280'

const s = StyleSheet.create({
  pagina: { padding: 30, fontSize: 8.5, fontFamily: 'Helvetica', color: '#1F2937' },
  empresa: { color: CINZA, fontSize: 8 },
  titulo: { fontSize: 15, fontFamily: 'Helvetica-Bold', color: PETROLEO, marginTop: 2 },
  periodo: { color: CINZA, marginBottom: 12 },
  resumo: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 },
  caixa: { backgroundColor: '#F1F4F6', borderRadius: 4, padding: 6, marginRight: 6, marginBottom: 6, minWidth: 110 },
  rotulo: { color: CINZA, fontSize: 7.5 },
  valor: { fontFamily: 'Helvetica-Bold', fontSize: 11, color: PETROLEO },
  cab: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: PETROLEO, paddingBottom: 3, fontFamily: 'Helvetica-Bold', color: PETROLEO },
  linha: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  celula: { flex: 1, paddingRight: 4 },
  numero: { flex: 1, textAlign: 'right', paddingRight: 4 },
  obs: { marginTop: 10, color: CINZA, fontSize: 7.5 },
  rodape: { position: 'absolute', bottom: 16, left: 30, right: 30, textAlign: 'center', color: CINZA, fontSize: 7 },
})

export function DocumentoRelatorio({ r, empresa }: { r: Relatorio; empresa: string }) {
  const numerico = (f: string) => !['texto', 'data'].includes(f)
  return (
    <Document title={r.titulo}>
      <Page size="A4" orientation={r.colunas.length > 6 ? 'landscape' : 'portrait'} style={s.pagina}>
        <Text style={s.empresa}>{empresa}</Text>
        <Text style={s.titulo}>{r.titulo}</Text>
        <Text style={s.periodo}>{r.periodo ? `Período: ${formatarDataSimples(r.periodo.de)} a ${formatarDataSimples(r.periodo.ate)}` : 'Posição atual'}</Text>
        <View style={s.resumo}>
          {r.resumo.map((x) => (
            <View key={x.rotulo} style={s.caixa}>
              <Text style={s.rotulo}>{x.rotulo}</Text>
              <Text style={s.valor}>{formatarValor(x.valor, x.formato)}</Text>
            </View>
          ))}
        </View>
        <View style={s.cab} fixed>
          {r.colunas.map((c) => (
            <Text key={c.chave} style={numerico(c.formato) ? s.numero : s.celula}>
              {c.titulo}
            </Text>
          ))}
        </View>
        {r.linhas.map((l, i) => (
          <View key={i} style={s.linha} wrap={false}>
            {r.colunas.map((c) => (
              <Text key={c.chave} style={numerico(c.formato) ? s.numero : s.celula}>
                {formatarValor(l[c.chave], c.formato)}
              </Text>
            ))}
          </View>
        ))}
        {r.linhas.length === 0 ? <Text style={s.obs}>Nenhum registro no período.</Text> : null}
        {r.observacao ? <Text style={s.obs}>{r.observacao}</Text> : null}
        <Text style={s.rodape} render={({ pageNumber, totalPages }) => `Gerado em ${formatarDataHora(new Date())} · página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
