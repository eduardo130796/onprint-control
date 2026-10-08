import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Check } from 'lucide-react'
import {
  MODULOS,
  MODULOS_ESSENCIAIS,
  MODULO_ROTULOS,
  acaoAssinaturaSchema,
  adicionarDias,
  formatarDataSimples,
  formatarMoeda,
  hojeISO,
} from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Checkbox, Select, Textarea } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { plataformaApi } from '../api'
import { META_ACAO, useExecutarAcao, type PedidoAcao } from './acoes'

const MESES_RAPIDOS = [1, 2, 3, 6]

/** Diálogo de uma ação do suporte: pede só os campos daquela ação (motivo, data, código…). */
export function DialogoAcao({ pedido, onFechar }: { pedido: PedidoAcao; onFechar: () => void }) {
  const { tipo, empresa, cobranca } = pedido
  const meta = META_ACAO[tipo]
  const executar = useExecutarAcao()
  const planos = useQuery({ queryKey: ['plataforma', 'planos'], queryFn: plataformaApi.planos, enabled: tipo === 'plano' })
  const cupons = useQuery({ queryKey: ['plataforma', 'cupons'], queryFn: plataformaApi.cupons, enabled: tipo === 'aplicar_cupom' })
  const [data, setData] = useState(tipo === 'ativar' || tipo === 'atraso_desde' ? '' : tipo === 'cobranca_manual' ? hojeISO() : adicionarDias(hojeISO(), tipo === 'cortesia' ? 90 : 7))
  const [texto, setTexto] = useState('')
  const [motivo, setMotivo] = useState('')
  const [meses, setMeses] = useState(1)
  const [semPrazo, setSemPrazo] = useState(true)
  const [plano, setPlano] = useState(empresa.planoCodigo ?? '')
  const [modulos, setModulos] = useState<string[]>(empresa.modulosExtras ?? [])
  const [erro, setErro] = useState<string>()
  const [salvando, setSalvando] = useState(false)

  function montar(): unknown {
    switch (tipo) {
      case 'plano':
        return { acao: tipo, plano }
      case 'liberar_ate':
      case 'atraso_desde':
        return { acao: tipo, data: data || null }
      case 'teste_ate':
        return { acao: tipo, data }
      case 'ativar':
        return { acao: tipo, proximoVencimento: data || undefined }
      case 'cobranca_manual':
        return { acao: tipo, vencimento: data, valor: texto || undefined }
      case 'bloquear':
        return { acao: tipo, motivo }
      case 'modulos_extras':
        return { acao: tipo, modulos }
      case 'cortesia':
        return { acao: tipo, ate: semPrazo ? null : data, motivo }
      case 'meses_gratis':
        return { acao: tipo, meses, motivo }
      case 'abonar':
        return { acao: tipo, cobrancaId: cobranca?.id, motivo }
      case 'aplicar_cupom':
        return { acao: tipo, codigo: texto }
      default:
        return { acao: tipo }
    }
  }

  async function confirmar(e: React.FormEvent) {
    e.preventDefault()
    const r = acaoAssinaturaSchema.safeParse(montar())
    if (!r.success) return setErro(r.error.issues[0]?.message)
    setErro(undefined)
    setSalvando(true)
    const ok = await executar(empresa.id, r.data)
    setSalvando(false)
    if (ok) onFechar()
  }

  const campoMotivo = (rotulo = 'Motivo *', dica?: string) => (
    <CampoFormulario id="ac-motivo" rotulo={rotulo}>
      <Textarea id="ac-motivo" rows={2} autoFocus value={motivo} placeholder={dica} onChange={(e) => setMotivo(e.target.value)} />
    </CampoFormulario>
  )
  const disponiveis = cupons.data?.filter((c) => c.ativo && (!c.validoAte || c.validoAte >= hojeISO()) && (c.limiteUsos == null || c.usos < c.limiteUsos) && (c.planos.length === 0 || !empresa.planoCodigo || c.planos.includes(empresa.planoCodigo)))

  return (
    <FormDialog
      aberto
      onAbertoChange={(x) => !x && onFechar()}
      titulo={`${meta.rotulo} · ${empresa.nome}`}
      descricao={meta.ajuda}
      salvando={salvando}
      textoSalvar={meta.confirmar ?? 'Confirmar'}
      onSubmit={confirmar}
    >
      {erro && <p className="rounded-lg bg-coral/10 p-2 text-sm text-coral-escuro">{erro}</p>}

      {tipo === 'plano' && (
        <CampoFormulario id="ac-plano" rotulo="Plano">
          <Select id="ac-plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
            {planos.data
              ?.filter((p) => p.ativo)
              .map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nome} · {formatarMoeda(p.valorMensal)}/mês
                </option>
              ))}
          </Select>
        </CampoFormulario>
      )}

      {['liberar_ate', 'atraso_desde', 'teste_ate', 'ativar', 'cobranca_manual'].includes(tipo) && (
        <CampoFormulario id="ac-data" rotulo={tipo === 'ativar' ? 'Próximo vencimento (opcional)' : tipo === 'cobranca_manual' ? 'Vencimento' : 'Data'}>
          <Input id="ac-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
        </CampoFormulario>
      )}
      {tipo === 'liberar_ate' && (
        <div className="flex flex-wrap gap-2">
          {[3, 7, 15, 30].map((d) => (
            <button key={d} type="button" onClick={() => setData(adicionarDias(hojeISO(), d))} className={cn('rounded-full px-3 py-1 text-xs font-semibold ring-1', data === adicionarDias(hojeISO(), d) ? 'bg-grafite text-white ring-grafite' : 'bg-card text-grafite ring-border hover:bg-fundo')}>
              +{d} dias
            </button>
          ))}
        </div>
      )}
      {tipo === 'cobranca_manual' && (
        <CampoFormulario id="ac-valor" rotulo="Valor (vazio = mensalidade do plano)">
          <Input id="ac-valor" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </CampoFormulario>
      )}
      {tipo === 'bloquear' && campoMotivo('Motivo *', 'Ex.: pedido do cliente, uso indevido…')}

      {tipo === 'modulos_extras' && (
        <div className="grid gap-2 sm:grid-cols-2">
          {MODULOS.filter((m) => !MODULOS_ESSENCIAIS.includes(m)).map((m) => (
            <label key={m} className="flex items-center gap-2 text-sm">
              <Checkbox checked={modulos.includes(m)} onChange={(e) => setModulos((l) => (e.target.checked ? [...l, m] : l.filter((x) => x !== m)))} />
              {MODULO_ROTULOS[m]}
            </label>
          ))}
        </div>
      )}

      {tipo === 'cortesia' && (
        <>
          <fieldset className="grid gap-2 sm:grid-cols-2">
            <legend className="sr-only">Prazo da cortesia</legend>
            {[
              [true, 'Sem prazo', 'Até encerrar manualmente'],
              [false, 'Até uma data', 'Depois volta a cobrar'],
            ].map(([valor, titulo, sub]) => (
              <label key={String(valor)} className={cn('flex cursor-pointer items-start gap-2 rounded-xl p-3 text-sm ring-1', semPrazo === valor ? 'bg-violet-50 ring-violet-400' : 'ring-border hover:bg-fundo')}>
                <input type="radio" name="prazo" className="mt-0.5 accent-violet-600" checked={semPrazo === valor} onChange={() => setSemPrazo(valor as boolean)} />
                <span>
                  <span className="block font-semibold text-grafite">{titulo as string}</span>
                  <span className="block text-xs text-texto-secundario">{sub as string}</span>
                </span>
              </label>
            ))}
          </fieldset>
          {!semPrazo && (
            <CampoFormulario id="ac-ate" rotulo="Cortesia até">
              <Input id="ac-ate" type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </CampoFormulario>
          )}
          {campoMotivo('Motivo *', 'Ex.: parceiro, permuta, conta de demonstração…')}
        </>
      )}

      {tipo === 'meses_gratis' && (
        <>
          <div className="space-y-2">
            <p className="text-sm font-medium">Quantos meses</p>
            <div className="flex flex-wrap items-center gap-2">
              {MESES_RAPIDOS.map((m) => (
                <button key={m} type="button" onClick={() => setMeses(m)} className={cn('h-10 min-w-12 rounded-xl px-3 text-sm font-bold ring-1', meses === m ? 'bg-grafite text-white ring-grafite' : 'bg-card text-grafite ring-border hover:bg-fundo')}>
                  {m}
                </button>
              ))}
              <Input aria-label="Outro número de meses" className="w-24" type="number" min={1} max={12} value={meses} onChange={(e) => setMeses(Number(e.target.value))} />
            </div>
          </div>
          {campoMotivo('Motivo *', 'Ex.: compensação por instabilidade, indicação…')}
        </>
      )}

      {tipo === 'abonar' && cobranca && (
        <>
          <div className="flex items-center justify-between rounded-xl bg-fundo p-3 text-sm ring-1 ring-border">
            <span>Vencimento {formatarDataSimples(cobranca.vencimento)}</span>
            <strong className="text-grafite">{formatarMoeda(cobranca.valor)}</strong>
          </div>
          {campoMotivo()}
        </>
      )}

      {tipo === 'aplicar_cupom' && (
        <>
          <CampoFormulario id="ac-cupom" rotulo="Código do cupom *">
            <Input id="ac-cupom" autoFocus className="font-mono uppercase" value={texto} onChange={(e) => setTexto(e.target.value.toUpperCase())} />
          </CampoFormulario>
          {disponiveis && disponiveis.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-texto-secundario">Cupons disponíveis</p>
              <ul className="grid gap-2">
                {disponiveis.map((c) => (
                  <li key={c.id}>
                    <button type="button" onClick={() => setTexto(c.codigo)} className={cn('flex w-full items-center gap-3 rounded-xl p-3 text-left text-sm ring-1', texto === c.codigo ? 'bg-laranja-suave ring-laranja' : 'ring-border hover:bg-fundo')}>
                      <span className="font-mono font-bold text-grafite">{c.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-texto-secundario">{c.resumo}</span>
                      {texto === c.codigo && <Check className="h-4 w-4 text-laranja-escuro" aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      {['desbloquear', 'cancelar', 'reativar', 'registrar_pagamento', 'encerrar_cortesia', 'remover_cupom'].includes(tipo) && (
        <p className={cn('rounded-xl p-3 text-sm', meta.perigo ? 'bg-coral/10 text-coral-escuro' : 'bg-fundo text-grafite')}>Confirma esta ação em {empresa.nome}? Ela fica registrada no histórico com o seu e-mail.</p>
      )}
    </FormDialog>
  )
}
