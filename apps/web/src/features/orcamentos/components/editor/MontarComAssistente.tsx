import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CheckCircle2, Loader2, Sparkles, UserRound, X } from 'lucide-react'
import { toast } from 'sonner'
import { Decimal, MODO_CALCULO_SUFIXO, formatarMoeda, type ItemOrcamentoSugerido, type OrcamentoDeTexto } from '@onprint/shared'
import { assistenteApi } from '@/api/assistente'
import { orcamentosApi } from '@/api/comercial'
import { AcaoIcone } from '@/components/shared/AcaoIcone'
import { SearchSelect, type OpcaoBusca } from '@/components/shared/SearchSelect'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Checkbox, Textarea } from '@/components/ui/form-controls'
import { useAtualizarUsoAssistente } from '@/features/assistente/useAssistente'
import { decimalParaCampo } from '@/lib/mascaras'
import { cn } from '@/lib/utils'
import { buscarProdutos } from '../../buscas'
import { itemComProduto, itemDoAssistente, itemVazio, notaDoAssistente, type ItemForm } from './formOrcamento'
import { chaveProdutoCatalogo } from './useCalculoOrcamento'

export interface MontadoPeloAssistente {
  itens: ItemForm[]
  /** Cliente do cadastro achado pelo telefone ou nome do pedido */
  cliente: OpcaoBusca | null
  /** Prazo, observações e o que não virou item (vai para as observações internas) */
  nota: string | null
}

/**
 * Por que o Assistente não está disponível: a GrafyGo ainda não liberou (central), a empresa desligou (quem é admin
 * ativa em Configurações → Assistente) ou a pessoa não é admin (pede a quem é); null = disponível
 */
export type Indisponivel = 'central' | 'empresa' | 'pedir_admin' | null

interface Linha {
  sugerido: ItemOrcamentoSugerido
  incluir: boolean
  /** Produto escolhido pela pessoa quando o Assistente não achou um */
  escolhido: OpcaoBusca | null
}

/** "2 × 3 × 1 m · Ilhós · Frente e verso" */
function resumoDoItem(s: ItemOrcamentoSugerido) {
  const qtd = decimalParaCampo(s.quantidade, 3)
  const unidade = s.produto?.modoCalculo === 'milheiro' ? ' un.' : s.produto?.modoCalculo === 'hora' ? ' h' : ''
  const medidas = s.largura ? ` × ${decimalParaCampo(s.largura, 3)}${s.altura ? ` × ${decimalParaCampo(s.altura, 3)}` : ''} m` : ''
  return [`${qtd}${unidade}${medidas}`, ...s.acabamentos.map((a) => a.nome), s.observacao].filter(Boolean).join(' · ')
}

/**
 * "Montar com o Assistente" no editor do orçamento: a pessoa cola o pedido do cliente, o Assistente GrafyGo monta os
 * itens com os produtos do catálogo e o sistema calcula os preços (a IA nunca dá preço). A prévia mostra o que
 * conferir; "Adicionar ao orçamento" junta os escolhidos aos itens que já estão (nada é salvo até "Salvar").
 */
export function MontarComAssistente({ onAdicionar, indisponivel }: { onAdicionar: (r: MontadoPeloAssistente) => void; indisponivel: Indisponivel }) {
  const queryClient = useQueryClient()
  const atualizarUso = useAtualizarUsoAssistente()
  const [aberto, setAberto] = useState(false)
  // Sem o Assistente: o botão fica, e o clique explica como ativar
  const [aviso, setAviso] = useState(false)
  const [texto, setTexto] = useState('')
  const [lendo, setLendo] = useState(false)
  const [adicionando, setAdicionando] = useState(false)
  const [resultado, setResultado] = useState<OrcamentoDeTexto | null>(null)
  const [linhas, setLinhas] = useState<Linha[]>([])

  async function montar() {
    if (texto.trim().length < 5) return toast.error('Cole ou escreva o pedido do cliente.')
    setLendo(true)
    try {
      const r = await assistenteApi.orcamentoDeTexto(texto.trim())
      setResultado(r)
      setLinhas(r.itens.map((s) => ({ sugerido: s, incluir: Boolean(s.produto), escolhido: null })))
      if (!r.itens.length) toast.info('O Assistente não achou itens no pedido. Confira o texto ou monte à mão.')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLendo(false)
      atualizarUso()
    }
  }

  function fechar() {
    setAberto(false)
    setResultado(null)
    setLinhas([])
    setTexto('')
  }

  const mudar = (i: number, dados: Partial<Linha>) => setLinhas((ls) => ls.map((l, j) => (j === i ? { ...l, ...dados } : l)))
  const escolhidas = linhas.filter((l) => l.incluir && (l.sugerido.produto || l.escolhido))
  const total = escolhidas.reduce((s, l) => (l.sugerido.produto && l.sugerido.preco?.ok ? s.plus(l.sugerido.preco.total) : s), new Decimal(0))
  const semPreco = escolhidas.some((l) => !l.sugerido.produto || !l.sugerido.preco?.ok)

  async function adicionar() {
    if (!resultado) return
    setAdicionando(true)
    try {
      const itens: ItemForm[] = []
      for (const l of escolhidas) {
        const direto = itemDoAssistente(l.sugerido)
        if (direto) itens.push(direto)
        else if (l.escolhido) {
          // Produto escolhido aqui: os padrões dele (medidas, acabamentos), com a quantidade do pedido
          const opcao = l.escolhido
          const p = await queryClient.fetchQuery({ queryKey: chaveProdutoCatalogo(opcao.id), queryFn: () => orcamentosApi.produto(opcao.id), staleTime: 5 * 60 * 1000 })
          const base = itemComProduto(itemVazio(), p, opcao)
          itens.push({ ...base, quantidade: p.modoCalculo === 'milheiro' && Number(l.sugerido.quantidade) < 1 ? base.quantidade : decimalParaCampo(l.sugerido.quantidade, 3), observacao: l.sugerido.observacao ?? '', sugerido: true })
        }
      }
      const c = resultado.cliente.encontrado
      onAdicionar({ itens, cliente: c ? { id: c.id, rotulo: c.rotulo } : null, nota: notaDoAssistente(resultado) })
      toast.success(`${itens.length} item(ns) no orçamento. Confira e salve.`)
      fechar()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAdicionando(false)
    }
  }

  if (!aberto) {
    return (
      <div className="space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Button type="button" variant="outline" className="border-marca/40 text-marca-escuro" onClick={() => (indisponivel ? setAviso((v) => !v) : setAberto(true))}>
            <Sparkles /> Montar com o Assistente
          </Button>
          <span className="text-xs text-texto-secundario">Cole o pedido do cliente e ele monta os itens. Os preços são os do sistema.</span>
        </div>
        {aviso && indisponivel && (
          <p role="status" className="text-sm text-texto-secundario">
            {indisponivel === 'central' ? (
              'O Assistente GrafyGo ainda não foi liberado pela GrafyGo para a sua empresa.'
            ) : indisponivel === 'empresa' ? (
              <>
                O Assistente está desligado.{' '}
                <Link to="/configuracoes/assistente" className="font-medium text-marca-escuro hover:underline">
                  Ativar em Configurações → Assistente GrafyGo
                </Link>
              </>
            ) : (
              'O Assistente não está ativo. Peça ao administrador para ativar.'
            )}
          </p>
        )}
      </div>
    )
  }

  return (
    <Card className="space-y-4 border border-marca/40 p-4">
      <div className="flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca text-marca-contraste">
          <Sparkles className="h-4 w-4" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-tinta">Montar com o Assistente</p>
          <p className="text-sm text-texto-secundario">Cole o pedido como o cliente mandou. Nada muda no orçamento até você adicionar.</p>
        </div>
        <AcaoIcone icone={X} rotulo="Fechar o Assistente" onClick={fechar} />
      </div>

      {!resultado && (
        <>
          <Textarea
            aria-label="Pedido do cliente"
            rows={4}
            maxLength={3000}
            value={texto}
            autoFocus
            placeholder="Ex.: 2 banners 3x1 com ilhós e 500 cartões frente e verso, entrega sexta"
            onChange={(e) => setTexto(e.target.value)}
          />
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="outline" onClick={fechar}>
              Cancelar
            </Button>
            <Button type="button" onClick={() => void montar()} disabled={lendo || texto.trim().length < 5}>
              {lendo ? <Loader2 className="animate-spin" /> : <Sparkles />} {lendo ? 'Lendo o pedido…' : 'Montar itens'}
            </Button>
          </div>
        </>
      )}

      {resultado && (
        <>
          <ul className="space-y-2" aria-label="Itens sugeridos pelo Assistente">
            {linhas.map((l, i) => {
              const s = l.sugerido
              const temProduto = Boolean(s.produto || l.escolhido)
              return (
                <li key={i} className={cn('flex gap-3 rounded-xl border p-3', l.incluir && temProduto ? 'border-border bg-card' : 'border-dashed border-border bg-fundo/50')}>
                  <Checkbox
                    className="mt-1"
                    checked={l.incluir && temProduto}
                    disabled={!temProduto}
                    aria-label={`Incluir ${s.produto?.nome ?? s.descricao}`}
                    onChange={(e) => mudar(i, { incluir: e.target.checked })}
                  />
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium text-tinta [overflow-wrap:anywhere]">{s.produto?.nome ?? l.escolhido?.rotulo ?? 'Produto não identificado'}</p>
                      {s.conferir || !s.produto ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-ambar/15 px-2 py-0.5 text-[0.6875rem] font-semibold text-amber-800">
                          <AlertTriangle className="h-3 w-3" /> conferir
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-verde/10 px-2 py-0.5 text-[0.6875rem] font-semibold text-green-800">
                          <CheckCircle2 className="h-3 w-3" /> {Math.round(s.confianca * 100)}% de certeza
                        </span>
                      )}
                    </div>
                    {!s.produto && (
                      <div className="max-w-md">
                        <SearchSelect
                          chave="catalogo-busca"
                          buscar={buscarProdutos}
                          valor={l.escolhido}
                          onChange={(o) => mudar(i, { escolhido: o, incluir: Boolean(o) })}
                          placeholder="Escolher o produto…"
                        />
                      </div>
                    )}
                    <p className="text-sm text-texto-secundario [overflow-wrap:anywhere]">{resumoDoItem(s)}</p>
                    <p className="text-xs text-texto-secundario [overflow-wrap:anywhere]">
                      Pedido: “{s.descricao}” · {s.motivo}
                    </p>
                    {[...s.avisos, ...(s.preco && !s.preco.ok ? s.preco.erros : [])].map((a) => (
                      <p key={a} className="text-xs font-medium text-amber-800">
                        {a}
                      </p>
                    ))}
                  </div>
                  <div className="shrink-0 text-right">
                    {s.produto && s.preco?.ok ? (
                      <>
                        <p className="font-semibold tabular-nums text-tinta">{formatarMoeda(s.preco.total)}</p>
                        <p className="text-[0.6875rem] text-texto-secundario">
                          {formatarMoeda(s.preco.precoUnitario)} / {MODO_CALCULO_SUFIXO[s.produto.modoCalculo]}
                        </p>
                      </>
                    ) : (
                      <p className="text-xs text-texto-secundario">{temProduto ? 'calculado no orçamento' : '—'}</p>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {(resultado.cliente.mencionado || resultado.cliente.encontrado || resultado.prazoDesejado || resultado.observacoes || resultado.naoIdentificados.length > 0 || resultado.sugestoes.length > 0) && (
            <div className="space-y-1 rounded-xl bg-fundo p-3 text-sm">
              {(resultado.cliente.encontrado || resultado.cliente.mencionado) && (
                <p className="flex items-start gap-1.5">
                  <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-texto-secundario" />
                  {resultado.cliente.encontrado ? (
                    <span>
                      Cliente: <strong>{resultado.cliente.encontrado.rotulo}</strong> (achado no cadastro)
                    </span>
                  ) : (
                    <span>
                      Cliente citado: <strong>{resultado.cliente.mencionado}</strong> — não achei no cadastro; escolha ou cadastre.
                    </span>
                  )}
                </p>
              )}
              {resultado.prazoDesejado && <p>Prazo pedido: {resultado.prazoDesejado}</p>}
              {resultado.observacoes && <p>{resultado.observacoes}</p>}
              {resultado.naoIdentificados.length > 0 && <p className="text-amber-800">Não entendi: {resultado.naoIdentificados.join('; ')}</p>}
              {/* Manual do atendente: só lembrete (nada entra no orçamento sem a pessoa escolher) */}
              {resultado.sugestoes.length > 0 && <p className="text-marca-escuro">Oferecer ao cliente: {resultado.sugestoes.join('; ')}</p>}
              <p className="text-xs text-texto-secundario">Prazo, observações, sugestões e o que ficou de fora vão para as observações internas.</p>
            </div>
          )}

          <div className="flex flex-col gap-3 border-t border-border pt-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-texto-secundario">
              {escolhidas.length} item(ns) · <strong className="tabular-nums text-tinta">{formatarMoeda(total.toFixed(2))}</strong>
              {semPreco && ' + itens calculados no orçamento'}
              <span className="block text-xs">Preços do seu cadastro, calculados pelo sistema. Quantidades e medidas você ajusta no orçamento.</span>
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => setResultado(null)}>
                Editar o pedido
              </Button>
              <Button type="button" onClick={() => void adicionar()} disabled={!escolhidas.length || adicionando}>
                {adicionando ? <Loader2 className="animate-spin" /> : <Sparkles />} Adicionar ao orçamento
              </Button>
            </div>
          </div>
        </>
      )}
    </Card>
  )
}
