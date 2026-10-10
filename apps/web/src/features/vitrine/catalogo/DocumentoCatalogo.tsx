import { Circle, Defs, Document, Image, Link, LinearGradient, Page, Rect, Stop, StyleSheet, Svg, Text, View } from '@react-pdf/renderer'
import type { CoresTema } from '@onprint/shared'
import { COR } from '@/features/impressao/tema'
import type { PartesPreco } from '@/features/vitrine-site/formato'

// Catálogo da vitrine em PDF: capa na cor do tema (logo, título, slogan, contatos e QR do site) e os produtos
// publicados por categoria, em cartões (foto, nome, preço, texto curto e QR do produto). Rodapé "Gerado com GrafyGo".

export interface ItemCatalogo {
  id: string
  categoria: { id: string; nome: string } | null
  nome: string
  /** null = catálogo sem preços */
  preco: PartesPreco | null
  texto: string
  /** JPEG 4:3 (data URL) */
  foto: string | null
  link: string
  qr: string | null
  /** wa.me da gráfica com a mensagem do produto pronta (null sem WhatsApp visível na vitrine) */
  whatsapp: string | null
}

export interface DadosCatalogo {
  cores: CoresTema
  loja: string
  slogan: string | null
  logo: { src: string; proporcao: number } | null
  site: string
  url: string
  qrSite: string | null
  /** `link`: o item é clicável (WhatsApp abre a conversa, e-mail abre o e-mail) */
  contatos: { tipo: string; valor: string; link?: string }[]
  fotosCapa: string[]
  grupos: { titulo: string; produtos: ItemCatalogo[] }[]
  total: number
  /** "outubro de 2026" */
  data: string
  /** Rótulo da capa (padrão "Catálogo de produtos") */
  rotulo: string
}

const A4 = { w: 595.28, h: 841.89 }
const M = 36
const COLUNAS = 3
const GAP = 12
const LARGURA_CARTAO = (A4.w - M * 2 - GAP * (COLUNAS - 1)) / COLUNAS

const s = StyleSheet.create({
  pagina: { fontFamily: 'Inter', fontSize: 9, color: COR.tinta, paddingTop: 70, paddingBottom: 54, paddingHorizontal: M },
  capa: { fontFamily: 'Inter', color: '#FFFFFF', padding: 0 },
  titulo: { fontFamily: 'Manrope', fontWeight: 800 },
  rotulo: { fontSize: 7, fontWeight: 700, letterSpacing: 1.6, textTransform: 'uppercase' },
  cartao: { width: LARGURA_CARTAO, borderRadius: 9, borderWidth: 0.8, borderColor: COR.linha, backgroundColor: '#FFFFFF', overflow: 'hidden' },
  foto: { width: LARGURA_CARTAO, height: (LARGURA_CARTAO * 3) / 4, objectFit: 'cover' },
  semFoto: { width: LARGURA_CARTAO, height: (LARGURA_CARTAO * 3) / 4, alignItems: 'center', justifyContent: 'center' },
  corpo: { paddingHorizontal: 10, paddingTop: 9, paddingBottom: 10, flexGrow: 1 },
  rodape: { position: 'absolute', left: M, right: M, bottom: 22, flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.6, borderTopColor: COR.linha, paddingTop: 7, fontSize: 7, color: COR.claro },
})

function Preco({ preco, cor, tamanho = 13 }: { preco: PartesPreco; cor: string; tamanho?: number }) {
  if (!preco.sufixo && preco.valor === 'Sob consulta') {
    return <Text style={[s.titulo, { fontSize: tamanho * 0.85, color: cor }]}>Sob consulta</Text>
  }
  return (
    <View>
      {preco.prefixo ? <Text style={{ fontSize: 7, color: COR.suave, marginBottom: 1 }}>{preco.prefixo}</Text> : null}
      <Text>
        <Text style={[s.titulo, { fontSize: tamanho, color: cor }]}>{preco.valor}</Text>
        {preco.sufixo ? <Text style={{ fontSize: 8, color: COR.suave }}>{`  ${preco.sufixo}`}</Text> : null}
      </Text>
    </View>
  )
}

function Logo({ logo, altura }: { logo: NonNullable<DadosCatalogo['logo']>; altura: number }) {
  const largura = Math.min(altura * 3, Math.max(altura, altura * logo.proporcao))
  return <Image src={logo.src} style={{ width: largura, height: altura, objectFit: 'contain' }} />
}

function Capa({ d }: { d: DadosCatalogo }) {
  const { cores } = d
  return (
    <Page size="A4" style={s.capa}>
      {/* Fundo: degradê na cor do tema + anéis decorativos */}
      <View style={{ position: 'absolute', top: 0, left: 0, width: A4.w, height: A4.h }}>
      <Svg width={A4.w} height={A4.h}>
        <Defs>
          <LinearGradient id="fundo" x1="0" y1="0" x2="0.35" y2="1">
            <Stop offset="0" stopColor={cores.escuro} />
            <Stop offset="1" stopColor="#0B0F12" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width={A4.w} height={A4.h} fill="url(#fundo)" />
        <Circle cx={A4.w * 1.02} cy={A4.h * 0.1} r={190} fill="#FFFFFF" fillOpacity={0.05} />
        <Circle cx={A4.w * 1.02} cy={A4.h * 0.1} r={260} stroke="#FFFFFF" strokeOpacity={0.08} strokeWidth={1} fill="none" />
        <Circle cx={-30} cy={A4.h * 0.86} r={220} fill={cores.cor} fillOpacity={0.22} />
      </Svg>
      </View>

      <View style={{ paddingHorizontal: 48, paddingTop: 48, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        {d.logo ? (
          <View style={{ backgroundColor: '#FFFFFF', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 }}>
            <Logo logo={d.logo} altura={34} />
          </View>
        ) : null}
        {/* Com logo, o nome já vem no título grande */}
        {d.logo ? null : <Text style={[s.titulo, { fontSize: 13, color: '#FFFFFF', maxWidth: 300 }]}>{d.loja}</Text>}
      </View>

      <View style={{ paddingHorizontal: 48, marginTop: 70 }}>
        <Text style={[s.rotulo, { color: '#FFFFFF', opacity: 0.75 }]}>{`${d.rotulo} · ${d.data}`}</Text>
        <Text style={[s.titulo, { fontSize: 40, color: '#FFFFFF', marginTop: 10, lineHeight: 1.1 }]}>{d.loja}</Text>
        {d.slogan ? <Text style={{ fontSize: 13, color: '#FFFFFF', opacity: 0.82, marginTop: 14, maxWidth: 420, lineHeight: 1.4 }}>{d.slogan}</Text> : null}
        <Text style={{ fontSize: 9.5, color: '#FFFFFF', opacity: 0.7, marginTop: 14 }}>
          {d.total === 1 ? '1 produto' : `${d.total} produtos`} · peça seu orçamento pelo site ou WhatsApp
        </Text>
      </View>

      {d.fotosCapa.length > 0 && (
        <View style={{ flexDirection: 'row', gap: 12, paddingHorizontal: 48, marginTop: 36 }}>
          {d.fotosCapa.map((f, i) => (
            <View key={i} style={{ flex: 1, backgroundColor: '#FFFFFF', borderRadius: 14, padding: 5 }}>
              <Image src={f} style={{ width: '100%', height: d.fotosCapa.length === 1 ? 220 : 150, borderRadius: 10, objectFit: 'cover' }} />
            </View>
          ))}
        </View>
      )}

      {/* Contato e QR do site */}
      <View style={{ position: 'absolute', left: 48, right: 48, bottom: 64, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 20, flexDirection: 'row', gap: 20, color: COR.tinta }}>
        <View style={{ flex: 1 }}>
          <Text style={[s.rotulo, { color: cores.escuro, marginBottom: 8 }]}>Fale com a gente</Text>
          {d.contatos.map((c) => (
            <View key={c.tipo} style={{ flexDirection: 'row', marginBottom: 5 }}>
              <Text style={{ width: 62, fontSize: 7.5, color: COR.claro, paddingTop: 1 }}>{c.tipo}</Text>
              {c.link ? (
                <Link src={c.link} style={{ flex: 1, fontSize: 9, fontWeight: 600, color: COR.tinta, textDecoration: 'none' }}>
                  {c.valor}
                </Link>
              ) : (
                <Text style={{ flex: 1, fontSize: 9, fontWeight: 600, color: COR.tinta }}>{c.valor}</Text>
              )}
            </View>
          ))}
          <View style={{ flexDirection: 'row', marginTop: d.contatos.length ? 2 : 0 }}>
            <Text style={{ width: 62, fontSize: 7.5, color: COR.claro, paddingTop: 1 }}>Site</Text>
            <Link src={d.url} style={{ flex: 1, fontSize: 9, fontWeight: 700, color: cores.escuro, textDecoration: 'none' }}>
              {d.site}
            </Link>
          </View>
        </View>
        {d.qrSite ? (
          <View style={{ alignItems: 'center', width: 112 }}>
            <Image src={d.qrSite} style={{ width: 104, height: 104 }} />
            <Text style={{ fontSize: 7.5, fontWeight: 700, color: cores.escuro, marginTop: 6 }}>Aponte a câmera</Text>
          </View>
        ) : null}
      </View>
      <Text style={{ position: 'absolute', left: 0, right: 0, bottom: 28, textAlign: 'center', fontSize: 7, color: '#FFFFFF', opacity: 0.55 }}>Gerado com GrafyGo</Text>
    </Page>
  )
}

const VERDE_WHATSAPP = '#1FAF54'

/** Balão do WhatsApp (simplificado) em branco */
function IconeWhatsapp({ tamanho }: { tamanho: number }) {
  return (
    <Svg width={tamanho} height={tamanho} viewBox="0 0 24 24">
      <Circle cx="12" cy="11.5" r="9.5" fill="none" stroke="#FFFFFF" strokeWidth={2.4} />
      <Rect x="3.2" y="18.6" width="4.6" height="2.6" fill="#FFFFFF" />
    </Svg>
  )
}

function Cartao({ p, cores }: { p: ItemCatalogo; cores: CoresTema }) {
  return (
    <View style={s.cartao}>
      {p.foto ? (
        <Image src={p.foto} style={s.foto} />
      ) : (
        <View style={[s.semFoto, { backgroundColor: cores.suave }]}>
          <Text style={[s.titulo, { fontSize: 42, color: cores.escuro }]}>{p.nome.charAt(0).toUpperCase()}</Text>
        </View>
      )}
      <View style={s.corpo}>
        <Text style={[s.titulo, { fontSize: 10.5, color: COR.principal, lineHeight: 1.25 }]}>{p.nome}</Text>
        <View style={{ marginTop: 5 }}>
          {p.preco ? <Preco preco={p.preco} cor={cores.escuro} tamanho={12} /> : null}
        </View>
        {p.texto ? <Text style={{ fontSize: 7.4, color: COR.suave, marginTop: 5, lineHeight: 1.45 }}>{p.texto}</Text> : null}
        <View style={{ flexGrow: 1 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 8, paddingTop: 8, borderTopWidth: 0.6, borderTopColor: COR.linha }}>
          {p.qr ? <Image src={p.qr} style={{ width: 30, height: 30 }} /> : null}
          <View style={{ flex: 1 }}>
            {p.whatsapp ? (
              <>
                {/* Botão clicável: abre a conversa com a gráfica e a mensagem do produto pronta */}
                <Link src={p.whatsapp} style={{ textDecoration: 'none' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: VERDE_WHATSAPP, borderRadius: 9, paddingVertical: 4.5, paddingHorizontal: 6 }}>
                    <IconeWhatsapp tamanho={7.5} />
                    <Text style={{ fontSize: 7, fontWeight: 700, color: '#FFFFFF' }}>Pedir pelo WhatsApp</Text>
                  </View>
                </Link>
                <Link src={p.link} style={{ fontSize: 6.6, color: cores.escuro, textDecoration: 'none', marginTop: 3, textAlign: 'center' }}>
                  ou ver no site
                </Link>
              </>
            ) : (
              <>
                <Text style={{ fontSize: 7.5, fontWeight: 700, color: COR.tinta }}>Peça seu orçamento</Text>
                <Link src={p.link} style={{ fontSize: 7, color: cores.escuro, textDecoration: 'none', marginTop: 1 }}>
                  Ver no site
                </Link>
              </>
            )}
          </View>
        </View>
      </View>
    </View>
  )
}

function Cabecalho({ d }: { d: DadosCatalogo }) {
  return (
    <View fixed style={{ position: 'absolute', top: 0, left: 0, right: 0 }}>
      <View style={{ flexDirection: 'row', height: 5 }}>
        <View style={{ flex: 7, backgroundColor: d.cores.escuro }} />
        <View style={{ flex: 3, backgroundColor: d.cores.cor }} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: M, paddingTop: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {d.logo ? <Logo logo={d.logo} altura={22} /> : null}
          <Text style={[s.titulo, { fontSize: 10, color: COR.principal }]}>{d.loja}</Text>
        </View>
        <Link src={d.url} style={{ fontSize: 8, fontWeight: 600, color: d.cores.escuro, textDecoration: 'none' }}>
          {d.site}
        </Link>
      </View>
    </View>
  )
}

export function DocumentoCatalogo({ dados: d }: { dados: DadosCatalogo }) {
  return (
    <Document title={`Catálogo — ${d.loja}`} author={d.loja} creator="GrafyGo" producer="GrafyGo">
      <Capa d={d} />
      <Page size="A4" style={s.pagina}>
        <Cabecalho d={d} />
        {d.grupos.map((g, gi) => {
          const linhas = Array.from({ length: Math.ceil(g.produtos.length / COLUNAS) }, (_, i) => g.produtos.slice(i * COLUNAS, (i + 1) * COLUNAS))
          return (
            <View key={g.titulo} style={{ marginTop: gi === 0 ? 0 : 20 }}>
              {linhas.map((linha, li) => (
                // Cada linha não quebra entre páginas; o título da categoria vai junto da primeira
                <View key={li} wrap={false} style={{ marginTop: li === 0 ? 0 : GAP }}>
                  {li === 0 && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                      <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: d.cores.cor }} />
                      <Text style={[s.titulo, { fontSize: 16, color: COR.principal }]}>{g.titulo}</Text>
                      <Text style={{ fontSize: 8, color: COR.claro, marginTop: 3 }}>{g.produtos.length === 1 ? '1 produto' : `${g.produtos.length} produtos`}</Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: GAP, alignItems: 'stretch' }}>
                    {linha.map((p) => (
                      <Cartao key={p.id} p={p} cores={d.cores} />
                    ))}
                  </View>
                </View>
              ))}
            </View>
          )
        })}
        <View style={s.rodape} fixed>
          <Text>{`${d.loja}  ·  ${d.site}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `Página ${pageNumber - 1} de ${totalPages - 1}  ·  Gerado com GrafyGo`} />
        </View>
      </Page>
    </Document>
  )
}
