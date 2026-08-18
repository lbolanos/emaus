---
name: infra-remota
description: "Acceso a la infraestructura de producción de Emaús: SSH al servidor Lightsail (emaus.cc está tras Cloudflare, el puerto 22 no responde por dominio — hay que usar la IP directa), perfil de AWS CLI y bucket emaus-media, y el script de backup diario de la base. Usar cuando haya que entrar al servidor, listar o descargar backups de S3, revisar rutas de deploy, o ejecutar un backup manual."
globs: "scripts/db-watchdog.sh,backup-db.sh,Makefile"
---

# Infraestructura y acceso remoto — Emaús

## SSH al servidor de producción

`emaus.cc` está detrás de Cloudflare (proxy), así que **el puerto 22 no es accesible por el
dominio**. Siempre por la IP directa de Lightsail:

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104
```

| Dato | Valor |
|---|---|
| Llave | `~/.ssh/lightsail-emaus.pem` |
| Usuario | `ubuntu` |
| IP | `18.116.102.104` |
| DB en prod | `/var/www/emaus/apps/api/database.sqlite` |
| Backups locales | `/var/backups/emaus/` |
| Log de backup | `/var/log/emaus-backup.log` |
| Deploy web | `/var/www/emaus/apps/web/dist` |

## nginx en producción

**El deploy automático NO toca nginx.** `deploy-production.yml` sube `dist` del API y del web,
sincroniza `src` del API (para `migration:run`), manifests, `ecosystem.config.js` y
`runtime-config.js`, corre migraciones y reinicia pm2 — nada más. Cualquier cambio de `nginx.conf`
se aplica a mano por SSH.

Tres cosas que muerden (verificadas 2026-08-17):

- **`sites-enabled/emaus` no es un symlink**: es un archivo regular y **distinto** del de
  `sites-available/emaus` (md5 y tamaño diferentes; el de available quedó viejo). nginx sirve el de
  **sites-enabled** — editar el otro no tiene ningún efecto.
- **`nginx.conf` del repo es una plantilla**, con `$DOMAIN_NAME` sin resolver, y diverge de lo que
  corre (prod tiene además `location = /runtime-config.js`). **Nunca copiarlo encima**: bajar el de
  producción, insertarle el cambio y subir eso.
- **El backup no va en `sites-enabled/`**: nginx incluye `sites-enabled/*`, así que un
  `emaus.bak.<fecha>` ahí dentro se carga como server duplicado y aparecen warnings de
  `conflicting server name`. Guardarlo en `/etc/nginx/backups/`.

```bash
KEY=~/.ssh/lightsail-emaus.pem; HOST=ubuntu@18.116.102.104
scp -i $KEY $HOST:/etc/nginx/sites-enabled/emaus /tmp/emaus-prod.conf   # 1. bajar el que corre
# 2. editar /tmp/emaus-prod.conf en local
scp -i $KEY /tmp/emaus-prod.conf $HOST:/tmp/nuevo.conf
ssh -i $KEY $HOST "sudo mkdir -p /etc/nginx/backups \
  && sudo cp /etc/nginx/sites-enabled/emaus /etc/nginx/backups/emaus.bak.\$(date +%Y%m%d_%H%M%S) \
  && sudo cp /tmp/nuevo.conf /etc/nginx/sites-enabled/emaus \
  && sudo nginx -t && sudo systemctl reload nginx"
```

`nginx -t` valida antes de recargar: si falla, nginx sigue sirviendo la configuración anterior.
El warning de `ssl_stapling ... no OCSP responder URL` es preexistente (certificado de Let's
Encrypt) y no indica problema.

## AWS CLI

Perfil `emaus` → cuenta `585853725478`:

```bash
aws sts get-caller-identity --profile emaus
aws s3 ls s3://emaus-media/backups/database/ --human-readable --profile emaus | tail -10
```

Bucket `emaus-media`, prefijos: `backups/database/` (retención 90 días), `avatars/`,
`retreat-memories/`, `public-assets/`, `documents/`.

## Backups de base de datos

Script `/var/www/emaus/backup-db.sh`, cron diario a las **3:00 AM** hora del servidor.

```bash
# Backup manual
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 "bash /var/www/emaus/backup-db.sh"
```

La DB de prod corre en **WAL**; un watchdog (`scripts/db-watchdog.sh`, cron cada minuto) detecta
locks de escritura colgados y reinicia el API.

> ⚠️ Para descargar la DB usa **`make db-pull`** (snapshot `.backup` consistente). **Nunca**
> `scp` ni `cp` del `.sqlite` vivo — corrompe la copia.

Para operar la DB de prod más allá de esto (DB corrupta, `database is locked`, lock colgado,
watchdog, migración que no corre en prod) → skill **`db-production-resilience`**.
