import type { Tutorial } from '../tipos'

/** Orçamentos e pedidos. Imagens e vídeo: scripts/tutoriais/{slug}.py */
export const TUTORIAIS_VENDAS: Tutorial[] = [
  {
    slug: 'fazer-orcamento',
    titulo: 'Fazer um orçamento em segundos',
    resumo: 'Escolha o cliente e o produto, informe as medidas e o preço sai na hora, com o lucro estimado.',
    categoria: 'vendas',
    minutos: 1,
    telas: ['/orcamentos'],
    video: { arquivo: '/ajuda/fazer-orcamento/video.mp4', capa: '/ajuda/fazer-orcamento/capa.webp', segundos: 60 },
    passos: [
      {
        titulo: 'Abra um orçamento novo',
        texto: 'No painel, toque em "Novo orçamento". Também dá pelo menu Comercial → Orçamentos, pelo atalho "Novo orçamento" ou pela busca (Ctrl+K).',
        imagem: '/ajuda/fazer-orcamento/1.webp',
      },
      {
        titulo: 'Escolha o cliente',
        texto: 'Toque em "Buscar cliente" e digite parte do nome, do telefone ou do CNPJ. Cliente novo? Cadastre na hora pelo mesmo campo.',
        imagem: '/ajuda/fazer-orcamento/2.webp',
      },
      {
        titulo: 'Escolha o produto ou serviço',
        texto: 'Digite parte do nome. A lista mostra o código e o preço de cada produto, do jeito que está no seu catálogo.',
        imagem: '/ajuda/fazer-orcamento/3.webp',
      },
      {
        titulo: 'Informe a quantidade e as medidas',
        texto: 'Em produtos por m² ou metro linear, preencha a largura e a altura em metros. O preço é calculado na hora, junto com o custo e o lucro estimado.',
        imagem: '/ajuda/fazer-orcamento/4.webp',
        dica: 'Precisa de outro item? Toque em "Adicionar item". O botão de copiar duplica um item com as mesmas medidas.',
      },
      {
        titulo: 'Acabamentos e arte',
        texto: 'Ilhós, bainha, bastão, criação de arte… Cada acabamento soma ao preço do item; os obrigatórios já vêm marcados. "Precisa de arte" diz se o pedido espera a arte deste item antes de produzir.',
        imagem: '/ajuda/fazer-orcamento/5.webp',
        dica: 'Item que não leva arte (ou que o cliente manda pronta)? Desmarque "Precisa de arte": a produção não fica esperando.',
      },
      {
        titulo: 'Combine o pagamento',
        texto: 'No bloco "Pagamento", informe a entrada (em %), em quantas parcelas fica o saldo e de quantos em quantos dias. O resumo mostra os valores; eles vão na mensagem, no PDF e viram as contas a receber do pedido.',
        imagem: '/ajuda/fazer-orcamento/6.webp',
        dica: 'Saldo com 0 parcelas = pago na retirada ou na entrega. O padrão de cada orçamento novo fica em Ajustes → Dados da empresa.',
      },
      {
        titulo: 'Confira o total e salve',
        texto: 'Se quiser, dê desconto, acrescente frete ou instalação e ajuste a validade. Toque em "Criar orçamento": ele fica salvo e pronto para "Enviar orçamento" pelo WhatsApp, com o PDF.',
        imagem: '/ajuda/fazer-orcamento/7.webp',
        dica: 'O lucro estimado aparece em verde quando a margem está boa. Se ficar abaixo do mínimo que você definiu, o sistema avisa.',
      },
    ],
    proximos: ['enviar-orcamento', 'orcamento-em-pedido'],
  },
]
