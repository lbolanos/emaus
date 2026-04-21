# `infra/` — AWS + Cloudflare infrastructure-as-code

Terraform module that provisions:

1. **Lightsail application server** (`emaus-prod`) — replaces the legacy EC2
   `t3a.micro`. Bundle `micro_3_0`: 1 GB RAM, 2 vCPU, 40 GB SSD, 2 TB transfer,
   bundled IPv4 — **$7/mo**.
2. **Auto-stop scheduler** — Lambda + two EventBridge schedules that stop the
   Lightsail instance Mon–Fri at 23:00 CDMX and start it again at 07:00 CDMX,
   skipping the stop when a retreat is currently active.
3. **Cloudflare failover Worker** — intercepts requests to `emaus.cc`; if the
   origin is down (5xx or timeout), serves a Spanish maintenance page (503)
   instead of Cloudflare's default error screen.

Region: `us-east-2` · Account: `585853725478` · AWS profile: `emaus` ·
Cloudflare zone: `76f81f5e48b75a90923775f24880309f` (`emaus.cc`).

## Architecture

```
  Users ── HTTPS ─► Cloudflare edge (proxy, Full strict)
                    │
                    ├─► Worker "emaus-failover"
                    │     ├─ fetch(origin) with 10s timeout
                    │     ├─ 5xx / error → serve maintenance HTML (503)
                    │     └─ 2xx/3xx/4xx → passthrough
                    │
                    ▼
         Lightsail "emaus-prod"  (us-east-2a, 18.116.102.104)
           ├── nginx + LE cert (DNS-01 via Cloudflare)
           ├── pm2 → node dist/index.js
           └── /var/www/emaus/apps/api/database.sqlite

  git push master ─► GitHub Actions "Deploy to Production"
                        ├── build: lint + test:field-mapping + pnpm build
                        └── deploy: SSH (LIGHTSAIL_SSH_PRIVATE_KEY) to
                                    LIGHTSAIL_HOST, scp dist, backup DB,
                                    pnpm install, migrations, pm2 restart

  EventBridge Scheduler (default) — currently DISABLED
    ├── emaus-ec2-scheduler-stop   cron(0 23 ? * MON-FRI *)  tz: America/Mexico_City
    └── emaus-ec2-scheduler-start  cron(0  7 ? * MON-FRI *)  tz: America/Mexico_City
         │
         ▼ invoke
     Lambda "emaus-ec2-scheduler" (python3.12, 128 MB)
         ├── HTTPS GET https://emaus.cc/api/retreats/active  (stop only)
         └── boto3.client('lightsail').{stop,start}_instance(name=emaus-prod)
```

Lambda + schedules quedan provisionadas pero **deshabilitadas** —
Lightsail cobra igual parado o corriendo, por lo que el auto-stop no
ahorra dinero. Se dejan como código para reactivar si se vuelve a EC2
con precio por hora.

The Lambda fail-safes on any retreat-check error (timeout, 4xx, 5xx, invalid
JSON) by **skipping the stop** — the instance only stops when the endpoint
positively returns `{ "active": false }`.

## Files

| File | Purpose |
|---|---|
| `main.tf` | Terraform version + providers (`aws`, `archive`, `cloudflare`) |
| `variables.tf` | Inputs (Lightsail, Lambda, Cloudflare) |
| `terraform.tfvars.example` | Template for `terraform.tfvars` (git-ignored) |
| `lightsail.tf` | Lightsail instance, static IP, port rules, app IAM user |
| `lambda.tf` | Lambda function, CloudWatch log group, IAM role + Lightsail policy |
| `scheduler.tf` | EventBridge schedules + their IAM role |
| `cloudflare.tf` | Worker script + routes for `emaus.cc/*` and `www.emaus.cc/*` |
| `workers/failover.js` | ES-module Worker source (maintenance page) |
| `lambda_src/handler.py` | Lambda handler (stdlib + boto3 lightsail client) |
| `outputs.tf` | Lightsail IP, IAM access keys (sensitive), Lambda/Worker ARNs |
| `.gitignore` | Excludes state, tfvars, zipped artifact |

## Resources created

**Lightsail + app IAM** (5):
- `aws_lightsail_instance.emaus` — `emaus-prod`
- `aws_lightsail_static_ip.emaus` — `emaus-ip`
- `aws_lightsail_static_ip_attachment.emaus`
- `aws_lightsail_instance_public_ports.emaus` — 22, 80, 443
- `aws_iam_user.app` + `aws_iam_user_policy.app` + `aws_iam_access_key.app` — S3 `emaus-media` access

**Scheduler Lambda** (9):
- `aws_iam_role.lambda` / `aws_iam_role_policy.lambda_lightsail` (scoped to `arn:aws:lightsail:us-east-2:585853725478:Instance/*`) / `aws_iam_role_policy_attachment.lambda_basic`
- `aws_lambda_function.ec2_scheduler`
- `aws_cloudwatch_log_group.lambda` (14-day retention)
- `aws_iam_role.scheduler` / `aws_iam_role_policy.scheduler_invoke`
- `aws_scheduler_schedule.stop` + `aws_scheduler_schedule.start`

**Cloudflare** (3):
- `cloudflare_workers_script.failover` — `emaus-failover`
- `cloudflare_workers_route.apex` — `emaus.cc/*`
- `cloudflare_workers_route.www` — `www.emaus.cc/*`

## Prerequisites

- Terraform ≥ 1.5 (tested with 1.9.8)
- AWS CLI with profile `emaus` configured
- A Cloudflare API token with permissions
  `Workers Scripts:Edit`, `Workers Routes:Edit`, `Zone:DNS:Read` (used by
  the `cloudflare` provider here) — plus `Zone:DNS:Edit` (used separately by
  the certbot DNS-01 helper on the Lightsail host)
- Cloudflare **account id** (dashboard → right sidebar) — there is no
  default because it differs per user
- The API route `GET /api/retreats/active` reachable at `retreat_check_url`
  before enabling auto-stop (otherwise the Lambda fail-safes and never stops)

## Deploy

```bash
cd infra
cp terraform.tfvars.example terraform.tfvars
# edit terraform.tfvars — set cloudflare_account_id and cloudflare_api_token
/tmp/terraform init -upgrade
/tmp/terraform plan
/tmp/terraform apply
```

State is local (`terraform.tfstate`) and git-ignored.

## After `terraform apply` — read the sensitive outputs

```bash
terraform output lightsail_public_ip
terraform output -raw app_iam_access_key_id
terraform output -raw app_iam_secret_access_key
```

Write the access key + secret to the instance's `.env.production` under
`AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY`.

## Bootstrap the Lightsail host

Terraform only provisions an empty Ubuntu 22.04 image. Node, pnpm, nginx,
certbot, and pm2 are installed by running
[`deploy/aws/setup-aws.sh`](../deploy/aws/setup-aws.sh) on the host — it
works unchanged on Lightsail. See
[`deploy/lightsail/README.md`](../deploy/lightsail/README.md) for the full
migration workflow.

## Verify

```bash
# Lightsail is up
aws lightsail get-instance --instance-name emaus-prod --region us-east-2 --profile emaus \
  --query 'instance.{state:state.name,ip:publicIpAddress}'

# Scheduler
aws scheduler list-schedules --profile emaus --region us-east-2
aws scheduler get-schedule --name emaus-ec2-scheduler-stop  --profile emaus
aws scheduler get-schedule --name emaus-ec2-scheduler-start --profile emaus

# Worker
aws lambda invoke --function-name emaus-ec2-scheduler \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"stop"}' \
  --profile emaus /tmp/lambda-resp.json
cat /tmp/lambda-resp.json
```

Expected Lambda responses:

| Response | Meaning |
|---|---|
| `{"status":"skipped","reason":"retreat_active","retreats":[...]}` | Endpoint said a retreat is running — no stop |
| `{"status":"skipped","reason":"check_failed","error":"..."}` | Check failed (DNS, 4xx, 5xx, timeout) — fail-safe, no stop |
| `{"status":"ok","action":"stop","instance":"emaus-prod"}` | Endpoint said inactive — **instance stopped** |

## Test the failover Worker

```bash
# Pause nginx on the Lightsail host
ssh ubuntu@<lightsail-ip> sudo systemctl stop nginx
curl -I https://emaus.cc   # expect HTTP/2 503 with cache-control: no-store
# Restore
ssh ubuntu@<lightsail-ip> sudo systemctl start nginx
curl -I https://emaus.cc   # back to 200
```

Invocation count is visible in Cloudflare Dashboard → Workers → `emaus-failover`.
Free tier: 100,000/day.

## Tail Lambda logs

```bash
aws logs tail /aws/lambda/emaus-ec2-scheduler --follow --profile emaus
```

## Pause / resume the scheduler without destroying

Simplest: toggle `state = "DISABLED"` on the two schedule resources and
re-apply.

Or one-shot via AWS CLI:

```bash
aws scheduler update-schedule --name emaus-ec2-scheduler-stop \
  --state DISABLED --profile emaus \
  --schedule-expression "cron(0 23 ? * MON-FRI *)" \
  --schedule-expression-timezone "America/Mexico_City" \
  --flexible-time-window Mode=OFF \
  --target "$(aws scheduler get-schedule --name emaus-ec2-scheduler-stop --profile emaus --query Target --output json)"
```

## DNS / CDN layer (managed in Cloudflare dashboard)

The zone `emaus.cc` lives on Cloudflare Free plan. DNS records are managed
**manually in the dashboard**, not in Terraform — only the failover Worker
and its routes are in code here.

A BIND-format snapshot of the zone is kept in `dns-backup.bind` as
documentary backup (re-importable via Cloudflare dashboard → DNS → Import
DNS Records). Regenerate it any time with:

```bash
export CLOUDFLARE_API_TOKEN=<token-with-Zone:DNS:Read>
./dns-backup.sh
git add dns-backup.bind && git commit -m "chore(infra): refresh DNS snapshot"
```

The file contains no secrets (DKIM public keys and SPF are already public DNS).

- **Registrar**: Namecheap (domain + nameservers only)
- **Nameservers**: `ganz.ns.cloudflare.com`, `paislee.ns.cloudflare.com`
- **SSL mode**: Full (strict) · Universal SSL active · Min TLS 1.2
- **Always Use HTTPS**: on · Automatic HTTPS Rewrites: on

DNS records currently in the zone:

| Type | Name | Content | Proxy |
|---|---|---|---|
| A | `emaus.cc` | `<lightsail-ip>` (was `3.138.49.105`) | Proxied (orange) |
| CNAME | `www` | `emaus.cc` | Proxied |
| CNAME | `<token>._domainkey` × 3 | `<token>.dkim.amazonses.com` | DNS only (SES) |
| MX | `mail` | `feedback-smtp.us-east-2.amazonses.com` | DNS only |
| TXT | `_dmarc` | `v=DMARC1; p=none;` | DNS only |
| TXT | `mail` | `v=spf1 include:amazonses.com ~all` | DNS only |

## Cost impact

- **Scheduler**: $0/mo (Lambda + EventBridge always-free)
- **Worker**: $0/mo (100k requests/day free)
- **Lightsail**: $7/mo flat (compute + IPv4 + 2 TB transfer)
- **App IAM user**: free

Total managed-by-Terraform cost: **$7/mo**.

See [`docs/AWS_COST_GUIDE.md`](../docs/AWS_COST_GUIDE.md) for the full
pre/post-migration breakdown.

## GitHub Actions — deploy automation

Push a `master` dispara `.github/workflows/deploy-production.yml` que
construye, sube al host Lightsail por SSH, hace backup de DB, instala
deps y reinicia PM2. Los secrets requeridos en el repo
(`lbolanos/emaus` → Settings → Secrets and variables → Actions):

| Secret | Valor | Notas |
|---|---|---|
| `LIGHTSAIL_HOST` | `18.116.102.104` | IP estática del bundle |
| `LIGHTSAIL_USER` | `ubuntu` | default blueprint Ubuntu 22.04 |
| `LIGHTSAIL_SSH_PRIVATE_KEY` | contenido del `.pem` | llave default de Lightsail `us-east-2` |
| `DOMAIN_NAME` | `emaus.cc` | usado para health check post-deploy |
| `VITE_GOOGLE_MAPS_API_KEY` | (secret) | inyectado en `runtime-config.js` |
| `VITE_RECAPTCHA_SITE_KEY` | (secret) | inyectado en `runtime-config.js` |

Para actualizar los secrets desde terminal (con `gh` autenticado con
fine-grained token que tenga `Secrets: Read and write`):

```bash
gh secret set LIGHTSAIL_HOST --repo lbolanos/emaus --body "<ip>"
gh secret set LIGHTSAIL_SSH_PRIVATE_KEY --repo lbolanos/emaus < ~/.ssh/lightsail-emaus.pem
```

Los secrets viejos `EC2_HOST` / `EC2_USER` / `EC2_SSH_PRIVATE_KEY` fueron
eliminados el 2026-04-21 durante el fix post-migración (ver
[`docs/LIGHTSAIL_MIGRATION_NOTES.md`](../docs/LIGHTSAIL_MIGRATION_NOTES.md) §10).

## Related

- [`/deploy/lightsail/`](../deploy/lightsail/) — host bootstrap, cert, deploy scripts
- [`/deploy/aws/`](../deploy/aws/) — upstream scripts (still used; Lightsail reuses setup-aws.sh)
- [`/.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml) — CI/CD deploy pipeline
- [`/docs/AWS_COST_GUIDE.md`](../docs/AWS_COST_GUIDE.md) — cost breakdown and monitoring
- API route: `apps/api/src/routes/retreatRoutes.ts` → `GET /api/retreats/active`

---

# Gotchas conocidos

Ver [`/docs/LIGHTSAIL_MIGRATION_NOTES.md`](../docs/LIGHTSAIL_MIGRATION_NOTES.md)
para el detalle completo de cada uno. Resumen rápido:

1. **`port_info` drift** — provider compara byte-a-byte con defaults del API,
   genera destroy+create cada plan. Mitigado con `lifecycle { ignore_changes = [port_info] }`.
2. **`force-stop` limpia puertos** — tras un stop+start, los port rules de
   80/443 se resetean a sólo 22. Hay que reabrir con `aws lightsail open-instance-public-ports`.
3. **Release tarball sin `.node`** — el `build-release.yml` genera tarball sin
   binarios nativos. Workaround actual: copiar prebuilts del host previo.
4. **`runtime-config.js` se genera en deploy** — no viene del build, lo inyecta
   `deploy-aws.sh`. Si haces scp manual del dist, hay que generarlo aparte.
5. **CSP en nginx necesita `'unsafe-eval'`** — Vue i18n lo requiere. Ya está
   aplicado.
6. **`--build-from-source` tumba la Lightsail** — 1 GB RAM no alcanza para
   compilar better-sqlite3 amalgamation en C++. Nunca compilar módulos nativos
   grandes in-place; copiar prebuilts.

# Pendientes por resolver

## 1. ~~Cutover DNS~~ ✓ (2026-04-21)

A record ahora apunta a `18.116.102.104`. EC2 viejo `stopped`.

## 2. Decommissioning de la EC2 antigua

Después de 1 semana sin incidentes en Lightsail:

```bash
aws ec2 terminate-instances --instance-ids i-011986d465e7c8f53 \
  --region us-east-2 --profile emaus
aws ec2 release-address --allocation-id eipalloc-0c926bec959d0098a \
  --region us-east-2 --profile emaus
```

Conservar `snap-0953f324c12a7294d` (AMI `emaus-backup-20260317-2312`) como
backup histórico.

## 3. AWS Budget activity reward ($20 USD)

El budget `Emaus-Monthly-Budget` (creado 2026-04-20, $40/mes) debería
acreditar $20 USD, pero al 2026-04-20 aún marcaba `NOT_STARTED`. AWS tarda
horas/días en detectarlo. Verificar con:

```bash
aws freetier list-account-activities --profile emaus --region us-east-1 \
  --query 'activities[?contains(title, `budget`)]'
```

## 4. Actividades pendientes de Free Plan ($80 USD posibles)

Las 4 actividades restantes (Bedrock, Lambda webapp, Aurora/RDS, EC2 launch)
dan $20 USD cada una. **Cuidado con Aurora/RDS**: puede generar costo extra
si no se apaga inmediatamente después.

## 5. Cost Anomaly Detection (no configurado)

Configurar alerta gratuita para detectar gastos fuera de lo normal.

```bash
aws ce get-anomaly-monitors --profile emaus  # verificar si existe
```

## 6. Migración de secretos a AWS Secrets Manager (post-migración, opcional)

Actualmente `.env.production` vive en disco con credenciales IAM y OAuth en
plaintext. Mejor: mover a Secrets Manager + script de boot que las baja.
Costo: $0.40/secret/mes. No es bloqueante pero es mejor práctica.

## 7. Fix del pipeline de release (alta prioridad antes del próximo deploy)

El `build-release.yml` genera un tarball sin los `.node` nativos → cualquier
deploy limpio requiere copiar prebuilts de otro host. Opciones:

- **A (simple)**: en `deploy-aws.sh`, tras extraer el tarball, correr
  `pnpm install --prod --frozen-lockfile` para que npm/pnpm descargue los
  prebuilt binarios desde el binary service (bcrypt, better-sqlite3 los tienen).
- **B (completa)**: en `build-release.yml`, incluir `node_modules/` COMPLETO
  (incluyendo `.node`) en el tarball. Añade ~20 MB pero deploys serán atómicos.
- **C (robusta)**: migrar a Docker build-on-target.

Ver [`/docs/LIGHTSAIL_MIGRATION_NOTES.md`](../docs/LIGHTSAIL_MIGRATION_NOTES.md) §5.

## 8. Incluir generación de `runtime-config.js` en `deploy-lightsail.sh`

El wrapper actual no replica el paso `cat > runtime-config.js << EOF` de
`deploy-aws.sh`. Por ahora se regenera manualmente tras deploys locales,
pero el script debería hacerlo siempre.
