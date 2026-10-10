import { useEffect, useMemo, useState } from 'react'
import { Check, Copy, Download, ExternalLink, Loader2, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { TEMAS, temaOuPadrao, type ProdutoVitrineResumo } from '@onprint/shared'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Skeleton } from '@/components/ui/skeleton'
import { useUrlArquivo } from '@/features/configuracoes/hooks'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { TAMANHO_ARTE, carregarImagem, gerarArte, type DadosArte, type FormatoArte } from '../arte'
import {
  mensagemProduto,
  mensagemVitrine,
  nomeArquivo,
  nomeNoSite,
  partesPrecoProduto,
  textoPrecoProduto,
  urlImagemGrande,
  urlProduto,
} from '../divulgar'
import { baixarBlob, compartilharArquivo } from '../compartilhar'
import { useProdutosVitrine, useVitrineConfig } from '../hooks'
import { EnvioWhatsapp } from './EnvioWhatsapp'
import { semProtocolo } from '../utils'

/** O que divulgar: um produto ou a vitrine inteira */
export type AlvoCompartilhar = { tipo: 'produto'; produto: ProdutoVitrineResumo } | { tipo: 'vitrine' }

interface CompartilharDialogProps {
  alvo: AlvoCompartilhar | null
  onFechar: () => void
}

/**
 * Vitrine → "Compartilhar" (produto) e "Divulgar a vitrine": link para copiar, mensagem pronta para o WhatsApp
 * (cliente do cadastro ou qualquer contato) e imagens de Status e Post desenhadas no navegador.
 */
export function CompartilharDialog({ alvo, onFechar }: CompartilharDialogProps) {
  return (
    <Dialog open={Boolean(alvo)} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="top-[3%] max-h-[94vh] max-w-4xl gap-0 overflow-y-auto p-0 sm:top-[5%] sm:max-h-[90vh]">
        {alvo && <Conteudo key={alvo.tipo === 'produto' ? alvo.produto.id : 'vitrine'} alvo={alvo} />}
      </DialogContent>
    </Dialog>
  )
}

function Conteudo({ alvo }: { alvo: AlvoCompartilhar }) {
  const { usuario } = useAuth()
  const config = useVitrineConfig()
  const publicados = useProdutosVitrine({ publicado: 'true' })
  const logoUrl = useUrlArquivo(usuario?.empresa.logoArquivoId)
  const cores = TEMAS[temaOuPadrao(usuario?.empresa.corTema)]
  const c = config.data
  const loja = (c?.titulo || usuario?.empresa.exibicao || 'Nossa gráfica').trim()
  const produto = alvo.tipo === 'produto' ? alvo.produto : null
  const nome = produto ? nomeNoSite(produto) : loja
  const link = c ? (produto ? urlProduto(c.urlPublica, produto.slug) : c.urlPublica) : ''

  const [copiado, setCopiado] = useState(false)

  const mensagemPadrao = useMemo(() => {
    if (!link) return ''
    return produto ? mensagemProduto({ produto: nome, preco: textoPrecoProduto(produto), link }) : mensagemVitrine({ loja, link })
  }, [produto, nome, link, loja])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(link)
      setCopiado(true)
      toast.success('Link copiado.')
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o link e copie manualmente.')
    }
  }

  return (
    <>
      <div className="border-b border-border px-5 pb-4 pt-5 sm:px-6">
        <DialogTitle className="pr-8">{produto ? 'Compartilhar produto' : 'Divulgar a vitrine'}</DialogTitle>
        <DialogDescription className="mt-1 truncate pr-8">
          {produto ? nome : 'Mande o link do site, poste a imagem no Status e deixe o QR code à vista.'}
        </DialogDescription>
      </div>

      {config.isPending ? (
        <div className="grid gap-4 p-6 md:grid-cols-2">
          <Skeleton className="h-80 w-full" />
          <Skeleton className="h-80 w-full" />
        </div>
      ) : !c ? (
        <p className="p-6 text-sm text-texto-secundario">Não foi possível carregar a vitrine. Feche e tente de novo.</p>
      ) : (
        <div className="grid md:grid-cols-[minmax(0,19rem)_minmax(0,1fr)]">
          <PreviaArtes
            nomeArquivoBase={nomeArquivo(nome)}
            montar={async () => {
              const [logo, fotos] = await Promise.all([
                carregarImagem(logoUrl.data),
                produto
                  ? carregarImagem(produto.imagens[0] ? urlImagemGrande(produto.imagens[0].url) : null).then((f) => [f])
                  : Promise.all(
                      [...(publicados.data ?? [])]
                        .filter((p) => p.imagens.length > 0)
                        .sort((a, b) => Number(b.destaque) - Number(a.destaque))
                        .slice(0, 3)
                        .map((p) => carregarImagem(urlImagemGrande(p.imagens[0]!.url))),
                    ),
              ])
              const dados: DadosArte = {
                cores,
                loja,
                logo,
                site: semProtocolo(c.urlPublica),
                produto: produto ? { nome, categoria: produto.categoria?.nome ?? null, preco: partesPrecoProduto(produto), foto: fotos[0] ?? null } : null,
                vitrine: produto ? null : { titulo: loja, slogan: c.slogan ?? null, url: c.urlPublica, fotos: fotos.filter((f): f is HTMLImageElement => Boolean(f)) },
              }
              return dados
            }}
            pronto={!logoUrl.isLoading && (Boolean(produto) || !publicados.isPending)}
            titulo={nome}
          />

          <div className="space-y-5 p-5 sm:p-6">
            <section>
              <p className="mb-1.5 text-sm font-medium text-tinta">{produto ? 'Link do produto' : 'Endereço do site'}</p>
              <div className="flex gap-2">
                <div className="flex h-10 min-w-0 flex-1 items-center rounded-lg border border-input bg-fundo/60 px-3 text-sm text-tinta">
                  <span className="truncate" title={link}>{semProtocolo(link)}</span>
                </div>
                <Button type="button" variant="outline" onClick={() => void copiar()} className="shrink-0">
                  {copiado ? <Check /> : <Copy />}
                  <span className="hidden sm:inline">{copiado ? 'Copiado' : 'Copiar'}</span>
                </Button>
                <Button asChild variant="ghost" size="icon" className="shrink-0" aria-label="Abrir no site">
                  <a href={link} target="_blank" rel="noreferrer">
                    <ExternalLink />
                  </a>
                </Button>
              </div>
              {!(c.ativa && c.liberadaNoPlano) && <p className="mt-1.5 text-xs text-amber-700">O site está fora do ar: quem abrir o link verá "página não encontrada".</p>}
            </section>

            <EnvioWhatsapp key={mensagemPadrao} id="comp" mensagemPadrao={mensagemPadrao} />
          </div>
        </div>
      )}
    </>
  )
}

/** Prévia das imagens (Status e Post), com baixar e compartilhar */
function PreviaArtes({ montar, pronto, nomeArquivoBase, titulo }: { montar: () => Promise<DadosArte>; pronto: boolean; nomeArquivoBase: string; titulo: string }) {
  const [formato, setFormato] = useState<FormatoArte>('status')
  const [artes, setArtes] = useState<Partial<Record<FormatoArte, { blob: Blob; url: string }>>>({})
  const [erro, setErro] = useState<string | null>(null)
  const [compartilhando, setCompartilhando] = useState(false)

  useEffect(() => {
    if (!pronto) return
    let ativo = true
    const urls: string[] = []
    montar()
      .then(async (dados) => {
        for (const f of ['status', 'post'] as const) {
          const blob = await gerarArte(f, dados)
          if (!ativo) return
          const url = URL.createObjectURL(blob)
          urls.push(url)
          setArtes((a) => ({ ...a, [f]: { blob, url } }))
        }
      })
      .catch((e: Error) => ativo && setErro(e.message))
    return () => {
      ativo = false
      urls.forEach((u) => URL.revokeObjectURL(u))
    }
    // montar muda a cada render; a arte só refaz quando os dados ficam prontos
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto])

  const arte = artes[formato]
  const arquivo = `${nomeArquivoBase}-${formato}.png`
  const { largura, altura } = TAMANHO_ARTE[formato]

  async function compartilhar() {
    if (!arte) return
    setCompartilhando(true)
    try {
      const r = await compartilharArquivo(arte.blob, arquivo, titulo)
      if (r === 'baixado') toast.success('Imagem baixada. Poste no Status ou nas redes.')
      if (r === 'bloqueado') toast.info('O navegador pediu um novo toque: clique em Compartilhar de novo.')
    } finally {
      setCompartilhando(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 border-b border-border bg-fundo/60 p-5 md:border-b-0 md:border-r sm:p-6">
      <div className="grid grid-cols-2 gap-1 rounded-xl bg-card p-1 ring-1 ring-border" role="tablist" aria-label="Formato da imagem">
        {(['status', 'post'] as const).map((f) => (
          <button
            key={f}
            type="button"
            role="tab"
            aria-selected={formato === f}
            onClick={() => setFormato(f)}
            className={cn(
              'flex h-9 flex-col items-center justify-center rounded-lg text-sm font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca',
              formato === f ? 'bg-marca text-marca-contraste' : 'text-texto-secundario hover:text-tinta',
            )}
          >
            {TAMANHO_ARTE[f].rotulo}
          </button>
        ))}
      </div>

      <div className="flex justify-center">
        <div
          className={cn('relative overflow-hidden rounded-2xl bg-card shadow-suave ring-1 ring-border', formato === 'status' ? 'h-[24rem] md:h-[27rem]' : 'w-full max-w-[17rem]')}
          style={{ aspectRatio: `${largura} / ${altura}` }}
        >
          {arte ? (
            <img src={arte.url} alt={`Imagem de ${TAMANHO_ARTE[formato].rotulo} (${largura}×${altura})`} className="h-full w-full object-contain" />
          ) : erro ? (
            <p className="flex h-full items-center justify-center p-4 text-center text-xs text-coral-escuro">{erro}</p>
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-xs text-texto-secundario">
              <Loader2 className="h-5 w-5 animate-spin" /> Criando a imagem…
            </div>
          )}
        </div>
      </div>
      <p className="-mt-1 text-center text-xs text-texto-secundario">
        {formato === 'status' ? 'Status do WhatsApp e Stories' : 'Feed do Instagram e Facebook'} · {largura}×{altura}
      </p>

      <div className="grid grid-cols-2 gap-2">
        <Button type="button" variant="outline" disabled={!arte} onClick={() => arte && baixarBlob(arte.blob, arquivo)}>
          <Download /> Baixar PNG
        </Button>
        <Button type="button" disabled={!arte || compartilhando} onClick={() => void compartilhar()}>
          {compartilhando ? <Loader2 className="animate-spin" /> : <Share2 />} Compartilhar
        </Button>
      </div>
    </div>
  )
}
