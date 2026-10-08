import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { AcaoAssinatura, CupomPlataforma, EmpresaPlataformaDetalhe } from '@onprint/shared'
import { plataformaApi } from '../api'
import { paraEntrada } from './regras'

export type TipoAcao = AcaoAssinatura['acao']

/** O que o diálogo precisa saber da empresa (vem da tabela ou da ficha). */
export interface PedidoAcao {
  tipo: TipoAcao
  empresa: { id: string; nome: string; planoCodigo?: string | null; modulosExtras?: string[] }
  /** Abonar: a cobrança escolhida */
  cobranca?: { id: string; vencimento: string; valor: string }
}

export const META_ACAO: Record<TipoAcao, { rotulo: string; ajuda: string; perigo?: boolean; confirmar?: string }> = {
  plano: { rotulo: 'Trocar plano', ajuda: 'Os módulos mudam na hora; se a empresa assina pelo Asaas, o valor da recorrência também muda.' },
  liberar_ate: { rotulo: 'Liberar até…', ajuda: 'Acesso normal até a data, mesmo com atraso (promessa de pagamento, problema no banco…). Vazio remove a liberação.' },
  teste_ate: { rotulo: 'Estender teste', ajuda: 'Volta (ou mantém) a empresa em teste grátis até a data.' },
  ativar: { rotulo: 'Marcar como ativa e em dia', ajuda: 'Pagamento combinado fora do sistema: sai do teste e limpa o atraso.' },
  atraso_desde: { rotulo: 'Atraso desde…', ajuda: 'Só para empresas sem cobranças registradas (com cobranças, o atraso vem delas). Vazio quita o atraso.' },
  cobranca_manual: { rotulo: 'Lançar cobrança manual', ajuda: 'A cobrança entra em aberto e conta para o atraso.' },
  registrar_pagamento: { rotulo: 'Registrar pagamento', ajuda: 'Marca como paga a cobrança em aberto mais antiga (pagamento recebido fora do sistema).', confirmar: 'Registrar' },
  modulos_extras: { rotulo: 'Módulos extras', ajuda: 'Módulos liberados além dos do plano.' },
  bloquear: { rotulo: 'Bloquear acesso', ajuda: 'Suspende o acesso até desbloquear, mesmo em dia.', perigo: true, confirmar: 'Bloquear' },
  desbloquear: { rotulo: 'Desbloquear', ajuda: 'Remove o bloqueio manual; o acesso volta a seguir a situação da assinatura.', confirmar: 'Desbloquear' },
  cancelar: { rotulo: 'Cancelar assinatura', ajuda: 'Vale na hora: cancela a recorrência no Asaas e bloqueia o acesso. Os dados ficam guardados.', perigo: true, confirmar: 'Cancelar assinatura' },
  reativar: { rotulo: 'Reativar', ajuda: 'Desfaz o cancelamento (sem criar cobrança).', confirmar: 'Reativar' },
  cortesia: { rotulo: 'Dar cortesia', ajuda: 'Acesso completo sem mensalidade (parceiro, permuta, conta interna). A recorrência no Asaas fica pausada.', confirmar: 'Dar cortesia' },
  encerrar_cortesia: { rotulo: 'Encerrar cortesia', ajuda: 'A empresa volta a pagar: a próxima mensalidade é gerada normalmente.', perigo: true, confirmar: 'Encerrar cortesia' },
  meses_gratis: { rotulo: 'Dar meses grátis', ajuda: 'As próximas mensalidades ficam abonadas e o vencimento seguinte é empurrado. Fica no histórico com o motivo.', confirmar: 'Dar meses grátis' },
  abonar: { rotulo: 'Abonar cobrança', ajuda: 'Perdoa esta cobrança: ela sai do atraso e é cancelada no Asaas. O motivo aparece no histórico.', confirmar: 'Abonar' },
  aplicar_cupom: { rotulo: 'Aplicar cupom', ajuda: 'O desconto vale a partir da próxima mensalidade, pelo prazo do cupom. Substitui o cupom atual, se houver.', confirmar: 'Aplicar cupom' },
  remover_cupom: { rotulo: 'Remover cupom', ajuda: 'O desconto deixa de valer a partir da próxima mensalidade em aberto.', perigo: true, confirmar: 'Remover cupom' },
}

/** Executa uma ação do suporte e atualiza a ficha e as listas. */
export function useExecutarAcao() {
  const queryClient = useQueryClient()
  return async (empresaId: string, acao: AcaoAssinatura) => {
    try {
      const detalhe: EmpresaPlataformaDetalhe = await plataformaApi.acao(empresaId, acao)
      queryClient.setQueryData(['plataforma', 'empresa', empresaId], detalhe)
      toast.success(`${META_ACAO[acao.acao].rotulo}: feito.`)
      await queryClient.invalidateQueries({ queryKey: ['plataforma'] })
      return true
    } catch (e) {
      toast.error((e as Error).message)
      return false
    }
  }
}

/** Pausar ou reativar um cupom (PUT com ativo trocado). */
export function useAlternarCupom() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (c: CupomPlataforma) => plataformaApi.salvarCupom(c.id, paraEntrada(c, { ativo: !c.ativo })),
    onSuccess: (_r, c) => {
      toast.success(c.ativo ? `Cupom ${c.codigo} pausado.` : `Cupom ${c.codigo} reativado.`)
      void queryClient.invalidateQueries({ queryKey: ['plataforma'] })
    },
    onError: (e) => toast.error((e as Error).message),
  })
}
