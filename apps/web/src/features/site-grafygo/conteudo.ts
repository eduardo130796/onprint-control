import {
  BarChart3,
  Boxes,
  Calculator,
  CheckCheck,
  ClipboardList,
  Factory,
  Palette,
  Receipt,
  ShoppingBag,
  Truck,
  Wallet,
  type LucideIcon,
} from 'lucide-react'

/** Textos da página de venda (grafygo.com.br). Preços e planos vêm da API (/plataforma/planos-publicos). */

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
    texto: 'Preço calculado por m², metro linear, milheiro, hora ou unidade, com acabamentos e margem que você define.',
    itens: ['PDF com a sua marca e cores', 'Aprovação pelo link, no celular do cliente', 'Kanban do que está em negociação'],
  },
  {
    icone: ClipboardList,
    titulo: 'Pedidos sem nada esquecido',
    texto: 'O orçamento aprovado vira pedido com um clique: itens, prazos, pagamentos e entregas num só lugar.',
    itens: ['Sinal e parcelas com o que falta pagar', 'Etiquetas e ficha para o entregador', 'Status que todo mundo enxerga'],
  },
  {
    icone: Palette,
    titulo: 'Arte aprovada pelo cliente',
    texto: 'Mande a arte por link e o cliente aprova ou pede ajustes ali mesmo. Fica tudo registrado no pedido.',
    itens: ['Histórico de versões', 'Aprovação com data e hora', 'Nada de "eu não aprovei isso"'],
  },
  {
    icone: Factory,
    titulo: 'Produção organizada',
    texto: 'Ordens de produção com etapas, máquinas e prazos. O kanban mostra o que está atrasado antes de virar problema.',
    itens: ['PCP com a carga de cada máquina', 'Ficha da OP com QR code', 'Prazo de entrega sempre à vista'],
  },
  {
    icone: ShoppingBag,
    titulo: 'Catálogo e precificação',
    texto: 'Produtos, insumos, acabamentos e máquinas com custo real. Reajuste de preços em massa quando o material sobe.',
    itens: ['Custo por insumo e por hora de máquina', 'Margem e preço mínimo', 'Reajuste por categoria'],
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
    texto: 'Contas a pagar e a receber, fluxo de caixa, comissões e o caixa do balcão (PDV) conversando com os pedidos.',
    itens: ['Venda balcão rápida', 'Calendário de vencimentos', 'Comissão por vendedor'],
  },
  {
    icone: BarChart3,
    titulo: 'Números do negócio',
    texto: 'Vendas, lucratividade, conversão de orçamentos e produção. Decida pelo que os números mostram.',
    itens: ['Painel do dia com o que precisa de atenção', 'Lucro por produto e por cliente', 'Relatórios em PDF'],
  },
]

/** "Do orçamento à entrega": o fluxo que o sistema cobre */
export const FLUXO: { icone: LucideIcon; titulo: string; texto: string }[] = [
  { icone: Calculator, titulo: 'Orçamento', texto: 'Calculado na hora e enviado em PDF ou link.' },
  { icone: CheckCheck, titulo: 'Aprovação', texto: 'O cliente aprova pelo celular, com registro.' },
  { icone: Palette, titulo: 'Arte', texto: 'Prova enviada e aprovada sem idas e vindas.' },
  { icone: Factory, titulo: 'Produção', texto: 'OP no kanban, com etapas e prazo.' },
  { icone: Truck, titulo: 'Entrega', texto: 'Etiqueta, entregador e baixa do pagamento.' },
  { icone: Receipt, titulo: 'Financeiro', texto: 'Recebido, a receber e lucro de cada pedido.' },
]

export const VITRINE_ITENS: { titulo: string; texto: string }[] = [
  { titulo: 'Seu site de produtos, pronto', texto: 'Fotos, preços (ou "sob consulta") e descrições direto do seu catálogo. Fica no ar em minutos.' },
  { titulo: 'Pedido de orçamento organizado', texto: 'O cliente escolhe produtos, medidas e acabamentos. O pedido chega no sistema e vira orçamento com um clique.' },
  { titulo: 'Feito para o WhatsApp', texto: 'Link com foto e preço na prévia, catálogo em PDF com botão "Pedir pelo WhatsApp" em cada produto e artes para Status.' },
  { titulo: 'Com o seu domínio', texto: 'Use suagrafica.grafygo.com.br ou o seu próprio www.suagrafica.com.br.' },
]

/** Todos os planos incluem */
export const INCLUSO: string[] = [
  'Teste grátis de 14 dias com tudo liberado',
  'Documentos com a sua logo e cores',
  'Atualizações sem custo',
  'Backup diário dos seus dados',
  'Acesso pelo computador e pelo celular',
  'Suporte pelo WhatsApp e e-mail',
  'Nota fiscal de cada pagamento',
  'Sem fidelidade: cancele quando quiser',
]

export const PERGUNTAS: { pergunta: string; resposta: string }[] = [
  {
    pergunta: 'Preciso de cartão de crédito para testar?',
    resposta: 'Não. Você cria a conta com nome, e-mail e senha e usa tudo por 14 dias. Só escolhe o plano e a forma de pagamento se quiser continuar.',
  },
  {
    pergunta: 'O que acontece quando o teste acaba?',
    resposta: 'Se você assinar durante o teste, a primeira cobrança só vence no último dia dele: você não perde nenhum dia. Se não assinar, o acesso fica limitado e os seus dados continuam guardados, caso queira voltar.',
  },
  {
    pergunta: 'Como funciona o pagamento?',
    resposta:
      'Pelo Asaas, instituição autorizada pelo Banco Central: cartão de crédito (renova sozinho), PIX ou boleto. No plano anual você paga uma vez por ano e ganha 2 meses. Emitimos nota fiscal de cada pagamento.',
  },
  {
    pergunta: 'Posso trocar de plano ou cancelar?',
    resposta:
      'Sim, a qualquer momento, pelo próprio sistema. Ao subir de plano, os recursos liberam na hora e você paga só a diferença dos dias que faltam. Não há fidelidade nem multa para cancelar.',
  },
  {
    pergunta: 'Funciona no celular?',
    resposta: 'Funciona no navegador do computador, do tablet e do celular, sem instalar nada. Seus clientes aprovam orçamentos e artes pelo celular também.',
  },
  {
    pergunta: 'Consigo trazer meus clientes e produtos?',
    resposta: 'Sim. Você cadastra produtos com o custo e o preço, e os clientes entram aos poucos (ou já chegam pelos pedidos da vitrine). Nosso suporte ajuda na implantação.',
  },
  {
    pergunta: 'Meus dados ficam seguros?',
    resposta: 'Os dados de cada empresa ficam separados, com conexão criptografada, senhas protegidas, permissões por usuário e cópia de segurança diária. Seguimos a LGPD.',
  },
  {
    pergunta: 'A vitrine online precisa de site ou domínio?',
    resposta: 'Não. Ela já vem com um endereço suagrafica.grafygo.com.br. Se você tiver um domínio próprio, é só apontar e o site passa a abrir nele também.',
  },
]
