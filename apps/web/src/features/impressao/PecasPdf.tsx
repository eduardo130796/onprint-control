import { Image, StyleSheet, Text, View } from '@react-pdf/renderer'
import { formatarCpfCnpj, type EmpresaConfig } from '@onprint/shared'
import { CINZA, PETROLEO, dadosEmpresa } from './pdfComum'

const s = StyleSheet.create({
  topo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 },
  logo: { maxWidth: 140, maxHeight: 60, objectFit: 'contain' },
  empresa: { fontSize: 13, fontFamily: 'Helvetica-Bold', color: PETROLEO },
  sub: { color: CINZA, marginTop: 2 },
  titulo: { fontSize: 16, fontFamily: 'Helvetica-Bold', color: PETROLEO, textAlign: 'right' },
  assinatura: { marginTop: 40, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  linhaAssinatura: { width: 280, borderTopWidth: 1, borderTopColor: '#1F2937', paddingTop: 4 },
})

/** Cabeçalho: logo e dados da empresa à esquerda; tipo do documento, número e data à direita. */
export function CabecalhoPdf({ empresa, logo, titulo, numero, data }: { empresa: EmpresaConfig; logo: string | null; titulo: string; numero: string; data: string }) {
  const e = dadosEmpresa(empresa)
  return (
    <View style={s.topo}>
      <View>
        {logo ? <Image src={logo} style={s.logo} /> : <Text style={s.empresa}>{e.nome}</Text>}
        {logo && <Text style={[s.empresa, { fontSize: 10, marginTop: 4 }]}>{e.nome}</Text>}
        {empresa.cnpj ? <Text style={s.sub}>CNPJ {formatarCpfCnpj(empresa.cnpj)}</Text> : null}
        {e.endereco ? <Text style={s.sub}>{e.endereco}</Text> : null}
        {e.contato ? <Text style={s.sub}>{e.contato}</Text> : null}
      </View>
      <View>
        <Text style={s.titulo}>{titulo}</Text>
        <Text style={{ fontFamily: 'Helvetica-Bold', textAlign: 'right', fontSize: 11 }}>{numero}</Text>
        <Text style={[s.sub, { textAlign: 'right' }]}>{data}</Text>
      </View>
    </View>
  )
}

/** Linha de assinatura do cliente (nome e documento abaixo) com campo de data. */
export function AssinaturaPdf({ nome, documento, rotulo }: { nome: string; documento?: string | null; rotulo: string }) {
  return (
    <View style={s.assinatura} wrap={false}>
      <View style={s.linhaAssinatura}>
        <Text style={{ fontFamily: 'Helvetica-Bold' }}>{nome}</Text>
        {documento ? <Text style={{ color: CINZA }}>{formatarCpfCnpj(documento)}</Text> : null}
        <Text style={{ color: CINZA, fontSize: 8 }}>{rotulo}</Text>
      </View>
      <Text style={{ color: CINZA }}>Data: ____/____/________</Text>
    </View>
  )
}
