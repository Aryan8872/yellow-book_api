#!/usr/bin/env bash
#
# OfferNepal PostgreSQL restore script.
#
# Restores a dump produced by backup-database.sh, transparently handling
# gzip compression and optional AES-256 encryption.
#
# Usage:
#   ./scripts/restore-database.sh <backup-file>
#   ./scripts/restore-database.sh --yes <backup-file>   # skip confirmation
#
# Environment:
#   DATABASE_URL        (required) target PostgreSQL connection string
#   BACKUP_ENCRYPT_KEY  (required only if the backup is *.enc)
#
# WARNING: restore is destructive. It drops and recreates objects that exist in
# the dump. Always target a verified DATABASE_URL.

set -Eeuo pipefail

SCRIPT_NAME="$(basename "$0")"

log()  { printf '[%s] %s\n' "$(date -u +'%Y-%m-%dT%H:%M:%SZ')" "$*"; }
fail() { log "ERROR: $*"; exit 1; }

on_error() {
  local exit_code=$?
  log "Restore failed (exit ${exit_code}). Database may be in a partial state."
  exit "${exit_code}"
}
trap on_error ERR

# ── Argument parsing ────────────────────────────────────────────────────────
ASSUME_YES=0
if [[ "${1:-}" == "--yes" || "${1:-}" == "-y" ]]; then
  ASSUME_YES=1
  shift
fi

BACKUP_FILE="${1:-}"
[[ -n "${BACKUP_FILE}" ]] || fail "Usage: ${SCRIPT_NAME} [--yes] <backup-file>"
[[ -f "${BACKUP_FILE}" ]] || fail "Backup file not found: ${BACKUP_FILE}"

command -v pg_restore >/dev/null 2>&1 || fail "pg_restore not found. Install PostgreSQL client tools."

if [[ -z "${DATABASE_URL:-}" ]]; then
  log "DATABASE_URL not set; attempting to source .env"
  if [[ -f .env ]]; then
    # shellcheck disable=SC1091
    set -a; source .env; set +a
  fi
fi
[[ -n "${DATABASE_URL:-}" ]] || fail "DATABASE_URL is required."

# ── Verify checksum when available ──────────────────────────────────────────
if [[ -f "${BACKUP_FILE}.sha256" ]]; then
  log "Verifying checksum..."
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum -c "${BACKUP_FILE}.sha256" || fail "Checksum mismatch — dump may be corrupt. Aborting."
    log "Checksum OK"
  fi
else
  log "WARN: no .sha256 sidecar found; skipping integrity verification"
fi

# ── Decrypt if needed ───────────────────────────────────────────────────────
RESTORE_SOURCE="${BACKUP_FILE}"
TEMP_FILE=""

cleanup() { [[ -n "${TEMP_FILE}" && -f "${TEMP_FILE}" ]] && rm -f "${TEMP_FILE}" || true; }
trap cleanup EXIT

if [[ "${BACKUP_FILE}" == *.enc ]]; then
  [[ -n "${BACKUP_ENCRYPT_KEY:-}" ]] || fail "Backup is encrypted but BACKUP_ENCRYPT_KEY is not set."
  TEMP_FILE="${BACKUP_FILE%.enc}"
  log "Decrypting backup..."
  openssl enc -d -aes-256-cbc -pbkdf2 -iter 100000 \
    -in "${BACKUP_FILE}" \
    -out "${TEMP_FILE}" \
    -pass "pass:${BACKUP_ENCRYPT_KEY}"
  RESTORE_SOURCE="${TEMP_FILE}"
fi

# ── Decompress if needed ────────────────────────────────────────────────────
if [[ "${RESTORE_SOURCE}" == *.gz ]]; then
  command -v gunzip >/dev/null 2>&1 || fail "gunzip not found."
  TEMP_DUMP="${RESTORE_SOURCE%.gz}"
  # Never clobber an existing file with the same name.
  [[ -e "${TEMP_DUMP}" ]] && TEMP_DUMP="${RESTORE_SOURCE%.gz}.restoring"
  log "Decompressing backup..."
  gunzip -c "${RESTORE_SOURCE}" > "${TEMP_DUMP}"
  if [[ -z "${TEMP_FILE}" ]]; then TEMP_FILE="${TEMP_DUMP}"; fi
  RESTORE_SOURCE="${TEMP_DUMP}"
fi

# ── Confirmation ────────────────────────────────────────────────────────────
if [[ "${ASSUME_YES}" -ne 1 ]]; then
  log "WARNING: this will OVERWRITE the target database."
  log "  Backup file : ${BACKUP_FILE}"
  log "  Target DB   : $(printf '%s' "${DATABASE_URL}" | sed -E 's#://[^@]*@#://***:***@#')"
  read -r -p "Type 'yes' to continue: " CONFIRM
  [[ "${CONFIRM}" == "yes" ]] || fail "Restore cancelled by user."
fi

# ── Restore ─────────────────────────────────────────────────────────────────
log "Restoring ${RESTORE_SOURCE} into target database..."

# --clean --if-exists drops existing objects first (matches the dump flags).
# --no-owner --no-privileges avoids role/permission errors across environments.
# --single-transaction guarantees the restore is atomic: any error rolls back.
pg_restore "${DATABASE_URL}" \
  --no-owner \
  --no-privileges \
  --clean \
  --if-exists \
  --single-transaction \
  --exit-on-error \
  "${RESTORE_SOURCE}"

log "Restore completed successfully."
