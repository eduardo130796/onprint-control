# ROADMAP — ONPrint Control

Referência completa: [ARQUITETURA.md](ARQUITETURA.md) (seção 14). Decisões: [DECISOES.md](DECISOES.md).

## Fase 0 — Fundação ✅
- [x] Monorepo npm workspaces (`apps/api`, `apps/web`, `packages/shared`)
- [x] Docker Compose com 3 containers (db, api, web), healthchecks e `depends_on`
- [x] Dockerfiles multi-stage (api, web), `docker-compose.prod.yml` e `Caddyfile` iniciais
- [x] Makefile (+ equivalentes `npm run`), `.env.example`, README, docs
- [x] API Fastify: env validada (zod), Prisma, erros padronizados, Swagger em `/docs`, `/health`
- [x] Migration inicial: `usuarios`, `sessoes`, `papeis`, `permissoes`, `papel_permissoes`; seed com admin
- [x] Auth: login, refresh (cookie httpOnly + rotação), logout, me, troca de senha obrigatória, rate limit
- [x] Front: design system, login, troca de senha, cliente HTTP com renovação de token
- [x] AppLayout com todos os módulos/submódulos, "Localizar…" (Ctrl+K), Sair, FAB; rotas com placeholder
- [x] Aceite validado pelo usuário ("OK, próxima fase")

## Fase 1 — Núcleo, permissões e pessoas ✅
- [x] Migrations 8.1 e 8.2 (`nucleo_e_pessoas`); `exigirPermissao` com cache por papel; auditoria; numeração com FOR UPDATE; StorageService (disco) e rota de arquivos com URL temporária
- [x] Configurações: empresa (com logo), usuários (criar, editar, redefinir senha, desativar), permissões (matriz), status e templates
- [x] DataTable, StatusBadge, inputs com máscara, Can, ConfirmDialog, FormDialog, FileUploader
- [x] Clientes (com pré-cadastro, endereços, contatos e anexos) e Fornecedores (com anexos)
- [x] Aceite verificado pela API (`npm run e2e`, 30 verificações) e pelo navegador (menu e URL direta)
- [x] Aceite validado pelo usuário ("ok, pode seguir")

## Fase 2 — Produtos e motor de preço ✅
- [x] Migration `produtos` (8.3): categorias em árvore, unidades, produtos, ficha técnica, acabamentos, máquinas, processos e roteiro
- [x] CRUD genérico reutilizável (`core/crud.ts` + `core/crud-rotas.ts`) para acabamentos, máquinas e processos
- [x] Telas: Categorias, Produtos e Serviços (Geral | Preço e cálculo | Acabamentos | Ficha técnica | Processos | Estoque + Simulador), Acabamentos, Máquinas e Processos
- [x] `pricing.ts` no pacote compartilhado (decimal.js), 13 testes; `POST /produtos/:id/simular` recalcula na API
- [x] Aceite: banner 2×1 m + ilhós + bainha = R$ 160,00 — verificado no teste unitário, no e2e da API e no navegador (front = API)
- [x] Aceite validado pelo usuário ("ok, proxima fase")

## Fase 3 — Comercial ✅
- [x] Migration `comercial` (8.4 + `contas_receber` e `comissoes` de 8.7): solicitações, orçamentos, pedidos, itens, acabamentos, artes, entregas
- [x] Solicitações com pré-cadastro na mesma tela; abas Solicitações | Orçamentos
- [x] Editor de orçamento em tela cheia: busca de cliente e produto, calculadora ao vivo, totais, validade, prazo e previsão
- [x] API recalcula tudo; preço abaixo do mínimo exige `aprovar`; escopo "só os meus" sem `ver_todos`
- [x] PDF (@react-pdf/renderer, sob demanda), "Copiar mensagem" com template e link, duplicar, status (enviado, negociação, aprovado, recusado, reabrir)
- [x] Link público `/aprovar/:token` (aprovar com nome + aceite, recusar com motivo; IP e data registrados; notifica o vendedor)
- [x] Job diário `node-cron` 00:05 (e na subida) expira orçamentos; o link também expira ao abrir
- [x] Conversão transacional: pedido + itens, previsão em dias úteis, cliente ativado, sinal + parcelas, comissão prevista, artes por item
- [x] Aceite verificado pela API (`npm run e2e -- fase3`, 40 verificações) e pelo navegador (fluxo completo pela interface + janela anônima)
- [x] Aceite validado pelo usuário ("OK, próxima fase")

## Fase 4 — Pedidos, arte e produção ✅
- [x] Migration `producao` (8.5): ordens de produção, histórico de etapas, apontamentos, comentários das artes
- [x] OPs geradas na conversão do orçamento (uma por item, máquina do roteiro, horas estimadas) e botão "Gerar OPs" para itens sem OP
- [x] Pedidos: lista (atraso, progresso de arte/OP, CSV), kanban (só transições manuais: pronto ⇄ em entrega → entregue), detalhe com abas Itens | Arte | Produção | Financeiro | Entrega | Histórico | Anexos, editar e cancelar com motivo
- [x] Artes versionadas (v1, v2…) com miniatura (sharp), envio ao cliente, "Copiar mensagem com link" (template), aprovação interna, comentários e link público `/arte/:token` (aprovar ou pedir ajuste)
- [x] Status do pedido automático (arte enviada, aprovada, OPs em produção, todas concluídas → "pronto" + notificação ao vendedor)
- [x] Entregas: agenda, saída para entrega, confirmação com quem recebeu, comprovante
- [x] Socket.IO autenticado (salas `producao`, `pedidos`, `usuario:{id}`); o front só invalida as queries
- [x] Kanban de produção (@dnd-kit: mouse, toque e teclado) com filtros, miniatura, atraso e prioridade; OP só vai para impressão com arte aprovada (override do gerente com motivo)
- [x] OP: detalhe, histórico de etapas com tempo na etapa, apontamentos, reprogramação e ficha para impressão
- [x] PCP: capacidade × demanda da semana por máquina, gargalos, atrasos e Gantt de 14 dias com reprogramação
- [x] Telas carregadas sob demanda (bundle inicial de 637 KB → 260 KB)
- [x] Aceite verificado pela API (`npm run e2e -- fase4`, 38 verificações) e pelo navegador (duas abas: a OP movida na aba A aparece na aba B; pedido vira "Pronto" sem recarregar)
- [x] Aceite validado pelo usuário ("OK, próxima fase")

## Fase 5 — Estoque ✅
- [x] Migration `estoque` (8.6): locais, entradas + itens, movimentações (com saldo resultante) e saldos por produto/local com custo médio
- [x] Saldo muda **só** pelo service de movimentação (linha do saldo travada na transação); custo médio ponderado nas entradas
- [x] Baixa automática ao concluir a OP, na mesma transação: ficha técnica × área real (sem área mínima) + perda; uma vez por OP
- [x] Estoque atual (saldo, mínimo, custo médio, valor, situação, CSV) com extrato do produto (kardex) e locais
- [x] Entrada de estoque (nota do fornecedor, vários itens), lista e detalhe
- [x] Movimentações: extrato com filtros e CSV; lançamento de saída, perda, ajuste de inventário (saldo contado, só quem aprova) e transferência entre locais
- [x] Alertas de estoque baixo (sugestão de compra), badge no menu e notificação em tempo real ao cruzar o mínimo
- [x] Job 07:00: resumo do estoque baixo e entregas do dia
- [x] Cancelar pedido com opção de devolver ao estoque os insumos já baixados; aba Estoque do produto e "Insumos baixados" na OP
- [x] Aceite verificado pela API (`npm run e2e -- fase5`, 35 verificações: lona 150 → 147,9 m² ao concluir o banner 2 × 1 m) e pelo navegador (entrada pela tela, OP concluída, perda, alerta, estorno)
- [x] Aceite validado pelo usuário ("OK, próxima fase")

## Fase 6 — Financeiro e Caixa/PDV ✅
- [x] Migrations `financeiro_caixa` e `financeiro_taxa_baixa` (8.7 e 8.8): formas de pagamento, contas financeiras, categorias, contas a pagar, movimentos financeiros, sessões e movimentos de caixa, vendas PDV + itens
- [x] Seed financeiro: contas (Caixa da loja, Conta bancária), 6 formas (com taxa de cartão) e categorias de receita/despesa (as usadas pelo sistema têm código)
- [x] Contas a receber e a pagar: lista com filtros e totais, lançamento parcelado, edição, cancelamento com motivo, anexo, **baixa parcial/total com juros, multa e desconto** e **estorno**
- [x] Status financeiro do pedido automático (pendente → parcial → pago) e **comissão liberada** quando o pedido fica pago (notificação ao vendedor); pagamento de comissões
- [x] Taxa de cartão lançada como despesa em cada recebimento; job 00:10 marca títulos vencidos; avisos das 07:00 com as contas do dia
- [x] Fluxo de caixa (realizado + previsto, gráfico diário, por categoria) e calendário financeiro do mês
- [x] Caixa/PDV: abertura com troco, venda balcão (grade, carrinho, várias formas, troco, baixa de estoque), cancelamento de venda, recebimento de títulos, sangria/suprimento com motivo, fechamento com conferência por forma e histórico de sessões
- [x] Aba Financeiro do pedido (receber a parcela ali) e da ficha do cliente
- [x] Aceite verificado pela API (`npm run e2e -- fase6`, 50 verificações) e pelo navegador (baixas pela tela até o pedido ficar pago e a comissão liberada; caixa completo)
- [x] Aceite validado pelo usuário ("OK, próxima fase")

## Fase 7 — Dashboard e Relatórios ✅
- [x] Sem migration: tudo agregado em SQL (`$queryRaw`) sobre as tabelas existentes, datas no fuso America/Sao_Paulo
- [x] Dashboard real: 10 KPIs (faturamento do mês, pedidos em produção e atrasados, orçamentos em aberto, conversão 90 dias, solicitações a orçar, a receber hoje, vencidos, a pagar hoje, estoque baixo), faturamento mensal (12 meses, pedidos × balcão), funil, pedidos por status, produção por etapa, top produtos, próximas entregas e atrasos — cada bloco conforme a permissão e o escopo do vendedor
- [x] Relatórios (vendas, orçamentos, produção, estoque, financeiro, comissões) com 18 visões, período (mês, mês passado, 90 dias, ano, datas livres), resumo, gráfico, tabela e **exportação CSV e PDF**
- [x] Busca global (Ctrl+K): telas + clientes, pedidos e orçamentos (nome, fantasia, documento, telefone, número), respeitando permissões e "só os meus"
- [x] Central de notificações no topo: contador de não lidas, lista, marcar uma/todas como lidas, clique abre o registro; atualiza em tempo real
- [x] Aceite verificado pela API (`npm run e2e -- fase7`, 40 verificações comparando cada KPI e relatório com SQL direto no banco) e pelo navegador (dashboard admin/vendedora, todas as visões, CSV/PDF baixados, busca, notificações, celular)
- [x] Aceite validado pelo usuário ("OK, próxima fase")

## Fase 8 — Polimento e preparação para produção ✅
- [x] `docker-compose.prod.yml` (3 containers, só 80/443 abertos, healthcheck, logs com rotação), `Caddyfile` (HTTPS automático, cabeçalhos de segurança, cache dos assets) e `.env.prod.example`
- [x] Imagem da API roda migrations + seed idempotente ao subir; admin inicial e catálogo de exemplo configuráveis por variável; API recusa segredos fracos em produção
- [x] `docs/DEPLOY_VPS.md`: Docker, domínio, HTTPS, segredos, firewall 22/80/443, SSH por chave, backup diário com cópia externa (rclone), atualização e restauração
- [x] Scripts `scripts/vps/backup.sh`, `restore.sh` e `atualizar.sh` (backup e restauração testados contra o compose de produção)
- [x] Segurança: limite de login por IP + e-mail (a loja inteira atrás do mesmo IP não se bloqueia)
- [x] Acessibilidade (axe-core, WCAG 2 AA) em todas as telas: contraste corrigido (tons escuros de turquesa/coral para texto e botões, cinza secundário, badges de status com texto calculado), kanban sem controle interativo aninhado
- [x] Performance: índices por data de criação em pedidos e orçamentos (migration `indices_relatorios`); gráfico mensal sem estourar a largura no celular
- [x] Ajustes vistos no tour: filtro de máquinas da produção sem exigir o módulo Produtos; papel Caixa sem o módulo Produtos; sem tentativa de renovar sessão (401) antes do primeiro login
- [x] Testes das regras críticas: 99 unitários (preço, parcelas, estoque, baixa financeira, PDV, status do pedido, matriz de permissões de todos os papéis, segredos de produção, limite de login) + e2e das fases 1–8
- [x] Aceite verificado: compose de produção subiu localmente (https://localhost, ~155 MB de RAM); fluxo completo com cada papel fazendo sua parte (`npm run e2e -- fase8`, 31 verificações) contra a produção e o banco descartável; tour no navegador por 156 telas dos 7 papéis sem erros e sem violações sérias de acessibilidade
- [ ] Aceite validado pelo usuário

## Ajustes pós-testes — lote 1 ✅ (aguardando OK)
- [x] Orçamentos: **kanban** (arrastar envia, negocia, aprova, recusa, reabre ou converte, com os mesmos diálogos das ações); **Imprimir** sem baixar o PDF; **linha de assinatura** do cliente no fim do orçamento
- [x] Pedidos: **PDF do pedido** (imprimir ou baixar) com itens, totais, parcelas e assinatura de recebimento; menu Imprimir no pedido (pedido, etiquetas, baixar PDF)
- [x] **Recibo do pedido** (menu Imprimir e aba Financeiro): escolhe os pagamentos recebidos, valor por extenso, duas vias na mesma folha (cliente e empresa)
- [x] Financeiro do pedido: **Receber valor** avulso, abatendo nas parcelas em aberto da mais antiga para a mais nova (prévia da divisão no diálogo)
- [x] Kanban de pedidos: **arrastar livre** entre colunas (exceto sair de Entregue/Cancelado ou cancelar arrastando); atalhos **Editar** e **Imprimir** no cartão
- [x] Produção: **etiquetas de entrega** em folha A4 (4 por folha) com a imagem da arte e os dados do cliente; atalhos **Editar**, **Ficha** e **Etiqueta** no cartão da OP
- [x] **Kanbans estilo Trello**: largura toda da tela, colunas mais largas que preenchem o espaço e vão até o fim da tela (cada coluna rola sozinha); cartões com mais informação (itens principais, andamento de arte/OPs, pagamento, entrega, vendedor; na produção a arte como capa, medidas, horas e tempo na etapa; no orçamento contato, envio e aprovação/recusa)
- [x] **Clique no cartão abre um painel lateral** com os detalhes e todas as ações (pedido: abrir, editar, imprimir, etiquetas, recibo, receber valor, financeiro e OPs de cada item; OP: abrir, pedido, editar, ficha, etiqueta, arte; orçamento: abrir, imprimir, PDF, mensagem, link, converter, pedido)
- [x] **Status gerenciáveis** (Configurações → Status): criar e excluir status próprios em orçamentos, pedidos e produção (cada um "conta como" um status do sistema e vira coluna no kanban); renomear, recolorir, reordenar e **ocultar** os do sistema (não podem ser excluídos); migrations `status_personalizados` e `status_personalizados_gatilhos`
- [x] **Documentos nível premium**: identidade única para orçamento, pedido, recibo, etiquetas, relatórios e ficha da OP (fontes Manrope + Inter empacotadas, faixa de marca, cabeçalho, bloco de informações, tabela com linhas alternadas, total em destaque, rodapé com contato e paginação); etiqueta nova com faixa "Entrega/Retirada", arte grande, destinatário em destaque, "etiqueta N de T", volumes e **QR que abre o pedido**; ficha da OP com QR da OP e etapas para marcar; paleta verde WhatsApp + cinza escuro; etiqueta para o entregador (endereço, agenda, entregador, PAGO/COBRAR, conferência dos volumes, observação e canhoto de recebimento)
- [x] **Nova identidade visual em todo o sistema**: grafite + verde WhatsApp com detalhes em laranja (menu, contadores, logo/favicon, títulos, login, gráficos, status padrão e documentos); contraste verificado com axe; migration `cores_identidade`
- [x] Verificado: testes unitários (shared 82, api 32, web 16), e2e das fases 1–8 (a fase 8 ganhou 28 verificações destes ajustes) e navegador (arrastes, diálogos, PDFs gerados conferidos)
- [ ] Aceite validado pelo usuário

## Ajustes pós-testes — lote 2 ✅
- [x] Pagamento parcial visível fora do pedido: cartão do kanban, lista de pedidos, ficha do cliente, painel lateral, cabeçalho do pedido e parcelas da aba Financeiro mostram **"Falta R$ X de R$ Y"** (`saldoPedido` no shared, com testes; componente `ValorComSaldo`)
- [x] `npm run dados-teste`: clientes, fornecedores, orçamentos, pedidos em cada situação de pagamento e contas a pagar no banco local, pela API

## Assinaturas (venda do sistema como serviço)
Decisões do usuário: todas as empresas no mesmo sistema; bloqueio escalonado (aviso → só leitura → bloqueio total); NFS-e só da mensalidade (Asaas); e-mail por SMTP genérico. Padrões aprovados: teste grátis de 14 dias, só leitura com 5 dias de atraso, bloqueio total com 15.

### Fase 9 — Multiempresa ✅ (aguardando OK)
- [x] Um schema do PostgreSQL por empresa + schema `plataforma` (assinantes e índice de login); `app.prisma` escolhe o schema pela empresa da requisição, então os módulos não mudaram (D149–D150)
- [x] Login pelo e-mail (único na plataforma) encontra a empresa; access token e refresh token levam a empresa; empresa desativada encerra as sessões
- [x] Empresa nova pela linha de comando (`npm run empresa:criar`): schema, migrations, dados padrão, admin e índice de login, desfazendo tudo se falhar
- [x] Banco existente virou a empresa padrão (`/principal`, schema `public`), com os arquivos movidos para a pasta dela
- [x] Separados por empresa: tarefas agendadas, tempo real (salas), uploads (pasta própria; link temporário assinado com a empresa), links públicos de aprovação (`/aprovar/{empresa}/{token}`, `/arte/{empresa}/{token}`) e cache de permissões
- [x] Subida: `migrar` (plataforma + todos os schemas, pulando os que estão em dia) → `seed` (todas as empresas) → API; `make reset` zera todos os schemas
- [x] Verificado: testes unitários (api 40, incluindo requisições simultâneas de empresas diferentes), e2e `fase9` (28 verificações de isolamento: dados, numeração, e-mail único, sessão, links públicos, arquivos, tempo real) e regressão das fases 1–8
- [ ] Aceite validado pelo usuário

### Fase 10 — E-mail e recuperação de senha ✅ (aguardando OK)
- [x] Envio por SMTP genérico (`SMTP_*` no `.env`, `nodemailer`); sem SMTP, só registra no log; `EMAIL_PASTA` grava cópias em JSON (testes)
- [x] Modelos de e-mail com a identidade do sistema (HTML compatível com Gmail/Outlook/celular + texto puro): redefinição, convite e aviso de senha alterada
- [x] "Esqueci minha senha" no login: resposta sempre igual (não revela contas), envio depois da resposta, 3 pedidos a cada 15 min por IP + e-mail
- [x] Link de uso único (1 h; convite 72 h), guardado só como hash na plataforma (`tokens_senha`); link novo invalida os anteriores; trocar a senha encerra as outras sessões e avisa por e-mail
- [x] Usuário novo recebe convite (senha provisória opcional com e-mail ativo, obrigatória sem); admin pode mandar o link de senha em vez de definir uma provisória
- [x] Verificado: testes unitários (api 47: modelos, escape de HTML, hash, provedores) e e2e `fase10` (29 verificações, inclusive empresa B) + fases 1 e 9
- [ ] Aceite validado pelo usuário

### Fase 11 — Planos, módulos e bloqueio ✅ (aguardando OK)
- [x] Planos na plataforma (Essencial, Profissional, Completo criados no seed): módulos, limite de usuários, dias de teste e prazos do bloqueio por plano; uma assinatura por empresa (teste/ativa/cancelada, atraso desde, liberação e bloqueio manuais, módulos extras) com histórico
- [x] Regra única `calcularAcesso` no shared (normal → aviso → só leitura → bloqueado; fim do teste conta como vencimento; liberação manual vence o atraso; bloqueio manual vence tudo), com 17 testes
- [x] API: módulo fora do plano → `MODULO_NAO_CONTRATADO`; só leitura → nada além de GET (`ASSINATURA_SOMENTE_LEITURA`); bloqueado → só `/assinatura`, login e troca de senha (`ASSINATURA_BLOQUEADA`); links públicos param no bloqueio; limite de usuários ao criar e reativar
- [x] `/auth/me` traz as permissões já filtradas pela assinatura (menus e botões somem sozinhos) e o resumo da situação
- [x] Tela: faixa de aviso no topo (teste, atraso, só leitura, liberação), redirecionamento para "Minha assinatura" quando bloqueado, situação atualizada ao voltar à aba, a cada 10 min e quando a API recusa
- [x] "Minha assinatura" (Configurações): situação e o porquê, datas, usuários x limite, o que acontece em cada degrau do atraso, módulos (incluídos e em quais planos estão) e planos
- [x] Comando `assinatura` (listar, ativar, atraso, liberar, bloquear, plano, cancelar, módulos extras) até o painel da Fase 13
- [x] Verificado: testes unitários (shared 106, api 52) e e2e `fase11` (37 verificações) + regressão das fases 1–10
- [ ] Aceite validado pelo usuário

### Fase 12 — Asaas ✅ (aguardando OK)
- [x] Gateway atrás de uma interface (`integrations/pagamentos`): cliente, assinatura mensal (PIX/boleto à escolha na fatura ou cartão automático), troca de valor/forma (cobranças em aberto acompanham), cancelamento, cobranças e notas da assinatura
- [x] Cobranças da mensalidade na plataforma (`cobrancas`) e avisos recebidos (`eventos_gateway`); a assinatura é recalculada a partir das cobranças (atraso, próximo vencimento, teste → ativa no 1º pagamento, cancelamento agendado)
- [x] Webhook `/api/v1/plataforma/webhooks/asaas`: token conferido em tempo constante, aviso guardado antes de aplicar, id do evento impede processar duas vezes, sempre 200 (erro fica registrado); pagamento, atraso, recusa do cartão, estorno, remoção e notas fiscais
- [x] NFS-e automática por assinatura (`invoiceSettings`, emitida na confirmação do pagamento), com número e PDF na lista de mensalidades
- [x] Conferência diária (06:30 e ao subir) e `--conciliar` no comando; modo manual sem chave (`--cobranca-manual`, `--registrar-pagamento`)
- [x] "Minha assinatura": assinar (plano, forma, CNPJ/CPF; no teste a 1ª cobrança vence no fim do teste), pagar agora, recusa do cartão, trocar plano/forma, cancelar (acesso até o fim do período) e assinar de novo, histórico com nota fiscal; só o administrador gerencia
- [x] Verificado: testes unitários (api 60) e e2e `fase12` (42 verificações contra um Asaas falso) + regressão das fases 1–11
- [x] Teste com a conta sandbox real do Asaas: assinatura criada (mensal, 1ª cobrança no fim do teste), pagamento confirmado pela sandbox e trazido pela conferência (teste → ativa), troca de plano (valor no Asaas) e de forma (cartão), cancelamento (recorrência inativa no Asaas). Achado: o fim do período pago usava o vencimento da última cobrança; corrigido para um mês depois dela (`adicionarMeses`)
- [ ] Webhook real do Asaas (precisa de URL pública: túnel ou o servidor de produção) e NFS-e (precisa do código de serviço e da alíquota de ISS)
- [ ] Aceite validado pelo usuário

### Fase 13 — Painel da plataforma ✅ (aguardando OK)
- [x] Login próprio do administrador da plataforma (`admins_plataforma`, token de 8 h na sessão do navegador); token do painel não abre nenhuma empresa e vice-versa; primeiro admin pelo `.env` e comando `admin-plataforma`
- [x] Painel: empresas por situação (em dia, teste, aviso, só leitura, bloqueadas, canceladas; cada número abre a lista filtrada), receita mensal, mensalidades em risco, recebido no mês, cobranças vencidas, novas empresas e conversões; lista de problemas por gravidade (bloqueio, atraso, cartão recusado, nota com erro, aviso do Asaas não aplicado com "Reprocessar", teste acabando, cancelamento agendado); conferência com o Asaas sob demanda
- [x] Empresas: lista com filtros; ficha com assinatura, administradores, mensalidades e histórico; ações do suporte (um só serviço `executarAcao`, também usado pelo comando `assinatura`; troca de plano e cancelamento valem no Asaas); nova empresa pelo painel com convite por e-mail
- [x] Planos: criar e editar preço, módulos, limite de usuários, dias de teste e prazos do bloqueio
- [x] Avisos do Asaas: lista, erros e reprocessar
- [x] Página pública "Criar conta" (teste grátis sem cartão, entra na hora, e-mail de boas-vindas; armadilha para robôs e limite por IP; `CADASTRO_PUBLICO`)
- [x] Verificado: testes unitários (shared 110, api 60, web 16) e e2e `fase13` (38 verificações) + regressão das fases 1–12
- [ ] Aceite validado pelo usuário
