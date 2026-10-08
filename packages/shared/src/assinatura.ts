import { ACOES, MODULOS, type Acao, type Modulo } from './enums'

/** Módulos que toda empresa tem, em qualquer plano (sem eles não dá para usar nem administrar o sistema). */
export const MODULOS_ESSENCIAIS: readonly Modulo[] = ['dashboard', 'configuracoes', 'usuarios', 'permissoes']

export const SITUACOES_ASSINATURA = ['teste', 'ativa', 'cortesia', 'cancelada'] as const
export type SituacaoAssinatura = (typeof SITUACOES_ASSINATURA)[number]
export const SITUACAO_ASSINATURA_ROTULOS: Record<SituacaoAssinatura, string> = { teste: 'Teste grátis', ativa: 'Ativa', cortesia: 'Cortesia', cancelada: 'Cancelada' }

/** Do mais livre ao mais restrito. */
export const NIVEIS_ACESSO = ['normal', 'aviso', 'somente_leitura', 'bloqueado'] as const
export type NivelAcesso = (typeof NIVEIS_ACESSO)[number]
export const NIVEL_ACESSO_ROTULOS: Record<NivelAcesso, string> = { normal: 'Normal', aviso: 'Com aviso', somente_leitura: 'Só leitura', bloqueado: 'Bloqueado' }

export type MotivoAcesso = 'em_dia' | 'teste' | 'teste_acabando' | 'teste_expirado' | 'atraso' | 'liberacao_manual' | 'bloqueio_manual' | 'cancelada' | 'renovacao_pendente' | 'cortesia' | 'cortesia_encerrada'

/** Ações que continuam valendo no modo só leitura (consultar e exportar). */
export const ACOES_LEITURA: readonly Acao[] = ['visualizar', 'exportar', 'ver_todos']

/** No teste grátis, o aviso aparece nos últimos dias. */
export const DIAS_AVISO_FIM_TESTE = 3

export interface DadosAcesso {
  situacao: SituacaoAssinatura
  /** Datas em AAAA-MM-DD (dia no fuso de São Paulo) */
  testeAte?: string | null
  /** Cortesia (assinatura grátis): até esta data; null = sem prazo */
  cortesiaAte?: string | null
  /** Vencimento da cobrança mais antiga ainda não paga */
  atrasoDesde?: string | null
  /** Liberação manual: acesso normal até esta data, mesmo com atraso */
  liberadoAte?: string | null
  bloqueioManual?: boolean
  /** Cancelada que já assinou de novo: falta o 1º pagamento da assinatura nova */
  renovacaoPendente?: boolean
  diasAteSomenteLeitura: number
  diasAteBloqueio: number
}

export interface AcessoAssinatura {
  nivel: NivelAcesso
  motivo: MotivoAcesso
  /** Dias desde o vencimento (0 sem atraso) */
  diasAtraso: number
  /** Teste grátis (ou cortesia com prazo) em andamento: dias que faltam (0 = último dia) */
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
      return 'A assinatura foi cancelada. Para voltar a usar o sistema, assine de novo.'
    case 'renovacao_pendente':
      return 'Assinatura renovada: falta só o pagamento da 1ª mensalidade para liberar o acesso.'
    case 'liberacao_manual':
      return 'Acesso liberado temporariamente pelo suporte.'
    case 'em_dia':
      return 'Assinatura em dia.'
    case 'cortesia':
      return a.diasRestantesTeste == null ? 'Assinatura cortesia, sem mensalidade.' : `Assinatura cortesia: ${a.diasRestantesTeste === 0 ? 'hoje é o último dia' : `faltam ${dias(a.diasRestantesTeste)}`}.`
    case 'teste':
      return `Teste grátis: ${a.diasRestantesTeste === 0 ? 'hoje é o último dia' : `faltam ${dias(a.diasRestantesTeste ?? 0)}`}.`
    case 'teste_acabando':
      return `O teste grátis termina ${a.diasRestantesTeste === 0 ? 'hoje' : `em ${dias(a.diasRestantesTeste ?? 0)}`}. Assine para continuar usando sem interrupção.`
  }
  const inicio =
    a.motivo === 'teste_expirado' ? `O teste grátis terminou há ${dias(a.diasAtraso)}` : a.motivo === 'cortesia_encerrada' ? `A cortesia terminou há ${dias(a.diasAtraso)}` : `A mensalidade está vencida há ${dias(a.diasAtraso)}`
  if (a.nivel === 'bloqueado') return `${inicio}. O sistema está bloqueado até o pagamento.`
  if (a.nivel === 'somente_leitura') return `${inicio}. O sistema está só para consulta; em ${dias(a.diasParaBloqueio ?? 0)} ele será bloqueado.`
  return `${inicio}. Em ${dias(a.diasParaSomenteLeitura ?? 0)} o sistema fica só para consulta.`
}

/**
 * Nível de acesso da empresa hoje. Ordem das regras: bloqueio manual → cancelada → liberação manual →
 * cortesia → teste grátis → atraso. Na cortesia em vigor o acesso é normal (mesmo com cobrança antiga em aberto);
 * quando ela acaba, conta como um teste que terminou: é preciso assinar. O atraso conta do vencimento (ou do fim do teste): até `diasAteSomenteLeitura`
 * só aviso; até `diasAteBloqueio` só leitura; depois, bloqueio total.
 */
export function calcularAcesso(d: DadosAcesso, hoje: string): AcessoAssinatura {
  const r = calcularSemLiberacao(d, hoje)
  // Liberação manual só muda algo quando o acesso seria restrito (aviso, só leitura, bloqueio por atraso)
  if (r.nivel !== 'normal' && d.liberadoAte && diasEntre(hoje, d.liberadoAte) >= 0 && !d.bloqueioManual && d.situacao !== 'cancelada') {
    return { nivel: 'normal', motivo: 'liberacao_manual', diasAtraso: 0, diasRestantesTeste: null, diasParaSomenteLeitura: null, diasParaBloqueio: null, mensagem: mensagem({ nivel: 'normal', motivo: 'liberacao_manual', diasAtraso: 0, diasRestantesTeste: null, diasParaSomenteLeitura: null, diasParaBloqueio: null }) }
  }
  return r
}

function calcularSemLiberacao(d: DadosAcesso, hoje: string): AcessoAssinatura {
  const base = { diasAtraso: 0, diasRestantesTeste: null, diasParaSomenteLeitura: null, diasParaBloqueio: null }
  const montar = (a: Omit<AcessoAssinatura, 'mensagem'>): AcessoAssinatura => ({ ...a, mensagem: mensagem(a) })

  if (d.bloqueioManual) return montar({ ...base, nivel: 'bloqueado', motivo: 'bloqueio_manual' })
  if (d.situacao === 'cancelada') return montar({ ...base, nivel: 'bloqueado', motivo: d.renovacaoPendente ? 'renovacao_pendente' : 'cancelada' })

  let vencimento: string | null = null
  let motivo: MotivoAcesso = 'atraso'
  if (d.situacao === 'cortesia') {
    if (!d.cortesiaAte) return montar({ ...base, nivel: 'normal', motivo: 'cortesia' })
    const restantes = diasEntre(hoje, d.cortesiaAte)
    if (restantes >= 0) return montar({ ...base, nivel: restantes < DIAS_AVISO_FIM_TESTE ? 'aviso' : 'normal', motivo: 'cortesia', diasRestantesTeste: restantes })
    vencimento = d.cortesiaAte
    motivo = 'cortesia_encerrada'
  } else if (d.situacao === 'teste') {
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
  cortesia: { ate: string | null; motivo: string | null } | null
  /** Cupom em uso: desconto nas mensalidades da janela (null em `ate` = para sempre; `desde` null = a partir da 1ª) */
  cupom: CupomEmUso | null
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
  /** A pagar agora (vencidas, diferenças proporcionais e mensalidades dos próximos 7 dias), da mais antiga para a mais nova */
  cobrancasAbertas: CobrancaResumo[]
  /** Downgrade agendado: plano que passa a valer e quando */
  planoAgendado: { nome: string; valorMensal: string; em: string } | null
  cobrancas: CobrancaResumo[]
}

export interface CobrancaResumo {
  id: string
  /** mensalidade | proporcional (diferença de upgrade) */
  tipo: 'mensalidade' | 'proporcional'
  descricao: string | null
  valor: string
  vencimento: string
  situacao: 'pendente' | 'paga' | 'vencida' | 'cancelada' | 'estornada' | 'abonada'
  /** Desconto de cupom já aplicado no valor */
  desconto: string | null
  /** Abonada pelo suporte (mês grátis ou perdão): o motivo */
  motivoAbono: string | null
  forma: string | null
  pagoEm: string | null
  /** Só para cobranças em aberto */
  linkPagamento: string | null
  falha: string | null
  notaFiscal: { situacao: string; numero: string | null; linkPdf: string | null } | null
}

export interface CupomEmUso {
  codigo: string
  descricao: string
  /** Desconto por mensalidade no plano atual (R$) */
  desconto: string
  /** Mensalidades com desconto (null = para sempre) */
  duracaoMeses: number | null
  desde: string | null
  ate: string | null
}
