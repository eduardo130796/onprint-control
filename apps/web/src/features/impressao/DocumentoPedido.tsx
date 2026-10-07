import { Document, Page, Text, View } from '@react-pdf/renderer'
import { TIPO_ENTREGA_ROTULOS, formatarDataHora, formatarDataSimples, formatarMoeda, formatarTelefone, type EmpresaConfig, type PedidoDetalhe } from '@onprint/shared'
import { AssinaturaPdf, BlocoInfo, CabecalhoPdf, FaixaMarca, RodapePdf, TabelaPdf, TextoPdf, TotaisPdf } from './PecasPdf'
import { dadosEmpresa } from './pdfComum'
import { COR, base } from './tema'

const SITUACAO = { aberto: 'Em aberto', parcial: 'Pago em parte', vencido: 'Vencido', pago: 'Pago', cancelado: 'Cancelado' } as const
const COR_SITUACAO = { aberto: COR.suave, parcial: '#92400E', vencido: COR.coral, pago: '#166534', cancelado: COR.claro } as const
const metros = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')

/** Pedido de venda em A4: cliente, entrega, itens, totais, pagamento e assinatura de recebimento. */
export function DocumentoPedido({ p, empresa, logo }: { p: PedidoDetalhe; empresa: EmpresaConfig; logo: string | null }) {
  const parcelas = p.contasReceber.filter((c) => c.status !== 'cancelado')
  const emAberto = Number(p.total) - Number(p.valorPago)
  const totais = [
    { rotulo: 'Subtotal', valor: formatarMoeda(p.subtotal) },
    ...(Number(p.desconto) > 0 ? [{ rotulo: 'Desconto', valor: `− ${formatarMoeda(p.desconto)}` }] : []),
    ...(Number(p.acrescimo) > 0 ? [{ rotulo: 'Acréscimo', valor: formatarMoeda(p.acrescimo) }] : []),
    ...(Number(p.frete) > 0 ? [{ rotulo: 'Frete / instalação', valor: formatarMoeda(p.frete) }] : []),
  ]

  return (
    <Document title={`Pedido ${p.numero}`} author={dadosEmpresa(empresa).nome}>
      <Page size="A4" style={base.pagina}>
        <FaixaMarca />
        <CabecalhoPdf
          empresa={empresa}
          logo={logo}
          tipo="Pedido de venda"
          numero={p.numero}
          meta={[
            { rotulo: 'Emissão', valor: formatarDataHora(p.createdAt).slice(0, 10) },
            { rotulo: 'Previsão de entrega', valor: formatarDataSimples(p.dataPrevistaEntrega) },
          ]}
        />

        <BlocoInfo
          colunas={[
            {
              rotulo: 'Cliente',
              largura: 2,
              conteudo: (
                <>
                  <Text style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 11 }}>{p.cliente.nome}</Text>
                  <Text style={base.suave}>{formatarTelefone(p.cliente.whatsapp ?? p.cliente.telefone)}</Text>
                </>
              ),
            },
            {
              rotulo: TIPO_ENTREGA_ROTULOS[p.tipoEntrega],
              largura: 2,
              conteudo: <Text style={base.forte}>{p.tipoEntrega === 'retirada' ? 'No balcão da loja' : p.enderecoEntrega || 'Endereço a combinar'}</Text>,
            },
            {
              rotulo: 'Atendimento',
              conteudo: (
                <>
                  <Text style={base.forte}>{p.vendedor?.nome ?? '—'}</Text>
                  {p.orcamento && <Text style={[base.suave, { fontSize: 7.8 }]}>Orçamento {p.orcamento.numero}</Text>}
                </>
              ),
            },
          ]}
        />

        <TabelaPdf
          colunas={[
            { titulo: 'Item', largura: 5 },
            { titulo: 'Qtd.', largura: 46, numero: true },
            { titulo: 'Medidas (m)', largura: 74, numero: true },
            { titulo: 'Unitário', largura: 70, numero: true },
            { titulo: 'Total', largura: 76, numero: true },
          ]}
          linhas={p.itens.map((i) => [
            <View key="d">
              <Text style={{ fontWeight: 600 }}>{i.descricao}</Text>
              {i.acabamentos.length > 0 && <Text style={[base.suave, { fontSize: 7.8 }]}>Acabamentos: {i.acabamentos.map((a) => a.nome).join(', ')}</Text>}
              {i.observacao ? <Text style={[base.suave, { fontSize: 7.8 }]}>{i.observacao}</Text> : null}
            </View>,
            Number(i.quantidade).toLocaleString('pt-BR'),
            i.largura ? `${metros(i.largura)}${i.altura ? ` × ${metros(i.altura)}` : ''}` : '—',
            formatarMoeda(i.precoUnitario),
            <Text key="t" style={{ textAlign: 'right', fontWeight: 600 }}>
              {formatarMoeda(i.total)}
            </Text>,
          ])}
        />

        <TotaisPdf
          linhas={totais}
          total={{ rotulo: 'Total do pedido', valor: formatarMoeda(p.total) }}
          depois={[
            { rotulo: 'Pago', valor: formatarMoeda(p.valorPago) },
            { rotulo: 'Em aberto', valor: formatarMoeda(emAberto), destaque: true },
          ]}
        />

        {parcelas.length > 0 && (
          <View wrap={false}>
            <Text style={base.secao}>Pagamento</Text>
            <TabelaPdf
              colunas={[
                { titulo: 'Parcela', largura: 4 },
                { titulo: 'Vencimento', largura: 80, numero: true },
                { titulo: 'Situação', largura: 80, numero: true },
                { titulo: 'Valor', largura: 76, numero: true },
              ]}
              linhas={parcelas.map((c) => [
                c.descricao,
                formatarDataSimples(c.vencimento),
                <Text key="s" style={{ textAlign: 'right', fontWeight: 600, color: COR_SITUACAO[c.status] }}>
                  {SITUACAO[c.status]}
                </Text>,
                formatarMoeda(c.valor),
              ])}
            />
          </View>
        )}

        {p.observacoes ? <TextoPdf titulo="Observações">{p.observacoes}</TextoPdf> : null}

        <AssinaturaPdf nome={p.cliente.nome} rotulo="Recebi os produtos/serviços deste pedido" />
        <RodapePdf empresa={empresa} documento={`Pedido ${p.numero}`} />
      </Page>
    </Document>
  )
}
