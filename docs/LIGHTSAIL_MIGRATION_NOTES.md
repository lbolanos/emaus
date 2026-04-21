# Lightsail Migration — Notes & Runbook

Postmortem y runbook operativo de la migración de la EC2 `t3a.micro`
(`i-011986d465e7c8f53`) a AWS Lightsail `emaus-prod` (`micro_3_0`, 1 GB RAM).

**Fecha cutover**: 2026-04-20 (DNS) → 2026-04-21 (app funcional).

## Resumen

| Antes | Después |
|---|---|
| EC2 t3a.micro + EBS gp3 20 GB + EIP | Lightsail `micro_3_0` |
| ~$14/mo (compute + IP + EBS separados) | ~$7/mo (bundle: compute + IPv4 + 2 TB transfer) |
| DNS directo → EC2 | Cloudflare proxy → Lightsail |
| Let's Encrypt HTTP-01 | Let's Encrypt DNS-01 (vía Cloudflare API) |
| Deploy manual por scripts bash | Terraform (infra) + scripts bash (app) |
| Sin failover visible | Cloudflare Worker sirve página de mantenimiento en 5xx/timeout |

**Ahorro**: ~$7/mo (~$84/año).

## Issues encontrados durante la migración (y fixes)

### 1. Cloudflare account_id vs zone_id confundidos

La URL del dashboard `dash.cloudflare.com/<hex>/<domain>/...` contiene el
**account_id**, no el **zone_id**. Fácil confundirlos porque ambos son hex
de 32 caracteres.

**Cómo obtener los correctos**:
```bash
curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones?name=emaus.cc" \
  | python3 -c "import sys,json; z=json.load(sys.stdin)['result'][0]; \
    print(f\"zone_id: {z['id']}\"); print(f\"account_id: {z['account']['id']}\")"
```

### 2. Cloudflare API token faltó `Workers Scripts:Edit` (Account-level)

El token inicial solo tenía permisos a nivel Zone. `Workers Scripts` vive
a **nivel Account** — hay que añadirlo explícitamente.

**Permisos requeridos en el token**:
- Account → Workers Scripts → Edit
- Zone → Workers Routes → Edit
- Zone → DNS → Edit (para certbot DNS-01)
- Zone → DNS → Read (opcional, para `dns-backup.sh`)

### 3. `aws_lightsail_instance_public_ports` drift infinito

El provider compara el set `port_info` byte-a-byte con lo que devuelve
la API. La respuesta de AWS incluye defaults (`cidr_list_aliases`,
`ipv6_cidrs`) que Terraform no siempre puede predecir → cada `plan`
propone destroy+create, y el `destroy` de este recurso tarda **20+ min**
(bug del provider).

**Fix aplicado**:
```hcl
lifecycle {
  ignore_changes = [port_info]
}
```

### 4. Force-stop de Lightsail limpia las reglas de puertos

Tras `aws lightsail stop-instance --force` + `start-instance`, los puertos
80 y 443 quedaron cerrados (solo 22 abierto). Síntoma: Cloudflare devuelve
la página de mantenimiento porque no puede alcanzar el origen.

**Fix**: reabrir manualmente.
```bash
aws lightsail open-instance-public-ports \
  --instance-name emaus-prod \
  --port-info fromPort=80,toPort=80,protocol=TCP \
  --region us-east-2 --profile emaus
aws lightsail open-instance-public-ports \
  --instance-name emaus-prod \
  --port-info fromPort=443,toPort=443,protocol=TCP \
  --region us-east-2 --profile emaus
```

Verificar:
```bash
aws lightsail get-instance-port-states --instance-name emaus-prod \
  --region us-east-2 --profile emaus
```

### 5. Release tarball `v1.0.2` contenía `node_modules` parcial sin `.node` nativos

El release tarball de GitHub Actions incluye `apps/api/dist/` y un
`node_modules/` pero **sin los binarios `.node` pre-compilados**. La app
crasheó con `MODULE_NOT_FOUND` para `bcrypt_lib.node`, luego `sqlite3` y
`better_sqlite3`.

**Causa**: `package` step en GH Actions no incluye `.node` por tamaño.

**Fix temporal** (aplicado durante la migración):
Copiar los `.node` pre-compilados directamente del EC2 viejo (misma arch
x86_64, N-API ABI-estable entre Node 20 y 22):
```bash
# Paths:
# /var/www/emaus/node_modules/.pnpm/bcrypt@5.1.1/node_modules/bcrypt/lib/binding/napi-v3/bcrypt_lib.node
# /var/www/emaus/node_modules/.pnpm/sqlite3@5.1.7/node_modules/sqlite3/build/Release/node_sqlite3.node
# /var/www/emaus/node_modules/.pnpm/better-sqlite3@12.6.2/node_modules/better-sqlite3/build/Release/better_sqlite3.node
```

**Fix correcto (pendiente)**: cambiar `build-release.yml` a uno de:
- Incluir `*.node` en el tarball (+10 MB aproximadamente)
- No incluir `node_modules` en el tarball; hacer `pnpm install --prod --frozen-lockfile`
  en el host al deployar (descarga prebuilts de npm binary service, no recompila)
- Migrar a contenedor Docker construido en target

### 6. `node-gyp` build-from-source agota la memoria de la Lightsail

Cuando intenté `npm install --build-from-source` para better-sqlite3, la
1 GB RAM se saturó compilando la C++ amalgamation (~250k líneas), la
máquina entró en swap thrashing, SSH dejó de responder 20+ min, y requirió
force-stop via API.

**Lección**: nunca compilar módulos nativos grandes en la Lightsail.
Compilar en CI o copiar prebuilts de otro host con misma arch.

### 7. DB schema ahead of code tras copiar desde EC2 en producción

El `database.sqlite` de la EC2 viejo tenía 49 migraciones aplicadas
(última: `RenameTableNamesToSpanish`). El release `v1.0.2` de GitHub
era de antes de esa migración → el código generó SQL contra una tabla
`participant` (singular) que ya había sido renombrada a `participants`.

**Síntoma**: `SQLITE_ERROR: no such column: participant.id_on_retreat`.

**Fix**: deployar desde master local (build fresco + scp del `dist/`) en
lugar del release `v1.0.2`.

**Lección**: cuando copies DB de prod, el código desplegado debe ser
`>=` el commit de la última migración aplicada. Siempre `git log -1 --oneline`
del host origen antes de copiar DB, y asegurarte que el target tiene
commits `>=`.

### 8. `deploy-aws.sh` genera `runtime-config.js` en deploy, no del build

El archivo `apps/web/dist/runtime-config.js` **no existe en el build** —
lo genera `deploy-aws.sh` on the fly con variables del ambiente.

Mi wrapper `deploy-lightsail.sh` ejecuta `deploy-aws.sh` correctamente,
pero cuando construyes localmente y haces scp del dist directo (como hicimos
por el mismatch de schema), te olvidas de este paso → 404 en
`https://emaus.cc/runtime-config.js`.

**Fix aplicado**:
1. Generar manualmente y subirlo con scp (ver template en
   [`deploy/aws/deploy-aws.sh`](../deploy/aws/deploy-aws.sh) línea ~350).
2. Añadir location block en nginx para que no herede el
   `Cache-Control: public, immutable` de `/assets/*.js` (si 404, Cloudflare
   cachea el 404 por 4 horas):
   ```nginx
   location = /runtime-config.js {
       add_header Cache-Control "no-cache, no-store, must-revalidate" always;
       # + resto de security headers
   }
   ```

### 9. CSP del nginx no incluía `'unsafe-eval'`

El setup original del nginx bloqueaba el app con
`Evaluating a string as JavaScript violates the following Content Security
Policy directive because 'unsafe-eval' is not an allowed source`.

Vue i18n (modo completo con compilador runtime) y algunas libs usan
`new Function()` — necesitan `unsafe-eval`.

**Fix**: añadir `'unsafe-eval'` al `script-src` en todos los
`add_header Content-Security-Policy` del nginx config.

**Nota**: el CSP de la API (Express) ya lo incluía. Pero nginx lo
reescribe, así que tiene que estar en ambos lados.

### 10. GitHub Actions workflow seguía apuntando al EC2 viejo

Tras el cutover DNS, el primer `git push origin master` disparó
`deploy-production.yml` que falló en el step "Deploy to EC2" con timeout
SSH. Causa: el workflow usaba los secrets `EC2_HOST` (`3.138.49.105`, ya
`stopped`), `EC2_USER`, `EC2_SSH_PRIVATE_KEY` — ninguno actualizado como
parte de la migración.

**Fix** (commit `ff93a89`): renombrados en el workflow y en el repo:

| Antes | Después | Valor |
|---|---|---|
| `EC2_HOST` | `LIGHTSAIL_HOST` | `18.116.102.104` |
| `EC2_USER` | `LIGHTSAIL_USER` | `ubuntu` |
| `EC2_SSH_PRIVATE_KEY` | `LIGHTSAIL_SSH_PRIVATE_KEY` | contenido de `~/.ssh/lightsail-emaus.pem` |

Comandos usados (requieren `gh auth login` con token fine-grained con
scope `Secrets: Read and write` en el repo):

```bash
gh secret set LIGHTSAIL_HOST --repo lbolanos/emaus --body "18.116.102.104"
gh secret set LIGHTSAIL_USER --repo lbolanos/emaus --body "ubuntu"
gh secret set LIGHTSAIL_SSH_PRIVATE_KEY --repo lbolanos/emaus \
  < ~/.ssh/lightsail-emaus.pem

gh secret delete EC2_HOST --repo lbolanos/emaus
gh secret delete EC2_USER --repo lbolanos/emaus
gh secret delete EC2_SSH_PRIVATE_KEY --repo lbolanos/emaus
```

**Lección**: secrets externos al repo (GitHub, Cloudflare, AWS) deben
auditarse y migrarse como parte del plan, no post-hoc. Checklist para
futuras migraciones de host:

- [ ] GitHub secrets referenciados por workflows
- [ ] Webhooks con IP hardcoded (Stripe, SES bounce handlers, etc.)
- [ ] Tokens de monitoreo (Datadog, New Relic, UptimeRobot)
- [ ] Registros A/AAAA hardcoded en clientes móviles o apps externas

## Runbook — operaciones comunes

### Ver logs del API

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  'sudo pm2 logs emaus-api --lines 100 --nostream'
```

### Restart manual del API

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  'sudo pm2 restart emaus-api'
```

### Stop/Start de la Lightsail (para ahorrar — pero NO ahorra en Lightsail)

Lightsail **cobra igual parado o corriendo**. No uses stop por costo.
Solo para aplicar cambios en el snapshot (cuando aplicable).

```bash
aws lightsail stop-instance --instance-name emaus-prod --region us-east-2 --profile emaus
aws lightsail start-instance --instance-name emaus-prod --region us-east-2 --profile emaus
```

**Recuerda**: tras `start`, verificar puertos y reabrir si faltan.

### Renovar Let's Encrypt manualmente

Certbot corre en cron automáticamente. Para forzar renovación:

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  'sudo certbot renew --force-renewal'
```

### Backup de SQLite (consistente)

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 \
  'sudo -u www-data sqlite3 /var/www/emaus/apps/api/database.sqlite \
     ".backup /tmp/emaus-db-$(date +%Y%m%d).bak"'
# Bajarla a local:
scp -i ~/.ssh/lightsail-emaus.pem \
  ubuntu@18.116.102.104:/tmp/emaus-db-*.bak /local/backups/
```

### Deploy de nueva versión

**Opción A — desde GitHub release**:
```bash
# En local:
git push origin master && git tag vX.Y.Z HEAD && git push origin vX.Y.Z
# Espera 5-8 min a que termine build-release.yml

# En Lightsail:
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104
export RELEASE_TAG=vX.Y.Z DOMAIN_NAME=emaus.cc
bash /var/www/emaus/deploy/lightsail/deploy-lightsail.sh
```

**Opción B — build local + scp** (rápido, útil para hotfix):
```bash
cd /home/lbolanos/emaus
pnpm build
tar -czf /tmp/api-dist.tar.gz -C apps/api dist
tar -czf /tmp/web-dist.tar.gz -C apps/web dist
scp -i ~/.ssh/lightsail-emaus.pem /tmp/*-dist.tar.gz ubuntu@18.116.102.104:/tmp/

ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 <<'EOF'
sudo rm -rf /var/www/emaus/apps/api/dist /var/www/emaus/apps/web/dist
sudo tar -xzf /tmp/api-dist.tar.gz -C /var/www/emaus/apps/api
sudo tar -xzf /tmp/web-dist.tar.gz -C /var/www/emaus/apps/web
sudo chown -R www-data:www-data /var/www/emaus/apps/api/dist /var/www/emaus/apps/web/dist
sudo pm2 restart emaus-api --update-env
EOF
```

**Importante**: tras opción B, regenerar `runtime-config.js` (si no existe) y
purgar cache de Cloudflare para `emaus.cc/runtime-config.js`.

**Opción C — push a master (GitHub Actions)**:
```bash
git push origin master
# Dispara deploy-production.yml automáticamente:
#  - build (lint + tests + pnpm build)
#  - deploy: scp dist + package.json + lockfile a Lightsail,
#    genera runtime-config.js desde secrets, snapshot /previous,
#    backup DB a /var/backups/emaus/*.gz, pnpm install, migraciones,
#    pm2 restart emaus-api
#  - verify: GET https://emaus.cc/api/health
```

Requiere los secrets `LIGHTSAIL_HOST`, `LIGHTSAIL_USER`,
`LIGHTSAIL_SSH_PRIVATE_KEY`, `DOMAIN_NAME`, `VITE_GOOGLE_MAPS_API_KEY`,
`VITE_RECAPTCHA_SITE_KEY`. Ver `.github/workflows/deploy-production.yml`.

Monitor: `gh run watch --repo lbolanos/emaus` o
<https://github.com/lbolanos/emaus/actions>.

**Pendiente**: el tarball de release (`build-release.yml`) aún no empaca
binarios nativos `.node`. Mientras no se arregle (ver §7 de pendientes en
`infra/README.md`), usa Opción C (GitHub Actions construye el tarball
fresco cada deploy, los `.node` ya existen en el host).

### Rollback de emergencia a la EC2 vieja

Mientras la EC2 viejo (`i-011986d465e7c8f53`) siga en stop (no terminated):

```bash
# 1. Arrancar EC2
aws ec2 start-instances --instance-ids i-011986d465e7c8f53 \
  --region us-east-2 --profile emaus

# 2. Volver a apuntar DNS a la EIP del EC2 viejo (3.138.49.105)
CF_TOKEN=<tu_token>
RECORD_ID=$(curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  "https://api.cloudflare.com/client/v4/zones/76f81f5e48b75a90923775f24880309f/dns_records?type=A&name=emaus.cc" \
  | python3 -c "import sys,json;print(json.load(sys.stdin)['result'][0]['id'])")
curl -sS -X PATCH \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"content":"3.138.49.105"}' \
  "https://api.cloudflare.com/client/v4/zones/76f81f5e48b75a90923775f24880309f/dns_records/$RECORD_ID"
```

Una vez terminated + EIP released, el rollback requiere recrear EC2
desde AMI `ami-081e79f0ddc0a46b6` + migrar DB.

### Abrir puertos si se cierran tras stop/start

```bash
for port in 80 443; do
  aws lightsail open-instance-public-ports \
    --instance-name emaus-prod \
    --port-info fromPort=$port,toPort=$port,protocol=TCP \
    --region us-east-2 --profile emaus
done
aws lightsail get-instance-port-states --instance-name emaus-prod \
  --region us-east-2 --profile emaus
```

### Purgar cache de Cloudflare (necesita token con Cache Purge:Purge)

```bash
CF_TOKEN=<token-with-cache-purge>
curl -sS -X POST \
  -H "Authorization: Bearer $CF_TOKEN" -H "Content-Type: application/json" \
  --data '{"files":["https://emaus.cc/runtime-config.js"]}' \
  "https://api.cloudflare.com/client/v4/zones/76f81f5e48b75a90923775f24880309f/purge_cache"
```

O desde el dashboard: `emaus.cc` → Caching → Configuration → Purge Cache.

## Recursos en la cuenta

| Tipo | Nombre/ID | Nota |
|---|---|---|
| Lightsail instance | `emaus-prod` (micro_3_0, us-east-2a) | $7/mo |
| Static IP | `emaus-ip` → `18.116.102.104` | Incluido en bundle |
| IAM user | `emaus-lightsail-app` | S3 GetObject/PutObject/DeleteObject en `emaus-media` |
| Lambda | `emaus-ec2-scheduler` (DISABLED) | Artefacto para futuro uso si vuelve a EC2 |
| EventBridge schedules | `emaus-ec2-scheduler-stop`, `-start` | Ambos DISABLED |
| Cloudflare Worker | `emaus-failover` | Serves 503 HTML on origin 5xx/timeout |
| Cloudflare routes | `emaus.cc/*`, `www.emaus.cc/*` | Ambos apuntan al Worker |
| EC2 (legacy, en stop) | `i-011986d465e7c8f53` | Terminar tras 1 semana observación |
| Elastic IP (legacy) | `eipalloc-0c926bec959d0098a` (`3.138.49.105`) | Liberar al terminar EC2 |
| AMI backup | `ami-081e79f0ddc0a46b6` (`emaus-backup-20260317-2312`) | Conservar histórico |
| AWS Budget | `Emaus-Monthly-Budget` ($40/mo alert) | Alertas a `leonardo.bolanos@gmail.com` |

## Referencias

- [`/infra/README.md`](../infra/README.md) — Terraform module docs
- [`/deploy/lightsail/README.md`](../deploy/lightsail/README.md) — deploy scripts
- [`/docs/AWS_COST_GUIDE.md`](./AWS_COST_GUIDE.md) — cost breakdown
