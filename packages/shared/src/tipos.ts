/**
 * Formato das respostas da API (saída). Datas em ISO 8601, valores monetários como string decimal.
 */
import type {
  BaseInsumo,
  ModoCalculo,
  StatusMaquina,
  TipoCobranca,
  TipoProduto,
  CategoriaArquivo,
  CategoriaTemplate,
  OrigemCliente,
  SituacaoCliente,
  TipoEndereco,
  TipoPessoa,
} from './enums'

export interface Auditavel {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Endereco extends Auditavel {
  tipo: TipoEndereco
  cep: string | null
  logradouro: string
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string
  uf: string
  referencia: string | null
}

export interface Contato extends Auditavel {
  nome: string
  cargo: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  principal: boolean
}

export interface Cliente extends Auditavel {
  tipoPessoa: TipoPessoa
  nome: string
  fantasia: string | null
  cpfCnpj: string | null
  ie: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  origem: OrigemCliente | null
  situacao: SituacaoCliente
  limiteCredito: string
  vendedorId: string | null
  vendedor: { id: string; nome: string } | null
  observacoes: string | null
  tags: string[]
  ativo: boolean
}

export interface ClienteDetalhe extends Cliente {
  enderecos: Endereco[]
  contatos: Contato[]
}

export interface Fornecedor extends Auditavel {
  tipoPessoa: TipoPessoa
  nome: string
  fantasia: string | null
  cpfCnpj: string | null
  ie: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  contato: string | null
  categoriaFornecimento: string | null
  prazoMedioDias: number | null
  condicoesPagamento: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  observacoes: string | null
  ativo: boolean
}

export interface PapelResumo {
  id: string
  codigo: string
  nome: string
}

export interface UsuarioResumo extends Auditavel {
  nome: string
  email: string
  telefone: string | null
  papel: PapelResumo
  comissaoPercentual: string
  deveTrocarSenha: boolean
  ultimoLogin: string | null
  ativo: boolean
  semInatividade: boolean
}

export interface OpcaoSelect {
  id: string
  nome: string
}

export interface MatrizPermissoes {
  papeis: (PapelResumo & { usuarios: number })[]
  modulos: string[]
  acoes: string[]
  /** papelId → lista "modulo:acao" */
  concedidas: Record<string, string[]>
}

export interface EmpresaConfig extends Auditavel {
  razaoSocial: string
  nomeFantasia: string | null
  cnpj: string | null
  ie: string | null
  email: string | null
  telefone: string | null
  whatsapp: string | null
  site: string | null
  cep: string | null
  logradouro: string | null
  numero: string | null
  complemento: string | null
  bairro: string | null
  cidade: string | null
  uf: string | null
  logoArquivoId: string | null
  /** Cor do tema do sistema (TEMAS); null = verde ONPrint */
  corTema: string | null
  /** Minutos sem uso até o sistema sair sozinho */
  inatividadeMinutos: number
  validadeOrcamentoDias: number
  condicoesPadrao: string | null
  sinalPercentual: string
  chavePix: string | null
  areaMinimaM2: string
}

export interface StatusConfig {
  id: string
  entidade: string
  codigo: string
  rotulo: string
  cor: string
  ordem: number
  ehFinal: boolean
  /** false = status próprio criado pelo usuário */
  sistema: boolean
  /** Status próprio: código do status do sistema que ele "conta como" */
  base: string | null
  /** false = oculto */
  ativo: boolean
}

export interface MensagemTemplate extends Auditavel {
  nome: string
  categoria: CategoriaTemplate
  conteudo: string
  ativo: boolean
}

export interface Arquivo {
  id: string
  entidade: string
  entidadeId: string | null
  categoria: CategoriaArquivo
  nomeOriginal: string
  mime: string
  tamanho: number
  createdAt: string
  enviadoPor: { id: string; nome: string } | null
}

// ─── Produtos ───────────────────────────────────────────────────────────────

export interface UnidadeMedida {
  id: string
  sigla: string
  nome: string
}

export interface Categoria extends Auditavel {
  nome: string
  paiId: string | null
  ativo: boolean
  /** Caminho completo, ex.: "Comunicação visual › Banners" */
  caminho: string
  _count?: { produtos: number }
}

export interface Acabamento extends Auditavel {
  nome: string
  descricao: string | null
  tipoCobranca: TipoCobranca
  valor: string
  custo: string
  prazoAdicionalDias: number
  ativo: boolean
}

export interface Maquina extends Auditavel {
  nome: string
  tipo: string | null
  larguraUtil: string | null
  velocidadeM2Hora: string | null
  custoHora: string
  status: StatusMaquina
  observacoes: string | null
  ativo: boolean
}

export interface Processo extends Auditavel {
  nome: string
  descricao: string | null
  maquinaPadraoId: string | null
  maquinaPadrao: { id: string; nome: string } | null
  tempoPadraoMinutos: number | null
  ativo: boolean
}

export interface Produto extends Auditavel {
  codigo: string
  nome: string
  descricao: string | null
  categoriaId: string | null
  categoria: { id: string; nome: string } | null
  unidadeMedidaId: string | null
  unidadeMedida: UnidadeMedida | null
  tipo: TipoProduto
  modoCalculo: ModoCalculo
  precoVenda: string
  /** Custo e margem só vêm para quem pode editar produtos */
  custo?: string
  margem?: string
  precoMinimo: string | null
  larguraPadrao: string | null
  alturaPadrao: string | null
  larguraMaxima: string | null
  alturaMaxima: string | null
  prazoProducaoDias: number
  controlaEstoque: boolean
  estoqueMinimo: string
  imagemArquivoId: string | null
  ativo: boolean
}

export interface ProdutoDetalhe extends Produto {
  acabamentos: { acabamentoId: string; obrigatorio: boolean; padrao: boolean; acabamento: Acabamento }[]
  insumos: {
    id: string
    insumoId: string
    quantidade: string
    base: BaseInsumo
    perdaPercentual: string
    insumo: { id: string; codigo: string; nome: string; unidadeMedida: UnidadeMedida | null; custo?: string }
  }[]
  processos: {
    id: string
    processoId: string
    maquinaId: string | null
    ordem: number
    processo: { id: string; nome: string }
    maquina: { id: string; nome: string } | null
  }[]
}
