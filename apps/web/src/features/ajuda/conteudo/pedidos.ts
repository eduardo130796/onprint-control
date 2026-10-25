import type { Tutorial } from '../tipos'

/** Do orçamento enviado ao pedido em produção. Imagens e vídeo: scripts/tutoriais/{slug}.py */
export const TUTORIAIS_PEDIDOS: Tutorial[] = [
  {
    slug: 'enviar-orcamento',
    titulo: 'Enviar o orçamento e receber a aprovação',
    resumo: 'Mande o orçamento pelo WhatsApp da gráfica, com o PDF, e o cliente aprova numa enquete, sem ligar para você.',
    categoria: 'vendas',
    minutos: 2,
    telas: [],
    video: { arquivo: '/ajuda/enviar-orcamento/video.mp4', capa: '/ajuda/enviar-orcamento/capa.webp', segundos: 89 },
    passos: [
      {
        titulo: 'Toque em "Enviar orçamento"',
        texto: 'Abra o orçamento salvo e toque em "Enviar orçamento", no topo.',
        imagem: '/ajuda/enviar-orcamento/1.webp',
      },
      {
        titulo: 'Confira a mensagem e o PDF',
        texto: 'A mensagem já vem pronta, como o cliente vai ver: itens, total, pagamento, prazo, validade e o link. O orçamento em PDF vai junto e, logo depois, a enquete de aprovação.',
        imagem: '/ajuda/enviar-orcamento/2.webp',
        dica: 'Quer mudar o texto só desta vez? Toque em "Editar texto". O modelo fica em Ajustes → Mensagens prontas.',
      },
      {
        titulo: 'Envie pelo WhatsApp da gráfica',
        texto: 'Toque em "Enviar para…": a mensagem sai do número da própria gráfica e fica registrada. O orçamento passa de Rascunho para Enviado.',
        imagem: '/ajuda/enviar-orcamento/3.webp',
        dica: 'WhatsApp ainda não conectado? O mesmo botão vira "Abrir no WhatsApp", com o texto pronto. Também dá para "Copiar".',
      },
      {
        titulo: 'O cliente aprova pela enquete',
        texto: 'Logo depois do orçamento chega a enquete: o cliente toca em ✅ Aprovado ou em ✏️ Quero modificações. Se preferir, ele responde 1 ou 2, ou escreve "aprovado". O orçamento se aprova sozinho; quem pede modificação volta para negociação e o vendedor é avisado.',
        imagem: '/ajuda/enviar-orcamento/4.webp',
        dica: 'Enquete ou "responda 1 ou 2"? Você escolhe na tela WhatsApp, em "Como o cliente aprova o orçamento".',
      },
      {
        titulo: 'Pelo link, ele vê tudo e também aprova',
        texto: 'O link no fim da mensagem abre o orçamento completo, no celular ou no computador: itens, total, validade e o pagamento combinado. Ele pode aprovar ou recusar por ali, sem senha.',
        imagem: '/ajuda/enviar-orcamento/5.webp',
        dica: 'Prefere mandar só o PDF ou só o link? Use "PDF" ou "Mais" → "Copiar link de aprovação".',
      },
      {
        titulo: 'Respondeu de outro jeito? Um clique',
        texto: 'Se o cliente disse "pode fazer" de outro jeito na conversa, toque em "Cliente aprovou pelo WhatsApp". Aprovou por telefone ou no balcão? Use "Mais" → "Registrar aprovação".',
        imagem: '/ajuda/enviar-orcamento/6.webp',
      },
      {
        titulo: 'Aprovado: o pedido já nasce',
        texto: 'O orçamento fica Aprovado, com quem aprovou, a data e a hora. Com a criação automática ligada, ele já vira pedido, com a entrada e as parcelas combinadas nas contas a receber.',
        imagem: '/ajuda/enviar-orcamento/7.webp',
      },
    ],
    proximos: ['orcamento-em-pedido', 'conectar-whatsapp'],
  },
  {
    slug: 'orcamento-em-pedido',
    titulo: 'O orçamento aprovado vira pedido',
    resumo: 'Quando o cliente aprova, o pedido é criado sozinho, com a entrada e as parcelas combinadas no orçamento.',
    categoria: 'vendas',
    minutos: 1,
    telas: ['/pedidos'],
    video: { arquivo: '/ajuda/orcamento-em-pedido/video.mp4', capa: '/ajuda/orcamento-em-pedido/capa.webp', segundos: 62 },
    passos: [
      {
        titulo: 'Deixe a criação automática ligada',
        texto: 'Em Ajustes → Dados da empresa, no quadro "Pedidos", marque "Quando o cliente aprovar o orçamento, criar o pedido automaticamente" e escolha a entrega e a prioridade padrão.',
        imagem: '/ajuda/orcamento-em-pedido/1.webp',
        dica: 'Vale para a aprovação pela enquete do WhatsApp, pelo link, por "Cliente aprovou pelo WhatsApp" e por "Registrar aprovação".',
      },
      {
        titulo: 'O cliente aprovou: o pedido já existe',
        texto: 'No orçamento aprovado aparece o pedido criado, com a previsão de entrega e as contas a receber: a entrada e as parcelas do bloco "Pagamento" do orçamento.',
        imagem: '/ajuda/orcamento-em-pedido/2.webp',
        dica: 'Os itens marcados com "Precisa de arte" ganham uma arte no pedido. Os outros vão direto para a produção.',
      },
      {
        titulo: 'Confira o pedido',
        texto: 'Toque em "Abrir pedido". No topo, você vê o status, a data de entrega, quantas artes já foram aprovadas e o total.',
        imagem: '/ajuda/orcamento-em-pedido/3.webp',
      },
      {
        titulo: 'Entrada e parcelas no Financeiro',
        texto: 'Na aba "Financeiro" ficam a entrada e as parcelas, com o vencimento de cada uma. Quando o cliente pagar, toque em "Receber".',
        imagem: '/ajuda/orcamento-em-pedido/4.webp',
      },
      {
        titulo: 'Acompanhe no Kanban',
        texto: 'Em Pedidos → Kanban, cada coluna é um status: Aguardando arte, Arte em aprovação, Em produção, Pronto… O cartão mostra quanto falta pagar, as artes e as OPs.',
        imagem: '/ajuda/orcamento-em-pedido/5.webp',
        dica: 'O status anda sozinho: quando a arte é aprovada e as OPs andam, o pedido muda de coluna.',
      },
      {
        titulo: 'Criação automática desligada?',
        texto: 'Aí o orçamento fica Aprovado e alguém cria o pedido: toque em "Converter em pedido", confira a entrada, as parcelas (vêm do orçamento), a entrega e a prioridade, e toque em "Criar pedido".',
        imagem: '/ajuda/orcamento-em-pedido/6.webp',
      },
    ],
    proximos: ['aprovacao-arte', 'receber-pagamento'],
  },
  {
    slug: 'aprovacao-arte',
    titulo: 'Aprovar a arte (com a equipe ou com o cliente)',
    resumo: 'Envie o arquivo no pedido e marque como aprovada, ou mande ao cliente uma mensagem só, com as artes e um link para aprovar tudo.',
    categoria: 'vendas',
    minutos: 2,
    telas: ['/arte'],
    video: { arquivo: '/ajuda/aprovacao-arte/video.mp4', capa: '/ajuda/aprovacao-arte/capa.webp', segundos: 119 },
    passos: [
      {
        titulo: 'Abra a aba "Arte" do pedido',
        texto: 'No pedido, toque na aba "Arte". No topo, você vê quantas artes já foram aprovadas; embaixo, cada item tem a sua arte, com a versão e o status.',
        imagem: '/ajuda/aprovacao-arte/1.webp',
      },
      {
        titulo: 'Item sem arte? Avise',
        texto: 'Em "Não precisa de arte ▾", escolha "Este item não precisa de arte" ou "Arte do cliente já pronta". O item deixa de travar o pedido e a OP segue direto para a produção.',
        imagem: '/ajuda/aprovacao-arte/2.webp',
        dica: 'Isso também se decide no orçamento, em "Precisa de arte" de cada item.',
      },
      {
        titulo: 'Envie o arquivo',
        texto: 'Toque em "Escolher arquivo" e mande a arte: PDF, imagem, CDR, AI e outros, até 200 MB. A miniatura aparece na hora.',
        imagem: '/ajuda/aprovacao-arte/3.webp',
        dica: 'Precisou corrigir? Envie de novo: vira a versão 2, e as anteriores ficam guardadas.',
      },
      {
        titulo: 'O cliente já aprovou com você?',
        texto: 'Toque em "Marcar como aprovada ▾" e diga como ele aprovou: pelo WhatsApp, pessoalmente, por telefone, por e-mail ou aprovação interna. Fica registrado na conversa da arte.',
        imagem: '/ajuda/aprovacao-arte/4.webp',
        dica: 'Várias artes no pedido? "Cliente aprovou todas as artes" aprova todas num clique.',
      },
      {
        titulo: 'Ou mande para o cliente ver antes',
        texto: 'Toque em "Enviar para o cliente": vai uma mensagem só para o pedido, com os arquivos das artes escolhidas e um link para aprovar todas.',
        imagem: '/ajuda/aprovacao-arte/5.webp',
      },
      {
        titulo: 'O cliente aprova pelo celular',
        texto: 'O link abre a página "Acompanhe seu pedido", com as artes em tamanho grande. Ele digita o nome, confirma que conferiu e toca em "Aprovar a arte" (ou "Aprovar todas as artes"). Se precisar mudar algo, toca em "Pedir ajuste".',
        imagem: '/ajuda/aprovacao-arte/6.webp',
        dica: 'Se ele responder "aprovado" na conversa, é só tocar em "Marcar como aprovada" no pedido.',
      },
      {
        titulo: 'Aprovada: a produção segue',
        texto: 'No pedido, a arte fica Aprovada, com quem aprovou e quando. O pedido vai para Em produção e a OP do item já pode seguir para a impressão.',
        imagem: '/ajuda/aprovacao-arte/7.webp',
      },
    ],
    proximos: ['acompanhar-producao', 'orcamento-em-pedido'],
  },
  {
    slug: 'acompanhar-producao',
    titulo: 'Acompanhar a produção no kanban',
    resumo: 'Veja cada ordem de produção por etapa, mova as OPs, imprima a ficha e a etiqueta e confira a carga das máquinas.',
    categoria: 'producao',
    minutos: 2,
    telas: ['/producao', '/pcp'],
    video: { arquivo: '/ajuda/acompanhar-producao/video.mp4', capa: '/ajuda/acompanhar-producao/capa.webp', segundos: 80 },
    passos: [
      {
        titulo: 'Cada coluna é uma etapa',
        texto: 'Em Produção, o kanban mostra as ordens de produção (OPs) por etapa: Fila, Pré-impressão, Impressão, Acabamento, Conferência e Concluído.',
        imagem: '/ajuda/acompanhar-producao/1.webp',
        dica: 'Use os filtros do topo para ver só uma máquina, um responsável ou as atrasadas.',
      },
      {
        titulo: 'Abra o cartão da OP',
        texto: 'Cada cartão é uma OP: cliente, item, prazo, máquina e a arte na capa. Toque em "Abrir" para ver os detalhes e as etapas por onde ela passou.',
        imagem: '/ajuda/acompanhar-producao/2.webp',
      },
      {
        titulo: 'Mude a etapa',
        texto: 'Em "Abrir OP", escolha a próxima etapa em "Mover para". A mudança fica no histórico, com a hora e quem moveu.',
        imagem: '/ajuda/acompanhar-producao/3.webp',
        dica: 'No kanban, também dá para arrastar o cartão de uma coluna para outra.',
      },
      {
        titulo: 'Imprima a ficha da OP',
        texto: 'A ficha leva a arte, as medidas, a máquina e as etapas para a equipe marcar à mão. Toque em "Ficha da OP" e depois em "Imprimir".',
        imagem: '/ajuda/acompanhar-producao/4.webp',
      },
      {
        titulo: 'Etiqueta para a entrega',
        texto: 'No cartão, toque em "Etiqueta". Escolha o papel e onde começar na folha, e imprima ou baixe em PDF.',
        imagem: '/ajuda/acompanhar-producao/5.webp',
      },
      {
        titulo: 'Veja a carga das máquinas no PCP',
        texto: 'Em Produção → PCP / Cockpit, você vê as horas de trabalho de cada máquina na semana, a programação dos próximos dias e as OPs atrasadas, com o botão "Reprogramar".',
        imagem: '/ajuda/acompanhar-producao/6.webp',
      },
    ],
    proximos: ['receber-pagamento', 'aprovacao-arte'],
  },
]
