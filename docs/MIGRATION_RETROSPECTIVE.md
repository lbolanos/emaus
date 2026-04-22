# Retrospectiva — Migración EC2 → Lightsail (2026-04-21)

Documento de cierre de la migración. Resume **qué se hizo**, **qué salió mal**
y **qué aprendimos** para la próxima vez que toque algo parecido.

> Complementa a `LIGHTSAIL_MIGRATION_NOTES.md` (detalle técnico de los 11
> issues) y a `POST_MIGRATION_TRACKER.md` (checklist abierto con fechas).

---

## 1. Cronología

| Fecha / hora | Evento |
|---|---|
| 2026-04-20 | Cloudflare zone activado; módulo Terraform creado; Lightsail provisionada |
| 2026-04-21 (madrugada) | DNS cutover `3.138.49.105` → Lightsail static IP; EC2 viejo `stopped` |
| 2026-04-21 (tarde) | Primer `git push master` → deploy falla: secrets `EC2_*` apuntaban a host apagado |
| 2026-04-21 (tarde) | Renombrados secrets a `LIGHTSAIL_*` (commit `ff93a89`) |
| 2026-04-21 (tarde) | Segundo deploy falla: `mkdir .../dist/assets: Permission denied` (commit `ee571db`) |
| 2026-04-21 (tarde) | Tercer deploy falla: `scp package.json: Permission denied` en raíz (commit `b6f7f2f`) |
| 2026-04-21 (tarde) | Cuarto deploy OK (build 3m28s / deploy 1m41s) |
| 2026-04-21 (noche) | Detectado PM2 con **6313 restarts** — proceso huérfano en `:3001` |
| 2026-04-21 (noche) | `sudo kill -TERM 9460` → PM2 recupera (PID 95568), HTTP 200 estable |

**Duración total del incidente**: ~8h de elapsed, ~3h de trabajo activo.
**Downtime percibido por usuarios**: 0 (Cloudflare Worker sirvió la página de
mantenimiento durante las ventanas de deploy fallido).

---

## 2. Qué se hizo (resumen ejecutivo)

### Infraestructura
- **Nueva instancia Lightsail** `emaus-prod` (`18.116.102.104`, bundle
  `micro_3_0` = $7/mes, us-east-2a, Ubuntu 22.04).
- **IP estática** atada a la instancia (no es Elastic IP de EC2 — es objeto
  propio de Lightsail).
- **nginx + Let's Encrypt** con desafío **DNS-01** vía Cloudflare API (no
  HTTP-01 — Cloudflare proxy no lo permite sin bypass).
- **PM2** supervisando `emaus-api` en fork mode (max_memory_restart 700M
  dentro del bundle de 1 GB RAM).
- **DB SQLite** copiada con `sqlite3 .backup` (no `cp`, para evitar
  corruption por lock activo).

### CI/CD
- Workflow `deploy-production.yml` reescrito para usar secrets
  `LIGHTSAIL_HOST` / `LIGHTSAIL_USER` / `LIGHTSAIL_SSH_PRIVATE_KEY`.
- Workflow ahora **chown idempotente** de `/var/www/emaus` y subcarpetas a
  `ubuntu:ubuntu` antes de `scp` (ver lecciones §4.B).

### Failover
- **Cloudflare Worker** `emaus-failover` sirve HTML estático de
  mantenimiento (503) si el origen devuelve 5xx o timeout >10s. Durante los
  deploys fallidos este Worker salvó la experiencia del usuario final.

### Docs
- `LIGHTSAIL_MIGRATION_NOTES.md`: 11 issues enumerados con síntoma / causa /
  fix.
- `POST_MIGRATION_TRACKER.md`: checklist con fechas objetivo hasta
  decomisionado del EC2 viejo (2026-04-25).
- `infra/README.md`: diagrama de arquitectura actualizado + tabla de secrets.
- `AWS_COST_GUIDE.md`: desglose de costos EC2 vs Lightsail y proyección.

### Secrets & auth
- Creado **fine-grained PAT** permanente (`~/.config/gh/hosts.yml`) con
  permisos: Secrets RW, Actions, Contents, Workflows, Pull requests, Issues.
  Caveat: no soporta `admin:public_key` → `gh auth login` no sube SSH key
  pero el auth funciona.

---

## 3. Incidentes y sus causas raíz

### 3.1. Deploy run #73 falla — secrets apuntando a host apagado
- **Síntoma**: workflow falla en "Deploy to EC2 / Copy files" con timeout SSH.
- **Causa**: `EC2_HOST` seguía siendo `3.138.49.105` (EIP del EC2 viejo ya
  `stopped`). DNS ya apuntaba a Lightsail, pero el workflow hardcodeaba al host
  viejo.
- **Fix**: renombrar secrets a `LIGHTSAIL_*` con valores nuevos (no solo
  actualizar los viejos — dejar EC2_* con valores de Lightsail era confuso y
  engañaba al próximo ingeniero).

### 3.2. Permission denied al crear `dist/assets`
- **Síntoma**: `mkdir: cannot create directory '/var/www/emaus/apps/web/dist/assets': Permission denied`.
- **Causa**: `setup-aws.sh` crea `/var/www/emaus` con owner `www-data`. El
  workflow hace `scp` como `ubuntu` → no puede escribir.
- **Fix**: `sudo chown -R ubuntu:ubuntu` en las subcarpetas antes de `scp`.

### 3.3. Permission denied al subir `package.json` a la raíz
- **Síntoma**: `scp: dest open "/var/www/emaus/package.json": Permission denied`.
- **Causa**: el fix anterior solo cubría `apps/*/dist/`. Los archivos de la
  raíz (`package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`) también
  intentan escribirse como `ubuntu`.
- **Fix**: ampliar chown a `/var/www/emaus` y a cada root config file.

### 3.4. PM2 en crash loop — 6313 restarts
- **Síntoma**: `pm2 list` muestra `restart: 6313`, uptime reiniciándose cada
  segundo, logs con `EADDRINUSE :::3001`.
- **Causa**: un deploy manual anterior (antes de migrar a PM2 completo)
  lanzó `node dist/index.js &` sin pm2 → proceso huérfano (PID 9460, uptime
  16h42m) quedó ocupando `:3001`. Cuando PM2 intentó levantar `emaus-api`,
  puerto ocupado → crash → restart → crash loop.
- **Fix**: `sudo kill -TERM 9460` → PM2 inicia limpio con nuevo PID 95568,
  HTTP 200.
- **Detección**: comparar PIDs entre `sudo ss -tlnp | grep 3001` y
  `sudo pm2 jlist`. Si difieren → hay huérfano.

---

## 4. Lecciones aprendidas

### 4.A. No esconder cambios de infra en renames "equivalentes"
Cuando migras un host, **renombra** los secrets/variables, no los actualices.
`EC2_HOST` con valor de Lightsail es una trampa para quien venga después: el
nombre miente sobre qué hay al otro lado. El costo extra de renombrar es ~5
min; el costo de confundir al próximo humano que toque el workflow es
indeterminado.

### 4.B. Los scripts de bootstrap no siempre usan el mismo user que los de deploy
`setup-aws.sh` crea directorios como `www-data` (correcto en runtime, nginx
los lee). `deploy-aws.sh` los llena como `ubuntu` (correcto en deploy, es
quien tiene la SSH key). Hay que **explicitar el puente**: chown en cada
deploy es más robusto que asumir que el setup inicial dejó los permisos
correctos. Idempotencia > asunciones.

### 4.C. PM2 no detecta procesos huérfanos fuera de su jerarquía
PM2 supervisa lo que tú le dijiste que supervise. Si hay un proceso Node
fuera de PM2 ocupando el puerto, PM2 no sabe que existe; solo ve "puerto
ocupado, fallo al bind" y entra en crash loop. **Regla**: en este repo, la
única forma legítima de levantar `emaus-api` en prod es `pm2 start` o `pm2
restart`. Nunca `node dist/index.js &`, `nohup`, `systemd --user`, ni similar.
Si se hace en debug, **matarlo antes de salir del host**.

### 4.D. Un Worker de failover vale oro durante la transición
El Worker Cloudflare que servía página de mantenimiento costó 30 min de
trabajo. Durante los 3 intentos fallidos de deploy, los usuarios finales
vieron "Volvemos pronto" en vez de "Bad Gateway" o la página default de
Cloudflare. Cero tickets reportados durante las ventanas malas. **Keep it**.

### 4.E. El parámetro `sqlite3 .backup` es obligatorio para DBs en vivo
Un `cp database.sqlite /tmp/` de un SQLite con escrituras activas te da **muy
alto riesgo de corruption**. `sqlite3 old.sqlite ".backup /tmp/new.sqlite"`
toma un lock compartido, genera copia consistente, libera lock. Usado en la
migración sin incidentes. Para backups automatizados futuros, usar esta misma
sintaxis.

### 4.F. Los fine-grained PAT de GitHub no pueden subir claves SSH
Son más seguros, pero no soportan el scope `admin:public_key`. Si tu flujo
depende de `gh auth login --web` subiendo tu clave, rompe. Workaround:
`gh auth setup-git` + PAT fine-grained cubre todo lo que Claude Code necesita
(Secrets, Actions, Contents, Workflows). No necesitamos el SSH upload.

### 4.G. Lightsail ≠ EC2 en el Python SDK
`boto3.client('ec2').stop_instances(...)` no sirve para Lightsail. Es
`boto3.client('lightsail').stop_instance(instanceName=...)` (singular,
`instanceName` no `InstanceIds`). El scheduler Lambda requirió reescritura,
no migración.

### 4.H. Deploy pipelines deben ser idempotentes hasta en los chown
Cada paso del workflow debe poder correr dos veces sin hacer daño. Eso nos
salvó en iteración: los fixes sucesivos de permisos se acumularon sin
conflictos porque cada `sudo chown` es idempotente. Si alguno hubiera sido
destructivo (`rm -rf` sin guardas, `mv` sin check de existencia), cada retry
habría sido más peligroso que el anterior.

### 4.I. Un `sleep 300` entre retries es mejor que un `sleep 60`
Durante el debugging iteramos rápido: cambio al workflow → push → watch. El
build tarda ~3m28s. Pollear cada 60s gastaba cache y context. Aprendimos a
usar `gh run watch` (streaming, no polling) y, cuando es background, ventanas
de espera alineadas al TTL de cache de la conversación (>270s o <270s, nunca
justo 300s).

### 4.J. Documentar el "por qué" pesa más que el "qué"
`LIGHTSAIL_MIGRATION_NOTES.md` documenta 11 issues. Cada uno con **síntoma,
causa raíz, fix**. Lo que vale para el futuro no es el fix (la próxima vez el
síntoma será distinto), sino la **causa raíz** (la próxima vez podrás
reconocer el patrón: "ah, esto huele a process orphan / a permissions en
bootstrap / a secret apuntando a host apagado").

---

## 5. Métricas

| Métrica | Antes (EC2) | Después (Lightsail) |
|---|---|---|
| Costo mensual | ~$14 | $7 (-50%) |
| Costo anual proyectado | ~$168 | ~$84 (-$84/año) |
| RAM | 1 GB (t3a.micro) | 1 GB (micro_3_0) |
| vCPUs | 2 burstable | 2 |
| Transfer incluido | 100 GB | 2 TB (+1900%) |
| IP estática | $3.6/mes separados | incluida |
| EBS storage | 8 GB extra ($0.80) | 40 GB incluido |
| Tiempo de deploy (E2E) | ~5 min | ~5 min (sin cambio) |
| Uptime durante migración | — | 100% (Worker cubrió fallos) |

---

## 6. Decisiones conscientes que NO hicimos (y por qué)

- **Mantuvimos SQLite** en vez de migrar a RDS/Postgres. Motivo: 7 MB de
  DB, < 10 escrituras concurrentes, costo de RDS mínimo = $12/mes (más que
  toda la Lightsail). Cuando pase de ~100 MB o tengamos writes concurrentes
  reales, reconsiderar.
- **No migramos a Fargate/App Runner** pese a ser "más cloud native".
  Motivo: $7 flat con PM2 es más barato y la app es un binario + assets
  estáticos. No hay ventaja operativa en contenedorizar.
- **No movimos `.env.production` a Secrets Manager**. Motivo: $0.40/secret
  × ~8 secrets = $3.2/mes, 45% del costo del hosting. En el TODO para cuando
  haya rotación real de credenciales.
- **No activamos Always Online™ de Cloudflare**. El Worker custom da más
  control sobre el HTML y responde 503 (correcto semánticamente) vs 200 con
  contenido viejo.

---

## 7. Próximos pasos (referencia rápida)

Ver `POST_MIGRATION_TRACKER.md` para la checklist viva. Resumen:

- **Viernes 2026-04-25**: terminate EC2 viejo + release EIP ($6.25/mes más
  de ahorro).
- **Esta semana**: validación manual end-to-end en prod (login, CRUD, SES,
  OAuth).
- **Próxima semana**: Cost Anomaly Detection + verificar reward de $20 del
  Budget.
- **Mes siguiente**: automatizar backup semanal de SQLite a S3.

---

## 8. Referencias cruzadas

- Detalle técnico de issues: [`LIGHTSAIL_MIGRATION_NOTES.md`](./LIGHTSAIL_MIGRATION_NOTES.md)
- Checklist abierto: [`POST_MIGRATION_TRACKER.md`](./POST_MIGRATION_TRACKER.md)
- Arquitectura y Terraform: [`../infra/README.md`](../infra/README.md)
- Costos: [`AWS_COST_GUIDE.md`](./AWS_COST_GUIDE.md)
- Workflow CI/CD: [`../.github/workflows/deploy-production.yml`](../.github/workflows/deploy-production.yml)
- Worker de failover: [`../infra/workers/failover.js`](../infra/workers/failover.js)
