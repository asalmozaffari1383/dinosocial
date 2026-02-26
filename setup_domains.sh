#!/usr/bin/env bash
set -euo pipefail

LOCAL_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REMOTE_USER="${REMOTE_USER:-appuser}"
REMOTE_HOST="${REMOTE_HOST:-185.239.3.242}"
REMOTE_TMP_DIR="${REMOTE_TMP_DIR:-/home/appuser/frontend/nginx}"
SSH_OPTIONS=(
  -o ServerAliveInterval=15
  -o ServerAliveCountMax=6
  -o StrictHostKeyChecking=accept-new
)
SSH_CMD=(ssh "${SSH_OPTIONS[@]}")
RSYNC_SSH="ssh ${SSH_OPTIONS[*]}"

echo "Uploading nginx configs..."
"${SSH_CMD[@]}" "$REMOTE_USER@$REMOTE_HOST" "mkdir -p \"$REMOTE_TMP_DIR\""
rsync -e "$RSYNC_SSH" -az --itemize-changes --out-format='%i %n%L' \
  "$LOCAL_DIR/nginx/" "$REMOTE_USER@$REMOTE_HOST:$REMOTE_TMP_DIR/"

echo "Installing nginx site configs on server..."
"${SSH_CMD[@]}" -tt "$REMOTE_USER@$REMOTE_HOST" "
set -euo pipefail

sudo install -m 0644 \"$REMOTE_TMP_DIR/dinosocial.ir.conf\" /etc/nginx/sites-available/dinosocial.ir.conf
sudo install -m 0644 \"$REMOTE_TMP_DIR/api.dinosocial.ir.conf\" /etc/nginx/sites-available/api.dinosocial.ir.conf

sudo ln -sfn /etc/nginx/sites-available/dinosocial.ir.conf /etc/nginx/sites-enabled/dinosocial.ir.conf
sudo ln -sfn /etc/nginx/sites-available/api.dinosocial.ir.conf /etc/nginx/sites-enabled/api.dinosocial.ir.conf
sudo rm -f /etc/nginx/sites-enabled/backend

sudo nginx -t
sudo systemctl reload nginx
sudo systemctl --no-pager --full status nginx | sed -n '1,12p'
echo \"Nginx domain routing updated.\"
"
