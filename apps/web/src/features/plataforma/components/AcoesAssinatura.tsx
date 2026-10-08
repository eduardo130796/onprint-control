import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { MODULOS, MODULOS_ESSENCIAIS, MODULO_ROTULOS, adicionarDias, hojeISO, type AcaoAssinatura, type EmpresaPlataformaDetalhe } from '@onprint/shared'
import { CampoFormulario } from '@/components/shared/CampoFormulario'
import { FormDialog } from '@/components/shared/FormDialog'
import { Button } from '@/components/ui/button'
import { Checkbox, Select } from '@/components/ui/form-controls'
import { Input } from '@/components/ui/input'
import { plataformaApi } from '../api'

type Tipo = AcaoAssinatura['acao']

const ACOES: { tipo: Tipo; rotulo: string; perigo?: boolean; ajuda: string }[] = [
  { tipo: 'plano', rotulo: 'Trocar plano', ajuda: 'Os módulos mudam na hora; se a empresa assina pelo Asaas, o valor da recorrência também muda.' },
  { tipo: 'liberar_ate', rotulo: 'Liberar até…', ajuda: 'Acesso normal até a data, mesmo com atraso (promessa de pagamento, problema no banco…).' },
  { tipo: 'teste_ate', rotulo: 'Estender teste', ajuda: 'Volta (ou mantém) a empresa em teste grátis até a data.' },
  { tipo: 'ativar', rotulo: 'Marcar como ativa e em dia', ajuda: 'Pagamento combinado fora do sistema: sai do teste e limpa o atraso.' },
  { tipo: 'atraso_desde', rotulo: 'Atraso desde…', ajuda: 'Só para empresas sem cobranças registradas (com cobranças, o atraso vem delas).' },
  { tipo: 'cobranca_manual', rotulo: 'Lançar cobrança manual', ajuda: 'Modo manual: a cobrança entra em aberto e conta para o atraso.' },
  { tipo: 'registrar_pagamento', rotulo: 'Registrar pagamento', ajuda: 'Marca como paga a cobrança em aberto mais antiga (modo manual).' },
  { tipo: 'modulos_extras', rotulo: 'Módulos extras', ajuda: 'Módulos liberados além dos do plano.' },
  { tipo: 'bloquear', rotulo: 'Bloquear', perigo: true, ajuda: 'Suspende o acesso até desbloquear, mesmo em dia.' },
  { tipo: 'desbloquear', rotulo: 'Desbloquear', ajuda: 'Remove o bloqueio manual.' },
  { tipo: 'cancelar', rotulo: 'Cancelar assinatura', perigo: true, ajuda: 'Vale na hora: cancela a recorrência no Asaas e bloqueia o acesso. Os dados ficam guardados.' },
  { tipo: 'reativar', rotulo: 'Reativar', ajuda: 'Desfaz o cancelamento (sem criar cobrança).' },
]

/** Ações do suporte na assinatura de uma empresa (todas ficam no histórico com o seu e-mail). */
export function AcoesAssinatura({ empresa }: { empresa: EmpresaPlataformaDetalhe }) {
  const queryClient = useQueryClient()
  const planos = useQuery({ queryKey: ['plataforma', 'planos'], queryFn: plataformaApi.planos })
  const a = empresa.assinatura
  const [tipo, setTipo] = useState<Tipo | null>(null)
  const [dataCampo, setDataCampo] = useState(adicionarDias(hojeISO(), 7))
  const [texto, setTexto] = useState('')
  const [plano, setPlano] = useState(a?.planoCodigo ?? '')
  const [modulos, setModulos] = useState<string[]>(a?.modulosExtras ?? [])
  const [salvando, setSalvando] = useState(false)
  if (!a) return null

  const visiveis = ACOES.filter((x) => (x.tipo === 'desbloquear' ? a.bloqueioManual : x.tipo === 'bloquear' ? !a.bloqueioManual : x.tipo === 'reativar' ? empresa.situacao === 'cancelada' : x.tipo === 'cancelar' ? empresa.situacao !== 'cancelada' : true))
  const atual = ACOES.find((x) => x.tipo === tipo)

  function montar(): AcaoAssinatura {
    switch (tipo) {
      case 'plano':
        return { acao: 'plano', plano }
      case 'liberar_ate':
      case 'atraso_desde':
        return { acao: tipo, data: dataCampo || null }
      case 'teste_ate':
        return { acao: 'teste_ate', data: dataCampo }
      case 'ativar':
        return { acao: 'ativar', proximoVencimento: dataCampo || undefined }
      case 'cobranca_manual':
        return { acao: 'cobranca_manual', vencimento: dataCampo, valor: texto || undefined }
      case 'bloquear':
        return { acao: 'bloquear', motivo: texto }
      case 'modulos_extras':
        return { acao: 'modulos_extras', modulos: modulos as never }
      default:
        return { acao: tipo as 'desbloquear' }
    }
  }

  async function executar(e: React.FormEvent) {
    e.preventDefault()
    setSalvando(true)
    try {
      await plataformaApi.acao(empresa.id, montar())
      toast.success(`${atual?.rotulo}: feito.`)
      await queryClient.invalidateQueries({ queryKey: ['plataforma'] })
      setTipo(null)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSalvando(false)
    }
  }

  const comData = ['liberar_ate', 'atraso_desde', 'teste_ate', 'ativar', 'cobranca_manual'].includes(tipo ?? '')
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {visiveis.map((x) => (
          <Button key={x.tipo} size="sm" variant={x.perigo ? 'ghost' : 'outline'} className={x.perigo ? 'text-coral-escuro hover:text-coral-escuro' : undefined} onClick={() => setTipo(x.tipo)}>
            {x.rotulo}
          </Button>
        ))}
      </div>
      {atual && (
        <FormDialog aberto onAbertoChange={(x) => !x && setTipo(null)} titulo={atual.rotulo} descricao={atual.ajuda} salvando={salvando} textoSalvar="Confirmar" onSubmit={executar}>
          {tipo === 'plano' && (
            <CampoFormulario id="ac-plano" rotulo="Plano">
              <Select id="ac-plano" value={plano} onChange={(e) => setPlano(e.target.value)}>
                {planos.data
                  ?.filter((p) => p.ativo)
                  .map((p) => (
                    <option key={p.codigo} value={p.codigo}>
                      {p.nome}
                    </option>
                  ))}
              </Select>
            </CampoFormulario>
          )}
          {comData && (
            <CampoFormulario id="ac-data" rotulo={tipo === 'ativar' ? 'Próximo vencimento (opcional)' : tipo === 'cobranca_manual' ? 'Vencimento' : 'Data'}>
              <Input id="ac-data" type="date" value={dataCampo} onChange={(e) => setDataCampo(e.target.value)} />
            </CampoFormulario>
          )}
          {(tipo === 'liberar_ate' || tipo === 'atraso_desde') && <p className="text-xs text-texto-secundario">Deixe a data vazia para remover.</p>}
          {tipo === 'cobranca_manual' && (
            <CampoFormulario id="ac-valor" rotulo="Valor (vazio = mensalidade do plano)">
              <Input id="ac-valor" inputMode="decimal" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </CampoFormulario>
          )}
          {tipo === 'bloquear' && (
            <CampoFormulario id="ac-motivo" rotulo="Motivo *">
              <Input id="ac-motivo" value={texto} onChange={(e) => setTexto(e.target.value)} />
            </CampoFormulario>
          )}
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
        </FormDialog>
      )}
    </>
  )
}
