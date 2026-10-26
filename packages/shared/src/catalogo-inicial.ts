import { acabamentoPeloNome, acharDuplicado, SIGLA_DO_MODO, type LinhaCadastro } from './cadastro-lote'
import type { ModoCalculo, TipoCobranca } from './enums'

/*
 * Catálogo inicial (modelos prontos) para quem começa do zero: produtos típicos de gráfica pequena, por perfil, com o
 * modo de cálculo, a unidade, as medidas padrão e os acabamentos comuns. SEM preço: cada gráfica cobra diferente e um
 * preço de referência engana (a IA e o sistema nunca decidem preço). A pessoa marca os que vende, digita o preço na
 * revisão do "Cadastrar vários" e cria tudo de uma vez. Faixa de mercado também não aparece: varia demais por cidade.
 */

export const PERFIS_CATALOGO = ['comunicacao_visual', 'papelaria', 'brindes_servicos'] as const
export type PerfilCatalogo = (typeof PERFIS_CATALOGO)[number]
export const PERFIL_CATALOGO_ROTULOS: Record<PerfilCatalogo, string> = {
  comunicacao_visual: 'Comunicação visual',
  papelaria: 'Papelaria e impressos',
  brindes_servicos: 'Brindes e serviços',
}

export interface ModeloProduto {
  /** Identifica o modelo na tela */
  id: string
  perfil: PerfilCatalogo
  nome: string
  /** Categoria sugerida (a do cadastro com o mesmo nome, ou criada junto) */
  categoria: string
  tipo: 'produto' | 'servico'
  modoCalculo: ModoCalculo
  /** Metros */
  larguraPadrao?: string
  alturaPadrao?: string
  larguraMaxima?: string
  alturaMaxima?: string
  prazoProducaoDias: number
  precisaArte: boolean
  /** Acabamentos comuns (ligados aos do cadastro pelo nome; os que faltam, a pessoa cria com o preço dela) */
  acabamentos: { nome: string; tipoCobranca: TipoCobranca }[]
}

const ilhos = { nome: 'Ilhós a cada 50 cm', tipoCobranca: 'por_perimetro' } as const
const bainha = { nome: 'Bainha', tipoCobranca: 'por_perimetro' } as const
const bastao = { nome: 'Bastão e cordão', tipoCobranca: 'por_metro_linear' } as const
const laminacao = { nome: 'Laminação fosca', tipoCobranca: 'por_m2' } as const
const recorte = { nome: 'Recorte eletrônico', tipoCobranca: 'por_m2' } as const
const aplicacao = { nome: 'Aplicação no local', tipoCobranca: 'por_m2' } as const
const arte = { nome: 'Criação de arte', tipoCobranca: 'fixo' } as const
const cantos = { nome: 'Cantos arredondados', tipoCobranca: 'fixo' } as const
const verniz = { nome: 'Verniz localizado', tipoCobranca: 'fixo' } as const
const embalagem = { nome: 'Embalagem individual', tipoCobranca: 'por_unidade' } as const
const fita = { nome: 'Fita dupla face', tipoCobranca: 'por_unidade' } as const

const CV = 'Comunicação visual'
const PAP = 'Impressos'
const BRI = 'Personalizados'
const SER = 'Serviços'

export const CATALOGO_INICIAL: readonly ModeloProduto[] = [
  // ─── Comunicação visual ───
  { id: 'banner', perfil: 'comunicacao_visual', nome: 'Banner em lona 440 g', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraPadrao: '0.6', alturaPadrao: '0.9', larguraMaxima: '3.2', alturaMaxima: '50', prazoProducaoDias: 2, precisaArte: true, acabamentos: [bastao, ilhos, bainha, arte] },
  { id: 'faixa', perfil: 'comunicacao_visual', nome: 'Faixa em lona 440 g', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraPadrao: '3', alturaPadrao: '0.7', larguraMaxima: '3.2', alturaMaxima: '50', prazoProducaoDias: 2, precisaArte: true, acabamentos: [ilhos, bainha, arte] },
  { id: 'lona-fachada', perfil: 'comunicacao_visual', nome: 'Lona para fachada (front light)', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraMaxima: '3.2', alturaMaxima: '50', prazoProducaoDias: 3, precisaArte: true, acabamentos: [ilhos, bainha, aplicacao, arte] },
  { id: 'adesivo', perfil: 'comunicacao_visual', nome: 'Adesivo vinil impresso', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraMaxima: '1.27', alturaMaxima: '50', prazoProducaoDias: 2, precisaArte: true, acabamentos: [laminacao, recorte, aplicacao, arte] },
  { id: 'adesivo-recorte', perfil: 'comunicacao_visual', nome: 'Adesivo de recorte (vinil colorido)', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraMaxima: '1.22', alturaMaxima: '50', prazoProducaoDias: 2, precisaArte: true, acabamentos: [aplicacao, arte] },
  { id: 'adesivo-perfurado', perfil: 'comunicacao_visual', nome: 'Adesivo perfurado para vidro', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraMaxima: '1.37', alturaMaxima: '50', prazoProducaoDias: 2, precisaArte: true, acabamentos: [aplicacao, arte] },
  { id: 'placa-pvc', perfil: 'comunicacao_visual', nome: 'Placa em PVC 3 mm com adesivo', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraPadrao: '0.3', alturaPadrao: '0.2', larguraMaxima: '2', alturaMaxima: '1', prazoProducaoDias: 3, precisaArte: true, acabamentos: [fita, laminacao, arte] },
  { id: 'acm', perfil: 'comunicacao_visual', nome: 'Fachada em ACM com adesivo', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraMaxima: '5', alturaMaxima: '1.5', prazoProducaoDias: 7, precisaArte: true, acabamentos: [aplicacao, arte] },
  { id: 'wind-banner', perfil: 'comunicacao_visual', nome: 'Wind banner com base', categoria: CV, tipo: 'produto', modoCalculo: 'unidade', prazoProducaoDias: 4, precisaArte: true, acabamentos: [arte] },
  { id: 'lona-backlight', perfil: 'comunicacao_visual', nome: 'Lona backlight para luminoso', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraMaxima: '3.2', alturaMaxima: '50', prazoProducaoDias: 3, precisaArte: true, acabamentos: [bainha, arte] },
  { id: 'adesivo-carro', perfil: 'comunicacao_visual', nome: 'Adesivo para carro (envelopamento parcial)', categoria: CV, tipo: 'produto', modoCalculo: 'm2', larguraMaxima: '1.37', alturaMaxima: '50', prazoProducaoDias: 3, precisaArte: true, acabamentos: [laminacao, aplicacao, arte] },

  // ─── Papelaria e impressos ───
  { id: 'cartao-visita', perfil: 'papelaria', nome: 'Cartão de visita 4×4 couché 300 g', categoria: PAP, tipo: 'produto', modoCalculo: 'milheiro', larguraPadrao: '0.09', alturaPadrao: '0.05', prazoProducaoDias: 5, precisaArte: true, acabamentos: [laminacao, cantos, verniz, arte] },
  { id: 'panfleto', perfil: 'papelaria', nome: 'Panfleto 10 × 15 cm 4×0 couché 115 g', categoria: PAP, tipo: 'produto', modoCalculo: 'milheiro', larguraPadrao: '0.1', alturaPadrao: '0.15', prazoProducaoDias: 5, precisaArte: true, acabamentos: [arte] },
  { id: 'folder', perfil: 'papelaria', nome: 'Folder A4 com 2 dobras 4×4', categoria: PAP, tipo: 'produto', modoCalculo: 'milheiro', larguraPadrao: '0.297', alturaPadrao: '0.21', prazoProducaoDias: 6, precisaArte: true, acabamentos: [arte] },
  { id: 'cartaz', perfil: 'papelaria', nome: 'Cartaz A3 4×0 couché 150 g', categoria: PAP, tipo: 'produto', modoCalculo: 'unidade', larguraPadrao: '0.297', alturaPadrao: '0.42', prazoProducaoDias: 2, precisaArte: true, acabamentos: [laminacao, arte] },
  { id: 'bloco', perfil: 'papelaria', nome: 'Bloco de anotações 50 folhas', categoria: PAP, tipo: 'produto', modoCalculo: 'unidade', larguraPadrao: '0.1', alturaPadrao: '0.15', prazoProducaoDias: 5, precisaArte: true, acabamentos: [arte] },
  { id: 'receituario', perfil: 'papelaria', nome: 'Receituário A5 (bloco com 100 folhas)', categoria: PAP, tipo: 'produto', modoCalculo: 'unidade', larguraPadrao: '0.148', alturaPadrao: '0.21', prazoProducaoDias: 5, precisaArte: true, acabamentos: [arte] },
  { id: 'envelope', perfil: 'papelaria', nome: 'Envelope ofício personalizado', categoria: PAP, tipo: 'produto', modoCalculo: 'milheiro', prazoProducaoDias: 6, precisaArte: true, acabamentos: [arte] },
  { id: 'timbrado', perfil: 'papelaria', nome: 'Papel timbrado A4', categoria: PAP, tipo: 'produto', modoCalculo: 'milheiro', larguraPadrao: '0.21', alturaPadrao: '0.297', prazoProducaoDias: 5, precisaArte: true, acabamentos: [arte] },
  { id: 'adesivo-rotulo', perfil: 'papelaria', nome: 'Etiqueta adesiva (rótulo) em vinil', categoria: PAP, tipo: 'produto', modoCalculo: 'm2', prazoProducaoDias: 3, precisaArte: true, acabamentos: [recorte, laminacao, arte] },
  { id: 'convite', perfil: 'papelaria', nome: 'Convite 10 × 15 cm couché 250 g', categoria: PAP, tipo: 'produto', modoCalculo: 'unidade', larguraPadrao: '0.1', alturaPadrao: '0.15', prazoProducaoDias: 4, precisaArte: true, acabamentos: [laminacao, arte] },

  // ─── Brindes e serviços ───
  { id: 'caneca', perfil: 'brindes_servicos', nome: 'Caneca de porcelana personalizada', categoria: BRI, tipo: 'produto', modoCalculo: 'unidade', prazoProducaoDias: 3, precisaArte: true, acabamentos: [embalagem, arte] },
  { id: 'camiseta', perfil: 'brindes_servicos', nome: 'Camiseta personalizada (sublimação)', categoria: BRI, tipo: 'produto', modoCalculo: 'unidade', prazoProducaoDias: 4, precisaArte: true, acabamentos: [embalagem, arte] },
  { id: 'chaveiro', perfil: 'brindes_servicos', nome: 'Chaveiro de acrílico personalizado', categoria: BRI, tipo: 'produto', modoCalculo: 'unidade', larguraPadrao: '0.05', alturaPadrao: '0.03', prazoProducaoDias: 4, precisaArte: true, acabamentos: [embalagem, arte] },
  { id: 'squeeze', perfil: 'brindes_servicos', nome: 'Squeeze personalizado', categoria: BRI, tipo: 'produto', modoCalculo: 'unidade', prazoProducaoDias: 5, precisaArte: true, acabamentos: [embalagem, arte] },
  { id: 'impressao-a4', perfil: 'brindes_servicos', nome: 'Impressão A4 colorida', categoria: SER, tipo: 'servico', modoCalculo: 'unidade', prazoProducaoDias: 0, precisaArte: false, acabamentos: [] },
  { id: 'copia', perfil: 'brindes_servicos', nome: 'Cópia A4 preto e branco', categoria: SER, tipo: 'servico', modoCalculo: 'unidade', prazoProducaoDias: 0, precisaArte: false, acabamentos: [] },
  { id: 'encadernacao', perfil: 'brindes_servicos', nome: 'Encadernação espiral (até 100 folhas)', categoria: SER, tipo: 'servico', modoCalculo: 'unidade', prazoProducaoDias: 0, precisaArte: false, acabamentos: [] },
  { id: 'plastificacao', perfil: 'brindes_servicos', nome: 'Plastificação A4', categoria: SER, tipo: 'servico', modoCalculo: 'unidade', prazoProducaoDias: 0, precisaArte: false, acabamentos: [] },
  { id: 'instalacao', perfil: 'brindes_servicos', nome: 'Instalação', categoria: SER, tipo: 'servico', modoCalculo: 'hora', prazoProducaoDias: 0, precisaArte: false, acabamentos: [] },
  { id: 'criacao-arte', perfil: 'brindes_servicos', nome: 'Criação de arte', categoria: SER, tipo: 'servico', modoCalculo: 'unidade', prazoProducaoDias: 1, precisaArte: false, acabamentos: [] },
  { id: 'escaneamento', perfil: 'brindes_servicos', nome: 'Digitalização (scanner) por página', categoria: SER, tipo: 'servico', modoCalculo: 'unidade', prazoProducaoDias: 0, precisaArte: false, acabamentos: [] },
]

/** O que o cadastro já tem (para ligar categorias e acabamentos e avisar o duplicado) */
export interface CadastroAtual {
  categorias: readonly { id: string; nome: string }[]
  acabamentos: readonly { id: string; nome: string; tipoCobranca: TipoCobranca; valor: string }[]
  produtos: readonly { id: string; nome: string }[]
}

const igual = (a: string, b: string) => a.localeCompare(b, 'pt-BR', { sensitivity: 'base' }) === 0

/**
 * Modelo → linha da revisão: preço vazio (a pessoa digita), categoria e acabamentos ligados aos do cadastro pelo nome
 * (os que faltam ficam como novos, sem preço: só entram se a pessoa digitar o preço) e o aviso do produto parecido.
 */
export function linhaDoModelo(m: ModeloProduto, atual: CadastroAtual): LinhaCadastro {
  const categoria = atual.categorias.find((c) => igual(c.nome, m.categoria))
  return {
    chave: `modelo-${m.id}`,
    nome: m.nome,
    tipo: m.tipo,
    categoriaId: categoria?.id ?? null,
    categoriaNova: categoria ? null : m.categoria,
    modoCalculo: m.modoCalculo,
    unidadeSigla: SIGLA_DO_MODO[m.modoCalculo],
    precoVenda: null,
    larguraPadrao: m.larguraPadrao ?? null,
    alturaPadrao: m.alturaPadrao ?? null,
    larguraMaxima: m.larguraMaxima ?? null,
    alturaMaxima: m.alturaMaxima ?? null,
    prazoProducaoDias: m.prazoProducaoDias,
    precisaArte: m.precisaArte,
    acabamentos: m.acabamentos.map((a) => {
      const existente = acabamentoPeloNome(a.nome, atual.acabamentos)
      return existente ? { id: existente.id, nome: existente.nome, tipoCobranca: existente.tipoCobranca, valor: existente.valor } : { id: null, nome: a.nome, tipoCobranca: a.tipoCobranca, valor: null }
    }),
    materiais: [],
    descricao: null,
    conferir: [],
    duplicado: acharDuplicado(m.nome, atual.produtos),
    origem: 'modelo',
  }
}
