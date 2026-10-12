import type { Tutorial } from '../tipos'

/** Primeiros passos e sua conta. Imagens e vídeo: scripts/tutoriais/{slug}.py */
export const TUTORIAIS_COMECAR: Tutorial[] = [
  {
    slug: 'configurar-empresa',
    titulo: 'Colocar a logo e os dados da sua gráfica',
    resumo: 'Logo, nome, CNPJ, WhatsApp e endereço aparecem nos orçamentos. E você escolhe a cor do sistema.',
    categoria: 'comecar',
    minutos: 3,
    telas: ['/configuracoes/empresa', '/configuracoes/aparencia'],
    video: { arquivo: '/ajuda/configurar-empresa/video.mp4', capa: '/ajuda/configurar-empresa/capa.webp', segundos: 63 },
    passos: [
      {
        titulo: 'Abra os dados da empresa',
        texto: 'No menu da esquerda, toque em Ajustes e depois em "Dados da empresa".',
        imagem: '/ajuda/configurar-empresa/1.webp',
      },
      {
        titulo: 'Coloque a sua logo',
        texto: 'Arraste a imagem da logo para o quadro "Logo" ou toque em "Escolher arquivo". Ela aparece no topo do sistema, na aba do navegador e nos orçamentos em PDF.',
        imagem: '/ajuda/configurar-empresa/2.webp',
        dica: 'Use PNG ou SVG com fundo transparente: fica bonito em qualquer fundo. Até 5 MB.',
      },
      {
        titulo: 'Confira os dados cadastrais',
        texto: 'Preencha a razão social, o nome fantasia, o CNPJ, o WhatsApp, o telefone e o e-mail. É isso que o cliente vê no orçamento.',
        imagem: '/ajuda/configurar-empresa/3.webp',
        dica: 'Digitou o CNPJ? Toque em "Buscar dados" e o sistema preenche o resto para você.',
      },
      {
        titulo: 'Preencha o endereço',
        texto: 'Comece pelo CEP: a rua, o bairro e a cidade vêm sozinhos. Depois é só completar o número e o complemento.',
        imagem: '/ajuda/configurar-empresa/4.webp',
      },
      {
        titulo: 'Salve',
        texto: 'Toque em "Salvar" no fim da página. Aparece o aviso "Dados da empresa salvos." e tudo já vale nos próximos orçamentos.',
        imagem: '/ajuda/configurar-empresa/5.webp',
        dica: 'Na mesma página ficam os padrões comerciais: validade do orçamento, sinal, chave PIX e condições de pagamento.',
      },
      {
        titulo: 'Escolha a cor do sistema',
        texto: 'Em Ajustes → Aparência, toque numa cor. O sistema todo muda na hora, só como prévia.',
        imagem: '/ajuda/configurar-empresa/6.webp',
        dica: 'O selo "Combina com a logo" mostra a cor que mais combina com a sua marca.',
      },
      {
        titulo: 'Salve a cor',
        texto: 'Gostou? Toque em "Salvar cor": vale para toda a equipe. Mudou de ideia? Toque em "Voltar para…" e nada muda.',
        imagem: '/ajuda/configurar-empresa/7.webp',
        dica: 'O modo claro ou escuro e o tamanho da letra são de cada pessoa: cada um escolhe o seu.',
      },
    ],
    proximos: ['cadastrar-produto', 'convidar-equipe'],
  },
  {
    slug: 'cadastrar-produto',
    titulo: 'Cadastrar um produto com o preço certo',
    resumo: 'Diga como o produto é cobrado, o material que ele leva e o lucro que você quer: o sistema calcula o preço.',
    categoria: 'comecar',
    minutos: 4,
    telas: ['/produtos'],
    video: { arquivo: '/ajuda/cadastrar-produto/video.mp4', capa: '/ajuda/cadastrar-produto/capa.webp', segundos: 90 },
    passos: [
      {
        titulo: 'Abra os produtos',
        texto: 'No menu da esquerda, toque em Catálogo e depois em "Produtos e serviços". Para cadastrar, toque em "Novo produto".',
        imagem: '/ajuda/cadastrar-produto/1.webp',
      },
      {
        titulo: 'Dê nome, categoria e unidade',
        texto: 'Escreva o nome do jeito que o cliente conhece, escolha a categoria, a unidade de medida e o prazo de produção. A descrição aparece no orçamento.',
        imagem: '/ajuda/cadastrar-produto/2.webp',
      },
      {
        titulo: 'Escolha como ele é vendido',
        texto: 'Em "Como é vendido", no campo "Cobrar", escolha por m², por unidade, por metro linear, por milheiro ou por hora. Depois toque em "Cadastrar produto".',
        imagem: '/ajuda/cadastrar-produto/3.webp',
        dica: 'Banner, adesivo e lona: por m². Caneca e camiseta: por unidade. Cartão de visita e panfleto: por milheiro.',
      },
      {
        titulo: 'Coloque o material',
        texto: 'Na aba "Custo e preço", escolha "Montar a composição" e toque em "Adicionar material". Busque o insumo, diga quanto vai em cada m² e a perda (sobra e erro de corte).',
        imagem: '/ajuda/cadastrar-produto/4.webp',
        dica: 'Não quer detalhar? Escolha "Sei meu custo" e digite só quanto custa produzir.',
      },
      {
        titulo: 'Defina o lucro e o preço',
        texto: 'Em "Lucro desejado", diga quanto quer ganhar. O sistema mostra o preço sugerido: toque em "Usar este preço" e depois em "Salvar custo e preço".',
        imagem: '/ajuda/cadastrar-produto/5.webp',
        dica: 'Quando o preço do material sobe, o custo acompanha. Em Catálogo → Reajuste de preços você vê quem ficou abaixo do lucro mínimo.',
      },
      {
        titulo: 'Marque os acabamentos',
        texto: 'Na aba "Acabamentos", marque os que este produto aceita (permitido), os que já vêm marcados no orçamento e os obrigatórios. Toque em "Salvar acabamentos".',
        imagem: '/ajuda/cadastrar-produto/6.webp',
      },
    ],
    proximos: ['fazer-orcamento', 'configurar-empresa'],
  },
  {
    slug: 'convidar-equipe',
    titulo: 'Colocar a sua equipe no sistema',
    resumo: 'Crie um acesso para cada pessoa, com o papel certo: vendedor, produção, financeiro…',
    categoria: 'comecar',
    minutos: 2,
    telas: ['/configuracoes/usuarios', '/configuracoes/permissoes'],
    video: { arquivo: '/ajuda/convidar-equipe/video.mp4', capa: '/ajuda/convidar-equipe/capa.webp', segundos: 48 },
    passos: [
      {
        titulo: 'Abra os usuários',
        texto: 'No menu da esquerda, toque em Ajustes e depois em "Usuários". Para criar um acesso, toque em "Novo usuário".',
        imagem: '/ajuda/convidar-equipe/1.webp',
      },
      {
        titulo: 'Preencha o nome e o e-mail',
        texto: 'O e-mail é o login da pessoa. Cada pessoa tem o seu: assim você sabe quem fez cada orçamento.',
        imagem: '/ajuda/convidar-equipe/2.webp',
      },
      {
        titulo: 'Escolha o papel',
        texto: 'O papel define o que a pessoa vê e faz: Vendedor, Designer, Produção, Financeiro, Caixa, Gerente ou Administrador. Se quiser, informe o telefone e a comissão.',
        imagem: '/ajuda/convidar-equipe/3.webp',
        dica: 'A comissão em % entra no relatório de comissões por vendedor.',
      },
      {
        titulo: 'Crie a senha provisória',
        texto: 'Toque em "Gerar" para criar uma senha provisória (ou digite uma). No primeiro acesso, a pessoa troca pela dela.',
        imagem: '/ajuda/convidar-equipe/4.webp',
        dica: 'Com o envio de e-mails ligado, a pessoa recebe um convite para criar a própria senha e a senha provisória fica opcional.',
      },
      {
        titulo: 'Salve e passe o acesso',
        texto: 'Toque em "Salvar". A pessoa aparece na lista com o selo "Senha provisória" até entrar pela primeira vez. Mande para ela o e-mail e a senha.',
        imagem: '/ajuda/convidar-equipe/5.webp',
      },
      {
        titulo: 'Ajuste as permissões, se precisar',
        texto: 'Em Ajustes → Permissões, escolha o papel e marque o que ele pode fazer em cada parte do sistema: ver, criar, editar, excluir, aprovar, exportar e ver todos. Depois salve.',
        imagem: '/ajuda/convidar-equipe/6.webp',
        dica: 'O Administrador sempre tem acesso a tudo. Quem sai da equipe? Desative o usuário: o histórico fica guardado.',
      },
    ],
    proximos: ['fazer-orcamento', 'assinar-plano'],
  },
  {
    slug: 'assinar-plano',
    titulo: 'Assinar a GrafyGo',
    resumo: 'Escolha o plano, mensal ou anual, a forma de pagamento e continue sem perder nenhum dia do teste.',
    categoria: 'conta',
    minutos: 2,
    telas: ['/assinatura'],
    video: { arquivo: '/ajuda/assinar-plano/video.mp4', capa: '/ajuda/assinar-plano/capa.webp', segundos: 52 },
    passos: [
      {
        titulo: 'Abra a sua assinatura',
        texto: 'Em Ajustes → "Minha assinatura" você vê o seu plano, quantos dias de teste ainda tem e quantos usuários está usando.',
        imagem: '/ajuda/assinar-plano/1.webp',
      },
      {
        titulo: 'Escolha o plano',
        texto: 'Toque em "Assinar agora" e escolha o plano: Essencial, Profissional ou Completo. Cada cartão mostra o que vem incluído e quantos usuários cabem.',
        imagem: '/ajuda/assinar-plano/2.webp',
      },
      {
        titulo: 'Mensal ou anual',
        texto: 'No canto do quadro, escolha Mensal ou Anual. No anual você paga uma vez por ano e ganha 2 meses grátis.',
        imagem: '/ajuda/assinar-plano/3.webp',
      },
      {
        titulo: 'Escolha a forma de pagamento',
        texto: 'Cartão de crédito: as mensalidades são cobradas sozinhas. PIX ou boleto: todo mês chega a cobrança e você paga. Dá para trocar depois.',
        imagem: '/ajuda/assinar-plano/4.webp',
      },
      {
        titulo: 'Informe o CNPJ ou o CPF',
        texto: 'Em "Dados da cobrança", digite o CNPJ da gráfica (ou o seu CPF). Tem um cupom? Toque em "Tenho um cupom de desconto".',
        imagem: '/ajuda/assinar-plano/5.webp',
      },
      {
        titulo: 'Confira e vá para o pagamento',
        texto: 'O resumo mostra o plano, a forma de pagamento, a data da 1ª mensalidade e o valor. Toque em "Assinar e ir para o pagamento": abre a página segura do Asaas para você pagar.',
        imagem: '/ajuda/assinar-plano/6.webp',
        dica: 'Assinando durante o teste, a 1ª mensalidade só vence no fim dele: você não perde nenhum dia. Os dados do cartão são digitados no Asaas e não passam pela GrafyGo.',
      },
    ],
    proximos: ['convidar-equipe', 'configurar-empresa'],
  },
]
