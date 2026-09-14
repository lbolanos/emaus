---
name: prod-performance-triage
description: "Triage de lentitud percibida en producción: descomponer la latencia por capas (servidor Lightsail, API local, origen directo, Cloudflare) antes de tocar nada. Incluye el test A/B con --resolve para saltarse Cloudflare, la medición de distribución (p50/p90) en una sola conexión, el diagnóstico del server por SSH (load, swap por proceso, handles de la SQLite, reinicios de pm2) y el barrido de la zona de Cloudflare por API (token read-only, settings, workers routes). Usar cuando el usuario reporte que prod 'está lento', 'tarde en responder' o que la app 'se siente pesada', y no esté claro si la culpa es del servidor, del API, de la red o de Cloudflare."
---

# Triage de lentitud en producción — Emaús

## Filosofía

"Está lento" es un problema de **atribución**, no de optimización. Antes de tocar nada, medir
el **mismo endpoint** (`/api/health`) por las 4 capas y comparar. El primer nivel cuyo número
se dispara es el culpable. Nunca concluir desde una sola medición puntual: usar distribuciones
(15 requests) y repetir con User-Agent de navegador (Cloudflare trata distinto a `curl`).

Referencia del caso 2026-09-14 (números sanos vs. rotos):

| Capa | Sano | Roto (caso real 2026-09-14) |
|---|---|---|
| API local (`localhost:3001`) | 5–8 ms | 5 ms (sano) |
| Origen directo desde fuera (`--resolve`) | p50 0.07 s | p50 0.07 s (sano) |
| Vía Cloudflare | p50 ≈ origen + <50 ms | p50 0.54 s, p90 1.2 s, max 1.8 s |
| Diagnóstico | — | origin pull CF→origen errático (~0.4 s p50, p90 1.7 s), no el Worker |

## Capa 1 — Servidor (SSH)

> Llave, IP y datos de acceso → skill **`infra-remota`**. El log de nginx correcto es
> `emaus-access.log`, no `access.log`.

```bash
KEY=~/.ssh/lightsail-emaus.pem; HOST=ubuntu@18.116.102.104
ssh -i $KEY $HOST "uptime && free -m && df -h / && ps aux --sort=-%cpu | head -8"
ssh -i $KEY $HOST "pm2 status && pm2 describe emaus-api | grep -E 'restarts|uptime|status'"
```

Qué mirar:

- **load average 0 + CPU idle** = el server no es el problema; seguir a capa 2.
- **Swap usado alto pero `si`/`so` = 0** (`vmstat 1 3`) = swap de procesos muertos, no duele
  activamente, pero quita margen. Buscar dueños: iterar `/proc/<pid>/status` → `VmSwap` sobre
  los PIDs de node.
- **pm2 `↺` alto**: mirar `unstable restarts`. Si es 0 y los arranques del log
  (`grep 'Found .env.production' ~/.pm2/logs/emaus-api-error.log`) coinciden con fechas de
  `dist/`, son **deploys**, no crash-loop. Un arranque hace <30 min = warmup posible, no bug.
- **DB**: `lsof /var/www/emaus/apps/api/database.sqlite` (¿quién la tiene abierta?),
  `ls -lh …sqlite*` (WAL de MBs = problema; cientos de KB = normal),
  `grep -c 'database is locked'` en el log del API.
- **499/502/504 en `emaus-access.log`** = usuarios cancelando por timeout. Su ausencia no
  descarta lentitud (el SPA espera).
- **Procesos `vite-node` colgados** de scripts de datos (`crear-*.ts`, `limpiar-*.ts`):
  quedan esperando confirmación interactiva para siempre. Cero CPU, puro swap.

### Matar procesos colgados (con cuidado)

1. Antes: `lsof` de la DB para confirmar que **no** tienen la SQLite abierta, y mirar si
   dejaron log en `/tmp/*.log`.
2. Listar PIDs exactos: `pgrep -af 'crear-veracru[z]'` (el `[z]` evita que el patrón se
   auto-matchee en la línea de comando del propio ssh).
3. Matar **por PID explícito** (`kill <pids…>`): `pkill -f` a través de SSH lo bloquea el
   permission classifier de Claude Code y además arriesga matchear la sesión propia.
4. Verificar: swap bajó, API intacta (`pm2 status`).

## Capa 2 y 3 — API local y origen directo

```bash
# Dentro del server (puerto PROD 3001, no dev 3084):
for i in 1 2 3 4 5; do curl -s -o /dev/null -w '%{time_total}s\n' http://localhost:3001/api/health; done

# Desde fuera, SALTÁNDOSE Cloudflare (midé junto con la capa 4):
curl --resolve emaus.cc:443:18.116.102.104 -o /dev/null -w 'tls=%{time_appconnect} ttfb=%{time_starttransfer}\n' https://emaus.cc/api/health
```

- Sin `-k`: valida que el cert del origen sirve sin Cloudflare (prerrequisito para plantear
  DNS-only). El cert cubre `emaus.cc` y `www.emaus.cc`.
- `--resolve` es exactamente lo que vería el usuario en modo DNS-only (nube gris).

## Capa 4 — Vía Cloudflare: distribución, no puntos

Medir 15 requests **en una sola conexión** (lo que hace el browser con HTTP/2) y comparar
contra origen directo en la misma corrida:

```bash
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/152.0.0.0 Safari/537.36'
URLS=$(printf 'https://emaus.cc/api/health %.0s' $(seq 1 15))
OARGS=$(printf -- '-o /dev/null %.0s' $(seq 1 15))
stats() { grep -oE '[0-9]+\.[0-9]+' | sort -n | awk '{a[NR]=$1} END {printf "min=%.3f p50=%.3f p90=%.3f max=%.3f n=%d\n", a[1], a[int((NR+1)*0.5)], a[int(NR*0.9)+1], a[NR], NR}'; }
curl -s -A "$UA" $OARGS -w 'ttfb=%{time_starttransfer}\n' $URLS | stats
curl -sk --resolve emaus.cc:443:18.116.102.104 $OARGS -w 'ttfb=%{time_starttransfer}\n' $URLS | stats
```

> ⚠️ **zsh**: el Bash tool de Claude Code corre zsh, que **no hace word-splitting** de
> `$URLS`/`$OARGS` sin comillas → curl recibe las 15 URLs como un solo argumento y muere con
> `curl: (3) URL rejected: Malformed input to a URL function` (n=1, todo 0.000). Usar
> `${=URLS}` / `${=OARGS}`, o guardar el script y correrlo con `bash script.sh`. Diagnosticar
> con `-sS` y `err=[%{errormsg}]` en el `-w` antes de asumir que la ruta está caída.

Lectura: si CF añade <100 ms sobre el origen directo → CF normal, mirar la app. Si añade
cientos de ms erráticos → algo de la zona procesa cada request (ver barrido API). Repetir
con UA de navegador antes de concluir: **Bot Fight Mode trata distinto a `curl`** (devuelve
403 desde IPs de datacenter, p.ej. desde el propio servidor).

Costo por clic del SPA: ~4–6 requests (chunk lazy + endpoints + csrf + telemetría); manda el
más lento. Además, cada deploy regenera los hashes de assets → MISS de caché al día
siguiente.

### Aislar el origin pull: HIT vs DYNAMIC

Si CF añade cientos de ms erráticos y el barrido de zona no encuentra nada, separar el tramo
edge→origen: un **asset cacheado** (HIT, no toca origen) contra un endpoint **DYNAMIC**
(`/api/*`, siempre va al origen), ambos por IPv4 y con la caché calentada antes:

```bash
JS=$(curl -s https://emaus.cc/ | grep -oE '/assets/[^"]+\.js' | head -1)
for i in 1 2 3; do curl -4 -s -o /dev/null "https://emaus.cc$JS"; done   # calentar
curl -4 -s -D - -o /dev/null "https://emaus.cc$JS" | grep -i cf-cache-status  # confirmar HIT
# luego el mismo multi-URL de 15 requests sobre $JS y sobre /api/health y comparar
```

Lectura: HIT rápido + DYNAMIC lento = el origen y su ruta (origin pull) son el problema —
no la zona, no el Worker. En plan Free eso no tiene fix dentro de CF → nube gris (DNS-only).

## Barrido de la zona Cloudflare por API

Token read-only acotado (dash.cloudflare.com/profile/api-tokens → Custom token), permisos
que funcionaron: **Zone:Read, Zone Settings:Read, Analytics:Read, Firewall Services:Read,
Config Rules:Read, Workers Routes:Read** (zona emaus.cc) + **Workers Scripts:Read** (cuenta).
Client IP filtering = la IP del usuario (las llamadas salen de su Mac). TTL corto y
**revocar al cerrar el caso**.

El token vive en `~/.cf-emaus-token` (chmod 600) — **fuera del repo, nunca versionado**.

```bash
TOKEN=$(cat ~/.cf-emaus-token)
Z=$(curl -s "https://api.cloudflare.com/client/v4/zones?name=emaus.cc" -H "Authorization: Bearer $TOKEN" | python3 -c 'import json,sys;print(json.load(sys.stdin)["result"][0]["id"])')

# 1. PRIMERO ESTO — un Worker enrutado a zona/* envuelve TODA petición:
curl -s "https://api.cloudflare.com/client/v4/zones/$Z/workers/routes" -H "Authorization: Bearer $TOKEN"
# Y bajar el código del worker sospechoso:
curl -s "https://api.cloudflare.com/client/v4/accounts/<account_id>/workers/scripts/<nombre>" \
  -H "Authorization: Bearer $TOKEN" -H "Accept: application/javascript"

# 2. Settings de la zona (rocketloader, waf, security_level, cache_level, …):
curl -s "https://api.cloudflare.com/client/v4/zones/$Z/settings" -H "Authorization: Bearer $TOKEN"
# 3. Reglas: firewall/rules, pagerules, rulesets (rate limits custom).
# 4. Colos que sirvieron el tráfico (GraphQL, POST /client/v4/graphql):
#    httpRequestsAdaptiveGroups agrupado por dimensions { coloCode }
```

Orden de sospechosos **para investigar**: **worker route en `zona/*`** (envuelve cada
request; es el #1 por diseño) ≫ settings raros (rocket_loader, always_online) ≫ reglas
WAF/rate-limit ≫ colo lejano (plan free no tiene México; el tráfico va a DFW/EWR). Pero el
caso 2026-09-14 demostró que el sospechoso #1 puede ser inocente: **exonerar con experimento
controlado** (desactivar la ruta, re-medir capa 4, restaurar) antes de concluir. Si nada de
la zona explica la latencia, el culpable es el **origin pull** edge→origen — medirlo con el
test HIT vs DYNAMIC (asset cacheado no toca origen; `/api/*` siempre sí).

## Hallazgos del caso 2026-09-14 (CERRADO — resolución: nube gris DNS-only)

### Qué era y qué no era

- **Servidor y API: sanos.** Backend local 5 ms; `--resolve` directo p50 0.07 s. Se limpiaron
  además 16 procesos `vite-node` colgados de Veracruz (swap 658→126 MB, available 356→430 MB)
  — necesario pero no la causa.
- **Worker `emaus-failover`: EXONERADO.** Sospechoso #1 (proxy enrutado a `emaus.cc/*` y
  `www.emaus.cc/*`, re-envía cada request con timeout 10 s y convierte 5xx en HTML de
  mantenimiento). Experimento controlado: borrar las dos rutas y re-medir → **no mejoró**
  (p50 0.371→0.529). Rutas restauradas. Lección: correlación ≠ causalidad; exigir el
  experimento on/off antes de culpar.
- **Hipótesis AAAA (IPv6 sintetizado por CF): DESCARTADA.** La zona **no tiene registro
  AAAA**. Lección dura del caso: se "leyó" un AAAA en un screenshot del dashboard que no
  estaba ahí. **Verificar el dato real** (API: `GET /zones/<id>/dns_records`) o la lista de
  records del usuario — nunca inferir de capturas de pantalla.
- **Causa real: origin pull CF→origen errático.** Test HIT vs DYNAMIC: asset en caché (HIT,
  no toca origen) rápido y estable; `/api/health` (DYNAMIC, siempre va al origen) con el
  exceso completo de latencia (~0.4 s p50, p90 1.7 s). El edge que servía al usuario (DFW)
  hace peer hacia AWS us-east-2 por una ruta mala, y el plan Free no ofrece control del
  origin pull. Componente adicional: el ISP mandaba `emaus.cc` a DFW mientras
  `cloudflare.com` iba a QRO (20 ms).
- **Resolución aplicada**: nube gris (DNS-only) en el A raíz y el CNAME www. El cert Let's
  Encrypt del origen cubre ambos dominios (válido hasta 17-Nov-2026, validado sin `-k`).
  Números finales: **vía CF p50 0.54 / p90 1.23 / max 1.82 → directo p50 0.069 / p90 0.071 /
  max 0.21** — y p50 ≈ p90: la variabilidad errática ("lentitud en cada clic") desapareció.

### Estado tras el cambio (decisiones, no pendientes)

- El Worker `emaus-failover` sigue existiendo con sus rutas activas, pero **no corre** en
  DNS-only (el tráfico ya no pasa por CF). Si algún día se quiere página de mantenimiento,
  hacerla en **nginx** (`error_page 502 503 504 /maintenance.html;`) — cero latencia añadida
  y no rompe el parseo JSON del frontend como sí lo hacía el Worker con errores reales.
- Trade-off asumido: la IP del origen queda expuesta y sin escudo DDoS de CF. Si aparece
  abuso, endurecer nginx (rate limit por IP, fail2ban) o reactivar la nube naranja
  aceptando el costo de latencia.
- Tras un cambio nube naranja→gris: verificar propagación con `dig @1.1.1.1 emaus.cc A
  +short` (no el resolver local — la caché de la Mac vive el TTL, ~5 min, y mientras tanto
  sigue yendo al edge).

### Higiene de cierre

- Borrar `~/.cf-emaus-token` (y cualquier token de edición creado para el experimento,
  p. ej. `~/.cf-routes-edit-token`) y que el usuario revoque ambos en
  dash.cloudflare.com/profile/api-tokens.
