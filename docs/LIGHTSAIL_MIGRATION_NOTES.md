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

### 11. Proceso huérfano ocupando `:3001` tras deploys manuales

Tras el primer deploy manual al Lightsail (2026-04-21 06:23), el proceso
`node dist/index.js` (PID 9460, UID root) quedó corriendo fuera de
supervisión de PM2: escuchaba en `*:3001` y servía todo el tráfico.
PM2 por su lado intentaba levantar su propio `emaus-api` cada ~10s y
crashaba con:

```
Error: listen EADDRINUSE: address already in use :::3001
```

Los usuarios no veían nada raro (el huérfano servía bien), pero:

- PM2 acumulaba restarts sin tregua (6313 en ~17 h)
- `pm2 restart emaus-api` no tenía efecto — el código nuevo nunca corría
- El próximo deploy (manual o por CI) reproduciría el mismo problema

**Diagnóstico**:
```bash
ssh ubuntu@<lightsail-ip>
sudo ss -tlnp | grep 3001    # qué PID tiene el puerto
sudo pm2 jlist               # qué PID cree PM2 que supervisa
# Si no coinciden → proceso huérfano
```

**Fix** (2026-04-21 22:52):
```bash
# Matar huérfano; PM2 levanta el nuevo automáticamente en <10s
sudo kill -TERM <pid-huérfano>
sleep 8
sudo pm2 status emaus-api    # esperar status=online, uptime corto
```

**Prevención**: deploys siempre vía `pm2 restart emaus-api`
(nunca `node dist/index.js &` ni `nohup`). El workflow
`deploy-production.yml` ya hace lo correcto. Si hace falta un hotfix
manual urgente, validar después con `sudo ss -tlnp | grep 3001` que el
PID coincida con el de `pm2 jlist`.

---

### 12. `EACCES: permission denied` en `node_modules/.modules.yaml` durante pnpm install

**Contexto**: `deploy-production.yml` corre `pnpm install --frozen-lockfile`
dentro de una sesión SSH. Si algún archivo en `node_modules` estaba
bajo ownership `root` (del bootstrap manual inicial), pnpm abortaba con
`EACCES: permission denied, unlink '/var/www/emaus/node_modules/.modules.yaml'`.
Con `set -e` en el heredoc el resto del script fallaba silenciosamente:
la API seguía corriendo con el código viejo sin ningún error visible.

**Síntoma en GitHub Actions**: el step "Deploy to Lightsail" terminaba verde
(porque el heredoc salía 0) pero la app no reflejaba los cambios nuevos.

**Fix** (commit `55d6802`): chown defensivo antes de `pnpm install`:
```bash
sudo chown -R ubuntu:ubuntu /var/www/emaus/node_modules 2>/dev/null || true
sudo chown -R ubuntu:ubuntu /var/www/emaus/apps/*/node_modules 2>/dev/null || true
sudo chown -R ubuntu:ubuntu /var/www/emaus/packages/*/node_modules 2>/dev/null || true
```

---

### 13. `ERR_PNPM_OUTDATED_LOCKFILE` — manifests de app desactualizados en el servidor

**Contexto**: el artefacto de build que sube el CI nunca incluía los
`apps/api/package.json` ni `apps/web/package.json`. El servidor tenía los
manifests del deploy anterior, pero el `pnpm-lock.yaml` avanzaba con cada
commit. En el primer deploy que añadía una dependencia nueva, `pnpm install
--frozen-lockfile` abortaba con:

```
ERR_PNPM_OUTDATED_LOCKFILE  Cannot install with --frozen-lockfile because pnpm-lock.yaml is not up to date with ...
```

**Fix** (commit `687acdc`): subir los manifests directamente desde el
checkout del runner (siempre frescos), no desde el artefacto de build:
```bash
scp apps/api/package.json   ubuntu@$LIGHTSAIL_HOST:/var/www/emaus/apps/api/package.json
scp apps/web/package.json   ubuntu@$LIGHTSAIL_HOST:/var/www/emaus/apps/web/package.json
scp package.json            ubuntu@$LIGHTSAIL_HOST:/var/www/emaus/package.json
scp pnpm-lock.yaml          ubuntu@$LIGHTSAIL_HOST:/var/www/emaus/pnpm-lock.yaml
scp pnpm-workspace.yaml     ubuntu@$LIGHTSAIL_HOST:/var/www/emaus/pnpm-workspace.yaml
```

---

### 14. `scp: dest open "...apps/api/package.json": Permission denied`

**Contexto**: los archivos `apps/*/package.json` existían en el servidor bajo
ownership `root` (creados por el bootstrap inicial con sudo). Los nuevos `scp`
del fix §13 fallaban al intentar sobrescribirlos.

**Fix** (commit `a505849`): chown explícito de todos los targets del scp
dentro del bloque CLEANEOF, antes de los uploads:
```bash
for p in \
  /var/www/emaus/apps/api/package.json \
  /var/www/emaus/apps/web/package.json \
  /var/www/emaus/package.json \
  /var/www/emaus/pnpm-lock.yaml \
  /var/www/emaus/pnpm-workspace.yaml; do
  [ -e "$p" ] && sudo chown ubuntu:ubuntu "$p" || true
done
```

---

### 15. `PM2 Permission denied` — sockets de PM2 bajo ownership `root`

**Contexto**: después de matar el proceso huérfano (§11), el daemon de PM2
que había levantado el bootstrap original seguía corriendo como `root`. Al
intentar `pm2 restart emaus-api` como `ubuntu`, PM2 fallaba con:

```
[PM2][ERROR] Permission denied, to give access to current user:
$ sudo chown ubuntu:ubuntu /home/ubuntu/.pm2/rpc.sock /home/ubuntu/.pm2/pub.sock
```

El step de deploy terminaba con exit 1 aunque el error era sólo de permisos
y la app en realidad arrancaba correctamente.

**Fix** (commit `9b67db7`): chown del directorio `.pm2` antes de cualquier
comando pm2:
```bash
if [ -d "$HOME/.pm2" ]; then
  sudo chown -R ubuntu:ubuntu "$HOME/.pm2" 2>/dev/null || true
fi
pm2 restart emaus-api
```

---

### 16. Deploy step — exit code 1 justo después de `✅ API is healthy (HTTP 200)`

**Contexto**: el step "Deploy to Lightsail" terminaba con exit 1
consistentemente, 50–80 ms después de imprimir el mensaje de éxito del
healthcheck. La app funcionaba correctamente en producción, pero GitHub
Actions marcaba el run como `failure` y ejecutaba el step de rollback.

**Causa**: el healthcheck original usaba `exit 0` dentro de un `for` loop
en el shell heredoc de SSH:

```bash
# PROBLEMÁTICO
for i in 1 2 3 4 5; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health || echo 000)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API is healthy (HTTP 200)"
    exit 0          # ← sale del shell remoto a mitad del heredoc
  fi
  ...
done
```

Cuando `exit 0` corre en el shell remoto, la conexión SSH se cierra antes
de que el cliente local haya terminado de escribir todo el contenido del
heredoc al pipe. El cliente SSH recibe SIGPIPE y puede devolver exit 1 al
runner aunque el remote exit code fue 0.

Adicionalmente `pm2 status emaus-api` (informativo) podía retornar non-zero
con `set -e` activo si PM2 reportaba el proceso en estado `errored`
justo después de un restart.

**Fix** (commit `9c2b466`): usar un flag en lugar de `exit 0` dentro del loop,
y agregar `|| true` a `pm2 status`:

```bash
# CORRECTO
pm2 status emaus-api || true

HEALTHY=0
for i in 1 2 3 4 5; do
  HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3001/api/health 2>/dev/null || echo 000)
  if [ "$HTTP_CODE" = "200" ]; then
    echo "✅ API is healthy (HTTP 200)"
    HEALTHY=1
    break
  fi
  echo "Attempt $i: HTTP $HTTP_CODE - retrying in 3s..."
  sleep 3
done
if [ "$HEALTHY" != "1" ]; then
  echo "❌ API did not respond with 200 after 5 attempts"
  pm2 logs emaus-api --lines 30 --nostream || true
  exit 1
fi
# Heredoc cae al final → exit 0 natural
```

**Regla general**: nunca usar `exit 0` dentro de loops en heredocs SSH.
Usar siempre un flag + `break` y dejar caer el script al final.

---

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
