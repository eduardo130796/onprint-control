import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatarCpfCnpj, formatarDataSimples, formatarMoeda, valorPorExtenso, type EmpresaConfig, type PedidoDetalhe, type RecebimentosPedido } from '@onprint/shared'
import { CINZA, PETROLEO, dadosEmpresa } from './pdfComum'

const s = StyleSheet.create({
  pagina: { fontFamily: 'Helvetica', fontSize: 9.5, color: '#1F2937' },
  via: { height: '50%', paddingHorizontal: 36, paddingTop: 28, paddingBottom: 18 },
  corte: { borderBottomWidth: 0.7, borderBottomColor: '#9CA3AF', borderStyle: 'dashed' },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { maxWidth: 110, maxHeight: 42, objectFit: 'contain', marginBottom: 3 },
  empresa: { fontSize: 11, fontFamily: 'Helvetica-Bold', color: PETROLEO },
  sub: { color: CINZA, fontSize: 8, marginTop: 1 },
  titulo: { fontSize: 18, fontFamily: 'Helvetica-Bold', color: PETROLEO, textAlign: 'right' },
  valor: {
    marginTop: 4,
    borderWidth: 1.2,
    borderColor: PETROLEO,
    borderRadius: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    fontSize: 14,
    fontFamily: 'Helvetica-Bold',
    color: PETROLEO,
    textAlign: 'right',
  },
  texto: { marginTop: 16, fontSize: 10.5, lineHeight: 1.6 },
  forte: { fontFamily: 'Helvetica-Bold' },
  tabela: { marginTop: 10 },
  cab: { flexDirection: 'row', borderBottomWidth: 0.7, borderBottomColor: PETROLEO, paddingBottom: 2, color: PETROLEO, fontFamily: 'Helvetica-Bold', fontSize: 8 },
  linha: { flexDirection: 'row', paddingVertical: 2, borderBottomWidth: 0.4, borderBottomColor: '#E5E7EB', fontSize: 8.5 },
  cData: { width: 62 },
  cDesc: { flex: 1, paddingRight: 6 },
  cForma: { width: 110 },
  cVal: { width: 70, textAlign: 'right' },
  rodape: { position: 'absolute', left: 36, right: 36, bottom: 18, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  assinatura: { width: 250, borderTopWidth: 1, borderTopColor: '#1F2937', paddingTop: 3 },
})

interface Props {
  p: PedidoDetalhe
  recebimentos: RecebimentosPedido
  empresa: EmpresaConfig
  logo: string | null
}

function Via({ p, recebimentos: r, empresa, logo, rotulo, corte }: Props & { rotulo: string; corte?: boolean }) {
  const e = dadosEmpresa(empresa)
  const total = r.pagamentos.reduce((soma, x) => soma + Number(x.valor), 0)
  const itens = p.itens.map((i) => i.descricao)
  const referente = itens.length > 3 ? `${itens.slice(0, 3).join(', ')} e outros` : itens.join(', ')
  const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
  return (
    <View style={corte ? [s.via, s.corte] : s.via}>
      <View style={s.topo}>
        <View>
          {logo && <Image src={logo} style={s.logo} />}
          <Text style={s.empresa}>{e.nome}</Text>
          {empresa.cnpj ? <Text style={s.sub}>CNPJ {formatarCpfCnpj(empresa.cnpj)}</Text> : null}
          {e.endereco ? <Text style={s.sub}>{e.endereco}</Text> : null}
          {e.contato ? <Text style={s.sub}>{e.contato}</Text> : null}
        </View>
        <View>
          <Text style={s.titulo}>RECIBO</Text>
          <Text style={[s.sub, { textAlign: 'right' }]}>Pedido {p.numero}</Text>
          <Text style={s.valor}>{formatarMoeda(total)}</Text>
        </View>
      </View>

      <Text style={s.texto}>
        Recebemos de <Text style={s.forte}>{p.cliente.nome}</Text>
        {r.clienteDocumento ? `, ${formatarCpfCnpj(r.clienteDocumento)},` : ''} a importância de <Text style={s.forte}>{formatarMoeda(total)}</Text> ({valorPorExtenso(total)}),
        referente {r.pagamentos.length > 1 ? 'aos pagamentos' : 'ao pagamento'} do pedido <Text style={s.forte}>{p.numero}</Text>: {referente}.
      </Text>

      <View style={s.tabela}>
        <View style={s.cab}>
          <Text style={s.cData}>Data</Text>
          <Text style={s.cDesc}>Referente a</Text>
          <Text style={s.cForma}>Forma</Text>
          <Text style={s.cVal}>Valor</Text>
        </View>
        {r.pagamentos.map((x) => (
          <View key={x.id} style={s.linha}>
            <Text style={s.cData}>{formatarDataSimples(x.data)}</Text>
            <Text style={s.cDesc}>{x.descricao}</Text>
            <Text style={s.cForma}>{x.forma ?? '—'}</Text>
            <Text style={s.cVal}>{formatarMoeda(x.valor)}</Text>
          </View>
        ))}
      </View>

      <View style={s.rodape}>
        <View>
          <Text style={{ marginBottom: 26 }}>{[empresa.cidade, hoje].filter(Boolean).join(', ')}.</Text>
          <View style={s.assinatura}>
            <Text style={s.forte}>{e.nome}</Text>
            {empresa.cnpj ? <Text style={s.sub}>CNPJ {formatarCpfCnpj(empresa.cnpj)}</Text> : null}
          </View>
        </View>
        <Text style={s.sub}>{rotulo}</Text>
      </View>
    </View>
  )
}

/** Recibo dos pagamentos escolhidos do pedido, em duas vias na mesma folha A4 (cliente e empresa). */
export function DocumentoRecibo(props: Props) {
  return (
    <Document title={`Recibo ${props.p.numero}`} author={dadosEmpresa(props.empresa).nome}>
      <Page size="A4" style={s.pagina}>
        <Via {...props} rotulo="Via do cliente" corte />
        <Via {...props} rotulo="Via da empresa" />
      </Page>
    </Document>
  )
}
