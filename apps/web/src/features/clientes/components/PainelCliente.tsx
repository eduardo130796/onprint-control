import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BookOpen, ExternalLink, FilePlus2, MessageCircle } from 'lucide-react'
import { formatarCpfCnpj, formatarDataSimples, formatarMoeda, formatarTelefone, type Cliente } from '@onprint/shared'
import { titulosApi } from '@/api/financeiro'
import { pedidosApi } from '@/api/producao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { AcaoPainel, DadoPainel, PainelCartao } from '@/components/shared/kanban/PainelCartao'
import { StatusBadge } from '@/components/shared/StatusBadge'
import { Skeleton } from '@/components/ui/skeleton'
import { usePermissoes } from '@/hooks/usePermission'
import { useEnviarCatalogo } from '@/features/vitrine/useEnviarCatalogo'
import { useCliente } from '../hooks'

const so = (v: string | null | undefined) => (v ?? '').replace(/\D/g, '')

/** Título pequeno de cada bloco do painel */
function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.12em] text-texto-secundario">{titulo}</h3>
      {children}
    </section>
  )
}

/** Painel do cliente aberto pela lista: contato, endereço, situação financeira, últimos pedidos e atalhos. */
export function PainelCliente({ cliente: resumo, onFechar }: { cliente: Cliente; onFechar: () => void }) {
  const navigate = useNavigate()
  const pode = usePermissoes()
  const consulta = useCliente(resumo.id)
  const catalogo = useEnviarCatalogo()
  const verFinanceiro = pode('financeiro')
  const verPedidos = pode('pedidos')
  const financeiro = useQuery({
    queryKey: ['financeiro', 'receber', 'cliente', resumo.id, 'resumo'],
    queryFn: () => titulosApi('receber').listar({ clienteId: resumo.id, pageSize: 1 }),
    enabled: verFinanceiro,
  })
  const pedidos = useQuery({
    queryKey: ['pedidos', 'cliente', resumo.id, 'recentes'],
    queryFn: () => pedidosApi.listar({ clienteId: resumo.id, pageSize: 5, incluirFinalizados: 'true', sort: 'createdAt:desc' }),
    enabled: verPedidos,
  })
  const ir = (caminho: string) => {
    onFechar()
    navigate(caminho)
  }
  const c = consulta.data ?? resumo
  const zap = so(c.whatsapp) || so(c.telefone)
  const endereco = consulta.data?.enderecos[0]

  return (
    <PainelCartao
      aberto
      onFechar={onFechar}
      titulo={c.nome}
      subtitulo={
        <span className="flex flex-wrap items-center gap-2">
          {c.fantasia && <span>{c.fantasia}</span>}
          {c.cpfCnpj && <span className="font-mono text-xs">{formatarCpfCnpj(c.cpfCnpj)}</span>}
          <StatusBadge entidade="cliente" codigo={c.situacao} className="text-[0.6875rem]" />
        </span>
      }
      acoes={
        <>
          <AcaoPainel icone={ExternalLink} rotulo="Abrir ficha" onClick={() => ir(`/clientes/${c.id}`)} destaque />
          {pode('orcamentos', 'criar') && <AcaoPainel icone={FilePlus2} rotulo="Novo orçamento" onClick={() => ir(`/orcamentos/novo?cliente=${c.id}`)} />}
          {zap && <AcaoPainel icone={MessageCircle} rotulo="WhatsApp" onClick={() => window.open(`https://wa.me/${zap.length <= 11 ? `55${zap}` : zap}`, '_blank', 'noopener')} />}
          {zap && catalogo.disponivel && <AcaoPainel icone={BookOpen} rotulo="Enviar catálogo" onClick={() => catalogo.enviar(c)} />}
        </>
      }
    >
      {consulta.isError ? (
        <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
      ) : (
        <>
          <Secao titulo="Contato">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
              <DadoPainel rotulo="Telefone">{c.telefone ? formatarTelefone(c.telefone) : '—'}</DadoPainel>
              <DadoPainel rotulo="WhatsApp">{c.whatsapp ? formatarTelefone(c.whatsapp) : '—'}</DadoPainel>
              <div className="col-span-2">
                <DadoPainel rotulo="E-mail">{c.email ? <a href={`mailto:${c.email}`} className="break-all text-marca-escuro hover:underline">{c.email}</a> : '—'}</DadoPainel>
              </div>
              {c.vendedor && <DadoPainel rotulo="Vendedor">{c.vendedor.nome}</DadoPainel>}
              {Number(c.limiteCredito) > 0 && <DadoPainel rotulo="Limite de crédito">{formatarMoeda(c.limiteCredito)}</DadoPainel>}
            </dl>
          </Secao>

          {consulta.isPending ? (
            <Skeleton className="h-12 w-full" />
          ) : (
            endereco && (
              <Secao titulo="Endereço">
                <p className="text-tinta">
                  {endereco.logradouro}
                  {endereco.numero && `, ${endereco.numero}`}
                  {endereco.complemento && ` · ${endereco.complemento}`}
                </p>
                <p className="text-texto-secundario">
                  {[endereco.bairro, `${endereco.cidade}/${endereco.uf}`].filter(Boolean).join(' · ')}
                </p>
              </Secao>
            )
          )}

          {verFinanceiro && (
            <Secao titulo="Financeiro">
              {financeiro.isPending ? (
                <Skeleton className="h-16 w-full" />
              ) : financeiro.data ? (
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['Comprado', financeiro.data.resumo.valor, 'text-tinta'],
                      ['Recebido', financeiro.data.resumo.pago, 'text-green-700'],
                      ['Em aberto', financeiro.data.resumo.saldo, Number(financeiro.data.resumo.saldo) > 0 ? 'text-coral-escuro' : 'text-tinta'],
                    ] as const
                  ).map(([rotulo, valor, cor]) => (
                    <div key={rotulo} className="rounded-xl bg-fundo px-3 py-2.5">
                      <p className="text-[0.6875rem] text-texto-secundario">{rotulo}</p>
                      <p className={`truncate text-sm font-semibold ${cor}`}>{formatarMoeda(valor)}</p>
                    </div>
                  ))}
                </div>
              ) : null}
            </Secao>
          )}

          {verPedidos && (
            <Secao titulo="Últimos pedidos">
              {pedidos.isPending ? (
                <Skeleton className="h-24 w-full" />
              ) : !pedidos.data?.data.length ? (
                <p className="text-texto-secundario">Nenhum pedido ainda.</p>
              ) : (
                <ul className="-mx-2">
                  {pedidos.data.data.map((p) => (
                    <li key={p.id}>
                      <button type="button" onClick={() => ir(`/pedidos/${p.id}`)} className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left hover:bg-fundo">
                        <span className="font-mono text-xs text-tinta">{p.numero}</span>
                        <span className="flex-1 text-xs text-texto-secundario">{formatarDataSimples(p.createdAt.slice(0, 10))}</span>
                        <StatusBadge entidade="pedido" codigo={p.status} className="text-[0.625rem]" />
                        <span className="w-24 text-right text-sm font-medium tabular-nums">{formatarMoeda(p.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </Secao>
          )}

          {c.observacoes && (
            <Secao titulo="Observações">
              <p className="whitespace-pre-line text-tinta">{c.observacoes}</p>
            </Secao>
          )}
        </>
      )}
    </PainelCartao>
  )
}
