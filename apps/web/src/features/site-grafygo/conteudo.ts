import {
  BarChart3,
  Boxes,
  Calculator,
  CheckCheck,
  ClipboardList,
  EyeOff,
  Factory,
  GraduationCap,
  MessageCircle,
  Palette,
  Receipt,
  ShoppingBag,
  Users,
  Wallet,
  Zap,
  type LucideIcon,
} from 'lucide-react'

/** Textos da página de venda (grafygo.com.br): linguagem de quem compra, sem termos técnicos. O preço vem do painel da plataforma. */

export interface Recurso {
  icone: LucideIcon
  titulo: string
  texto: string
  itens: string[]
}

export const RECURSOS: Recurso[] = [
  {
    icone: Calculator,
    titulo: 'Orçamentos em minutos',
    texto: 'Preço calculado por m², metro linear, milheiro, hora ou unidade, com acabamentos, margem e o pagamento combinado.',
    itens: ['Entrada, parcelas e intervalo em cada orçamento', 'PDF com a sua marca e cores', '"Precisa de arte" decidido por item'],
  },
  {
    icone: MessageCircle,
    titulo: 'Orçamento no WhatsApp',
    texto: 'Itens, total, pagamento, prazo e validade na própria mensagem, com o PDF junto. O cliente aprova pelo WhatsApp e o pedido nasce sozinho.',
    itens: ['Sai pelo número da própria gráfica', 'Aprovação também pelo link, se o cliente preferir', 'Ou você confirma com um clique'],
  },
  {
    icone: Zap,
    titulo: 'Aprovou, virou pedido',
    texto: 'O orçamento aprovado vira pedido sozinho, com as parcelas combinadas já nas contas a receber. A equipe fica sabendo na hora.',
    itens: ['Aviso na tela: "Fulano aprovou · virou o pedido"', 'Sinal e parcelas com o que falta pagar', 'Etiquetas e ficha para o entregador'],
  },
  {
    icone: Palette,
    titulo: 'Arte sem idas e vindas',
    texto: 'A arte vai na conversa, com os arquivos anexados. A aprovação pode ser interna, num clique, ou pelo link do pedido.',
    itens: ['Uma mensagem por pedido, um link só', '"Cliente aprovou todas as artes"', 'Item sem arte vai direto para a produção'],
  },
  {
    icone: Factory,
    titulo: 'Produção organizada',
    texto: 'Ordens de produção com etapas, máquinas e prazos. O quadro mostra o que está atrasado antes de virar problema.',
    itens: ['Carga de cada máquina na semana', 'Ficha de produção impressa para a bancada', 'Prazo de entrega sempre à vista'],
  },
  {
    icone: ShoppingBag,
    titulo: 'Catálogo e precificação',
    texto: 'Produtos, insumos, acabamentos e máquinas com custo real. Reajuste de preços em massa quando o material sobe.',
    itens: ['Custo por insumo e por hora de máquina', 'Margem e preço mínimo', 'Lucro de cada item no orçamento'],
  },
  {
    icone: Users,
    titulo: 'Clientes pelo CNPJ',
    texto: 'Digite o CNPJ e o sistema preenche nome, nome fantasia, telefone, WhatsApp e endereço com os dados da Receita.',
    itens: ['Foto ou logo do cliente', 'Pessoas de contato', 'Aviso de cliente repetido (e reativação)'],
  },
  {
    icone: Boxes,
    titulo: 'Estoque e compras',
    texto: 'Entrada de nota, baixa automática pelo consumo e alerta antes de faltar lona, vinil ou tinta.',
    itens: ['Saldo e movimentações', 'Alerta de estoque mínimo', 'Fornecedores e compras'],
  },
  {
    icone: Wallet,
    titulo: 'Financeiro e caixa',
    texto: 'Contas a pagar e a receber, fluxo de caixa, comissões e o caixa do balcão, tudo ligado aos pedidos.',
    itens: ['Venda balcão rápida', 'Calendário de vencimentos', 'Comissão por vendedor'],
  },
  {
    icone: BarChart3,
    titulo: 'Números do negócio',
    texto: 'Vendas, lucratividade, conversão de orçamentos e produção. Decida pelo que os números mostram.',
    itens: ['Painel do dia com o que precisa de atenção', 'Lucro por produto e por cliente', 'Relatórios em PDF e planilha'],
  },
  {
    icone: EyeOff,
    titulo: 'Valores escondidos da tela',
    texto: 'Cliente no balcão olhando o monitor? Um toque no olho do topo borra o faturamento e os valores que você escolher.',
    itens: ['Cada usuário escolhe o que esconder', 'Painel, financeiro, totais, custo e lucro', 'PDF e mensagens não mudam'],
  },
  {
    icone: GraduationCap,
    titulo: 'Fácil de começar',
    texto: 'O painel mostra os primeiros passos, um de cada vez, e a conta já vem com produtos de exemplo para testar.',
    itens: ['"Como usar" em todas as telas', 'Passo a passo com vídeos curtos', 'Central de ajuda aberta a todos'],
  },
]

/** "Do orçamento à entrega": o fluxo que o sistema cobre */
export const FLUXO: { icone: LucideIcon; titulo: string; texto: string }[] = [
  { icone: MessageCircle, titulo: 'Orçamento', texto: 'Calculado na hora e enviado no WhatsApp, com o PDF.' },
  { icone: CheckCheck, titulo: 'Aprovação', texto: 'O cliente aprova pelo WhatsApp ou pelo link.' },
  { icone: Zap, titulo: 'Vira pedido', texto: 'Sozinho, com as parcelas no contas a receber.' },
  { icone: Palette, titulo: 'Arte', texto: 'Só nos itens que precisam. O resto já segue.' },
  { icone: Factory, titulo: 'Produção', texto: 'Ordem de produção com etapas, máquina e prazo.' },
  { icone: ClipboardList, titulo: 'Avisos', texto: 'Pronto, saiu para entrega: o cliente sabe sem ligar.' },
  { icone: Receipt, titulo: 'Financeiro', texto: 'Recebido, a receber e o lucro de cada pedido.' },
]

/** Seção WhatsApp: o que sai pelo número da gráfica */
export const WHATSAPP_ITENS: { titulo: string; texto: string }[] = [
  {
    titulo: 'Orçamento completo na mensagem',
    texto: 'Itens, total, entrada e parcelas, prazo de produção e validade em destaque, com o PDF junto. O cliente aprova ali mesmo: toca em Aprovado ou responde 1, como você preferir.',
  },
  {
    titulo: 'Avisos do pedido, sozinhos',
    texto: 'Pedido confirmado, pronto para retirada (com endereço, horário, o que falta pagar e a chave Pix), saiu para entrega e pagamento recebido.',
  },
  {
    titulo: 'Arte na conversa',
    texto: 'Os arquivos vão junto (imagem ou PDF), uma mensagem por pedido. Quando o cliente aprova por ali, você marca todas as artes num clique.',
  },
  {
    titulo: 'Com educação de WhatsApp',
    texto: 'Só manda no horário comercial e junta os avisos do mesmo pedido: nada de mensagem repetida ou fora de hora.',
  },
]

export const VITRINE_ITENS: { titulo: string; texto: string }[] = [
  { titulo: 'No celular, parece um app', texto: 'Barra de navegação embaixo, fotos que passam com o dedo e busca rápida. Feito primeiro para o celular, onde o seu cliente está.' },
  { titulo: 'Estimativa enquanto digita', texto: 'O cliente informa as medidas e já vê quanto fica, antes mesmo de pedir. Menos "quanto custa?" e mais pedido certo.' },
  { titulo: 'Lista enviada pelo WhatsApp', texto: 'O cliente monta a lista com medidas e acabamentos e manda pelo WhatsApp. O pedido chega no sistema e vira orçamento com um clique.' },
  { titulo: 'Seu endereço, seu domínio', texto: 'Escolha o endereço suagrafica.grafygo.com.br ou use o seu próprio www.suagrafica.com.br.' },
]

/** O plano único: tudo o que a gráfica recebe (lista do cartão de preço) */
export const TUDO_INCLUIDO: string[] = [
  'Orçamentos calculados na hora, com PDF da sua marca',
  'Orçamento e avisos do pedido pelo WhatsApp da gráfica',
  'O cliente aprova pelo WhatsApp e o pedido nasce sozinho',
  'Arte, produção e prazos sob controle',
  'Página "Acompanhe seu pedido" para o cliente',
  'Vitrine online: seu catálogo no celular do cliente',
  'Estoque, compras e alerta de material acabando',
  'Financeiro, caixa do balcão e comissões',
  'Relatórios de vendas e lucro',
  'Usuários ilimitados, cada um com o seu acesso',
]

/** O que vem junto com a assinatura */
export const SEMPRE_INCLUSO: string[] = ['Atualizações e backup diário', 'Suporte pelo WhatsApp e e-mail', 'No computador e no celular', 'Sem fidelidade: cancele quando quiser']

export interface PrecoFaq {
  mensal: string
  anual: string | null
}

/** Dúvidas frequentes; a do preço usa os valores do painel (sem eles, fala sem número) */
export function perguntas(preco: PrecoFaq | null): { pergunta: string; resposta: string }[] {
  const valores = preco
    ? `${preco.mensal} por mês${preco.anual ? `, ou ${preco.anual} pagando o ano de uma vez (2 meses grátis)` : ''}`
    : 'um valor mensal fixo, com 2 meses grátis pagando o ano de uma vez'
  return [
    {
      pergunta: 'Quanto custa?',
      resposta: `Um plano só, com tudo incluído: ${valores}. WhatsApp automático, vitrine online e usuários ilimitados já estão no preço, sem cobrança por mensagem e sem pacote extra.`,
    },
    {
      pergunta: 'Preciso de cartão de crédito para testar?',
      resposta: 'Não. Você cria a conta com nome, e-mail e senha e usa tudo por 14 dias, inclusive o WhatsApp automático e a vitrine. Só informa a forma de pagamento se quiser continuar.',
    },
    {
      pergunta: 'Preciso de outro número de WhatsApp? Pago por mensagem?',
      resposta:
        'Não e não. O sistema usa o número que a gráfica já tem: você conecta lendo um QR code, como no WhatsApp Web, e o celular continua funcionando normalmente. Não há cobrança por mensagem. Os envios automáticos são só os avisos dos pedidos para os seus clientes, nunca propaganda em massa.',
    },
    {
      pergunta: 'Meu cliente precisa instalar alguma coisa?',
      resposta:
        'Não. Ele recebe tudo no WhatsApp que já usa e aprova o orçamento ali mesmo, tocando em Aprovado ou respondendo 1 (ou "aprovado"), como a sua gráfica preferir. Se quiser, abre o link do pedido no celular, sem senha e sem aplicativo: vê a situação, a previsão de entrega, os itens, a arte, o que já pagou e o que falta, e onde retirar.',
    },
    {
      pergunta: 'E se eu não quiser que o cliente veja a arte antes?',
      resposta:
        'Você decide. Mandar a arte para o cliente é uma escolha, não uma etapa obrigatória: a aprovação pode ser interna, com um clique em "Cliente aprovou todas as artes". E no orçamento você já marca quais itens precisam de arte; os outros vão direto para a produção.',
    },
    {
      pergunta: 'Posso esconder o faturamento da tela?',
      resposta:
        'Pode. O olho no topo do sistema borra os valores na hora, como nos apps de banco. Cada usuário escolhe o que esconder: o painel, o financeiro, os totais dos orçamentos, custo e lucro, ou tudo. PDFs e mensagens para o cliente continuam com os valores.',
    },
    {
      pergunta: 'O que acontece quando o teste acaba?',
      resposta:
        'Se você assinar durante o teste, a primeira cobrança só vence no último dia dele: você não perde nenhum dia. Se não assinar, o acesso fica limitado e os seus dados continuam guardados, caso queira voltar.',
    },
    {
      pergunta: 'Como funciona o pagamento?',
      resposta:
        'Pelo Asaas, instituição autorizada pelo Banco Central: cartão de crédito (renova sozinho), PIX ou boleto. Pagando o ano de uma vez, você ganha 2 meses. O comprovante de cada pagamento fica no sistema.',
    },
    {
      pergunta: 'Tem fidelidade? Posso cancelar?',
      resposta: 'Não há fidelidade nem multa. Você cancela pelo próprio sistema, quando quiser, e continua usando até o fim do período já pago.',
    },
    {
      pergunta: 'Vou conseguir aprender sozinho?',
      resposta:
        'Sim. Ao criar a conta, o painel mostra os primeiros passos, um de cada vez, e você já começa com produtos de exemplo para fazer um orçamento no primeiro minuto. Cada tela tem o botão "Como usar", com vídeo curto e passo a passo, e a central de ajuda fica aberta em grafygo.com.br/ajuda.',
    },
    {
      pergunta: 'Funciona no celular?',
      resposta: 'Funciona no navegador do computador, do tablet e do celular, sem instalar nada. Seus clientes aprovam orçamentos, veem a arte e acompanham o pedido pelo celular também.',
    },
    {
      pergunta: 'Consigo trazer meus clientes e produtos?',
      resposta:
        'Sim. Para empresas, basta digitar o CNPJ: nome, nome fantasia, telefone e endereço vêm da Receita Federal. Os produtos você cadastra com o custo e o preço (a conta já vem com exemplos), e os clientes também chegam pelos pedidos da vitrine. Nosso suporte ajuda no começo.',
    },
    {
      pergunta: 'Meus dados ficam seguros?',
      resposta: 'Os dados de cada empresa ficam separados, com conexão protegida, senhas guardadas com segurança, permissões por usuário e cópia de segurança diária. Seguimos a LGPD.',
    },
    {
      pergunta: 'A vitrine online precisa de site ou domínio?',
      resposta: 'Não. Ela já vem com um endereço suagrafica.grafygo.com.br, que você escolhe. Se tiver um domínio próprio (www.suagrafica.com.br), o site pode abrir nele também.',
    },
  ]
}
