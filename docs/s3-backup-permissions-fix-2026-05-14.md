# Fix: Permisos S3 para backups de base de datos

**Fecha:** 2026-05-14
**Severidad:** Media (backups locales intactos; S3 fallando en silencio)

## Problema

El script de backup `/var/www/emaus/backup-db.sh` corría diariamente a las 3:00 AM y creaba copias locales correctamente, pero el upload a S3 fallaba con `AccessDenied` desde el 17 de abril de 2026.

El log se cortaba en:
```
📤 Uploading to S3...
```
Sin mostrar el mensaje de éxito `✅ S3 upload: ...`.

El bucket `emaus-media` solo tenía 2 backups (2 abr y 17 abr), con casi un mes de brecha.

## Causa raíz

La política IAM inline `EmausMediaRW` del usuario `emaus-app` (cuenta `585853725478`) solo otorgaba `s3:PutObject` sobre los prefijos:

```
emaus-media/avatars/*
emaus-media/retreat-memories/*
emaus-media/public-assets/*
emaus-media/documents/*
```

El prefix `backups/database/*` **nunca fue incluido** cuando se creó la política original.

## Fix aplicado

Se actualizó la política `EmausMediaRW` via:

```bash
aws iam put-user-policy --user-name emaus-app --policy-name EmausMediaRW --profile emaus --policy-document '{...}'
```

Se agregó `arn:aws:s3:::emaus-media/backups/database/*` a las acciones `GetObject`, `PutObject`, `DeleteObject`, y `backups/database/*` a la condición del `ListBucket`.

## Verificación

Upload de prueba desde el servidor OK:
```
upload: ../../tmp/test-s3.txt to s3://emaus-media/backups/database/test-s3.txt
```

Backup manual ejecutado con éxito:
```
✅ Local backup: /var/backups/emaus/emaus_20260514_233457.sqlite.gz (3.9M)
✅ S3 upload: s3://emaus-media/backups/database/emaus_20260514_233457.sqlite.gz
```

## Estado de backups al cierre

- **Locales:** 34 backups desde el 22 de abril (cron diario a las 3 AM funcionando sin interrupción)
- **S3:** 3 backups disponibles (2 abr, 17 abr, 14 may)
- **Brecha en S3:** 17 abr → 14 may — no recuperable (los backups locales de ese período sí existen en `/var/backups/emaus/`)

## Cómo subir backups históricos a S3 (opcional)

Si se desea llenar la brecha en S3:

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104
# Subir todos los backups locales que no estén en S3:
aws s3 sync /var/backups/emaus/ s3://emaus-media/backups/database/ --exclude "*" --include "emaus_*.sqlite.gz"
```

## Prevención futura

- Cualquier nuevo prefix en `emaus-media` que el script `backup-db.sh` necesite escribir debe agregarse simultáneamente a la política `EmausMediaRW`.
- Al configurar nuevos scripts de backup, probar el upload a S3 manualmente antes de dejar el cron solo.
