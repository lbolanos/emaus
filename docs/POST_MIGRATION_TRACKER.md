# Post-Migration Tracker

Checklist con fechas objetivo para cerrar todos los pendientes de la
migración a AWS Lightsail (2026-04-21 cutover).

## 🔴 Urgente — esta semana

- [x] **2026-04-21** — ~~EIP liberada~~ ✓ `eipalloc-0c926bec959d0098a` (3.138.49.105)
  released. Ahorra ~$3.60/mes que AWS cobra por EIP en instancia stopped. Rollback
  sigue viable — se obtendría un EIP nuevo (IP distinta) y se apuntaría Cloudflare.
- [x] **2026-04-21** — ~~Cloudflare edge security~~ ✓ Bot Fight Mode + rate limit
  en `/api/auth/*` + Web Analytics. Documentado en
  [`CLOUDFLARE_SECURITY.md`](./CLOUDFLARE_SECURITY.md). Aplicado por API, luego
  importado al state de Terraform — `terraform plan` devuelve No changes.
- [ ] **2026-04-25 (vie)** — Terminar EC2 `i-011986d465e7c8f53`
  - Ahorro restante: ~$0.80/mes (EBS root 8 GB)
  - Solo si Lightsail siguió estable lunes-viernes
  - Comando:
    ```bash
    aws ec2 terminate-instances --instance-ids i-011986d465e7c8f53 \
      --region us-east-2 --profile emaus
    ```
  - Verificar: `aws ec2 describe-instances --instance-ids i-011986d465e7c8f53 --region us-east-2 --profile emaus --query 'Reservations[].Instances[].State.Name'` → `terminated`

- [ ] **2026-04-22 (hoy+1)** — Validación manual completa en producción
  - [ ] Login con cuenta real
  - [ ] Listar participantes (el endpoint que dio 503)
  - [ ] Crear/editar participante
  - [ ] Subir avatar (valida IAM S3)
  - [ ] Enviar correo de prueba (valida SES)
  - [ ] Probar OAuth Google
  - [ ] Probar drag-and-drop de mesas/camas (Vue reactividad)

- [x] **2026-04-21** — ~~Push master~~ ✓ hecho. Primer intento falló
  (`deploy-production.yml` run #73) porque los secrets `EC2_*` aún
  apuntaban al EC2 viejo (`stopped`). Fixed en commit `ff93a89`:
  - Renombrados secrets: `EC2_HOST/USER/SSH_PRIVATE_KEY` →
    `LIGHTSAIL_HOST/USER/SSH_PRIVATE_KEY` (valores nuevos apuntan a
    `18.116.102.104` + `~/.ssh/lightsail-emaus.pem`)
  - Workflow actualizado para usar los nuevos nombres
  - Viejos secrets EC2_* eliminados del repo
  - Ver [`LIGHTSAIL_MIGRATION_NOTES.md`](./LIGHTSAIL_MIGRATION_NOTES.md) §10

- [x] **2026-04-22** — ~~Push + tag v1.0.3~~ ✓ release publicado. En el camino
  se arreglaron 2 bugs del pipeline post-migración:
  - `jspdf` era phantom dep (no en `package.json`) → CI fallaba con TS2307.
    Agregada en commit `99a7811`.
  - Cloudflare Bot Fight Mode 403ea a curl desde GitHub Actions runners →
    `Quick API validation` siempre fallaba. Movida la validación al SSH
    deploy block (`curl http://localhost:3001/api/health`) en commit `c1fe7e0`.
  - Release: https://github.com/lbolanos/emaus/releases/tag/v1.0.3

## 🟡 Medio — próximas 2 semanas

- [ ] **2026-05-05 (lun)** — Verificar reward de $20 del AWS Budget
  ```bash
  aws freetier list-account-activities --profile emaus --region us-east-1 \
    --query 'activities[?contains(title, `budget`)]'
  ```
  Estado esperado: `COMPLETED`. Si sigue `NOT_STARTED`, abrir ticket en AWS Billing.

- [ ] Configurar AWS Cost Anomaly Detection (gratis)
  - Detecta gastos inusuales automáticamente
  - Dashboard → Billing → Cost Anomaly Detection → Enable
  - Útil como segunda capa ante el budget de $40

- [ ] Fix del release pipeline para módulos nativos
  - Ver [`LIGHTSAIL_MIGRATION_NOTES.md`](./LIGHTSAIL_MIGRATION_NOTES.md) §5
  - Opción A simple: en `deploy-aws.sh`, correr `pnpm install --prod --frozen-lockfile`
    tras extraer tarball → descarga prebuilts del binary service
  - Sin esto, cada deploy requiere copiar `.node` manualmente

- [ ] Agregar generación de `runtime-config.js` a `deploy-lightsail.sh`
  - Ver [`LIGHTSAIL_MIGRATION_NOTES.md`](./LIGHTSAIL_MIGRATION_NOTES.md) §8
  - Copiar el bloque `cat > apps/web/dist/runtime-config.js << EOF` de
    `deploy/aws/deploy-aws.sh` (líneas ~350-420) al wrapper de Lightsail
  - Nota: El workflow de GitHub Actions (`deploy-production.yml`) ya lo
    genera inline en cada deploy; esto es solo para el hotfix manual
    `deploy/lightsail/deploy-lightsail.sh`.

## 🟢 Bajo — cuando haya tiempo

- [ ] Completar 4 actividades de AWS Free Plan ($80 USD en créditos)
  - Bedrock playground
  - Lambda web app
  - Aurora/RDS database (**ojo: apagar inmediatamente para no cobrar**)
  - EC2 launch (ya estaba IN_PROGRESS el 2026-04-20)

- [ ] Automatizar backup semanal de SQLite a S3
  ```bash
  # Cron semanal (domingos 3 AM) en la Lightsail:
  # 0 3 * * 0 bash /var/www/emaus/scripts/backup-db-to-s3.sh
  ```
  Script pendiente: `sqlite3 .backup + aws s3 cp + retain 8 weeks`

- [ ] Migrar secretos a AWS Secrets Manager
  - `.env.production` tiene secretos en plaintext
  - Costo: $0.40/secret/mes ($0.40-$4 según granularidad)
  - Script de boot descarga al startup

- [ ] Regenerar `dns-backup.bind` y commitear
  ```bash
  cd infra
  export CLOUDFLARE_API_TOKEN=<token-with-Zone:DNS:Read>
  ./dns-backup.sh
  git add dns-backup.bind && git commit -m "chore(infra): refresh DNS snapshot"
  ```

- [ ] Considerar Lightsail snapshot programado (backup del disco completo)
  - `aws lightsail create-auto-snapshot --instance-name emaus-prod`
  - $0.05/GB/mes (40 GB = $2/mes), 7 rolling
  - Alternativa a nuestro AMI viejo

## 📊 Seguimiento de costos

Revisar cada lunes:

```bash
# Costo MTD actual
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost \
  --profile emaus

# Créditos aplicados
aws ce get-cost-and-usage \
  --time-period Start=$(date +%Y-%m-01),End=$(date +%Y-%m-%d) \
  --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"RECORD_TYPE","Values":["Credit"]}}' \
  --profile emaus
```

**Target post-decommission**: ~$7/mes bruto. Con créditos actuales en $0,
cualquier valor >$8 amerita investigación.

## Historial de hitos

| Fecha | Hito |
|---|---|
| 2026-01-12 | Cuenta AWS creada (PAID plan, $100 créditos) |
| 2026-04-12 | Lanzada EC2 `t3a.micro` `i-011986d465e7c8f53` |
| 2026-04-20 | Cloudflare zone activado; Terraform módulo creado; Lightsail provisionada |
| 2026-04-21 | DNS cutover a Lightsail; EC2 viejo `stopped`; app funcional |
| **2026-04-25** | **🎯 Target: terminate EC2 viejo + release EIP** |
| 2026-07-12 | Fin del AWS Free Plan de 6 meses (no afecta — créditos ya agotados) |
| 2026-07-20 | Expira cert Let's Encrypt (renovación automática vía DNS-01) |
