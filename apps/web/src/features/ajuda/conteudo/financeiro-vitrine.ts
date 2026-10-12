import type { Tutorial } from '../tipos'

/** Financeiro, caixa (PDV), vitrine e divulgação. Imagens e vídeo: scripts/tutoriais/{slug}.py */
export const TUTORIAIS_FINANCEIRO_VITRINE: Tutorial[] = [
  {
    slug: 'receber-pagamento',
    titulo: 'Receber um pagamento (dar baixa)',
    resumo: 'Marque como recebida a parcela que o cliente pagou, com a forma de pagamento, e veja o dinheiro entrar no fluxo de caixa.',
    categoria: 'financeiro',
    minutos: 1,
    telas: ['/financeiro'],
    video: { arquivo: '/ajuda/receber-pagamento/video.mp4', capa: '/ajuda/receber-pagamento/capa.webp', segundos: 72 },
    passos: [
      {
        titulo: 'Abra as contas a receber',
        texto: 'No menu Financeiro, toque em "Contas a receber". Ali estão as parcelas dos pedidos e os lançamentos avulsos. As atrasadas aparecem em destaque.',
        imagem: '/ajuda/receber-pagamento/1.webp',
        dica: 'No filtro de situação, escolha "Atrasadas" para ver só quem está devendo.',
      },
      {
        titulo: 'Encontre a conta',
        texto: 'Digite na busca o nome do cliente, o número do pedido ou parte da descrição. Toque na conta para abrir e depois em "Receber".',
        imagem: '/ajuda/receber-pagamento/2.webp',
      },
      {
        titulo: 'Escolha a forma de pagamento',
        texto: 'O valor já vem preenchido com o que falta receber. Escolha a forma de pagamento (PIX, dinheiro, cartão…) e confira a data.',
        imagem: '/ajuda/receber-pagamento/3.webp',
        dica: 'Recebeu só uma parte? Mude o valor: o restante continua em aberto. Juros, multa e desconto também têm campo próprio.',
      },
      {
        titulo: 'Confirme a baixa',
        texto: 'Toque em "Confirmar baixa". A conta fica paga e o recebimento aparece na lista de pagamentos dela.',
        imagem: '/ajuda/receber-pagamento/4.webp',
        dica: 'Lançou errado? No mesmo lugar dá para estornar o pagamento.',
      },
      {
        titulo: 'Acompanhe o fluxo de caixa',
        texto: 'Em Financeiro → Fluxo de caixa você vê o que já entrou e saiu e o que está previsto para os próximos dias.',
        imagem: '/ajuda/receber-pagamento/5.webp',
      },
      {
        titulo: 'E as contas a pagar?',
        texto: 'Aluguel, fornecedores e outras despesas ficam em Financeiro → Contas a pagar. Para pagar, é igual: abra a conta e toque em "Pagar".',
        imagem: '/ajuda/receber-pagamento/6.webp',
      },
    ],
    proximos: ['venda-balcao', 'orcamento-em-pedido'],
  },
  {
    slug: 'venda-balcao',
    titulo: 'Vender no balcão (PDV)',
    resumo: 'Venda cópias, plastificação e produtos prontos em poucos toques, com troco calculado e tudo registrado no caixa.',
    categoria: 'financeiro',
    minutos: 1,
    telas: ['/caixa'],
    video: { arquivo: '/ajuda/venda-balcao/video.mp4', capa: '/ajuda/venda-balcao/capa.webp', segundos: 62 },
    passos: [
      {
        titulo: 'Abra a venda balcão',
        texto: 'No menu Financeiro, toque em "Venda balcão (PDV)". O caixa precisa estar aberto: no topo aparecem o número do caixa e o dinheiro na gaveta.',
        imagem: '/ajuda/venda-balcao/1.webp',
        dica: 'Caixa fechado? A tela pede o troco inicial (o dinheiro que está na gaveta). Toque em "Abrir caixa" e pronto.',
      },
      {
        titulo: 'Escolha o produto',
        texto: 'Busque pelo nome ou código e toque no produto para pôr na venda. Aparecem os produtos vendidos por unidade.',
        imagem: '/ajuda/venda-balcao/2.webp',
      },
      {
        titulo: 'Ajuste as quantidades',
        texto: 'Use o + e o − para mudar a quantidade. Adicione outros produtos do mesmo jeito. Se quiser, informe o cliente e um desconto.',
        imagem: '/ajuda/venda-balcao/3.webp',
      },
      {
        titulo: 'Escolha a forma de pagamento',
        texto: 'Toque na forma de pagamento. Em dinheiro, digite quanto o cliente deu: o troco aparece na hora. Dá para dividir em mais de uma forma.',
        imagem: '/ajuda/venda-balcao/4.webp',
      },
      {
        titulo: 'Finalize a venda',
        texto: 'Toque em "Finalizar venda". Ela aparece em "Vendas deste caixa", baixa o estoque e entra no financeiro.',
        imagem: '/ajuda/venda-balcao/5.webp',
        dica: 'Errou? Toque em "Cancelar" na venda, em "Vendas deste caixa".',
      },
      {
        titulo: 'Sangria e fechamento',
        texto: 'Tirou dinheiro da gaveta? Registre uma "Sangria" com o valor e o motivo. No fim do dia, toque em "Fechar caixa" e confira o contado com o sistema.',
        imagem: '/ajuda/venda-balcao/6.webp',
        dica: 'Colocou mais troco na gaveta? Use "Suprimento".',
      },
    ],
    proximos: ['receber-pagamento'],
  },
  {
    slug: 'ligar-vitrine',
    titulo: 'Colocar o seu site (vitrine) no ar',
    resumo: 'Ligue a vitrine, escolha os produtos que aparecem e receba listas de orçamento dos clientes pelo site.',
    categoria: 'vitrine',
    minutos: 5,
    telas: ['/vitrine'],
    video: { arquivo: '/ajuda/ligar-vitrine/video.mp4', capa: '/ajuda/ligar-vitrine/capa.webp', segundos: 82 },
    passos: [
      {
        titulo: 'Ligue o site',
        texto: 'No menu Vitrine, toque em "Configurar vitrine" e ligue o interruptor do primeiro quadro (fica "Site ligado"). Pronto: qualquer pessoa com o endereço vê os seus produtos.',
        imagem: '/ajuda/ligar-vitrine/1.webp',
      },
      {
        titulo: 'Endereço e QR code',
        texto: 'Ao lado aparece o endereço do seu site, com os botões "Copiar" e "Abrir site". Imprima o QR code para o balcão e os cartões.',
        imagem: '/ajuda/ligar-vitrine/2.webp',
      },
      {
        titulo: 'Apresentação, contato e banners',
        texto: 'Escreva o título, o slogan e o "Quem somos". Escolha se mostra WhatsApp, telefone e endereço e coloque até 3 banners no topo. Depois toque em "Salvar vitrine".',
        imagem: '/ajuda/ligar-vitrine/3.webp',
        dica: 'Os contatos vêm dos Dados da empresa. Mudou o telefone? Mude lá.',
      },
      {
        titulo: 'Publique os produtos',
        texto: 'Em Vitrine → Produtos na vitrine, ligue "Publicado" nos produtos que devem aparecer no site. Os outros ficam como rascunho.',
        imagem: '/ajuda/ligar-vitrine/4.webp',
      },
      {
        titulo: 'Preço e destaque',
        texto: 'Toque no produto para escolher como o preço aparece (preço fixo, "a partir de" ou sob consulta), mudar o texto de venda e as fotos. "Destaque" põe o produto no início do site.',
        imagem: '/ajuda/ligar-vitrine/5.webp',
        dica: 'Produto com foto vende mais. Fotos quadradas ficam melhores.',
      },
      {
        titulo: 'Veja o seu site',
        texto: 'É assim que o cliente vê: banners, categorias e os produtos mais procurados, com o botão do WhatsApp sempre à mão.',
        imagem: '/ajuda/ligar-vitrine/6.webp',
      },
      {
        titulo: 'A lista de orçamento',
        texto: 'O cliente abre o produto, informa quantidade, medidas e acabamentos e põe na "Lista de orçamento". Quando ele envia, o pedido chega em Vitrine → Pedidos do site.',
        imagem: '/ajuda/ligar-vitrine/7.webp',
      },
    ],
    proximos: ['divulgar-whatsapp', 'cadastrar-produto'],
  },
  {
    slug: 'divulgar-whatsapp',
    titulo: 'Divulgar no WhatsApp (imagem, mensagem e catálogo)',
    resumo: 'Gere a arte do produto para o Status, mande a mensagem pronta com o link e envie um catálogo em PDF.',
    categoria: 'vitrine',
    minutos: 2,
    telas: ['/vitrine/produtos'],
    video: { arquivo: '/ajuda/divulgar-whatsapp/video.mp4', capa: '/ajuda/divulgar-whatsapp/capa.webp', segundos: 85 },
    passos: [
      {
        titulo: 'Toque em compartilhar',
        texto: 'Em Vitrine → Produtos na vitrine, toque no ícone de compartilhar do produto. A arte sai pronta, com a foto, o preço e o contato da gráfica.',
        imagem: '/ajuda/divulgar-whatsapp/1.webp',
      },
      {
        titulo: 'Status ou post',
        texto: 'Escolha "Status" (em pé, para o Status do WhatsApp e Stories) ou "Post" (quadrado). Toque em "Baixar PNG" ou em "Compartilhar" para postar.',
        imagem: '/ajuda/divulgar-whatsapp/2.webp',
      },
      {
        titulo: 'Mande a mensagem pronta',
        texto: 'A mensagem já vem com o nome do produto, o preço e o link. Escolha um cliente ou "Qualquer contato" e toque em "Abrir o WhatsApp": a conversa abre com o texto pronto.',
        imagem: '/ajuda/divulgar-whatsapp/3.webp',
        dica: 'Quer divulgar o site inteiro? Em Configurar vitrine, toque em "Divulgar a vitrine".',
      },
      {
        titulo: 'Monte o catálogo em PDF',
        texto: 'Toque em "Catálogo em PDF". Escolha os produtos (ou "Só destaques"), dê um título para a capa e decida se mostra os preços.',
        imagem: '/ajuda/divulgar-whatsapp/4.webp',
      },
      {
        titulo: 'Gere e envie',
        texto: 'Toque em "Gerar catálogo". Depois é só baixar o PDF, copiar o link do catálogo ou mandar pelo WhatsApp: o cliente abre no celular, sem baixar nada.',
        imagem: '/ajuda/divulgar-whatsapp/5.webp',
      },
      {
        titulo: 'Veja os pedidos que chegam',
        texto: 'As listas de orçamento enviadas pelo site aparecem em Vitrine → Pedidos do site (as solicitações de orçamento com origem "Site"). Toque no ícone "Criar orçamento" da linha para responder o cliente.',
        imagem: '/ajuda/divulgar-whatsapp/6.webp',
      },
    ],
    proximos: ['fazer-orcamento', 'enviar-orcamento'],
  },
]
