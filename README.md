# GrafyGo

> Gestão inteligente para quem transforma ideias.

ERP web para comunicação visual, gráfica e personalizados: orçamentos, pedidos, arte, produção, estoque, financeiro e caixa.

**Stack:** PostgreSQL 16 · API Node 22 + Fastify + Prisma · React 18 + Vite + Tailwind/shadcn · monorepo npm workspaces · Docker (3 containers).

Documentação: [docs/ARQUITETURA.md](docs/ARQUITETURA.md) · [docs/ROADMAP.md](docs/ROADMAP.md) · [docs/DECISOES.md](docs/DECISOES.md) · [docs/DEPLOY_VPS.md](docs/DEPLOY_VPS.md)

**Guia rápido (configurar, usar e testar):** [docs/GUIA_RAPIDO.md](docs/GUIA_RAPIDO.md) · [versão web para compartilhar](https://claude.ai/artifact/U8xpJr5E8wRfVGwTKNimRe)

## Pré-requisitos

- **Docker Desktop** (em execução)
- **Node.js 22 LTS**: só é preciso para rodar lint/build/testes fora do Docker e para o editor reconhecer os tipos
- Opcional: `make` (Linux/macOS/WSL). No Windows use os comandos `npm run …` equivalentes

## Primeiro uso

```bash
# 1. Criar o .env (troque os segredos JWT por valores aleatórios)
cp .env.example .env

# 2. Subir tudo (db, api, web)
make up            # ou: npm run up
```

Na primeira vez o container da API instala as dependências. Isso leva alguns minutos, e o `web` só sobe depois que a API fica saudável. Para acompanhar: `make logs`.

Depois, abra **http://localhost:5173**.

> Para o editor reconhecer os tipos, rode também `npm install` na raiz (instala as dependências no Windows, fora do Docker).

## Usuário inicial (somente ambiente local)

| E-mail | Senha | Papel |
|---|---|---|
| `admin@onprint.local` | `admin123` | admin |

No primeiro login o sistema **obriga a troca de senha**. Para voltar ao estado inicial, use `make reset`.

## Comandos

| make | npm (Windows) | O que faz |
|---|---|---|
| `make up` | `npm run up` | Sobe db, api e web |
| `make down` | `npm run down` | Para os containers (os dados ficam nos volumes) |
| `make logs` | `npm run logs` | Logs de todos os serviços |
| `make migrate NOME=x` | `npm run migrate -- --name x` | Cria e aplica uma migration a partir do `schema.prisma` (no schema `public`; as outras empresas recebem na próxima subida da API) |
| `make reset` | `npm run reset` | Recria o banco do zero: apaga a plataforma e todas as empresas, aplica migrations e seed |
| | `docker compose exec api npm run empresa:criar -w @onprint/api -- --nome "Gráfica X" --email dono@x.com --senha Inicial123` | Cria uma empresa assinante (schema próprio, dados padrão e admin, com troca de senha no 1º login). `--exemplos` traz o catálogo de exemplo. Funciona sem Node no Windows (roda dentro do container) |
| `make seed` | `npm run seed` | Roda o seed (idempotente) |
| `make test` | `npm test` | Testes unitários (shared, api e web) |
| `make e2e` | `npm run e2e` | Testes ponta a ponta de todas as fases num banco descartável (`onprint_e2e`), sem tocar nos seus dados (`npm run e2e -- fase2` roda só uma) |
| `make dados-teste EMAIL=… SENHA=…` | `npm run dados-teste -- <e-mail> <senha>` | Preenche o banco **local** com clientes, fornecedores, orçamentos, pedidos em cada situação de pagamento (nada pago, parcial, pago, atrasado, cancelado) e contas a pagar. Roda uma vez só (não duplica) |
| `make backup` | `npm run backup` | Dump compactado do banco + uploads em `backups/` |
| `make restore ARQ=…` | `npm run restore -- backups/…dump` | Restaura um dump do banco |

Fora do Docker: `npm run build`, `npm run lint`, `npm test` e `npm run typecheck` (raiz, todos os pacotes).

## E-mail (convites e "esqueci a senha")

Sem configuração, o sistema funciona, mas os e-mails só vão para o log da API. Para achar um link de senha no ambiente local:

```bash
docker compose logs api | grep redefinir-senha        # Windows (PowerShell): ... | Select-String redefinir-senha
```

Para enviar de verdade, preencha no `.env` os dados SMTP do seu provedor e recrie a API (`docker compose up -d --force-recreate api`):

| Provedor | `SMTP_HOST` | `SMTP_PORTA` / `SMTP_SEGURO` | Usuário e senha |
|---|---|---|---|
| Gmail / Google Workspace | `smtp.gmail.com` | `587` / `false` | o e-mail + **senha de app** (exige verificação em duas etapas) |
| Hostinger | `smtp.hostinger.com` | `465` / `true` | o e-mail e a senha da caixa |
| Zoho | `smtp.zoho.com` | `465` / `true` | o e-mail e a senha (ou senha de app) |
| Brevo | `smtp-relay.brevo.com` | `587` / `false` | o login SMTP e a chave SMTP do painel |

Use em `EMAIL_REMETENTE` um endereço do mesmo domínio autorizado no provedor (ex.: `GrafyGo <nao-responda@suaempresa.com.br>`). Sem SPF/DKIM configurados no domínio, os e-mails tendem a cair no spam.

Com o e-mail ativo:
- **Esqueci minha senha** (tela de login): link de uso único que vale 1 hora. A resposta é a mesma exista ou não a conta.
- **Usuário novo**: recebe um convite para criar a própria senha (vale 72 horas); a senha provisória fica opcional.
- **Redefinir senha** (Configurações → Usuários): o admin pode mandar o link por e-mail em vez de inventar uma senha.
- Toda troca de senha pelo link encerra as outras sessões e manda um aviso "sua senha foi alterada".

## Painel da plataforma (dono do sistema)

Em **http://localhost:5173/plataforma** (login próprio, separado das gráficas). No ambiente local: `plataforma@onprint.local` / `plataforma123`. Em produção, o primeiro acesso vem de `PLATAFORMA_ADMIN_EMAIL` / `PLATAFORMA_ADMIN_SENHA`. Para criar outro administrador ou trocar a senha:

```bash
docker compose exec api npm run admin-plataforma -w @onprint/api -- --email voce@empresa.com.br --senha "SenhaForte123" --nome "Seu nome"
```

- **Painel:** quantas empresas estão em dia, em teste, com atraso, só leitura, bloqueadas e canceladas (cada número abre a lista filtrada), receita mensal, mensalidades em risco, recebido no mês, cobranças vencidas, novas empresas e conversões de teste. Embaixo, **o que precisa de atenção**, por gravidade: bloqueadas, só leitura, atrasos, cartão recusado, nota fiscal com erro, aviso do Asaas não aplicado (com "Reprocessar"), teste acabando sem assinatura e cancelamentos agendados.
- **Empresas:** busca e filtros; ficha com assinatura, administradores, mensalidades, histórico e as ações do suporte (trocar plano, liberar até, estender teste, marcar como ativa, lançar cobrança e registrar pagamento no modo manual, módulos extras, bloquear, cancelar, reativar). Toda ação fica no histórico com o e-mail de quem fez. **Nova empresa** cria tudo e manda o convite ao dono.
- **Planos:** preço, módulos, limite de usuários, dias de teste e prazos do bloqueio. Preço novo vale para quem assinar ou trocar de plano; quem já paga mantém o valor.
- **Avisos do Asaas:** tudo que chegou pelo webhook, com os erros e o botão "Reprocessar".

**Criar conta:** a página pública **/criar-conta** (link no login) deixa uma gráfica se cadastrar sozinha em teste grátis, sem cartão, e entrar na hora (com e-mail de boas-vindas). Para fechar o cadastro: `CADASTRO_PUBLICO=false`.

## Assinaturas (planos e bloqueio)

Cada empresa tem uma assinatura com plano (módulos liberados e limite de usuários), situação (teste grátis, ativa, cancelada) e nível de acesso calculado todo dia:

| Atraso da mensalidade (padrão) | O que acontece |
|---|---|
| Até 4 dias | Tudo funciona, com aviso no topo |
| 5 a 14 dias | **Só leitura**: consulta e exportação; nada é gravado (os botões de criar/editar somem) |
| 15 dias ou mais | **Bloqueado**: só a tela "Minha assinatura"; links públicos de aprovação param |

Os prazos são de cada plano. O fim do teste grátis conta como vencimento. Módulos fora do plano somem do menu e a API recusa.

Até o painel da plataforma (Fase 13), as assinaturas são operadas pela linha de comando:

```bash
docker compose exec api npm run assinatura -w @onprint/api -- --listar
docker compose exec api npm run assinatura -w @onprint/api -- --empresa grafica-x --ativar --proximo-vencimento 2026-11-10
docker compose exec api npm run assinatura -w @onprint/api -- --empresa grafica-x --atraso-desde 2026-10-01
docker compose exec api npm run assinatura -w @onprint/api -- --empresa grafica-x --liberar-ate 2026-10-25
docker compose exec api npm run assinatura -w @onprint/api -- --empresa grafica-x --plano completo
```

Outras opções: `--teste-ate`, `--bloquear "motivo"` / `--desbloquear`, `--cancelar` / `--reativar`, `--modulos-extras estoque,relatorios`. Toda alteração fica no histórico (`plataforma.eventos_assinatura`). A empresa nova nasce em teste grátis no plano `PLANO_PADRAO` (ou `--plano` no `empresa:criar`).

## Pagamento online (Asaas)

Formas de pagamento oferecidas: **PIX Automático** (a pessoa autoriza uma vez no app do banco e as mensalidades são debitadas sozinhas), **cartão de crédito** (cobrança automática) e **PIX ou boleto a cada mês**. O PIX Automático precisa ser **liberado pelo Asaas na sua conta** (sem isso a API do Asaas responde "Você não possui permissão para utilizar este recurso"); depois de liberado, ligue com `ASAAS_PIX_AUTOMATICO=true` e inclua no webhook os eventos de **PIX Automático** (`PIX_AUTOMATIC_RECURRING_*`).

Sem `ASAAS_API_KEY`, o sistema fica no **modo manual**: as cobranças são lançadas e baixadas pelo suporte (`--cobranca-manual AAAA-MM-DD` e `--registrar-pagamento` no comando `assinatura`). Com a chave, o administrador de cada empresa assina, paga, troca de plano/forma e cancela em **Configurações → Minha assinatura**.

**Ligar o sandbox (testes, sem dinheiro de verdade):**

1. Crie a conta em <https://sandbox.asaas.com> e gere a chave em **Integrações → Chaves de API**.
2. No `.env`: `ASAAS_API_KEY=<chave>`, `ASAAS_AMBIENTE=sandbox` e `ASAAS_WEBHOOK_TOKEN=<openssl rand -hex 32>`. Recrie a API (`docker compose up -d --force-recreate api`).
3. No Asaas, em **Integrações → Webhooks**, crie um webhook:
   - URL: `https://SEU_DOMINIO/api/v1/plataforma/webhooks/asaas`
   - Token de autenticação: o mesmo `ASAAS_WEBHOOK_TOKEN`
   - Versão da API: v3; tipo de envio: sequencial
   - Eventos: **todos de Cobranças** (`PAYMENT_*`) e **todos de Notas fiscais** (`INVOICE_*`)
4. No computador local o Asaas não alcança `localhost`. Use um túnel (ex.: `cloudflared tunnel --url http://localhost:5173`) e cadastre a URL dele, ou rode a conferência na mão depois de pagar: `docker compose exec api npm run assinatura -w @onprint/api -- --conciliar`.
5. No sandbox, pague a fatura pelo link "Pagar agora" (o Asaas tem dados de cartão e PIX de teste) ou confirme o recebimento no painel.

**Nota fiscal (NFS-e) da mensalidade:** configure os dados fiscais da sua empresa no Asaas (**Notas fiscais → Configurações**), depois `ASAAS_NF_ATIVA=true`, o serviço (`ASAAS_NF_SERVICO_ID` ou `ASAAS_NF_SERVICO_CODIGO`) e as alíquotas (`ASAAS_NF_ISS`…). Cada assinatura nova passa a emitir a nota sozinha quando o pagamento é confirmado. A nota aparece na lista de mensalidades.

**O que o sistema faz sozinho:**
- Cada aviso do Asaas é guardado e aplicado uma única vez. Avisos repetidos são ignorados.
- Pagamento confirmado: a assinatura sai do teste (ou do atraso) e o acesso volta ao normal em segundos.
- Atraso e cartão recusado aparecem na tela, com o link para pagar.
- Às 06:30 (e a cada subida da API), uma **conferência** busca no Asaas as cobranças e notas de todas as assinaturas e corrige o que algum aviso perdido deixou para trás.

## Portas

| Serviço | URL |
|---|---|
| Front-end (Vite) | http://localhost:5173 |
| API | http://localhost:3333 (o front usa `/api` via proxy) |
| Swagger (documentação da API) | http://localhost:3333/docs |
| PostgreSQL | `localhost:5432` |

As portas ficam acessíveis só a partir desta máquina (`127.0.0.1`).

## Acessar o banco (DBeaver / pgAdmin / psql)

| Campo | Valor |
|---|---|
| Host | `localhost` |
| Porta | `5432` |
| Banco | `onprint` |
| Usuário | `onprint` |
| Senha | `onprint` |

```bash
docker compose exec db psql -U onprint -d onprint
```

## Perfis de acesso

Os 7 papéis (admin, gerente, vendedor, designer, produção, financeiro, caixa) vêm com permissões padrão, que podem ser ajustadas em **Configurações → Permissões**. O menu mostra só o que o papel pode ver, e a API devolve **403** para qualquer ação sem permissão.

O admin cria novos usuários em **Configurações → Usuários**, com uma senha provisória. No primeiro login a pessoa cria a própria senha. Se alguém esquecer a senha, o admin usa **Redefinir senha**.

## Produção (VPS)

O passo a passo completo está em [docs/DEPLOY_VPS.md](docs/DEPLOY_VPS.md): domínio, HTTPS automático (Caddy), segredos, firewall, backup diário com cópia externa e atualização.

- `docker-compose.prod.yml`: os mesmos 3 containers, com a API compilada e o Caddy servindo o front. Só as portas 80 e 443 ficam abertas.
- `.env.prod.example`: modelo dos segredos. A API não sobe em produção com segredos fracos.
- `scripts/vps/backup.sh`, `restore.sh` e `atualizar.sh`: backup (banco + uploads, rotação, `rclone`), restauração e atualização na VPS.

## Regras do banco

- Toda alteração de estrutura passa pelo `apps/api/prisma/schema.prisma` + `make migrate` (nunca direto no banco).
- `make reset` precisa recriar tudo sem erro a qualquer momento.
- Tabelas e colunas em português, snake_case (`@@map`/`@map` no Prisma).

## Estrutura

```
apps/api/        API Fastify (prisma/, src/config, plugins, core, modules, integrations; tests/)
apps/web/        Front React (src/app, api, components, features, hooks, lib)
packages/shared/ schemas Zod, enums, formatadores e motor de preço (usado por api e web)
docs/            arquitetura, roadmap e decisões
backups/         saída do make backup (ignorado no git)
```
