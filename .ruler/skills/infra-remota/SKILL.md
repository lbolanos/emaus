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
