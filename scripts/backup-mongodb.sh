#!/usr/bin/env bash
set -euo pipefail

BACKUP_ROOT="${BACKUP_ROOT:-./backups}"
TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
OUTPUT_DIR="$BACKUP_ROOT/$TIMESTAMP"

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "MONGODB_URI is required"
  exit 1
fi

mkdir -p "$OUTPUT_DIR"
mongodump --uri="$MONGODB_URI" --out="$OUTPUT_DIR"

echo "Backup created at: $OUTPUT_DIR"
