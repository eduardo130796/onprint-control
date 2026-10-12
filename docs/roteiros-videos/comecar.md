# Roteiros narrados: primeiros passos e sua conta

Formato de todos os roteiros: grave a tela (OBS Studio, gratuito, ou o gravador do Windows: Win+Alt+R) e fale
seguindo a coluna "Fala". Ritmo de conversa (~130 palavras por minuto). Os três primeiros usam a empresa de
demonstração "Ponto Visual"; o de assinatura usa uma conta em teste grátis (a de demonstração já é assinante).
Depois de publicar no YouTube (pode ser "não listado"), coloque o id do vídeo no campo `youtube` do tutorial em
`apps/web/src/features/ajuda/conteudo/comecar.ts`: a versão narrada passa a aparecer no lugar do vídeo gravado.

## Colocar a logo e os dados da sua gráfica

- **Objetivo:** deixar o sistema e os orçamentos com a cara da gráfica (logo, dados, endereço e cor).
- **Duração alvo:** 60 a 75 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Painel aberto | "Em um minuto você deixa a GrafyGo com a cara da sua gráfica. Vem comigo." |
| 0:05 | Clique em **Ajustes** (menu da esquerda) → **Dados da empresa** | "No menu da esquerda, Ajustes, e depois Dados da empresa." |
| 0:11 | Mostre o quadro **Logo** e o botão **Escolher arquivo** | "Primeiro, a logo. É só arrastar a imagem para cá ou tocar em Escolher arquivo. Ela vai para o topo do sistema e para todos os orçamentos." |
| 0:22 | Passe o mouse por **Nome fantasia**, **CNPJ**, **WhatsApp**, **Telefone** | "Aqui ficam os dados que o cliente vê: nome, CNPJ, WhatsApp e telefone. Digitou o CNPJ? O botão Buscar dados preenche o resto." |
| 0:33 | Bloco **Endereço**: digite no **Complemento** | "No endereço, comece pelo CEP: a rua e a cidade vêm sozinhas. Depois é só completar." |
| 0:41 | Clique em **Salvar** e mostre o aviso verde | "Salvar… e pronto: dados da empresa salvos." |
| 0:46 | Clique em **Aparência** | "Agora a parte divertida: a cor do sistema." |
| 0:50 | Toque em **Verde** | "Toco numa cor e o sistema todo muda na hora. Isso ainda é só uma prévia." |
| 0:57 | Mostre **Salvar cor** | "Gostou? Salvar cor, e vale para toda a equipe. Eu vou manter o azul, que combina com a minha logo." |
| 1:05 | Clique em **Voltar para Azul GrafyGo** | "Pronto, sua gráfica já está com a sua cara. No próximo vídeo, eu mostro como cadastrar um produto com o preço certo." |

## Cadastrar um produto com o preço certo

- **Objetivo:** cadastrar um produto por m² com material, lucro e acabamentos, e ver o preço sair sozinho.
- **Duração alvo:** 75 a 90 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Catálogo → **Produtos e serviços** aberto | "Em um minuto e meio você cadastra um produto e o sistema calcula o preço certo para você. Vamos lá." |
| 0:06 | Clique em **Novo produto** | "Aqui em Produtos e serviços, toco em Novo produto." |
| 0:10 | Digite "Faixa em lona 440 g", escolha a **Categoria**, a **Unidade** (Metro quadrado) e o **Prazo** | "Dou o nome do jeito que o cliente pede, escolho a categoria, a unidade e o prazo de produção. A descrição vai direto para o orçamento." |
| 0:22 | **Cobrar: Por m²** | "Faixa eu cobro por metro quadrado. Caneca seria por unidade; cartão de visita, por milheiro." |
| 0:28 | Clique em **Cadastrar produto** | "Cadastrar produto. Agora vem a parte mais importante: o preço." |
| 0:33 | Aba **Custo e preço** → **Montar a composição** → **Adicionar material** → busque "Lona" | "Na aba Custo e preço, coloco o material: lona 440. Um metro de lona por metro de faixa, com dez por cento de perda para sobra e erro de corte." |
| 0:47 | **Lucro desejado** 60 → **Usar este preço** | "Agora digo quanto quero ganhar: sessenta por cento. O sistema já sugere o preço. Usar este preço." |
| 0:56 | **Salvar custo e preço** | "Salvo. E se a lona subir, o custo acompanha, e eu vejo quem ficou com lucro baixo." |
| 1:02 | Aba **Acabamentos** → marque Bainha, Ilhós e Bastão → **Salvar acabamentos** | "Por último, os acabamentos que essa faixa aceita: bainha, ilhós e bastão. A bainha já vem marcada no orçamento." |
| 1:15 | Aviso verde de salvo | "Pronto. O produto já aparece no orçamento com o preço certo. No próximo vídeo, eu mostro como colocar a sua equipe no sistema." |

## Colocar a sua equipe no sistema

- **Objetivo:** criar um acesso para um vendedor e mostrar onde ficam as permissões de cada papel.
- **Duração alvo:** 50 a 65 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Ajustes → **Usuários** aberto | "Em um minuto a sua equipe está no sistema, cada um com o seu acesso." |
| 0:05 | Clique em **Novo usuário** | "Em Ajustes, Usuários, toco em Novo usuário." |
| 0:09 | Digite "Juliana Rocha" e o e-mail | "Nome e e-mail. O e-mail é o login dela." |
| 0:17 | **Papel: Vendedor**, telefone e **Comissão** 3% | "O papel diz o que ela pode ver e fazer. A Juliana é vendedora, com três por cento de comissão." |
| 0:27 | Clique em **Gerar** | "Gero uma senha provisória. No primeiro acesso, ela troca pela dela." |
| 0:33 | Clique em **Salvar** e mostre a linha nova | "Salvar. Ela já aparece na lista. Agora é só mandar o e-mail e a senha pelo WhatsApp." |
| 0:42 | Clique em **Permissões** → aba **Vendedor** | "E se quiser ajustar o que cada papel faz, é aqui em Permissões: marco ou desmarco e salvo." |
| 0:52 | Mostre a tabela | "Pronto, equipe no sistema. No próximo vídeo, eu mostro como fazer um orçamento em segundos." |

## Assinar a GrafyGo

- **Objetivo:** mostrar como assinar durante o teste grátis, sem perder nenhum dia.
- **Duração alvo:** 55 a 65 segundos.
- **Atenção:** grave numa conta em teste grátis e pare antes de tocar em "Assinar e ir para o pagamento" (ou use o seu cartão de verdade, se for assinar).

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Ajustes → **Minha assinatura** aberto | "Em um minuto você assina a GrafyGo e continua sem interrupção." |
| 0:05 | Mostre o quadro escuro com o plano e os dias de teste | "Aqui eu vejo o meu plano, quantos dias de teste ainda tenho e quantos usuários estou usando." |
| 0:12 | Clique em **Assinar agora** → clique no cartão **Completo** | "Toco em Assinar agora e escolho o plano. Cada cartão mostra o que vem incluído e quantos usuários cabem." |
| 0:22 | Clique em **Anual** e depois em **Mensal** | "Posso pagar por mês ou por ano. No anual, ganho dois meses grátis." |
| 0:30 | Mostre **Cartão de crédito** e **PIX ou boleto** | "Forma de pagamento: no cartão, as mensalidades são cobradas sozinhas. No PIX ou boleto, a cobrança chega todo mês." |
| 0:39 | Digite o CNPJ em **CNPJ (ou CPF)** | "Coloco o CNPJ da gráfica, que vai na cobrança. Se tiver cupom, é aqui embaixo." |
| 0:47 | Mostre o **Resumo** e o botão **Assinar e ir para o pagamento** | "Confiro o resumo: plano, pagamento e valor. A primeira mensalidade só vence no fim do teste." |
| 0:54 | (sem clicar) | "Ao tocar em Assinar, abre a página segura do Asaas para pagar. Pronto! Quer aproveitar ao máximo? Veja o vídeo de como colocar a sua equipe no sistema." |
