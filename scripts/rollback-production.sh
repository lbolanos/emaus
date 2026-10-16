#!/usr/bin/env bash
set -euo pipefail

# Production Rollback Script
# Restores the previous deployment from /var/www/emaus/previous/
# Usage: pnpm prod:rollback

SSH_KEY="${SSH_KEY:-$HOME/.ssh/lightsail-emaus.pem}"
# Cloudflare proxy blocks port 22, so SSH must use the Lightsail direct IP
SSH_HOST="${SSH_HOST:-ubuntu@18.116.102.104}"
SSH_CMD="ssh -i $SSH_KEY $SSH_HOST"
PREV_DIR="/var/www/emaus/previous"
APP_DIR="/var/www/emaus"

# Verify SSH key exists
if [ ! -f "$SSH_KEY" ]; then
  echo "SSH key not found at $SSH_KEY"
  exit 1
fi

# Check that a snapshot exists on the server
echo "Checking for rollback snapshot on server..."
SNAPSHOT_INFO=$($SSH_CMD "cat $PREV_DIR/snapshot-timestamp.txt 2>/dev/null && echo '---' && cat $PREV_DIR/git-commit.txt 2>/dev/null || true")

if [ -z "$SNAPSHOT_INFO" ] || [[ "$SNAPSHOT_INFO" == "---" ]]; then
  echo "No rollback snapshot found at $PREV_DIR on the server."
  echo "A deployment via GitHub Actions must have run at least once to create a snapshot."
  exit 1
fi

TIMESTAMP=$(echo "$SNAPSHOT_INFO" | head -1)
COMMIT=$(echo "$SNAPSHOT_INFO" | tail -1)

echo ""
echo "=== Rollback Snapshot ==="
echo "  Timestamp: $TIMESTAMP"
echo "  Commit:    $COMMIT"
echo "========================="
echo ""
read -p "Restore this version? (y/N): " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Rollback cancelled."
  exit 0
fi

echo ""
echo "Rolling back..."

$SSH_CMD << 'ROLLBACKEOF'
set -e
PREV_DIR="/var/www/emaus/previous"
APP_DIR="/var/www/emaus"
WEB_DIR="$APP_DIR/apps/web"

# The deploy publishes each web build to apps/web/releases/<id> and points the
# apps/web/dist symlink at it; the snapshot records which release was live
# before the deploy (web-release.txt). Snapshots taken before that layout carry
# a full copy of the dist dir instead (web-dist).
PREV_REL=$(cat "$PREV_DIR/web-release.txt" 2>/dev/null || true)
WEB_SOURCE=""
if [ -n "$PREV_REL" ] && [ -f "$WEB_DIR/$PREV_REL/index.html" ]; then
  WEB_SOURCE="release"
elif [ -d "$PREV_DIR/web-dist" ] && [ ! -L "$PREV_DIR/web-dist" ]; then
  WEB_SOURCE="copy"
fi

# Verify the snapshot is complete before touching anything
if [ ! -d "$PREV_DIR/api-dist" ] || [ -z "$WEB_SOURCE" ]; then
  echo "Snapshot is incomplete (missing api-dist or the previous web release). Cannot rollback."
  exit 1
fi

# Restore web: swap the dist symlink back. Never write into dist — it is the
# live release dir, and the release being rolled back stays in releases/ so a
# roll-forward is the same swap.
echo "Restoring web dist..."
cd "$WEB_DIR"
if [ "$WEB_SOURCE" = "copy" ]; then
  PREV_REL="releases/rollback-$(date +%Y%m%d%H%M%S)"
  mkdir -p releases
  cp -r "$PREV_DIR/web-dist" "$PREV_REL"
fi
if [ -e dist ] && [ ! -L dist ]; then
  mv dist "releases/pre-rollback-$(date +%Y%m%d%H%M%S)"
fi
ln -sfn "$PREV_REL" dist.next
mv -T dist.next dist   # rename(2): atomic for every reader
echo "dist -> $PREV_REL"

# Restore api dist
echo "Restoring api dist..."
rm -rf "$APP_DIR/apps/api/dist"
cp -r "$PREV_DIR/api-dist" "$APP_DIR/apps/api/dist"

# Restore package files
echo "Restoring package files..."
cp "$PREV_DIR/api-package.json" "$APP_DIR/apps/api/package.json" 2>/dev/null || true
cp "$PREV_DIR/web-package.json" "$APP_DIR/apps/web/package.json" 2>/dev/null || true
cp "$PREV_DIR/root-package.json" "$APP_DIR/package.json" 2>/dev/null || true
cp "$PREV_DIR/pnpm-lock.yaml" "$APP_DIR/pnpm-lock.yaml" 2>/dev/null || true
cp "$PREV_DIR/pnpm-workspace.yaml" "$APP_DIR/pnpm-workspace.yaml" 2>/dev/null || true

# Reinstall dependencies in case package.json changed
echo "Installing dependencies..."
cd "$APP_DIR"
pnpm install --frozen-lockfile 2>&1 | tail -5

# Restart PM2
echo "Restarting PM2..."
pm2 restart emaus-api
sleep 3
pm2 status emaus-api
ROLLBACKEOF

echo ""
echo "Rollback complete. Running health check..."

# Health check
for i in {1..5}; do
  if curl -sf https://emaus.cc/api/health > /dev/null 2>&1; then
    echo "Health check passed — rollback successful."
    exit 0
  fi
  if [ "$i" -lt 5 ]; then
    echo "Waiting for application to start ($i/5)..."
    sleep 3
  fi
done

echo "Health check did not pass after 5 attempts. Check the server manually."
exit 1
