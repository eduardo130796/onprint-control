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

## Fase 8 — Polimento e preparação para produção ✅ (aguardando OK)
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

## Fase 9 — Integrações (somente sob pedido)
- [ ] WhatsApp, CEP, e-mail, armazenamento em nuvem, pagamentos
