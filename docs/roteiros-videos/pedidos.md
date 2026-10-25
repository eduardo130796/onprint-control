# Roteiros narrados: do orçamento enviado à produção

Formato de todos os roteiros: grave a tela (OBS Studio, gratuito, ou o gravador do Windows: Win+Alt+R) na empresa
de demonstração "Ponto Visual" e fale seguindo a coluna "Fala". Ritmo de conversa (~130 palavras por minuto).
Depois de publicar no YouTube (pode ser "não listado"), coloque o id do vídeo no campo `youtube` do tutorial em
`apps/web/src/features/ajuda/conteudo/pedidos.ts`: a versão narrada passa a aparecer no lugar do vídeo gravado.

Antes de gravar, tenha à mão (na empresa de demonstração): um orçamento em **Rascunho**, um orçamento **Aprovado**
que ainda não virou pedido e um pedido com a arte ainda sem arquivo. O jeito mais rápido é rodar
`scripts/tutoriais/fazer-orcamento.py` (cria o rascunho) ou a parte `preparar()` dos outros scripts (ou duplicar um
orçamento em "Mais" → "Duplicar"). Para a página do cliente, abra o link numa janela anônima do navegador: é
exatamente o que o cliente vê. Grave com o WhatsApp da empresa de demonstração em modo de teste
(`WHATSAPP_PROVEDOR=log`) e nunca mostre o número verdadeiro de um celular conectado.

## Enviar o orçamento e receber a aprovação

- **Objetivo:** mostrar que o orçamento sai pelo WhatsApp da gráfica, com o PDF, e o cliente aprova sozinho pela enquete.
- **Duração alvo:** 70 a 90 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Orçamento salvo aberto | "Orçamento pronto? Agora deixa o cliente aprovar sozinho, sem ficar ligando para ele." |
| 0:05 | Clique em **Enviar orçamento** | "Toco em Enviar orçamento." |
| 0:08 | Diálogo: prévia da mensagem e o PDF | "A mensagem já vem pronta, do jeito que o cliente vai ver: os itens, o total, a entrada e as parcelas, o prazo e o link. O PDF vai junto." |
| 0:18 | Clique em **Enviar para…** | "Toco em Enviar. Sai do WhatsApp da própria gráfica, e o orçamento passa para Enviado." |
| 0:25 | Tela **WhatsApp** → "Como o cliente aprova o orçamento" | "Logo depois chega uma enquete: o cliente toca em Aprovado ou em Quero modificações. Se preferir, ele responde um ou dois, ou escreve aprovado. Você escolhe o formato aqui." |
| 0:40 | Abra o link de aprovação (janela anônima) | "O link no fim da mensagem abre o orçamento completo, com o pagamento combinado. Ele também pode aprovar por aqui." |
| 0:50 | Volte ao orçamento → **Cliente aprovou pelo WhatsApp** | "Aprovou pela enquete? O orçamento se aprova sozinho. Respondeu de outro jeito na conversa? Um clique em Cliente aprovou pelo WhatsApp." |
| 1:00 | Cartão do pedido gerado | "Pronto: aprovado, e o pedido já nasceu com a entrada e as parcelas nas contas a receber." |
| 1:08 | — | "No próximo vídeo, o que acontece com esse pedido." |

## O orçamento aprovado vira pedido

- **Objetivo:** mostrar que o pedido nasce sozinho na aprovação, com o pagamento do orçamento, e o caminho manual.
- **Duração alvo:** 50 a 65 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | **Ajustes** → **Dados da empresa** → quadro **Pedidos** | "Primeiro, deixe marcado: quando o cliente aprovar o orçamento, criar o pedido automaticamente. Aqui também ficam a entrega e a prioridade padrão." |
| 0:12 | Orçamento aprovado, cartão do pedido gerado | "Aprovou pela enquete, pelo link ou pelo botão? O pedido já existe, com a entrada e as parcelas que estavam no orçamento." |
| 0:22 | **Abrir pedido** → topo do pedido | "Aqui eu vejo o status, a data de entrega, quantas artes já foram aprovadas e o total." |
| 0:30 | Aba **Financeiro** | "No Financeiro ficam a entrada e as parcelas. Quando o cliente pagar, é só tocar em Receber." |
| 0:38 | **Pedidos** → **Kanban** | "E no Kanban eu vejo todos os pedidos por status, com quanto falta pagar em cada um." |
| 0:46 | Orçamento aprovado sem pedido → **Converter em pedido** | "Desligou a criação automática? Aí o orçamento fica aprovado e você toca em Converter em pedido: confere o pagamento, a entrega e a prioridade, e cria o pedido." |
| 0:58 | — | "No próximo vídeo, a aprovação da arte." |

## Aprovar a arte (com a equipe ou com o cliente)

- **Objetivo:** mostrar o envio do arquivo, a aprovação pela equipe e a aprovação do cliente pelo celular.
- **Duração alvo:** 70 a 90 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Pedido aberto, aba **Arte** | "Chega de imprimir arte errada. No pedido, na aba Arte, cada item tem a sua arte, e no topo eu vejo quantas já foram aprovadas." |
| 0:08 | **Não precisa de arte ▾** | "Item que não leva arte, ou que o cliente mandou pronta? Eu aviso aqui, e a produção não fica esperando." |
| 0:15 | **Escolher arquivo** → escolha a arte | "Mando o arquivo: PDF, imagem, CDR… A miniatura aparece na hora." |
| 0:22 | **Marcar como aprovada ▾** | "O cliente já aprovou com você? Marco como aprovada e digo como: pelo WhatsApp, pessoalmente, por telefone. Com várias artes, Cliente aprovou todas as artes resolve num clique." |
| 0:34 | **Enviar para o cliente** → diálogo | "Quer que ele veja antes? Enviar para o cliente manda uma mensagem só, com os arquivos e um link para aprovar tudo." |
| 0:44 | Abra o link (janela anônima): **Acompanhe seu pedido** | "Ele abre no celular, vê a arte grandona, coloca o nome, confirma que conferiu e aprova. Se quiser mudar algo, toca em Pedir ajuste." |
| 0:58 | Volte ao pedido, aba **Arte** | "No pedido, a arte já aparece aprovada, com quem aprovou, e o pedido vai para a produção." |
| 1:06 | — | "E para acompanhar essa produção, veja o próximo vídeo." |

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
