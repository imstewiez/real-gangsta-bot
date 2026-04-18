#!/usr/bin/env bash
# Backup manual da DB via pg_dump.
#
# Uso:
#   DATABASE_URL="postgresql://..." ./scripts/manual/backupDb.sh
#   DATABASE_URL="..." BACKUP_DIR=/tmp/bot-backups ./scripts/manual/backupDb.sh
#
# Output: $BACKUP_DIR/bot-di-zona-YYYY-MM-DD-HHMM.dump (custom pg_dump format)
#
# Para restaurar:
#   pg_restore --clean --if-exists --no-owner --no-privileges \
#     -d "$TARGET_DATABASE_URL" bot-di-zona-YYYY-MM-DD-HHMM.dump
#
# Formato "custom" (-Fc):
#   - binário, compressed
#   - suporta pg_restore paralelo (--jobs N)
#   - permite restore selectivo de tabelas/schemas
#   - recomendado sobre plain SQL para bases deste tamanho

set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL tem de estar definido}"

BACKUP_DIR="${BACKUP_DIR:-./snapshots}"
mkdir -p "$BACKUP_DIR"

TIMESTAMP=$(date +%Y-%m-%d-%H%M)
OUT="$BACKUP_DIR/bot-di-zona-$TIMESTAMP.dump"

echo "[backup] $(date -Iseconds) — a fazer dump para $OUT ..."
pg_dump --format=custom --no-owner --no-privileges \
  --file="$OUT" \
  "$DATABASE_URL"

SIZE=$(du -h "$OUT" | cut -f1)
echo "[backup] OK — $SIZE em $OUT"

# Opcional: retenção — apaga dumps com mais de N dias.
if [[ -n "${RETAIN_DAYS:-}" ]]; then
  echo "[backup] a remover dumps > $RETAIN_DAYS dias em $BACKUP_DIR ..."
  find "$BACKUP_DIR" -name 'bot-di-zona-*.dump' -mtime "+$RETAIN_DAYS" -print -delete
fi
