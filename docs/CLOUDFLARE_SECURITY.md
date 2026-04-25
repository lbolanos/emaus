# Cloudflare Edge Security

Qué capas de seguridad gestiona Cloudflare delante de Lightsail, con qué
valores exactos están configuradas hoy y cómo cambiarlas.

Todo vive como código en `infra/cloudflare.tf`. El state de Terraform ya
tiene los recursos importados (2026-04-21), así que `terraform plan` debe
devolver **No changes** al correrlo contra esta config.

---

## Resumen

| Capa | Estado | Recurso Terraform |
|---|---|---|
| Failover Worker | ON | `cloudflare_workers_script.failover` (+ rutas apex/www) |
| Bot Fight Mode | ON | `cloudflare_bot_management.emaus` |
| Rate limit `/api/auth/*` | ON | `cloudflare_ruleset.rate_limit_auth` |
| Web Analytics (RUM) | ON | Gestionado en dashboard (auto-install vía proxy) |

Zone `emaus.cc` (`76f81f5e48b75a90923775f24880309f`) en plan **Free**.

---

## 1. Failover Worker

Ya existía antes de la migración. Envuelve cada request a `emaus.cc/*` y
`www.emaus.cc/*`: si el origen responde 5xx o hace timeout (10s), sirve una
página HTML en español de "en mantenimiento" con código 503 en lugar del
error default de Cloudflare.

- **Source**: `infra/workers/failover.js`
- **Recursos**: `cloudflare_workers_script.failover`, `cloudflare_workers_route.apex`, `cloudflare_workers_route.www`
- **Probar manual**: `ssh ubuntu@18.116.102.104 sudo systemctl stop nginx && curl -sI https://emaus.cc/` → debe devolver 503 con HTML del worker. Reiniciar nginx devuelve 200.

---

## 2. Bot Fight Mode

Bloquea bots conocidos en el edge. Free plan no tiene Bot Management
completo, pero sí el toggle básico `fight_mode`.

**Estado actual** (aplicado vía API el 2026-04-21):

```hcl
resource "cloudflare_bot_management" "emaus" {
  zone_id            = var.cloudflare_zone_id
  fight_mode         = true
  enable_js          = true   # REQUIRED cuando fight_mode=true
  ai_bots_protection = "block"
}
```

**Por qué `enable_js = true`**: la API rechaza `fight_mode=true` sin
`enable_js=true` con mensaje `"cannot enable Fight_Mode while EnableJS is
disabled"`. Cloudflare inyecta un `<script>` en respuestas HTML que carga
`/cdn-cgi/challenge-platform/scripts/jsd/main.js` — es como detecta clientes
headless/automatizados. Verificable con `curl -s https://emaus.cc/ | grep
__CF\$cv\$params`.

**Por qué `ai_bots_protection = "block"`**: era el valor previo del zone y
el PUT del API resetea todo el objeto; hay que re-enviarlo para no perderlo.

**Verificar estado**:
```bash
CF_TOKEN=$(awk -F'"' '/^cloudflare_api_token/{print $2}' infra/terraform.tfvars)
curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  https://api.cloudflare.com/client/v4/zones/76f81f5e48b75a90923775f24880309f/bot_management \
  | python3 -m json.tool
```

---

## 3. Rate Limiting — `/api/auth/*`

Absorbe fuerza bruta / credential stuffing en el edge antes de que llegue a
Lightsail. La app Express ya tiene `loginLimiter` y `passwordResetLimiter`
(ventana más larga); esto es un complemento de throttling agresivo a nivel
edge.

**Estado actual**:

```hcl
resource "cloudflare_ruleset" "rate_limit_auth" {
  zone_id = var.cloudflare_zone_id
  name    = "default"
  kind    = "zone"
  phase   = "http_ratelimit"

  rules {
    description = "10 req/10s per IP on /api/auth/*"
    expression  = "(starts_with(http.request.uri.path, \"/api/auth/\"))"
    action      = "block"
    enabled     = true

    ratelimit {
      characteristics     = ["ip.src", "cf.colo.id"]
      period              = 10
      requests_per_period = 10
      mitigation_timeout  = 10
    }
  }
}
```

### Límites del plan Free

El plan Free fuerza `period = 10` segundos y `mitigation_timeout = 10`
segundos. La API rechaza otros valores con:

- `"not entitled to use the period 60, can only use a period among [10]"`
- `"not entitled to use a mitigation timeout different from 10"`

Es decir: en Free no se puede "bloquear 10 minutos después de 10 intentos
en 1 minuto". Lo más que se puede es **10 req en 10s → block 10s**, que es
~1 req/s sostenido.

### ¿Es suficiente?

- **Usuario real** escribiendo mal la contraseña: toma 2-5 s por intento, no
  alcanza el umbral.
- **Bot** a 50 req/s: primeros 10 pasan, luego block 10s, ciclo se repite —
  deja pasar ~50 intentos/min en el peor caso. No es una muralla, sí es un
  speed bump que combinado con `loginLimiter` del backend (que sí puede
  bloquear más tiempo) da defensa razonable.
- **Real fix** si esto fuera crítico: upgrade a Pro ($20/mo) que permite
  configurar periods/timeouts arbitrarios.

### Verificar estado

```bash
CF_TOKEN=$(awk -F'"' '/^cloudflare_api_token/{print $2}' infra/terraform.tfvars)
curl -sS -H "Authorization: Bearer $CF_TOKEN" \
  https://api.cloudflare.com/client/v4/zones/76f81f5e48b75a90923775f24880309f/rulesets/phases/http_ratelimit/entrypoint \
  | python3 -m json.tool
```

---

## 4. Web Analytics (RUM)

Estadísticas de tráfico sin cookies, reemplazo ligero de Google Analytics.
Configurado en el **dashboard** (no hay permisos en el token para gestionar
por API / Terraform en Free):

- Dashboard → **Analytics & Logs** → **Web Analytics** → site `emaus.cc`
- Auto-install ON: como el dominio está detrás del proxy de Cloudflare, el
  beacon (`https://static.cloudflareinsights.com/beacon.min.js`) se inyecta
  automáticamente en respuestas HTML sin tocar `apps/web/index.html`.

**Verificar**:
```bash
curl -s https://emaus.cc/ | grep cloudflareinsights
```

Puede tardar varios minutos en empezar a inyectarse después de agregar el
site. Si después de una hora no aparece, revisar en el dashboard si el
hostname está marcado como "active".

---

## 5. Token API — permisos requeridos

El token vive en `infra/terraform.tfvars` (gitignored). Los scopes actuales
cubren todo lo de arriba:

| Permiso | Resource | Usado por |
|---|---|---|
| Workers Scripts: Edit | Account | Failover Worker |
| Workers Routes: Edit | Zone | Failover Worker routes |
| DNS: Read | Zone | `data` lookups |
| DNS: Edit | Zone | Futuro: gestión DNS por IaC |
| Bot Management: Edit | Zone | Bot Fight Mode |
| Firewall Services: Edit | Zone | Rulesets (WAF) |
| Account Rulesets: Edit | Account | **Obligatorio** para `http_ratelimit` phase |
| Account Analytics: Read | Account | (opcional, para futuras queries) |

El permiso **Account Rulesets: Edit** se omite fácil porque está en la
sección "Account" aunque los rulesets sean zone-scoped. Sin él la API
devuelve `"request is not authorized"` al crear/editar rulesets de phase
`http_ratelimit`.

---

## 6. Aplicar cambios

El flujo normal es editar `infra/cloudflare.tf` y correr terraform:

```bash
cd infra
terraform plan   # revisar diff
terraform apply
```

Si el binario no está disponible, los endpoints REST equivalentes:

```bash
# Bot Management
curl -X PUT \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"fight_mode": true, "enable_js": true, "ai_bots_protection": "block"}' \
  https://api.cloudflare.com/client/v4/zones/$ZONE_ID/bot_management

# Rate limiting ruleset
curl -X PUT \
  -H "Authorization: Bearer $CF_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rules": [...]}' \
  https://api.cloudflare.com/client/v4/zones/$ZONE_ID/rulesets/phases/http_ratelimit/entrypoint
```

Después de cambios fuera de Terraform, correr `terraform plan` y si muestra
drift, actualizar el `.tf` para que coincida — nunca confiar en que el state
se sincroniza solo.

---

## 7. Anexo — Reconciliación del 2026-04-21

Los dos recursos nuevos de este día se crearon vía API porque el binario de
Terraform no estaba disponible en la sesión. Importados a state después:

```bash
terraform import cloudflare_bot_management.emaus \
  76f81f5e48b75a90923775f24880309f
terraform import cloudflare_ruleset.rate_limit_auth \
  zone/76f81f5e48b75a90923775f24880309f/0814aa1537b4400fb007ebf275d02dab
```

El formato del segundo import requiere el prefijo `zone/` — sin él falla
con `expected import identifier to be resourceLevel/resourceIdentifier/rulesetID`.
