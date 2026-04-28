#!/usr/bin/env bash
# End-to-end smoke test for the Minuto a Minuto feature.
#
# Requires: API running on $API (default http://localhost:3001), bash, curl, jq.
# Usage:
#   API=http://localhost:3001 EMAIL=admin@example.com PASSWORD=secret \
#     ./apps/api/scripts/e2e-minuto-a-minuto.sh
#
# The script logs in, picks the first house, creates a throwaway retreat with
# the default schedule template materialized, lists items, asserts a few
# invariants, exercises the schedule item lifecycle (start/complete/shift),
# pings resolve-santisimo, then deletes the retreat.

set -eo pipefail

API="${API:-http://localhost:3001}"
EMAIL="${EMAIL:-}"
PASSWORD="${PASSWORD:-}"
COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

if [[ -z "$EMAIL" || -z "$PASSWORD" ]]; then
  echo "ERROR: set EMAIL and PASSWORD env vars (admin or superadmin)" >&2
  exit 2
fi

step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ok()   { printf '   \033[32m✓\033[0m %s\n' "$*"; }
fail() { printf '   \033[31m✗\033[0m %s\n' "$*"; exit 1; }

req() {
  # req METHOD PATH [JSON_BODY]
  local method="$1"; shift
  local path="$1"; shift
  local body="${1:-}"
  if [[ -n "$body" ]]; then
    curl -sS -b "$COOKIES" -c "$COOKIES" \
      -H 'Content-Type: application/json' \
      ${CSRF:+-H "x-csrf-token: $CSRF"} \
      -X "$method" "$API$path" \
      -d "$body"
  else
    curl -sS -b "$COOKIES" -c "$COOKIES" \
      ${CSRF:+-H "x-csrf-token: $CSRF"} \
      -X "$method" "$API$path"
  fi
}

step "1. Login as $EMAIL"
LOGIN_RESP=$(req POST '/api/auth/login' "$(jq -n --arg e "$EMAIL" --arg p "$PASSWORD" '{email:$e,password:$p}')")
echo "$LOGIN_RESP" | jq -e '(.id // .user.id)' >/dev/null 2>&1 || fail "login failed: $LOGIN_RESP"
ok "logged in"

# Subsequent state-changing requests need a CSRF token
CSRF=$(curl -sS -b "$COOKIES" -c "$COOKIES" "$API/api/csrf-token" | jq -r '.csrfToken // empty')
[[ -n "$CSRF" ]] || fail "could not obtain CSRF token"
ok "csrf token acquired"

step "2. Pick the first available house"
HOUSE_ID=$(req GET '/api/houses' | jq -r '.[0].id // empty')
[[ -n "$HOUSE_ID" ]] || fail "no houses found"
ok "house: $HOUSE_ID"

step "3. Pick the default schedule template set"
SET_ID=$(req GET '/api/schedule-templates/sets' | jq -r '.[] | select(.isDefault==true) | .id' | head -1)
SET_NAME=$(req GET '/api/schedule-templates/sets' | jq -r --arg id "$SET_ID" '.[] | select(.id==$id) | .name')
[[ -n "$SET_ID" ]] || fail "no default schedule_template_set; the seeder probably didn't run"
ok "template set: $SET_NAME ($SET_ID)"

step "4. Create a throwaway retreat"
TODAY=$(date +%Y-%m-%d)
SLUG="e2e$(date +%s)"
RETREAT_RESP=$(req POST '/api/retreats' "$(jq -n \
  --arg parish "E2E Test" \
  --arg start "$TODAY" \
  --arg end "$TODAY" \
  --arg houseId "$HOUSE_ID" \
  --arg slug "$SLUG" \
  '{parish:$parish, startDate:$start, endDate:$end, houseId:$houseId, slug:$slug, isPublic:false, roleInvitationEnabled:true, notifyParticipant:false, notifyInviter:false}')")
RETREAT_ID=$(echo "$RETREAT_RESP" | jq -r '.id // empty')
[[ -n "$RETREAT_ID" ]] || fail "could not create retreat: $RETREAT_RESP"
ok "retreat: $RETREAT_ID (slug=$SLUG)"

cleanup() {
  if [[ -n "$RETREAT_ID" ]]; then
    step "X. Cleanup: delete retreat $RETREAT_ID"
    req DELETE "/api/retreats/$RETREAT_ID" >/dev/null || true
    ok "deleted"
  fi
  rm -f "$COOKIES"
}
trap cleanup EXIT

step "5. Materialize the schedule from template"
MAT_RESP=$(req POST "/api/schedule/retreats/$RETREAT_ID/materialize" \
  "$(jq -n --arg base "$TODAY" --arg setId "$SET_ID" '{baseDate:$base, templateSetId:$setId, clearExisting:true}')")
COUNT=$(echo "$MAT_RESP" | jq 'length')
[[ "$COUNT" -ge 30 ]] || fail "expected ≥30 items, got $COUNT: $MAT_RESP"
ok "materialized $COUNT items"

step "6. List items via GET"
ITEMS=$(req GET "/api/schedule/retreats/$RETREAT_ID/items")
LIST_COUNT=$(echo "$ITEMS" | jq 'length')
[[ "$LIST_COUNT" == "$COUNT" ]] || fail "list mismatch: $LIST_COUNT vs $COUNT"
ok "GET returns $LIST_COUNT items"

FIRST_ID=$(echo "$ITEMS" | jq -r '.[0].id')
ok "first item id: $FIRST_ID"

step "7. Start, then complete the first item"
req POST "/api/schedule/items/$FIRST_ID/start" >/dev/null
STATUS=$(req GET "/api/schedule/retreats/$RETREAT_ID/items" | jq -r --arg id "$FIRST_ID" '.[] | select(.id==$id) | .status')
[[ "$STATUS" == "active" ]] || fail "expected active, got $STATUS"
ok "status=active"

req POST "/api/schedule/items/$FIRST_ID/complete" >/dev/null
STATUS=$(req GET "/api/schedule/retreats/$RETREAT_ID/items" | jq -r --arg id "$FIRST_ID" '.[] | select(.id==$id) | .status')
[[ "$STATUS" == "completed" ]] || fail "expected completed, got $STATUS"
ok "status=completed"

step "8. Shift item +5 minutes"
SECOND_ID=$(echo "$ITEMS" | jq -r '.[1].id')
BEFORE=$(req GET "/api/schedule/retreats/$RETREAT_ID/items" | jq -r --arg id "$SECOND_ID" '.[] | select(.id==$id) | .startTime')
req POST "/api/schedule/items/$SECOND_ID/shift" '{"minutesDelta":5,"propagate":false}' >/dev/null
AFTER=$(req GET "/api/schedule/retreats/$RETREAT_ID/items" | jq -r --arg id "$SECOND_ID" '.[] | select(.id==$id) | .startTime')
[[ "$BEFORE" != "$AFTER" ]] || fail "shift didn't change startTime"
ok "shift applied: $BEFORE → $AFTER"

step "9. Trigger resolve-santisimo (no inscritos hoy, debe responder OK)"
RES=$(req POST "/api/schedule/retreats/$RETREAT_ID/resolve-santisimo")
echo "$RES" | jq -e '.mealSlots != null' >/dev/null || fail "resolve-santisimo failed: $RES"
ok "mealSlots=$(echo "$RES" | jq '.mealSlots') · angelitos=$(echo "$RES" | jq '.angelitosAssigned') · unresolved=$(echo "$RES" | jq '.unresolvedSlots | length')"

step "10. Bell"
req POST "/api/schedule/retreats/$RETREAT_ID/bell" '{"message":"e2e"}' >/dev/null
ok "bell pinged"

printf '\n\033[1;32m✅ E2E PASSED\033[0m\n'
