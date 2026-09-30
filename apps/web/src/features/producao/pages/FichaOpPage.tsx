import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Printer } from 'lucide-react'
import { ETAPAS_PRODUCAO, PRIORIDADE_ROTULOS, formatarDataHora, formatarDataSimples } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { Button } from '@/components/ui/button'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { useStatusConfig } from '@/hooks/useStatusConfig'

const num = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR') : '—')

/** Ficha da OP para imprimir e acompanhar a peça no chão de fábrica (abre o diálogo de impressão). */
export function FichaOpPage() {
  const { id = '' } = useParams()
  const consulta = useQuery({ queryKey: ['ops', 'detalhe', id], queryFn: () => opsApi.obter(id) })
  const empresa = useEmpresa()
  const { mapa } = useStatusConfig()
  const pronto = consulta.isSuccess && !empresa.isPending

  useEffect(() => {
    if (!pronto) return
    const t = setTimeout(() => window.print(), 400)
    return () => clearTimeout(t)
  }, [pronto])

  if (consulta.isPending) return <TelaCarregando />
  if (consulta.isError) return <EstadoErro erro={consulta.error} />
  const op = consulta.data
  const nomeEmpresa = empresa.data?.nomeFantasia || empresa.data?.razaoSocial || 'ONPrint'

  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-sm text-black print:p-0">
      <div className="mb-4 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
      </div>
      <header className="flex items-start justify-between border-b-2 border-black pb-3">
        <div>
          <p className="text-xs uppercase tracking-wide">{nomeEmpresa} · Ordem de produção</p>
          <h1 className="font-mono text-3xl font-bold">{op.numero}</h1>
          <p>
            Pedido {op.pedido.numero} · {op.pedido.cliente.nome}
          </p>
        </div>
        <div className="text-right">
          <p className="text-xs uppercase">Entregar até</p>
          <p className="text-2xl font-bold">{formatarDataSimples(op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega)}</p>
          <p className="font-semibold">Prioridade: {PRIORIDADE_ROTULOS[op.prioridade]}</p>
        </div>
      </header>

      <section className="mt-4 grid grid-cols-[1fr_200px] gap-6">
        <div>
          <h2 className="text-lg font-semibold">{op.item.descricao}</h2>
          <table className="mt-2 w-full">
            <tbody className="[&_td]:border-b [&_td]:border-gray-300 [&_td]:py-1.5">
              <tr><td className="w-40 text-gray-600">Quantidade</td><td className="font-semibold">{num(op.quantidade)}</td></tr>
              {op.largura && <tr><td className="text-gray-600">Medidas</td><td className="font-semibold">{num(op.largura)} × {num(op.altura)} m ({num(op.areaM2)} m²)</td></tr>}
              <tr><td className="text-gray-600">Acabamentos</td><td>{op.acabamentos.join(', ') || '—'}</td></tr>
              <tr><td className="text-gray-600">Máquina</td><td>{op.maquina?.nome ?? '—'}</td></tr>
              <tr><td className="text-gray-600">Responsável</td><td>{op.responsavel?.nome ?? '—'}</td></tr>
              <tr><td className="text-gray-600">Horas estimadas</td><td>{num(op.horasEstimadas)} h</td></tr>
              <tr><td className="text-gray-600">Arte</td><td>{op.arte ? `v${op.arte.versao} · ${mapa.get(`arte:${op.arte.status}`)?.rotulo ?? op.arte.status}` : 'sem arte'}</td></tr>
            </tbody>
          </table>
          {op.observacoes && <p className="mt-3 border border-black p-2"><strong>Observações:</strong> {op.observacoes}</p>}
        </div>
        <div className="flex h-[200px] items-center justify-center border border-gray-300">
          {op.arte?.miniaturaUrl ? <img src={op.arte.miniaturaUrl} alt="Arte" className="max-h-full max-w-full object-contain" /> : <span className="text-gray-500">sem miniatura</span>}
        </div>
      </section>

      <section className="mt-6">
        <h3 className="mb-2 font-semibold">Etapas</h3>
        <table className="w-full border-collapse [&_td]:border [&_td]:border-gray-400 [&_td]:p-2 [&_th]:border [&_th]:border-gray-400 [&_th]:p-2 [&_th]:text-left">
          <thead>
            <tr><th className="w-1/3">Etapa</th><th>Data / hora</th><th>Visto</th></tr>
          </thead>
          <tbody>
            {ETAPAS_PRODUCAO.filter((e) => e !== 'fila').map((e) => {
              const feito = op.historico.find((h) => h.etapaPara === e)
              return (
                <tr key={e}>
                  <td>{mapa.get(`producao:${e}`)?.rotulo ?? e}</td>
                  <td>{feito ? formatarDataHora(feito.createdAt) : ''}</td>
                  <td>{feito?.usuario?.nome ?? ''}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>
      <p className="mt-6 text-xs text-gray-500">Impresso em {formatarDataHora(new Date())}</p>
    </div>
  )
}
