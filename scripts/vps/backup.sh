#!/usr/bin/env bash
# Backup da produção: banco (pg_dump compactado) + uploads, com rotação e cópia opcional para fora da VPS.
# Uso: scripts/vps/backup.sh            (agendado pelo cron — ver docs/DEPLOY_VPS.md)
# Variáveis opcionais: DIAS_RETENCAO (padrão 14), RCLONE_DESTINO (ex.: "gdrive:onprint-backups")
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
DESTINO="$RAIZ/backups"
CARIMBO="$(date +%Y-%m-%d_%H-%M-%S)"
DIAS_RETENCAO="${DIAS_RETENCAO:-14}"
mkdir -p "$DESTINO"

echo "[$(date '+%F %T')] backup iniciado"
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6' > "$DESTINO/onprint_$CARIMBO.dump"
$COMPOSE exec -T api tar czf - -C /app uploads > "$DESTINO/uploads_$CARIMBO.tar.gz"

# Um dump vazio indica falha silenciosa: não apaga os antigos nesse caso
if [ ! -s "$DESTINO/onprint_$CARIMBO.dump" ]; then
  echo "ERRO: dump vazio" >&2
  exit 1
fi

find "$DESTINO" -maxdepth 1 -type f \( -name 'onprint_*.dump' -o -name 'uploads_*.tar.gz' \) -mtime +"$DIAS_RETENCAO" -delete

if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$DESTINO" "$RCLONE_DESTINO" --include "*_$CARIMBO.*"
  echo "cópia externa enviada para $RCLONE_DESTINO"
fi
echo "[$(date '+%F %T')] backup concluído: onprint_$CARIMBO.dump, uploads_$CARIMBO.tar.gz"
