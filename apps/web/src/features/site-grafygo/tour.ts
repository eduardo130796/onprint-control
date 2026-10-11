import { BarChart3, Boxes, Calculator, ClipboardList, Factory, Gauge, Globe, LayoutDashboard, Palette, ShoppingBag, Store, Wallet, type LucideIcon } from 'lucide-react'

/**
 * Visita guiada da página de venda: uma tela de verdade por área (capturas da empresa de demonstração
 * "Ponto Visual", geradas por scripts/capturas-site; ficam em public/site/).
 */
export interface AreaTour {
  id: string
  rotulo: string
  icone: LucideIcon
  titulo: string
  texto: string
  pontos: string[]
  imagem: string
  alt: string
  endereco: string
}

export const TOUR: AreaTour[] = [
  {
    id: 'painel',
    rotulo: 'Visão geral',
    icone: LayoutDashboard,
    titulo: 'O dia da gráfica numa tela só',
    texto: 'Ao abrir o sistema você já vê vendas, o que está em produção, o que vence hoje e o que precisa de atenção.',
    pontos: ['Indicadores do mês com a variação', 'Entregas e orçamentos vencendo', 'Atalhos para o que você mais faz', 'Busca rápida de tudo (Ctrl+K)'],
    imagem: '/site/tour-painel.webp',
    alt: 'Painel com indicadores de vendas, produção e contas a receber',
    endereco: 'app.grafygo.com.br',
  },
  {
    id: 'orcamentos',
    rotulo: 'Orçamentos',
    icone: Calculator,
    titulo: 'Orçamento calculado na hora, com a sua marca',
    texto: 'Escolha o produto, informe as medidas e os acabamentos: o preço sai pelo custo real e pela margem que você definiu.',
    pontos: ['m², metro linear, milheiro, hora ou unidade', 'PDF com a sua logo e cores', 'Link para o cliente aprovar pelo celular', 'Kanban do que está em negociação'],
    imagem: '/site/tour-orcamentos.webp',
    alt: 'Lista de orçamentos com situação, cliente e valor',
    endereco: 'app.grafygo.com.br/orcamentos',
  },
  {
    id: 'pedidos',
    rotulo: 'Pedidos e entregas',
    icone: ClipboardList,
    titulo: 'Aprovou, virou pedido. Sem digitar de novo',
    texto: 'O pedido nasce do orçamento com itens, prazos e pagamentos. Todo mundo vê em que etapa está.',
    pontos: ['Sinal, parcelas e o que falta pagar', 'Etiquetas e ficha do entregador', 'Kanban de pedidos', 'Histórico de tudo o que mudou'],
    imagem: '/site/tour-pedidos.webp',
    alt: 'Kanban de pedidos por etapa',
    endereco: 'app.grafygo.com.br/pedidos',
  },
  {
    id: 'arte',
    rotulo: 'Aprovação de arte',
    icone: Palette,
    titulo: 'Arte aprovada pelo cliente, com registro',
    texto: 'Mande a prova por link. O cliente aprova ou pede ajuste pelo celular, e a resposta fica no pedido com data e hora.',
    pontos: ['Sem precisar de login para o cliente', 'Versões da arte guardadas', 'Ajuste pedido vira tarefa', 'Fim do "eu não aprovei isso"'],
    imagem: '/site/tour-arte.webp',
    alt: 'Página de aprovação de arte vista pelo cliente',
    endereco: 'app.grafygo.com.br/arte',
  },
  {
    id: 'producao',
    rotulo: 'Produção',
    icone: Factory,
    titulo: 'A produção andando, à vista de todos',
    texto: 'Cada pedido vira ordem de produção com etapas. Arraste no kanban e veja na hora o que está atrasado.',
    pontos: ['Etapas: arte, impressão, acabamento, instalação', 'Prazo e prioridade em cada cartão', 'Ficha da OP com QR code', 'Aviso do que vence hoje'],
    imagem: '/site/tour-producao.webp',
    alt: 'Kanban de produção com ordens por etapa',
    endereco: 'app.grafygo.com.br/producao',
  },
  {
    id: 'pcp',
    rotulo: 'PCP',
    icone: Gauge,
    titulo: 'Planejamento e carga das máquinas',
    texto: 'Veja a fila de cada máquina e o que cabe na semana antes de prometer prazo para o cliente.',
    pontos: ['Carga por máquina e por dia', 'Ordens atrasadas em destaque', 'Replaneje arrastando', 'Prazo que você consegue cumprir'],
    imagem: '/site/tour-pcp.webp',
    alt: 'Cockpit de PCP com a carga das máquinas',
    endereco: 'app.grafygo.com.br/pcp',
  },
  {
    id: 'catalogo',
    rotulo: 'Catálogo e preços',
    icone: ShoppingBag,
    titulo: 'Preço certo, com o custo de verdade',
    texto: 'Cadastre insumos, máquinas e acabamentos uma vez. O sistema calcula o custo de cada produto e sugere o preço.',
    pontos: ['Custo de material e hora de máquina', 'Margem e preço mínimo', 'Reajuste em massa quando o material sobe', 'Foto e descrição para a vitrine'],
    imagem: '/site/tour-catalogo.webp',
    alt: 'Cadastro de produto com composição de custo e preço',
    endereco: 'app.grafygo.com.br/produtos',
  },
  {
    id: 'estoque',
    rotulo: 'Estoque e compras',
    icone: Boxes,
    titulo: 'Nunca mais faltar lona no meio do serviço',
    texto: 'Entrada de compra, baixa pelo consumo e alerta quando chega no mínimo.',
    pontos: ['Saldo de cada insumo', 'Entradas e movimentações', 'Alerta de estoque baixo', 'Fornecedores e histórico de compras'],
    imagem: '/site/tour-estoque.webp',
    alt: 'Estoque atual com saldos e alertas de mínimo',
    endereco: 'app.grafygo.com.br/estoque',
  },
  {
    id: 'financeiro',
    rotulo: 'Financeiro',
    icone: Wallet,
    titulo: 'Dinheiro que entra e que sai, organizado',
    texto: 'Contas a receber nascem dos pedidos; contas a pagar ficam no calendário. O fluxo de caixa mostra o mês inteiro.',
    pontos: ['Contas a receber e a pagar', 'Fluxo de caixa e calendário', 'Comissão por vendedor', 'Baixa com a forma de pagamento'],
    imagem: '/site/tour-financeiro.webp',
    alt: 'Fluxo de caixa com entradas, saídas e saldo',
    endereco: 'app.grafygo.com.br/financeiro',
  },
  {
    id: 'caixa',
    rotulo: 'Caixa e balcão',
    icone: Store,
    titulo: 'Venda de balcão em segundos',
    texto: 'O PDV para o que sai na hora (cópias, cartões, brindes), com abertura e fechamento de caixa conferidos.',
    pontos: ['Venda rápida com busca', 'Sangria e suprimento', 'Recebimento de pedidos no caixa', 'Fechamento com conferência'],
    imagem: '/site/tour-caixa.webp',
    alt: 'Tela de venda balcão (PDV)',
    endereco: 'app.grafygo.com.br/caixa',
  },
  {
    id: 'relatorios',
    rotulo: 'Relatórios',
    icone: BarChart3,
    titulo: 'Decida pelos números',
    texto: 'Vendas, lucratividade por produto e cliente, conversão de orçamentos e produção, prontos para imprimir.',
    pontos: ['Lucro de cada pedido', 'Quais orçamentos viram venda', 'Produtos que mais dão resultado', 'Relatórios em PDF'],
    imagem: '/site/tour-relatorios.webp',
    alt: 'Relatório de vendas com gráficos',
    endereco: 'app.grafygo.com.br/relatorios',
  },
  {
    id: 'vitrine',
    rotulo: 'Vitrine online',
    icone: Globe,
    titulo: 'Seu site de produtos, pronto para o WhatsApp',
    texto: 'Os produtos do catálogo viram um site da gráfica. O cliente monta a lista e o pedido chega organizado no sistema.',
    pontos: ['Endereço próprio ou o seu domínio', 'Lista de orçamento com medidas', 'Catálogo em PDF com botão do WhatsApp', 'Prévia bonita ao mandar o link'],
    imagem: '/site/tour-vitrine.webp',
    alt: 'Site de produtos da gráfica (vitrine online)',
    endereco: 'pontovisual.grafygo.com.br',
  },
]
