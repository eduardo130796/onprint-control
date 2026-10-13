#!/usr/bin/env bash
# Atualiza o sistema na VPS: backup → código novo → confere o .env.prod → rebuild → sobe (migrations e seed rodam sozinhos).
# Uso: scripts/vps/atualizar.sh
# Com git, baixa a versão nova sozinho; sem git, copie os arquivos novos antes (ver docs/DEPLOY_VPS.md).
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

scripts/vps/backup.sh
if [ -d .git ]; then git pull --ff-only; fi

# Versão nova pode pedir variáveis novas no .env.prod (ex.: EVOLUTION_API_KEY). Confere antes de reconstruir:
# se faltar algo, para aqui com o sistema antigo ainda no ar.
if ! erro="$($COMPOSE config -q 2>&1)"; then
  echo
  echo "✋ A atualização parou antes de mexer nos containers: o .env.prod precisa de ajuste."
  echo "$erro"
  faltando="$(comm -23 \
    <(grep -oE '^[A-Z_][A-Z0-9_]*=' .env.prod.example | tr -d '=' | sort -u) \
    <(grep -oE '^[A-Z_][A-Z0-9_]*=' .env.prod | tr -d '=' | sort -u))"
  if [ -n "$faltando" ]; then
    echo
    echo "Variáveis do .env.prod.example que ainda não estão no .env.prod:"
    echo "$faltando" | sed 's/^/  - /'
  fi
  echo
  echo "Abra o .env.prod (nano .env.prod), acrescente o que falta (veja .env.prod.example e docs/DEPLOY_VPS.md, passo 10)"
  echo "e rode scripts/vps/atualizar.sh de novo. Para gerar uma chave: openssl rand -hex 32"
  exit 1
fi

# Uma imagem por vez usa menos memória na VPS
$COMPOSE build api
$COMPOSE build web
$COMPOSE up -d
docker image prune -f
$COMPOSE ps
