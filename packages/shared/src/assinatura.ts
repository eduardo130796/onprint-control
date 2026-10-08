import { ACOES, MODULOS, type Acao, type Modulo } from './enums'

/** Módulos que toda empresa tem, em qualquer plano (sem eles não dá para usar nem administrar o sistema). */
export const MODULOS_ESSENCIAIS: readonly Modulo[] = ['dashboard', 'configuracoes', 'usuarios', 'permissoes']

export const SITUACOES_ASSINATURA = ['teste', 'ativa', 'cancelada'] as const
export type SituacaoAssinatura = (typeof SITUACOES_ASSINATURA)[number]
export const SITUACAO_ASSINATURA_ROTULOS: Record<SituacaoAssinatura, string> = { teste: 'Teste grátis', ativa: 'Ativa', cancelada: 'Cancelada' }

/** Do mais livre ao mais restrito. */
export const NIVEIS_ACESSO = ['normal', 'aviso', 'somente_leitura', 'bloqueado'] as const
export type NivelAcesso = (typeof NIVEIS_ACESSO)[number]
export const NIVEL_ACESSO_ROTULOS: Record<NivelAcesso, string> = { normal: 'Normal', aviso: 'Com aviso', somente_leitura: 'Só leitura', bloqueado: 'Bloqueado' }

export type MotivoAcesso = 'em_dia' | 'teste' | 'teste_acabando' | 'teste_expirado' | 'atraso' | 'liberacao_manual' | 'bloqueio_manual' | 'cancelada'

/** Ações que continuam valendo no modo só leitura (consultar e exportar). */
export const ACOES_LEITURA: readonly Acao[] = ['visualizar', 'exportar', 'ver_todos']

/** No teste grátis, o aviso aparece nos últimos dias. */
export const DIAS_AVISO_FIM_TESTE = 3

export interface DadosAcesso {
  situacao: SituacaoAssinatura
  /** Datas em AAAA-MM-DD (dia no fuso de São Paulo) */
  testeAte?: string | null
  /** Vencimento da cobrança mais antiga ainda não paga */
  atrasoDesde?: string | null
  /** Liberação manual: acesso normal até esta data, mesmo com atraso */
  liberadoAte?: string | null
  bloqueioManual?: boolean
  diasAteSomenteLeitura: number
  diasAteBloqueio: number
}

export interface AcessoAssinatura {
  nivel: NivelAcesso
  motivo: MotivoAcesso
  /** Dias desde o vencimento (0 sem atraso) */
  diasAtraso: number
  /** Teste grátis em andamento: dias que faltam (0 = último dia) */
  diasRestantesTeste: number | null
  /** Com atraso: dias até cada próximo degrau (null se já passou ou não se aplica) */
  diasParaSomenteLeitura: number | null
  diasParaBloqueio: number | null
  mensagem: string
}

/** Dias entre duas datas AAAA-MM-DD (b − a). */
export function diasEntre(a: string, b: string): number {
  return Math.round((Date.parse(`${b.slice(0, 10)}T12:00:00Z`) - Date.parse(`${a.slice(0, 10)}T12:00:00Z`)) / 86_400_000)
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`
const dias = (n: number) => plural(n, 'dia', 'dias')

function mensagem(a: Omit<AcessoAssinatura, 'mensagem'>): string {
  switch (a.motivo) {
    case 'bloqueio_manual':
      return 'O acesso desta empresa está suspenso. Fale com o suporte.'
    case 'cancelada':
      return 'A assinatura foi cancelada. Para voltar a usar o sistema, reative a assinatura.'
    case 'liberacao_manual':
      return 'Acesso liberado temporariamente pelo suporte.'
    case 'em_dia':
      return 'Assinatura em dia.'
    case 'teste':
      return `Teste grátis: ${a.diasRestantesTeste === 0 ? 'hoje é o último dia' : `faltam ${dias(a.diasRestantesTeste ?? 0)}`}.`
    case 'teste_acabando':
      return `O teste grátis termina ${a.diasRestantesTeste === 0 ? 'hoje' : `em ${dias(a.diasRestantesTeste ?? 0)}`}. Assine para continuar usando sem interrupção.`
  }
  const inicio = a.motivo === 'teste_expirado' ? `O teste grátis terminou há ${dias(a.diasAtraso)}` : `A mensalidade está vencida há ${dias(a.diasAtraso)}`
  if (a.nivel === 'bloqueado') return `${inicio}. O sistema está bloqueado até o pagamento.`
  if (a.nivel === 'somente_leitura') return `${inicio}. O sistema está só para consulta; em ${dias(a.diasParaBloqueio ?? 0)} ele será bloqueado.`
  return `${inicio}. Em ${dias(a.diasParaSomenteLeitura ?? 0)} o sistema fica só para consulta.`
}

/**
 * Nível de acesso da empresa hoje. Ordem das regras: bloqueio manual → cancelada → liberação manual →
 * teste grátis → atraso. O atraso conta do vencimento (ou do fim do teste): até `diasAteSomenteLeitura`
 * só aviso; até `diasAteBloqueio` só leitura; depois, bloqueio total.
 */
export function calcularAcesso(d: DadosAcesso, hoje: string): AcessoAssinatura {
  const base = { diasAtraso: 0, diasRestantesTeste: null, diasParaSomenteLeitura: null, diasParaBloqueio: null }
  const montar = (a: Omit<AcessoAssinatura, 'mensagem'>): AcessoAssinatura => ({ ...a, mensagem: mensagem(a) })

  if (d.bloqueioManual) return montar({ ...base, nivel: 'bloqueado', motivo: 'bloqueio_manual' })
  if (d.situacao === 'cancelada') return montar({ ...base, nivel: 'bloqueado', motivo: 'cancelada' })
  if (d.liberadoAte && diasEntre(hoje, d.liberadoAte) >= 0) return montar({ ...base, nivel: 'normal', motivo: 'liberacao_manual' })

  let vencimento: string | null = null
  let motivo: MotivoAcesso = 'atraso'
  if (d.situacao === 'teste') {
    const restantes = d.testeAte ? diasEntre(hoje, d.testeAte) : 0
    if (restantes >= 0) {
      const acabando = restantes < DIAS_AVISO_FIM_TESTE
      return montar({ ...base, nivel: acabando ? 'aviso' : 'normal', motivo: acabando ? 'teste_acabando' : 'teste', diasRestantesTeste: restantes })
    }
    vencimento = d.testeAte ?? hoje
    motivo = 'teste_expirado'
  } else if (d.atrasoDesde && diasEntre(d.atrasoDesde, hoje) > 0) {
    vencimento = d.atrasoDesde
  }
  if (!vencimento) return montar({ ...base, nivel: 'normal', motivo: 'em_dia' })

  const atraso = diasEntre(vencimento, hoje)
  const nivel: NivelAcesso = atraso >= d.diasAteBloqueio ? 'bloqueado' : atraso >= d.diasAteSomenteLeitura ? 'somente_leitura' : 'aviso'
  return montar({
    nivel,
    motivo,
    diasAtraso: atraso,
    diasRestantesTeste: null,
    diasParaSomenteLeitura: nivel === 'aviso' ? d.diasAteSomenteLeitura - atraso : null,
    diasParaBloqueio: nivel === 'bloqueado' ? null : d.diasAteBloqueio - atraso,
  })
}

/** Módulos que a empresa pode usar: os do plano + extras contratados + essenciais. */
export function modulosLiberados(doPlano: readonly string[], extras: readonly string[] = []): Modulo[] {
  const set = new Set<string>([...MODULOS_ESSENCIAIS, ...doPlano, ...extras])
  return MODULOS.filter((m) => set.has(m))
}

/**
 * Permissões que valem de fato: só de módulos liberados; no modo só leitura, só ações de leitura;
 * bloqueado, nenhuma. O front esconde menus e botões a partir desta lista.
 */
export function filtrarPermissoes(permissoes: readonly string[], modulos: readonly string[], nivel: NivelAcesso): string[] {
  if (nivel === 'bloqueado') return []
  const liberados = new Set(modulos)
  return permissoes.filter((p) => {
    const [modulo, acao] = p.split(':') as [string, Acao]
    return liberados.has(modulo) && (nivel !== 'somente_leitura' || ACOES_LEITURA.includes(acao))
  })
}

/** Ações que exigem escrita (bloqueadas no modo só leitura). */
export const ACOES_ESCRITA: readonly Acao[] = ACOES.filter((a) => !ACOES_LEITURA.includes(a))

/** Tela "Minha assinatura" (GET /assinatura). */
export interface MinhaAssinatura {
  situacao: SituacaoAssinatura
  plano: { codigo: string; nome: string; descricao: string | null; valorMensal: string; limiteUsuarios: number | null; diasTeste: number; diasAteSomenteLeitura: number; diasAteBloqueio: number }
  acesso: AcessoAssinatura
  testeAte: string | null
  proximoVencimento: string | null
  atrasoDesde: string | null
  liberadoAte: string | null
  usuariosAtivos: number
  /** Módulos do sistema (menos os essenciais): incluídos no plano atual ou em quais planos existem */
  modulos: { codigo: Modulo; rotulo: string; incluido: boolean; planos: string[] }[]
  planos: { codigo: string; nome: string; descricao: string | null; valorMensal: string; limiteUsuarios: number | null; atual: boolean; modulos: string[] }[]
  /** Contato do suporte para pagar ou mudar de plano (vazio se não configurado) */
  suporte: string
  /** Pagamento online (Asaas) disponível na plataforma */
  pagamentoOnline: boolean
  /** O usuário pode assinar, trocar plano/forma e cancelar (administrador da empresa) */
  podeGerenciar: boolean
  /** Já assinou pelo pagamento online (tem assinatura no gateway) */
  assinadaOnline: boolean
  formaPagamento: 'pix_automatico' | 'pix_boleto' | 'cartao' | null
  /** Formas oferecidas (o PIX Automático só quando liberado na conta do gateway) */
  formasDisponiveis: ('pix_automatico' | 'pix_boleto' | 'cartao')[]
  /** PIX Automático aguardando a autorização no banco: QR Code da 1ª mensalidade */
  pixAutomatico: { copiaECola: string; imagem: string | null; expiraEm: string | null } | null
  /** Cancelamento pedido: o acesso segue até esta data */
  cancelarEm: string | null
  /** Para preencher o formulário de assinatura */
  documentoSugerido: string | null
  /** Cobrança em aberto mais antiga, com o link para pagar */
  cobrancaAberta: CobrancaResumo | null
  cobrancas: CobrancaResumo[]
}

export interface CobrancaResumo {
  id: string
  valor: string
  vencimento: string
  situacao: 'pendente' | 'paga' | 'vencida' | 'cancelada' | 'estornada'
  forma: string | null
  pagoEm: string | null
  /** Só para cobranças em aberto */
  linkPagamento: string | null
  falha: string | null
  notaFiscal: { situacao: string; numero: string | null; linkPdf: string | null } | null
}
