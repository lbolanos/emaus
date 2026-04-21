#!/bin/bash
# Export the Cloudflare DNS zone for emaus.cc to a BIND-format file
# committed as documentary backup (not managed by Terraform).
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=xxx    # needs Zone:DNS:Read on emaus.cc
#   ./dns-backup.sh
#
# The output file (infra/dns-backup.bind) is safe to commit: DKIM tokens
# and SPF are already public DNS. It contains no secrets.

set -euo pipefail

ZONE_ID="${ZONE_ID:-76f81f5e48b75a90923775f24880309f}"
OUTPUT="${OUTPUT:-$(dirname "$0")/dns-backup.bind}"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "ERROR: CLOUDFLARE_API_TOKEN env var not set" >&2
    echo "Create one at: https://dash.cloudflare.com/profile/api-tokens" >&2
    echo "Permissions: Zone:DNS:Read on emaus.cc" >&2
    exit 1
fi

echo "Exporting zone ${ZONE_ID} to ${OUTPUT}..."
curl -sSf \
    "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/export" \
    -H "Authorization: Bearer ${CLOUDFLARE_API_TOKEN}" \
    > "${OUTPUT}"

# Prepend metadata header (ignored by BIND, useful for humans/git)
TMP=$(mktemp)
{
    echo "; Cloudflare DNS export for emaus.cc"
    echo "; Exported: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
    echo "; Zone ID:  ${ZONE_ID}"
    echo ";"
    echo "; Re-import via Cloudflare dashboard → DNS → Import DNS Records"
    echo ";"
    cat "${OUTPUT}"
} > "${TMP}"
mv "${TMP}" "${OUTPUT}"

echo "Done. Records:"
grep -cE "^[^;]" "${OUTPUT}" | xargs -I{} echo "  {} non-comment lines"
echo ""
echo "Preview:"
grep -v "^;" "${OUTPUT}" | head -20
