import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, Check, ClipboardPaste, FileUp, LayoutGrid, Loader2, Plus, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import {
  CATALOGO_INICIAL,
  MODOS_CALCULO,
  MODO_CURTO,
  PERFIS_CATALOGO,
  PERFIL_CATALOGO_ROTULOS,
  SIGLA_DO_MODO,
  TIPO_COBRANCA_ROTULOS,
  linhaDoModelo,
  type EstadoDoAssistente,
  type LeituraCadastroLote,
  type LinhaCadastro,
  type ModoCalculo,
  type ResultadoCadastroLote,
} from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { produtosApi } from '@/api/produtos'
import { vitrineApi } from '@/api/vitrine'
import { PageHeader } from '@/components/layout/PageHeader'
import { MoneyInput } from '@/components/shared/inputs'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useAjudaLiberada, useAtualizarUsoAssistente } from '@/features/assistente/useAssistente'
import { DescricoesEmLoteDialog } from '@/features/vitrine/components/DescricoesEmLoteDialog'
import { usePermission } from '@/hooks/usePermission'
import { decimalParaInput } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { marcadasIniciais, paraCriar, precoDoCampo } from '../cadastroLote'

type Entrada = 'texto' | 'arquivo' | 'modelos'

const EXEMPLO_TABELA = 'Banner lona 440g m² R$ 65\nCartão de visita 4x4 couché 300g milheiro R$ 120\nCaneca personalizada R$ 32 cada\nInstalação R$ 80 a hora'

/** Segundos desde que começou a ler (a tabela inteira leva de 10 a 60 segundos) */
function useCronometro(ligado: boolean) {
  const [segundos, setSegundos] = useState(0)
  useEffect(() => {
    if (!ligado) return setSegundos(0)
    const inicio = Date.now()
    const t = setInterval(() => setSegundos(Math.round((Date.now() - inicio) / 1000)), 1000)
    return () => clearInterval(t)
  }, [ligado])
  return segundos
}

/** Uma linha da revisão: o essencial editável (nome, cobrança, preço, categoria), o resto em uma linha de resumo */
function LinhaRevisao({
  l,
  marcada,
  impedimento,
  categorias,
  precoTexto,
  onMarcar,
  onMudar,
  onPreco,
}: {
  l: LinhaCadastro
  marcada: boolean
  impedimento: string | null
  categorias: readonly { id: string; nome: string }[]
  precoTexto: string
  onMarcar: (v: boolean) => void
  onMudar: (d: Partial<LinhaCadastro>) => void
  onPreco: (texto: string) => void
}) {
  const medida = (a: string | null, b: string | null) => (a && b ? `${Number(a).toLocaleString('pt-BR')} × ${Number(b).toLocaleString('pt-BR')} m` : null)
  const detalhes = [
    l.tipo === 'servico' ? 'serviço' : null,
    medida(l.larguraPadrao, l.alturaPadrao) ? `padrão ${medida(l.larguraPadrao, l.alturaPadrao)}` : null,
    medida(l.larguraMaxima, l.alturaMaxima) ? `até ${medida(l.larguraMaxima, l.alturaMaxima)}` : null,
    l.prazoProducaoDias ? `${l.prazoProducaoDias} dia(s)` : null,
  ].filter(Boolean)
  const valorCategoria = l.categoriaId ?? (l.categoriaNova ? `nova:${l.categoriaNova}` : '')
  return (
    <li className={cn('space-y-2 rounded-2xl border bg-card p-3 transition-colors', marcada ? 'border-marca/50' : 'border-border opacity-80')}>
      <div className="flex items-start gap-2">
        <Checkbox className="mt-3" checked={marcada} onChange={(e) => onMarcar(e.target.checked)} aria-label={`Criar ${l.nome}`} />
        <Input aria-label="Nome do produto" value={l.nome} maxLength={160} onChange={(e) => onMudar({ nome: e.target.value })} className="font-medium" />
      </div>
      <div className="grid grid-cols-2 gap-2 pl-6 sm:grid-cols-[minmax(0,0.9fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
        <Select aria-label="Como cobra" value={l.modoCalculo} onChange={(e) => onMudar({ modoCalculo: e.target.value as ModoCalculo, unidadeSigla: SIGLA_DO_MODO[e.target.value as ModoCalculo] })}>
          {MODOS_CALCULO.map((m) => (
            <option key={m} value={m}>
              por {MODO_CURTO[m]}
            </option>
          ))}
        </Select>
        <MoneyInput aria-label={`Preço por ${MODO_CURTO[l.modoCalculo]}`} placeholder="preço" value={precoTexto} onChange={(e) => onPreco(e.target.value)} aria-invalid={marcada && !l.precoVenda} />
        <div className="col-span-2 sm:col-span-1">
          <Select
            aria-label="Categoria"
            value={valorCategoria}
            onChange={(e) => {
              const v = e.target.value
              onMudar(v.startsWith('nova:') ? { categoriaId: null, categoriaNova: v.slice(5) } : { categoriaId: v || null, categoriaNova: null })
            }}
          >
            <option value="">Sem categoria</option>
            {l.categoriaNova && !l.categoriaId && <option value={`nova:${l.categoriaNova}`}>Nova: {l.categoriaNova}</option>}
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Select>
        </div>
      </div>
      {(detalhes.length > 0 || l.acabamentos.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5 pl-6 text-xs text-texto-secundario">
          {detalhes.length > 0 && <span>{detalhes.join(' · ')}</span>}
          {l.acabamentos.map((a, k) =>
            a.id ? (
              <span key={a.nome} className="rounded-full bg-fundo px-2 py-0.5">
                {a.nome}
              </span>
            ) : (
              <span key={a.nome} className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5">
                {a.nome} (novo, {TIPO_COBRANCA_ROTULOS[a.tipoCobranca].toLowerCase()})
                <input
                  aria-label={`Valor do acabamento ${a.nome}`}
                  inputMode="decimal"
                  placeholder="R$"
                  defaultValue={a.valor ? decimalParaInput(a.valor) : ''}
                  onBlur={(e) => onMudar({ acabamentos: l.acabamentos.map((x, j) => (j === k ? { ...x, valor: precoDoCampo(e.target.value) } : x)) })}
                  className="w-16 rounded border border-input bg-card px-1 text-right text-tinta"
                />
              </span>
            ),
          )}
          {l.acabamentos.some((a) => !a.id && !a.valor) && <span>(acabamento novo sem valor fica de fora)</span>}
        </div>
      )}
      {(l.conferir.length > 0 || l.duplicado || (marcada && impedimento)) && (
        <div className="flex flex-wrap gap-1.5 pl-6 text-xs">
          {marcada && impedimento && <span className="rounded-full bg-coral/15 px-2 py-0.5 font-medium text-coral-escuro">{impedimento.replace('.', '')}</span>}
          {l.conferir.map((c) => (
            <span key={c} className="rounded-full bg-ambar/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">
              confira: {c}
            </span>
          ))}
          {l.duplicado && (
            <span className="rounded-full bg-ambar/15 px-2 py-0.5 font-medium text-amber-900 dark:text-amber-200">
              já existe parecido: {l.duplicado.nome}
              {marcada && ' (vai criar mesmo assim)'}
            </span>
          )}
        </div>
      )}
    </li>
  )
}

/**
 * "Cadastrar vários de uma vez" (/produtos/cadastrar-varios): a tabela de preços que a gráfica já tem (colada, foto,
 * PDF ou CSV) ou os modelos prontos viram uma lista para revisar no essencial; "Criar N produtos" cria tudo numa
 * transação. ?leitura=<id> abre a leitura feita no WhatsApp; ?modelos=1 abre nos modelos prontos.
 */
export function CadastrarVariosPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const atualizarUso = useAtualizarUsoAssistente()
  const [params] = useSearchParams()
  const leituraWhatsapp = params.get('leitura')
  const assistente = useAjudaLiberada('produtos')
  const descricoesLiberadas = useAjudaLiberada('descricoes')
  const veVitrine = usePermission('vitrine', 'editar')
  const cadastro = useQuery({ queryKey: ['produtos', 'lote', 'cadastro'], queryFn: produtosApi.cadastroAtual })

  const [entrada, setEntrada] = useState<Entrada>(params.get('modelos') ? 'modelos' : 'texto')
  const [texto, setTexto] = useState('')
  const [lendo, setLendo] = useState(false)
  const segundos = useCronometro(lendo)
  const [erro, setErro] = useState<string | null>(null)
  const [leitura, setLeitura] = useState<LeituraCadastroLote | null>(null)
  const [linhas, setLinhas] = useState<LinhaCadastro[]>([])
  const [marcadas, setMarcadas] = useState<Set<string>>(new Set())
  const [precos, setPrecos] = useState<Record<string, string>>({})
  const [modelos, setModelos] = useState<Set<string>>(new Set())
  const [criando, setCriando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoCadastroLote | null>(null)
  const [descricoes, setDescricoes] = useState(false)
  const arquivo = useRef<HTMLInputElement>(null)

  function revisar(l: LeituraCadastroLote) {
    setLeitura(l)
    setLinhas(l.linhas)
    setMarcadas(marcadasIniciais(l.linhas))
    setPrecos(Object.fromEntries(l.linhas.map((x) => [x.chave, x.precoVenda ? decimalParaInput(x.precoVenda) : ''])))
  }

  async function ler(fazer: () => Promise<LeituraCadastroLote>) {
    setLendo(true)
    setErro(null)
    try {
      revisar(await fazer())
    } catch (e) {
      setErro((e as Error).message)
    } finally {
      setLendo(false)
      atualizarUso()
    }
  }

  // Do WhatsApp (?leitura=) ou do "Novo produto" com vários no texto (estado da navegação): já abre lendo
  const inicio = useRef(false)
  useEffect(() => {
    if (inicio.current) return
    inicio.current = true
    if (leituraWhatsapp) return void ler(() => assistenteApi.produtosWhatsapp(leituraWhatsapp))
    const doAssistente = (location.state as EstadoDoAssistente | null)?.loteAssistente
    if (doAssistente) {
      setTexto(doAssistente)
      navigate(`${location.pathname}${location.search}`, { replace: true, state: null })
      void ler(() => assistenteApi.tabelaProdutos(doAssistente))
    }
    // Só ao abrir
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function usarModelos() {
    if (!cadastro.data) return
    revisar({ linhas: CATALOGO_INICIAL.filter((m) => modelos.has(m.id)).map((m) => linhaDoModelo(m, cadastro.data)), avisos: [] })
  }

  const mudar = (chave: string, d: Partial<LinhaCadastro>) => setLinhas((ls) => ls.map((l) => (l.chave === chave ? { ...l, ...d } : l)))
  const marcar = (chave: string, v: boolean) => setMarcadas((m) => (v ? new Set([...m, chave]) : new Set([...m].filter((x) => x !== chave))))
  const { itens, impedidas } = useMemo(() => paraCriar(linhas, marcadas), [linhas, marcadas])
  const categorias = useMemo(() => cadastro.data?.categorias ?? [], [cadastro.data])

  async function criar() {
    if (impedidas.size) return toast.error(`${impedidas.size} produto(s) marcado(s) sem preço ou nome: preencha ou desmarque.`)
    if (!itens.length) return toast.error('Marque ao menos um produto.')
    setCriando(true)
    try {
      const r = await produtosApi.criarLote({ itens, leituraId: leitura?.leituraId ?? null })
      setResultado(r)
      await queryClient.invalidateQueries({ queryKey: ['produtos'] })
      await queryClient.invalidateQueries({ queryKey: ['categorias'] })
      await queryClient.invalidateQueries({ queryKey: ['acabamentos'] })
      toast.success(`${r.criados.length} produto(s) criado(s).`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCriando(false)
    }
  }

  const criadosVitrine = useQuery({
    queryKey: ['vitrine-produtos', 'criados', resultado?.criados.map((c) => c.id)],
    queryFn: async () => {
      const ids = new Set(resultado!.criados.map((c) => c.id))
      return (await vitrineApi.produtos()).filter((p) => ids.has(p.id))
    },
    enabled: Boolean(resultado && veVitrine && descricoesLiberadas),
  })

  const voltar = (
    <Button asChild variant="outline">
      <Link to="/produtos">
        <ArrowLeft /> Produtos
      </Link>
    </Button>
  )

  // ─── Resultado ───
  if (resultado) {
    return (
      <>
        <PageHeader titulo="Produtos criados" subtitulo="Já estão prontos para orçamento: cobrança, preço e acabamentos." acoes={voltar} />
        <Card className="space-y-4 p-4 sm:p-6">
          <p className="flex items-center gap-2 font-semibold text-tinta">
            <Check className="h-5 w-5 text-emerald-600" aria-hidden="true" /> {resultado.criados.length} produto(s) criado(s)
            {resultado.categoriasNovas.length > 0 && <span className="text-sm font-normal text-texto-secundario">· categorias novas: {resultado.categoriasNovas.join(', ')}</span>}
          </p>
          {resultado.acabamentosNovos.length > 0 && <p className="text-sm text-texto-secundario">Acabamentos novos: {resultado.acabamentosNovos.join(', ')}.</p>}
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border">
            {resultado.criados.map((c) => (
              <li key={c.id}>
                <Link to={`/produtos/${c.id}`} className="flex items-center gap-3 px-3 py-2.5 text-sm hover:bg-fundo">
                  <span className="font-mono text-xs text-texto-secundario">{c.codigo}</span>
                  <span className="min-w-0 flex-1 truncate font-medium text-tinta">{c.nome}</span>
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-col gap-2 sm:flex-row">
            {veVitrine && descricoesLiberadas && (
              <Button type="button" onClick={() => setDescricoes(true)} disabled={!criadosVitrine.data?.length}>
                <Sparkles /> Escrever os textos da vitrine
              </Button>
            )}
            <Button type="button" variant="outline" onClick={() => navigate('/produtos')}>
              Ver todos os produtos
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setResultado(null)
                setLeitura(null)
                setLinhas([])
                setTexto('')
                setModelos(new Set())
                void cadastro.refetch()
              }}
            >
              <Plus /> Cadastrar mais
            </Button>
          </div>
          <p className="text-xs text-texto-secundario">O custo de cada produto fica na aba “Custo e preço” dele, quando quiser acompanhar o lucro.</p>
        </Card>
        <DescricoesEmLoteDialog aberto={descricoes} produtos={criadosVitrine.data ?? []} onFechar={() => setDescricoes(false)} />
      </>
    )
  }

  // ─── Revisão ───
  if (leitura) {
    const faltaPreco = linhas.filter((l) => !l.precoVenda).length
    return (
      <>
        <PageHeader
          titulo="Revise e crie"
          subtitulo={`${linhas.length} produto(s). Ajuste o que precisar: nada é salvo antes de “Criar”.${faltaPreco ? ` ${faltaPreco} sem preço: digite ou desmarque.` : ''}`}
          acoes={voltar}
        />
        {leitura.avisos.map((a) => (
          <p key={a} className="mb-3 flex items-start gap-2 rounded-xl bg-fundo p-3 text-sm text-texto-secundario">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> {a}
          </p>
        ))}
        <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <Checkbox checked={marcadas.size === linhas.length && linhas.length > 0} onChange={(e) => setMarcadas(e.target.checked ? new Set(linhas.map((l) => l.chave)) : new Set())} />
            Marcar todos
          </label>
          <Button type="button" variant="link" size="sm" className="h-auto p-0" onClick={() => setLeitura(null)}>
            Ler outra tabela
          </Button>
        </div>
        <ul className="space-y-3 pb-28">
          {linhas.map((l) => (
            <LinhaRevisao
              key={l.chave}
              l={l}
              marcada={marcadas.has(l.chave)}
              impedimento={impedidas.get(l.chave) ?? null}
              categorias={categorias}
              precoTexto={precos[l.chave] ?? ''}
              onMarcar={(v) => marcar(l.chave, v)}
              onMudar={(d) => mudar(l.chave, d)}
              onPreco={(t) => {
                setPrecos((p) => ({ ...p, [l.chave]: t }))
                const preco = precoDoCampo(t)
                mudar(l.chave, { precoVenda: preco })
                // Digitou o preço de um modelo: é um que a gráfica vende
                if (preco && !l.duplicado) marcar(l.chave, true)
              }}
            />
          ))}
        </ul>
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 p-3 backdrop-blur md:left-auto md:right-6 md:bottom-6 md:rounded-2xl md:border md:shadow-suave">
          <div className="flex items-center gap-3">
            <p className="min-w-0 flex-1 text-sm text-texto-secundario md:hidden">
              {impedidas.size ? `${impedidas.size} marcado(s) sem preço` : `${itens.length} marcado(s)`}
            </p>
            <Button type="button" className="shrink-0" disabled={criando || !itens.length || impedidas.size > 0} onClick={() => void criar()}>
              {criando ? <Loader2 className="animate-spin" /> : <Check />} Criar {itens.length} produto{itens.length === 1 ? '' : 's'}
            </Button>
          </div>
        </div>
      </>
    )
  }

  // ─── Entrada ───
  const abas: { valor: Entrada; titulo: string; icone: typeof ClipboardPaste }[] = [
    { valor: 'texto', titulo: 'Colar a tabela', icone: ClipboardPaste },
    { valor: 'arquivo', titulo: 'Foto, PDF ou CSV', icone: FileUp },
    { valor: 'modelos', titulo: 'Modelos prontos', icone: LayoutGrid },
  ]
  const lendoAgora = (
    <p className="flex items-center gap-2 text-sm text-texto-secundario" role="status">
      <Loader2 className="h-4 w-4 animate-spin" /> Lendo a tabela… {segundos > 0 && `${segundos} s`}
      {segundos >= 15 && ' · tabelas grandes levam até 1 minuto'}
    </p>
  )

  return (
    <>
      <PageHeader titulo="Cadastrar vários de uma vez" subtitulo="Use a tabela de preços que você já tem, ou comece pelos modelos prontos. Você revisa tudo antes de criar." acoes={voltar} />
      <div className="mb-4 grid grid-cols-3 gap-2">
        {abas.map((a) => (
          <button
            key={a.valor}
            type="button"
            onClick={() => setEntrada(a.valor)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center text-xs font-semibold transition-colors sm:flex-row sm:justify-center sm:text-sm',
              entrada === a.valor ? 'border-marca bg-marca-suave text-marca-escuro' : 'border-border bg-card text-tinta hover:border-marca/50',
            )}
          >
            <a.icone className="h-4 w-4" aria-hidden="true" /> {a.titulo}
          </button>
        ))}
      </div>

      {entrada !== 'modelos' && !assistente && (
        <p className="mb-3 rounded-xl bg-fundo p-3 text-sm text-texto-secundario">
          Para ler a tabela, o Assistente GrafyGo (ajuda para criar produtos) precisa estar ligado em Configurações → Assistente. Os modelos prontos funcionam sem ele.
        </p>
      )}

      {entrada === 'texto' && (
        <Card className="space-y-3 p-4">
          <Textarea
            aria-label="Tabela de preços"
            rows={8}
            maxLength={12_000}
            value={texto}
            placeholder={`Cole aqui a tabela que você manda no WhatsApp, um produto por linha. Ex.:\n${EXEMPLO_TABELA}`}
            onChange={(e) => setTexto(e.target.value)}
          />
          <p className="text-xs text-texto-secundario">O Assistente só organiza o que está escrito: o preço que não aparecer fica em branco para você digitar.</p>
          {lendo ? lendoAgora : erro && <p className="text-sm text-coral-escuro">{erro}</p>}
          <div className="flex justify-end">
            <Button type="button" disabled={lendo || texto.trim().length < 3 || !assistente} onClick={() => void ler(() => assistenteApi.tabelaProdutos(texto.trim()))}>
              {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />} Ler a tabela
            </Button>
          </div>
        </Card>
      )}

      {entrada === 'arquivo' && (
        <Card className="space-y-3 p-4">
          <button
            type="button"
            disabled={lendo || !assistente}
            onClick={() => arquivo.current?.click()}
            className="flex w-full flex-col items-center gap-2 rounded-2xl border-2 border-dashed border-border px-4 py-10 text-center text-sm text-texto-secundario transition-colors hover:border-marca disabled:opacity-60"
          >
            <FileUp className="h-6 w-6" aria-hidden="true" />
            <span className="font-semibold text-tinta">Escolher a foto, o PDF ou a planilha</span>
            Foto da tabela de preços, cardápio de serviços em PDF ou planilha salva em CSV (até 8 MB).
          </button>
          <input
            ref={arquivo}
            type="file"
            className="hidden"
            accept="image/jpeg,image/png,image/webp,application/pdf,.csv,text/csv"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void ler(() => assistenteApi.tabelaProdutosArquivo(f))
              e.target.value = ''
            }}
          />
          {lendo ? lendoAgora : erro && <p className="text-sm text-coral-escuro">{erro}</p>}
        </Card>
      )}

      {entrada === 'modelos' && (
        <Card className="space-y-4 p-4">
          <p className="text-sm text-texto-secundario">
            Marque o que você vende. Os modelos já vêm com a forma de cobrar, a unidade, as medidas e os acabamentos comuns. O preço é seu: você digita na revisão.
          </p>
          {PERFIS_CATALOGO.map((perfil) => {
            const lista = CATALOGO_INICIAL.filter((m) => m.perfil === perfil)
            const todos = lista.every((m) => modelos.has(m.id))
            return (
              <section key={perfil} className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="font-semibold text-tinta">{PERFIL_CATALOGO_ROTULOS[perfil]}</h2>
                  <button
                    type="button"
                    className="text-xs font-semibold text-marca-escuro hover:underline"
                    onClick={() => setModelos((s) => (todos ? new Set([...s].filter((id) => !lista.some((m) => m.id === id))) : new Set([...s, ...lista.map((m) => m.id)])))}
                  >
                    {todos ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {lista.map((m) => {
                    const existe = cadastro.data?.produtos.some((p) => p.nome.toLowerCase() === m.nome.toLowerCase())
                    return (
                      <li key={m.id}>
                        <label className={cn('flex cursor-pointer items-start gap-2 rounded-xl border p-2.5 text-sm', modelos.has(m.id) ? 'border-marca bg-marca-suave/40' : 'border-border')}>
                          <Checkbox
                            className="mt-0.5"
                            checked={modelos.has(m.id)}
                            onChange={(e) => setModelos((s) => (e.target.checked ? new Set([...s, m.id]) : new Set([...s].filter((x) => x !== m.id))))}
                          />
                          <span className="min-w-0">
                            <span className="block font-medium text-tinta">{m.nome}</span>
                            <span className="block text-xs text-texto-secundario">
                              por {MODO_CURTO[m.modoCalculo]}
                              {m.acabamentos.length ? ` · ${m.acabamentos.map((a) => a.nome.split(' ')[0]).join(', ')}` : ''}
                              {existe ? ' · você já tem' : ''}
                            </span>
                          </span>
                        </label>
                      </li>
                    )
                  })}
                </ul>
              </section>
            )
          })}
          <div className="sticky bottom-3 flex justify-end">
            <Button type="button" disabled={!modelos.size || cadastro.isPending} onClick={usarModelos}>
              Revisar {modelos.size} e digitar os preços
            </Button>
          </div>
        </Card>
      )}
    </>
  )
}
