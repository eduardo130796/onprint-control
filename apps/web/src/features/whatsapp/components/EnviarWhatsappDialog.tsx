import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, FileText, Loader2, Pencil, RotateCcw, Send, UserRound } from 'lucide-react'
import { toast } from 'sonner'
import { escolherAnexosArte, formatarNumeroWhatsapp, normalizarNumeroWhatsapp, vaiComoImagem, type TipoEnvioWhatsapp } from '@onprint/shared'
import { CHAVE_WHATSAPP, whatsappApi } from '@/api/whatsapp'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Checkbox, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { linkWhatsappEnvio } from '@/features/vitrine/divulgar'
import { cn } from '@/lib/utils'
import { BolhaWhatsapp } from './BolhaWhatsapp'

/** O que mandar e para quem (cada tela monta o seu: orçamento, arte, pedido, catálogo, produto) */
export interface EnvioWhatsapp {
  /** "Enviar orçamento", "Enviar catálogo"... */
  titulo: string
  tipo: TipoEnvioWhatsapp
  destinatario: { nome: string; numero?: string | null; clienteId?: string | null }
  /** Texto pronto; com o PDF anexado, o texto avisa que ele vai logo abaixo */
  mensagem: (comPdf: boolean, selecionados: string[]) => string
  vinculo?: { orcamentoId?: string; pedidoId?: string; arteId?: string }
  /** PDF que pode ir junto (gerado no navegador na hora do envio) */
  pdf?: { rotulo: string; gerar: () => Promise<{ blob: Blob; nome: string }>; marcado?: boolean }
  /**
   * Itens escolhidos no diálogo que entram no texto e levam o arquivo (já no servidor) logo depois dele: as artes
   * do pedido. Vão até ANEXOS_ARTE_MAX arquivos / ANEXOS_ARTE_MAX_MB; o que não couber fica pelo link.
   */
  selecao?: { rotulo: string; itens: ItemSelecaoEnvio[] }
  /** Depois de enviar pela conexão, abrir o WhatsApp ou copiar (ex.: marcar o orçamento como enviado) */
  onEnviado?: (via: 'whatsapp' | 'wame' | 'copiado', selecionados: string[]) => void
}

export interface ItemSelecaoEnvio {
  id: string
  titulo: string
  detalhe?: string
  miniaturaUrl: string | null
  /** Arquivo que vai junto (null = só pelo link) */
  arquivo: { id: string; nome: string; mime: string; tamanho: number } | null
  marcado: boolean
}

/**
 * "Enviar pelo WhatsApp": destinatário (número do cadastro ou outro), a mensagem como o cliente vê (editável)
 * e o PDF opcional. Com a conexão da gráfica, "Enviar" manda na hora e registra; sem ela (ou fora do plano, ou
 * pausado), o botão vira "Abrir no WhatsApp" (wa.me com o texto pronto). "Copiar" fica sempre.
 */
export function EnviarWhatsappDialog({ envio, onFechar }: { envio: EnvioWhatsapp | null; onFechar: () => void }) {
  return (
    <Dialog open={Boolean(envio)} onOpenChange={(v) => !v && onFechar()}>
      <DialogContent className="top-[3%] max-h-[94vh] max-w-2xl gap-0 p-0 sm:top-[5%] sm:max-h-[90vh]">{envio && <Conteudo envio={envio} onFechar={onFechar} />}</DialogContent>
    </Dialog>
  )
}

function Conteudo({ envio, onFechar }: { envio: EnvioWhatsapp; onFechar: () => void }) {
  const queryClient = useQueryClient()
  const disponivel = useQuery({ queryKey: [...CHAVE_WHATSAPP, 'disponivel'], queryFn: whatsappApi.disponivel, staleTime: 30_000 })
  const numeroCadastro = normalizarNumeroWhatsapp(envio.destinatario.numero)
  const [outroNumero, setOutroNumero] = useState(!numeroCadastro)
  const [digitado, setDigitado] = useState(numeroCadastro ? '' : (envio.destinatario.numero ?? ''))
  const [comPdf, setComPdf] = useState(envio.pdf?.marcado ?? Boolean(envio.pdf))
  const [editado, setEditado] = useState<string | null>(null)
  const [editando, setEditando] = useState(false)
  const [enviando, setEnviando] = useState<'pdf' | 'envio' | null>(null)

  const conectado = disponivel.data?.conectado ?? false
  const anexar = Boolean(envio.pdf) && comPdf && conectado
  const [marcados, setMarcados] = useState<string[]>(() => envio.selecao?.itens.filter((i) => i.marcado).map((i) => i.id) ?? [])
  const selecionados = envio.selecao ? envio.selecao.itens.filter((i) => marcados.includes(i.id)) : []
  // Arquivos das artes só pela conexão da gráfica (o wa.me não leva arquivo), dentro do limite
  const { anexos: arquivosJuntos } = escolherAnexosArte(conectado ? selecionados.flatMap((i) => (i.arquivo ? [i.arquivo] : [])) : [])
  const vaiJunto = (i: ItemSelecaoEnvio) => Boolean(i.arquivo && arquivosJuntos.includes(i.arquivo))
  const semSelecao = Boolean(envio.selecao) && selecionados.length === 0
  const padrao = envio.mensagem(anexar, marcados)
  const texto = editado ?? padrao
  const numero = outroNumero ? normalizarNumeroWhatsapp(digitado) : numeroCadastro
  // Nome de exibição inteiro ("Pet Feliz", não "Pet"); só encurta nome muito longo para caber no botão
  const nome = envio.destinatario.nome.trim()
  const nomeCurto = nome.length <= 22 ? nome : `${nome.slice(0, 20).trimEnd()}…`

  function concluir(via: 'whatsapp' | 'wame' | 'copiado') {
    envio.onEnviado?.(via, marcados)
    onFechar()
  }

  async function enviar() {
    if (!numero) return toast.error('Informe um WhatsApp válido com DDD.')
    if (!texto.trim()) return toast.error('Escreva a mensagem.')
    if (semSelecao) return toast.error(`Escolha ${envio.selecao!.rotulo.toLowerCase()}.`)
    const dados = {
      tipo: envio.tipo,
      telefone: numero,
      texto,
      clienteId: envio.destinatario.clienteId ?? null,
      ...envio.vinculo,
      ...(arquivosJuntos.length ? { arquivoIds: arquivosJuntos.map((a) => a.id) } : {}),
    }
    try {
      let r
      if (anexar && envio.pdf) {
        setEnviando('pdf')
        const { blob, nome } = await envio.pdf.gerar()
        setEnviando('envio')
        r = await whatsappApi.enviarComPdf(dados, new File([blob], nome, { type: 'application/pdf' }))
      } else {
        setEnviando('envio')
        r = await whatsappApi.enviar(dados)
      }
      if (r.aviso) toast.warning(r.aviso)
      else toast.success(disponivel.data?.teste ? 'Mensagem registrada (modo de teste: não saiu de verdade).' : `Mensagem enviada para ${nomeCurto} pelo WhatsApp.`)
      void queryClient.invalidateQueries({ queryKey: CHAVE_WHATSAPP })
      void queryClient.invalidateQueries({ queryKey: ['pedidos', 'historico'] })
      concluir('whatsapp')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setEnviando(null)
    }
  }

  function abrirNoWhatsapp() {
    window.open(linkWhatsappEnvio(numero, texto), '_blank', 'noopener')
    concluir('wame')
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto)
      toast.success('Mensagem copiada. Cole no WhatsApp do cliente.')
      concluir('copiado')
    } catch {
      toast.error('Não foi possível copiar. Selecione o texto e copie.')
    }
  }

  const situacao = disponivel.isPending
    ? 'Verificando o WhatsApp da gráfica…'
    : conectado
      ? disponivel.data?.teste
        ? 'Modo de teste: a mensagem fica só registrada, não sai de verdade.'
        : `Sai pelo WhatsApp da gráfica${disponivel.data?.numero ? ` (${formatarNumeroWhatsapp(disponivel.data.numero)})` : ''} e fica registrada.`
      : `${disponivel.data?.motivo ?? 'O WhatsApp da gráfica não está disponível.'} O botão abre o WhatsApp com a mensagem pronta.`

  return (
    <div className="flex max-h-[94vh] min-w-0 flex-col sm:max-h-[90vh]">
      <div className="border-b border-border px-5 py-4 sm:px-6">
        <DialogTitle className="pr-8">{envio.titulo}</DialogTitle>
        <DialogDescription className="mt-1 pr-8">{situacao}</DialogDescription>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 sm:px-6">
        <section aria-label="Para quem" className="rounded-xl border border-border p-3">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marca-suave text-marca-escuro">
              <UserRound className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-tinta">{envio.destinatario.nome}</p>
              <p className="text-xs text-texto-secundario">
                {outroNumero ? 'Outro número' : formatarNumeroWhatsapp(numeroCadastro)}
              </p>
            </div>
            {numeroCadastro && (
              <button type="button" className="shrink-0 rounded-lg px-2 py-1 text-xs font-medium text-marca-escuro hover:bg-marca-suave" onClick={() => setOutroNumero(!outroNumero)}>
                {outroNumero ? 'Usar o do cadastro' : 'Outro número'}
              </button>
            )}
          </div>
          {outroNumero && (
            <div className="mt-3 space-y-1">
              <Input
                aria-label="WhatsApp com DDD"
                inputMode="tel"
                autoFocus={Boolean(numeroCadastro)}
                placeholder="(11) 98888-7777"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value)}
              />
              <p className={cn('text-xs', digitado && !numero ? 'text-coral-escuro' : 'text-texto-secundario')}>
                {!numeroCadastro && !digitado ? 'Este cliente não tem WhatsApp no cadastro. Digite o número com DDD.' : digitado && !numero ? 'Número inválido: use o DDD e o número.' : 'Só para este envio (o cadastro não muda).'}
              </p>
            </div>
          )}
        </section>

        {envio.selecao && (
          <section aria-label={envio.selecao.rotulo}>
            <p className="mb-1.5 text-sm font-medium text-tinta">{envio.selecao.rotulo}</p>
            <ul className="divide-y divide-border rounded-xl border border-border">
              {envio.selecao.itens.map((i) => {
                const marcado = marcados.includes(i.id)
                const junto = vaiJunto(i)
                return (
                  <li key={i.id}>
                    <label className="flex cursor-pointer items-center gap-3 p-2.5 text-sm">
                      <Checkbox checked={marcado} onChange={(e) => setMarcados((m) => (e.target.checked ? [...m, i.id] : m.filter((x) => x !== i.id)))} />
                      <span className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-white">
                        {i.miniaturaUrl ? <img src={i.miniaturaUrl} alt="" className="h-full w-full object-contain" /> : <FileText className="h-5 w-5 text-texto-secundario" />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-tinta">{i.titulo}</span>
                        <span className="block truncate text-xs text-texto-secundario">
                          {[
                            i.detalhe,
                            !marcado
                              ? 'Não vai nesta mensagem'
                              : junto
                                ? vaiComoImagem(i.arquivo!.mime)
                                  ? 'Vai como imagem'
                                  : 'Vai como PDF'
                                : !conectado
                                  ? 'Só pelo link (o wa.me não leva arquivo)'
                                  : i.arquivo
                                    ? 'Só pelo link (passou do limite de arquivos)'
                                    : 'Só pelo link (formato que o celular não abre)',
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      </span>
                    </label>
                  </li>
                )
              })}
            </ul>
          </section>
        )}

        <section aria-label="Mensagem">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-tinta">Mensagem</p>
            <div className="flex gap-1">
              {editado !== null && editado !== padrao && (
                <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-marca-escuro hover:bg-marca-suave" onClick={() => setEditado(null)}>
                  <RotateCcw className="h-3 w-3" /> Restaurar texto
                </button>
              )}
              <button type="button" className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-marca-escuro hover:bg-marca-suave" onClick={() => setEditando(!editando)} aria-expanded={editando}>
                <Pencil className="h-3 w-3" /> {editando ? 'Ver como fica' : 'Editar texto'}
              </button>
            </div>
          </div>
          {editando ? (
            <>
              <Textarea aria-label="Texto da mensagem" rows={12} value={texto} onChange={(e) => setEditado(e.target.value)} className="font-mono text-[0.8125rem]" />
              <p className="mt-1 text-xs text-texto-secundario">No WhatsApp, *texto* fica em negrito. Deixe o link sozinho na última linha para aparecer a prévia.</p>
            </>
          ) : (
            <BolhaWhatsapp
              texto={texto}
              anexo={anexar ? envio.pdf?.rotulo : null}
              arquivos={selecionados.filter(vaiJunto).map((i) => ({ nome: i.arquivo!.nome, imagem: vaiComoImagem(i.arquivo!.mime), miniaturaUrl: i.miniaturaUrl, legenda: i.titulo }))}
            />
          )}
        </section>

        {envio.pdf && (
          <label className={cn('flex items-start gap-3 rounded-xl border border-border p-3 text-sm', !conectado && 'opacity-60')}>
            <Checkbox checked={anexar} disabled={!conectado} onChange={(e) => setComPdf(e.target.checked)} className="mt-0.5" />
            <span className="min-w-0">
              <span className="flex items-center gap-1.5 font-medium text-tinta">
                <FileText className="h-4 w-4 text-marca-escuro" /> Anexar PDF
              </span>
              <span className="block truncate text-xs text-texto-secundario">{conectado ? envio.pdf.rotulo : 'Só no envio pela conexão da gráfica (o wa.me não leva arquivo).'}</span>
            </span>
          </label>
        )}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t border-border px-5 py-4 sm:flex-row sm:justify-end sm:px-6">
        <Button type="button" variant="outline" onClick={() => void copiar()} disabled={Boolean(enviando) || semSelecao}>
          <Copy /> Copiar
        </Button>
        {conectado ? (
          <Button type="button" onClick={() => void enviar()} disabled={Boolean(enviando) || !numero || disponivel.isPending || semSelecao}>
            {enviando ? <Loader2 className="animate-spin" /> : <Send />} {enviando === 'pdf' ? 'Gerando o PDF…' : enviando ? 'Enviando…' : `Enviar para ${nomeCurto}`}
          </Button>
        ) : (
          <Button type="button" onClick={abrirNoWhatsapp} disabled={disponivel.isPending || semSelecao}>
            <ExternalLink /> Abrir no WhatsApp
          </Button>
        )}
      </div>
    </div>
  )
}
