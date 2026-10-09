import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Building2, Pause, Pencil, Play } from 'lucide-react'
import { formatarData, formatarDataSimples, formatarMoeda } from '@onprint/shared'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { useAlternarCupom } from '../components/acoes'
import { CodigoCupom, CupomDialog, SeloCupom } from '../components/CupomDialog'
import { situacaoCupom } from '../components/regras'
import { Secao } from '../components/Secao'

const mesAno = (iso: string | null) => (iso ? formatarDataSimples(iso).slice(3) : null)

/** Detalhe de um cupom: números e as empresas que usaram (com link para a ficha). */
export function CupomPlataformaPage() {
  const { id = '' } = useParams()
  const consulta = useQuery({ queryKey: ['plataforma', 'cupom', id], queryFn: () => plataformaApi.cupom(id) })
  const alternar = useAlternarCupom()
  const [editando, setEditando] = useState(false)
  const c = consulta.data

  return (
    <>
      <Link to="/plataforma/cupons" className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-marca-escuro hover:underline">
        <ArrowLeft className="h-4 w-4" /> Cupons
      </Link>
      {consulta.isPending ? (
        <Skeleton className="h-72 w-full rounded-3xl" />
      ) : consulta.isError || !c ? (
        <Secao>
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        </Secao>
      ) : (
        <div className="space-y-5">
          <section className="relative overflow-hidden rounded-3xl bg-grafite text-white shadow-xl" aria-label={`Cupom ${c.codigo}`}>
            <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-laranja/25 blur-3xl" aria-hidden="true" />
            <div className="flex h-1.5" aria-hidden="true">
              <span className="w-16 bg-marca" />
              <span className="flex-1 bg-laranja" />
            </div>
            <div className="relative grid gap-6 p-5 sm:p-8 lg:grid-cols-[minmax(0,1fr)_auto]">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">Cupom</p>
                <div className="mt-1 flex flex-wrap items-center gap-3">
                  <CodigoCupom codigo={c.codigo} claro grande />
                  <SeloCupom situacao={situacaoCupom(c)} />
                </div>
                <p className="mt-2 font-titulo text-xl font-extrabold">{c.resumo}</p>
                <p className="mt-1 text-sm text-white/60">
                  {c.descricao ? `${c.descricao} · ` : ''}
                  {c.planos.length ? `planos ${c.planos.join(', ')}` : 'todos os planos'}
                  {c.validoAte ? ` · válido até ${formatarDataSimples(c.validoAte)}` : ' · sem validade'} · criado em {formatarData(c.criadoEm)}
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button size="sm" variant="ghost" className="bg-white/10 text-white hover:bg-white/20 hover:text-white" onClick={() => setEditando(true)}>
                    <Pencil /> Editar
                  </Button>
                  <Button size="sm" variant="ghost" className="bg-white/10 text-white hover:bg-white/20 hover:text-white" disabled={alternar.isPending} onClick={() => alternar.mutate(c)}>
                    {c.ativo ? <Pause /> : <Play />} {c.ativo ? 'Pausar' : 'Reativar'}
                  </Button>
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm lg:w-[360px]">
                {[
                  ['Usos', `${c.usos}${c.limiteUsos != null ? ` / ${c.limiteUsos}` : ''}`],
                  ['Em uso agora', String(c.emUso)],
                  ['Desconto concedido', formatarMoeda(c.descontoConcedido)],
                  ['Receita com o cupom', formatarMoeda(c.receita)],
                ].map(([r, v]) => (
                  <div key={r} className="min-w-0 rounded-2xl bg-white/5 p-4 ring-1 ring-white/10">
                    <dt className="text-xs text-white/60">{r}</dt>
                    <dd className="truncate font-titulo text-xl font-extrabold tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </section>

          <Secao titulo="Empresas que usaram" subtitulo="Janela do desconto (primeira e última mensalidade) e quanto já foi concedido." icone={Building2}>
            {c.empresas.length === 0 ? (
              <EmptyState icone={Building2} titulo="Ninguém usou ainda" descricao="Aplique pela ficha da empresa ou divulgue o código para o cadastro." className="py-8" />
            ) : (
              <div className="relative -mx-5 overflow-x-auto sm:-mx-7">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-semibold uppercase tracking-wide text-texto-secundario">
                      <th className="py-2 pl-5 pr-3 sm:pl-7">Empresa</th>
                      <th className="px-3">Situação</th>
                      <th className="px-3">Aplicado em</th>
                      <th className="px-3">Janela do desconto</th>
                      <th className="px-3 text-right">Desconto concedido</th>
                      <th className="pl-3 pr-5 sm:pr-7">Por</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {c.empresas.map((u) => (
                      <tr key={`${u.id}-${u.aplicadoEm}`}>
                        <td className="py-3 pl-5 pr-3 sm:pl-7">
                          <Link to={`/plataforma/empresas/${u.id}`} className="font-semibold text-tinta hover:underline">
                            {u.nome}
                          </Link>
                          <span className="block text-xs text-texto-secundario">/{u.slug}</span>
                        </td>
                        <td className="px-3 py-3">
                          <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold ring-1', u.encerradoEm ? 'bg-slate-100 text-texto-secundario ring-slate-300' : 'bg-marca-suave text-marca-escuro ring-marca/30')}>
                            {u.encerradoEm ? `Encerrado em ${formatarData(u.encerradoEm)}` : 'Em uso'}
                          </span>
                        </td>
                        <td className="px-3 py-3 tabular-nums">{formatarData(u.aplicadoEm)}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {mesAno(u.desde) ?? 'próxima'} → {mesAno(u.ate) ?? 'para sempre'}
                        </td>
                        <td className="px-3 py-3 text-right font-semibold tabular-nums text-laranja-escuro">{formatarMoeda(u.descontoConcedido)}</td>
                        <td className="max-w-[200px] truncate py-3 pl-3 pr-5 text-xs text-texto-secundario sm:pr-7">{u.autor}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Secao>
        </div>
      )}
      {editando && c && <CupomDialog cupom={c} onFechar={() => setEditando(false)} />}
    </>
  )
}
