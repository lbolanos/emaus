#!/usr/bin/env bash
set -euo pipefail

# Integration test for rollback file-swap logic
# Simulates the snapshot + restore cycle using temp directories
# Usage: bash scripts/tests/test-rollback-logic.sh

PASS=0
FAIL=0
TEST_DIR=""

cleanup() {
  if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
  fi
}
trap cleanup EXIT

setup() {
  TEST_DIR=$(mktemp -d)

  # Simulate /var/www/emaus structure with "v1" content
  mkdir -p "$TEST_DIR/app/apps/api/dist"
  mkdir -p "$TEST_DIR/app/apps/web/dist/assets"
  echo "api-v1" > "$TEST_DIR/app/apps/api/dist/index.js"
  echo "web-v1" > "$TEST_DIR/app/apps/web/dist/index.html"
  echo "asset-v1" > "$TEST_DIR/app/apps/web/dist/assets/main.js"
  echo '{"name":"api","version":"1.0.0"}' > "$TEST_DIR/app/apps/api/package.json"
  echo '{"name":"web","version":"1.0.0"}' > "$TEST_DIR/app/apps/web/package.json"
  echo '{"name":"emaus","version":"1.0.0"}' > "$TEST_DIR/app/package.json"
  echo "lockfile-v1" > "$TEST_DIR/app/pnpm-lock.yaml"
  echo "workspace-v1" > "$TEST_DIR/app/pnpm-workspace.yaml"

  mkdir -p "$TEST_DIR/previous"
}

assert_eq() {
  local desc="$1" expected="$2" actual="$3"
  if [ "$expected" = "$actual" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (expected '$expected', got '$actual')"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_exists() {
  local desc="$1" filepath="$2"
  if [ -f "$filepath" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (file not found: $filepath)"
    FAIL=$((FAIL + 1))
  fi
}

assert_dir_exists() {
  local desc="$1" dirpath="$2"
  if [ -d "$dirpath" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (dir not found: $dirpath)"
    FAIL=$((FAIL + 1))
  fi
}

assert_file_not_exists() {
  local desc="$1" filepath="$2"
  if [ ! -f "$filepath" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (file should not exist: $filepath)"
    FAIL=$((FAIL + 1))
  fi
}

# ---- Snapshot Logic (mirrors the workflow SNAPSHOTEOF block) ----
do_snapshot() {
  local APP_DIR="$TEST_DIR/app"
  local PREV_DIR="$TEST_DIR/previous"

  rm -rf "$PREV_DIR"
  mkdir -p "$PREV_DIR"
  cp -r "$APP_DIR/apps/api/dist" "$PREV_DIR/api-dist" 2>/dev/null || true
  cp -r "$APP_DIR/apps/web/dist" "$PREV_DIR/web-dist" 2>/dev/null || true
  cp "$APP_DIR/apps/api/package.json" "$PREV_DIR/api-package.json" 2>/dev/null || true
  cp "$APP_DIR/apps/web/package.json" "$PREV_DIR/web-package.json" 2>/dev/null || true
  cp "$APP_DIR/package.json" "$PREV_DIR/root-package.json" 2>/dev/null || true
  cp "$APP_DIR/pnpm-lock.yaml" "$PREV_DIR/pnpm-lock.yaml" 2>/dev/null || true
  cp "$APP_DIR/pnpm-workspace.yaml" "$PREV_DIR/pnpm-workspace.yaml" 2>/dev/null || true
  echo "abc123" > "$PREV_DIR/git-commit.txt"
  date -u > "$PREV_DIR/snapshot-timestamp.txt"
}

# ---- Simulate deploying "v2" (new code overwrites dist) ----
deploy_v2() {
  local APP_DIR="$TEST_DIR/app"
  rm -rf "$APP_DIR/apps/api/dist" "$APP_DIR/apps/web/dist"
  mkdir -p "$APP_DIR/apps/api/dist"
  mkdir -p "$APP_DIR/apps/web/dist/assets"
  echo "api-v2" > "$APP_DIR/apps/api/dist/index.js"
  echo "web-v2" > "$APP_DIR/apps/web/dist/index.html"
  echo "asset-v2" > "$APP_DIR/apps/web/dist/assets/main.js"
  echo '{"name":"api","version":"2.0.0"}' > "$APP_DIR/apps/api/package.json"
  echo '{"name":"web","version":"2.0.0"}' > "$APP_DIR/apps/web/package.json"
  echo '{"name":"emaus","version":"2.0.0"}' > "$APP_DIR/package.json"
  echo "lockfile-v2" > "$APP_DIR/pnpm-lock.yaml"
}

# ---- Rollback Logic (mirrors the ROLLBACKEOF block in rollback-production.sh) ----
do_rollback() {
  local APP_DIR="$TEST_DIR/app"
  local PREV_DIR="$TEST_DIR/previous"

  if [ ! -d "$PREV_DIR/api-dist" ] || [ ! -d "$PREV_DIR/web-dist" ]; then
    echo "Snapshot is incomplete. Cannot rollback."
    return 1
  fi

  rm -rf "$APP_DIR/apps/web/dist"
  cp -r "$PREV_DIR/web-dist" "$APP_DIR/apps/web/dist"

  rm -rf "$APP_DIR/apps/api/dist"
  cp -r "$PREV_DIR/api-dist" "$APP_DIR/apps/api/dist"

  cp "$PREV_DIR/api-package.json" "$APP_DIR/apps/api/package.json" 2>/dev/null || true
  cp "$PREV_DIR/web-package.json" "$APP_DIR/apps/web/package.json" 2>/dev/null || true
  cp "$PREV_DIR/root-package.json" "$APP_DIR/package.json" 2>/dev/null || true
  cp "$PREV_DIR/pnpm-lock.yaml" "$APP_DIR/pnpm-lock.yaml" 2>/dev/null || true
  cp "$PREV_DIR/pnpm-workspace.yaml" "$APP_DIR/pnpm-workspace.yaml" 2>/dev/null || true
}

# =============================================================================
echo ""
echo "=== Test: Snapshot captures v1 state ==="
setup
do_snapshot

assert_dir_exists "previous/api-dist exists" "$TEST_DIR/previous/api-dist"
assert_dir_exists "previous/web-dist exists" "$TEST_DIR/previous/web-dist"
assert_eq "api dist content" "api-v1" "$(cat "$TEST_DIR/previous/api-dist/index.js")"
assert_eq "web dist content" "web-v1" "$(cat "$TEST_DIR/previous/web-dist/index.html")"
assert_eq "web asset content" "asset-v1" "$(cat "$TEST_DIR/previous/web-dist/assets/main.js")"
assert_file_exists "api-package.json" "$TEST_DIR/previous/api-package.json"
assert_file_exists "web-package.json" "$TEST_DIR/previous/web-package.json"
assert_file_exists "root-package.json" "$TEST_DIR/previous/root-package.json"
assert_file_exists "pnpm-lock.yaml" "$TEST_DIR/previous/pnpm-lock.yaml"
assert_file_exists "pnpm-workspace.yaml" "$TEST_DIR/previous/pnpm-workspace.yaml"
assert_file_exists "snapshot-timestamp.txt" "$TEST_DIR/previous/snapshot-timestamp.txt"
assert_file_exists "git-commit.txt" "$TEST_DIR/previous/git-commit.txt"
assert_eq "git commit content" "abc123" "$(cat "$TEST_DIR/previous/git-commit.txt")"

# =============================================================================
echo ""
echo "=== Test: Deploy v2 overwrites v1 ==="
deploy_v2

assert_eq "api is now v2" "api-v2" "$(cat "$TEST_DIR/app/apps/api/dist/index.js")"
assert_eq "web is now v2" "web-v2" "$(cat "$TEST_DIR/app/apps/web/dist/index.html")"
assert_eq "root pkg version" '{"name":"emaus","version":"2.0.0"}' "$(cat "$TEST_DIR/app/package.json")"

# =============================================================================
echo ""
echo "=== Test: Rollback restores v1 from snapshot ==="
do_rollback

assert_eq "api restored to v1" "api-v1" "$(cat "$TEST_DIR/app/apps/api/dist/index.js")"
assert_eq "web restored to v1" "web-v1" "$(cat "$TEST_DIR/app/apps/web/dist/index.html")"
assert_eq "web asset restored" "asset-v1" "$(cat "$TEST_DIR/app/apps/web/dist/assets/main.js")"
assert_eq "api pkg restored" '{"name":"api","version":"1.0.0"}' "$(cat "$TEST_DIR/app/apps/api/package.json")"
assert_eq "web pkg restored" '{"name":"web","version":"1.0.0"}' "$(cat "$TEST_DIR/app/apps/web/package.json")"
assert_eq "root pkg restored" '{"name":"emaus","version":"1.0.0"}' "$(cat "$TEST_DIR/app/package.json")"
assert_eq "lockfile restored" "lockfile-v1" "$(cat "$TEST_DIR/app/pnpm-lock.yaml")"
assert_eq "workspace restored" "workspace-v1" "$(cat "$TEST_DIR/app/pnpm-workspace.yaml")"

# =============================================================================
echo ""
echo "=== Test: Snapshot preserves only latest pre-deploy state ==="
# After rollback, do another snapshot + deploy cycle to ensure previous/ gets replaced
do_snapshot  # now snapshots v1 (the current state after rollback)
deploy_v2    # deploy v2 again

assert_eq "snapshot has v1 (post-rollback)" "api-v1" "$(cat "$TEST_DIR/previous/api-dist/index.js")"
assert_eq "app has v2 again" "api-v2" "$(cat "$TEST_DIR/app/apps/api/dist/index.js")"

# =============================================================================
echo ""
echo "=== Test: Rollback fails gracefully when snapshot is incomplete ==="
setup
# Create a partial snapshot (missing web-dist)
mkdir -p "$TEST_DIR/previous/api-dist"
echo "api-v1" > "$TEST_DIR/previous/api-dist/index.js"
# No web-dist

ROLLBACK_OUTPUT=$(do_rollback 2>&1 || true)
assert_eq "reports incomplete snapshot" "Snapshot is incomplete. Cannot rollback." "$ROLLBACK_OUTPUT"

# =============================================================================
echo ""
echo "=== Test: Snapshot works when no previous dist exists (first deploy) ==="
TEST_DIR=$(mktemp -d)
mkdir -p "$TEST_DIR/app/apps/api"
mkdir -p "$TEST_DIR/app/apps/web"
echo '{}' > "$TEST_DIR/app/apps/api/package.json"
echo '{}' > "$TEST_DIR/app/apps/web/package.json"
echo '{}' > "$TEST_DIR/app/package.json"
echo "" > "$TEST_DIR/app/pnpm-lock.yaml"
echo "" > "$TEST_DIR/app/pnpm-workspace.yaml"
mkdir -p "$TEST_DIR/previous"

# Snapshot should not fail even though dist dirs don't exist
do_snapshot
assert_file_exists "timestamp created even without dist dirs" "$TEST_DIR/previous/snapshot-timestamp.txt"

# =============================================================================
echo ""
echo "=== Test: Rollback cleans stale assets from dist ==="
setup
do_snapshot

# Deploy v2 with an extra file that didn't exist in v1
deploy_v2
echo "stale-asset" > "$TEST_DIR/app/apps/web/dist/assets/stale.js"
echo "extra-api-file" > "$TEST_DIR/app/apps/api/dist/extra.js"

do_rollback

assert_file_not_exists "stale web asset removed" "$TEST_DIR/app/apps/web/dist/assets/stale.js"
assert_file_not_exists "extra api file removed" "$TEST_DIR/app/apps/api/dist/extra.js"
assert_eq "web v1 restored" "web-v1" "$(cat "$TEST_DIR/app/apps/web/dist/index.html")"

# =============================================================================
echo ""
echo "================================"
echo "Results: $PASS passed, $FAIL failed"
echo "================================"

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
