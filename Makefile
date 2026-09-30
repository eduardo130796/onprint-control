# Comandos do ambiente local. No Windows sem `make`, use os equivalentes `npm run <alvo>` (ver README).
COMPOSE = docker compose
API = $(COMPOSE) exec api

.PHONY: up down logs migrate reset seed test e2e backup restore

up:
	$(COMPOSE) up -d --build

down:
	$(COMPOSE) down

logs:
	$(COMPOSE) logs -f --tail=100

# Cria e aplica uma migration a partir do schema.prisma. Uso: make migrate NOME=clientes
migrate:
	$(API) npm run prisma:migrate -w @onprint/api -- --name $(or $(NOME),alteracao)

# Recria o banco do zero: migrations + seed
reset:
	$(API) npm run prisma:reset -w @onprint/api

seed:
	$(API) npm run prisma:seed -w @onprint/api

test:
	$(API) npm test

# pg_dump compactado + cópia dos uploads para backups/ com data no nome
backup:
	node scripts/backup.mjs

# Uso: make restore ARQ=backups/onprint_2026-09-29_10-00-00.dump
restore:
	node scripts/restore.mjs $(ARQ)

# Teste ponta a ponta num banco descartável (onprint_e2e). Uso: make e2e
e2e:
	node scripts/e2e.mjs
