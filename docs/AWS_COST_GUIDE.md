# AWS Cost Guide — Cuenta `emaus`

Guía de referencia para entender y monitorear los costos de la cuenta AWS del proyecto emaus.

## Datos de la cuenta

- **Account ID**: `585853725478`
- **Account Name**: `lbolanos`
- **Creada**: 2026-01-12
- **Tipo de plan**: PAID (de pago)
- **Región principal**: `us-east-2` (Ohio)
- **Perfil AWS CLI**: `emaus`

## Recursos en producción (post-migración, 2026-04-21)

| Recurso | ID | Tipo | Costo |
|---|---|---|---|
| **Lightsail instance** | `emaus-prod` (us-east-2a) | `micro_3_0` (1 GB, 2 vCPU, 40 GB SSD) | **$7/mo** bundle (compute + IPv4 + 2 TB transfer) |
| **Static IP** | `emaus-ip` → `18.116.102.104` | — | $0 (bundled) |
| **IAM user** | `emaus-lightsail-app` | Access key para S3 | $0 |
| **Lambda** | `emaus-ec2-scheduler` | python3.12, 128 MB (DISABLED) | $0 (always-free) |
| **EventBridge schedules** | `stop`, `start` | DISABLED post-migración | $0 |
| **Cloudflare Worker** | `emaus-failover` | ES module, 100k req/día free | $0 |
| **S3 bucket** | `emaus-media` | Standard, <1 GB | ~$0 |
| **AWS Budget** | `Emaus-Monthly-Budget` ($40 threshold) | Alertas email | $0 |

**Total mensual proyectado**: ~$7 USD.

## Recursos legacy (a decomisionar)

| Recurso | ID | Estado actual | Acción pendiente |
|---|---|---|---|
| EC2 instance | `i-011986d465e7c8f53` | `stopped` (desde 2026-04-21) | Terminar tras 1 semana observación |
| Elastic IP | `eipalloc-0c926bec959d0098a` (`3.138.49.105`) | Asignada al EC2 stopped | Liberar al terminar EC2 |
| EBS volume | `vol-0e6f21654d9220b12` | `in-use` por el EC2 stopped | Se borra auto con terminate (DeleteOnTermination) |
| EBS snapshot | `snap-0953f324c12a7294d` | AMI `emaus-backup-20260317-2312` | Conservar como backup histórico |

**Costo actual por recursos legacy** (mientras estén):
- EBS gp3 20 GB: ~$1.60/mo
- EIP in-use: ~$3.65/mo (mientras EC2 esté stopped, sí cobra)
- Snapshot 20 GB: ~$1/mo

→ **Decomisionar ASAP** para no pagar doble después del grace period de validación.

Ver [`infra/README.md`](../infra/README.md) para el Terraform.
Ver [`deploy/lightsail/README.md`](../deploy/lightsail/README.md) para el deploy workflow.
Ver [`LIGHTSAIL_MIGRATION_NOTES.md`](./LIGHTSAIL_MIGRATION_NOTES.md) para runbook + gotchas.

## Free Tier — cambio de política julio 2025

**Importante**: esta cuenta fue creada despues del 15 de julio de 2025, por lo que NO aplica el Free Tier clasico de 12 meses.

### Legacy Free Tier (cuentas pre 15-jul-2025)
- 750 hrs/mes de EC2 t2/t3.micro Linux
- 30 GB-mes de EBS (cualquier combinacion de gp2, gp3, standard, st1, sc1)
- 1 GB de snapshot storage
- Duracion: 12 meses

### Nuevo Free Plan (cuentas post 15-jul-2025) — tu caso
- $100 USD creditos iniciales + hasta $100 adicionales por completar actividades
- Duracion: 6 meses o hasta agotar creditos
- Todos los servicios se cobran a precio normal y se descuentan del pool de creditos
- Al agotarse los creditos o cumplirse 6 meses, se cobra a la tarjeta

### Confusion comun: gp3 en Free Tier

**gp3 SI esta incluido en el legacy Free Tier** junto con `standard`, `st1`, `sc1` y `gp2`. Ver [AWS docs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html). No es necesario migrar de gp3 a gp2.

## Estado actual de creditos (abril 2026)

- **Creditos iniciales recibidos**: $100 USD
- **Creditos restantes**: **$0.00 USD** (agotados)
- **Consumo mensual de creditos**:
  - Enero: $7.44
  - Febrero: $17.70
  - Marzo: $47.37
  - Abril MTD: $27.49

A partir de ahora (abril 2026), el costo se cobra a la tarjeta de credito registrada.

### Actividades pendientes para ganar creditos extra

Cada una otorga $20 USD al completarse:

| Actividad | Estado |
|---|---|
| Launch an instance using EC2 | IN_PROGRESS |
| Use a foundation model in Amazon Bedrock | NOT_STARTED |
| Set up a cost budget using AWS Budgets | NOT_STARTED |
| Create a web app using AWS Lambda | NOT_STARTED |
| Create an Aurora or RDS database | NOT_STARTED |

**Recomendado primero**: "Set up a cost budget using AWS Budgets" — util como alerta y gana $20.

## Desglose de costos — abril 2026 (MTD 1-18 abr, region us-east-2)

| Usage Type | Costo USD | Descripcion |
|---|---|---|
| `PublicIPv4:InUseAddress` | $2.055 | IPv4 publica asignada (AWS cobra $0.005/hr desde feb 2024) |
| `EBS:VolumeUsage.gp3` | $0.585 | 20 GB gp3 root volume |
| `EBS:SnapshotUsage` | $0.343 | 20 GB snapshot |
| `BoxUsage:t3a.micro` | $0.051 | EC2 compute |
| `PublicIPv4:IdleAddress` | $0.004 | IPs publicas no asociadas |
| Cost Explorer API | $0.030 | Llamadas a `aws ce` |
| Otros | ~$0 | S3, KMS, VPC endpoints, transferencia |
| **Total bruto** | **~$3.06** | |

Proyeccion mes completo: **~$5 USD**

## Ciclo de facturacion

- **Cierre de mes**: ultimo dia del mes a las 23:59 UTC
- **Emision de factura**: primeros 3-5 dias del mes siguiente
- **Cobro automatico**: a la tarjeta registrada el mismo dia o hasta ~15 dias despues

## Comandos utiles AWS CLI

Todos los comandos usan `--profile emaus`.

### Costos

```bash
# Costo total del mes actual
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-30 \
  --granularity MONTHLY --metrics UnblendedCost \
  --profile emaus

# Desglose por servicio
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-30 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --profile emaus

# Desglose por tipo de uso (identifica recursos caros)
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-30 \
  --granularity MONTHLY --metrics UnblendedCost \
  --group-by Type=DIMENSION,Key=USAGE_TYPE \
  --profile emaus

# Creditos aplicados
aws ce get-cost-and-usage \
  --time-period Start=2026-04-01,End=2026-04-30 \
  --granularity MONTHLY --metrics UnblendedCost \
  --filter '{"Dimensions":{"Key":"RECORD_TYPE","Values":["Credit","Refund"]}}' \
  --profile emaus
```

**Nota**: cada llamada a `aws ce` cuesta $0.01 USD.

### Free Tier / creditos

```bash
# Estado del plan y creditos restantes
aws freetier get-account-plan-state --profile emaus --region us-east-1

# Uso Free Tier (servicios "Always Free")
aws freetier get-free-tier-usage --profile emaus --region us-east-1

# Actividades pendientes para ganar creditos
aws freetier list-account-activities --profile emaus --region us-east-1
```

### Inventario de recursos

```bash
# Instancias EC2
aws ec2 describe-instances --region us-east-2 --profile emaus \
  --query 'Reservations[].Instances[].[InstanceId,InstanceType,State.Name,LaunchTime,PublicIpAddress,Tags[?Key==`Name`].Value|[0]]' \
  --output table

# Elastic IPs
aws ec2 describe-addresses --region us-east-2 --profile emaus \
  --query 'Addresses[].[PublicIp,AllocationId,AssociationId,InstanceId]' \
  --output table

# Volumenes EBS
aws ec2 describe-volumes --region us-east-2 --profile emaus \
  --query 'Volumes[].[VolumeId,Size,VolumeType,State,Attachments[0].InstanceId]' \
  --output table

# Snapshots
aws ec2 describe-snapshots --region us-east-2 --profile emaus --owner-ids self \
  --query 'Snapshots[].[SnapshotId,VolumeSize,StartTime,Description]' \
  --output table
```

## Optimizacion de costos

Con creditos ya agotados y factura proyectada ~$5/mes, las opciones son:

### 1. Mantener todo (costo ~$5/mes)
Aceptable si la app es critica y se usa.

### 2. Apagar cuando no se usa

#### 2a. Manual
```bash
# Stop (no cobra compute, pero sigue cobrando EBS + EIP)
aws ec2 stop-instances --instance-ids i-011986d465e7c8f53 --region us-east-2 --profile emaus

# Start
aws ec2 start-instances --instance-ids i-011986d465e7c8f53 --region us-east-2 --profile emaus
```
Ahorro marginal (~$0.05/mes de compute). **No ayuda mucho** porque la IP y el disco siguen cobrando.

#### 2b. Automatico con Lambda — `infra/` (ya desplegado)

Se apaga Lun-Vie 23:00 CDMX y se prende 07:00 CDMX, sin apagar cuando hay
retiro activo. Ver [`infra/README.md`](../infra/README.md). Costo del
scheduler: **$0/mes** (Lambda + EventBridge always-free). Ahorro esperado en
compute: **~$1.63/mes** en el mejor escenario (on-demand 24/7), menos si ya
se estaba usando poco.

```bash
# Invocar manualmente (prueba)
aws lambda invoke --function-name emaus-ec2-scheduler \
  --cli-binary-format raw-in-base64-out \
  --payload '{"action":"stop"}' \
  --profile emaus /tmp/resp.json && cat /tmp/resp.json

# Logs
aws logs tail /aws/lambda/emaus-ec2-scheduler --follow --profile emaus
```

### 3. Eliminar Elastic IP (ahorra ~$3.65/mes)
Solo si se acepta perder la IP fija y usar IP dinamica al iniciar:
```bash
aws ec2 disassociate-address --association-id eipassoc-09366b1e84cb69a36 --region us-east-2 --profile emaus
aws ec2 release-address --allocation-id eipalloc-0c926bec959d0098a --region us-east-2 --profile emaus
```

### 4. Alternativas al Elastic IP publico
- **Migrar a Lightsail** — elegida como camino oficial; ver `infra/` y `deploy/lightsail/`. Precio bundled incluye IPv4 ($7/mo todo incluido vs $14/mo actual)
- **Cloudflare Tunnel** (gratis) — exponer servicios sin IP publica (no elegido por complejidad IPv6-only)
- **Tailscale** (gratis hasta 3 usuarios) — acceso privado tipo VPN
- **IPv6** — AWS no cobra por IPv6

### 5. Eliminar snapshots viejos (ahorra ~$0.60/mes)
```bash
aws ec2 deregister-image --image-id <ami-id> --region us-east-2 --profile emaus
aws ec2 delete-snapshot --snapshot-id snap-0953f324c12a7294d --region us-east-2 --profile emaus
```

### 6. Apagar todo (costo $0)
Terminar instancia, liberar IP, borrar volumen y snapshot. Si el proyecto no esta en uso activo.

## Monitoreo recomendado

1. **AWS Budgets**: crear budget de $5/mes con alerta al 80%. Ademas gana $20 en creditos.
2. **Cost Anomaly Detection**: alerta por gastos inusuales.
3. **Revisar mensualmente** con `aws ce get-cost-and-usage` los primeros de cada mes.

## Referencias

- [AWS Free Tier cambios julio 2025 (blog oficial)](https://aws.amazon.com/blogs/aws/aws-free-tier-update-new-customers-can-get-started-and-explore-aws-with-up-to-200-in-credits/)
- [AWS Free Tier FAQs](https://aws.amazon.com/free/free-tier-faqs/)
- [EC2 Free Tier tracking docs](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/ec2-free-tier-usage.html)
- [Amazon EBS pricing](https://aws.amazon.com/ebs/pricing/)
- [Public IPv4 charges (feb 2024)](https://aws.amazon.com/blogs/aws/new-aws-public-ipv4-address-charge-public-ip-insights/)

---
*Investigado: 2026-04-20 · Migrado a Lightsail: 2026-04-21*
