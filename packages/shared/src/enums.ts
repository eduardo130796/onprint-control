/** Módulos do sistema (chave usada nas permissões módulo + ação). */
export const MODULOS = [
  'dashboard',
  'orcamentos',
  'pedidos',
  'artes',
  'producao',
  'pcp',
  'clientes',
  'fornecedores',
  'produtos',
  'estoque',
  'financeiro',
  'caixa',
  'relatorios',
  'whatsapp',
  'configuracoes',
  'usuarios',
  'permissoes',
] as const
export type Modulo = (typeof MODULOS)[number]

export const ACOES = ['visualizar', 'criar', 'editar', 'excluir', 'aprovar', 'exportar', 'ver_todos'] as const
export type Acao = (typeof ACOES)[number]

/** Permissão serializada como "modulo:acao". */
export type ChavePermissao = `${Modulo}:${Acao}`

export function chavePermissao(modulo: Modulo, acao: Acao): ChavePermissao {
  return `${modulo}:${acao}`
}

export const PAPEIS = ['admin', 'gerente', 'vendedor', 'designer', 'producao', 'financeiro', 'caixa'] as const
export type CodigoPapel = (typeof PAPEIS)[number]

export const PAPEL_ROTULOS: Record<CodigoPapel, string> = {
  admin: 'Administrador',
  gerente: 'Gerente',
  vendedor: 'Vendedor',
  designer: 'Designer',
  producao: 'Produção',
  financeiro: 'Financeiro',
  caixa: 'Caixa',
}

/** Códigos de erro padronizados da API ({ error: { code, message, details? } }). */
export const CODIGOS_ERRO = {
  VALIDACAO: 'VALIDACAO',
  NAO_AUTENTICADO: 'NAO_AUTENTICADO',
  SEM_PERMISSAO: 'SEM_PERMISSAO',
  TROCA_SENHA_OBRIGATORIA: 'TROCA_SENHA_OBRIGATORIA',
  NAO_ENCONTRADO: 'NAO_ENCONTRADO',
  CONFLITO: 'CONFLITO',
  REGRA_NEGOCIO: 'REGRA_NEGOCIO',
  MUITAS_TENTATIVAS: 'MUITAS_TENTATIVAS',
  /** Assinatura: bloqueio total (só a tela de assinatura funciona) */
  ASSINATURA_BLOQUEADA: 'ASSINATURA_BLOQUEADA',
  /** Assinatura: modo só leitura (nada é gravado) */
  ASSINATURA_SOMENTE_LEITURA: 'ASSINATURA_SOMENTE_LEITURA',
  /** O módulo não faz parte do plano da empresa */
  MODULO_NAO_CONTRATADO: 'MODULO_NAO_CONTRATADO',
  ERRO_INTERNO: 'ERRO_INTERNO',
} as const
export type CodigoErro = (typeof CODIGOS_ERRO)[keyof typeof CODIGOS_ERRO]

// ─── Pessoas ────────────────────────────────────────────────────────────────

export const TIPOS_PESSOA = ['PF', 'PJ'] as const
export type TipoPessoa = (typeof TIPOS_PESSOA)[number]

export const SITUACOES_CLIENTE = ['pre_cadastro', 'ativo', 'inativo', 'bloqueado'] as const
export type SituacaoCliente = (typeof SITUACOES_CLIENTE)[number]

export const ORIGENS_CLIENTE = [
  'whatsapp',
  'balcao',
  'telefone',
  'email',
  'indicacao',
  'instagram',
  'site',
  'outro',
] as const
export type OrigemCliente = (typeof ORIGENS_CLIENTE)[number]

export const ORIGEM_ROTULOS: Record<OrigemCliente, string> = {
  whatsapp: 'WhatsApp',
  balcao: 'Balcão',
  telefone: 'Telefone',
  email: 'E-mail',
  indicacao: 'Indicação',
  instagram: 'Instagram',
  site: 'Site',
  outro: 'Outro',
}

export const TIPOS_ENDERECO = ['principal', 'entrega', 'cobranca'] as const
export type TipoEndereco = (typeof TIPOS_ENDERECO)[number]

export const TIPO_ENDERECO_ROTULOS: Record<TipoEndereco, string> = {
  principal: 'Principal',
  entrega: 'Entrega',
  cobranca: 'Cobrança',
}

// ─── Núcleo ─────────────────────────────────────────────────────────────────

/** Entidades com status configurável (cor/rótulo) em status_config. */
export const ENTIDADES_STATUS = ['cliente', 'solicitacao', 'orcamento', 'pedido', 'producao', 'arte', 'conta'] as const
export type EntidadeStatus = (typeof ENTIDADES_STATUS)[number]

/** Entidades com kanban: aceitam status próprios (colunas extras que "contam como" um status do sistema). */
export const ENTIDADES_COM_STATUS_PROPRIO = ['orcamento', 'pedido', 'producao'] as const
export type EntidadeComStatusProprio = (typeof ENTIDADES_COM_STATUS_PROPRIO)[number]

/** Bases que não aceitam status próprio (status que só a regra de negócio define). */
export const BASES_SEM_STATUS_PROPRIO: Record<EntidadeComStatusProprio, readonly string[]> = {
  orcamento: ['convertido', 'expirado'],
  pedido: ['cancelado'],
  producao: [],
}

export const ENTIDADE_STATUS_ROTULOS: Record<EntidadeStatus, string> = {
  cliente: 'Clientes',
  solicitacao: 'Solicitações',
  orcamento: 'Orçamentos',
  pedido: 'Pedidos',
  producao: 'Produção',
  arte: 'Artes',
  conta: 'Contas (financeiro)',
}

export const CATEGORIAS_TEMPLATE = [
  'orcamento_enviado',
  'arte_aprovacao',
  'pedido_pronto',
  'cobranca',
  'boas_vindas',
] as const
export type CategoriaTemplate = (typeof CATEGORIAS_TEMPLATE)[number]

export const CATEGORIA_TEMPLATE_ROTULOS: Record<CategoriaTemplate, string> = {
  orcamento_enviado: 'Orçamento enviado',
  arte_aprovacao: 'Arte para aprovação',
  pedido_pronto: 'Pedido pronto',
  cobranca: 'Cobrança',
  boas_vindas: 'Boas-vindas',
}

/** Variáveis aceitas nos templates de mensagem: {{variavel}} */
export const VARIAVEIS_TEMPLATE = [
  'cliente_nome',
  'numero_orcamento',
  'numero_pedido',
  'link_aprovacao',
  'valor_total',
  'data_entrega',
] as const
export type VariavelTemplate = (typeof VARIAVEIS_TEMPLATE)[number]

// ─── Arquivos ───────────────────────────────────────────────────────────────

export const CATEGORIAS_ARQUIVO = ['arte', 'anexo', 'comprovante', 'logo', 'imagem_produto'] as const
export type CategoriaArquivo = (typeof CATEGORIAS_ARQUIVO)[number]

/** Entidades que podem ter arquivos vinculados, e o módulo de permissão de cada uma. */
export const ENTIDADES_ARQUIVO = {
  pedido: 'pedidos',
  arte: 'artes',
  entrega: 'pedidos',
  cliente: 'clientes',
  fornecedor: 'fornecedores',
  empresa: 'configuracoes',
  produto: 'produtos',
  conta_receber: 'financeiro',
  conta_pagar: 'financeiro',
} as const satisfies Record<string, Modulo>
export type EntidadeArquivo = keyof typeof ENTIDADES_ARQUIVO

export const EXTENSOES_PERMITIDAS = [
  'pdf', 'ai', 'cdr', 'psd', 'eps', 'svg', 'png', 'jpg', 'jpeg', 'tif', 'tiff', 'zip',
] as const
export const EXTENSOES_IMAGEM = ['png', 'jpg', 'jpeg', 'svg'] as const

export const MODULO_ROTULOS: Record<Modulo, string> = {
  dashboard: 'Dashboard',
  orcamentos: 'Orçamentos',
  pedidos: 'Pedidos de venda',
  artes: 'Artes',
  producao: 'Produção',
  pcp: 'PCP / Cockpit',
  clientes: 'Clientes',
  fornecedores: 'Fornecedores',
  produtos: 'Produtos',
  estoque: 'Estoque',
  financeiro: 'Financeiro',
  caixa: 'Caixa / PDV',
  relatorios: 'Relatórios',
  whatsapp: 'WhatsApp',
  configuracoes: 'Configurações',
  usuarios: 'Usuários',
  permissoes: 'Permissões',
}

export const ACAO_ROTULOS: Record<Acao, string> = {
  visualizar: 'Visualizar',
  criar: 'Criar',
  editar: 'Editar',
  excluir: 'Excluir',
  aprovar: 'Aprovar',
  exportar: 'Exportar',
  ver_todos: 'Ver todos',
}

// ─── Produtos ───────────────────────────────────────────────────────────────

export const TIPOS_PRODUTO = ['produto', 'servico', 'insumo', 'revenda'] as const
export type TipoProduto = (typeof TIPOS_PRODUTO)[number]

export const TIPO_PRODUTO_ROTULOS: Record<TipoProduto, string> = {
  produto: 'Produto',
  servico: 'Serviço',
  insumo: 'Insumo',
  revenda: 'Revenda',
}

export const MODOS_CALCULO = ['unidade', 'm2', 'metro_linear', 'milheiro', 'hora'] as const
export type ModoCalculo = (typeof MODOS_CALCULO)[number]

export const MODO_CALCULO_ROTULOS: Record<ModoCalculo, string> = {
  unidade: 'Por unidade',
  m2: 'Por m²',
  metro_linear: 'Por metro linear',
  milheiro: 'Por milheiro',
  hora: 'Por hora',
}

/** Sufixo exibido junto ao preço: "R$ 65,00 / m²" */
export const MODO_CALCULO_SUFIXO: Record<ModoCalculo, string> = {
  unidade: 'un',
  m2: 'm²',
  metro_linear: 'm',
  milheiro: 'milheiro',
  hora: 'h',
}

export const TIPOS_COBRANCA = ['fixo', 'por_unidade', 'por_m2', 'por_metro_linear', 'por_perimetro'] as const
export type TipoCobranca = (typeof TIPOS_COBRANCA)[number]

export const TIPO_COBRANCA_ROTULOS: Record<TipoCobranca, string> = {
  fixo: 'Valor fixo por item',
  por_unidade: 'Por unidade (peça)',
  por_m2: 'Por m²',
  por_metro_linear: 'Por metro linear (largura)',
  por_perimetro: 'Por metro de perímetro',
}

export const STATUS_MAQUINA = ['ativa', 'manutencao', 'parada'] as const
export type StatusMaquina = (typeof STATUS_MAQUINA)[number]

export const STATUS_MAQUINA_ROTULOS: Record<StatusMaquina, string> = {
  ativa: 'Ativa',
  manutencao: 'Em manutenção',
  parada: 'Parada',
}

/** Como a quantidade do insumo na ficha técnica é medida. */
export const BASES_INSUMO = ['por_unidade', 'por_m2', 'por_metro_linear'] as const
export type BaseInsumo = (typeof BASES_INSUMO)[number]

export const BASE_INSUMO_ROTULOS: Record<BaseInsumo, string> = {
  por_unidade: 'por peça',
  por_m2: 'por m²',
  por_metro_linear: 'por metro linear',
}
