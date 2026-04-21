# `deploy/lightsail/` — migration target

Scripts and notes for running Emaus on an AWS Lightsail `micro_3_0` instance
(1 GB RAM, 2 vCPU, 40 GB SSD, bundled IPv4 + 2 TB transfer = $7/mo).

## Files

| File | Purpose |
|---|---|
| `setup-cert-dns01.sh` | Obtain Let's Encrypt cert via Cloudflare DNS-01 (HTTP-01 would be intercepted by the Cloudflare proxy) |
| `deploy-lightsail.sh` | Thin wrapper over `deploy/aws/deploy-aws.sh` with Lightsail-specific env (absolute DB path, `SEED_FORCE=false`) |
| `README.md` | This file |

The base bootstrap (node, pnpm, nginx, pm2, certbot) is reused from
`deploy/aws/setup-aws.sh` — Ubuntu 22.04 on Lightsail is identical to what
that script already targets.

## End-to-end migration workflow

Assumes `infra/` was already applied (`terraform apply` created the instance,
static IP, IAM user, and the Cloudflare Worker).

### 1. Get credentials from Terraform outputs

```bash
cd infra
terraform output lightsail_public_ip
terraform output -raw app_iam_access_key_id
terraform output -raw app_iam_secret_access_key
```

### 2. Download the default SSH key pair (one-time)

```bash
aws lightsail download-default-key-pair \
  --region us-east-2 --profile emaus \
  --query 'privateKeyBase64' --output text \
  | base64 -d > ~/.ssh/lightsail-default.pem
chmod 600 ~/.ssh/lightsail-default.pem
```

### 3. Bootstrap the host

```bash
LIGHTSAIL_IP=$(terraform -chdir=infra output -raw lightsail_public_ip)

# Copy setup scripts to the instance
scp -i ~/.ssh/lightsail-default.pem \
  deploy/aws/setup-aws.sh \
  deploy/lightsail/setup-cert-dns01.sh \
  ubuntu@${LIGHTSAIL_IP}:/tmp/

# Run bootstrap (installs node 20, pnpm, nginx, pm2)
ssh -i ~/.ssh/lightsail-default.pem ubuntu@${LIGHTSAIL_IP} \
  'sudo bash /tmp/setup-aws.sh'

# Obtain the Let's Encrypt cert via Cloudflare DNS-01
ssh -i ~/.ssh/lightsail-default.pem ubuntu@${LIGHTSAIL_IP} \
  "sudo CLOUDFLARE_API_TOKEN='<token-with-Zone:DNS:Edit>' \
       DOMAIN=emaus.cc \
       bash /tmp/setup-cert-dns01.sh"
```

### 4. Copy the SQLite database from the current EC2

```bash
# Consistent backup on the source (avoids mid-write corruption)
ssh ubuntu@3.138.49.105 \
  'cd /var/www/emaus/apps/api && sqlite3 database.sqlite ".backup /tmp/db.bak"'

# Transfer
scp ubuntu@3.138.49.105:/tmp/db.bak /tmp/db.bak
scp -i ~/.ssh/lightsail-default.pem /tmp/db.bak ubuntu@${LIGHTSAIL_IP}:/tmp/db.bak

# Install on Lightsail
ssh -i ~/.ssh/lightsail-default.pem ubuntu@${LIGHTSAIL_IP} <<'EOF'
sudo mkdir -p /var/www/emaus/apps/api
sudo mv /tmp/db.bak /var/www/emaus/apps/api/database.sqlite
sudo chown www-data:www-data /var/www/emaus/apps/api/database.sqlite
EOF
```

### 5. Write `.env.production` on the Lightsail host

Copy the existing `.env.production` from the old EC2 and replace these
fields with the Terraform outputs:

```
DB_DATABASE=/var/www/emaus/apps/api/database.sqlite
SEED_FORCE=false
MIGRATIONS_AUTO_RUN=true
AWS_ACCESS_KEY_ID=<app_iam_access_key_id from terraform output>
AWS_SECRET_ACCESS_KEY=<app_iam_secret_access_key from terraform output>
```

All other values (SESSION_SECRET, SMTP_*, GOOGLE_*, RECAPTCHA_*,
ANTHROPIC_API_KEY) are copied verbatim from the current EC2.

### 6. Run the first deploy

```bash
ssh -i ~/.ssh/lightsail-default.pem ubuntu@${LIGHTSAIL_IP}

# On the instance:
cd /tmp && rm -rf emaus && git clone https://github.com/lbolanos/emaus.git
cd emaus && export RELEASE_TAG=<latest-tag> DOMAIN_NAME=emaus.cc
bash deploy/lightsail/deploy-lightsail.sh
```

### 7. Test locally (before DNS cutover)

On your laptop, add an `/etc/hosts` entry to hit the Lightsail directly:

```
<lightsail-ip>   emaus.cc  www.emaus.cc
```

Then browse `https://emaus.cc` and verify login, participant list, sending
a test email, avatar upload.

Remove the `/etc/hosts` line once validated.

### 8. DNS cutover

In Cloudflare Dashboard → DNS → `A emaus.cc`, change Content from
`3.138.49.105` to the Lightsail static IP. Keep proxy (orange cloud) on.
Propagation is ~instant through the Cloudflare proxy.

### 9. Monitor for a week

- `pm2 logs emaus-api`
- `sudo tail -f /var/log/nginx/access.log`
- `aws lightsail get-instance-metric-data --instance-name emaus-prod \
     --metric-name CPUUtilization --period 300 --start-time ... --end-time ... \
     --statistics Average --unit Percent --region us-east-2 --profile emaus`
- Cloudflare Dashboard → Workers → `emaus-failover` → Invocations (should
  stay near zero; rising count means the origin is failing)

Keep the old EC2 **stopped** (not terminated) for a week as rollback. If
anything goes wrong, flip the Cloudflare A record back to `3.138.49.105`
and `aws ec2 start-instances` the old host.

### 10. Decommission the old EC2 (after a clean week)

```bash
aws ec2 terminate-instances --instance-ids i-011986d465e7c8f53 \
  --region us-east-2 --profile emaus
aws ec2 release-address --allocation-id eipalloc-0c926bec959d0098a \
  --region us-east-2 --profile emaus
```

Conservar `snap-0953f324c12a7294d` (AMI `emaus-backup-20260317-2312`) como
backup histórico.

## Related

- [`../aws/`](../aws/) — upstream scripts reused unchanged
- [`/infra/`](../../infra/) — Terraform module (Lightsail + Lambda + Cloudflare Worker)
- [`/docs/AWS_COST_GUIDE.md`](../../docs/AWS_COST_GUIDE.md) — cost breakdown
