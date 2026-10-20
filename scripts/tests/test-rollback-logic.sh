#!/usr/bin/env bash
set -euo pipefail

# Integration test for rollback file-swap logic
# Simulates the snapshot + restore cycle using temp directories
# Usage: bash scripts/tests/test-rollback-logic.sh

PASS=0
FAIL=0
TEST_DIR=""

# The server (GNU) renames over the dist symlink with `mv -T`; BSD mv spells the
# same no-follow rename `mv -h`, so the test also runs on macOS.
if mv --version >/dev/null 2>&1; then MV_NOFOLLOW="mv -T"; else MV_NOFOLLOW="mv -h"; fi

cleanup() {
  if [ -n "$TEST_DIR" ] && [ -d "$TEST_DIR" ]; then
    rm -rf "$TEST_DIR"
  fi
}
trap cleanup EXIT

# Writes a web build into apps/web/releases/<id>.
make_release() {
  local id="$1" version="$2"
  local rel="$TEST_DIR/app/apps/web/releases/$id"
  mkdir -p "$rel/assets"
  echo "web-$version" > "$rel/index.html"
  echo "asset-$version" > "$rel/assets/main.js"
}

# Points apps/web/dist at releases/<id> (mirrors the workflow SWAPEOF block).
swap_dist() {
  local id="$1"
  (
    cd "$TEST_DIR/app/apps/web"
    ln -sfn "releases/$id" dist.next
    $MV_NOFOLLOW dist.next dist
  )
}

setup() {
  cleanup
  TEST_DIR=$(mktemp -d)

  # Simulate /var/www/emaus structure with "v1" live
  mkdir -p "$TEST_DIR/app/apps/api/dist"
  echo "api-v1" > "$TEST_DIR/app/apps/api/dist/index.js"
  make_release v1 v1
  swap_dist v1
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

assert_not_exists() {
  local desc="$1" path="$2"
  if [ ! -e "$path" ] && [ ! -L "$path" ]; then
    echo "  PASS: $desc"
    PASS=$((PASS + 1))
  else
    echo "  FAIL: $desc (should not exist: $path)"
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
  readlink "$APP_DIR/apps/web/dist" > "$PREV_DIR/web-release.txt" 2>/dev/null || true
  cp "$APP_DIR/apps/api/package.json" "$PREV_DIR/api-package.json" 2>/dev/null || true
  cp "$APP_DIR/apps/web/package.json" "$PREV_DIR/web-package.json" 2>/dev/null || true
  cp "$APP_DIR/package.json" "$PREV_DIR/root-package.json" 2>/dev/null || true
  cp "$APP_DIR/pnpm-lock.yaml" "$PREV_DIR/pnpm-lock.yaml" 2>/dev/null || true
  cp "$APP_DIR/pnpm-workspace.yaml" "$PREV_DIR/pnpm-workspace.yaml" 2>/dev/null || true
  echo "abc123" > "$PREV_DIR/git-commit.txt"
  date -u > "$PREV_DIR/snapshot-timestamp.txt"
}

# ---- Simulate deploying "v2" (api overwritten, web published as a release) ----
deploy_v2() {
  local APP_DIR="$TEST_DIR/app"
  rm -rf "$APP_DIR/apps/api/dist"
  mkdir -p "$APP_DIR/apps/api/dist"
  echo "api-v2" > "$APP_DIR/apps/api/dist/index.js"
  make_release v2 v2
  swap_dist v2
  echo '{"name":"api","version":"2.0.0"}' > "$APP_DIR/apps/api/package.json"
  echo '{"name":"web","version":"2.0.0"}' > "$APP_DIR/apps/web/package.json"
  echo '{"name":"emaus","version":"2.0.0"}' > "$APP_DIR/package.json"
  echo "lockfile-v2" > "$APP_DIR/pnpm-lock.yaml"
}

# ---- Rollback Logic (mirrors the ROLLBACKEOF block in rollback-production.sh) ----
do_rollback() {
  local APP_DIR="$TEST_DIR/app"
  local PREV_DIR="$TEST_DIR/previous"
  local WEB_DIR="$APP_DIR/apps/web"

  local PREV_REL WEB_SOURCE=""
  PREV_REL=$(cat "$PREV_DIR/web-release.txt" 2>/dev/null || true)
  if [ -n "$PREV_REL" ] && [ -f "$WEB_DIR/$PREV_REL/index.html" ]; then
    WEB_SOURCE="release"
  elif [ -d "$PREV_DIR/web-dist" ] && [ ! -L "$PREV_DIR/web-dist" ]; then
    WEB_SOURCE="copy"
  fi

  if [ ! -d "$PREV_DIR/api-dist" ] || [ -z "$WEB_SOURCE" ]; then
    echo "Snapshot is incomplete (missing api-dist or the previous web release). Cannot rollback."
    return 1
  fi

  (
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
    $MV_NOFOLLOW dist.next dist
  )

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
assert_eq "api dist content" "api-v1" "$(cat "$TEST_DIR/previous/api-dist/index.js")"
assert_eq "records the live web release" "releases/v1" "$(cat "$TEST_DIR/previous/web-release.txt")"
assert_not_exists "no copy of the dist symlink" "$TEST_DIR/previous/web-dist"
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

assert_eq "dist points back at v1" "releases/v1" "$(readlink "$TEST_DIR/app/apps/web/dist")"
assert_eq "api restored to v1" "api-v1" "$(cat "$TEST_DIR/app/apps/api/dist/index.js")"
assert_eq "web restored to v1" "web-v1" "$(cat "$TEST_DIR/app/apps/web/dist/index.html")"
assert_eq "web asset restored" "asset-v1" "$(cat "$TEST_DIR/app/apps/web/dist/assets/main.js")"
assert_eq "api pkg restored" '{"name":"api","version":"1.0.0"}' "$(cat "$TEST_DIR/app/apps/api/package.json")"
assert_eq "web pkg restored" '{"name":"web","version":"1.0.0"}' "$(cat "$TEST_DIR/app/apps/web/package.json")"
assert_eq "root pkg restored" '{"name":"emaus","version":"1.0.0"}' "$(cat "$TEST_DIR/app/package.json")"
assert_eq "lockfile restored" "lockfile-v1" "$(cat "$TEST_DIR/app/pnpm-lock.yaml")"
assert_eq "workspace restored" "workspace-v1" "$(cat "$TEST_DIR/app/pnpm-workspace.yaml")"
assert_eq "v2 release kept for roll-forward" "web-v2" "$(cat "$TEST_DIR/app/apps/web/releases/v2/index.html")"

# =============================================================================
echo ""
echo "=== Test: Snapshot preserves only latest pre-deploy state ==="
# After rollback, do another snapshot + deploy cycle to ensure previous/ gets replaced
do_snapshot  # now snapshots v1 (the current state after rollback)
deploy_v2    # deploy v2 again

assert_eq "snapshot has v1 (post-rollback)" "api-v1" "$(cat "$TEST_DIR/previous/api-dist/index.js")"
assert_eq "snapshot web release is v1" "releases/v1" "$(cat "$TEST_DIR/previous/web-release.txt")"
assert_eq "app has v2 again" "api-v2" "$(cat "$TEST_DIR/app/apps/api/dist/index.js")"

# =============================================================================
echo ""
echo "=== Test: Rollback fails gracefully when the previous release is gone ==="
setup
do_snapshot
deploy_v2
rm -rf "$TEST_DIR/app/apps/web/releases/v1"   # e.g. pruned by the retention

ROLLBACK_OUTPUT=$(do_rollback 2>&1 || true)
assert_eq "reports incomplete snapshot" \
  "Snapshot is incomplete (missing api-dist or the previous web release). Cannot rollback." \
  "$ROLLBACK_OUTPUT"
assert_eq "web untouched" "web-v2" "$(cat "$TEST_DIR/app/apps/web/dist/index.html")"
assert_eq "api untouched" "api-v2" "$(cat "$TEST_DIR/app/apps/api/dist/index.js")"

# =============================================================================
echo ""
echo "=== Test: A dangling web-dist symlink is not a usable snapshot ==="
# What `cp -r dist previous/web-dist` left once dist became a symlink.
setup
do_snapshot
: > "$TEST_DIR/previous/web-release.txt"
ln -s releases/v1 "$TEST_DIR/previous/web-dist"
deploy_v2

ROLLBACK_OUTPUT=$(do_rollback 2>&1 || true)
assert_eq "refuses the dangling copy" \
  "Snapshot is incomplete (missing api-dist or the previous web release). Cannot rollback." \
  "$ROLLBACK_OUTPUT"
assert_eq "web still v2" "web-v2" "$(cat "$TEST_DIR/app/apps/web/dist/index.html")"

# =============================================================================
echo ""
echo "=== Test: Rollback from a pre-release-layout snapshot (full web-dist copy) ==="
setup
do_snapshot
: > "$TEST_DIR/previous/web-release.txt"   # dist was a real dir when it was taken
mkdir -p "$TEST_DIR/previous/web-dist/assets"
echo "web-legacy" > "$TEST_DIR/previous/web-dist/index.html"
echo "asset-legacy" > "$TEST_DIR/previous/web-dist/assets/main.js"
deploy_v2

do_rollback
LIVE=$(readlink "$TEST_DIR/app/apps/web/dist")
assert_eq "dist is a symlink into a rollback release" "releases/rollback-" "${LIVE%%[0-9]*}"
assert_eq "web restored from the copy" "web-legacy" "$(cat "$TEST_DIR/app/apps/web/dist/index.html")"
assert_eq "asset restored from the copy" "asset-legacy" "$(cat "$TEST_DIR/app/apps/web/dist/assets/main.js")"

# =============================================================================
echo ""
echo "=== Test: Rollback when dist is still a real dir ==="
setup
do_snapshot
deploy_v2
rm "$TEST_DIR/app/apps/web/dist"
mkdir -p "$TEST_DIR/app/apps/web/dist"
echo "web-manual" > "$TEST_DIR/app/apps/web/dist/index.html"

do_rollback
assert_eq "dist points back at v1" "releases/v1" "$(readlink "$TEST_DIR/app/apps/web/dist")"
assert_eq "real dir moved aside, not deleted" "web-manual" \
  "$(cat "$TEST_DIR"/app/apps/web/releases/pre-rollback-*/index.html)"

# =============================================================================
echo ""
echo "=== Test: Snapshot works when no previous dist exists (first deploy) ==="
cleanup
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
echo "=== Test: Rollback leaves no v2 files visible through dist ==="
setup
do_snapshot

# Deploy v2 with an extra file that didn't exist in v1
deploy_v2
echo "stale-asset" > "$TEST_DIR/app/apps/web/dist/assets/stale.js"
echo "extra-api-file" > "$TEST_DIR/app/apps/api/dist/extra.js"

do_rollback

assert_file_not_exists "v2 web asset not served" "$TEST_DIR/app/apps/web/dist/assets/stale.js"
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
