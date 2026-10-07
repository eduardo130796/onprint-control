import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import type { Etiqueta } from './pdfComum'
import { COR } from './tema'

// A4 (595 × 842 pt) com 4 etiquetas de 105 × 148 mm; linhas tracejadas finas para o recorte.
// Pensada para quem entrega: destinatário e endereço em destaque, cobrança, agenda, conferência e canhoto.
const s = StyleSheet.create({
  pagina: { flexDirection: 'row', flexWrap: 'wrap', fontFamily: 'Inter', fontSize: 8, color: COR.tinta },
  etiqueta: { width: '50%', height: '50%', padding: 12, borderStyle: 'dashed', borderColor: '#C9CFD4', borderRightWidth: 0.5, borderBottomWidth: 0.5 },
  cartao: { flex: 1, borderWidth: 1, borderColor: COR.linha, borderRadius: 8, overflow: 'hidden' },
  faixa: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: COR.principal, paddingVertical: 6, paddingHorizontal: 10 },
  empresa: { color: COR.branco, fontFamily: 'Manrope', fontWeight: 700, fontSize: 8.5, maxWidth: 160 },
  chip: { backgroundColor: COR.destaque, color: COR.principalEscuro, fontSize: 6.8, fontWeight: 700, letterSpacing: 1.2, borderRadius: 8, paddingVertical: 2, paddingHorizontal: 7, textTransform: 'uppercase' },
  corpo: { flex: 1, paddingHorizontal: 10, paddingTop: 8, paddingBottom: 8 },
  rotulo: { fontSize: 6, fontWeight: 600, color: COR.suave, letterSpacing: 0.9, textTransform: 'uppercase' },
  linhaPedido: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  pedido: { fontFamily: 'Manrope', fontWeight: 800, fontSize: 15, color: COR.principal },
  qr: { width: 46, height: 46 },
  destinatario: { marginTop: 6, backgroundColor: COR.fundoDestaque, borderLeftWidth: 3, borderLeftColor: COR.destaque, borderRadius: 5, paddingVertical: 6, paddingHorizontal: 8 },
  cliente: { fontFamily: 'Manrope', fontWeight: 800, fontSize: 12, color: COR.principal },
  infos: { flexDirection: 'row', marginTop: 6, borderWidth: 0.8, borderColor: COR.linha, borderRadius: 5 },
  info: { flex: 1, paddingVertical: 4, paddingHorizontal: 6 },
  divisor: { width: 0.8, backgroundColor: COR.linha },
  pago: { marginTop: 1, alignSelf: 'flex-start', backgroundColor: '#DCF5E5', color: '#0B6B3A', fontWeight: 700, fontSize: 7.5, borderRadius: 4, paddingVertical: 1, paddingHorizontal: 5 },
  cobrar: { marginTop: 1, alignSelf: 'flex-start', backgroundColor: '#FBE4E3', color: COR.coral, fontWeight: 700, fontSize: 7.5, borderRadius: 4, paddingVertical: 1, paddingHorizontal: 5 },
  item: { flexDirection: 'row', gap: 8, marginTop: 7 },
  imagemCaixa: { width: 84, height: 84, backgroundColor: COR.fundo, borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  imagem: { width: 80, height: 80, objectFit: 'contain' },
  obs: { marginTop: 6, backgroundColor: COR.fundo, borderRadius: 4, paddingVertical: 4, paddingHorizontal: 6 },
  canhoto: { marginTop: 'auto', borderTopWidth: 0.8, borderTopColor: COR.claro, borderStyle: 'dashed', paddingTop: 6 },
  linhaAssinar: { flex: 1, borderBottomWidth: 0.6, borderBottomColor: COR.suave, marginLeft: 4, height: 9 },
  caixinha: { width: 20, height: 13, borderWidth: 0.8, borderColor: COR.suave, borderRadius: 2 },
})

function Campo({ rotulo, largura, children }: { rotulo: string; largura?: number; children?: string }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', flex: largura ?? 1, marginRight: 8 }}>
      <Text style={s.rotulo}>{rotulo}</Text>
      {children ? <Text style={{ marginLeft: 4, fontWeight: 600 }}>{children}</Text> : <View style={s.linhaAssinar} />}
    </View>
  )
}

function CartaoEtiqueta({ e, empresa }: { e: Etiqueta; empresa: string }) {
  const outros = e.outrosItens.length > 2 ? `${e.outrosItens.slice(0, 2).join(' · ')} e mais ${e.outrosItens.length - 2}` : e.outrosItens.join(' · ')
  return (
    <View style={s.etiqueta} wrap={false}>
      <View style={s.cartao}>
        <View style={s.faixa}>
          <Text style={s.empresa}>{empresa}</Text>
          <Text style={s.chip}>{e.entrega}</Text>
        </View>
        <View style={s.corpo}>
          <View style={s.linhaPedido}>
            <View>
              <Text style={s.rotulo}>Pedido</Text>
              <Text style={s.pedido}>{e.pedido}</Text>
              <Text style={{ color: COR.suave, fontSize: 7 }}>
                {e.op ? `${e.op} · ` : ''}etiqueta {e.indice} de {e.totalEtiquetas}
              </Text>
            </View>
            {e.qr ? <Image src={e.qr} style={s.qr} /> : null}
          </View>

          <View style={s.destinatario}>
            <Text style={s.rotulo}>{e.retirada ? 'Cliente (retirada no balcão)' : 'Entregar para'}</Text>
            <Text style={s.cliente}>{e.cliente}</Text>
            {e.telefone ? <Text style={{ fontWeight: 600 }}>Tel./WhatsApp {e.telefone}</Text> : null}
            <Text style={{ marginTop: 1 }}>{e.retirada ? 'O cliente retira na loja.' : e.destino}</Text>
          </View>

          <View style={s.infos}>
            <View style={s.info}>
              <Text style={s.rotulo}>{e.agendada ? 'Agendada para' : 'Previsão'}</Text>
              <Text style={{ fontWeight: 700 }}>{e.quando}</Text>
            </View>
            <View style={s.divisor} />
            <View style={s.info}>
              <Text style={s.rotulo}>{e.retirada ? 'Atendente' : 'Entregador'}</Text>
              <Text style={{ fontWeight: 600 }}>{e.entregador ?? '______________'}</Text>
            </View>
            <View style={s.divisor} />
            <View style={[s.info, { flex: 1.35 }]}>
              <Text style={s.rotulo}>Pagamento</Text>
              {e.cobrar ? <Text style={s.cobrar}>COBRAR {e.cobrar}</Text> : <Text style={s.pago}>PAGO</Text>}
            </View>
          </View>

          <View style={s.item}>
            <View style={s.imagemCaixa}>{e.imagem ? <Image src={e.imagem} style={s.imagem} /> : <Text style={{ color: COR.claro, fontSize: 6.5 }}>sem arte</Text>}</View>
            <View style={{ flex: 1 }}>
              <Text style={s.rotulo}>Este volume</Text>
              <Text style={{ fontWeight: 700, fontSize: 9 }}>{e.item}</Text>
              <Text style={{ color: COR.suave }}>
                Qtd. {e.quantidade}
                {e.medidas ? `  ·  ${e.medidas}` : ''}
              </Text>
              {outros ? <Text style={{ color: COR.suave, fontSize: 7, marginTop: 2 }}>Também no pedido: {outros}</Text> : null}
            </View>
          </View>

          {e.observacao ? (
            <View style={s.obs}>
              <Text style={{ fontSize: 7.3 }}>
                <Text style={{ fontWeight: 700 }}>Obs.: </Text>
                {e.observacao}
              </Text>
            </View>
          ) : null}

          <View style={s.canhoto}>
            <View style={{ flexDirection: 'row' }}>
              <Campo rotulo="Recebido por" largura={3} />
              <Campo rotulo="Data" />
            </View>
            <View style={{ flexDirection: 'row', marginTop: 7, alignItems: 'flex-end' }}>
              <Campo rotulo="Assinatura" largura={3} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                <Text style={s.rotulo}>Vol.</Text>
                <View style={s.caixinha} />
                <Text style={{ color: COR.suave, fontSize: 7 }}>de</Text>
                <View style={s.caixinha} />
              </View>
            </View>
            {e.telefoneEmpresa ? <Text style={{ marginTop: 5, fontSize: 6.5, color: COR.claro, textAlign: 'center' }}>Dúvidas sobre a entrega: {e.telefoneEmpresa}</Text> : null}
          </View>
        </View>
      </View>
    </View>
  )
}

/** Etiquetas de entrega em folha A4, 4 por página (uma por volume/OP do pedido). */
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
