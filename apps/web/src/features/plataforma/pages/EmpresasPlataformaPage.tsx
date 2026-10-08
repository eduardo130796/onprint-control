import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { Building2, Plus } from 'lucide-react'
import { NIVEL_ACESSO_ROTULOS, SITUACAO_ASSINATURA_ROTULOS, formatarData, formatarDataSimples, formatarMoeda, type EmpresasPlataformaQuery } from '@onprint/shared'
import { PageHeader } from '@/components/layout/PageHeader'
import { EmptyState } from '@/components/shared/EmptyState'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { Skeleton } from '@/components/ui/skeleton'
import { useDebounce } from '@/hooks/useDebounce'
import { plataformaApi } from '../api'
import { NovaEmpresaDialog } from '../components/NovaEmpresaDialog'
import { SeloCategoria } from '../components/SeloCategoria'

/** Todas as empresas assinantes, com filtros (os indicadores do painel trazem o filtro pronto na URL). */
export function EmpresasPlataformaPage() {
  const [params, setParams] = useSearchParams()
  const [nova, setNova] = useState(false)
  const busca = useDebounce(params.get('busca') ?? '', 300)
  const filtros: EmpresasPlataformaQuery = {
    busca: busca || undefined,
    nivel: (params.get('nivel') as EmpresasPlataformaQuery['nivel']) || undefined,
    situacao: (params.get('situacao') as EmpresasPlataformaQuery['situacao']) || undefined,
    plano: params.get('plano') || undefined,
  }
  const consulta = useQuery({ queryKey: ['plataforma', 'empresas', filtros], queryFn: () => plataformaApi.empresas(filtros), placeholderData: keepPreviousData })
  const planos = useQuery({ queryKey: ['plataforma', 'planos'], queryFn: plataformaApi.planos })
  const definir = (chave: string, valor: string) => {
    const p = new URLSearchParams(params)
    if (valor) p.set(chave, valor)
    else p.delete(chave)
    setParams(p, { replace: true })
  }

  return (
    <>
      <PageHeader
        titulo="Empresas"
        subtitulo={consulta.data ? `${consulta.data.length} empresa(s) neste filtro` : undefined}
        acoes={
          <Button onClick={() => setNova(true)}>
            <Plus /> Nova empresa
          </Button>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        <Input className="w-64" placeholder="Nome ou identificador…" aria-label="Buscar" value={params.get('busca') ?? ''} onChange={(e) => definir('busca', e.target.value)} />
        <div className="w-44">
          <Select aria-label="Situação" value={filtros.situacao ?? ''} onChange={(e) => definir('situacao', e.target.value)}>
            <option value="">Todas as situações</option>
            {Object.entries(SITUACAO_ASSINATURA_ROTULOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select aria-label="Acesso" value={filtros.nivel ?? ''} onChange={(e) => definir('nivel', e.target.value)}>
            <option value="">Todos os acessos</option>
            {Object.entries(NIVEL_ACESSO_ROTULOS).map(([v, r]) => (
              <option key={v} value={v}>
                {r}
              </option>
            ))}
          </Select>
        </div>
        <div className="w-44">
          <Select aria-label="Plano" value={filtros.plano ?? ''} onChange={(e) => definir('plano', e.target.value)}>
            <option value="">Todos os planos</option>
            {planos.data?.map((p) => (
              <option key={p.codigo} value={p.codigo}>
                {p.nome}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <Card>
        {consulta.isPending ? (
          <Skeleton className="h-64 w-full" />
        ) : consulta.isError ? (
          <EstadoErro erro={consulta.error} onTentarNovamente={() => void consulta.refetch()} />
        ) : consulta.data.length === 0 ? (
          <EmptyState icone={Building2} titulo="Nenhuma empresa neste filtro" descricao="Limpe os filtros ou crie uma empresa." />
        ) : (
          <ul className="divide-y divide-border text-sm">
            {consulta.data.map((e) => (
              <li key={e.id}>
                <Link to={`/plataforma/empresas/${e.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 hover:bg-fundo/60">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-semibold text-grafite">{e.nome}</span>
                    <span className="block text-xs text-texto-secundario">
                      /{e.slug} · desde {formatarData(e.criadaEm)}
                      {!e.ativa && ' · empresa desativada'}
                    </span>
                  </span>
                  <span className="w-32 text-xs">
                    {e.plano ?? '—'}
                    {e.valorMensal && <span className="block text-texto-secundario">{formatarMoeda(e.valorMensal)}/mês</span>}
                  </span>
                  <SeloCategoria categoria={e.categoria} />
                  <span className="w-full text-xs text-texto-secundario sm:w-72">
                    {e.mensagem}
                    {e.proximoVencimento && ` · próximo vencimento ${formatarDataSimples(e.proximoVencimento)}`}
                    {e.gateway && ' · Asaas'}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
      {nova && <NovaEmpresaDialog onFechar={() => setNova(false)} />}
    </>
  )
}
