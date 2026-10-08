import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { FORMA_ASSINATURA_ROTULOS, MODULO_ROTULOS, SITUACAO_ASSINATURA_ROTULOS, formatarData, formatarDataSimples, formatarMoeda, type FormaAssinatura, type Modulo } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { HistoricoCobrancas } from '@/features/assinatura/components/HistoricoCobrancas'
import { mascaraCpfCnpj } from '@/lib/mascaras'
import { plataformaApi } from '../api'
import { AcoesAssinatura } from '../components/AcoesAssinatura'
import { SeloCategoria } from '../components/SeloCategoria'

function Dado({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-texto-secundario">{rotulo}</dt>
      <dd className="font-medium text-grafite">{children}</dd>
    </div>
  )
}

/** Ficha da empresa no painel: assinatura e ações, usuários, mensalidades e histórico. */
export function EmpresaPlataformaPage() {
  const { id = '' } = useParams()
  const consulta = useQuery({ queryKey: ['plataforma', 'empresa', id], queryFn: () => plataformaApi.empresa(id) })
  const e = consulta.data
  const a = e?.assinatura

  return (
    <>
      <Link to="/plataforma/empresas" className="mb-3 inline-flex items-center gap-1 text-sm font-medium text-marca-escuro hover:underline">
        <ArrowLeft className="h-4 w-4" /> Empresas
      </Link>
      {consulta.isPending ? (
        <Skeleton className="h-96 w-full" />
      ) : consulta.isError || !e ? (
        <Card>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Card>
      ) : (
        <div className="space-y-4">
          <PageHeader titulo={e.nome} subtitulo={`/${e.slug} · schema ${e.schema} · desde ${formatarData(e.criadaEm)}`} acoes={<SeloCategoria categoria={e.categoria} className="text-sm" />} />

          {a && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Assinatura</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 text-sm">
                <p className="rounded-xl bg-fundo p-3 font-medium">{a.acesso.mensagem}</p>
                <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <Dado rotulo="Plano">
                    {e.plano} · {e.valorMensal && formatarMoeda(e.valorMensal)}/mês
                  </Dado>
                  <Dado rotulo="Situação">{e.situacao ? SITUACAO_ASSINATURA_ROTULOS[e.situacao] : '—'}</Dado>
                  {e.testeAte && <Dado rotulo="Teste até">{formatarDataSimples(e.testeAte)}</Dado>}
                  {e.proximoVencimento && <Dado rotulo="Próximo vencimento">{formatarDataSimples(e.proximoVencimento)}</Dado>}
                  {a.atrasoDesde && <Dado rotulo="Em atraso desde">{formatarDataSimples(a.atrasoDesde)}</Dado>}
                  {a.liberadoAte && <Dado rotulo="Liberado até">{formatarDataSimples(a.liberadoAte)}</Dado>}
                  {a.cancelarEm && <Dado rotulo="Cancelamento em">{formatarDataSimples(a.cancelarEm)}</Dado>}
                  {a.bloqueioManual && <Dado rotulo="Bloqueio manual">{a.motivoBloqueio}</Dado>}
                  <Dado rotulo="Pagamento">
                    {a.gatewayAssinaturaId ? `Asaas · ${a.formaPagamento ? FORMA_ASSINATURA_ROTULOS[a.formaPagamento as FormaAssinatura].split(' (')[0] : '—'}` : 'Manual / ainda não assinou online'}
                  </Dado>
                  {a.documentoCobranca && <Dado rotulo="Documento da cobrança">{mascaraCpfCnpj(a.documentoCobranca)}</Dado>}
                  <Dado rotulo="Usuários ativos">
                    {e.usuarios.ativos} {a.limiteUsuarios ? `de ${a.limiteUsuarios}` : '(sem limite)'} · {e.usuarios.total} no total
                  </Dado>
                  {a.gatewayAssinaturaId && (
                    <Dado rotulo="Ids no Asaas">
                      <span className="font-mono text-xs">
                        {a.gatewayClienteId} · {a.gatewayAssinaturaId}
                      </span>
                    </Dado>
                  )}
                </dl>
                <p className="text-xs text-texto-secundario">
                  Módulos: {a.modulos.map((m) => MODULO_ROTULOS[m as Modulo] ?? m).join(', ')}
                  {a.modulosExtras.length > 0 && ` (extras: ${a.modulosExtras.map((m) => MODULO_ROTULOS[m as Modulo] ?? m).join(', ')})`}
                </p>
                <div className="border-t border-border pt-4">
                  <AcoesAssinatura empresa={e} />
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Administradores da empresa</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="space-y-1 text-sm">
                {e.usuarios.admins.map((u) => (
                  <li key={u.email}>
                    <strong className="text-grafite">{u.nome}</strong> · {u.email} · {u.ultimoLogin ? `último acesso ${formatarData(u.ultimoLogin)}` : 'nunca entrou'}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          <HistoricoCobrancas cobrancas={e.cobrancas} />

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Histórico da assinatura</CardTitle>
            </CardHeader>
            <CardContent>
              <ul className="divide-y divide-border text-sm">
                {e.eventos.map((ev) => (
                  <li key={ev.id} className="flex flex-wrap gap-x-3 py-2">
                    <span className="w-36 text-texto-secundario">{formatarData(ev.data)}</span>
                    <span className="min-w-0 flex-1">{ev.descricao}</span>
                    <span className="text-xs text-texto-secundario">{ev.autor}</span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>
      )}
    </>
  )
}
