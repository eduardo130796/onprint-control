import type { CategoriaTemplate, EntidadeStatus } from '@onprint/shared'

interface StatusPadrao {
  codigo: string
  rotulo: string
  cor: string
  final?: boolean
}

const CINZA = '#6B7280'
const AZUL = '#0EA5E9'
const AMBAR = '#F59E0B'
const VERDE = '#22C55E'
const CORAL = '#EF5A57'
const GRAFITE = '#2B3036'
const MARCA = '#25D366'
const ROXO = '#8B5CF6'

export const STATUS_PADRAO: Record<EntidadeStatus, StatusPadrao[]> = {
  cliente: [
    { codigo: 'pre_cadastro', rotulo: 'Pré-cadastro', cor: AMBAR },
    { codigo: 'ativo', rotulo: 'Ativo', cor: VERDE },
    { codigo: 'inativo', rotulo: 'Inativo', cor: CINZA },
    { codigo: 'bloqueado', rotulo: 'Bloqueado', cor: CORAL },
  ],
  solicitacao: [
    { codigo: 'nova', rotulo: 'Nova', cor: AZUL },
    { codigo: 'em_atendimento', rotulo: 'Em atendimento', cor: AMBAR },
    { codigo: 'orcada', rotulo: 'Orçada', cor: VERDE, final: true },
    { codigo: 'descartada', rotulo: 'Descartada', cor: CINZA, final: true },
  ],
  orcamento: [
    { codigo: 'rascunho', rotulo: 'Rascunho', cor: CINZA },
    { codigo: 'enviado', rotulo: 'Enviado', cor: AZUL },
    { codigo: 'em_negociacao', rotulo: 'Em negociação', cor: AMBAR },
    { codigo: 'aprovado', rotulo: 'Aprovado', cor: VERDE },
    { codigo: 'recusado', rotulo: 'Recusado', cor: CORAL, final: true },
    { codigo: 'expirado', rotulo: 'Expirado', cor: '#9CA3AF', final: true },
    { codigo: 'convertido', rotulo: 'Convertido', cor: GRAFITE, final: true },
  ],
  pedido: [
    { codigo: 'aguardando_arte', rotulo: 'Aguardando arte', cor: AMBAR },
    { codigo: 'arte_em_aprovacao', rotulo: 'Arte em aprovação', cor: ROXO },
    { codigo: 'em_producao', rotulo: 'Em produção', cor: AZUL },
    { codigo: 'pronto', rotulo: 'Pronto', cor: MARCA },
    { codigo: 'em_entrega', rotulo: 'Em entrega', cor: GRAFITE },
    { codigo: 'entregue', rotulo: 'Entregue', cor: VERDE, final: true },
    { codigo: 'cancelado', rotulo: 'Cancelado', cor: CORAL, final: true },
  ],
  producao: [
    { codigo: 'fila', rotulo: 'Fila', cor: CINZA },
    { codigo: 'pre_impressao', rotulo: 'Pré-impressão', cor: ROXO },
    { codigo: 'impressao', rotulo: 'Impressão', cor: AZUL },
    { codigo: 'acabamento', rotulo: 'Acabamento', cor: AMBAR },
    { codigo: 'conferencia', rotulo: 'Conferência', cor: MARCA },
    { codigo: 'concluido', rotulo: 'Concluído', cor: VERDE, final: true },
  ],
  arte: [
    { codigo: 'aguardando_arquivo', rotulo: 'Aguardando arquivo', cor: CINZA },
    { codigo: 'em_criacao', rotulo: 'Em criação', cor: AZUL },
    { codigo: 'enviada_cliente', rotulo: 'Enviada ao cliente', cor: ROXO },
    { codigo: 'ajuste_solicitado', rotulo: 'Ajuste solicitado', cor: AMBAR },
    { codigo: 'aprovada', rotulo: 'Aprovada', cor: VERDE, final: true },
  ],
  conta: [
    { codigo: 'aberto', rotulo: 'Em aberto', cor: AZUL },
    { codigo: 'parcial', rotulo: 'Parcial', cor: AMBAR },
    { codigo: 'pago', rotulo: 'Pago', cor: VERDE, final: true },
    { codigo: 'vencido', rotulo: 'Vencido', cor: CORAL },
    { codigo: 'cancelado', rotulo: 'Cancelado', cor: CINZA, final: true },
  ],
}

export const TEMPLATES_PADRAO: { nome: string; categoria: CategoriaTemplate; conteudo: string }[] = [
  {
    nome: 'Orçamento enviado',
    categoria: 'orcamento_enviado',
    conteudo:
      'Olá, {{cliente_nome}}! Segue o orçamento {{numero_orcamento}} no valor de {{valor_total}}.\n' +
      'Para ver os detalhes e aprovar, acesse: {{link_aprovacao}}\nQualquer dúvida, estamos à disposição!',
  },
  {
    nome: 'Arte para aprovação',
    categoria: 'arte_aprovacao',
    conteudo:
      'Olá, {{cliente_nome}}! A arte do seu pedido está pronta para aprovação.\n' +
      'Confira e aprove pelo link: {{link_aprovacao}}',
  },
  {
    nome: 'Pedido pronto',
    categoria: 'pedido_pronto',
    conteudo: 'Olá, {{cliente_nome}}! Seu pedido está pronto. Previsão de entrega/retirada: {{data_entrega}}.',
  },
  {
    nome: 'Cobrança',
    categoria: 'cobranca',
    conteudo:
      'Olá, {{cliente_nome}}! Lembramos que há um valor em aberto de {{valor_total}}. ' +
      'Se já efetuou o pagamento, por favor desconsidere.',
  },
  {
    nome: 'Boas-vindas',
    categoria: 'boas_vindas',
    conteudo: 'Olá, {{cliente_nome}}! Obrigado pelo contato. Em que podemos ajudar?',
  },
]
