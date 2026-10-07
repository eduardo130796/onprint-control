import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { CINZA, PETROLEO, type Etiqueta } from './pdfComum'

// A4 (595 × 842 pt) com 4 etiquetas de 105 × 148 mm, linhas tracejadas para recorte
const s = StyleSheet.create({
  pagina: { flexDirection: 'row', flexWrap: 'wrap', fontFamily: 'Helvetica', fontSize: 9, color: '#111827' },
  etiqueta: { width: '50%', height: '50%', padding: 18, borderStyle: 'dashed', borderColor: '#9CA3AF', borderRightWidth: 0.5, borderBottomWidth: 0.5 },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', borderBottomWidth: 1.5, borderBottomColor: '#111827', paddingBottom: 4 },
  empresa: { fontSize: 8, color: CINZA, textTransform: 'uppercase' },
  pedido: { fontSize: 16, fontFamily: 'Helvetica-Bold' },
  imagemCaixa: { height: 150, marginTop: 8, marginBottom: 8, borderWidth: 0.5, borderColor: '#D1D5DB', alignItems: 'center', justifyContent: 'center' },
  imagem: { maxWidth: '100%', maxHeight: 146, objectFit: 'contain' },
  semImagem: { color: CINZA, fontSize: 8 },
  item: { fontFamily: 'Helvetica-Bold', fontSize: 10 },
  detalhe: { color: CINZA, marginTop: 1 },
  rotulo: { fontSize: 7, color: CINZA, marginTop: 8, letterSpacing: 0.5 },
  cliente: { fontSize: 14, fontFamily: 'Helvetica-Bold', color: PETROLEO },
  rodape: {
    position: 'absolute',
    left: 18,
    right: 18,
    bottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 0.5,
    borderTopColor: '#9CA3AF',
    paddingTop: 4,
    fontSize: 8,
  },
})

function CartaoEtiqueta({ e, empresa }: { e: Etiqueta; empresa: string }) {
  return (
    <View style={s.etiqueta} wrap={false}>
      <View style={s.topo}>
        <View>
          <Text style={s.empresa}>{empresa}</Text>
          <Text style={s.pedido}>{e.pedido}</Text>
        </View>
        <Text style={{ fontSize: 8 }}>{e.op ?? ''}</Text>
      </View>
      <View style={s.imagemCaixa}>{e.imagem ? <Image src={e.imagem} style={s.imagem} /> : <Text style={s.semImagem}>sem imagem da arte</Text>}</View>
      <Text style={s.item}>{e.item}</Text>
      <Text style={s.detalhe}>
        Qtd. {e.quantidade}
        {e.medidas ? ` · ${e.medidas}` : ''}
      </Text>
      <Text style={s.rotulo}>DESTINATÁRIO</Text>
      <Text style={s.cliente}>{e.cliente}</Text>
      {e.telefone ? <Text>{e.telefone}</Text> : null}
      <Text style={{ marginTop: 2 }}>
        {e.entrega}
        {e.destino ? `: ${e.destino}` : ''}
      </Text>
      <View style={s.rodape}>
        <Text>Previsão: {e.previsao}</Text>
        <Text>Volume ____ / ____</Text>
      </View>
    </View>
  )
}

/** Etiquetas de entrega em folha A4, 4 por página (imagem do item e dados do cliente). */
export function DocumentoEtiquetas({ etiquetas, empresa }: { etiquetas: Etiqueta[]; empresa: string }) {
  const paginas: Etiqueta[][] = []
  for (let i = 0; i < etiquetas.length; i += 4) paginas.push(etiquetas.slice(i, i + 4))
  return (
    <Document title="Etiquetas de entrega" author={empresa}>
      {paginas.map((grupo, i) => (
        <Page key={i} size="A4" style={s.pagina}>
          {grupo.map((e, j) => (
            <CartaoEtiqueta key={j} e={e} empresa={empresa} />
          ))}
        </Page>
      ))}
    </Document>
  )
}
