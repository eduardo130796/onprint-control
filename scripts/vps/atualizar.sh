#!/usr/bin/env bash
# Atualiza o sistema na VPS: backup → código novo → rebuild → sobe (migrations e seed rodam sozinhos).
# Uso: scripts/vps/atualizar.sh
# Com git, baixa a versão nova sozinho; sem git, copie os arquivos novos antes (ver docs/DEPLOY_VPS.md).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

scripts/vps/backup.sh
if [ -d .git ]; then git pull --ff-only; fi
# Uma imagem por vez usa menos memória na VPS
$COMPOSE build api
$COMPOSE build web
$COMPOSE up -d
docker image prune -f
$COMPOSE ps
