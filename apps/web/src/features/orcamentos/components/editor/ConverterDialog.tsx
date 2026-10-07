import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  PRIORIDADES,
  PRIORIDADE_ROTULOS,
  TIPOS_ENTREGA,
  TIPO_ENTREGA_ROTULOS,
  formatarDataSimples,
  formatarMoeda,
  gerarParcelas,
  hojeISO,
  normalizarDecimal,
  type OrcamentoDetalhe,
  type Prioridade,
  type TipoEntrega,
} from '@onprint/shared'
import { orcamentosApi } from '@/api/comercial'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { NumberInput } from '@/components/shared/inputs'
import { Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { useEmpresa } from '@/features/configuracoes/hooks'
import { useMutacao } from '@/hooks/useMutacao'
import { decimalParaInput } from '@/lib/mascaras'

/** Condições do pedido: sinal + parcelas (com prévia das contas a receber), entrega e prioridade. */
export function ConverterDialog({ orcamento, onFechar }: { orcamento: OrcamentoDetalhe; onFechar: () => void }) {
  const empresa = useEmpresa()
  const [sinal, setSinal] = useState(() => decimalParaInput(empresa.data?.sinalPercentual ?? 50))
  const [parcelas, setParcelas] = useState('1')
  const [intervalo, setIntervalo] = useState('30')
  const [primeiro, setPrimeiro] = useState('')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>('retirada')
  const [prioridade, setPrioridade] = useState<Prioridade>('normal')
  const converter = useMutacao(['orcamentos', 'clientes'], (d: unknown) => orcamentosApi.converter(orcamento.id, d))

  const previa = useMemo(() => {
    const s = Number(normalizarDecimal(sinal || '0'))
    if (Number.isNaN(s) || s < 0 || s > 100) return []
    return gerarParcelas({
      total: orcamento.total,
      sinalPercentual: normalizarDecimal(sinal || '0'),
      parcelas: Number(parcelas) || 0,
      intervaloDias: Number(intervalo) || 30,
      hoje: hojeISO(),
      primeiroVencimento: primeiro || null,
    })
  }, [sinal, parcelas, intervalo, primeiro, orcamento.total])

  return (
    <FormDialog
      aberto
      onAbertoChange={(v) => !v && onFechar()}
      titulo={`Converter ${orcamento.numero} em pedido`}
      descricao="Gera o pedido, as contas a receber, a comissão prevista e as artes de cada item."
      textoSalvar="Criar pedido"
      salvando={converter.isPending}
      largo
      onSubmit={async (e) => {
        e.preventDefault()
        try {
          const r = await converter.mutateAsync({ sinalPercentual: sinal, parcelas, intervaloDias: intervalo, primeiroVencimento: primeiro, tipoEntrega, prioridade })
          toast.success(`Pedido ${r.pedido?.numero} criado.`)
          onFechar()
        } catch (err) {
          toast.error((err as Error).message)
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-4">
        <CampoFormulario id="cv-sinal" rotulo="Sinal">
          <NumberInput id="cv-sinal" sufixo="%" value={sinal} onChange={(e) => setSinal(e.target.value)} />
        </CampoFormulario>
        <CampoFormulario id="cv-parcelas" rotulo="Parcelas do saldo">
          <NumberInput id="cv-parcelas" casas={0} value={parcelas} onChange={(e) => setParcelas(e.target.value)} />
        </CampoFormulario>
        <CampoFormulario id="cv-intervalo" rotulo="A cada">
          <NumberInput id="cv-intervalo" casas={0} sufixo="dias" value={intervalo} onChange={(e) => setIntervalo(e.target.value)} />
        </CampoFormulario>
        <CampoFormulario id="cv-primeiro" rotulo="1º vencimento">
          <Input id="cv-primeiro" type="date" value={primeiro} onChange={(e) => setPrimeiro(e.target.value)} />
        </CampoFormulario>
        <div className="sm:col-span-2">
          <CampoFormulario id="cv-entrega" rotulo="Entrega">
            <Select id="cv-entrega" value={tipoEntrega} onChange={(e) => setTipoEntrega(e.target.value as TipoEntrega)}>
              {TIPOS_ENTREGA.map((t) => (
                <option key={t} value={t}>
                  {TIPO_ENTREGA_ROTULOS[t]}
                </option>
              ))}
            </Select>
          </CampoFormulario>
        </div>
        <div className="sm:col-span-2">
          <CampoFormulario id="cv-prioridade" rotulo="Prioridade">
            <Select id="cv-prioridade" value={prioridade} onChange={(e) => setPrioridade(e.target.value as Prioridade)}>
              {PRIORIDADES.map((p) => (
                <option key={p} value={p}>
                  {PRIORIDADE_ROTULOS[p]}
                </option>
              ))}
            </Select>
          </CampoFormulario>
        </div>
      </div>
      {tipoEntrega !== 'retirada' && <p className="text-xs text-texto-secundario">Será usado o endereço principal do cliente (cadastre-o na ficha, se ainda não houver).</p>}

      <div className="rounded-2xl bg-fundo p-4">
        <p className="mb-2 text-sm font-medium text-grafite">Contas a receber que serão geradas</p>
        {previa.length === 0 ? (
          <p className="text-sm text-coral-escuro">Sinal deve estar entre 0 e 100%.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {previa.map((p) => (
              <li key={p.parcela} className="flex justify-between">
                <span>{p.tipo === 'sinal' ? 'Sinal (hoje)' : `Parcela ${p.parcela}/${p.totalParcelas}`} · vence {formatarDataSimples(p.vencimento)}</span>
                <span className="font-medium">{formatarMoeda(p.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormDialog>
  )
}
