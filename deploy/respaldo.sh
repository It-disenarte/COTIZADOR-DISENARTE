#!/usr/bin/env bash
# Respaldo diario de Postgres del cotizador en el VPS (Easypanel). Conserva 14 días.
# Úsalo solo si no configuras los respaldos desde Easypanel.
#
# Cron (en el VPS, como root):
#   15 3 * * * /root/respaldo-cotizador.sh >> /var/log/cotizador-respaldo.log 2>&1
set -euo pipefail

# Nombre del contenedor en Easypanel: <proyecto>_<servicio>
SERVICIO="${SERVICIO:-hub_disenarte_cotizador-db}"
DB_USUARIO="${DB_USUARIO:-cotizador}"
DB_NOMBRE="${DB_NOMBRE:-cotizador}"
DIR_RESPALDOS="${DIR_RESPALDOS:-/root/respaldos/cotizador}"

CONTENEDOR="$(docker ps -q -f "name=${SERVICIO}" | head -n1)"
if [ -z "$CONTENEDOR" ]; then
  echo "[$(date -Is)] no se encontró un contenedor con nombre ${SERVICIO}" >&2
  exit 1
fi

mkdir -p "$DIR_RESPALDOS"
ARCHIVO="$DIR_RESPALDOS/cotizador-$(date +%Y%m%d-%H%M%S).sql.gz"
docker exec "$CONTENEDOR" pg_dump -U "$DB_USUARIO" -d "$DB_NOMBRE" --no-owner --clean --if-exists | gzip > "$ARCHIVO"
echo "[$(date -Is)] respaldo creado: $ARCHIVO ($(du -h "$ARCHIVO" | cut -f1))"

find "$DIR_RESPALDOS" -name 'cotizador-*.sql.gz' -mtime +14 -delete

# Copia fuera del VPS (pendiente de definir destino, p. ej. Google Drive con rclone):
# rclone copy "$ARCHIVO" gdrive:respaldos-cotizador/
