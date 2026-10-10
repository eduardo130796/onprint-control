# syntax=docker/dockerfile:1
# Contexto de build: raiz do monorepo (docker build -f apps/web/Dockerfile .)

FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci --no-audit --no-fund -w @onprint/web --include-workspace-root
COPY packages/shared packages/shared
COPY apps/web apps/web
# Domínio das vitrines online (docs/VITRINE.md); vazio = localhost
ARG VITE_DOMINIO_VITRINE=""
ENV VITE_DOMINIO_VITRINE=$VITE_DOMINIO_VITRINE
RUN npm run build -w @onprint/web

# Produção: Caddy serve os estáticos e faz proxy de /api e /socket.io para a API (HTTPS automático)
FROM caddy:2-alpine AS prod
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/apps/web/dist /srv
