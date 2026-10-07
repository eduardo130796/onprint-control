# Guia rápido: configurar, usar e testar

> **Versão para compartilhar (página web):** https://claude.ai/artifact/U8xpJr5E8wRfVGwTKNimRe
> O link é privado. Para quem vai testar, compartilhe pelo menu **Share** da página.

O básico para colocar o sistema no ar, deixar pronto para a equipe e começar os testes. Cada pessoa vê no menu só o que o seu papel permite.

- [Parte 1 · Configurar (administrador)](#parte-1--configurar-o-sistema)
- [Parte 2 · Usar (equipe)](#parte-2--usar-o-sistema)
- [Parte 3 · Testar e relatar](#parte-3--testar-e-relatar)

---

## Parte 1 · Configurar o sistema

*Para quem instala e administra. Feito uma vez.*

### Colocar no ar

O passo a passo completo do servidor (VPS, domínio, HTTPS, firewall, backup) está em [DEPLOY_VPS.md](DEPLOY_VPS.md). Em resumo:

1. Aponte o domínio (ex.: `erp.suaempresa.com.br`) para o IP da VPS.
2. Instale o Docker e baixe o sistema na VPS (`git clone`).
3. Crie o arquivo de configuração `.env.prod` a partir do modelo `.env.prod.example`.
4. Suba com o Docker Compose. O HTTPS, o banco e os dados iniciais são criados sozinhos.

O **arquivo de configuração** (`.env.prod`) guarda os segredos. Os campos que você preenche:

| Campo | O que colocar |
|---|---|
| `DOMINIO` e `APP_URL` | O endereço do sistema: sem e com `https://` |
| `POSTGRES_PASSWORD` | Senha do banco. Repita a mesma dentro de `DATABASE_URL` |
| `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` | Dois códigos aleatórios e diferentes (`openssl rand -hex 32`). Com os valores de exemplo, o sistema não sobe |
| `ADMIN_EMAIL` / `ADMIN_SENHA_INICIAL` | O primeiro acesso do administrador |
| `SEED_EXEMPLOS` | `true` cria produtos de exemplo (banner, caneca, lona…). **Recomendado para a fase de testes** |

### Primeiro acesso

1. Abra o endereço do sistema e entre com o `ADMIN_EMAIL` e a `ADMIN_SENHA_INICIAL`.
2. O sistema pede para criar uma senha definitiva. Guarde-a num lugar seguro.

### Empresa e usuários

1. **Configurações → Empresa**: razão social, CNPJ, contatos, **logo** (sai nos PDFs) e as condições padrão de pagamento dos orçamentos.
2. **Configurações → Usuários → Novo usuário**: um usuário por pessoa, com o **papel** (veja [Quem faz o quê](#quem-faz-o-quê)) e uma senha provisória. Para vendedores, informe o **% de comissão**.
3. Envie a cada pessoa: o endereço do sistema, o e-mail e a senha provisória. No primeiro login ela cria a própria senha.

> **Esqueceu a senha?** O administrador usa **Configurações → Usuários → Redefinir senha**. O sistema não envia e-mail nesta versão.

O que cada papel pode fazer já vem pronto. Se precisar ajustar, use **Configurações → Permissões**.

### Cadastros básicos

Com `SEED_EXEMPLOS=true`, já existe um catálogo de exemplo e dá para pular direto para os testes. Para os dados reais da empresa:

- [ ] **Produtos → Categorias** e **Produtos**: preço de venda e **modo de cálculo** (unidade, m², metro linear, milheiro ou hora), prazo, medidas máximas e, se usar estoque, a ficha técnica (insumos consumidos).
- [ ] **Produtos → Acabamentos** (ilhós, bainha, laminação…) e **Produtos → Máquinas** / processos, com a velocidade de cada máquina.
- [ ] **Estoque → Entradas → Nova entrada**: o estoque inicial de insumos e produtos de revenda, com custo.
- [ ] **Financeiro → Formas de pagamento**: confira a **taxa do cartão**. Ajuste o saldo inicial das contas (caixa da loja e banco).
- [ ] **Configurações → Status**: renomeie, mude a cor, a ordem ou **oculte** os status que não usa. Nos quadros (orçamentos, pedidos, produção) dá para **criar status próprios** — ex.: "Laminação" contando como "Acabamento" — que viram colunas no kanban sem quebrar as regras automáticas.
- [ ] **Configurações → Templates de mensagens**: os textos de WhatsApp enviados ao cliente (orçamento, arte, pedido pronto).

---

## Parte 2 · Usar o sistema

*Para toda a equipe.*

### Entrar e se localizar

- **Entrar:** use o e-mail e a senha provisória que o administrador enviou. No primeiro acesso, crie a sua senha. Depois de 5 tentativas erradas, aguarde 1 minuto.
- **Menu lateral:** mostra só o que o seu papel acessa. No celular, abra pelo ícone ☰.
- **Localizar** (barra no topo ou `Ctrl` + `K`): digite o nome do cliente, o número do orçamento/pedido (ex.: `PED-2026-0001`) ou o nome de uma tela.
- **Sino:** avisos como "pedido pronto" e "comissão liberada". Clique no aviso para abrir o registro.
- **Dashboard:** a tela inicial, com os números do dia e do mês conforme o seu papel.

### Quem faz o quê

| Papel | Usa principalmente |
|---|---|
| **Administrador** | Tudo, inclusive usuários e permissões |
| **Gerente** | Tudo, exceto usuários e permissões. Pode liberar a produção sem arte aprovada, informando o motivo |
| **Vendedor** | Clientes, orçamentos, pedidos (os próprios) e entregas. Vê a produção |
| **Designer** | Artes dos pedidos: envia as versões e acompanha a aprovação. Vê a produção |
| **Produção** | Kanban de produção, PCP, apontamentos e estoque |
| **Financeiro** | Contas a receber e a pagar, comissões, fluxo de caixa, caixa e relatórios |
| **Caixa** | Venda balcão (PDV), recebimentos no balcão, sangria/suprimento e cadastro rápido de cliente |

### Do orçamento à entrega

O caminho de um trabalho, na ordem em que acontece:

**1. Orçamento** · *Vendedor*
1. **Orçamentos → Novo orçamento**. Escolha o cliente ou use **Pré-cadastro rápido** (só nome e WhatsApp).
2. **Adicionar item**: produto, quantidade, medidas e acabamentos. O preço é calculado na hora.
3. Salve e use **Enviar ao cliente** → **Copiar mensagem com link** para mandar pelo WhatsApp. O cliente vê o orçamento e aprova pelo link, sem precisar de login.
4. Se ele aprovar por telefone ou no balcão, use **Registrar aprovação**. Se recusar, **Registrar recusa** com o motivo.
5. **Imprimir** abre a impressão direto, sem baixar arquivo; **PDF** baixa. O orçamento sai com uma linha para o cliente assinar.

> **Kanban de orçamentos** (Orçamentos → Kanban): arraste o cartão para enviar, negociar, aprovar, recusar ou converter em pedido. **Clique no cartão** para abrir um painel com os detalhes e todas as ações (imprimir, PDF, mensagem, link, converter); o cartão também tem atalhos **Abrir**, **Imprimir** e **Link**.

**2. Converter em pedido** · *Vendedor*
No orçamento aprovado, clique em **Converter em pedido** e informe o sinal (%) e em quantas parcelas o restante será pago. O sistema cria:
- o pedido;
- as contas a receber;
- as ordens de produção (OPs), uma por item.

> No pedido, o botão **Imprimir** tem: o pedido (com linha de assinatura de recebimento), as **etiquetas de entrega** e **Baixar PDF**. No **Kanban de pedidos** dá para arrastar o pedido para qualquer coluna; **clicando no cartão** abre um painel com tudo do pedido (itens, OPs, parcelas) e as ações: abrir, editar, imprimir, etiquetas, recibo, receber valor.

**3. Arte** · *Designer*
1. Abra o pedido → aba **Arte** e envie o arquivo. Cada novo envio vira uma nova versão (v1, v2…).
2. **Enviar ao cliente** → **Copiar link de aprovação**. Pelo link, o cliente aprova ou pede ajuste com um comentário.

> **Regra:** a OP só passa para impressão com a arte aprovada. O gerente pode liberar antes, informando o motivo, e isso fica registrado no histórico.

**4. Produção** · *Produção*
**Produção** mostra o kanban. Arraste cada OP pelas etapas: Fila → Pré-impressão → Impressão → Acabamento → Conferência → Concluído.
- Na **Ficha da OP**: **Apontar** o tempo trabalhado, a quantidade e a perda.
- Ao concluir a OP, o estoque dos insumos **baixa sozinho**.
- Quando todas as OPs terminam, o pedido vira **Pronto** e o vendedor é avisado.
- **Clique no cartão da OP** para ver a arte, medidas, máquina, prazos e etapas, com acesso rápido à OP, ao pedido, à arte, à ficha e à etiqueta.
- No cartão da OP: **Editar** (máquina, responsável, datas, prioridade), **Ficha** (folha da OP para a produção) e **Etiqueta** (etiqueta de entrega em folha A4, 4 por folha, com a imagem da arte, endereço, data agendada, entregador, se está PAGO ou quanto COBRAR, os outros itens do pedido, canhoto de recebimento e um QR que abre o pedido no celular).
- **PCP / Cockpit** mostra a carga por máquina, os gargalos e as OPs atrasadas.

**5. Entrega** · *Vendedor*
No pedido → aba **Entrega** → **Nova entrega**: retirada, entrega ou instalação. Quando acontecer, use **Confirmar entrega** com o nome de quem recebeu. O pedido fica **Entregue**. A agenda geral está em **Pedidos de Venda → Entregas**.

**6. Recebimento** · *Financeiro*
- **Financeiro → A receber** → **Receber**: valor, data e forma de pagamento. Aceita pagamento parcial, juros, multa e desconto. Se errar, use **Estornar** no pagamento.
- No pedido → aba **Financeiro** → **Receber valor**: digite quanto o cliente pagou e o sistema abate nas parcelas em aberto, da mais antiga para a mais nova (mostra a divisão antes de confirmar).
- **Recibo**: no pedido → **Imprimir → Recibo** (ou aba Financeiro → **Recibo**). Marque os pagamentos que entram; sai com o valor por extenso, em duas vias na mesma folha (cliente e empresa).
- Quando todas as parcelas estão pagas, o pedido fica **Pago** e a comissão do vendedor é **liberada**. Para pagá-la: **Financeiro → Comissões**.
- Despesas em **Financeiro → A pagar**. A visão do mês está em **Fluxo de caixa** e **Calendário**.

### Caixa / PDV · *Caixa*

1. **Caixa / PDV** → abra o caixa informando o troco inicial.
2. **Venda balcão**: toque nos produtos, ajuste as quantidades, escolha uma ou mais formas de pagamento. O troco é calculado, só para dinheiro. O estoque baixa na hora.
3. **Recebimentos**: receber no balcão uma parcela de pedido. Busque pelo cliente ou pelo número.
4. **Sangria / Suprimento**: retirar ou colocar dinheiro na gaveta, sempre com o motivo.
5. **Fechar caixa**: informe quanto há em cada forma de pagamento. O sistema compara com o esperado e registra a sobra ou a falta.

### Estoque e relatórios

- **Estoque**: saldo e custo médio de cada item. Tem também:
  - **Entradas** (notas de compra);
  - **Movimentações** (saída, perda, ajuste de inventário, transferência);
  - **Alertas** dos itens abaixo do mínimo.
- **Relatórios**: vendas, orçamentos, produção, estoque, financeiro e comissões, com escolha de período e exportação em **CSV** (Excel) e **PDF**.

---

## Parte 3 · Testar e relatar

*Use dados de mentira (clientes e valores fictícios). Nada é enviado de verdade ao cliente: as mensagens de WhatsApp são só copiadas.*

### Roteiro de testes

O ideal é cada pessoa fazer a parte do seu papel no **mesmo pedido**, na ordem abaixo, e depois repetir em variações.

- [ ] **Vendedor:** cadastrar um cliente, fazer um orçamento com um banner 2 × 1 m e 10 canecas, enviar o link e converter em pedido com 50% de sinal.
- [ ] **Cliente (qualquer um, pelo link):** abrir o link do orçamento e o da arte no celular, pedir um ajuste e depois aprovar.
- [ ] **Designer:** enviar duas versões da arte e mandar a última para aprovação.
- [ ] **Produção:** tentar imprimir sem a arte aprovada (deve bloquear). Depois, levar as OPs até Concluído, apontar tempo e perda e conferir a baixa no estoque.
- [ ] **Vendedor:** registrar a retirada e ver o pedido como Entregue.
- [ ] **Financeiro:** receber uma parcela em parte, estornar, receber tudo e conferir o pedido Pago e a comissão liberada.
- [ ] **Caixa:** abrir o caixa, vender com troco, vender com duas formas, fazer uma sangria e fechar o caixa.
- [ ] **Impressões:** imprimir um orçamento e um pedido sem baixar (conferir a linha de assinatura) e as etiquetas de entrega pelo pedido e pelo cartão da OP.
- [ ] **Kanbans:** arrastar um orçamento até Aprovado e um pedido entre colunas; usar os atalhos Editar e Imprimir dos cartões.
- [ ] **Financeiro:** em um pedido com parcelas, usar **Receber valor** com um valor que cubra mais de uma parcela e depois imprimir o **Recibo** só do sinal.
- [ ] **Gerente:** conferir se o dashboard e os relatórios batem com o que foi feito, e exportar um PDF.
- [ ] **Todos:** usar pelo celular também e tentar abrir telas que o seu papel não deveria ver.

### Como relatar um problema

Quanto mais exato o relato, mais rápido é corrigido. Copie o modelo e preencha:

```
Tela: (ex.: Orçamentos → Novo orçamento)
Usuário / papel: (ex.: vera@… / Vendedor)
Data e hora:
O que eu fiz: (passo a passo)
O que eu esperava:
O que aconteceu: (mensagem de erro, se houver)
Print da tela: (anexe)
Celular ou computador:
```

---

*ONPrint Control · versão de testes (fases 0 a 8 + ajustes do lote 1). Integrações com WhatsApp, CEP e e-mail ainda não estão ativas: as mensagens são copiadas e enviadas manualmente.*
