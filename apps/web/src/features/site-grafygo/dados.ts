import { useEffect, useState } from 'react'
import type { CicloAssinatura } from '@onprint/shared'

/** GET /plataforma/planos-publicos: o que a página de venda mostra (preços editáveis no painel da plataforma) */
export interface PlanoPublico {
  codigo: string
  nome: string
  descricao: string | null
  valorMensal: string
  valorAnual: string | null
  limiteUsuarios: number | null
  diasTeste: number
  modulos: string[]
}

export interface PlanosPublicos {
  cadastroAberto: boolean
  planoPadrao: string
  /** Endereço do sistema (APP_URL): "Testar grátis" e "Entrar" vão para lá */
  urlSistema: string
  /** Contato do suporte (WhatsApp ou e-mail), se configurado */
  suporte: string
  pagamentoOnline: boolean
  planos: PlanoPublico[]
}

/** Sem a resposta da API ainda: o sistema fica em app.{domínio} (em desenvolvimento, localhost:5173) */
export function urlSistemaPadrao(host = window.location.host): string {
  const h = host.replace(/^www\./, '')
  if (h.startsWith('localhost')) return `${window.location.protocol}//${h}`
  return `https://app.${h}`
}

export function usePlanosPublicos() {
  const [dados, setDados] = useState<PlanosPublicos | null>(null)
  const [erro, setErro] = useState(false)
  useEffect(() => {
    let ativo = true
    fetch('/api/v1/plataforma/planos-publicos')
      .then((r) => (r.ok ? (r.json() as Promise<PlanosPublicos>) : Promise.reject(new Error(String(r.status)))))
      .then((d) => ativo && setDados(d))
      .catch(() => ativo && setErro(true))
    return () => {
      ativo = false
    }
  }, [])
  return { dados, erro }
}

/** Base do sistema, sem barra no fim */
export const baseSistema = (d: PlanosPublicos | null) => (d?.urlSistema || urlSistemaPadrao()).replace(/\/+$/, '')

/** "Testar grátis": cadastro já com o plano, o ciclo e o cupom de divulgação (?cupom= na página de venda) */
export function linkCadastro(d: PlanosPublicos | null, o: { plano?: string; ciclo?: CicloAssinatura; cupom?: string | null } = {}): string {
  const q = new URLSearchParams()
  if (o.plano) q.set('plano', o.plano)
  if (o.ciclo === 'anual') q.set('ciclo', 'anual')
  if (o.cupom) q.set('cupom', o.cupom)
  const s = q.toString()
  return `${baseSistema(d)}/criar-conta${s ? `?${s}` : ''}`
}

/** wa.me do suporte quando o contato é um telefone; senão null */
export function whatsappSuporte(suporte: string | undefined, texto: string): string | null {
  const digitos = (suporte ?? '').replace(/\D/g, '')
  if (digitos.length < 10 || digitos.length > 13 || /@/.test(suporte ?? '')) return null
  const numero = digitos.length <= 11 ? `55${digitos}` : digitos
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`
}
