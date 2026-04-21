#!/bin/bash
# Deploy Emaus to an AWS Lightsail instance.
#
# Thin wrapper around ../aws/deploy-aws.sh that sets Lightsail-specific
# defaults:
#   - absolute path for the SQLite DB (/var/www/emaus/apps/api/database.sqlite)
#   - SEED_FORCE=false (the DB is copied over from the previous EC2, not seeded)
#   - MIGRATIONS_AUTO_RUN=true (safe — runs pending migrations only)
#
# Prereqs (run once before the first deploy):
#   1. Instance provisioned via: cd infra && terraform apply
#   2. Host bootstrapped:   ./setup-lightsail.sh (installs node/pnpm/nginx/pm2)
#   3. Cert obtained:       sudo -E CLOUDFLARE_API_TOKEN=xxx ./setup-cert-dns01.sh
#   4. DB copied from old EC2 (see ../../docs/AWS_COST_GUIDE.md for the sqlite3 .backup recipe)
#
# Usage:
#   export RELEASE_TAG=v1.2.3
#   export DOMAIN_NAME=emaus.cc
#   ./deploy-lightsail.sh

set -euo pipefail

HERE="$(cd "$(dirname "$0")" && pwd)"
AWS_DEPLOY="${HERE}/../aws/deploy-aws.sh"

if [ ! -x "${AWS_DEPLOY}" ]; then
    echo "ERROR: upstream deploy script not found at ${AWS_DEPLOY}" >&2
    exit 1
fi

# Lightsail-specific env (exported so the child script picks them up via ${VAR})
export DOMAIN_NAME="${DOMAIN_NAME:-emaus.cc}"
export DB_DATABASE="${DB_DATABASE:-/var/www/emaus/apps/api/database.sqlite}"
export SEED_FORCE="${SEED_FORCE:-false}"
export MIGRATIONS_AUTO_RUN="${MIGRATIONS_AUTO_RUN:-true}"

# Marker for .deployment-info so we can tell which host type deployed it
export DEPLOYMENT_PLATFORM="lightsail"

echo "▸ Deploying to Lightsail host"
echo "  DOMAIN_NAME:         ${DOMAIN_NAME}"
echo "  DB_DATABASE:         ${DB_DATABASE}"
echo "  SEED_FORCE:          ${SEED_FORCE}"
echo "  MIGRATIONS_AUTO_RUN: ${MIGRATIONS_AUTO_RUN}"
echo "  RELEASE_TAG:         ${RELEASE_TAG:-<unset — deploy-aws.sh will prompt>}"
echo ""

exec "${AWS_DEPLOY}"
