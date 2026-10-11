#!/usr/bin/env bash
# Backup da produção: banco (pg_dump compactado, todo dia) + arquivos (artes, fotos, PDFs), com rotação e cópia para
# fora da VPS. Uso: scripts/vps/backup.sh  (agendado pelo cron — ver docs/DEPLOY_VPS.md)
#
# Os arquivos crescem muito mais que o banco, então NÃO são copiados inteiros todo dia:
# - na VPS fica só o pacote mais recente (para restaurar rápido);
# - fora da VPS (rclone), a pasta é espelhada de forma incremental: só vai o que mudou, e o que foi apagado ou
#   substituído vai para "uploads-alterados/DATA" (dá para recuperar).
#
# Variáveis opcionais:
#   RCLONE_DESTINO        destino remoto (ex.: "gdrive:grafygo-backups"); sem ele, fica tudo só na VPS
#   DIAS_RETENCAO         dias de dumps do banco guardados na VPS (padrão 14)
#   DIAS_RETENCAO_REMOTO  dias de dumps e de "uploads-alterados" guardados no destino remoto (padrão 30)
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$RAIZ"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.prod"
DESTINO="$RAIZ/backups"
CARIMBO="$(date +%Y-%m-%d_%H-%M-%S)"
DIAS_RETENCAO="${DIAS_RETENCAO:-14}"
DIAS_RETENCAO_REMOTO="${DIAS_RETENCAO_REMOTO:-30}"
# Volume dos arquivos (nome do projeto do docker-compose.prod.yml + "_uploads")
VOLUME_UPLOADS="${VOLUME_UPLOADS:-onprint-control-prod_uploads}"
mkdir -p "$DESTINO"

echo "[$(date '+%F %T')] backup iniciado"

# 1. Banco: um dump por dia
$COMPOSE exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -Z 6' > "$DESTINO/onprint_$CARIMBO.dump"
# Um dump vazio indica falha silenciosa: não apaga os antigos nesse caso
if [ ! -s "$DESTINO/onprint_$CARIMBO.dump" ]; then
  echo "ERRO: dump vazio" >&2
  exit 1
fi
find "$DESTINO" -maxdepth 1 -type f -name 'onprint_*.dump' -mtime +"$DIAS_RETENCAO" -delete

# 2. Arquivos: só o pacote mais recente na VPS (o anterior é apagado depois que o novo fica pronto)
$COMPOSE exec -T api tar czf - -C /app uploads > "$DESTINO/uploads_$CARIMBO.tar.gz.parcial"
mv "$DESTINO/uploads_$CARIMBO.tar.gz.parcial" "$DESTINO/uploads_$CARIMBO.tar.gz"
find "$DESTINO" -maxdepth 1 -type f -name 'uploads_*.tar.gz' ! -name "uploads_$CARIMBO.tar.gz" -delete

# 3. Fora da VPS
if [ -n "${RCLONE_DESTINO:-}" ]; then
  rclone copy "$DESTINO/onprint_$CARIMBO.dump" "$RCLONE_DESTINO/banco/"
  rclone delete "$RCLONE_DESTINO/banco/" --min-age "${DIAS_RETENCAO_REMOTO}d" --include 'onprint_*.dump'
  # Espelho incremental dos arquivos, lendo direto do volume do Docker (a imagem oficial do rclone usa a sua
  # configuração em ~/.config/rclone)
  docker run --rm \
    -v "$VOLUME_UPLOADS":/uploads:ro \
    -v "$HOME/.config/rclone":/config/rclone \
    rclone/rclone:1.68 sync /uploads "$RCLONE_DESTINO/uploads" \
    --backup-dir "$RCLONE_DESTINO/uploads-alterados/$CARIMBO" --fast-list
  rclone delete "$RCLONE_DESTINO/uploads-alterados/" --min-age "${DIAS_RETENCAO_REMOTO}d"
  rclone rmdirs "$RCLONE_DESTINO/uploads-alterados/" --leave-root 2>/dev/null || true
  echo "cópia externa atualizada em $RCLONE_DESTINO (banco/ e uploads/)"
fi

echo "[$(date '+%F %T')] backup concluído: onprint_$CARIMBO.dump, uploads_$CARIMBO.tar.gz"
du -sh "$DESTINO" | sed 's/^/espaço usado pelos backups na VPS: /'
