#!/usr/bin/env bash
set -euo pipefail

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_USER="${REMOTE_USER:-appuser}"
REMOTE_HOST="${REMOTE_HOST:-185.239.3.242}"
REMOTE_DIR="${REMOTE_DIR:-/home/appuser/frontend/sec_messenger_frontend-main}"
REMOTE_WEB_ROOT="${REMOTE_WEB_ROOT:-/var/www/dinosocial.ir}"
VITE_API_BASE_URL="${VITE_API_BASE_URL:-https://api.dinosocial.ir}"
EXCLUDE_FILE="$LOCAL_DIR/exclude.txt"
SSH_OPTIONS=(
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=6
  -o StrictHostKeyChecking=accept-new
)
SSH_CMD=(ssh "${SSH_OPTIONS[@]}")
RSYNC_SSH="ssh ${SSH_OPTIONS[*]}"

if [[ ! -f "$EXCLUDE_FILE" ]]; then
  echo "Exclude file not found: $EXCLUDE_FILE"
  exit 1
fi

echo "Starting rsync deployment for frontend..."
echo "Syncing source changes to $REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR"
"${SSH_CMD[@]}" "$REMOTE_USER@$REMOTE_HOST" "mkdir -p \"$REMOTE_DIR\""
rsync -e "$RSYNC_SSH" -az --delete --delete-delay --itemize-changes --out-format='%i %n%L' \
  --exclude-from="$EXCLUDE_FILE" \
  "$LOCAL_DIR/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_DIR/"

echo "Building on server and publishing static files..."
"${SSH_CMD[@]}" -tt "$REMOTE_USER@$REMOTE_HOST" "
set -euo pipefail
cd \"$REMOTE_DIR\"

if ! command -v npm >/dev/null 2>&1; then
  echo \"npm is not installed on server. Install Node.js 18+ first.\"
  exit 1
fi

if [[ -f package-lock.json ]]; then
  npm ci
else
  npm install
fi

VITE_API_BASE_URL=\"$VITE_API_BASE_URL\" npm run build

sudo mkdir -p \"$REMOTE_WEB_ROOT\"
sudo rsync -az --delete dist/ \"$REMOTE_WEB_ROOT/\"
sudo chown -R www-data:www-data \"$REMOTE_WEB_ROOT\"
sudo find \"$REMOTE_WEB_ROOT\" -type d -exec chmod 755 {} \;
sudo find \"$REMOTE_WEB_ROOT\" -type f -exec chmod 644 {} \;

echo \"Validating and reloading nginx...\"
sudo nginx -t
sudo systemctl reload nginx
sudo systemctl --no-pager --full status nginx | sed -n '1,12p'

echo \"Frontend deployment complete!\"
"
