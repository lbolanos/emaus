#!/bin/bash
# Obtain (or renew) a Let's Encrypt certificate for emaus.cc using the
# DNS-01 challenge via Cloudflare. Required instead of HTTP-01 because
# Cloudflare proxies port 80 and would intercept the challenge.
#
# Prereqs:
#   - CLOUDFLARE_API_TOKEN env var (permission: Zone:DNS:Edit on emaus.cc)
#   - DOMAIN env var (default: emaus.cc)
#
# Usage:
#   export CLOUDFLARE_API_TOKEN=xxx
#   sudo -E ./setup-cert-dns01.sh

set -euo pipefail

DOMAIN="${DOMAIN:-emaus.cc}"
CREDENTIALS_FILE="/root/.cloudflare.ini"

if [ "$(id -u)" -ne 0 ]; then
    echo "ERROR: must run as root (certbot needs /etc/letsencrypt access)" >&2
    exit 1
fi

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
    echo "ERROR: CLOUDFLARE_API_TOKEN env var not set" >&2
    exit 1
fi

echo "Installing certbot + cloudflare plugin..."
apt-get update -qq
apt-get install -y certbot python3-certbot-dns-cloudflare

echo "Writing Cloudflare credentials to ${CREDENTIALS_FILE} (mode 600)..."
cat > "${CREDENTIALS_FILE}" <<EOF
dns_cloudflare_api_token = ${CLOUDFLARE_API_TOKEN}
EOF
chmod 600 "${CREDENTIALS_FILE}"

echo "Requesting cert for ${DOMAIN} and www.${DOMAIN}..."
certbot certonly \
    --dns-cloudflare \
    --dns-cloudflare-credentials "${CREDENTIALS_FILE}" \
    --dns-cloudflare-propagation-seconds 30 \
    --non-interactive \
    --agree-tos \
    --email "admin@${DOMAIN}" \
    -d "${DOMAIN}" \
    -d "www.${DOMAIN}"

echo "Cert obtained:"
certbot certificates -d "${DOMAIN}"

echo ""
echo "Next: configure nginx to use /etc/letsencrypt/live/${DOMAIN}/fullchain.pem and privkey.pem"
echo "Renewal is automatic via /etc/cron.d/certbot (DNS-01 keeps working through Cloudflare proxy)."
