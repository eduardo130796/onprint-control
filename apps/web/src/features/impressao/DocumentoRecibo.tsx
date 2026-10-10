import { Document, Image, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatarCpfCnpj, formatarDataSimples, formatarMoeda, valorPorExtenso, type EmpresaConfig, type PedidoDetalhe, type RecebimentosPedido } from '@onprint/shared'
import { TabelaPdf } from './PecasPdf'
import { dadosEmpresa } from './pdfComum'
import { COR, MARGEM, base } from './tema'

const s = StyleSheet.create({
  pagina: { fontFamily: 'Inter', fontSize: 9, color: COR.tinta },
  via: { height: '50%', paddingHorizontal: MARGEM, paddingTop: 30, paddingBottom: 20, position: 'relative' },
  faixa: { position: 'absolute', top: 0, left: 0, right: 0, height: 4, flexDirection: 'row' },
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  logo: { maxWidth: 120, maxHeight: 40, objectFit: 'contain', marginBottom: 4 },
  empresa: { fontFamily: 'Manrope', fontWeight: 800, fontSize: 12, color: COR.principal },
  linhaEmpresa: { fontSize: 7.4, color: COR.suave, marginTop: 1 },
  tipo: { fontSize: 7.5, fontWeight: 700, color: COR.destaqueTexto, letterSpacing: 2, textTransform: 'uppercase', textAlign: 'right' },
  valor: { marginTop: 6, backgroundColor: COR.principal, borderRadius: 6, paddingVertical: 7, paddingHorizontal: 14 },
  texto: { marginTop: 16, fontSize: 10.5, lineHeight: 1.65 },
  extenso: { color: COR.destaqueTexto, fontWeight: 600 },
  rodape: { position: 'absolute', left: MARGEM, right: MARGEM, bottom: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  assinatura: { width: 250, borderTopWidth: 1, borderTopColor: COR.tinta, paddingTop: 4 },
  selo: { borderWidth: 1, borderColor: COR.linha, borderRadius: 10, paddingVertical: 2, paddingHorizontal: 8, fontSize: 7, color: COR.suave, letterSpacing: 1, textTransform: 'uppercase' },
  corte: { position: 'absolute', top: 414, left: 0, right: 0, flexDirection: 'row', alignItems: 'center' },
  tracejado: { flex: 1, borderTopWidth: 0.8, borderTopColor: COR.claro, borderStyle: 'dashed' },
})

interface Props {
  p: PedidoDetalhe
  recebimentos: RecebimentosPedido
  empresa: EmpresaConfig
  logo: string | null
}

function Via({ p, recebimentos: r, empresa, logo, rotulo }: Props & { rotulo: string }) {
  const e = dadosEmpresa(empresa)
  const total = r.pagamentos.reduce((soma, x) => soma + Number(x.valor), 0)
  const itens = p.itens.map((i) => i.descricao)
  const referente = itens.length > 3 ? `${itens.slice(0, 3).join(', ')} e outros` : itens.join(', ')
  const hoje = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' })
  return (
    <View style={s.via}>
      <View style={s.faixa}>
        <View style={{ flex: 7, backgroundColor: COR.principal }} />
        <View style={{ flex: 2.6, backgroundColor: COR.destaque }} />
        <View style={{ flex: 0.4, backgroundColor: COR.laranja }} />
      </View>
      <View style={s.topo}>
        <View style={{ maxWidth: 300 }}>
          {logo && <Image src={logo} style={s.logo} />}
          <Text style={logo ? [s.empresa, { fontSize: 10 }] : s.empresa}>{e.nome}</Text>
          {empresa.cnpj ? <Text style={s.linhaEmpresa}>CNPJ {formatarCpfCnpj(empresa.cnpj)}</Text> : null}
          {e.endereco ? <Text style={s.linhaEmpresa}>{e.endereco}</Text> : null}
          {e.contato ? <Text style={s.linhaEmpresa}>{e.contato}</Text> : null}
        </View>
        <View>
          <Text style={[s.tipo, { color: COR.destaqueTexto }]}>Recibo · pedido {p.numero}</Text>
          <View style={s.valor}>
            <Text style={{ color: COR.branco, fontFamily: 'Manrope', fontWeight: 800, fontSize: 18, textAlign: 'right' }}>{formatarMoeda(total)}</Text>
          </View>
        </View>
      </View>

      <Text style={s.texto}>
        Recebemos de <Text style={base.forte}>{p.cliente.nome}</Text>
        {r.clienteDocumento ? `, ${formatarCpfCnpj(r.clienteDocumento)},` : ''} a importância de <Text style={base.forte}>{formatarMoeda(total)}</Text>{' '}
        <Text style={[s.extenso, { color: COR.destaqueTexto }]}>({valorPorExtenso(total)})</Text>, referente {r.pagamentos.length > 1 ? 'aos pagamentos' : 'ao pagamento'} do pedido{' '}
        <Text style={base.forte}>{p.numero}</Text>: {referente}.
      </Text>

      <View style={{ marginTop: 10 }}>
        <TabelaPdf
          colunas={[
            { titulo: 'Data', largura: 62 },
            { titulo: 'Referente a', largura: 4 },
            { titulo: 'Forma', largura: 100 },
            { titulo: 'Valor', largura: 76, numero: true },
          ]}
          linhas={r.pagamentos.map((x) => [formatarDataSimples(x.data), x.descricao, x.forma ?? '—', formatarMoeda(x.valor)])}
        />
      </View>

      <View style={s.rodape}>
        <View>
          <Text style={{ marginBottom: 24, color: COR.suave }}>{[empresa.cidade, hoje].filter(Boolean).join(', ')}.</Text>
          <View style={s.assinatura}>
            <Text style={base.forte}>{e.nome}</Text>
            {empresa.cnpj ? <Text style={[base.suave, { fontSize: 7.5 }]}>CNPJ {formatarCpfCnpj(empresa.cnpj)}</Text> : null}
          </View>
        </View>
        <Text style={s.selo}>{rotulo}</Text>
      </View>
    </View>
  )
}

/** Recibo dos pagamentos escolhidos do pedido, em duas vias na mesma folha A4 (cliente e empresa). */
export function DocumentoRecibo(props: Props) {
  return (
    <Document title={`Recibo ${props.p.numero}`} author={dadosEmpresa(props.empresa).nome}>
      <Page size="A4" style={s.pagina}>
        <Via {...props} rotulo="Via do cliente" />
        <Via {...props} rotulo="Via da empresa" />
        <View style={s.corte}>
          <View style={s.tracejado} />
          <Text style={{ fontSize: 6.5, color: COR.claro, letterSpacing: 1.5, paddingHorizontal: 8, textTransform: 'uppercase' }}>recorte aqui</Text>
          <View style={s.tracejado} />
        </View>
      </Page>
    </Document>
  )
}
