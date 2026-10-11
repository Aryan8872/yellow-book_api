#!/usr/bin/env bash
#
# OfferNepal PostgreSQL backup script.
#
# Produces a compressed custom-format dump named:
#   backups/offernepal_<YYYYmmdd_HHMMSS>.dump
#
# Usage:
#   ./scripts/backup-database.sh
#
# Environment:
#   DATABASE_URL        (required) PostgreSQL connection string
#   BACKUP_DIR          (default: ./backups)
#   BACKUP_RETENTION_DAYS (default: 30)
#   BACKUP_ENCRYPT_KEY  (optional) passphrase — enables gzip+AES-256 encryption
#
# Exits non-zero on failure so schedulers / CI can alert. Partial dumps are
# always removed on failure so a truncated file is never mistaken for a backup.

set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"

log()  { printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

on_error() {
  local exit_code=$?
  log "Backup failed (exit ${exit_code}). Cleaning up partial artifacts."
  rm -f "${OUT_FILE:-}" "${OUT_FILE:-}.gz" "${OUT_FILE:-}.gz.enc" 2>/dev/null || true
  exit "${exit_code}"
}
trap on_error ERR

# ── Preconditions ───────────────────────────────────────────────────────────
command -v pg_dump >/dev/null 2>&1 || fail "pg_dump not found. Install PostgreSQL client tools."

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "DATABASE_URL not set; attempting to source .env"
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
  fi
fi
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required."

BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"

mkdir -p "${BACKUP_DIR}"

TIMESTAMP="$(date -u +'%Y%m%d_%H%M%S')"
OUT_FILE="${BACKUP_DIR}/offernepal_${TIMESTAMP}.dump"

log "Starting OfferNepal database backup -> ${OUT_FILE}"

# --no-owner / --no-privileges keep the dump portable across roles.
# --clean --if-exists makes restores idempotent into an existing database.
pg_dump "${DATABASE_URL}" \
  --format=custom \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --file="${OUT_FILE}" >/dev/null

[[ -s "${OUT_FILE}" ]] || fail "Backup file is empty — dump produced no output."

RAW_SIZE="$(du -h "${OUT_FILE}" | cut -f1)"
log "Raw dump complete: ${OUT_FILE} (${RAW_SIZE})"

# ── Compression ─────────────────────────────────────────────────────────────
log "Compressing backup..."
gzip -9 -f "${OUT_FILE}"
COMPRESSED="${OUT_FILE}.gz"

# ── Optional encryption ─────────────────────────────────────────────────────
FINAL_FILE="${COMPRESSED}"
if [[ -n "${BACKUP_ENCRYPT_KEY:-}" ]]; then
  command -v openssl >/dev/null 2>&1 || fail "BACKUP_ENCRYPT_KEY set but openssl is unavailable."
  log "Encrypting backup (AES-256-CBC)..."
  openssl enc -aes-256-cbc -salt -pbkdf2 -iter 100000 \
    -in "${COMPRESSED}" \
    -out "${COMPRESSED}.enc" \
    -pass "pass:${BACKUP_ENCRYPT_KEY}"
  rm -f "${COMPRESSED}"
  FINAL_FILE="${COMPRESSED}.enc"
fi

FINAL_SIZE="$(du -h "${FINAL_FILE}" | cut -f1)"
log "Backup ready: ${FINAL_FILE} (${FINAL_SIZE})"

# ── Checksum for integrity verification before restore ──────────────────────
if command -v sha256sum >/dev/null 2>&1; then
  sha256sum "${FINAL_FILE}" > "${FINAL_FILE}.sha256"
  log "Checksum written: ${FINAL_FILE}.sha256"
fi

# ── Retention pruning ───────────────────────────────────────────────────────
log "Pruning backups older than ${BACKUP_RETENTION_DAYS} days..."
find "${BACKUP_DIR}" -maxdepth 1 -type f \
  \( -name 'offernepal_*.dump*' -o -name 'offernepal_*.sha256' \) \
  -mtime "+${BACKUP_RETENTION_DAYS}" \
  -print -delete || log "WARN: retention prune encountered errors (non-fatal)"

log "Backup completed successfully: ${FINAL_FILE}"
