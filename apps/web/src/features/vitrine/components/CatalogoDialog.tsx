import { useMemo, useState } from 'react'
import { ArrowLeft, Check, Copy, Download, FileText, Link2, Loader2, Share2, Sparkles } from 'lucide-react'
import { toast } from 'sonner'
import type { ProdutoVitrineResumo } from '@onprint/shared'
import { vitrineApi } from '@/api/vitrine'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { cn } from '@/lib/utils'
import { baixarBlob, compartilharArquivo, podeCompartilharArquivo } from '../compartilhar'
import { agruparPorCategoria, mensagemCatalogoPdf, nomeNoSite, textoPrecoProduto } from '../divulgar'
import { useProdutosVitrine, useVitrineConfig } from '../hooks'
import { semProtocolo } from '../utils'
import { EnvioWhatsapp } from './EnvioWhatsapp'
import { Interruptor } from './Interruptor'

interface Gerado {
  blob: Blob
  nome: string
  total: number
  /** Link curto do PDF na vitrine (null se não deu para guardar: manda só o site) */
  link: string | null
}

const tamanhoArquivo = (bytes: number) => (bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`)

/**
 * Vitrine → Produtos → "Catálogo em PDF": 1) escolher o que entra (categorias/produtos, preços, QR, título da capa);
 * 2) gerar; 3) enviar — baixar, compartilhar o arquivo (já pronto, abre na hora) ou mandar o link no WhatsApp.
 */
export function CatalogoDialog({ aberto, onFechar }: { aberto: boolean; onFechar: () => void }) {
  return (
    <Dialog open={aberto} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="top-[3%] max-h-[94vh] max-w-3xl gap-0 overflow-y-auto p-0 sm:top-[5%] sm:max-h-[90vh]">{aberto && <Conteudo />}</DialogContent>
    </Dialog>
  )
}

function Conteudo() {
  const config = useVitrineConfig()
  const empresa = useEmpresa()
  const produtos = useProdutosVitrine({ publicado: 'true' })
  const publicados = useMemo(() => (produtos.data ?? []).filter((p) => p.publicado), [produtos.data])
  const grupos = useMemo(() => agruparPorCategoria(publicados), [publicados])

  const [selecionados, setSelecionados] = useState<Set<string> | null>(null)
  const marcados = selecionados ?? new Set(publicados.map((p) => p.id))
  const [mostrarPreco, setMostrarPreco] = useState(true)
  const [qrPorProduto, setQrPorProduto] = useState(true)
  const [rotulo, setRotulo] = useState('Catálogo de produtos')
  const [gerando, setGerando] = useState(false)
  const [gerado, setGerado] = useState<Gerado | null>(null)
  const [copiado, setCopiado] = useState(false)
  const compartilha = useMemo(() => podeCompartilharArquivo(), [])

  const c = config.data
  const loja = (c?.titulo || empresa.data?.nomeFantasia || empresa.data?.razaoSocial || 'Nossa gráfica').trim()

  function alternar(ids: string[], marcar: boolean) {
    const novo = new Set(marcados)
    ids.forEach((id) => (marcar ? novo.add(id) : novo.delete(id)))
    setSelecionados(novo)
  }

  async function gerar() {
    if (!c || !empresa.data) return
    setGerando(true)
    try {
      const g = await import('../catalogo/gerarCatalogo')
      const pdf = await g.pdfCatalogo(publicados, c, empresa.data, { produtoIds: [...marcados], mostrarPreco, qrPorProduto, rotulo })
      // Guarda o PDF para mandar por link (o WhatsApp não anexa arquivo por link); sem isso, manda o site
      const link = await vitrineApi
        .publicarCatalogo(new File([pdf.blob], pdf.nome, { type: 'application/pdf' }))
        .then((r) => r.url)
        .catch(() => null)
      setGerado({ ...pdf, link })
    } catch (e) {
      toast.error(`Não foi possível gerar o catálogo: ${(e as Error).message}`)
    } finally {
      setGerando(false)
    }
  }

  async function compartilhar() {
    if (!gerado) return
    // O arquivo já está pronto: o menu do sistema abre neste mesmo clique
    const r = await compartilharArquivo(gerado.blob, gerado.nome, `Catálogo — ${loja}`)
    if (r === 'baixado') toast.success('Catálogo baixado.')
    if (r === 'bloqueado') toast.info('O navegador pediu um novo toque: clique em Compartilhar de novo.')
  }

  async function copiarLink() {
    if (!gerado?.link) return
    try {
      await navigator.clipboard.writeText(gerado.link)
      setCopiado(true)
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  const cabecalho = (
    <div className="border-b border-border px-5 pb-4 pt-5 sm:px-6">
      <DialogTitle className="flex items-center gap-2 pr-8">
        <FileText className="h-5 w-5 text-marca-escuro" /> Catálogo em PDF
      </DialogTitle>
      <DialogDescription className="mt-1 pr-8">
        {gerado ? 'Pronto! Baixe, compartilhe o arquivo ou mande o link pelo WhatsApp.' : 'Escolha o que entra no catálogo. A capa leva a sua logo, os contatos e o QR code do site.'}
      </DialogDescription>
    </div>
  )

  if (config.isPending || produtos.isPending || empresa.isPending) {
    return (
      <>
        {cabecalho}
        <div className="space-y-3 p-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </>
    )
  }

  // ── 3. Enviar
  if (gerado && c) {
    return (
      <>
        {cabecalho}
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,17rem)_minmax(0,1fr)]">
          <div className="space-y-3">
            <div className="flex items-center gap-3 rounded-2xl border border-border bg-fundo/60 p-4">
              <span className="flex h-12 w-10 shrink-0 items-center justify-center rounded-lg bg-marca text-[0.625rem] font-bold text-marca-contraste shadow-sm">PDF</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-tinta" title={gerado.nome}>
                  {gerado.nome}
                </p>
                <p className="text-xs text-texto-secundario">
                  {gerado.total} produto(s) · {tamanhoArquivo(gerado.blob.size)}
                </p>
              </div>
            </div>
            {compartilha && (
              <Button type="button" className="w-full" onClick={() => void compartilhar()}>
                <Share2 /> Compartilhar arquivo
              </Button>
            )}
            <Button type="button" variant="outline" className="w-full" onClick={() => baixarBlob(gerado.blob, gerado.nome)}>
              <Download /> Baixar PDF
            </Button>
            {gerado.link ? (
              <div className="space-y-1.5 pt-1">
                <p className="flex items-center gap-1.5 text-xs font-medium text-texto-secundario">
                  <Link2 className="h-3.5 w-3.5" /> Link do catálogo
                </p>
                <div className="flex gap-2">
                  <div className="flex h-9 min-w-0 flex-1 items-center rounded-lg border border-input bg-fundo/60 px-2.5 text-xs text-tinta">
                    <span className="truncate" title={gerado.link}>
                      {semProtocolo(gerado.link)}
                    </span>
                  </div>
                  <Button type="button" variant="outline" size="sm" className="h-9 shrink-0" onClick={() => void copiarLink()} aria-label="Copiar link do catálogo">
                    {copiado ? <Check /> : <Copy />}
                  </Button>
                </div>
              </div>
            ) : (
              <p className="text-xs text-amber-700">Não deu para guardar o PDF para envio por link: a mensagem leva o endereço do site.</p>
            )}
            <Button type="button" variant="ghost" size="sm" className="w-full" onClick={() => setGerado(null)}>
              <ArrowLeft /> Mudar a seleção
            </Button>
          </div>
          <EnvioWhatsapp
            id="catalogo"
            mensagemPadrao={mensagemCatalogoPdf({ loja, linkPdf: gerado.link ?? c.urlPublica, site: gerado.link ? c.urlPublica : null })}
            dica="Quem recebe toca no link e o catálogo abre no celular, sem baixar nada."
          />
        </div>
      </>
    )
  }

  // ── 1. Montar
  const total = publicados.filter((p) => marcados.has(p.id)).length
  return (
    <>
      {cabecalho}
      {publicados.length === 0 ? (
        <p className="p-6 text-sm text-texto-secundario">Publique ao menos um produto na vitrine para gerar o catálogo.</p>
      ) : (
        <div className="grid gap-6 p-5 sm:p-6 md:grid-cols-[minmax(0,1fr)_minmax(0,15rem)]">
          <section aria-label="Produtos do catálogo" className="min-w-0">
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-tinta">
                Produtos <span className="font-normal text-texto-secundario">· {total} de {publicados.length}</span>
              </p>
              <div className="flex gap-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelecionados(null)}>
                  Todos
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelecionados(new Set(publicados.filter((p) => p.destaque).map((p) => p.id)))}>
                  <Sparkles /> Só destaques
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelecionados(new Set())}>
                  Nenhum
                </Button>
              </div>
            </div>
            <div className="max-h-[22rem] space-y-3 overflow-y-auto rounded-2xl border border-border p-2">
              {grupos.map((g) => (
                <GrupoProdutos key={g.titulo} titulo={g.titulo} produtos={g.produtos} marcados={marcados} onAlternar={alternar} />
              ))}
            </div>
          </section>

          <section aria-label="Opções do catálogo" className="space-y-4">
            <div>
              <label htmlFor="cat-rotulo" className="mb-1.5 block text-sm font-medium text-tinta">
                Título da capa
              </label>
              <Input id="cat-rotulo" value={rotulo} maxLength={40} onChange={(e) => setRotulo(e.target.value)} placeholder="Catálogo de produtos" />
              <p className="mt-1 text-xs text-texto-secundario">Ex.: Catálogo de Natal, Linha de brindes.</p>
            </div>
            <div className="divide-y divide-border rounded-2xl border border-border">
              <Opcao rotulo="Mostrar preços" texto="Sem preços, o cliente pede o orçamento." marcado={mostrarPreco} onMudar={setMostrarPreco} />
              <Opcao rotulo="QR code em cada produto" texto="Aponta a câmera e abre o produto no site." marcado={qrPorProduto} onMudar={setQrPorProduto} />
            </div>
            <Button type="button" className="w-full" disabled={total === 0 || gerando} onClick={() => void gerar()}>
              {gerando ? <Loader2 className="animate-spin" /> : <FileText />}
              {gerando ? 'Gerando…' : `Gerar catálogo (${total})`}
            </Button>
            {gerando && <p className="text-center text-xs text-texto-secundario">Preparando as fotos e as páginas. Leva alguns segundos.</p>}
          </section>
        </div>
      )}
    </>
  )
}

/** Linha de opção: título e explicação à esquerda, interruptor à direita */
function Opcao({ rotulo, texto, marcado, onMudar }: { rotulo: string; texto: string; marcado: boolean; onMudar: (v: boolean) => void }) {
  return (
    <div className="flex items-center gap-3 p-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-tinta">{rotulo}</p>
        <p className="text-xs text-texto-secundario">{texto}</p>
      </div>
      <Interruptor marcado={marcado} onMudar={onMudar} rotulo={rotulo} />
    </div>
  )
}

function GrupoProdutos({
  titulo,
  produtos,
  marcados,
  onAlternar,
}: {
  titulo: string
  produtos: ProdutoVitrineResumo[]
  marcados: Set<string>
  onAlternar: (ids: string[], marcar: boolean) => void
}) {
  const ids = produtos.map((p) => p.id)
  const quantos = ids.filter((id) => marcados.has(id)).length
  const todos = quantos === ids.length
  return (
    <div>
      <label className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-fundo">
        <input
          type="checkbox"
          className="h-4 w-4 accent-[rgb(var(--marca))]"
          checked={todos}
          ref={(el) => {
            if (el) el.indeterminate = quantos > 0 && !todos
          }}
          onChange={() => onAlternar(ids, !todos)}
        />
        <span className="flex-1 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-texto-secundario">{titulo}</span>
        <span className="text-xs text-texto-secundario tabular-nums">
          {quantos}/{ids.length}
        </span>
      </label>
      <ul className="mt-0.5">
        {produtos.map((p) => (
          <li key={p.id}>
            <label className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-fundo', !marcados.has(p.id) && 'opacity-60')}>
              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={marcados.has(p.id)} onChange={(e) => onAlternar([p.id], e.target.checked)} />
              {p.imagens[0] ? (
                <img src={p.imagens[0].url} alt="" className="h-9 w-9 shrink-0 rounded-md object-cover" />
              ) : (
                <span className="h-9 w-9 shrink-0 rounded-md bg-fundo" aria-hidden="true" />
              )}
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-tinta">{nomeNoSite(p)}</span>
                <span className="block truncate text-xs text-texto-secundario">{textoPrecoProduto(p)}</span>
              </span>
              {p.destaque && <Sparkles className="h-3.5 w-3.5 shrink-0 text-amber-500" aria-label="Destaque" />}
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}
