# PROMPT MESTRE — ONPrint Control (v3 — PostgreSQL + API própria + React, em Docker)

> Este prompt define o produto, a arquitetura, o banco de dados, as regras de trabalho e o plano de fases. Execute **uma fase por vez** e pare ao final de cada uma.

---

## 0. PAPEL E REGRAS DE TRABALHO DO AGENTE

Você é um engenheiro de software sênior full-stack, especialista em TypeScript, Node.js, React e PostgreSQL. Sua tarefa é construir do zero o **ONPrint Control**, um ERP web para uma empresa de comunicação visual, impressão, personalizados e produção sob encomenda.

Regras obrigatórias:

1. **Trabalhe por fases** (seção 14) e execute somente a fase solicitada. Ao terminar, pare e entregue: resumo do que foi feito, arquivos criados/alterados, migrations criadas, como testar passo a passo e pendências conhecidas. Depois aguarde meu "OK, próxima fase".
2. **Primeira ação do projeto:** salve este prompt em `docs/ARQUITETURA.md` e crie `docs/ROADMAP.md` com as fases em checklist. Atualize o ROADMAP ao final de cada fase. Consulte esses arquivos sempre que retomar o trabalho.
3. **Arquitetura enxuta:** o sistema inteiro roda com **3 containers** (PostgreSQL, API e Web). Não adicione Supabase, Firebase, Redis, filas, MinIO ou qualquer outro serviço sem minha autorização. Se achar que algo é necessário, pergunte antes.
4. **Tudo local e offline:** nenhuma fase pode depender de conta em nuvem, API externa ou serviço pago.
5. **Integrações externas ficam para depois** (seção 13). Não implemente WhatsApp, busca de CEP, envio de e-mail, gateways de pagamento ou nota fiscal. Deixe apenas os pontos de extensão indicados.
6. **Funcional antes de bonito:** cada tela precisa salvar, listar, editar e excluir de verdade pela API antes de receber refinamento visual. Telas já implementadas não podem usar dados mockados.
7. **Banco só via migrations** do Prisma, versionadas no git. O comando `make reset` deve recriar o banco do zero com migrations + seed a qualquer momento.
8. **Segurança no backend:** toda rota protegida valida autenticação e permissão **na API**. O front apenas esconde botões e menus; quem garante o acesso é o backend. Nenhum segredo no código: tudo em `.env`, com `.env.example` sem valores reais.
9. **Regras de negócio no backend:** preços, totais, status e baixas são sempre calculados ou validados pela API. O front nunca é confiável.
10. **TypeScript estrito** no front, na API e no pacote compartilhado.
11. **Código limpo:** módulos pequenos, sem duplicação, arquivos com mais de ~300 linhas devem ser divididos.
12. **Idioma e formatos:** interface 100% em português do Brasil. Moeda em BRL (`R$ 1.234,56`), datas `dd/mm/aaaa`, fuso `America/Sao_Paulo`. Tabelas e colunas do banco em português sem acento, em snake_case (use `@@map`/`@map` no Prisma se os modelos estiverem em PascalCase).
13. **Não invente requisitos grandes** fora deste documento. Se algo estiver ambíguo, escolha a opção mais simples, registre a decisão em `docs/DECISOES.md` e siga.
14. Antes de encerrar cada fase, rode build, lint e testes dos três pacotes e corrija os erros.

---

## 1. CONTEXTO DO NEGÓCIO

A empresa vende produtos de comunicação visual e gráfica, como banners, lonas, adesivos, placas (ACM, PVC, PS), fachadas, cartões de visita, panfletos, etiquetas, camisetas e canecas personalizadas e brindes. Também presta serviços de instalação, criação de arte e entrega.

O atendimento começa quase sempre pelo WhatsApp. Nesta etapa, o contato é registrado manualmente no sistema (a integração vem depois). O sistema deve controlar este fluxo completo:

```
Contato do cliente → Pré-cadastro do cliente → Solicitação de orçamento
→ Orçamento (itens, medidas, acabamentos, preço) → Envio ao cliente
→ Aprovação (interna ou por link público) → Pedido de Venda
→ Financeiro (sinal/entrada + parcelas a receber)
→ Arte (envio, versões, aprovação da arte pelo cliente)
→ Produção (ordens de produção por item, kanban por etapa, máquinas)
→ Baixa de estoque (consumo de insumos) → Pronto
→ Entrega / Retirada / Instalação → Concluído
```

O dashboard e os relatórios consolidam tudo.

---

## 2. STACK TÉCNICA

**Infraestrutura**
- Docker + Docker Compose.
- PostgreSQL 16 (imagem `postgres:16-alpine`).
- Monorepo com **npm workspaces** (`apps/api`, `apps/web`, `packages/shared`).

**Backend (`apps/api`)**
| Item | Tecnologia |
|---|---|
| Runtime | Node.js 20 LTS + TypeScript |
| Framework HTTP | Fastify |
| ORM e migrations | Prisma |
| Validação | Zod (schemas vindos de `packages/shared`) |
| Autenticação | JWT (access token curto) + refresh token em cookie `httpOnly`; senhas com `argon2` |
| Upload de arquivos | `@fastify/multipart`, gravando em disco (volume Docker) |
| Tempo real | Socket.IO (kanban de produção e notificações) |
| Tarefas agendadas | `node-cron` dentro da API (expirar orçamentos, marcar títulos vencidos, alertas de estoque) |
| Segurança | `@fastify/helmet`, `@fastify/cors`, `@fastify/rate-limit` (login) |
| Documentação da API | `@fastify/swagger` + Swagger UI em `/docs` (só em desenvolvimento) |
| Logs | pino (nativo do Fastify) |
| Testes | Vitest |

**Frontend (`apps/web`)**
| Item | Tecnologia |
|---|---|
| Build | Vite + React 18 + TypeScript |
| Roteamento | React Router v6 |
| Dados/cache | TanStack Query + cliente HTTP próprio (fetch com renovação automática do token) |
| UI | Tailwind CSS + shadcn/ui |
| Ícones | lucide-react |
| Formulários | react-hook-form + zod |
| Tabelas | TanStack Table |
| Kanban | @dnd-kit |
| Gráficos | Recharts |
| Datas | date-fns (pt-BR) |
| Notificações | sonner |
| PDF | @react-pdf/renderer |
| Tempo real | socket.io-client |

**Pacote compartilhado (`packages/shared`)**
- Schemas Zod de entrada/saída usados pela API e pelo front.
- Tipos e enums (status, papéis, módulos, ações).
- **Motor de precificação** (`pricing.ts`) usado pelo front para mostrar valores ao vivo e pela API para recalcular e gravar. Use `decimal.js` para não ter erro de arredondamento.
- Formatadores (moeda, datas, CPF/CNPJ, telefone).

---

## 3. AMBIENTE EM DOCKER

### 3.1 Serviços

| Serviço | Container | Porta local |
|---|---|---|
| Banco | `db` (postgres:16-alpine, volume `pgdata`) | `5432` |
| API | `api` (Node 20, hot reload com `tsx watch`) | `3333` |
| Front | `web` (Vite dev server) | `5173` |

Em desenvolvimento, o front chama a API via proxy do Vite (`/api` → `http://api:3333`), evitando problemas de CORS.

### 3.2 Arquivos que o agente deve criar

- `docker-compose.yml` (desenvolvimento): os 3 serviços, volumes do código, `node_modules` em volumes separados, volume `uploads` montado na API, `healthcheck` no Postgres e `depends_on` com condição de saúde.
- `docker-compose.prod.yml` (produção futura): API com build de produção, front servido por **Caddy** (arquivos estáticos + proxy reverso para `/api` e `/socket.io` + HTTPS automático). Não precisa ser usado agora, mas deve funcionar.
- `apps/api/Dockerfile` e `apps/web/Dockerfile` multi-stage.
- `.env.example`:
  ```
  DATABASE_URL=postgresql://onprint:onprint@db:5432/onprint
  POSTGRES_USER=onprint
  POSTGRES_PASSWORD=onprint
  POSTGRES_DB=onprint
  JWT_ACCESS_SECRET=troque-isto
  JWT_REFRESH_SECRET=troque-isto-tambem
  JWT_ACCESS_EXPIRES=15m
  JWT_REFRESH_EXPIRES=7d
  APP_URL=http://localhost:5173
  UPLOAD_DIR=/app/uploads
  UPLOAD_MAX_MB=200
  TZ=America/Sao_Paulo
  ```
- `Makefile` com:
  - `make up` / `make down` / `make logs`
  - `make migrate` (cria e aplica migration)
  - `make reset` (recria banco + seed)
  - `make seed`
  - `make test`
  - `make backup` (`pg_dump` compactado + cópia da pasta de uploads para `backups/` com data no nome)
  - `make restore ARQ=...`
- `README.md` com pré-requisitos (Docker Desktop, Node 20), primeiro uso passo a passo, usuário admin inicial, portas e como acessar o banco por DBeaver/pgAdmin.

### 3.3 Usuário inicial

O seed cria **admin@onprint.local** com senha **admin123** e papel `admin`, somente para ambiente local. No primeiro login, o sistema obriga a troca de senha.

---

## 4. ESTRUTURA DE PASTAS

```
onprint-control/
├── docs/ (ARQUITETURA.md, ROADMAP.md, DECISOES.md, DEPLOY_VPS.md)
├── apps/
│   ├── api/
│   │   ├── prisma/
│   │   │   ├── schema.prisma
│   │   │   ├── migrations/
│   │   │   └── seed.ts
│   │   ├── src/
│   │   │   ├── server.ts          # bootstrap do Fastify
│   │   │   ├── config/            # env validado com zod
│   │   │   ├── plugins/           # prisma, auth, permissions, errors, socket, cron, swagger
│   │   │   ├── core/              # AppError, paginação, auditoria, numeração, storage
│   │   │   ├── modules/           # um diretório por módulo
│   │   │   │   ├── auth/
│   │   │   │   ├── usuarios/
│   │   │   │   ├── permissoes/
│   │   │   │   ├── empresa/
│   │   │   │   ├── clientes/
│   │   │   │   ├── fornecedores/
│   │   │   │   ├── produtos/      # categorias, produtos, acabamentos, maquinas, processos
│   │   │   │   ├── orcamentos/
│   │   │   │   ├── pedidos/
│   │   │   │   ├── artes/
│   │   │   │   ├── producao/
│   │   │   │   ├── estoque/
│   │   │   │   ├── financeiro/
│   │   │   │   ├── caixa/
│   │   │   │   ├── dashboard/
│   │   │   │   ├── relatorios/
│   │   │   │   ├── publico/       # rotas sem login: aprovação de orçamento e arte
│   │   │   │   └── arquivos/
│   │   │   │   (cada módulo: routes.ts, controller.ts, service.ts, repository.ts quando útil)
│   │   │   ├── jobs/              # tarefas agendadas
│   │   │   └── integrations/      # interfaces de integrações futuras
│   │   └── tests/
│   └── web/
│       └── src/
│           ├── app/               # providers, router, layout raiz
│           ├── api/               # cliente HTTP, socket, chamadas por módulo
│           ├── components/
│           │   ├── ui/            # shadcn
│           │   ├── layout/        # Sidebar, Topbar, PageHeader, FloatingActionButton
│           │   └── shared/        # DataTable, StatusBadge, KanbanBoard, KpiCard, ...
│           ├── features/          # uma pasta por módulo (pages, components, hooks)
│           ├── hooks/             # useAuth, usePermission, useSocket, useDebounce
│           └── lib/
├── packages/
│   └── shared/src/ (schemas/, enums.ts, pricing.ts, format.ts)
├── backups/                        # ignorado no git
├── docker-compose.yml
├── docker-compose.prod.yml
├── Caddyfile
├── Makefile
├── .env.example
└── README.md
```

Camadas no backend: **routes** (define rota, schema e permissão) → **controller** (lê request, chama service) → **service** (regra de negócio e transações) → **Prisma**. Nenhuma regra de negócio em routes ou controllers.

---

## 5. PADRÕES DA API

- Prefixo `/api/v1`. Recursos no plural em português: `/api/v1/clientes`, `/api/v1/orcamentos/:id/converter`.
- **Listagens** aceitam `?page=1&pageSize=20&sort=campo:asc&busca=texto` e filtros específicos. Resposta: `{ data: [...], meta: { page, pageSize, total } }`.
- **Erros** sempre no formato `{ error: { code, message, details? } }`, com status HTTP correto (400 validação, 401 não autenticado, 403 sem permissão, 404, 409 conflito, 422 regra de negócio).
- **Validação** de body, query e params com os schemas Zod do `packages/shared`.
- **Permissão** declarada na rota: `preHandler: [autenticar, exigirPermissao('clientes', 'editar')]`.
- **Transações** (`prisma.$transaction`) em toda operação que mexe em mais de uma tabela: conversão de orçamento, baixa de estoque, baixa financeira, fechamento de caixa, venda PDV.
- **Auditoria:** helper `registrarAuditoria(tx, { tabela, registroId, acao, antes, depois, usuarioId })` chamado nos services das entidades principais.
- **Numeração sequencial** (`ORC-2026-0001`, `PED-2026-0001`, `OP-2026-0001`) via tabela `numeracao` com `SELECT ... FOR UPDATE` dentro da transação, para nunca repetir número.
- **Exclusão lógica** (`ativo = false`) em cadastros; documentos (orçamento, pedido) são cancelados, nunca apagados.
- Datas trafegam em ISO 8601; valores monetários trafegam como string decimal (`"1234.50"`) e são `Decimal(12,2)` no banco.

---

## 6. IDENTIDADE VISUAL E DESIGN SYSTEM

O visual deve ser moderno, limpo e profissional, inspirado em ERP/POS de comunicação visual. Configure as cores como tokens no Tailwind e nas variáveis CSS do shadcn:

| Token | Uso | Cor |
|---|---|---|
| `petroleo` | Topbar, item ativo, títulos | `#0B4F5C` (escuro `#083B45`) |
| `turquesa` | Botões principais, links, foco | `#14B8A6` (hover `#0D9488`) |
| `fundo` | Fundo da aplicação | `#F1F4F6` |
| `card` | Cards, tabelas, modais | `#FFFFFF` |
| `coral` | Alertas, atrasos, erros | `#EF5A57` |
| `verde` | Status positivos, pago, concluído | `#22C55E` |
| `ambar` | Atenção, pendente, vencendo | `#F59E0B` |
| `texto` | Principal / secundário | `#1F2937` / `#6B7280` |

Diretrizes de layout:

- **Sidebar fixa** com ícones e rótulos, recolhível e com submenus expansíveis. No celular vira drawer.
- **Topbar** azul petróleo com logo, busca global **"Localizar…"** (clientes, orçamentos e pedidos, com atalho `Ctrl+K`), sino de notificações, avatar com nome/papel e botão **Sair**.
- **Cards** com `rounded-2xl`, sombra suave e espaçamento generoso.
- **Tabelas limpas**, com hover, ações por ícone, filtros acima e paginação. No mobile viram cards.
- **StatusBadge** único, lendo cor e rótulo da tabela `status_config`.
- **Botão flutuante "+"** contextual, que abre o novo registro do módulo atual.
- **Kanban** com drag and drop e **dashboards** com gráficos.
- Estados de carregamento (skeleton), vazio e erro em todas as telas.
- Layout responsivo para desktop, tablet e celular.

---

## 7. AUTENTICAÇÃO, PERFIS E PERMISSÕES

**Autenticação**
- `POST /auth/login` retorna o access token (JWT, 15 min) no corpo e grava o refresh token (7 dias) em cookie `httpOnly`, `secure` em produção, `sameSite=strict`.
- `POST /auth/refresh` renova o access token; `POST /auth/logout` invalida o refresh token.
- Refresh tokens ficam na tabela `sessoes` (hash do token, usuário, expiração, IP, user agent), permitindo revogar sessões.
- `GET /auth/me` retorna usuário, papel e lista de permissões.
- Rate limit no login (ex.: 5 tentativas por minuto por IP).
- **Recuperação de senha sem e-mail nesta etapa:** o admin redefine a senha do usuário pela tela de Usuários, e o sistema obriga a troca no próximo login. Cada usuário pode alterar a própria senha no perfil.

**Papéis padrão** (editáveis em Configurações → Permissões):

| Papel | Acesso principal |
|---|---|
| `admin` | Tudo |
| `gerente` | Tudo, exceto usuários e permissões |
| `vendedor` | Clientes, orçamentos, pedidos (próprios ou todos, configurável), produção (leitura) |
| `designer` | Pedidos (leitura), artes, produção (leitura) |
| `producao` | Produção, PCP, estoque (movimentar), pedidos (leitura) |
| `financeiro` | Financeiro, caixa, relatórios financeiros, clientes (leitura) |
| `caixa` | Caixa/PDV, recebimentos, cadastro rápido de cliente |

**Modelo de permissão:** módulo + ação (`visualizar`, `criar`, `editar`, `excluir`, `aprovar`, `exportar`, `ver_todos`).
- Tabelas `papeis`, `permissoes` e `papel_permissoes`; `usuarios.papel_id`.
- Na API: middleware `exigirPermissao(modulo, acao)` com cache em memória das permissões por papel (invalidado quando a matriz muda).
- **Escopo "somente meus":** nos services de orçamentos e pedidos, se o usuário não tem `ver_todos`, a consulta filtra por `vendedor_id = usuario.id`.
- No front: hook `usePermission(modulo, acao)` e componente `<Can modulo acao>`.

---

## 8. MODELO DE DADOS

Convenções: `id uuid default gen_random_uuid()`, `created_at`, `updated_at` (`@updatedAt`), `created_by`, e `ativo boolean` nos cadastros. Valores monetários `Decimal(12,2)`, medidas `Decimal(10,3)`. Enums do Prisma para status fixos; status exibidos ao usuário também têm cor/rótulo em `status_config`.

### 8.1 Núcleo
- `usuarios`: nome, email (único), senha_hash, telefone, avatar, papel_id, comissao_percentual, deve_trocar_senha, ultimo_login, ativo.
- `sessoes`: usuario_id, refresh_token_hash, expira_em, ip, user_agent, revogada.
- `papeis`, `permissoes`, `papel_permissoes`.
- `empresa_config` (linha única): dados cadastrais, logo, validade padrão do orçamento, condições padrão, % de sinal padrão, chave PIX, área mínima por peça (m²).
- `status_config`: entidade (orcamento, pedido, producao, arte, conta), codigo, rotulo, cor, ordem, eh_final.
- `numeracao`: entidade, prefixo, ano, ultimo_numero.
- `auditoria`: tabela, registro_id, acao, antes/depois (jsonb), usuario_id, created_at.
- `arquivos`: entidade, entidade_id, categoria (arte, anexo, comprovante, logo, imagem_produto), nome_original, caminho, mime, tamanho, enviado_por.
- `notificacoes`: usuario_id, titulo, mensagem, link, lida.
- `mensagem_templates`: nome, categoria (orçamento enviado, arte para aprovação, pedido pronto, cobrança, boas-vindas) e conteúdo com variáveis `{{cliente_nome}}`, `{{numero_orcamento}}`, `{{link_aprovacao}}`, `{{valor_total}}`, `{{data_entrega}}`.

### 8.2 Pessoas
- `clientes`: tipo_pessoa (PF/PJ), nome, fantasia, cpf_cnpj (único), ie, email, telefone, whatsapp (único), origem (whatsapp, balcão, indicação, instagram, site…), **situacao** (`pre_cadastro`, `ativo`, `inativo`, `bloqueado`), limite_credito, vendedor_id, observacoes, tags.
- `cliente_enderecos` (tipos: principal, entrega, cobrança) e `cliente_contatos`.
- `fornecedores`: dados de pessoa, categoria de fornecimento, prazo médio, condições de pagamento.

### 8.3 Produtos
- `categorias` (com pai_id para subcategorias) e `unidades_medida`.
- `produtos`: codigo, nome, categoria_id, **tipo** (`produto`, `servico`, `insumo`, `revenda`), **modo_calculo** (`unidade`, `m2`, `metro_linear`, `milheiro`, `hora`), preco_venda, custo, margem, preco_minimo, medidas padrão e máximas, prazo_producao_dias, controla_estoque, estoque_minimo, imagem.
- `produto_insumos` (ficha técnica): insumo_id, quantidade por unidade ou por m², perda_percentual.
- `acabamentos`: nome, **tipo_cobranca** (`fixo`, `por_unidade`, `por_m2`, `por_metro_linear`, `por_perimetro`), valor, custo, prazo_adicional_dias.
- `produto_acabamentos` (obrigatório/padrão).
- `maquinas`: tipo, largura_util, velocidade_m2_hora, custo_hora, status (`ativa`, `manutencao`, `parada`).
- `processos` e `produto_processos` (ordem e máquina).

### 8.4 Comercial
- `solicitacoes_orcamento`: numero, cliente_id, origem, descrição do pedido do cliente, prazo desejado, status (`nova`, `em_atendimento`, `orcada`, `descartada`), responsavel_id, `referencia_externa` (nula; para vincular a uma conversa de WhatsApp no futuro).
- `orcamentos`: numero, cliente_id, vendedor_id, validade, status, subtotal, desconto, acréscimo, frete, total, prazo, condições, observações (externas e internas), **token_publico**, aprovado_em, aprovado_por_nome, aprovado_ip, motivo_recusa, pedido_id.
- `orcamento_itens` (quantidade, largura, altura, area_m2, preços, desconto, ordem) e `orcamento_item_acabamentos`.
- `pedidos`: numero, orcamento_id, cliente_id, vendedor_id, **data_prevista_entrega**, status, status_financeiro (`pendente`, `parcial`, `pago`), tipo_entrega (`retirada`, `entrega`, `instalacao`), endereço, totais, valor_pago, prioridade (`baixa`, `normal`, `alta`, `urgente`), motivo_cancelamento.
- `pedido_itens` e `pedido_item_acabamentos`.
- `artes`: pedido_item_id, versao, arquivo_id, miniatura_id, status (`aguardando_arquivo`, `em_criacao`, `enviada_cliente`, `ajuste_solicitado`, `aprovada`), comentario_cliente, designer_id, token_publico, aprovada_em.
- `entregas`: tipo, data agendada/realizada, responsável, recebido_por, comprovante, status.

### 8.5 Produção
- `ordens_producao`: numero, pedido_id, pedido_item_id, quantidade, medidas, **etapa_atual**, maquina_id, responsavel_id, prioridade, datas previstas e reais, ordem_kanban.
- `op_etapas_historico`: etapa de/para, usuário, tempo na etapa.
- `op_apontamentos`: processo, máquina, operador, início/fim, quantidade produzida e perda.
- Etapas padrão (configuráveis): `fila` → `pre_impressao` → `impressao` → `acabamento` → `conferencia` → `concluido`.

### 8.6 Estoque
- `estoque_locais`.
- `estoque_entradas` (fornecedor, NF, data, total) + itens.
- `estoque_movimentacoes`: tipo (`entrada`, `saida`, `ajuste`, `consumo_producao`, `perda`, `transferencia`, `venda_pdv`), quantidade, custo_unitario, referências (op_id, pedido_id, fornecedor_id).
- `estoque_saldos`: saldo por produto/local e custo médio, atualizado **somente** pelo service de estoque dentro da mesma transação da movimentação.

### 8.7 Financeiro
- `formas_pagamento`: taxa, dias para recebimento, parcelamento.
- `contas_financeiras` (caixa, bancos) e `categorias_financeiras` (receita/despesa, hierárquica).
- `contas_receber` e `contas_pagar`: parcela, valor, vencimento, status (`aberto`, `parcial`, `pago`, `vencido`, `cancelado`), valor_pago, juros/multa/desconto, forma, conta, categoria, anexo.
- `movimentos_financeiros`: extrato realizado, base do fluxo de caixa.
- `comissoes`: vendedor, pedido, base, %, valor, status (`prevista`, `liberada`, `paga`).

### 8.8 Caixa / PDV
- `caixa_sessoes`: abertura, fechamento informado vs calculado, diferença.
- `caixa_movimentos`: venda, recebimento, sangria, suprimento.
- `vendas_pdv` + `vendas_pdv_itens`.

Crie índices em FKs, número, status, vencimento, whatsapp e cpf_cnpj. Use `onDelete: Restrict` em documentos, para que não seja possível apagar um cliente com pedido.

---

## 9. REGRAS DE NEGÓCIO

**Precificação** (`packages/shared/src/pricing.ts`, função pura, com testes):
- `unidade`: quantidade × preço.
- `m2`: largura × altura (em metros), respeitando a área mínima por peça, × quantidade × preço do m².
- `metro_linear`: comprimento × quantidade × preço.
- `milheiro`: arredonda para o lote e cobra por milheiro.
- `hora`: horas × preço.
- Acabamentos somados conforme `tipo_cobranca` (perímetro = 2 × (L + A)).
- Valida medidas máximas do produto.
- Preço abaixo do mínimo exige permissão `aprovar` para ser salvo.
- A margem estimada só é retornada pela API para quem tem permissão.
- **A API recalcula tudo ao salvar**, ignorando totais enviados pelo front.

**Orçamento:**
- Status: `rascunho` → `enviado` → `em_negociacao` → `aprovado` | `recusado` | `expirado`. Após a conversão, passa a `convertido`.
- Recursos: duplicar, gerar PDF com logo e **"Copiar mensagem"** com o template preenchido e o link de aprovação (o vendedor cola no WhatsApp manualmente). Marcar como "enviado" é ação manual.
- **Link público** `/aprovar/:token`, sem login: rotas em `modules/publico` retornam só os dados necessários do orçamento e permitem aprovar (com nome de quem aprova) ou recusar (com motivo). Validar token e validade; registrar IP e data.
- Job diário marca orçamentos vencidos como `expirado`.

**Conversão em pedido** (service transacional `converterOrcamentoEmPedido`):
- Cria o pedido e os itens e calcula a data prevista em dias úteis (maior prazo dos itens + acabamentos).
- Promove o cliente de `pre_cadastro` para `ativo`.
- Gera contas a receber (sinal + parcelas), comissão `prevista` e registros de arte `aguardando_arquivo` por item.

**Arte:**
- Upload versionado (v1, v2…) com miniatura para imagens, link público `/arte/:token` para o cliente aprovar ou pedir ajuste, e histórico de comentários.
- **A OP só vai para impressão com a arte `aprovada`.** Exceção apenas com override de gerente, registrado na auditoria.

**Produção:**
- Mover um card no kanban grava histórico e tempo na etapa, e emite evento Socket.IO para atualizar as outras telas abertas.
- Ao chegar em `concluido`, baixa automática de insumos pela ficha técnica (na mesma transação).
- Quando todas as OPs de um pedido concluem, o pedido passa a `pronto` e é gerada notificação interna com o texto "pedido pronto" pronto para copiar.
- Itens atrasados recebem badge coral.

**Pedido:**
- Status: `aguardando_arte` → `arte_em_aprovacao` → `em_producao` → `pronto` → `em_entrega` → `entregue`.
- `cancelado` exige motivo, cancela os títulos em aberto e estorna o estoque se aplicável.
- Status financeiro é independente do status do pedido.

**Financeiro:**
- Baixa parcial ou total, com juros, multa e desconto.
- Job diário marca títulos vencidos.
- Fluxo de caixa mostra realizado e previsto; calendário financeiro por dia.
- Comissão é liberada quando o pedido fica `pago`.

**Estoque:** saldo muda **somente** via movimentação. Quando saldo ≤ mínimo, gera alerta, badge no menu e notificação.

**Caixa/PDV:** venda exige caixa aberto. Fechamento com conferência por forma de pagamento. Sangria e suprimento exigem motivo.

---

## 10. ARQUIVOS, TEMPO REAL E TAREFAS AGENDADAS

**Arquivos (sem serviço externo)**
- Interface `StorageService` em `core/storage` com os métodos `salvar`, `abrir`, `remover` e `gerarUrlTemporaria`. A implementação atual é `DiscoLocalStorage`, gravando no volume `uploads` com o caminho `{categoria}/{ano}/{mes}/{uuid}-{nome}`. No futuro, basta criar uma implementação S3 sem mudar o resto do sistema.
- Arquivos **nunca** são servidos como pasta pública. O download passa por `GET /api/v1/arquivos/:id`, que verifica permissão, ou por URL temporária assinada (para links públicos de aprovação de arte).
- Validar tipo (PDF, AI, CDR, PSD, EPS, SVG, PNG, JPG, TIFF, ZIP) e tamanho máximo (`UPLOAD_MAX_MB`).
- Miniaturas de imagens geradas com `sharp`.

**Tempo real (Socket.IO)**
- Conexão autenticada com o access token.
- Salas por assunto: `producao`, `pedidos`, `usuario:{id}` (notificações).
- Eventos: `op:atualizada`, `pedido:atualizado`, `notificacao:nova`. O front usa os eventos para invalidar as queries do TanStack Query.

**Tarefas agendadas (`node-cron`, fuso America/Sao_Paulo)**
- 00:05: expirar orçamentos vencidos.
- 00:10: marcar contas vencidas.
- 07:00: gerar notificações de estoque baixo, contas do dia e entregas do dia.

---

## 11. MÓDULOS E TELAS

**Dashboard**
- KPIs: faturamento do mês, orçamentos abertos e taxa de conversão, pedidos em produção e atrasados, a receber hoje e vencidos, a pagar hoje, estoque baixo e solicitações de orçamento novas.
- Gráficos: faturamento mensal, funil de orçamentos, pedidos por status, produção por etapa e top produtos.
- Listas de próximas entregas e atrasos.

**Orçamentos**
- Abas Solicitações | Orçamentos, com filtros.
- Cadastro rápido de solicitação com origem (WhatsApp, balcão, telefone, e-mail, Instagram) e pré-cadastro do cliente na mesma tela.
- Editor em tela cheia: busca de cliente, itens com calculadora de medidas e acabamentos, totais ao vivo, PDF, copiar mensagem com link de aprovação, duplicar e converter.

**Pedidos de Venda**
- Visão em lista e em kanban por status.
- Detalhe com abas Itens | Arte | Produção | Financeiro | Entrega | Histórico | Anexos.

**Produção**
- Kanban por etapa com drag and drop e filtros por máquina, responsável e prioridade.
- Cards com número, cliente, produto, medidas, prazo, miniatura da arte e badge de atraso.
- Visão em lista, detalhe da OP com apontamentos e impressão da ficha de OP.

**PCP / Cockpit:** carga por máquina (fila e horas estimadas), Gantt simples das OPs, gargalos, atrasos, capacidade × demanda da semana e reprogramação de prioridades.

**Clientes**
- Lista com destaque para pré-cadastros.
- Ficha com abas Dados | Endereços | Contatos | Orçamentos | Pedidos | Financeiro | Anexos.
- Endereço preenchido manualmente, com máscara de CEP.

**Fornecedores:** CRUD com histórico de entradas e contas a pagar.

**Produtos**
- Submenus: Categorias | Produtos e Serviços | Acabamentos | Máquinas e Processos.
- Formulário com abas Geral | Preço e cálculo | Acabamentos | Ficha técnica | Processos | Estoque, mais simulador de preço.

**Estoque:** Estoque atual | Entrada de estoque | Movimentações | Alertas de estoque baixo.

**Financeiro:** Contas a receber | Contas a pagar | Fluxo de caixa | Calendário financeiro | Formas de pagamento | Comissões.

**Caixa / PDV:** abrir e fechar caixa, venda balcão com grade de produtos, carrinho, múltiplas formas de pagamento, recebimento de títulos, sangria e suprimento, e histórico de sessões.

**Relatórios**
- Vendas por período, vendedor, produto e cliente.
- Conversão de orçamentos e motivos de recusa.
- Produção: tempo por etapa, produtividade por máquina e perdas.
- Estoque: posição, curva ABC e consumo.
- Financeiro: DRE simplificado, inadimplência e fluxo.
- Comissões.
- Todos com filtros, gráfico, tabela e exportação CSV/PDF. As consultas pesadas são feitas no banco (agregações SQL), não no front.

**WhatsApp:** item no menu com página placeholder `IntegracaoFutura` (texto explicando que a caixa de entrada chega numa próxima etapa e atalho para Templates de mensagens).

**Configurações:** Dados da empresa | Usuários | Permissões (matriz papel × módulo × ação) | Templates de mensagens | Máquinas | Processos | Status do sistema | WhatsApp (placeholder).

**Rotas públicas do front:** `/login`, `/aprovar/:token` e `/arte/:token`.

---

## 12. COMPONENTES REUTILIZÁVEIS OBRIGATÓRIOS (FRONT)

- Layout: `AppLayout`, `Sidebar`, `Topbar`, `GlobalSearch`, `PageHeader`, `FloatingActionButton`.
- Dados: `DataTable` (genérico, com paginação server-side, filtros, ordenação, exportação CSV e modo card no mobile), `StatusBadge`, `KanbanBoard` (genérico), `KpiCard`, `ChartCard`, `Timeline`.
- Formulários e diálogos: `FormDialog`/`FormDrawer`, `ConfirmDialog`, `FileUploader` (arrastar e soltar, progresso, preview), `SearchSelect` (busca assíncrona), `DateRangePicker`.
- Inputs com máscara: `MoneyInput`, `NumberInput`, `CpfCnpjInput`, `PhoneInput`, `CepInput`.
- Outros: `EmptyState`, `Can`, `IntegracaoFutura`.
- Hooks: `useAuth`, `usePermission`, `useSocket`, `useDebounce`, e hooks de query por módulo.

---

## 13. FORA DO ESCOPO NESTA ETAPA (integrações futuras)

Estes itens são requisitos do sistema, mas **não** devem ser implementados agora. Deixe apenas os pontos de extensão indicados:

| Integração futura | Ponto de extensão agora |
|---|---|
| WhatsApp (Cloud API ou Evolution API) | Interface `MessagingProvider` com implementação "copiar mensagem"; coluna `referencia_externa`; páginas placeholder |
| Busca de endereço por CEP | Interface `CepProvider` → `GET /consultas/cep` da API (BrasilAPI/ViaCEP); CNPJ em `GET /consultas/cnpj` (D204) |
| Envio de e-mail (recuperar senha, notificações) | Interface `EmailProvider` com implementação que apenas registra no log |
| Armazenamento em nuvem (S3 etc.) | Interface `StorageService` com implementação em disco |
| Pagamentos online, PIX automático, boletos | Campos de forma de pagamento já existentes |
| Emissão de nota fiscal | Nenhum; apenas registrar em DECISOES.md |

---

## 14. PLANO DE FASES

Cada fase termina com entrega funcional, build limpo e relatório. **Não avance sem meu OK.**

**Fase 0 — Fundação**
- Monorepo, Docker Compose (db, api, web), Dockerfiles, Makefile, `.env.example`, README e docs.
- API Fastify com config validada, Prisma, tratamento de erros padrão, Swagger e rota `/health`.
- Migration inicial com `usuarios`, `sessoes`, `papeis`, `permissoes`, `papel_permissoes`; seed com admin.
- Autenticação completa (login, refresh, logout, me, troca de senha obrigatória).
- Front: design system, tela de login, cliente HTTP com renovação de token, AppLayout com **todos os módulos e submódulos** no menu, topbar com "Localizar…", Sair e FAB, e todas as rotas com placeholder.
- ✅ Critério de aceite: `make up` sobe tudo; login com o admin local funciona; navegação por todo o menu no desktop e no celular; `make reset` recria o banco sem erro.

**Fase 1 — Núcleo, permissões e pessoas**
- Migrations 8.1 e 8.2, middleware de permissão, auditoria, numeração, StorageService e rota de arquivos.
- Configurações: empresa (com logo), usuários (criar, editar, redefinir senha, desativar), permissões, status e templates.
- DataTable, StatusBadge, inputs com máscara e Can.
- Clientes (com pré-cadastro) e Fornecedores.
- ✅ Critério de aceite: um usuário "vendedor" não acessa Configurações nem pelo menu nem chamando a API direto (recebe 403).

**Fase 2 — Produtos e motor de preço**
- Migrations 8.3 e todos os cadastros de produtos.
- `pricing.ts` no pacote compartilhado, com testes.
- ✅ Critério de aceite: o preço de um banner 2×1 m com ilhós e bainha bate com o cálculo manual, no front e na API.

**Fase 3 — Comercial**
- Solicitações, editor de orçamento, PDF, copiar mensagem, link público, job de expiração e conversão em pedido.
- ✅ Critério de aceite: cliente pré-cadastrado → orçamento → aprovação pelo link em janela anônima → pedido criado com contas a receber.

**Fase 4 — Pedidos, arte e produção**
- Pedidos (lista, kanban e detalhe), artes versionadas com link público, entregas.
- Migrations 8.5, Socket.IO, kanban de produção, histórico de etapas e PCP.
- ✅ Critério de aceite: mover uma OP em uma aba atualiza a outra, e o pedido vira "pronto" sozinho.

**Fase 5 — Estoque**
- Migrations 8.6, entradas, movimentações, saldos, alertas e baixa automática por ficha técnica.
- ✅ Critério de aceite: concluir uma OP de banner reduz a lona pela área + perda.

**Fase 6 — Financeiro e Caixa/PDV**
- Migrations 8.7 e 8.8 e todas as telas financeiras e de caixa.
- ✅ Critério de aceite: quitar as parcelas deixa o pedido "pago" e libera a comissão.

**Fase 7 — Dashboard e Relatórios**
- Dashboard com dados reais, relatórios com exportação, busca global e central de notificações.
- ✅ Critério de aceite: os KPIs e relatórios batem com consultas SQL feitas direto no banco.

**Fase 8 — Polimento e preparação para produção**
- Revisão visual, estados de carregamento/vazio/erro, acessibilidade e performance (índices, paginação).
- Testes das regras críticas (precificação, conversão, baixa de estoque, baixa financeira, permissões).
- `docker-compose.prod.yml`, `Caddyfile` e `docs/DEPLOY_VPS.md` com o passo a passo para uma VPS Linux (ex.: Hostinger KVM): instalar Docker, apontar domínio, subir com HTTPS, trocar segredos, firewall liberando só 22/80/443, backup diário agendado (banco + uploads) com cópia para fora do servidor, e como atualizar o sistema.
- ✅ Critério de aceite: fluxo completo de ponta a ponta executado sem erros por cada papel, e o compose de produção sobe localmente.

**Fase 9 — Integrações (somente quando eu pedir)**
- WhatsApp, CEP, e-mail, armazenamento em nuvem, pagamentos, conforme a seção 13.

---

## 15. COMECE AGORA

Execute **somente a Fase 0**. Antes de codar, mostre em poucas linhas o plano da fase e as dependências que vai instalar. Ao final, entregue o relatório conforme a regra 1.
