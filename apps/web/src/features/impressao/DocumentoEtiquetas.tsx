import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { FORMATO_ETIQUETA, distribuirEtiquetas, type FormatoEtiqueta } from '@onprint/shared'
import type { Etiqueta } from './pdfComum'
import { COR } from './tema'

// Etiquetas de entrega em três formatos (FORMATO_ETIQUETA): A4 com 4 (105 × 148 mm, completa), A4 com 8
// (105 × 74 mm, compacta) e rolo térmico 100 × 150 mm (uma por página). Linhas tracejadas finas para o recorte
// só nas casas usadas: as casas puladas (folha já usada) ficam limpas.
// Pensada para quem entrega: destinatário e endereço em destaque, cobrança, agenda, conferência e canhoto.
const MM = 72 / 25.4
const s = StyleSheet.create({
  pagina: { flexDirection: 'row', flexWrap: 'wrap', fontFamily: 'Inter', fontSize: 8, color: COR.tinta },
  paginaRolo: { fontFamily: 'Inter', fontSize: 8, color: COR.tinta, padding: 6 },
  recorte: { borderStyle: 'dashed', borderColor: '#C9CFD4', borderRightWidth: 0.5, borderBottomWidth: 0.5 },
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
  )
}

/** Versão compacta (A4 com 8): só o essencial para separar e entregar, sem arte nem canhoto. */
function CartaoCompacto({ e, empresa }: { e: Etiqueta; empresa: string }) {
  const corta = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
  return (
    <View style={s.cartao}>
      <View style={[s.faixa, { paddingVertical: 3.5, paddingHorizontal: 8 }]}>
        <Text style={[s.empresa, { fontSize: 7.5, maxWidth: 190, maxLines: 1, textOverflow: 'ellipsis' }]}>{empresa}</Text>
        <Text style={[s.chip, { fontSize: 6.2, paddingVertical: 1.5 }]}>{e.entrega}</Text>
      </View>
      <View style={{ flex: 1, paddingHorizontal: 8, paddingTop: 5, paddingBottom: 6 }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 5 }}>
              <Text style={[s.pedido, { fontSize: 13 }]}>{e.pedido}</Text>
              <Text style={{ color: COR.suave, fontSize: 6.5, marginBottom: 1.5 }}>
                {e.op ? `${e.op} · ` : ''}
                {e.indice} de {e.totalEtiquetas}
              </Text>
            </View>
            <Text style={[s.cliente, { fontSize: 12.5, marginTop: 3, maxLines: 2, textOverflow: 'ellipsis' }]}>{corta(e.cliente, 70)}</Text>
            {e.telefone ? <Text style={{ fontWeight: 600, fontSize: 8.5, marginTop: 2 }}>Tel./WhatsApp {e.telefone}</Text> : null}
            <Text style={{ fontSize: 8.5, marginTop: 3, maxLines: 2, textOverflow: 'ellipsis' }}>{e.retirada ? 'Retirada no balcão' : corta(e.destino, 100)}</Text>
          </View>
          {e.qr ? <Image src={e.qr} style={{ width: 50, height: 50 }} /> : null}
        </View>
        {e.observacao ? (
          <Text style={{ fontSize: 7.3, marginTop: 4, color: COR.suave, maxLines: 1, textOverflow: 'ellipsis' }}>
            <Text style={{ fontWeight: 700, color: COR.tinta }}>Obs.: </Text>
            {corta(e.observacao, 90)}
          </Text>
        ) : null}
        <Text style={{ marginTop: 'auto', fontSize: 8, maxLines: 1, textOverflow: 'ellipsis' }}>
          <Text style={{ fontWeight: 700 }}>{e.quantidade} × </Text>
          {corta(e.item, 60)}
          {e.medidas ? <Text style={{ color: COR.suave }}>{`  ·  ${e.medidas}`}</Text> : null}
        </Text>
        <View style={[s.infos, { marginTop: 3 }]}>
          <View style={[s.info, { paddingVertical: 2.5 }]}>
            <Text style={s.rotulo}>{e.agendada ? 'Agendada' : 'Previsão'}</Text>
            <Text style={{ fontWeight: 700, fontSize: 8.5 }}>{e.quando}</Text>
          </View>
          <View style={s.divisor} />
          <View style={[s.info, { paddingVertical: 2.5, flex: 1.2 }]}>
            <Text style={s.rotulo}>Pagamento</Text>
            {e.cobrar ? <Text style={[s.cobrar, { fontSize: 8 }]}>COBRAR {e.cobrar}</Text> : <Text style={[s.pago, { fontSize: 8 }]}>PAGO</Text>}
          </View>
        </View>
      </View>
    </View>
  )
}

interface DocumentoEtiquetasProps {
  etiquetas: Etiqueta[]
  empresa: string
  formato?: FormatoEtiqueta
  /** Primeira casa da folha (1-based); as anteriores ficam em branco */
  inicio?: number
}

/** Etiquetas de entrega (uma por volume/OP) no formato escolhido; páginas montadas por `distribuirEtiquetas`. */
export function DocumentoEtiquetas({ etiquetas, empresa, formato = 'a4-4', inicio = 1 }: DocumentoEtiquetasProps) {
  const def = FORMATO_ETIQUETA[formato]
  const { paginas } = distribuirEtiquetas(etiquetas.length, formato, inicio)
  // Medidas em pt arredondadas para baixo: com "50%" o arredondamento passava a altura da página e a segunda
  // linha de etiquetas ia para outra folha (a A4 com 4 saía com 2 por folha)
  const baixo = (v: number) => Math.floor(v * 100) / 100
  const casa = { width: baixo((def.pagina.largura * MM) / def.colunas), height: baixo((def.pagina.altura * MM) / def.linhas), padding: def.compacta ? 8 : 12 }
  const Cartao = def.compacta ? CartaoCompacto : CartaoEtiqueta
  return (
    <Document title="Etiquetas de entrega" author={empresa}>
      {paginas.map((pagina, i) =>
        def.rolo ? (
          <Page key={i} size={[def.pagina.largura * MM, def.pagina.altura * MM]} style={s.paginaRolo}>
            {pagina[0] !== null && pagina[0] !== undefined ? <Cartao e={etiquetas[pagina[0]]!} empresa={empresa} /> : null}
          </Page>
        ) : (
          <Page key={i} size="A4" style={s.pagina}>
            {pagina.map((indice, j) =>
              indice === null ? (
                <View key={j} style={casa} />
              ) : (
                <View key={j} style={[casa, s.recorte]} wrap={false}>
                  <Cartao e={etiquetas[indice]!} empresa={empresa} />
                </View>
              ),
            )}
          </Page>
        ),
      )}
    </Document>
  )
}
