import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import {
  PRIORIDADES,
  PRIORIDADE_ROTULOS,
  TIPOS_ENTREGA,
  TIPO_ENTREGA_ROTULOS,
  adicionarDiasUteis,
  formatarDataSimples,
  formatarMoeda,
  gerarParcelas,
  hojeISO,
  normalizarDecimal,
  resumoCondicoesPagamento,
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
import { decimalParaCampo } from '@/lib/mascaras'

/** Condições do pedido: sinal + parcelas (com prévia das contas a receber), entrega e prioridade. */
export function ConverterDialog({ orcamento, onFechar }: { orcamento: OrcamentoDetalhe; onFechar: () => void }) {
  // Pagamento: o combinado no orçamento (o que a mensagem, o PDF e a página de aprovação mostraram);
  // entrega e prioridade: os padrões da empresa (Configurações → Empresa → Pedidos)
  const { data: padrao } = useEmpresa()
  const combinado = { sinal: decimalParaCampo(orcamento.sinalPercentual, 2), parcelas: String(orcamento.parcelas), intervalo: String(orcamento.intervaloDias) }
  const [sinal, setSinal] = useState(combinado.sinal)
  const [parcelas, setParcelas] = useState(combinado.parcelas)
  const [intervalo, setIntervalo] = useState(combinado.intervalo)
  const mudouPagamento =
    Number(normalizarDecimal(sinal || '0')) !== Number(orcamento.sinalPercentual) || (Number(parcelas) || 0) !== orcamento.parcelas || (Number(intervalo) || 0) !== orcamento.intervaloDias
  const [primeiro, setPrimeiro] = useState('')
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntrega>(() => padrao?.tipoEntregaPadrao ?? 'retirada')
  const [prioridade, setPrioridade] = useState<Prioridade>(() => padrao?.prioridadePadrao ?? 'normal')
  const converter = useMutacao(['orcamentos', 'clientes', 'pedidos', 'financeiro'], (d: unknown) => orcamentosApi.converter(orcamento.id, d))

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
      // 0 parcelas: o restante vence na previsão de entrega (como na conversão)
      vencimentoNaEntrega: adicionarDiasUteis(hojeISO(), orcamento.prazoDias),
    })
  }, [sinal, parcelas, intervalo, primeiro, orcamento.total, orcamento.prazoDias])

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
        <CampoFormulario id="cv-sinal" rotulo="Entrada">
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
      {mudouPagamento && (
        <p className="rounded-xl bg-ambar/15 p-3 text-sm text-amber-900 dark:text-amber-200">
          Diferente do pagamento combinado no orçamento ({resumoCondicoesPagamento({ total: orcamento.total, sinalPercentual: orcamento.sinalPercentual, parcelas: orcamento.parcelas, intervaloDias: orcamento.intervaloDias })}
          ). Avise o cliente.{' '}
          <button
            type="button"
            className="font-medium underline"
            onClick={() => {
              setSinal(combinado.sinal)
              setParcelas(combinado.parcelas)
              setIntervalo(combinado.intervalo)
            }}
          >
            Voltar ao combinado
          </button>
        </p>
      )}
      {tipoEntrega !== 'retirada' && <p className="text-xs text-texto-secundario">Será usado o endereço principal do cliente (cadastre-o na ficha, se ainda não houver).</p>}

      <div className="rounded-2xl bg-fundo p-4">
        <p className="mb-2 text-sm font-medium text-tinta">Contas a receber que serão geradas</p>
        {previa.length === 0 ? (
          <p className="text-sm text-coral-escuro">A entrada deve estar entre 0 e 100%.</p>
        ) : (
          <ul className="space-y-1 text-sm">
            {previa.map((p) => (
              <li key={p.parcela} className="flex justify-between">
                <span>
                  {p.tipo === 'sinal' ? 'Entrada (hoje)' : (Number(parcelas) || 0) === 0 ? 'Restante (na entrega)' : `Parcela ${p.parcela}/${p.totalParcelas}`} · vence{' '}
                  {formatarDataSimples(p.vencimento)}
                </span>
                <span className="font-medium">{formatarMoeda(p.valor)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </FormDialog>
  )
}
