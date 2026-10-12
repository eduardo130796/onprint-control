import type { Tutorial } from '../tipos'

/** Do orçamento enviado ao pedido em produção. Imagens e vídeo: scripts/tutoriais/{slug}.py */
export const TUTORIAIS_PEDIDOS: Tutorial[] = [
  {
    slug: 'enviar-orcamento',
    titulo: 'Enviar o orçamento e receber a aprovação',
    resumo: 'Mande o orçamento pelo WhatsApp, em PDF ou por link, e o cliente aprova pelo celular, sem ligar para você.',
    categoria: 'vendas',
    minutos: 2,
    telas: [],
    video: { arquivo: '/ajuda/enviar-orcamento/video.mp4', capa: '/ajuda/enviar-orcamento/capa.webp', segundos: 66 },
    passos: [
      {
        titulo: 'Copie a mensagem pronta',
        texto: 'Abra o orçamento salvo e toque em "Copiar mensagem". O texto já vai com o nome do cliente, o valor e o link para aprovar.',
        imagem: '/ajuda/enviar-orcamento/1.webp',
        dica: 'O texto da mensagem pode ser mudado em Ajustes, nos modelos de mensagem.',
      },
      {
        titulo: 'Cole no WhatsApp e marque como enviado',
        texto: 'Cole a mensagem na conversa do cliente. Depois toque em "Mais" → "Marcar como enviado": o orçamento passa de Rascunho para Enviado.',
        dica: 'O aviso "Mensagem copiada" também tem o botão "Marcar como enviado", por alguns segundos.',
        imagem: '/ajuda/enviar-orcamento/2.webp',
      },
      {
        titulo: 'Prefere mandar em PDF?',
        texto: 'Toque em "PDF" para baixar o orçamento com a sua marca e anexe na conversa ou no e-mail. "Imprimir" abre a versão para papel.',
        imagem: '/ajuda/enviar-orcamento/3.webp',
      },
      {
        titulo: 'Ou mande só o link de aprovação',
        texto: 'Em "Mais", toque em "Copiar link de aprovação". É o mesmo link que vai na mensagem, para mandar como quiser.',
        imagem: '/ajuda/enviar-orcamento/4.webp',
      },
      {
        titulo: 'O que o cliente vê',
        texto: 'Pelo link, o cliente vê os itens, o total, a validade e as condições, no celular ou no computador. Não precisa de senha.',
        imagem: '/ajuda/enviar-orcamento/5.webp',
      },
      {
        titulo: 'O cliente aprova sozinho',
        texto: 'Ele digita o nome, marca que leu e aprova, e toca em "Confirmar aprovação". Se não quiser fechar, pode tocar em "Recusar" e contar o motivo.',
        imagem: '/ajuda/enviar-orcamento/6.webp',
      },
      {
        titulo: 'A aprovação aparece no sistema',
        texto: 'O orçamento fica Aprovado, com o nome de quem aprovou, a data e a hora. Agora é só transformar em pedido.',
        imagem: '/ajuda/enviar-orcamento/7.webp',
        dica: 'O cliente aprovou por telefone ou no balcão? Use "Mais" → "Registrar aprovação".',
      },
    ],
    proximos: ['orcamento-em-pedido', 'divulgar-whatsapp'],
  },
  {
    slug: 'orcamento-em-pedido',
    titulo: 'Transformar o orçamento aprovado em pedido',
    resumo: 'Com um toque, o orçamento aprovado vira pedido, com o sinal e as parcelas já lançados nas contas a receber.',
    categoria: 'vendas',
    minutos: 1,
    telas: ['/pedidos'],
    video: { arquivo: '/ajuda/orcamento-em-pedido/video.mp4', capa: '/ajuda/orcamento-em-pedido/capa.webp', segundos: 65 },
    passos: [
      {
        titulo: 'Toque em "Converter em pedido"',
        texto: 'Quando o orçamento está Aprovado, aparece o botão "Converter em pedido" no topo.',
        imagem: '/ajuda/orcamento-em-pedido/1.webp',
      },
      {
        titulo: 'Defina o sinal e as parcelas',
        texto: 'Informe o sinal (em %), em quantas parcelas fica o resto e de quantos em quantos dias. Escolha a entrega e a prioridade. Embaixo, você vê as contas a receber que serão criadas.',
        imagem: '/ajuda/orcamento-em-pedido/2.webp',
        dica: 'O sinal já vem com o percentual padrão da sua empresa, que você muda em Ajustes.',
      },
      {
        titulo: 'Crie o pedido',
        texto: 'Toque em "Criar pedido". O pedido nasce com as contas a receber, a comissão do vendedor e uma arte para cada item.',
        imagem: '/ajuda/orcamento-em-pedido/3.webp',
      },
      {
        titulo: 'Confira o pedido',
        texto: 'Toque em "Abrir pedido". No topo, você vê o status, a data de entrega, quantas artes já foram aprovadas e o total.',
        imagem: '/ajuda/orcamento-em-pedido/4.webp',
      },
      {
        titulo: 'Sinal e parcelas no Financeiro',
        texto: 'Na aba "Financeiro" ficam o sinal e as parcelas, com o vencimento de cada um. Quando o cliente pagar, toque em "Receber".',
        imagem: '/ajuda/orcamento-em-pedido/5.webp',
      },
      {
        titulo: 'Acompanhe no Kanban',
        texto: 'Em Pedidos → Kanban, cada coluna é um status: Aguardando arte, Arte em aprovação, Em produção, Pronto… O cartão mostra quanto falta pagar, as artes e as OPs.',
        imagem: '/ajuda/orcamento-em-pedido/6.webp',
        dica: 'O status anda sozinho: quando a arte é aprovada e as OPs andam, o pedido muda de coluna.',
      },
    ],
    proximos: ['aprovacao-arte', 'receber-pagamento'],
  },
  {
    slug: 'aprovacao-arte',
    titulo: 'Mandar a arte para o cliente aprovar',
    resumo: 'Envie a arte pelo pedido e o cliente aprova ou pede ajuste por um link, com tudo registrado.',
    categoria: 'vendas',
    minutos: 2,
    telas: ['/arte'],
    video: { arquivo: '/ajuda/aprovacao-arte/video.mp4', capa: '/ajuda/aprovacao-arte/capa.webp', segundos: 59 },
    passos: [
      {
        titulo: 'Abra a aba "Arte" do pedido',
        texto: 'No pedido, toque na aba "Arte". Cada item tem a sua arte, com a versão e o status.',
        imagem: '/ajuda/aprovacao-arte/1.webp',
      },
      {
        titulo: 'Envie o arquivo',
        texto: 'Toque em "Escolher arquivo" e mande a arte: PDF, imagem, CDR, AI e outros, até 200 MB. A miniatura aparece na hora.',
        imagem: '/ajuda/aprovacao-arte/2.webp',
        dica: 'Precisou corrigir? Envie de novo: vira a versão 2, e as anteriores ficam guardadas.',
      },
      {
        titulo: 'Mande para o cliente',
        texto: 'Toque em "Enviar ao cliente" e depois em "Copiar mensagem com link". Cole na conversa do WhatsApp do cliente.',
        imagem: '/ajuda/aprovacao-arte/3.webp',
      },
      {
        titulo: 'O cliente vê a arte pelo link',
        texto: 'O cliente abre o link e vê a arte em tamanho grande, com o pedido, a quantidade e as medidas. Não precisa de senha.',
        imagem: '/ajuda/aprovacao-arte/4.webp',
      },
      {
        titulo: 'Se precisar mudar, ele pede ajuste',
        texto: 'Em "Pedir ajuste", o cliente escreve o que quer mudar. O pedido aparece para você no pedido, junto da arte.',
        imagem: '/ajuda/aprovacao-arte/5.webp',
      },
      {
        titulo: 'Se estiver certo, ele aprova',
        texto: 'Em "Aprovar arte", ele digita o nome, marca que conferiu textos, cores e medidas e toca em "Confirmar aprovação".',
        imagem: '/ajuda/aprovacao-arte/6.webp',
      },
      {
        titulo: 'A arte aprovada volta para o pedido',
        texto: 'No pedido, a arte fica Aprovada e a OP do item já pode seguir para a impressão.',
        imagem: '/ajuda/aprovacao-arte/7.webp',
        dica: 'O cliente aprovou por telefone? Use "Registrar aprovação" e informe quem aprovou.',
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
