# Decisões de projeto

Registro das escolhas feitas onde o [ARQUITETURA.md](ARQUITETURA.md) era ambíguo ou precisou de ajuste.

## Fase 0

| # | Decisão | Motivo |
|---|---|---|
| D01 | **Node 22 LTS** (imagens `node:22-alpine`) em vez de Node 20. Aprovado pelo usuário. | Node 20 saiu de suporte em abril/2026; Node 22 é LTS até abril/2027. |
| D02 | **Prisma 6** (não o 7). | O Prisma 7 muda a configuração (driver adapters, `prisma.config.ts`); o 6 é estável e atende tudo do escopo. Migrar depois é simples. |
| D03 | **Tailwind CSS 3.4** + componentes shadcn/ui escritos no projeto. | O shadcn atual assume Tailwind 4 e React 19; o prompt pede React 18. |
| D04 | O **refresh token é opaco** (48 bytes aleatórios), não JWT. Na tabela `sessoes` fica só o HMAC-SHA256 dele, com `JWT_REFRESH_SECRET` como chave. A cada `/auth/refresh` a sessão antiga é revogada e uma nova é emitida (rotação). | Um vazamento do banco não expõe tokens utilizáveis, e reusar um token antigo não funciona. |
| D05 | O cookie `onprint_rt` tem `path=/api/v1/auth`, `httpOnly`, `sameSite=strict` e `secure` só em produção. | O cookie só é enviado nas rotas de autenticação. |
| D06 | **Troca de senha obrigatória garantida na API**: o access token carrega `dts` (deve trocar senha). O preHandler `autenticar` devolve 403 `TROCA_SENHA_OBRIGATORIA`; só `/auth/me` e `/auth/trocar-senha` aceitam token com troca pendente. | O backend garante a regra, não o front. |
| D07 | Senha mínima de **8 caracteres** (o admin inicial `admin123` é exceção do seed e precisa ser trocado). | Segurança básica. |
| D08 | O login responde **401 com a mesma mensagem** para e-mail inexistente e senha errada, e roda o argon2 mesmo quando o e-mail não existe. | Evita descobrir e-mails cadastrados. |
| D09 | O **seed é idempotente** (upserts) e roda a cada subida do container da API. Cria os 7 papéis, o catálogo de permissões (módulos × ações) e o admin com todas as permissões. A matriz padrão dos outros papéis fica para a Fase 1. | `make up` já deixa o sistema pronto para login. |
| D10 | Módulos extras no catálogo de permissões: `artes`, `usuarios` e `permissoes`, além dos itens do menu. | Permite separar "Configurações" de "Usuários/Permissões", como pede o papel `gerente`. |
| D11 | O pacote `@onprint/shared` é consumido **como fonte TypeScript** (sem build próprio). Vite e tsx compilam direto; o build de produção da API (tsup) embute o pacote. | Nenhum passo de build a mais em desenvolvimento. |
| D12 | **Os node_modules vivem em volumes Docker.** Só o container da API roda `npm install`; o web espera a API ficar saudável e usa os mesmos volumes. | Uma única instalação, que economiza disco e CPU e evita binários do Windows dentro do Linux. |
| D13 | **Hot reload por polling (1 s)** na API e no web. | Volumes montados a partir do Windows não propagam eventos de arquivo para o container. |
| D14 | Os alvos do `Makefile` têm equivalentes `npm run up/down/logs/migrate/reset/seed/backup/restore`. Backup e restore são scripts Node que usam `pg_dump`/`pg_restore` de dentro do container. | O Windows não traz `make` nem `pg_dump`. |
| D15 | A busca "Localizar…" (Ctrl+K) encontra, por enquanto, **telas do sistema**. Clientes, orçamentos e pedidos entram na Fase 7. | Sem dados mockados. |
| D16 | O projeto fica na raiz desta pasta (não em `onprint-control/`); o nome do projeto no Docker é `onprint-control`. | Simplicidade. |
| D17 | `/health` existe na raiz (usado pelo healthcheck) e também em `/api/v1/health`. | Healthcheck simples e acesso via proxy do front. |
| D18 | `docker-compose.prod.yml` e `Caddyfile` já foram criados, mas **só serão validados na Fase 8**. | Evita builds pesados agora; a máquina de desenvolvimento tem recursos limitados. |

## Fase 1

| # | Decisão | Motivo |
|---|---|---|
| D19 | **Login e permissão são checados no hook `onRequest`**, antes do parse e da validação do corpo. | No `preHandler` o Fastify validava o corpo primeiro, e um usuário sem permissão recebia 400 em vez de 403, vendo os detalhes de validação. Há teste cobrindo isso. |
| D20 | **Rotas de leitura de dados de referência** (`GET /empresa`, `/status`, `/templates`, `/usuarios/opcoes`) ficam abertas a qualquer usuário logado. **Todas as rotas de gestão** de Configurações (usuários, permissões, empresa, status, templates) exigem permissão e devolvem 403. | Badges, o "Copiar mensagem" e o PDF do orçamento (Fase 3) precisam desses dados para todos os papéis. A tela de Configurações não aparece no menu nem abre pela URL para quem não tem permissão. |
| D21 | O seed aplica a **matriz padrão de permissões só quando o papel ainda não tem nenhuma**. O admin é fixo (sempre com tudo, não editável). O gerente recebe tudo, exceto `usuarios` e `permissoes`. | O seed roda a cada subida e não pode desfazer o que o admin configurou. |
| D22 | **Os 7 papéis padrão não são criados nem excluídos pela tela**; só a matriz de cada um é editável. | Atende "papéis padrão, editáveis em Configurações → Permissões" sem inventar a gestão de papéis. |
| D23 | Em `status_config`, **só rótulo, cor e ordem são editáveis**; os códigos são fixos. Foi incluída a entidade `cliente` (situação: pré-cadastro, ativo, inativo, bloqueado). | As regras de negócio usam os códigos. O StatusBadge único cobre também a situação do cliente. |
| D24 | **Templates de mensagem são excluídos de fato.** Clientes, fornecedores e usuários usam exclusão lógica (`ativo = false`) e podem ser reativados. | Template é configuração, não cadastro nem documento. |
| D25 | **CPF/CNPJ e WhatsApp continuam únicos mesmo em cadastros desativados**; o caminho é reativar o existente. Documentos, telefones e CEP são gravados só com dígitos. | Evita duplicidade de clientes. |
| D26 | **Arquivos**: `POST /arquivos?entidade=&entidadeId=&categoria=` (multipart). O tipo é validado pela extensão (lista da seção 10). O download passa pela API com `Content-Security-Policy: sandbox`; SVG, AI, CDR e similares sempre são baixados, nunca exibidos. A URL temporária é assinada com HMAC e vale 10 min. | Arquivo enviado por usuário nunca executa script no domínio do sistema. |
| D27 | As **miniaturas com `sharp`** ficam para a Fase 4 (artes). | Nesta fase não há tela que use miniatura; o logo é exibido pelo próprio arquivo. |
| D28 | O **logo** aceita PNG, JPG e SVG (até 5 MB no front) e é visível a qualquer usuário logado. O logo anterior é apagado ao enviar um novo. | Uso no cabeçalho do PDF do orçamento. |
| D29 | **Desativar um usuário ou redefinir a senha revoga as sessões na hora.** O access token já emitido vale até expirar (no máximo 15 min). Mudanças na matriz de permissões valem na hora, porque o cache é invalidado. | Equilíbrio entre segurança e simplicidade, sem consultar o banco a cada requisição para checar o usuário. |
| D30 | O sistema **não deixa ficar sem administrador ativo**, e o usuário não pode desativar a si mesmo. | Evita perder o acesso ao sistema. |
| D31 | `@tanstack/react-table` foi **fixado na v8**. | A v9 mudou a API (`useTable`, `TableFeatures`). |
| D32 | As **portas do Docker ficam só em `127.0.0.1`** e o Vite não usa `host: true`. | Com `host: true`, o Postgres (senha fraca), a API e o Vite ficavam expostos em todas as interfaces da máquina, inclusive IP público. |
| D33 | **Testes ponta a ponta** (`npm run e2e`) rodam num banco descartável `onprint_e2e`, dentro do mesmo Postgres, com uma API temporária na porta 3334. | Validar regras reais (403, conflitos, uploads) sem tocar nos dados de desenvolvimento. |
| D34 | As tabelas `numeracao` e `notificacoes` já existem. A numeração (`proximoNumero`) passa a ser usada na Fase 3 e a central de notificações na Fase 7. | Seção 8.1 completa nesta fase, como pede o roadmap. |

## Fase 2

| # | Decisão | Motivo |
|---|---|---|
| D35 | **Arredondamento:** cada componente (produto e cada acabamento) é arredondado em centavos com `ROUND_HALF_UP`, e o total é a soma dos componentes arredondados. | O total sempre bate com as linhas exibidas no orçamento e no PDF. |
| D36 | **Metro linear:** o comprimento é informado no campo *largura*. **Hora:** a quantidade é o número de horas. **Milheiro:** a quantidade são unidades, arredondadas para cima em lotes de 1.000. | Mantém os mesmos campos (quantidade, largura, altura) para todos os modos. |
| D37 | **Bases dos acabamentos:** fixo = 1 por item; por unidade = peças; por m² = área total (a mesma área cobrada no produto m²); por metro linear = largura × peças; por perímetro = 2 × (L + A) × peças. Acabamento por medida num item sem medidas é erro. | Regras explícitas e testadas; ilhós e bainha são cobrados por perímetro. |
| D38 | As **medidas máximas valem em qualquer orientação** (a peça pode ser girada). | Uma lona de 3 × 1,5 m é impressa girada numa bobina de 1,6 m. |
| D39 | O **preço mínimo é comparado ao preço unitário** (por m², peça etc.). O motor só sinaliza (`abaixoDoMinimo`); o bloqueio que exige a permissão `aprovar` entra no orçamento (Fase 3). | Na Fase 2 não há documento a salvar. |
| D40 | **Margem** do cadastro = markup sobre o custo (preço = custo × (1 + margem/100)). A **margem estimada** exibida é sobre o preço de venda: (total − custo) ÷ total. | Markup é como a gráfica forma preço; a margem sobre a venda é a leitura gerencial. |
| D41 | **Custo e margem só são devolvidos pela API para quem tem `produtos:editar`.** Para os demais, os campos são removidos e a simulação volta com `custoTotal` e `margemPercentual` nulos. | Atende "a margem estimada só é retornada pela API para quem tem permissão". Quem edita o preço precisa ver o custo. |
| D42 | **Código do produto automático** (`PRD-0001…`), via tabela `numeracao` sem ano (ano 0), quando não informado. Códigos digitados manualmente são aceitos e únicos; o gerador pula números já usados. | Evita digitar código sem impedir SKUs próprios. |
| D43 | **Ficha técnica:** a quantidade tem base explícita (por peça, por m² ou por metro linear) e perda em %. Só aceita itens do tipo insumo ou revenda. | Um banner consome lona por m², e uma caneca consome 1 caneca branca por peça. A base explícita deixa a baixa de estoque da Fase 5 sem ambiguidade. |
| D44 | **Acabamentos do produto:** "permitido", "vem marcado" (padrão) e "obrigatório" (que implica padrão). A API sempre inclui os obrigatórios na simulação. A simulação aceita qualquer acabamento ativo, mesmo que não esteja vinculado ao produto. | O vínculo orienta o vendedor sem engessar orçamentos especiais. |
| D45 | **Composição** (acabamentos, ficha técnica, roteiro) é salva por substituição da lista inteira (`PUT /produtos/:id/{acabamentos,insumos,processos}`), em transação e com auditoria. A ordem do roteiro é a ordem da lista. | Mais simples e atômico que editar item a item. |
| D46 | **Unidades de medida** são uma tabela de referência mantida pelo seed (sem tela de cadastro). | Lista pequena e estável. |
| D47 | **Catálogo de exemplo** (banner, adesivo, cartão, caneca, instalação, insumos, acabamentos, máquinas e processos) é criado pelo seed **só se não houver nenhum produto**. | Permite testar o fluxo e o critério de aceite. Pode ser desativado pela tela. |
| D48 | **Máquinas e Processos** ficam numa tela única, com abas, acessível tanto por Produtos quanto por Configurações. As permissões usam o módulo `produtos`. | O menu do prompt tem os dois caminhos; uma única tela evita duplicar código. |
| D49 | Os **cadastros simples** usam um CRUD genérico na API (`core/crud.ts` e `core/crud-rotas.ts`), com auditoria, busca, paginação e exclusão lógica. No front usam o componente `CadastroLista`. | Menos repetição; clientes e fornecedores continuam com service próprio porque têm regras e subcadastros. |

## Fase 3

| # | Decisão | Motivo |
|---|---|---|
| D50 | **`contas_receber` e `comissoes` foram criadas já nesta fase** (8.7), com os campos da seção 8.7. Forma de pagamento, conta financeira, categoria e anexo entram na Fase 6 por migration, junto com as telas. | O critério de aceite exige "pedido criado com contas a receber". |
| D51 | Tabelas **`pedidos`, `pedido_itens`, `artes` e `entregas` (8.4)** foram criadas nesta migration. As telas de pedido, arte e entrega são da Fase 4; aqui o pedido gerado aparece resumido no próprio orçamento. | A seção 8.4 é o modelo do comercial, e a conversão precisa delas. |
| D52 | **Valores monetários trafegam como string decimal canônica** do Prisma (`"160"`, `"40.5"`), sem forçar 2 casas. O front sempre formata em R$. | O `Decimal` não guarda a escala da coluna. Continua sendo "string decimal", sem erro de ponto flutuante. |
| D53 | **Colunas DATE** (validade, vencimento, previsão) chegam como `AAAA-MM-DDT00:00:00Z` e são exibidas com `formatarDataSimples`, sem conversão de fuso. As regras usam `hojeISO()` (data de hoje em São Paulo). | Evita que 06/10 vire 05/10 por causa do fuso. |
| D54 | **Dias úteis** = segunda a sexta, **sem feriados**. | Um calendário de feriados é requisito não descrito; fica para depois se necessário. |
| D55 | **Escopo "só os meus":** sem `orcamentos:ver_todos`, a lista e o acesso direto se restringem a `vendedor_id = usuário` (404 para os demais). Nas **solicitações**, o usuário vê as próprias e as **sem responsável** (fila de atendimento). Só quem tem `ver_todos` cria orçamento em nome de outro vendedor. | Seção 7 (escopo "somente meus"). |
| D56 | **Preço abaixo do mínimo:** a API recusa (422) sem `orcamentos:aprovar`. Com a permissão, grava quem liberou (`preco_liberado_por`) no item. | Seção 9 ("exige permissão aprovar para ser salvo"), com rastreabilidade. |
| D57 | **Aprovação interna** ("Registrar aprovação") exige `orcamentos:editar` e grava o nome como "(registrado internamente)". O link público grava nome, data e IP e **notifica o vendedor** (tabela `notificacoes`). | O cliente costuma aprovar pelo WhatsApp; a origem fica distinguível. |
| D58 | **Status:** a edição só é permitida em rascunho, enviado ou em negociação. Aprovado, recusado ou expirado podem ser **reabertos** (voltam para "em negociação"; se a validade venceu, renova pelo prazo padrão da empresa). **Só orçamento aprovado vira pedido.** "Marcar como enviado" é manual; o "Copiar mensagem" apenas sugere a ação. | Fluxo da seção 9. |
| D59 | **Conversão:** sinal (padrão da empresa) com vencimento hoje e saldo em N parcelas a cada X dias; os centavos vão para a última parcela. A comissão usa o `comissao_percentual` do vendedor sobre o total do pedido e só é criada se for maior que 0. Uma arte v1 "aguardando arquivo" é criada por item. Entrega e instalação usam o endereço informado ou o primeiro do cliente, e é exigido pelo menos um endereço. | Seção 9. |
| D60 | **Expiração:** job diário às 00:05 (`America/Sao_Paulo`), executado também na subida da API, e verificação ao abrir o link público. | Seção 10 + "verificação ao abrir"; a subida cobre períodos em que a API estava desligada. |
| D61 | **Catálogo para orçar** (`/orcamentos/catalogo`) fica sob a permissão de orçamentos e não exige o módulo Produtos. Custos só aparecem para quem tem `produtos:editar`. | O vendedor precisa orçar sem acessar o cadastro de produtos. |
| D62 | O **PDF** é gerado no navegador (`@react-pdf/renderer`, carregado sob demanda, cerca de 460 KB gzip). O logo entra se for PNG ou JPG; SVG é ignorado no PDF. | A seção 11 pede exportações geradas no navegador. A biblioteca não renderiza SVG como imagem. |
| D63 | **Duplicar** cria um rascunho com os mesmos itens e os preços negociados, recalculados com o cadastro atual (acabamentos e medidas máximas). | Base para uma nova proposta sem perder a negociação. |
| D64 | Rotas públicas com **limite de 30 requisições por minuto por IP** e tokens aleatórios de 24 bytes (base64url). | Dificultar tentativa de tokens. |

## Fase 4

| # | Decisão | Motivo |
|---|---|---|
| D65 | **OPs geradas na conversão** do orçamento, uma por item, na mesma transação. Máquina = primeira do roteiro do produto; horas = área ÷ velocidade da máquina (sem área ou velocidade, soma dos tempos padrão dos processos); prazo = entrega prevista do pedido. Itens sem OP ativa podem gerar a OP depois ("Gerar OPs", `producao:criar`). | A seção 9 pede OP por item; gerar junto com o pedido evita pedido "esquecido" fora da produção. |
| D66 | **Status do pedido automático** a partir da última versão da arte de cada item e das OPs não canceladas: todas as OPs concluídas → `pronto`; todas as artes aprovadas ou alguma OP além da pré-impressão → `em_producao`; arte enviada ou com ajuste → `arte_em_aprovacao`; senão `aguardando_arte`. `em_entrega`, `entregue` e `cancelado` só mudam por ação explícita. Função pura em `packages/shared` (`statusAutomaticoPedido`), testada. | Critério de aceite ("pedido vira pronto sozinho") e uma única regra para API e testes. |
| D67 | **Transições manuais do pedido** (kanban de pedidos): apenas `pronto → em_entrega/entregue` e `em_entrega → pronto/entregue`. As demais colunas ficam apagadas durante o arraste. | As outras mudanças dependem de arte e produção; mexer à mão quebraria a automação. |
| D68 | **Trava da arte**: a OP só **entra** em impressão (ou etapas seguintes) com a última versão da arte aprovada. O **override** exige `producao:aprovar` e motivo, fica no histórico da etapa e na auditoria (`acao = override`). Depois de liberada, a OP segue sem nova liberação. | Seção 9; liberar a cada etapa seria só burocracia. |
| D69 | **Artes versionadas**: o primeiro arquivo preenche a v1 (criada na conversão); cada novo arquivo cria a versão seguinte **com novo link**. Só a versão mais recente pode ser enviada, aprovada ou respondida; links antigos ficam só para consulta. Nova versão depois de aprovada volta para "em criação". | Evita aprovar uma versão já substituída. |
| D70 | **Miniatura** (JPEG até 480 px, `sharp`) só para PNG, JPG e TIFF. PDF, AI, CDR, PSD etc. aparecem com ícone. Falha na miniatura nunca impede o envio. A API devolve a **URL assinada** (1 h) da miniatura junto com a OP e o pedido. | Gerar prévia de PDF/AI exigiria ferramentas pesadas (ghostscript etc.) no container; `<img>` não envia o token. |
| D71 | **Link público da arte** mostra a imagem (ou o PDF embutido) e só os **comentários do cliente**; comentários internos da equipe ficam fora. Aprovar exige nome + aceite; pedir ajuste exige nome + descrição. Designer e vendedor são notificados. | Privacidade das conversas internas. |
| D72 | **Comentários internos na arte**: quem tem `artes:visualizar` **ou** `pedidos:editar` (o vendedor conversa com o designer pela arte). | O papel vendedor não tem o módulo Artes na matriz padrão. |
| D73 | **Cancelar pedido** (`pedidos:excluir`, motivo obrigatório): títulos em aberto/vencidos → cancelados, comissões previstas removidas, OPs canceladas (somem do kanban), entregas pendentes canceladas. Ponto de extensão `AoCancelarPedido` para o estorno de estoque (Fase 5). Pedido entregue não pode ser cancelado. | Seção 9 + consistência financeira. |
| D74 | **Entregas**: "saiu para entrega" leva o pedido `pronto → em_entrega`; "confirmar entrega" (quem recebeu) leva a `entregue`. A confirmação só é permitida com o pedido pronto ou em entrega. Comprovante opcional (PDF/imagem). | Fluxo real do balcão e da instalação. |
| D75 | **Socket.IO** no mesmo servidor da API (sem container extra), autenticado pelo access token no handshake. Salas: `producao` (quem vê produção ou PCP), `pedidos` (quem vê pedidos) e `usuario:{id}`. Eventos `op:atualizada`, `pedido:atualizado`, `notificacao:nova` carregam só ids; o front **invalida as queries** e busca pela API REST (que aplica permissões e escopo). Ao reconectar, usa o token atual (renova se expirou). | Restrição de 3 containers; nenhum dado sensível trafega pelo socket. |
| D76 | **Capacidade do PCP**: 8 h por dia útil × 5 dias por máquina com status "ativa" (manutenção/parada = 0). Demanda da semana = horas das OPs abertas com prazo até domingo. Gargalo = ocupação acima de 100%. Gantt de 14 dias: sem data de início prevista, a barra termina no prazo e dura `ceil(horas ÷ 8)` dias; OP atrasada aparece a partir de hoje, em vermelho. | Não há turnos cadastrados; regra simples e explicada na tela. |
| D77 | **Ordem no kanban** (`ordem_kanban`) salva por coluna com a ordem vista na tela; mudança de etapa sem ordem (página da OP) coloca a OP no fim da coluna. Kanban mostra concluídas dos últimos 3 dias; o de pedidos mostra entregues dos últimos 7 dias. | Colunas finais não crescem para sempre. |
| D78 | **Linha do tempo do pedido** = auditoria (pedido, artes, entregas) + histórico de etapas das OPs + comentários das artes, ordenada do mais recente. | Seção 9 ("Histórico") sem tabela extra. |
| D79 | **Telas sob demanda** (`React.lazy` em `app/paginas.ts`): o bundle inicial caiu de 637 KB para 260 KB. | Computador do usuário tem poucos recursos. |
| D80 | Variável de template **`{{numero_pedido}}`** adicionada (templates "Arte para aprovação" e "Pedido pronto"). | Mensagens do pedido precisam do número. |

## Fase 5

| # | Decisão | Motivo |
|---|---|---|
| D81 | **Quantidade com sinal** nas movimentações (positiva entra, negativa sai), com o **saldo resultante** gravado em cada linha. Transferência = duas movimentações ligadas por `transferencia_id`. | Extrato (kardex) sem cálculo e somas simples. |
| D82 | **Única porta de saldo:** `movimentar()` cria a linha de saldo se preciso, **trava-a com `SELECT … FOR UPDATE`** até o commit, grava a movimentação e atualiza saldo e custo médio. Nenhum outro código altera `estoque_saldos`. | Seção 9 ("saldo muda somente via movimentação") e concorrência segura. |
| D83 | **Custo médio ponderado** por local, recalculado só em entradas (e na perna de chegada da transferência, que leva o custo da origem). Saídas usam o custo médio atual. Com saldo zerado/negativo, vale o custo da nota. O **custo do cadastro do produto** passa a ser o custo médio após cada entrada de compra. | Custo real das compras alimenta o custo estimado dos orçamentos. |
| D84 | **Baixa pela ficha técnica** ao concluir a OP, na mesma transação do kanban: por peça × peças; por m² × **área real** (largura × altura × peças, **sem a área mínima de cobrança**); por metro linear × comprimento × peças; tudo × (1 + perda %). Só insumos com "controla estoque". Item de revenda/insumo sem ficha baixa a própria quantidade. Função pura `consumoDeInsumo` com testes. | Critério de aceite ("reduz a lona pela área + perda"); a área mínima é regra de preço, não de consumo. |
| D85 | A baixa acontece **uma vez por OP**: voltar a OP e concluir de novo não baixa em dobro; voltar não devolve o material. | O material já foi usado; correções pelo ajuste. |
| D86 | **Saldo negativo** só é permitido na baixa automática da produção (o material foi usado mesmo sem entrada lançada). Saída, perda e transferência manuais não podem passar do saldo. | Não travar a produção por falta de lançamento, sem esconder o problema (o item aparece como "sem estoque"). |
| D87 | **Ajuste de inventário** informa o **saldo contado**; o sistema lança a diferença. Exige `estoque:aprovar` (gerente e admin). Saída, perda, transferência e entrada exigem `estoque:criar`; locais, `estoque:editar`. | O ajuste corrige o saldo sem rastrear a causa: é sensível. |
| D88 | **Alerta** quando o saldo total (todos os locais) é **≤ mínimo** (inclui zerados). Ao cruzar o mínimo numa saída, notifica em tempo real quem tem `estoque:editar`; o menu mostra a contagem; o job das 07:00 manda o resumo diário. Transferências não geram alerta. Sugestão de compra = repor até o dobro do mínimo. | Seção 9 + seção 10. |
| D89 | **Local padrão** único (criado pelo seed: "Almoxarifado"), usado pela produção e, na Fase 6, pelo PDV. Não pode ser desativado nem deixar de ser padrão sem escolher outro; local com saldo não pode ser desativado. | A baixa automática precisa de um local certo. |
| D90 | **Estorno no cancelamento é opcional** (caixa "Devolver ao estoque", só aparece se alguma OP foi concluída): devolve o que o pedido consumiu como **ajuste** com motivo "Estorno do cancelamento…", ao custo médio atual. | Seção 9 diz "estorna o estoque **se aplicável**": na maioria dos casos o material impresso não volta. |
| D91 | Entrada registra **fornecedor, NF, data, local e itens** (sem edição/estorno da nota: correções por ajuste). O mesmo produto não pode repetir na nota. Numeração `ENT-AAAA-NNNN`. A rota `/estoque/fornecedores` lista fornecedores para quem dá entrada sem exigir o módulo Fornecedores. | Simplicidade e rastreabilidade; o papel Produção não vê Fornecedores. |
| D92 | Custos de insumos ficam visíveis a quem acessa o Estoque (inclui o papel Produção). A margem dos produtos continua restrita a `produtos:editar`. | Quem lança a nota precisa ver e digitar o custo; custo de insumo não expõe margem. |
| D93 | Os ganchos de produção/pedido devolvem uma **ação pós-commit** (avisos em tempo real só depois que a transação confirmou). | Não avisar sobre algo que foi desfeito. |

## Fase 6

| # | Decisão | Motivo |
|---|---|---|
| D94 | **Baixa**: informa-se o valor que entrou (ou saiu) + juros, multa e desconto; o **principal** abatido = valor − juros − multa + desconto e não pode passar do saldo. Título com algum pagamento fica "parcial" (mesmo vencido; o atraso aparece pela data). Função pura `aplicarBaixa` com testes. | Seção 9 ("baixa parcial ou total, com juros, multa e desconto") sem ambiguidade no saldo. |
| D95 | **Status financeiro do pedido** = pelos títulos não cancelados (`statusFinanceiroPedido`). Ao ficar **pago**, as comissões previstas viram **liberadas** e o vendedor é notificado; se um estorno tirar o "pago", voltam a previstas. | Critério de aceite da fase. |
| D96 | **Estorno** não apaga: lança o movimento contrário (`estorno_de_id`), estorna junto a taxa ligada e devolve o saldo do título. Não pode estornar duas vezes. Recebimento feito num caixa já fechado não pode ser estornado pelo financeiro. | Extrato auditável; o caixa fechado já foi conferido. |
| D97 | **Taxa da forma** (cartão) vira despesa "Taxas de cartão" no mesmo dia, ligada ao recebimento (`baixa_de_id`). "Dias para receber" é informativo nesta fase (o movimento entra na data da baixa). | Custo real visível no fluxo, sem conciliação bancária (fora do escopo). |
| D98 | **Categorias do sistema** têm `codigo` (vendas, vendas_balcao, taxas_cartao, comissoes, compras_insumos, outras_receitas, outras_despesas). Parcelas geradas na conversão entram em "Pedidos"; lançamentos sem categoria vão para "Outras receitas/despesas". Seed cria contas, formas e categorias só se o financeiro estiver vazio. | Relatórios (Fase 7) agrupam por categoria. |
| D99 | **Títulos manuais**: valor total dividido em N parcelas iguais (centavos na última) a cada X dias. Cancelar só sem pagamento (estorne antes); o valor só muda sem pagamento. Título lançado com vencimento passado já nasce "vencido"; o job das 00:10 marca os demais. | Consistência entre saldo e extrato. |
| D100 | **Fluxo de caixa**: realizado = movimentos; previsto = saldo dos títulos em aberto por vencimento (os vencidos entram no dia de hoje). Saldo inicial = saldo inicial das contas + movimentos anteriores. Transferências (sangria/suprimento) mudam o saldo das contas, mas não aparecem como receita/despesa. Filtrando por conta, só o realizado. | Seção 9 ("realizado e previsto"). |
| D101 | **Comissão paga** gera uma saída por comissão (categoria Comissões) na conta escolhida; só comissões **liberadas** podem ser pagas. O vendedor é notificado. | Rastreio de cada comissão no extrato. |
| D102 | **Caixa**: uma sessão aberta por operador, ligada a uma conta do tipo caixa. O troco inicial não gera movimento (é dinheiro que já é da conta; informe-o no saldo inicial da conta "Caixa da loja"). Fechar: o próprio operador ou quem tem `caixa:editar`. | Simples para o balcão e sem duplicar dinheiro. |
| D103 | **Sangria e suprimento** exigem motivo e são **transferência** entre a conta do caixa e outra conta (padrão: a primeira conta não-caixa). Sangria não pode passar do dinheiro na gaveta. | Seção 9 + o dinheiro não "some" do financeiro. |
| D104 | **Fechamento com conferência por forma** (informado × calculado; abertura, sangria e suprimento contam como dinheiro). A diferença **em dinheiro** vira lançamento na conta do caixa (sobra = outras receitas, falta = outras despesas); nas demais formas fica só registrada. | Seção 9; o saldo da conta caixa acompanha a gaveta real. |
| D105 | **PDV**: produtos ativos vendidos por unidade; **preço sempre do cadastro** (a API recalcula); desconto no total; várias formas; **troco só em dinheiro**. Dinheiro entra na conta do caixa; demais formas, na conta da forma. Estoque baixa como `venda_pdv` e **não** pode ficar negativo. Cancelar venda só com o caixa aberto (`caixa:editar`): estorna financeiro, gaveta e estoque. | Seção 9 ("venda exige caixa aberto"); a API é a fonte da verdade. |
| D106 | **Recebimento no balcão** usa a mesma baixa do financeiro, ligada à sessão (entra na gaveta e na conferência). O caixa busca títulos em aberto por cliente, pedido ou descrição sem precisar do módulo Financeiro. | Papel Caixa (seção 7) recebe títulos. |
| D107 | **Pedido cancelado** continua cancelando só títulos sem pagamento; títulos parciais ficam como estão (devolução de dinheiro é tratada manualmente no financeiro). | Evitar sumir com dinheiro recebido. |
| D108 | O papel **Financeiro não acessa Pedidos** (matriz da seção 7): nas telas financeiras o número do pedido aparece como texto para ele. | Respeita a matriz de permissões. |
| D109 | Campos de dinheiro **selecionam o conteúdo ao focar** (digitar substitui "0,00" ou o valor sugerido). | Erro real encontrado no teste do PDV (dígitos eram somados ao valor sugerido). |

## Fase 7

| # | Decisão | Motivo |
|---|---|---|
| D110 | **KPIs do dashboard**: faturamento do mês = pedidos não cancelados criados no mês + vendas do balcão concluídas; orçamentos em aberto = rascunho, enviado e em negociação; conversão (90 dias) = convertidos ÷ orçamentos que saíram do rascunho; "Solicitações a orçar" = novas + em atendimento; atrasado = pedido aguardando arte, em aprovação ou em produção com entrega antes de hoje; a receber/pagar = **saldo** dos títulos em aberto. | Definições objetivas, conferidas com SQL no e2e. |
| D111 | Cada bloco do dashboard só aparece para quem tem permissão no módulo (vendas, produção, financeiro, estoque); sem `ver_todos`, o vendedor vê só os próprios números. | Matriz da seção 7 vale também para os indicadores. |
| D112 | **Formato único de relatório** (título, período, resumo, gráfico, colunas tipadas, linhas, observação) montado por agregação SQL no banco; a tela, o CSV e o PDF são genéricos. Visão inexistente → 422. | Um só componente para 18 visões; números nunca somados no navegador. |
| D113 | **Definições**: vendas incluem o balcão; curva ABC pelo valor consumido (quantidade × custo médio da saída) — A até 80% acumulado, B até 95%, C o resto; DRE em **regime de caixa** (movimentos realizados, sem transferências; estornos se anulam); inadimplência = saldo vencido na data de hoje, por faixa de atraso; comissões pela data do pedido (pedidos cancelados ficam de fora). | Critérios explícitos e explicados em nota no próprio relatório. |
| D114 | **Gráficos em CSS puro** (barras verticais e horizontais), sem biblioteca de gráficos; o PDF de relatório usa o @react-pdf já existente, carregado só ao clicar. | Bundle leve (PC e VPS modestos). |
| D115 | CSV com `;`, BOM UTF-8 e vírgula decimal (valores crus, sem "R$"). | Abre direto no Excel brasileiro. |
| D116 | **Busca global** a partir de 2 letras: até 6 clientes, pedidos e orçamentos (nome, fantasia, dígitos de documento/telefone, número), com as mesmas permissões e escopo das listas. | Seção 11. |
| D117 | **Central de notificações** usa a tabela existente; o usuário só lê/marca as próprias; atualiza pelo evento em tempo real já emitido. | Sem migration nova. |

## Fase 8

| # | Decisão | Motivo |
|---|---|---|
| D118 | Produção com os **mesmos 3 containers**: Caddy serve o front e faz o proxy de `/api` e `/socket.io`; banco e API sem portas publicadas; logs limitados (3 × 10 MB). | VPS modesta, superfície mínima exposta. |
| D119 | A imagem da API executa `migrate deploy` → **seed idempotente** (compilado junto, sem tsx) → servidor. O admin inicial vem de `ADMIN_EMAIL`/`ADMIN_SENHA_INICIAL` e só é criado com o banco **sem usuários** (renomear ou desativar o admin não o recria). O catálogo de exemplo só entra com `SEED_EXEMPLOS=true` (padrão em produção: não). | Primeiro start funcional sem passo manual e sem senha conhecida. |
| D120 | Em produção a API **não sobe** com segredos JWT com menos de 32 caracteres, contendo "troque" ou iguais entre si. | Evita ir ao ar com os valores de exemplo. |
| D121 | O limite de login passou a ser de **5 tentativas/min por IP + e-mail** (antes, só por IP). | Numa loja todos saem pelo mesmo IP: o limite só por IP travaria a equipe no início do expediente. |
| D122 | Backup na VPS por **script shell** (`scripts/vps/backup.sh`: pg_dump custom + tar dos uploads, 14 dias de retenção, cópia externa opcional via rclone) agendado no cron; restauração com confirmação digitada. | A VPS não precisa de Node; rclone atende Drive/S3/etc. sem integração no sistema. |
| D123 | Cabeçalhos no Caddy: HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy; `/assets` com cache imutável e páginas `no-cache`. Sem CSP no front nesta fase (o PDF e os workers do Vite exigiriam exceções; a API já envia CSP via helmet). | Segurança sem quebrar recursos; CSP pode ser endurecida depois. |
| D124 | **Contraste AA**: turquesa/coral originais ficam para elementos decorativos (barras, bordas, bolinhas); texto e botões usam `turquesa-escuro` (#0F766E) e `coral-escuro` (#C8322F); cinza secundário #5B6472. Badges de status (cores configuráveis) calculam o tom do texto até atingir 4,5:1. | Resultado do axe-core; mantém a identidade visual. |
| D125 | A lista de máquinas para filtros/apontamentos da produção tem rota própria (`/producao/maquinas`, produção **ou** produtos). O papel Caixa deixa de ter o módulo Produtos (a grade do PDV vem de `/caixa/produtos`). | Tour por papel encontrou 403 na tela de produção e menus sem uso para o caixa. |
| D126 | O front só tenta renovar a sessão ao abrir se houve login neste navegador (marca sem segredo no localStorage). | Sem 401 no console na tela de login; o refresh token segue em cookie httpOnly. |
| D127 | Aceite da fase: `e2e-fase8` (fluxo inteiro, cada etapa pelo papel responsável) roda tanto no banco descartável quanto contra o compose de produção; tour no navegador por todas as telas de cada papel com axe-core. | Critério "fluxo ponta a ponta por cada papel" verificável e repetível. |

## Fora do escopo registrado

- **Emissão de nota fiscal:** não faz parte do escopo atual. Nenhum ponto de extensão foi criado (seção 13).
