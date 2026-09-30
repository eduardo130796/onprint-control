#!/usr/bin/env bash
# Restaura um backup da produção. APAGA os dados atuais do banco (e dos uploads, se informado).
# Uso: scripts/vps/restore.sh backups/onprint_AAAA-MM-DD_HH-MM-SS.dump [backups/uploads_....tar.gz]
set -euo pipefail

DUMP="${1:?Informe o arquivo .dump}"
UPLOADS="${2:-}"
RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"

read -r -p "Isto substitui o banco atual pelo backup $DUMP. Digite RESTAURAR para continuar: " OK
[ "$OK" = "RESTAURAR" ] || { echo "Cancelado."; exit 1; }

$COMPOSE stop api
$COMPOSE exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner' < "$DUMP"
if [ -n "$UPLOADS" ]; then
  $COMPOSE run --rm --no-deps -T --entrypoint sh api -c 'rm -rf /app/uploads/* && tar xzf - -C /app' < "$UPLOADS"
fi
$COMPOSE start api
echo "Restauração concluída."
