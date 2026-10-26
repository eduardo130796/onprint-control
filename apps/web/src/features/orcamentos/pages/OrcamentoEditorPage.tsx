import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowLeft, CheckCircle2, Globe, MessageSquareReply, MessagesSquare, Plus, RefreshCw, Sparkles, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { descreverRespostaWhatsapp, formatarDataHora, formatarDataSimples, orcamentoSchema, type EstadoDoAssistente, type OrcamentoDeTexto } from '@onprint/shared'
import { clientesApi } from '@/api/cadastros'
import { orcamentosApi, solicitacoesApi, type OrcamentoComAnalise } from '@/api/comercial'
import { PageHeader } from '@/components/layout/PageHeader'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { SearchSelect } from '@/components/shared/SearchSelect'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Textarea } from '@/components/ui/form-controls'
import { Skeleton } from '@/components/ui/skeleton'
import { SeloSugerido } from '@/features/assistente/SeloSugerido'
import { useAssistente } from '@/features/assistente/useAssistente'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { useMutacao } from '@/hooks/useMutacao'
import { usePermission } from '@/hooks/usePermission'
import { CONTATO_WHATSAPP, buscarClientesEContatos, numeroDoContato } from '../buscas'
import { AcoesOrcamento } from '../components/editor/AcoesOrcamento'
import { ItemOrcamento } from '../components/editor/ItemOrcamento'
import { MontarComAssistente, type Indisponivel } from '../components/editor/MontarComAssistente'
import { PagamentoOrcamento } from '../components/editor/PagamentoOrcamento'
import { PedidoGerado } from '../components/editor/PedidoGerado'
import { TotaisOrcamento } from '../components/editor/TotaisOrcamento'
import { ClienteDoAssistente } from '../components/editor/ClienteDoAssistente'
import { cadastrarClienteNovo, clienteNovoCompleto, type ClientePendente } from '../components/editor/clienteNovo'
import { formDoOrcamento, itemComProduto, itemVazio, itensDaSolicitacao, itensDoAssistente, juntarItens, notaDoAssistente, novaChave, payloadDoForm, type FormOrcamento, type ItemForm } from '../components/editor/formOrcamento'
import { AvisosDasRegras, DetalhesDasRegras, SugestoesDasRegras } from '../components/editor/RegrasDoOrcamento'
import { useAnaliseOrcamento } from '../components/editor/useAnaliseOrcamento'
import { chaveProdutoCatalogo, useCalculoOrcamento } from '../components/editor/useCalculoOrcamento'

const ABERTOS = ['rascunho', 'enviado', 'em_negociacao']

interface DoSite {
  numero: string
  itens: ItemForm[]
  ignorados: number
}

function Editor({
  orcamento,
  solicitacaoId,
  clienteInicial,
  doSite,
  doAssistente,
  onAlterado,
}: {
  orcamento?: OrcamentoComAnalise
  /** Avisa a página se há alterações não salvas (mudança remota não reseta o formulário) */
  onAlterado?: (alterado: boolean) => void
  solicitacaoId?: string | null
  clienteInicial?: { id: string; rotulo: string } | null
  /** Pedido do site: itens já montados com o que o cliente escolheu */
  doSite?: DoSite | null
  /** "Peça ao Assistente": o pedido já lido (itens, cliente achado ou novo, prazo e observações) */
  doAssistente?: { texto: string; leitura: OrcamentoDeTexto } | null
}) {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const empresa = useEmpresa()
  const podeSalvar = usePermission('orcamentos', orcamento ? 'editar' : 'criar')
  // Orçamento novo: pagamento e observações de pagamento pelos padrões da empresa (a página espera carregar)
  const [inicial] = useState(() => formDoOrcamento(orcamento, clienteInicial, doSite?.itens, doSite ? `Pedido do site ${doSite.numero}.` : undefined, empresa.data))
  // Montado pelo Assistente: já abre preenchido (e conta como alteração: sair avisa)
  const lido = doAssistente?.leitura
  const [form, setForm] = useState<FormOrcamento>(() =>
    lido
      ? {
          ...inicial,
          doAssistente: true,
          cliente: inicial.cliente ?? lido.cliente.encontrado,
          itens: lido.itens.length ? itensDoAssistente(lido.itens) : inicial.itens,
          // "pra sexta", "dia 15": a data, quando dá para calcular com segurança (senão o texto fica na nota abaixo)
          dataDesejada: lido.dataDesejada ?? inicial.dataDesejada,
          observacoesInternas: [inicial.observacoesInternas.trim(), notaDoAssistente(lido)].filter(Boolean).join('\n'),
        }
      : inicial,
  )
  // Cliente que não está no cadastro: novo (cadastrado ao salvar) ou parecidos para escolher
  const [pendente, setPendente] = useState<ClientePendente | null>(() =>
    lido && !lido.cliente.encontrado && (lido.cliente.novo || lido.cliente.candidatos?.length) ? { novo: lido.cliente.novo ?? null, candidatos: lido.cliente.candidatos ?? [] } : null,
  )
  // Memória do cliente achado (cérebro da gráfica): fica à vista enquanto ele for o cliente do orçamento
  const [memoria, setMemoria] = useState<{ clienteId: string; linhas: string[] } | null>(() =>
    lido?.cliente.encontrado && lido.cliente.memoria?.length ? { clienteId: lido.cliente.encontrado.id, linhas: lido.cliente.memoria } : null,
  )
  const alterado = useMemo(() => JSON.stringify(form) !== JSON.stringify(inicial), [form, inicial])
  const editavel = podeSalvar && (!orcamento || ABERTOS.includes(orcamento.status))
  const calculo = useCalculoOrcamento(form, empresa.data?.areaMinimaM2, { origem: orcamento?.origem })
  const podeAprovar = usePermission('orcamentos', 'aprovar')
  // Regras comerciais: o gerente libera o que as regras pediram (o orçamento volta com a liberação gravada)
  const liberar = useMutacao(['orcamentos'], (id: string) => orcamentosApi.liberar(id))
  // Semáforo do lucro: o salvo (GET) ou ao vivo (POST /orcamentos/analisar) para quem pode editar
  const analise = useAnaliseOrcamento(form, calculo.itens, { orcamento, alterado, podeAnalisar: editavel })
  const salvar = useMutacao(['orcamentos', 'solicitacoes'], (dados: unknown) => (orcamento ? orcamentosApi.atualizar(orcamento.id, dados) : orcamentosApi.criar(dados)))
  // Assistente GrafyGo: monta itens a partir do texto do cliente (o cliente achado fica com o selo até ser trocado)
  // Sempre à vista; sem o Assistente, o clique explica como ativar (admin) ou pede a quem é admin
  const assistente = useAssistente()
  const podeConfigurar = usePermission('configuracoes', 'editar')
  const indisponivel: Indisponivel = assistente.data?.liberado.orcamentoTexto ? null : !podeConfigurar ? 'pedir_admin' : assistente.data && !assistente.data.disponivel ? 'central' : 'empresa'
  const [clienteSugerido, setClienteSugerido] = useState(Boolean(doAssistente?.leitura.cliente.encontrado))
  const [detalhes, setDetalhes] = useState(false)
  /** Desconto sugerido pelas regras: o vendedor aplica (fica gravado no orçamento) ou desfaz */
  const aceitar = (regraId: string, sim: boolean) =>
    setForm((f) => ({ ...f, regrasAceitas: sim ? [...new Set([...f.regrasAceitas, regraId])] : f.regrasAceitas.filter((id) => id !== regraId) }))

  // Salvando: a versão que chegar é a minha (não é "alterado por outra pessoa")
  const naoSalvo = alterado && !salvar.isPending
  useEffect(() => {
    onAlterado?.(naoSalvo)
  }, [naoSalvo, onAlterado])

  // Avisa antes de sair com alterações não salvas
  useEffect(() => {
    if (!alterado) return
    const aviso = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', aviso)
    return () => window.removeEventListener('beforeunload', aviso)
  }, [alterado])

  const atualizar = (dados: Partial<FormOrcamento>) => setForm((f) => ({ ...f, ...dados }))
  const mudarItens = (fn: (itens: FormOrcamento['itens']) => FormOrcamento['itens']) => setForm((f) => ({ ...f, itens: fn(f.itens) }))

  /** Sugestão das regras com produto ("oferecer criação de arte"): só entra quando a pessoa clica em Adicionar */
  async function adicionarProduto(produtoId: string) {
    try {
      const p = await queryClient.fetchQuery({ queryKey: chaveProdutoCatalogo(produtoId), queryFn: () => orcamentosApi.produto(produtoId), staleTime: 5 * 60 * 1000 })
      mudarItens((itens) => juntarItens(itens, [itemComProduto(itemVazio(), p, { id: p.id, rotulo: p.nome, detalhe: p.codigo })]))
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // mutateAsync: o orçamento volta liberado e o editor remonta (chave nova); o aviso não pode depender dele montado
  async function onLiberar() {
    if (!orcamento) return
    try {
      const r = await liberar.mutateAsync(orcamento.id)
      queryClient.setQueryData(['orcamentos', 'detalhe', r.id], r)
      toast.success('Orçamento liberado: já pode ser enviado.')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  async function onSalvar() {
    // Cliente novo lido pelo Assistente: o orçamento é conferido antes (sem cliente solto se algo falhar) e o cliente
    // é cadastrado na hora de salvar, junto com o orçamento
    const novoCliente = !form.cliente && pendente?.novo ? pendente.novo : null
    if (novoCliente && !clienteNovoCompleto(novoCliente)) return toast.error('Cliente novo: informe o nome e um contato (WhatsApp, telefone ou e-mail), ou escolha um cliente.')
    const conferir = novoCliente ? { ...form, cliente: { id: '00000000-0000-4000-8000-000000000000', rotulo: '' } } : form
    const validacao = orcamentoSchema.safeParse(payloadDoForm(conferir, orcamento ? undefined : solicitacaoId))
    if (!validacao.success) return toast.error(validacao.error.issues[0]?.message ?? 'Verifique os dados.')
    if (calculo.temErros) return toast.error('Corrija os itens destacados antes de salvar.')
    try {
      let dados = form
      if (novoCliente) {
        const cliente = await cadastrarClienteNovo(novoCliente)
        dados = { ...form, cliente }
        setForm(dados)
        setPendente(null)
        void queryClient.invalidateQueries({ queryKey: ['clientes'] })
      }
      const payload = payloadDoForm(dados, orcamento ? undefined : solicitacaoId)
      const salvo = await salvar.mutateAsync(payload)
      queryClient.setQueryData(['orcamentos', 'detalhe', salvo.id], salvo)
      toast.success(orcamento ? 'Orçamento salvo.' : `Orçamento ${salvo.numero} criado.`)
      navigate(`/orcamentos/${salvo.id}`, { replace: true, state: { recarregar: Date.now() } })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <>
      <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold text-tinta">{orcamento ? orcamento.numero : 'Novo orçamento'}</h1>
            {orcamento && <StatusBadge entidade="orcamento" codigo={orcamento.status} />}
            {alterado && <span className="rounded-full bg-ambar/15 px-2 py-0.5 text-xs text-amber-800">não salvo</span>}
          </div>
          {orcamento && (
            <p className="mt-1 text-sm text-texto-secundario">
              {orcamento.vendedor?.nome ?? 'Sem vendedor'} · criado em {formatarDataHora(orcamento.createdAt)}
              {orcamento.solicitacao && ` · solicitação ${orcamento.solicitacao.numero}`}
            </p>
          )}
        </div>
        <AcoesOrcamento orcamento={orcamento} editavel={editavel} alterado={alterado} salvando={salvar.isPending} onSalvar={() => void onSalvar()} />
      </div>

      {orcamento?.whatsapp && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-marca-suave p-3 text-sm text-marca-escuro">
          <MessagesSquare className="mt-0.5 h-4 w-4 shrink-0" />
          <span className="[overflow-wrap:anywhere]">
            {orcamento.whatsapp.origem === 'reacao' ? `Criado pelo WhatsApp (📝 na conversa com ${orcamento.whatsapp.contato ?? 'o cliente'}).` : 'Criado pelo WhatsApp (pedido na sua conversa “Você”).'}
            {orcamento.status === 'rascunho' && ' Ajuste e envie; ou responda *ok* no WhatsApp.'}
            {orcamento.status === 'rascunho' && orcamento.whatsapp.conferir.length > 0 && ` Confira: ${orcamento.whatsapp.conferir.join('; ')}.`}
          </span>
        </p>
      )}
      {doSite && doSite.itens.length > 0 && (
        <p className="mb-4 flex items-start gap-2 rounded-xl bg-marca-suave p-3 text-sm text-marca-escuro">
          <Globe className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            Itens preenchidos com o pedido do site <strong>{doSite.numero}</strong>: produto, quantidade, medidas e acabamentos que o cliente escolheu.
            Confira os preços e salve.
            {doSite.ignorados > 0 && ` ${doSite.ignorados} item(ns) ficaram de fora porque o produto não existe mais; veja na solicitação.`}
          </span>
        </p>
      )}
      {orcamento?.status === 'aprovado' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-verde/10 p-3 text-sm text-green-800">
          <CheckCircle2 className="h-4 w-4" /> Aprovado por {orcamento.aprovadoPorNome} em {formatarDataHora(orcamento.aprovadoEm)}
          {orcamento.aprovadoIp && ` (link público, IP ${orcamento.aprovadoIp})`}.
        </p>
      )}
      {orcamento?.respostaWhatsapp && (
        <p
          className={
            orcamento.respostaWhatsapp.tipo === 'aprovado'
              ? 'mb-4 flex items-start gap-2 rounded-xl bg-verde/10 p-3 text-sm text-green-800'
              : orcamento.respostaWhatsapp.tipo === 'modificacoes'
                ? 'mb-4 flex items-start gap-2 rounded-xl bg-ambar/10 p-3 text-sm text-amber-800'
                : 'mb-4 flex items-start gap-2 rounded-xl bg-marca-suave p-3 text-sm text-marca-escuro'
          }
        >
          {orcamento.respostaWhatsapp.assistente ? <Sparkles className="mt-0.5 h-4 w-4 shrink-0" aria-label="Assistente GrafyGo" /> : <MessageSquareReply className="mt-0.5 h-4 w-4 shrink-0" />}
          <span className="[overflow-wrap:anywhere]">
            WhatsApp do cliente · {descreverRespostaWhatsapp(orcamento.respostaWhatsapp)} · {formatarDataHora(orcamento.respostaWhatsapp.em)}
          </span>
        </p>
      )}
      {orcamento?.status === 'recusado' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-coral/10 p-3 text-sm text-coral-escuro">
          <XCircle className="h-4 w-4" /> Recusado em {formatarDataHora(orcamento.recusadoEm)}: {orcamento.motivoRecusa}
        </p>
      )}
      {orcamento?.status === 'expirado' && (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-ambar/10 p-3 text-sm text-amber-800">
          <AlertTriangle className="h-4 w-4" /> Expirou em {formatarDataSimples(orcamento.validade)}. Use “Reabrir negociação” para renovar a validade.
        </p>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_22.5rem]">
        <div className="min-w-0 space-y-4">
          <Card>
            <CardContent className="pt-6">
              <CampoFormulario id="orc-cliente" rotulo="Cliente *" acao={clienteSugerido ? <SeloSugerido /> : undefined}>
                <SearchSelect
                  id="orc-cliente"
                  chave="clientes-e-contatos-busca"
                  buscar={buscarClientesEContatos}
                  valor={form.cliente}
                  onChange={(c) => {
                    setClienteSugerido(false)
                    // Contato do WhatsApp que ainda não é cliente: vira o pré-cadastro (nome e número já preenchidos)
                    if (c?.id.startsWith(CONTATO_WHATSAPP)) {
                      setPendente({ novo: { nome: c.rotulo, tipoPessoa: 'PF', documento: null, whatsapp: numeroDoContato(c.id), telefone: null, email: null }, candidatos: [] })
                      atualizar({ cliente: null })
                      return
                    }
                    atualizar({ cliente: c })
                  }}
                  placeholder="Buscar cliente…"
                  desabilitado={!editavel}
                />
              </CampoFormulario>
              {/* Cliente que o Assistente leu e não está no cadastro: cadastrado junto ao salvar (ou escolher um parecido) */}
              {editavel && !form.cliente && pendente && (
                <ClienteDoAssistente
                  pendente={pendente}
                  onMudar={setPendente}
                  onEscolher={(c) => {
                    setPendente(null)
                    atualizar({ cliente: c })
                  }}
                />
              )}
              {memoria && form.cliente?.id === memoria.clienteId && (
                <ul className="mt-2 space-y-0.5 rounded-xl bg-fundo px-3 py-2 text-xs text-texto-secundario" aria-label="O que o Assistente lembra deste cliente">
                  {memoria.linhas.map((l) => (
                    <li key={l}>{l}</li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {editavel && (
            <MontarComAssistente
              indisponivel={indisponivel}
              onAdicionar={(r) => {
                if (r.cliente && !form.cliente) setClienteSugerido(true)
                if (!r.cliente && !form.cliente && r.pendente) setPendente(r.pendente)
                if (r.cliente && !form.cliente && r.memoria.length) setMemoria({ clienteId: r.cliente.id, linhas: r.memoria })
                setForm((f) => ({
                  ...f,
                  // Orçamento novo montado pelo Assistente: a origem vira "assistente" (regras por origem)
                  doAssistente: orcamento ? f.doAssistente : true,
                  itens: juntarItens(f.itens, r.itens),
                  // O prazo do pedido como data, se a pessoa ainda não escolheu outra
                  dataDesejada: f.dataDesejada || r.dataDesejada || '',
                  cliente: f.cliente ?? r.cliente,
                  observacoesInternas: r.nota ? [f.observacoesInternas.trim(), r.nota].filter(Boolean).join('\n') : f.observacoesInternas,
                }))
              }}
            />
          )}

          {form.itens.map((item, i) => (
            <ItemOrcamento
              key={item.chave}
              indice={i}
              total={form.itens.length}
              item={item}
              calculo={calculo.itens[i]!}
              analise={analise.itens.get(item.chave)}
              analiseDesatualizada={analise.desatualizado}
              editavel={editavel}
              // Mexeu no item: deixa de ser "sugerido pelo Assistente"
              onChange={(novo) => mudarItens((itens) => itens.map((x, j) => (j === i ? { ...novo, sugerido: false, conferir: null } : x)))}
              onRemover={() => mudarItens((itens) => itens.filter((_, j) => j !== i))}
              onDuplicar={() => mudarItens((itens) => [...itens.slice(0, i + 1), { ...item, chave: novaChave() }, ...itens.slice(i + 1)])}
              onMover={(d) =>
                mudarItens((itens) => {
                  const destino = i + d
                  if (destino < 0 || destino >= itens.length) return itens
                  const novo = [...itens]
                  ;[novo[i], novo[destino]] = [novo[destino]!, novo[i]!]
                  return novo
                })
              }
            />
          ))}
          {editavel && (
            <Button variant="outline" className="w-full border-dashed" onClick={() => mudarItens((itens) => [...itens, itemVazio()])}>
              <Plus /> Adicionar item
            </Button>
          )}

          <PagamentoOrcamento form={form} onChange={atualizar} total={calculo.total} editavel={editavel} />

          <Card>
            <CardContent className="grid gap-4 pt-6 md:grid-cols-2">
              <CampoFormulario id="orc-obs" rotulo="Observações (aparecem para o cliente)">
                <Textarea id="orc-obs" rows={3} disabled={!editavel} value={form.observacoes} onChange={(e) => atualizar({ observacoes: e.target.value })} />
              </CampoFormulario>
              <CampoFormulario id="orc-obsint" rotulo="Observações internas (só a equipe vê)">
                <Textarea id="orc-obsint" rows={3} disabled={!editavel} value={form.observacoesInternas} onChange={(e) => atualizar({ observacoesInternas: e.target.value })} />
              </CampoFormulario>
            </CardContent>
          </Card>
        </div>

        <div className="min-w-0 space-y-4 xl:sticky xl:top-24 xl:self-start">
          <AvisosDasRegras
            regras={calculo.regras}
            orcamento={orcamento}
            alterado={alterado}
            editavel={editavel}
            podeAprovar={podeAprovar}
            liberando={liberar.isPending}
            onLiberar={() => void onLiberar()}
          />
          <SugestoesDasRegras
            regras={calculo.regras}
            editavel={editavel}
            onAplicar={(id) => aceitar(id, true)}
            onDesfazer={(id) => aceitar(id, false)}
            onAdicionarProduto={(id) => void adicionarProduto(id)}
          />
          <TotaisOrcamento
            form={form}
            onChange={atualizar}
            subtotal={calculo.subtotalSemRegras}
            descontosRegras={calculo.descontosRegras}
            acrescimosRegras={calculo.acrescimosRegras}
            onVerDetalhes={() => setDetalhes(true)}
            total={calculo.total}
            prazoDias={calculo.prazoDias}
            previsaoEntrega={calculo.previsaoEntrega}
            editavel={editavel}
            analise={analise.total}
            analiseDesatualizada={analise.desatualizado}
          />
          {orcamento?.pedido && <PedidoGerado pedido={orcamento.pedido} />}
        </div>
      </div>
      <DetalhesDasRegras regras={calculo.regras} aberta={detalhes} onAbertaChange={setDetalhes} />
    </>
  )
}

/** Faixa do editor quando o orçamento mudou fora desta tela enquanto havia alterações não salvas */
function MudouForaDaTela({ orcamento: o, onRecarregar }: { orcamento: OrcamentoComAnalise; onRecarregar: () => void }) {
  const virouPedido = o.status === 'convertido' && o.pedido
  const texto = virouPedido
    ? `Este orçamento foi aprovado${o.aprovadoIp ? ' pelo cliente' : ''} e virou o pedido ${o.pedido!.numero}. Suas alterações não salvas não valem mais.`
    : o.status === 'aprovado'
      ? `Este orçamento foi aprovado${o.aprovadoIp ? ' pelo cliente' : ''}. Suas alterações não salvas não valem mais.`
      : o.status === 'recusado'
        ? 'Este orçamento foi recusado pelo cliente. Suas alterações não salvas não valem mais.'
        : 'Este orçamento foi alterado por outra pessoa. Recarregue para ver a versão nova (suas alterações não salvas serão descartadas).'
  return (
    <div role="status" className="mb-4 flex flex-col gap-2 rounded-xl bg-ambar/15 p-3 text-sm text-amber-900 sm:flex-row sm:items-center sm:justify-between dark:text-amber-200">
      <span className="flex items-start gap-2">
        <RefreshCw className="mt-0.5 h-4 w-4 shrink-0" /> {texto}
      </span>
      <span className="flex shrink-0 gap-2">
        {virouPedido && (
          <Button asChild size="sm">
            <Link to={`/pedidos/${o.pedido!.id}`}>Abrir pedido</Link>
          </Button>
        )}
        <Button size="sm" variant="outline" onClick={onRecarregar}>
          Recarregar
        </Button>
      </span>
    </div>
  )
}

/** /orcamentos/novo (opcional ?solicitacao=&cliente=) e /orcamentos/:id */
export function OrcamentoEditorPage() {
  const { id } = useParams()
  const [busca] = useSearchParams()
  const novo = !id || id === 'novo'
  // Vindo do "Peça ao Assistente": o pedido já lido abre o editor preenchido
  const local = useLocation()
  const estadoNavegacao = local.state as EstadoDoAssistente | null
  const doAssistente = estadoNavegacao?.orcamentoAssistente ?? null
  const consulta = useQuery({ queryKey: ['orcamentos', 'detalhe', id], queryFn: () => orcamentosApi.obter(id!), enabled: !novo })
  // Versão no formulário: com alterações não salvas, uma mudança de fora (cliente aprovou, colega editou)
  // não reseta o formulário — fica a faixa avisando, e "Recarregar" troca para a versão nova
  const [alterado, setAlterado] = useState(false)
  const [exibido, setExibido] = useState<OrcamentoComAnalise | undefined>(consulta.data)
  if (consulta.data && consulta.data !== exibido && (!exibido || exibido.id !== consulta.data.id || !alterado)) setExibido(consulta.data)
  const remoto = exibido && consulta.data && consulta.data.id === exibido.id && consulta.data.updatedAt !== exibido.updatedAt ? consulta.data : null
  const clienteId = busca.get('cliente')
  const cliente = useQuery({ queryKey: ['clientes', 'detalhe', clienteId], queryFn: () => clientesApi.obter(clienteId!), enabled: novo && Boolean(clienteId) })
  // Vindo de uma solicitação com itens (pedido do site): busca os produtos para abrir o orçamento já montado
  const solicitacaoId = busca.get('solicitacao')
  const solicitacao = useQuery({ queryKey: ['solicitacoes', 'detalhe', solicitacaoId], queryFn: () => solicitacoesApi.obter(solicitacaoId!), enabled: novo && Boolean(solicitacaoId) })
  const idsProdutos = [...new Set((solicitacao.data?.itens ?? []).map((i) => i.produtoId).filter((id): id is string => Boolean(id)))]
  const produtosSite = useQuery({
    queryKey: ['orcamentos', 'catalogo', 'site', idsProdutos],
    // Produto inativo ou removido: segue sem ele (fica nos "ignorados")
    queryFn: async () => (await Promise.all(idsProdutos.map((id) => orcamentosApi.produto(id).catch(() => null)))).filter((p) => p !== null),
    enabled: idsProdutos.length > 0,
  })
  const doSite: DoSite | null =
    solicitacao.data && solicitacao.data.itens.length > 0 && produtosSite.data
      ? { numero: solicitacao.data.numero, ...itensDaSolicitacao(solicitacao.data.itens, produtosSite.data) }
      : null
  const carregandoSite = Boolean(solicitacaoId) && (solicitacao.isPending || (idsProdutos.length > 0 && produtosSite.isPending))
  // Orçamento novo começa com o pagamento padrão da empresa
  const empresa = useEmpresa()

  const voltar = (
    <Button asChild variant="outline" size="sm" className="mb-4">
      <Link to="/orcamentos">
        <ArrowLeft /> Orçamentos
      </Link>
    </Button>
  )

  if (novo) {
    if ((clienteId && cliente.isPending) || carregandoSite || empresa.isPending) return <Skeleton className="h-96 w-full" />
    return (
      <>
        {voltar}
        <Editor key={doAssistente ? local.key : 'novo'} solicitacaoId={solicitacaoId} clienteInicial={cliente.data ? { id: cliente.data.id, rotulo: cliente.data.nome } : null} doSite={doSite} doAssistente={doAssistente} />
      </>
    )
  }
  if (consulta.isPending) return <Skeleton className="h-96 w-full" />
  if (consulta.isError) {
    return (
      <>
        <PageHeader titulo="Orçamento" acoes={voltar} />
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      </>
    )
  }
  if (!exibido) return <Skeleton className="h-96 w-full" />
  return (
    <>
      {voltar}
      {remoto && (
        <MudouForaDaTela
          orcamento={remoto}
          onRecarregar={() => {
            setAlterado(false)
            setExibido(remoto)
          }}
        />
      )}
      <Editor key={`${exibido.id}-${exibido.updatedAt}`} orcamento={exibido} onAlterado={setAlterado} />
    </>
  )
}
