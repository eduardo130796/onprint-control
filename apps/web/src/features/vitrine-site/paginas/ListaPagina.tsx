import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { useMutation } from '@tanstack/react-query'
import { ArrowLeft, ArrowRight, Check, CheckCircle2, ClipboardList, Loader2, Lock, MessageSquarePlus, Send, Trash2 } from 'lucide-react'
import { pedidoVitrineSchema, type PedidoVitrineEnviado } from '@onprint/shared'
import { mascaraTelefone } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { Container, ImagemProduto, PrecoCompacto } from '../componentes/comum'
import { CampoMedida, CampoQuantidade, CampoTexto, MensagemErro, Rotulo } from '../componentes/campos'
import { IconeWhatsapp } from '../componentes/icones'
import { mensagemPedidoEnviado } from '../compartilhar'
import { useMensagemWhatsappPagina, useTituloPagina, useVitrine } from '../contexto'
import { botao } from '../estilos'
import { formatarMetros, lerMedida, medidaParaCampo } from '../formato'
import { itensParaPedido, type ItemLista } from '../lista'
import { descricaoLista } from '../seo'

/** Medidas que faltam ou passam da máxima (o item fica marcado e o envio espera a correção) */
function problemaMedidas(item: ItemLista): string | null {
  if (item.modoCalculo !== 'm2' && item.modoCalculo !== 'metro_linear') return null
  if (!item.largura || (item.modoCalculo === 'm2' && !item.altura)) return 'Informe as medidas deste item.'
  if (item.larguraMaxima && Number(item.largura) > Number(item.larguraMaxima)) return `A medida máxima é ${formatarMetros(item.larguraMaxima)}.`
  if (item.alturaMaxima && item.altura && Number(item.altura) > Number(item.alturaMaxima)) return `A altura máxima é ${formatarMetros(item.alturaMaxima)}.`
  return null
}

function ItemDaLista({ item, destacarErro }: { item: ItemLista; destacarErro: boolean }) {
  const { lista } = useVitrine()
  const [qtd, setQtd] = useState(String(item.quantidade))
  const [largura, setLargura] = useState(medidaParaCampo(item.largura))
  const [altura, setAltura] = useState(medidaParaCampo(item.altura))
  const [obsAberta, setObsAberta] = useState(Boolean(item.observacao))
  useEffect(() => setQtd(String(item.quantidade)), [item.quantidade])

  const usaMedidas = item.modoCalculo === 'm2' || item.modoCalculo === 'metro_linear'
  const problema = problemaMedidas(item)
  const medida = (texto: string, campo: 'largura' | 'altura', set: (v: string) => void) => {
    set(texto)
    const lida = lerMedida(texto)
    lista.atualizar(item.id, { [campo]: lida ?? null })
  }
  const invalida = (texto: string) => lerMedida(texto) === undefined

  return (
    <li className={cn('vt-surgir rounded-3xl border bg-white p-4 transition sm:p-5', destacarErro && problema ? 'border-red-300 ring-4 ring-red-500/10' : 'border-slate-200')}>
      <div className="flex gap-4">
        <Link to={`/produto/${item.produtoSlug}`} className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-slate-50 ring-1 ring-inset ring-slate-900/5 sm:h-24 sm:w-24">
          <ImagemProduto src={item.capaUrl} alt={item.nome} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Link to={`/produto/${item.produtoSlug}`} className="font-semibold leading-snug text-slate-900 hover:underline">
                {item.nome}
              </Link>
              <PrecoCompacto preco={item.preco} className="mt-0.5" />
            </div>
            <button
              type="button"
              onClick={() => lista.remover(item.id)}
              aria-label={`Remover ${item.nome} da lista`}
              className="-mr-1 -mt-1 flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca"
            >
              <Trash2 className="h-[1.125rem] w-[1.125rem]" />
            </button>
          </div>

          <div className="mt-4 flex flex-wrap items-start gap-x-5 gap-y-3">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-slate-600" aria-hidden="true">
                Quantidade
              </span>
              <CampoQuantidade
                id={`qtd-${item.id}`}
                compacto
                valor={qtd}
                aoMudar={(v) => {
                  setQtd(v)
                  const n = Number(v)
                  if (Number.isInteger(n) && n >= 1) lista.atualizar(item.id, { quantidade: Math.min(n, 1_000_000) })
                }}
              />
            </div>
            {usaMedidas && (
              <div className="grid w-full grid-cols-2 gap-3 sm:w-auto sm:grid-cols-[8rem_8rem]">
                <CampoMedida
                  id={`larg-${item.id}`}
                  compacto
                  rotulo={item.modoCalculo === 'metro_linear' ? 'Comprimento' : 'Largura'}
                  valor={largura}
                  aoMudar={(v) => medida(v, 'largura', setLargura)}
                  maxima={item.larguraMaxima}
                  erro={invalida(largura) ? 'Medida inválida.' : undefined}
                />
                <CampoMedida
                  id={`alt-${item.id}`}
                  compacto
                  rotulo={item.modoCalculo === 'metro_linear' ? 'Altura (opcional)' : 'Altura'}
                  valor={altura}
                  aoMudar={(v) => medida(v, 'altura', setAltura)}
                  maxima={item.alturaMaxima}
                  erro={invalida(altura) ? 'Medida inválida.' : undefined}
                />
              </div>
            )}
          </div>
          {problema && <p className="mt-2 text-sm font-medium text-red-600">{problema}</p>}

          {item.acabamentos.length > 0 && (
            <fieldset className="mt-4">
              <legend className="mb-2 text-xs font-medium text-slate-600">Acabamentos</legend>
              <div className="flex flex-wrap gap-2">
                {item.acabamentos.map((a) => {
                  const marcado = a.obrigatorio || item.acabamentoIds.includes(a.id)
                  return (
                    <label
                      key={a.id}
                      className={cn(
                        'inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-marca',
                        a.obrigatorio ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-600' : 'cursor-pointer',
                        !a.obrigatorio && (marcado ? 'border-marca bg-marca-suave font-medium text-slate-900' : 'border-slate-200 text-slate-600 hover:border-slate-400'),
                      )}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={marcado}
                        disabled={a.obrigatorio}
                        onChange={(e) =>
                          lista.atualizar(item.id, {
                            acabamentoIds: e.target.checked ? [...item.acabamentoIds, a.id] : item.acabamentoIds.filter((id) => id !== a.id),
                          })
                        }
                      />
                      {a.obrigatorio ? <Lock className="h-3.5 w-3.5" aria-hidden="true" /> : marcado && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
                      {a.nome}
                    </label>
                  )
                })}
              </div>
            </fieldset>
          )}

          <div className="mt-4">
            {obsAberta ? (
              <>
                <label htmlFor={`obs-${item.id}`} className="mb-1.5 block text-xs font-medium text-slate-600">
                  Observação
                </label>
                <textarea
                  id={`obs-${item.id}`}
                  rows={2}
                  maxLength={500}
                  value={item.observacao}
                  onChange={(e) => lista.atualizar(item.id, { observacao: e.target.value })}
                  placeholder="Ex.: cores, papel, se já tem a arte…"
                  className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15"
                />
              </>
            ) : (
              <button type="button" onClick={() => setObsAberta(true)} className="inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-marca-escuro hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
                <MessageSquarePlus className="h-4 w-4" aria-hidden="true" /> Adicionar observação
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  )
}

type CampoContato = 'nome' | 'whatsapp' | 'email' | 'mensagem'

function PedidoEnviado({ resultado }: { resultado: PedidoVitrineEnviado }) {
  const { vitrine, whatsapp } = useVitrine()
  const wa = whatsapp(mensagemPedidoEnviado(resultado.numero))
  const mensagem = resultado.mensagem || vitrine.empresa.mensagemPedidoEnviado || 'Recebemos sua lista. Em breve entraremos em contato pelo WhatsApp com o orçamento.'
  return (
    <Container className="py-14 lg:py-20">
      <div className="vt-surgir mx-auto max-w-xl rounded-[2rem] border border-slate-200 bg-white px-6 py-12 text-center shadow-[0_2rem_4rem_-2rem_rgba(15,23,42,0.25)] sm:px-12">
        <span className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
          <CheckCircle2 className="h-11 w-11 text-emerald-600" aria-hidden="true" />
        </span>
        <h1 className="vt-titulo text-3xl font-extrabold text-slate-900">Pedido enviado!</h1>
        <p className="mt-4 text-sm font-medium uppercase tracking-[0.14em] text-slate-500">Número do pedido</p>
        <p className="vt-titulo mt-1 inline-block rounded-xl bg-slate-100 px-4 py-2 text-xl font-extrabold tracking-wide text-slate-900">{resultado.numero}</p>
        <p className="mx-auto mt-6 max-w-md whitespace-pre-line leading-relaxed text-slate-600">{mensagem}</p>
        <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:justify-center">
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className={cn(botao.base, botao.whatsapp, botao.lg)}>
              <IconeWhatsapp /> Falar no WhatsApp
            </a>
          )}
          <Link to="/" className={cn(botao.base, botao.contorno, botao.lg)}>
            Voltar à loja
          </Link>
        </div>
      </div>
    </Container>
  )
}

function ListaVazia() {
  return (
    <div className="flex flex-col items-center rounded-[2rem] bg-slate-50 px-6 py-20 text-center">
      <span className="mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white text-marca-escuro shadow-sm">
        <ClipboardList className="h-8 w-8" aria-hidden="true" />
      </span>
      <h2 className="vt-titulo text-xl font-extrabold text-slate-900">Sua lista está vazia</h2>
      <p className="mt-2 max-w-md text-slate-600">Abra um produto, escolha quantidade, medidas e acabamentos e toque em “Adicionar à lista de orçamento”.</p>
      <Link to="/produtos" className={cn(botao.base, botao.primario, botao.lg, 'mt-8')}>
        Ver produtos <ArrowRight />
      </Link>
    </div>
  )
}

export function ListaPagina() {
  const { api, lista, vitrine } = useVitrine()
  const [contato, setContato] = useState({ nome: '', whatsapp: '', email: '', mensagem: '', site: '' })
  const [erros, setErros] = useState<Partial<Record<CampoContato, string>>>({})
  const [erroGeral, setErroGeral] = useState<string | null>(null)
  const [tentou, setTentou] = useState(false)
  const [resultado, setResultado] = useState<PedidoVitrineEnviado | null>(null)
  useTituloPagina(resultado ? 'Pedido enviado' : 'Lista de orçamento', descricaoLista(vitrine.empresa))
  // Depois de enviar, o WhatsApp do topo e o flutuante também levam o número do pedido
  useMensagemWhatsappPagina(resultado ? mensagemPedidoEnviado(resultado.numero) : null)

  const envio = useMutation({
    mutationFn: api.enviarPedido,
    onSuccess: (r) => {
      lista.limpar()
      setResultado(r)
      window.scrollTo({ top: 0 })
    },
    onError: (e) => setErroGeral(e.message),
  })

  if (resultado) return <PedidoEnviado resultado={resultado} />

  const itens = lista.itens
  const mudar = (campo: keyof typeof contato, valor: string) => {
    setContato((c) => ({ ...c, [campo]: valor }))
    if (campo in erros) setErros((e) => ({ ...e, [campo]: undefined }))
  }

  const enviar = (ev: FormEvent) => {
    ev.preventDefault()
    setTentou(true)
    setErroGeral(null)
    const dados = { ...contato, itens: itensParaPedido(itens) }
    const r = pedidoVitrineSchema.safeParse(dados)
    const novos: Partial<Record<CampoContato, string>> = {}
    let problemaItens = itens.some((i) => problemaMedidas(i))
    if (!r.success) {
      for (const issue of r.error.issues) {
        const campo = issue.path[0]
        if (campo === 'itens') problemaItens = true
        else if (typeof campo === 'string' && campo !== 'site' && !novos[campo as CampoContato]) novos[campo as CampoContato] = issue.message
      }
    }
    setErros(novos)
    if (problemaItens) setErroGeral('Confira os itens marcados na lista (medidas e quantidades).')
    if (Object.keys(novos).length || problemaItens || !r.success) {
      const primeiro = Object.keys(novos)[0]
      if (primeiro) document.getElementById(`contato-${primeiro}`)?.focus()
      return
    }
    envio.mutate(r.data)
  }

  const quantidadeTexto = `${itens.length} ${itens.length === 1 ? 'item' : 'itens'}`

  return (
    <Container className="pt-8 lg:pt-12">
      <Link to="/produtos" className="mb-5 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-slate-500 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-marca">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Continuar escolhendo
      </Link>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="vt-titulo text-3xl font-extrabold text-slate-900 sm:text-4xl">Lista de orçamento</h1>
          <p className="mt-2 text-slate-500">{itens.length ? `${quantidadeTexto} · revise e envie seus dados para receber o orçamento.` : 'Monte sua lista com os produtos da loja.'}</p>
        </div>
      </div>

      {!itens.length ? (
        <ListaVazia />
      ) : (
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1.45fr)_minmax(0,1fr)] lg:gap-12">
          <ul className="space-y-4" aria-label="Itens da lista">
            {itens.map((i) => (
              <ItemDaLista key={i.id} item={i} destacarErro={tentou} />
            ))}
          </ul>

          <form onSubmit={enviar} noValidate className="relative rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-[0_1.5rem_3rem_-1.5rem_rgba(15,23,42,0.18)] sm:p-7 lg:sticky lg:top-28">
            <h2 className="vt-titulo text-xl font-extrabold text-slate-900">Seus dados</h2>
            <p className="mt-1 text-sm text-slate-500">Para a equipe enviar o orçamento. Leva menos de um minuto.</p>
            <div className="mt-6 space-y-4">
              <CampoTexto id="contato-nome" rotulo="Nome" autoComplete="name" value={contato.nome} onChange={(e) => mudar('nome', e.target.value)} erro={erros.nome} maxLength={120} />
              <CampoTexto
                id="contato-whatsapp"
                rotulo="WhatsApp"
                type="tel"
                inputMode="tel"
                autoComplete="tel-national"
                placeholder="(00) 00000-0000"
                value={contato.whatsapp}
                onChange={(e) => mudar('whatsapp', mascaraTelefone(e.target.value))}
                erro={erros.whatsapp}
                dica="É por aqui que vamos responder."
              />
              <CampoTexto
                id="contato-email"
                rotulo="E-mail"
                opcional
                type="email"
                autoComplete="email"
                value={contato.email}
                onChange={(e) => mudar('email', e.target.value)}
                erro={erros.email}
                maxLength={200}
              />
              <div>
                <Rotulo htmlFor="contato-mensagem">
                  Mensagem <span className="font-normal text-slate-400">(opcional)</span>
                </Rotulo>
                <textarea
                  id="contato-mensagem"
                  rows={3}
                  maxLength={2000}
                  value={contato.mensagem}
                  onChange={(e) => mudar('mensagem', e.target.value)}
                  placeholder="Prazo desejado, entrega, dúvidas…"
                  aria-invalid={erros.mensagem ? true : undefined}
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-[0.9375rem] text-slate-900 placeholder:text-slate-400 focus:border-marca focus:outline-none focus:ring-4 focus:ring-marca/15"
                />
                <MensagemErro id="contato-mensagem-erro">{erros.mensagem}</MensagemErro>
              </div>
              {/* Campo-isca: invisível para pessoas; robôs preenchem e a API descarta */}
              <div aria-hidden="true" className="absolute -left-[625rem] h-px w-px overflow-hidden">
                <label htmlFor="contato-site">Site</label>
                <input id="contato-site" name="site" tabIndex={-1} autoComplete="off" value={contato.site} onChange={(e) => mudar('site', e.target.value)} />
              </div>
            </div>

            <div aria-live="assertive">
              {erroGeral && <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">{erroGeral}</p>}
            </div>

            <button type="submit" disabled={envio.isPending} className={cn(botao.base, botao.primario, botao.lg, 'mt-6 w-full')}>
              {envio.isPending ? <Loader2 className="animate-spin" /> : <Send />}
              {envio.isPending ? (
                'Enviando…'
              ) : (
                <span className="truncate">
                  Enviar pedido<span className="max-[400px]:hidden"> de orçamento</span> ({quantidadeTexto})
                </span>
              )}
            </button>
            <p className="mt-4 text-center text-xs leading-relaxed text-slate-500">Sem compromisso e sem pagamento agora. Seus dados são usados só para responder ao seu pedido.</p>
          </form>
        </div>
      )}
    </Container>
  )
}
