# syntax=docker/dockerfile:1
# Contexto de build: raiz do monorepo (docker build -f apps/api/Dockerfile .)

FROM node:22-alpine AS base
# Prisma precisa do OpenSSL no Alpine
RUN apk add --no-cache openssl
WORKDIR /app

# ── Desenvolvimento: o código entra por volume (ver docker-compose.yml) ──
FROM base AS dev
ENV NODE_ENV=development
EXPOSE 3333

# ── Build de produção ──
FROM base AS build
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund -w @onprint/api --include-workspace-root
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run prisma:generate -w @onprint/api && npm run build -w @onprint/api

# ── Imagem final de produção ──
FROM base AS prod
# Offline: sem checagem de versão/telemetria do Prisma
ENV NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1 CHECKPOINT_DISABLE=1
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/shared/src packages/shared/src
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --omit=dev --no-audit --no-fund -w @onprint/api && npm cache clean --force
COPY apps/api/prisma apps/api/prisma
RUN npm run prisma:generate -w @onprint/api
COPY --from=build /app/apps/api/dist apps/api/dist
WORKDIR /app/apps/api
EXPOSE 3333
# Migrations (plataforma + schema de cada empresa) → seed idempotente de cada empresa → API
CMD ["sh", "-c", "node dist/migrar.js && node dist/seed.js && exec node dist/server.js"]
