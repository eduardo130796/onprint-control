# Roteiros narrados: do orçamento enviado à produção

Formato de todos os roteiros: grave a tela (OBS Studio, gratuito, ou o gravador do Windows: Win+Alt+R) na empresa
de demonstração "Ponto Visual" e fale seguindo a coluna "Fala". Ritmo de conversa (~130 palavras por minuto).
Depois de publicar no YouTube (pode ser "não listado"), coloque o id do vídeo no campo `youtube` do tutorial em
`apps/web/src/features/ajuda/conteudo/pedidos.ts`: a versão narrada passa a aparecer no lugar do vídeo gravado.

Antes de gravar, tenha à mão (na empresa de demonstração): um orçamento em **Rascunho**, um orçamento **Aprovado**
e um pedido com a arte ainda sem arquivo. O jeito mais rápido é rodar a parte `preparar()` dos scripts em
`scripts/tutoriais/` (ou duplicar um orçamento em "Mais" → "Duplicar"). Para a página do cliente, abra o link
de aprovação numa janela anônima do navegador: é exatamente o que o cliente vê.

## Enviar o orçamento e receber a aprovação

- **Objetivo:** mostrar que o cliente recebe o orçamento no WhatsApp e aprova sozinho, pelo celular.
- **Duração alvo:** 60 a 75 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Orçamento salvo aberto | "Orçamento pronto? Agora deixa o cliente aprovar sozinho, sem ficar ligando para ele. Olha como é fácil." |
| 0:06 | Clique em **Copiar mensagem** | "Toco em Copiar mensagem. O texto já vai com o nome do cliente, o valor e um link para ele aprovar." |
| 0:14 | **Mais** → **Marcar como enviado** (ou o botão no aviso verde) | "Colo no WhatsApp do cliente e marco como enviado. Assim eu sei quem está esperando resposta." |
| 0:22 | Passe o mouse em **PDF** | "Se o cliente prefere PDF, eu baixo aqui, com a minha marca, e anexo na conversa." |
| 0:28 | **Mais** → **Copiar link de aprovação** | "E se eu quiser mandar só o link, ele está aqui no Mais." |
| 0:34 | Abra o link (janela anônima) | "Essa é a tela que o cliente vê: os itens, o total, a validade e as condições. Funciona no celular, sem senha." |
| 0:44 | Digite o nome, marque o aceite, **Confirmar aprovação** | "Ele digita o nome, marca que leu e confirma. Pronto, aprovado." |
| 0:52 | Volte ao orçamento no sistema | "E aqui no sistema já aparece: aprovado, com o nome, a data e a hora." |
| 0:58 | Mostre o botão **Converter em pedido** | "Agora é transformar esse orçamento em pedido. É o próximo vídeo." |

## Transformar o orçamento aprovado em pedido

- **Objetivo:** mostrar que o pedido nasce com um toque, já com sinal, parcelas e artes.
- **Duração alvo:** 45 a 60 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Orçamento aprovado aberto | "O cliente aprovou? Então vamos fechar o pedido. Leva menos de um minuto." |
| 0:05 | Clique em **Converter em pedido** | "Toco em Converter em pedido." |
| 0:08 | Sinal 50%, **Parcelas do saldo** 2 | "Coloco o sinal, aqui cinquenta por cento, e o resto em duas vezes. Embaixo já aparecem as contas que vão ser criadas, com o vencimento de cada uma." |
| 0:20 | Mostre **Entrega** e **Prioridade**, clique em **Criar pedido** | "Escolho se é retirada ou entrega, a prioridade, e crio o pedido." |
| 0:26 | Cartão do pedido gerado → **Abrir pedido** | "O pedido nasceu com as contas a receber e uma arte para cada item. Vou abrir." |
| 0:32 | Topo do pedido | "Aqui eu vejo o status, a data de entrega, quantas artes já foram aprovadas e o total." |
| 0:38 | Aba **Financeiro** | "No Financeiro ficam o sinal e as parcelas. Quando o cliente pagar, é só tocar em Receber." |
| 0:45 | **Pedidos** → **Kanban** | "E no Kanban eu vejo todos os pedidos por status, com quanto falta pagar em cada um." |
| 0:52 | Cartão do pedido em "Aguardando arte" | "Esse aqui está aguardando arte. No próximo vídeo eu mostro como mandar a arte para o cliente aprovar." |

## Mandar a arte para o cliente aprovar

- **Objetivo:** mostrar o envio da arte e a aprovação (ou o pedido de ajuste) pelo link, tudo registrado.
- **Duração alvo:** 60 a 80 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Pedido aberto, aba **Arte** | "Chega de imprimir arte errada e levar a culpa. Agora o cliente aprova a arte por escrito, pelo celular." |
| 0:07 | **Escolher arquivo** → escolha a arte | "No pedido, na aba Arte, eu mando o arquivo. Pode ser PDF, imagem, CDR… A miniatura aparece na hora." |
| 0:16 | Clique em **Enviar ao cliente** | "Toco em Enviar ao cliente." |
| 0:20 | Clique em **Copiar mensagem com link** | "Copio a mensagem com o link e colo no WhatsApp dele." |
| 0:26 | Abra o link (janela anônima) | "O cliente abre e vê a arte grandona, com a quantidade e as medidas." |
| 0:34 | Clique em **Pedir ajuste** | "Se ele quiser mudar alguma coisa, toca em Pedir ajuste e escreve o que é. Esse pedido chega para mim, junto da arte." |
| 0:44 | **Aprovar arte** → nome → aceite → **Confirmar aprovação** | "Se estiver tudo certo, ele aprova: coloca o nome, confirma que conferiu textos, cores e medidas, e pronto." |
| 0:55 | Volte ao pedido, aba **Arte** | "No pedido, a arte já aparece aprovada, e a produção pode imprimir sem medo." |
| 1:02 | — | "E para acompanhar essa produção, veja o próximo vídeo." |

## Acompanhar a produção no kanban

- **Objetivo:** mostrar como saber em que pé está cada serviço e como mover as OPs.
- **Duração alvo:** 60 a 80 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | **Produção** (kanban) | "Quer saber em que pé está cada serviço sem sair perguntando na produção? É aqui." |
| 0:06 | Passe pelas colunas | "Cada coluna é uma etapa: fila, pré-impressão, impressão, acabamento, conferência e concluído." |
| 0:12 | Aponte um cartão | "Cada cartão é uma ordem de produção: o cliente, o item, o prazo, a máquina e a arte na capa." |
| 0:18 | Clique em **Abrir** no cartão | "Tocando em Abrir, eu vejo os detalhes e por onde ela já passou." |
| 0:24 | **Abrir OP** → **Mover para** → Pré-impressão | "Terminou uma etapa? Eu escolho a próxima aqui. Fica tudo no histórico, com a hora e quem moveu. No kanban, dá também para arrastar o cartão." |
| 0:36 | **Ficha da OP** | "A ficha da OP vai impressa para a máquina, com a arte, as medidas e as etapas para marcar." |
| 0:44 | Volte ao kanban → **Etiqueta** | "E aqui eu imprimo a etiqueta do volume, para a entrega não sair trocada." |
| 0:52 | **PCP / Cockpit** | "No PCP eu vejo a carga de cada máquina na semana e as OPs atrasadas, para reprogramar antes que vire problema." |
| 1:02 | — | "Serviço pronto? No próximo vídeo eu mostro como receber o pagamento." |
