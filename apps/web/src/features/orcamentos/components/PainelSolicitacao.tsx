import { Link, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, FilePlus2, Globe, Hand, Mail, MessageCircle, Package, XCircle } from 'lucide-react'
import { ORIGEM_ROTULOS, formatarDataHora, formatarDataSimples, formatarTelefone, type Solicitacao, type SolicitacaoItem } from '@onprint/shared'
import { solicitacoesApi } from '@/api/comercial'
import { AcaoPainel, DadoPainel, PainelCartao } from '@/components/shared/kanban/PainelCartao'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { useAuth } from '@/hooks/useAuth'
import { usePermissoes } from '@/hooks/usePermission'
import { useEnviarCatalogo } from '@/features/vitrine/useEnviarCatalogo'

/** Solicitação com os campos da vitrine (itens e e-mail do contato) — ver docs/VITRINE.md §3 */
/** A solicitação já traz e-mail e itens (pedidos da vitrine) */
export type SolicitacaoComItens = Solicitacao

const medida = (v: string | null) => (v === null ? null : Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }))

/** "1,5 × 0,8 m" (ou só a medida informada) */
function medidas(item: SolicitacaoItem): string | null {
  const l = medida(item.largura)
  const a = medida(item.altura)
  if (l && a) return `${l} × ${a} m`
  if (l) return `${l} m de largura`
  if (a) return `${a} m de altura`
  return null
}

interface PainelSolicitacaoProps {
  solicitacao: SolicitacaoComItens
  onFechar: () => void
  onAssumir: (s: Solicitacao) => void
  onDescartar: (s: Solicitacao) => void
  assumindo?: boolean
}

/** Painel lateral da solicitação: contato, itens pedidos (vitrine), descrição e ações rápidas. */
export function PainelSolicitacao({ solicitacao, onFechar, onAssumir, onDescartar, assumindo }: PainelSolicitacaoProps) {
  const navigate = useNavigate()
  const pode = usePermissoes()
  const { usuario } = useAuth()
  const catalogo = useEnviarCatalogo()
  // Detalhe atualizado (a linha da lista serve de prévia enquanto carrega)
  const detalhe = useQuery({
    queryKey: ['solicitacoes', 'detalhe', solicitacao.id],
    queryFn: () => solicitacoesApi.obter(solicitacao.id) as Promise<SolicitacaoComItens>,
    placeholderData: solicitacao,
  })
  const s = detalhe.data ?? solicitacao
  const aberta = s.status === 'nova' || s.status === 'em_atendimento'
  const zap = s.cliente?.whatsapp?.replace(/\D/g, '')
  const itens = s.itens ?? []

  return (
    <PainelCartao
      aberto
      onFechar={onFechar}
      titulo={<span className="font-mono">{s.numero}</span>}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          {formatarDataHora(s.createdAt)}
          {s.origem === 'site' ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-marca-suave px-2 py-0.5 text-xs font-semibold text-marca-escuro">
              <Globe className="h-3 w-3" /> Pedido do site
            </span>
          ) : (
            <span className="rounded-full bg-fundo px-2 py-0.5 text-xs">{ORIGEM_ROTULOS[s.origem]}</span>
          )}
        </span>
      }
      acoes={
        (aberta || zap) && (
          <>
            {aberta && pode('orcamentos', 'criar') && s.clienteId && (
              <AcaoPainel icone={FilePlus2} rotulo="Criar orçamento" destaque onClick={() => navigate(`/orcamentos/novo?solicitacao=${s.id}&cliente=${s.clienteId}`)} />
            )}
            {zap && <AcaoPainel icone={MessageCircle} rotulo="WhatsApp" onClick={() => window.open(`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}`, '_blank', 'noopener')} />}
            {zap && s.cliente && catalogo.disponivel && <AcaoPainel icone={BookOpen} rotulo="Enviar catálogo" onClick={() => s.cliente && catalogo.enviar(s.cliente)} />}
            {aberta && pode('orcamentos', 'editar') && s.responsavelId !== usuario?.id && (
              <AcaoPainel icone={Hand} rotulo="Assumir" carregando={assumindo} onClick={() => onAssumir(s)} />
            )}
            {aberta && pode('orcamentos', 'editar') && <AcaoPainel icone={XCircle} rotulo="Descartar" onClick={() => onDescartar(s)} />}
          </>
        )
      }
    >
      {/* Contato */}
      <section className="rounded-2xl border border-border p-4">
        <p className="text-xs text-texto-secundario">Cliente</p>
        {s.cliente ? (
          pode('clientes') ? (
            <Link to={`/clientes/${s.cliente.id}`} className="text-base font-semibold text-tinta hover:text-marca-escuro hover:underline">
              {s.cliente.nome}
            </Link>
          ) : (
            <p className="text-base font-semibold text-tinta">{s.cliente.nome}</p>
          )
        ) : (
          <p className="text-base font-semibold text-tinta">—</p>
        )}
        {s.cliente?.situacao === 'pre_cadastro' && <p className="text-xs text-amber-700">Pré-cadastro: complete os dados na ficha do cliente.</p>}
        <div className="mt-3 space-y-1.5">
          {s.cliente?.whatsapp && (
            <p className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 shrink-0 text-texto-secundario" />
              {formatarTelefone(s.cliente.whatsapp)}
            </p>
          )}
          {s.email && (
            <p className="flex min-w-0 items-center gap-2">
              <Mail className="h-4 w-4 shrink-0 text-texto-secundario" />
              <a href={`mailto:${s.email}`} className="truncate text-marca-escuro hover:underline">
                {s.email}
              </a>
            </p>
          )}
        </div>
      </section>

      <dl className="grid grid-cols-2 gap-4">
        <DadoPainel rotulo="Status">
          <StatusBadge entidade="solicitacao" codigo={s.status} />
        </DadoPainel>
        <DadoPainel rotulo="Prazo desejado">{formatarDataSimples(s.prazoDesejado)}</DadoPainel>
        <DadoPainel rotulo="Responsável">{s.responsavel?.nome ?? <span className="text-ambar">Sem responsável</span>}</DadoPainel>
        {s.referenciaExterna && <DadoPainel rotulo="Referência">{s.referenciaExterna}</DadoPainel>}
      </dl>

      {itens.length > 0 && (
        <section>
          <h3 className="mb-2 flex items-center gap-2 font-semibold text-tinta">
            Itens pedidos <span className="rounded-full bg-fundo px-2 py-0.5 text-xs font-medium text-texto-secundario">{itens.length}</span>
          </h3>
          <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
            {itens.map((item) => {
              const m = medidas(item)
              return (
                <li key={item.id} className="flex gap-3 p-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-marca-suave text-marca-escuro">
                    <Package className="h-4 w-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      {item.produtoId && pode('produtos') ? (
                        <Link to={`/produtos/${item.produtoId}`} className="min-w-0 font-medium text-tinta hover:text-marca-escuro hover:underline">
                          {item.descricao}
                        </Link>
                      ) : (
                        <p className="min-w-0 font-medium text-tinta">{item.descricao}</p>
                      )}
                      <span className="shrink-0 rounded-lg bg-grafite px-2 py-0.5 text-xs font-semibold tabular-nums text-white">
                        {item.quantidade.toLocaleString('pt-BR')} un
                      </span>
                    </div>
                    {m && <p className="text-xs text-texto-secundario">{m}</p>}
                    {item.acabamentos.length > 0 && (
                      <div className="mt-1.5 flex flex-wrap gap-1">
                        {item.acabamentos.map((a) => (
                          <span key={a.id} className="rounded-full bg-fundo px-2 py-0.5 text-[0.6875rem] font-medium text-tinta/80 ring-1 ring-border">
                            {a.nome}
                          </span>
                        ))}
                      </div>
                    )}
                    {item.observacao && <p className="mt-1.5 whitespace-pre-line text-xs italic text-texto-secundario">“{item.observacao}”</p>}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section>
        <h3 className="mb-1.5 font-semibold text-tinta">{itens.length ? 'Mensagem e resumo' : 'Pedido do cliente'}</h3>
        <p className="whitespace-pre-line text-tinta/90">{s.descricao}</p>
      </section>

      {s.motivoDescarte && (
        <section className="rounded-xl bg-red-50 p-3 text-red-800">
          <p className="text-xs font-semibold">Motivo do descarte</p>
          <p>{s.motivoDescarte}</p>
        </section>
      )}

      {s.orcamentos.length > 0 && (
        <section>
          <h3 className="mb-1.5 font-semibold text-tinta">Orçamentos</h3>
          <ul className="space-y-1.5">
            {s.orcamentos.map((o) => (
              <li key={o.id} className="flex items-center justify-between gap-2">
                <Link to={`/orcamentos/${o.id}`} className="font-mono text-marca-escuro hover:underline">
                  {o.numero}
                </Link>
                <StatusBadge entidade="orcamento" codigo={o.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
    </PainelCartao>
  )
}
