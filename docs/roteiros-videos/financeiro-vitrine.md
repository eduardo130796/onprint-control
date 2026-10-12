# Roteiros narrados: financeiro, caixa, vitrine e WhatsApp

Formato de todos os roteiros: grave a tela (OBS Studio, gratuito, ou o gravador do Windows: Win+Alt+R) na empresa
de demonstração "Ponto Visual" e fale seguindo a coluna "Fala". Ritmo de conversa (~130 palavras por minuto).
Depois de publicar no YouTube (pode ser "não listado"), coloque o id do vídeo no campo `youtube` do tutorial em
`apps/web/src/features/ajuda/conteudo/financeiro-vitrine.ts`: a versão narrada passa a aparecer no lugar do vídeo gravado.

Antes de gravar, confira na empresa de demonstração: uma conta a receber **em aberto** (Financeiro → Contas a
receber), o **caixa aberto** (Financeiro → Venda balcão; se estiver fechado, abra com um troco de R$ 100,00) e a
vitrine **no ar** com alguns produtos publicados. Para mostrar o site como o cliente vê, use "Abrir site" numa
janela anônima. Não toque em "Abrir o WhatsApp" se não quiser mandar a mensagem de verdade.

## Receber um pagamento (dar baixa)

- **Objetivo:** mostrar que dar baixa numa conta leva 20 segundos e já atualiza o fluxo de caixa.
- **Duração alvo:** 50 a 60 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Financeiro → **Contas a receber** | "O cliente pagou? Então vamos dar baixa. Leva menos de meio minuto." |
| 0:05 | Mostre os cartões **Total**, **Recebido** e **A receber** | "Aqui ficam todas as parcelas dos pedidos e o fiado. As atrasadas aparecem em destaque, e lá em cima eu vejo quanto tenho para receber." |
| 0:14 | Digite o nome do cliente na busca e abra a conta | "Busco pelo nome do cliente ou pelo número do pedido e toco na conta." |
| 0:20 | Clique em **Receber** | "Toco em Receber." |
| 0:23 | Mostre o **Valor recebido** e escolha **PIX** em **Forma de pagamento** | "O valor já vem preenchido. Se o cliente pagou só uma parte, eu mudo aqui e o resto fica em aberto. Escolho a forma: foi no PIX." |
| 0:33 | Clique em **Confirmar baixa** | "Confirmar baixa. Pronto, a conta está paga e o recebimento fica registrado." |
| 0:39 | Financeiro → **Fluxo de caixa** | "No fluxo de caixa eu vejo o que entrou, o que saiu e quanto vou ter nos próximos dias." |
| 0:48 | Financeiro → **Contas a pagar** | "E as despesas, como aluguel e fornecedor, ficam em Contas a pagar. Para pagar, é igualzinho. No próximo vídeo, a venda no balcão." |

## Vender no balcão (PDV)

- **Objetivo:** mostrar uma venda rápida de balcão, com troco, e onde ficam sangria e fechamento do caixa.
- **Duração alvo:** 50 a 65 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Financeiro → **Venda balcão (PDV)** | "Cliente no balcão querendo uma caneca e uma plastificação? Olha como é rápido vender." |
| 0:05 | Mostre o topo (número do caixa e dinheiro na gaveta) | "O caixa precisa estar aberto. Se estiver fechado, a tela pede o troco que tem na gaveta e você toca em Abrir caixa." |
| 0:13 | Busque "caneca" e toque no produto | "Busco o produto pelo nome e toco nele. Ele vai para a venda." |
| 0:19 | Toque no **+** | "Duas canecas? Toco no mais." |
| 0:23 | Busque "plastif" e toque em **Plastificação A4** | "E a plastificação, do mesmo jeito." |
| 0:28 | Toque em **Dinheiro** e digite 100 | "Ele vai pagar em dinheiro, com uma nota de cem. Digito cem e o sistema já mostra o troco." |
| 0:37 | Clique em **Finalizar venda** | "Finalizar venda. Pronto: está no caixa, baixou do estoque e entrou no financeiro." |
| 0:44 | Clique em **Sangria** e depois feche | "Tirou dinheiro da gaveta para levar ao banco? Registre uma sangria, com o valor e o motivo." |
| 0:52 | Passe o mouse em **Fechar caixa** | "E no fim do dia, Fechar caixa: você confere o que contou com o que o sistema calculou. No próximo vídeo, como receber as contas a prazo." |

## Colocar o seu site (vitrine) no ar

- **Objetivo:** mostrar que a gráfica tem um site de produtos pronto e que o cliente monta a lista de orçamento sozinho.
- **Duração alvo:** 75 a 90 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Vitrine → **Configurar vitrine** | "Sabia que a sua gráfica já tem um site pronto? Vou te mostrar como colocar no ar." |
| 0:05 | Mostre o interruptor **Site ligado** | "É só ligar aqui. A partir daí, qualquer pessoa com o endereço vê os seus produtos." |
| 0:11 | Mostre o endereço, **Copiar**, **Abrir site** e o **QR code** | "Esse é o endereço do seu site. Dá para copiar, abrir, e imprimir o QR code para deixar no balcão." |
| 0:19 | Passe por **Apresentação**, **Contato exibido** e **Banners do topo** | "Aqui você escreve o slogan e o quem somos, escolhe se mostra o WhatsApp, o telefone e o endereço, e coloca até três banners no topo." |
| 0:30 | Mostre **Salvar vitrine** | "Mudou alguma coisa? Salvar vitrine." |
| 0:34 | Vitrine → **Produtos na vitrine**, ligue **Publicado** num produto | "Agora os produtos. Ligou o Publicado, o produto aparece no site. O resto fica como rascunho." |
| 0:42 | Toque num produto e mostre **Destaque** e **Preço no site** | "Tocando no produto, eu escolho se ele fica em destaque no início do site e como o preço aparece: preço fixo, a partir de, ou sob consulta." |
| 0:53 | Abra o site | "E é assim que o cliente vê: banners, categorias, os mais procurados e o WhatsApp sempre à mão." |
| 1:03 | Abra **Banner em lona**, informe as medidas, **Adicionar à lista de orçamento** | "Ele abre o produto, coloca a quantidade e as medidas e adiciona à lista de orçamento. Quando ele envia, o pedido chega direto no seu sistema." |
| 1:15 | Mostre **Ver lista** | "Simples assim. No próximo vídeo, como divulgar os seus produtos no WhatsApp." |

## Divulgar no WhatsApp (imagem, mensagem e catálogo)

- **Objetivo:** mostrar a arte pronta para o Status, a mensagem com link e o catálogo em PDF.
- **Duração alvo:** 60 a 80 segundos.

| Tempo | Na tela (o que clicar) | Fala (o que dizer) |
|---|---|---|
| 0:00 | Vitrine → **Produtos na vitrine** | "Quer vender mais pelo WhatsApp sem perder tempo fazendo arte? Olha isso." |
| 0:05 | Toque no ícone de compartilhar do **Banner em lona** | "Toco no compartilhar do produto. A arte sai pronta, com a foto, o preço e o meu contato." |
| 0:12 | Toque em **Post**; mostre **Baixar PNG** e **Compartilhar** | "Tem a versão em pé, para o Status, e a quadrada, para post. É só baixar ou compartilhar." |
| 0:20 | Mostre a **Mensagem** e toque em **Qualquer contato** | "E a mensagem também vem pronta, com o link do produto. Escolho um cliente ou qualquer contato, e o WhatsApp abre com o texto." |
| 0:30 | Feche e toque em **Catálogo em PDF** | "Quer mandar vários produtos de uma vez? Catálogo em PDF." |
| 0:34 | Toque em **Só destaques** e escreva o título da capa | "Escolho os produtos, aqui só os destaques, e dou um título para a capa." |
| 0:42 | Toque em **Gerar catálogo** | "Gerar catálogo… em poucos segundos está pronto." |
| 0:48 | Mostre **Baixar PDF**, o link do catálogo e a mensagem | "Posso baixar o PDF, copiar o link do catálogo ou mandar direto no WhatsApp. O cliente abre no celular, sem baixar nada." |
| 0:58 | Vitrine → **Pedidos do site** | "E quando o cliente pede orçamento pelo site, chega aqui, em Pedidos do site." |
| 1:04 | Mostre o ícone **Criar orçamento** na linha | "Toco em Criar orçamento e respondo na hora. Como fazer o orçamento, você vê no próximo vídeo." |
