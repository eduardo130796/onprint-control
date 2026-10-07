# ONPrint Control

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

Use em `EMAIL_REMETENTE` um endereço do mesmo domínio autorizado no provedor (ex.: `ONPrint Control <nao-responda@suaempresa.com.br>`). Sem SPF/DKIM configurados no domínio, os e-mails tendem a cair no spam.

Com o e-mail ativo:
- **Esqueci minha senha** (tela de login): link de uso único que vale 1 hora. A resposta é a mesma exista ou não a conta.
- **Usuário novo**: recebe um convite para criar a própria senha (vale 72 horas); a senha provisória fica opcional.
- **Redefinir senha** (Configurações → Usuários): o admin pode mandar o link por e-mail em vez de inventar uma senha.
- Toda troca de senha pelo link encerra as outras sessões e manda um aviso "sua senha foi alterada".

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
