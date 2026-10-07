import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { TIPO_ENTREGA_ROTULOS, formatarDataHora, formatarDataSimples, formatarMoeda, formatarTelefone, type EmpresaConfig, type PedidoDetalhe } from '@onprint/shared'
import { AssinaturaPdf, CabecalhoPdf } from './PecasPdf'
import { CINZA, PETROLEO, dadosEmpresa } from './pdfComum'

const s = StyleSheet.create({
  pagina: { padding: 36, paddingBottom: 48, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1F2937' },
  caixa: { backgroundColor: '#F1F4F6', borderRadius: 6, padding: 10, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between', gap: 16 },
  rotulo: { color: CINZA, fontSize: 8, marginBottom: 2 },
  forte: { fontFamily: 'Helvetica-Bold' },
  secao: { color: PETROLEO, fontFamily: 'Helvetica-Bold', fontSize: 10, marginTop: 14, marginBottom: 4 },
  cab: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: PETROLEO, paddingBottom: 4, marginBottom: 2, color: PETROLEO, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  linha: { flexDirection: 'row', paddingVertical: 4, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  cDesc: { flex: 1, paddingRight: 8 },
  cQtd: { width: 55, textAlign: 'right' },
  cMed: { width: 80, textAlign: 'right' },
  cVal: { width: 80, textAlign: 'right' },
  detalhe: { color: CINZA, fontSize: 8, marginTop: 2 },
  totais: { marginTop: 10, marginLeft: 'auto', width: 220 },
  totLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  total: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: PETROLEO,
    marginTop: 4,
    paddingTop: 6,
    fontSize: 13,
    fontFamily: 'Helvetica-Bold',
    color: PETROLEO,
  },
  rodape: { position: 'absolute', bottom: 20, left: 36, right: 36, textAlign: 'center', color: CINZA, fontSize: 7.5 },
})

const SITUACAO = { aberto: 'Em aberto', parcial: 'Pago em parte', vencido: 'Vencido', pago: 'Pago', cancelado: 'Cancelado' } as const
const metros = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')

function Linha({ rotulo, valor, forte }: { rotulo: string; valor: string; forte?: boolean }) {
  return (
    <View style={s.totLinha}>
      <Text style={forte ? s.forte : undefined}>{rotulo}</Text>
      <Text style={forte ? s.forte : undefined}>{valor}</Text>
    </View>
  )
}

/** Pedido de venda em A4: cliente, entrega, itens, totais, parcelas e assinatura de recebimento. */
export function DocumentoPedido({ p, empresa, logo }: { p: PedidoDetalhe; empresa: EmpresaConfig; logo: string | null }) {
  const nomeEmpresa = dadosEmpresa(empresa).nome
  const parcelas = p.contasReceber.filter((c) => c.status !== 'cancelado')
  const emAberto = Number(p.total) - Number(p.valorPago)
  return (
    <Document title={`Pedido ${p.numero}`} author={nomeEmpresa}>
      <Page size="A4" style={s.pagina}>
        <CabecalhoPdf empresa={empresa} logo={logo} titulo="PEDIDO DE VENDA" numero={p.numero} data={`Emitido em ${formatarDataHora(p.createdAt)}`} />

        <View style={s.caixa}>
          <View style={{ flex: 1 }}>
            <Text style={s.rotulo}>CLIENTE</Text>
            <Text style={s.forte}>{p.cliente.nome}</Text>
            <Text>{formatarTelefone(p.cliente.whatsapp ?? p.cliente.telefone)}</Text>
            {p.vendedor && (
              <>
                <Text style={[s.rotulo, { marginTop: 6 }]}>ATENDIMENTO</Text>
                <Text>{p.vendedor.nome}</Text>
              </>
            )}
            {p.orcamento && <Text style={[s.detalhe, { marginTop: 6 }]}>Orçamento de origem: {p.orcamento.numero}</Text>}
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.rotulo}>PREVISÃO DE ENTREGA</Text>
            <Text style={s.forte}>{formatarDataSimples(p.dataPrevistaEntrega)}</Text>
            <Text style={[s.rotulo, { marginTop: 6 }]}>{TIPO_ENTREGA_ROTULOS[p.tipoEntrega].toUpperCase()}</Text>
            <Text>{p.tipoEntrega === 'retirada' ? 'No balcão da loja' : p.enderecoEntrega || 'Endereço a combinar'}</Text>
          </View>
        </View>

        <View style={s.cab}>
          <Text style={s.cDesc}>Descrição</Text>
          <Text style={s.cQtd}>Qtd.</Text>
          <Text style={s.cMed}>Medidas (m)</Text>
          <Text style={s.cVal}>Valor</Text>
        </View>
        {p.itens.map((i) => (
          <View key={i.id} style={s.linha} wrap={false}>
            <View style={s.cDesc}>
              <Text style={s.forte}>{i.descricao}</Text>
              {i.acabamentos.length > 0 && <Text style={s.detalhe}>Acabamentos: {i.acabamentos.map((a) => a.nome).join(', ')}</Text>}
              {i.observacao ? <Text style={s.detalhe}>{i.observacao}</Text> : null}
            </View>
            <Text style={s.cQtd}>{Number(i.quantidade).toLocaleString('pt-BR')}</Text>
            <Text style={s.cMed}>{i.largura ? `${metros(i.largura)}${i.altura ? ` × ${metros(i.altura)}` : ''}` : '-'}</Text>
            <Text style={s.cVal}>{formatarMoeda(i.total)}</Text>
          </View>
        ))}

        <View style={s.totais} wrap={false}>
          <Linha rotulo="Subtotal" valor={formatarMoeda(p.subtotal)} />
          {Number(p.desconto) > 0 && <Linha rotulo="Desconto" valor={`- ${formatarMoeda(p.desconto)}`} />}
          {Number(p.acrescimo) > 0 && <Linha rotulo="Acréscimo" valor={formatarMoeda(p.acrescimo)} />}
          {Number(p.frete) > 0 && <Linha rotulo="Frete / instalação" valor={formatarMoeda(p.frete)} />}
          <View style={s.total}>
            <Text>Total</Text>
            <Text>{formatarMoeda(p.total)}</Text>
          </View>
          <Linha rotulo="Pago" valor={formatarMoeda(p.valorPago)} />
          <Linha rotulo="Em aberto" valor={formatarMoeda(emAberto)} forte />
        </View>

        {parcelas.length > 0 && (
          <View wrap={false}>
            <Text style={s.secao}>Pagamento</Text>
            <View style={s.cab}>
              <Text style={s.cDesc}>Parcela</Text>
              <Text style={s.cMed}>Vencimento</Text>
              <Text style={s.cMed}>Situação</Text>
              <Text style={s.cVal}>Valor</Text>
            </View>
            {parcelas.map((c) => (
              <View key={c.id} style={s.linha}>
                <Text style={s.cDesc}>{c.descricao}</Text>
                <Text style={s.cMed}>{formatarDataSimples(c.vencimento)}</Text>
                <Text style={s.cMed}>{SITUACAO[c.status]}</Text>
                <Text style={s.cVal}>{formatarMoeda(c.valor)}</Text>
              </View>
            ))}
          </View>
        )}

        {p.observacoes ? (
          <View wrap={false}>
            <Text style={s.secao}>Observações</Text>
            <Text>{p.observacoes}</Text>
          </View>
        ) : null}

        <AssinaturaPdf nome={p.cliente.nome} rotulo="Recebi os produtos/serviços deste pedido" />

        <Text style={s.rodape} render={({ pageNumber, totalPages }) => `${nomeEmpresa} · Pedido ${p.numero} · página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
