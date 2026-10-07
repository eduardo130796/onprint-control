import { Document, Page, Text, View } from '@react-pdf/renderer'
import { formatarCpfCnpj, formatarDataHora, formatarDataSimples, formatarMoeda, formatarTelefone, type EmpresaConfig, type OrcamentoDetalhe } from '@onprint/shared'
import { AssinaturaPdf, BlocoInfo, CabecalhoPdf, FaixaMarca, NotaPdf, RodapePdf, TabelaPdf, TextoPdf, TotaisPdf } from '@/features/impressao/PecasPdf'
import { dadosEmpresa } from '@/features/impressao/pdfComum'
import { COR, base } from '@/features/impressao/tema'
import { linkAprovacao } from '../../mensagem'

const metros = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '')

/** Orçamento em A4: cliente, itens, totais, condições, aprovação online e assinatura do cliente. */
export function DocumentoOrcamento({ o, empresa, logo }: { o: OrcamentoDetalhe; empresa: EmpresaConfig; logo: string | null }) {
  const contato = [formatarTelefone(o.cliente.whatsapp ?? o.cliente.telefone), o.cliente.email].filter(Boolean).join('  ·  ')
  const totais = [
    { rotulo: 'Subtotal', valor: formatarMoeda(o.subtotal) },
    ...(Number(o.desconto) > 0 ? [{ rotulo: 'Desconto', valor: `− ${formatarMoeda(o.desconto)}` }] : []),
    ...(Number(o.acrescimo) > 0 ? [{ rotulo: 'Acréscimo', valor: formatarMoeda(o.acrescimo) }] : []),
    ...(Number(o.frete) > 0 ? [{ rotulo: 'Frete / instalação', valor: formatarMoeda(o.frete) }] : []),
  ]

  return (
    <Document title={`Orçamento ${o.numero}`} author={dadosEmpresa(empresa).nome}>
      <Page size="A4" style={base.pagina}>
        <FaixaMarca />
        <CabecalhoPdf
          empresa={empresa}
          logo={logo}
          tipo="Orçamento"
          numero={o.numero}
          meta={[
            { rotulo: 'Emissão', valor: formatarDataHora(o.createdAt).slice(0, 10) },
            { rotulo: 'Válido até', valor: formatarDataSimples(o.validade) },
          ]}
        />

        <BlocoInfo
          colunas={[
            {
              rotulo: 'Cliente',
              largura: 2,
              conteudo: (
                <>
                  <Text style={{ fontFamily: 'Manrope', fontWeight: 700, fontSize: 11 }}>{o.cliente.nome}</Text>
                  {o.cliente.cpfCnpj ? <Text style={base.suave}>{formatarCpfCnpj(o.cliente.cpfCnpj)}</Text> : null}
                  {contato ? <Text style={base.suave}>{contato}</Text> : null}
                </>
              ),
            },
            { rotulo: 'Prazo de produção', conteudo: <Text style={base.forte}>{o.prazoDias} dia(s) úteis após a aprovação</Text> },
            { rotulo: 'Atendimento', conteudo: <Text style={base.forte}>{o.vendedor?.nome ?? '—'}</Text> },
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
          linhas={o.itens.map((i) => [
            <View key="d">
              <Text style={{ fontWeight: 600 }}>{i.descricao}</Text>
              {i.acabamentos.length > 0 && <Text style={[base.suave, { fontSize: 7.8 }]}>Acabamentos: {i.acabamentos.map((a) => a.nome).join(', ')}</Text>}
              {i.observacao ? <Text style={[base.suave, { fontSize: 7.8 }]}>{i.observacao}</Text> : null}
              {Number(i.desconto) > 0 && <Text style={{ fontSize: 7.8, color: COR.destaqueTexto }}>Desconto no item: {formatarMoeda(i.desconto)}</Text>}
            </View>,
            Number(i.quantidade).toLocaleString('pt-BR'),
            i.largura ? `${metros(i.largura)}${i.altura ? ` × ${metros(i.altura)}` : ''}` : '—',
            formatarMoeda(i.precoUnitario),
            <Text key="t" style={{ textAlign: 'right', fontWeight: 600 }}>
              {formatarMoeda(i.total)}
            </Text>,
          ])}
        />

        <TotaisPdf linhas={totais} total={{ rotulo: 'Total do orçamento', valor: formatarMoeda(o.total) }} />

        <View style={{ flexDirection: 'row', gap: 24 }}>
          {o.condicoes ? (
            <View style={{ flex: 1 }}>
              <TextoPdf titulo="Condições de pagamento">{o.condicoes}</TextoPdf>
            </View>
          ) : null}
          {empresa.chavePix ? (
            <View style={{ flex: 1 }}>
              <TextoPdf titulo="Chave PIX">{empresa.chavePix}</TextoPdf>
            </View>
          ) : null}
        </View>
        {o.observacoes ? <TextoPdf titulo="Observações">{o.observacoes}</TextoPdf> : null}

        <NotaPdf>
          <Text style={{ fontWeight: 600, color: COR.principal }}>Aprove online, sem precisar imprimir</Text>
          <Text style={{ color: COR.destaqueTexto, marginTop: 2 }}>{linkAprovacao(o.tokenPublico)}</Text>
        </NotaPdf>

        <AssinaturaPdf nome={o.cliente.nome} documento={o.cliente.cpfCnpj} rotulo="De acordo com este orçamento" />
        <RodapePdf empresa={empresa} documento={`Orçamento ${o.numero}`} />
      </Page>
    </Document>
  )
}
