import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatarCpfCnpj, formatarDataHora, formatarDataSimples, formatarMoeda, formatarTelefone, type EmpresaConfig, type OrcamentoDetalhe } from '@onprint/shared'
import { AssinaturaPdf, CabecalhoPdf } from '@/features/impressao/PecasPdf'
import { CINZA, PETROLEO, TURQUESA, dadosEmpresa } from '@/features/impressao/pdfComum'
import { linkAprovacao } from '../../mensagem'

const s = StyleSheet.create({
  pagina: { padding: 36, fontSize: 9.5, fontFamily: 'Helvetica', color: '#1F2937' },
  caixa: { backgroundColor: '#F1F4F6', borderRadius: 6, padding: 10, marginBottom: 14, flexDirection: 'row', justifyContent: 'space-between' },
  rotulo: { color: CINZA, fontSize: 8, marginBottom: 2 },
  forte: { fontFamily: 'Helvetica-Bold' },
  tabelaCab: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: PETROLEO, paddingBottom: 4, marginBottom: 4, color: PETROLEO, fontFamily: 'Helvetica-Bold', fontSize: 8.5 },
  linha: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#E5E7EB' },
  cDesc: { flex: 1, paddingRight: 8 },
  cQtd: { width: 55, textAlign: 'right' },
  cMed: { width: 80, textAlign: 'right' },
  cTot: { width: 80, textAlign: 'right' },
  detalhe: { color: CINZA, fontSize: 8, marginTop: 2 },
  totais: { marginTop: 10, marginLeft: 'auto', width: 220 },
  totLinha: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 },
  total: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 1, borderTopColor: PETROLEO, marginTop: 4, paddingTop: 6, fontSize: 13, fontFamily: 'Helvetica-Bold', color: PETROLEO },
  bloco: { marginTop: 16 },
  aprovar: { marginTop: 18, padding: 10, borderRadius: 6, borderWidth: 1, borderColor: TURQUESA },
  rodape: { position: 'absolute', bottom: 20, left: 36, right: 36, textAlign: 'center', color: CINZA, fontSize: 7.5 },
})

const metros = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')

/** Documento A4 do orçamento (logo, cliente, itens, totais, condições, link de aprovação e assinatura do cliente). */
export function DocumentoOrcamento({ o, empresa, logo }: { o: OrcamentoDetalhe; empresa: EmpresaConfig; logo: string | null }) {
  const nomeEmpresa = dadosEmpresa(empresa).nome

  return (
    <Document title={`Orçamento ${o.numero}`} author={nomeEmpresa}>
      <Page size="A4" style={s.pagina}>
        <CabecalhoPdf empresa={empresa} logo={logo} titulo="ORÇAMENTO" numero={o.numero} data={`Emitido em ${formatarDataHora(o.createdAt)}`} />

        <View style={s.caixa}>
          <View>
            <Text style={s.rotulo}>CLIENTE</Text>
            <Text style={s.forte}>{o.cliente.nome}</Text>
            {o.cliente.cpfCnpj ? <Text>{formatarCpfCnpj(o.cliente.cpfCnpj)}</Text> : null}
            <Text>{[formatarTelefone(o.cliente.whatsapp ?? o.cliente.telefone), o.cliente.email].filter(Boolean).join('  ·  ')}</Text>
          </View>
          <View>
            <Text style={s.rotulo}>VÁLIDO ATÉ</Text>
            <Text style={s.forte}>{formatarDataSimples(o.validade)}</Text>
            <Text style={[s.rotulo, { marginTop: 6 }]}>PRAZO DE PRODUÇÃO</Text>
            <Text>{o.prazoDias} dia(s) úteis após aprovação</Text>
            {o.vendedor && (
              <>
                <Text style={[s.rotulo, { marginTop: 6 }]}>ATENDIMENTO</Text>
                <Text>{o.vendedor.nome}</Text>
              </>
            )}
          </View>
        </View>

        <View style={s.tabelaCab}>
          <Text style={s.cDesc}>Descrição</Text>
          <Text style={s.cQtd}>Qtd.</Text>
          <Text style={s.cMed}>Medidas (m)</Text>
          <Text style={s.cTot}>Valor</Text>
        </View>
        {o.itens.map((i) => (
          <View key={i.id} style={s.linha} wrap={false}>
            <View style={s.cDesc}>
              <Text style={s.forte}>{i.descricao}</Text>
              {i.acabamentos.length > 0 && <Text style={s.detalhe}>Acabamentos: {i.acabamentos.map((a) => a.nome).join(', ')}</Text>}
              {i.observacao ? <Text style={s.detalhe}>{i.observacao}</Text> : null}
              {Number(i.desconto) > 0 && <Text style={s.detalhe}>Desconto no item: {formatarMoeda(i.desconto)}</Text>}
            </View>
            <Text style={s.cQtd}>{Number(i.quantidade).toLocaleString('pt-BR')}</Text>
            <Text style={s.cMed}>{i.largura ? `${metros(i.largura)}${i.altura ? ` × ${metros(i.altura)}` : ''}` : '-'}</Text>
            <Text style={s.cTot}>{formatarMoeda(i.total)}</Text>
          </View>
        ))}

        <View style={s.totais}>
          <View style={s.totLinha}>
            <Text>Subtotal</Text>
            <Text>{formatarMoeda(o.subtotal)}</Text>
          </View>
          {Number(o.desconto) > 0 && (
            <View style={s.totLinha}>
              <Text>Desconto</Text>
              <Text>- {formatarMoeda(o.desconto)}</Text>
            </View>
          )}
          {Number(o.acrescimo) > 0 && (
            <View style={s.totLinha}>
              <Text>Acréscimo</Text>
              <Text>{formatarMoeda(o.acrescimo)}</Text>
            </View>
          )}
          {Number(o.frete) > 0 && (
            <View style={s.totLinha}>
              <Text>Frete / instalação</Text>
              <Text>{formatarMoeda(o.frete)}</Text>
            </View>
          )}
          <View style={s.total}>
            <Text>Total</Text>
            <Text>{formatarMoeda(o.total)}</Text>
          </View>
        </View>

        {o.condicoes ? (
          <View style={s.bloco}>
            <Text style={s.rotulo}>CONDIÇÕES DE PAGAMENTO</Text>
            <Text>{o.condicoes}</Text>
          </View>
        ) : null}
        {o.observacoes ? (
          <View style={s.bloco}>
            <Text style={s.rotulo}>OBSERVAÇÕES</Text>
            <Text>{o.observacoes}</Text>
          </View>
        ) : null}
        {empresa.chavePix ? (
          <View style={s.bloco}>
            <Text style={s.rotulo}>PIX</Text>
            <Text>{empresa.chavePix}</Text>
          </View>
        ) : null}
        <View style={s.aprovar}>
          <Text style={s.forte}>Para aprovar online, acesse:</Text>
          <Text style={{ color: TURQUESA, marginTop: 2 }}>{linkAprovacao(o.tokenPublico)}</Text>
        </View>
        <AssinaturaPdf nome={o.cliente.nome} documento={o.cliente.cpfCnpj} rotulo="De acordo com este orçamento" />

        <Text style={s.rodape} render={({ pageNumber, totalPages }) => `${nomeEmpresa} · Orçamento ${o.numero} · página ${pageNumber} de ${totalPages}`} fixed />
      </Page>
    </Document>
  )
}
