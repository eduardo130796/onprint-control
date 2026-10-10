import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { Check, Copy, Download, ExternalLink, Printer } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { semProtocolo } from '../utils'

interface EnderecoPublicoProps {
  url: string
  /** Site no ar (módulo liberado e vitrine ativa) */
  noAr: boolean
  nomeEmpresa: string
}

/** Endereço do site: copiar, abrir e QR code para imprimir (balcão, cartão de visita, adesivo na fachada). */
export function EnderecoPublico({ url, noAr, nomeEmpresa }: EnderecoPublicoProps) {
  const [qr, setQr] = useState<string | null>(null)
  const [copiado, setCopiado] = useState(false)

  useEffect(() => {
    let ativo = true
    // QR sempre preto no branco (lê melhor e imprime em qualquer impressora)
    QRCode.toDataURL(url, { margin: 1, width: 640, errorCorrectionLevel: 'M', color: { dark: '#111827FF', light: '#FFFFFFFF' } })
      .then((d) => ativo && setQr(d))
      .catch(() => ativo && setQr(null))
    return () => {
      ativo = false
    }
  }, [url])

  async function copiar() {
    try {
      await navigator.clipboard.writeText(url)
      setCopiado(true)
      toast.success('Endereço copiado.')
      window.setTimeout(() => setCopiado(false), 2000)
    } catch {
      toast.error('Não foi possível copiar. Selecione o endereço e copie manualmente.')
    }
  }

  function imprimir() {
    if (!qr) return
    const janela = window.open('', '_blank', 'width=720,height=900')
    if (!janela) return toast.error('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.')
    const esc = (t: string) => t.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string)
    janela.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR code — ${esc(nomeEmpresa)}</title>
<style>
  @page { size: A4; margin: 18mm; }
  body { font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; color: #111827; text-align: center; margin: 0; padding: 32px 16px; }
  h1 { font-size: 28px; margin: 0 0 6px; }
  p { margin: 0; color: #4b5563; font-size: 16px; }
  .cartao { display: inline-block; border: 2px solid #111827; border-radius: 24px; padding: 32px 40px 28px; margin-top: 28px; }
  img { width: 300px; height: 300px; display: block; margin: 0 auto 18px; image-rendering: pixelated; }
  .url { font-size: 20px; font-weight: 700; color: #111827; word-break: break-all; }
</style></head><body>
<h1>${esc(nomeEmpresa)}</h1><p>Veja nossos produtos e peça seu orçamento</p>
<div class="cartao"><img src="${qr}" alt="QR code"><div class="url">${esc(semProtocolo(url))}</div></div>
<script>window.onload = function () { window.focus(); window.print(); }</script>
</body></html>`)
    janela.document.close()
  }

  return (
    <Card className="overflow-hidden">
      <div className="relative bg-grafite px-5 pb-5 pt-5 text-white">
        <div className="pointer-events-none absolute -right-10 -top-10 h-36 w-36 rounded-full bg-marca/30 blur-2xl" aria-hidden="true" />
        <div className="relative flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/70">
          <span className={cn('h-2 w-2 rounded-full', noAr ? 'bg-verde shadow-[0_0_0_4px_rgba(34,197,94,0.25)]' : 'bg-white/40')} aria-hidden="true" />
          {noAr ? 'No ar' : 'Fora do ar'}
        </div>
        <p className="relative mt-2 break-all font-titulo text-lg font-bold leading-snug">{semProtocolo(url)}</p>
        <div className="relative mt-4 grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void copiar()} className="border-white/20 bg-white/10 text-white shadow-none hover:border-white/40 hover:bg-white/20">
            {copiado ? <Check /> : <Copy />} {copiado ? 'Copiado' : 'Copiar'}
          </Button>
          <Button asChild size="sm">
            <a href={url} target="_blank" rel="noreferrer">
              <ExternalLink /> Abrir site
            </a>
          </Button>
        </div>
      </div>
      <div className="flex items-center gap-4 p-5">
        <div className="flex h-28 w-28 shrink-0 items-center justify-center rounded-xl bg-white p-1.5 ring-1 ring-border">
          {qr ? <img src={qr} alt={`QR code de ${semProtocolo(url)}`} className="h-full w-full" /> : <span className="h-full w-full animate-pulse rounded-lg bg-slate-100" />}
        </div>
        <div className="min-w-0 space-y-2">
          <p className="text-sm font-semibold text-tinta">QR code do site</p>
          <p className="text-xs text-texto-secundario">Imprima para o balcão, cartões e adesivos: o cliente aponta a câmera e cai direto na sua vitrine.</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" size="sm" onClick={imprimir} disabled={!qr}>
              <Printer /> Imprimir
            </Button>
            {qr && (
              <Button asChild variant="ghost" size="sm">
                <a href={qr} download="qrcode-vitrine.png">
                  <Download /> PNG
                </a>
              </Button>
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
