import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ImageOff, Printer } from 'lucide-react'
import QRCode from 'qrcode'
import { ETAPAS_PRODUCAO, PRIORIDADE_ROTULOS, formatarCpfCnpj, formatarDataHora, formatarDataSimples } from '@onprint/shared'
import { opsApi } from '@/api/producao'
import { EstadoErro } from '@/components/shared/EstadoErro'
import { TelaCarregando } from '@/components/shared/TelaCarregando'
import { Button } from '@/components/ui/button'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { useStatusConfig } from '@/hooks/useStatusConfig'

const num = (v: string | null) => (v ? Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 }) : '—')

function Dado({ rotulo, children, largo }: { rotulo: string; children: React.ReactNode; largo?: boolean }) {
  return (
    <div className={largo ? 'col-span-2' : undefined}>
      <dt className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4A5259]">{rotulo}</dt>
      <dd className="mt-0.5 font-semibold text-[#1F2328]">{children}</dd>
    </div>
  )
}

/**
 * Ficha da OP para o chão de fábrica (mesma identidade dos documentos em PDF): arte grande, dados do item,
 * etapas para marcar à mão e um QR que abre a OP no sistema. Abre o diálogo de impressão sozinha.
 */
export function FichaOpPage() {
  const { id = '' } = useParams()
  const consulta = useQuery({ queryKey: ['ops', 'detalhe', id], queryFn: () => opsApi.obter(id) })
  const empresa = useEmpresa()
  const { mapa } = useStatusConfig()
  const [qr, setQr] = useState<string | null>(null)
  const pronto = consulta.isSuccess && !empresa.isPending && qr !== null

  useEffect(() => {
    QRCode.toDataURL(`${window.location.origin}/producao/ordens/${id}`, { margin: 0, width: 220, color: { dark: '#2B3036FF', light: '#FFFFFFFF' } })
      .then(setQr)
      .catch(() => setQr(''))
  }, [id])

  useEffect(() => {
    if (!pronto) return
    const t = setTimeout(() => window.print(), 500)
    return () => clearTimeout(t)
  }, [pronto])

  if (consulta.isPending) return <TelaCarregando />
  if (consulta.isError) return <EstadoErro erro={consulta.error} />
  const op = consulta.data
  const e = empresa.data
  const nomeEmpresa = e?.nomeFantasia || e?.razaoSocial || 'ONPrint'
  const prazo = formatarDataSimples(op.dataFimPrevista ?? op.pedido.dataPrevistaEntrega)
  const urgente = op.prioridade === 'urgente' || op.prioridade === 'alta'

  return (
    <div className="min-h-screen bg-[#ECEFF1] py-8 font-sans text-[13px] text-[#1F2328] [print-color-adjust:exact] print:bg-white print:py-0 [-webkit-print-color-adjust:exact]">
      <style>{'@page { size: A4; margin: 12mm; }'}</style>
      <div className="mx-auto mb-4 flex max-w-[210mm] justify-end print:hidden">
        <Button onClick={() => window.print()}>
          <Printer /> Imprimir
        </Button>
      </div>

      <article className="mx-auto max-w-[210mm] overflow-hidden rounded-xl bg-white shadow-lg print:max-w-none print:rounded-none print:shadow-none">
        <div className="flex h-1.5">
          <div className="flex-[7] bg-[#2B3036]" />
          <div className="flex-[2.6] bg-[#25D366]" />
          <div className="flex-[0.4] bg-[#F97316]" />
        </div>

        <div className="space-y-6 p-8 print:p-0 print:pt-5">
          <header className="flex items-start justify-between gap-6 border-b border-[#E1E5E8] pb-5">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.25em] text-[#128C7E]">Ordem de produção · {nomeEmpresa}</p>
              <h1 className="mt-1 font-titulo text-4xl font-extrabold leading-tight text-[#2B3036]">{op.numero}</h1>
              <p className="mt-1 text-[#4A5259]">
                Pedido <strong className="text-[#1F2328]">{op.pedido.numero}</strong> · {op.pedido.cliente.nome}
              </p>
            </div>
            <div className="flex items-start gap-5">
              <div className="text-right">
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4A5259]">Entregar até</p>
                <p className={`font-titulo text-3xl font-extrabold leading-tight ${op.atrasada ? 'text-[#C8322F]' : 'text-[#2B3036]'}`}>{prazo}</p>
                <span className={`mt-1 inline-block rounded-full px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider ${urgente ? 'bg-[#C8322F] text-white' : 'bg-[#E9F9EF] text-[#128C7E]'}`}>
                  Prioridade {PRIORIDADE_ROTULOS[op.prioridade]}
                </span>
              </div>
              {qr ? <img src={qr} alt="QR da OP" className="h-[84px] w-[84px]" /> : null}
            </div>
          </header>

          <section className="grid grid-cols-[1fr_260px] gap-6">
            <div className="space-y-5">
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#4A5259]">Item</p>
                <h2 className="font-titulo text-2xl font-extrabold leading-snug text-[#2B3036]">{op.item.descricao}</h2>
              </div>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-lg bg-[#F3F5F6] p-4">
                <Dado rotulo="Quantidade">{num(op.quantidade)}</Dado>
                <Dado rotulo="Medidas">{op.largura ? `${num(op.largura)} × ${num(op.altura)} m · ${num(op.areaM2)} m²` : '—'}</Dado>
                <Dado rotulo="Máquina">{op.maquina?.nome ?? '—'}</Dado>
                <Dado rotulo="Responsável">{op.responsavel?.nome ?? '—'}</Dado>
                <Dado rotulo="Horas previstas">{num(op.horasEstimadas)} h</Dado>
                <Dado rotulo="Arte">{op.arte ? `versão ${op.arte.versao} · ${mapa.get(`arte:${op.arte.status}`)?.rotulo ?? op.arte.status}` : 'sem arte'}</Dado>
                <Dado rotulo="Acabamentos" largo>
                  {op.acabamentos.join(', ') || '—'}
                </Dado>
              </dl>
              {op.observacoes && (
                <div className="rounded-lg border-l-4 border-[#25D366] bg-[#E9F9EF] px-4 py-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#128C7E]">Observações</p>
                  <p className="mt-0.5 whitespace-pre-line">{op.observacoes}</p>
                </div>
              )}
            </div>
            <div className="flex h-[260px] items-center justify-center overflow-hidden rounded-lg border border-[#E1E5E8] bg-[#F3F5F6]">
              {op.arte?.miniaturaUrl ? <img src={op.arte.miniaturaUrl} alt="Arte" className="h-full w-full object-contain" /> : <ImageOff className="h-10 w-10 text-[#7A838A]" />}
            </div>
          </section>

          <section>
            <h3 className="mb-2 font-titulo text-base font-bold text-[#2B3036]">Etapas</h3>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-[#2B3036] text-[10px] uppercase tracking-[0.12em] text-[#2B3036]">
                  <th className="py-2 pl-2 font-semibold">Etapa</th>
                  <th className="py-2 font-semibold">Data / hora</th>
                  <th className="py-2 font-semibold">Responsável</th>
                  <th className="w-16 py-2 pr-2 text-center font-semibold">Visto</th>
                </tr>
              </thead>
              <tbody>
                {ETAPAS_PRODUCAO.filter((et) => et !== 'fila').map((et, i) => {
                  const feito = op.historico.find((h) => h.etapaPara === et)
                  return (
                    <tr key={et} className={`border-b border-[#E1E5E8] ${i % 2 ? 'bg-[#F3F5F6]' : ''}`}>
                      <td className="py-2.5 pl-2 font-semibold">
                        <span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ backgroundColor: mapa.get(`producao:${et}`)?.cor ?? '#9CA3AF' }} />
                        {mapa.get(`producao:${et}`)?.rotulo ?? et}
                      </td>
                      <td className="py-2.5">{feito ? formatarDataHora(feito.createdAt) : '____/____  ____:____'}</td>
                      <td className="py-2.5">{feito?.usuario?.nome ?? '______________________'}</td>
                      <td className="py-2.5 pr-2 text-center">
                        <span className={`inline-flex h-5 w-5 items-center justify-center rounded border-2 ${feito ? 'border-[#128C7E] bg-[#128C7E] text-white' : 'border-[#7A838A]'}`}>{feito ? '✓' : ''}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </section>

          <footer className="flex justify-between border-t border-[#E1E5E8] pt-3 text-[10px] text-[#7A838A]">
            <span>
              {nomeEmpresa}
              {e?.cnpj ? ` · CNPJ ${formatarCpfCnpj(e.cnpj)}` : ''}
            </span>
            <span>Impresso em {formatarDataHora(new Date())}</span>
          </footer>
        </div>
      </article>
    </div>
  )
}
