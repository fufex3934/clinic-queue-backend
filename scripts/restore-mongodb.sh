#!/usr/bin/env bash
set -euo pipefail

if [[ -z "${MONGODB_URI:-}" ]]; then
  echo "MONGODB_URI is required"
  exit 1
fi

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 <backup_dir>"
  exit 1
fi

BACKUP_DIR="$1"

if [[ ! -d "$BACKUP_DIR" ]]; then
  echo "Backup directory not found: $BACKUP_DIR"
  exit 1
fi

mongorestore --uri="$MONGODB_URI" --drop "$BACKUP_DIR"
echo "Restore completed from: $BACKUP_DIR"
