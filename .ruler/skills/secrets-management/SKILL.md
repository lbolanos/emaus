---
name: secrets-management
description: MUST be used al manejar API keys o secretos del proyecto — dónde vive cada secreto (dev/prod/OpenClaw), cómo cambiar una variable de entorno en prod sin romper nada, y el protocolo de respuesta cuando una key se filtra (rotación, verificación de revocación por endpoint, barrido con gitleaks). Triggers — "API key", "key filtrada", "leak", "se filtró", "rotar key", "key expuesta", "cambiar variable en prod", ".env.production", "gitleaks", "secreto hardcodeado", "escanear secretos".
---

# Manejo de secretos y respuesta a leaks

## Reglas de oro

1. **NUNCA hardcodear keys — tampoco en scripts de prueba manuales.** Incidente 2026-07-10: dos keys de Z.AI y una de Gemini quedaron hardcodeadas en `vision-test.mjs` / `test-vision-*.ts` (commit `8c786f6` del 2026-04-15) y pasaron ~3 meses expuestas. Los scripts de prueba ahora leen `ZAI_API_KEY`/`OPENAI_API_KEY`/`ZAI_VISION_API_KEY` del entorno y omiten los casos sin key.
2. **El repo `lbolanos/emaus` es PÚBLICO.** Todo lo commiteado queda en el historial de GitHub para siempre — limpiar el working tree NO des-expone nada; lo esencial es rotar.
3. GitHub secret scanning **no avisa** de keys de Z.AI/Context7 (no son partners) — no esperes alerta automática.

## Dónde vive cada secreto

| Contexto | Archivo | Nota |
| --- | --- | --- |
| Dev local | `apps/api/.env` | gitignored |
| Prod (API) | `/var/www/emaus/apps/api/.env.production` en Lightsail | **fuente de verdad** — el local diverge |
| OpenClaw (Enzo) | `~/.config/systemd/user/openclaw-gateway.service.d/secrets.conf` (en el server) | systemd env vars |
| Backups de env local | `~/emaus-db-backups/` | los `.bak` dentro del repo **NO están gitignored** — nunca dejarlos ahí |

## Cambiar una variable de entorno en prod (procedimiento seguro)

**NUNCA subir el `.env.production` local completo** — diverge de prod (a prod se le agregan vars directo: S3/AWS, vision, `AI_CHAT_MAX_TOKENS`, `SEED_FORCE=false`, `DB_DATABASE` absoluto). Subirlo rompe avatares/vision y puede forzar re-seed. Actualizar solo las líneas puntuales:

```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 '
  F=/var/www/emaus/apps/api/.env.production
  cp $F $F.bak.$(date +%s)
  sed -i "s|^MI_VAR=.*|MI_VAR=nuevo_valor|" $F
  pm2 restart emaus-api --update-env
  for i in 1 2 3 4 5 6; do sleep 5; curl -s -o /dev/null -w "health=%{http_code}\n" http://localhost:3001/api/health && break; done'
```

El API tarda >3s en arrancar — un health inmediato da `000` falso. Para sincronizar el local: bajar el de prod (nunca al revés).

## Protocolo de respuesta a un leak

1. **Rotar/revocar** en el dashboard del proveedor (lo hace el usuario).
2. **Actualizar** la key nueva donde se use: dev `.env`, prod (procedimiento de arriba), `secrets.conf` de OpenClaw si aplica.
3. **Verificar la revocación contra el endpoint correcto** — con la key vieja debe fallar la autenticación:
   - **Z.AI**: probar `POST https://api.z.ai/api/anthropic/v1/messages` con `x-api-key` → esperar `Authentication Failed`. **NO usar `paas/v4`**: devuelve `{"code":"1113","message":"Insufficient balance"}` a nivel de CUENTA incluso con keys válidas (la cuenta usa coding plan, sin saldo de API por tokens) → falso "revocada".
   - **Gemini**: `GET https://generativelanguage.googleapis.com/v1beta/models?key=…` → 400 = inválida, 200 = activa.
   - **Context7**: `GET https://context7.com/api/v1/search?query=x` con `Authorization: Bearer …` → 200 = activa.
4. **Limpiar el código** (leer de env vars) y commitear.
5. **Barrer todo el historial**: `gitleaks detect --source .` (está instalado vía brew; ~1s para los ~700 commits). Revisar cada hallazgo contra la lista de falsos positivos de abajo y probar los reales contra su servicio.
6. Recordar la regla de oro #2: el historial retiene las keys viejas; reescribir historial (BFG/filter-repo) es opcional si ya están revocadas.

## Falsos positivos conocidos de gitleaks en este repo

- `docs/deployment/setup-guide.md` — `BEGIN RSA PRIVATE KEY` es un **placeholder ilustrativo** de la guía, no una key real.
- reCAPTCHA `6Lf_NUss…` (commit `70a6286`) — **demo keys** documentadas como "always return valid score"; la secret real de prod es otra y nunca se filtró.
- `InventoryView.vue` — `'inventory.visibleColumns.v2'` es una clave de localStorage.
- `aiChat.simple.test.ts` — `'sk-ant-123'` es un mock.

## Historial de incidentes

- **2026-07-10**: keys de Z.AI (main + vision) expuestas desde abril en scripts de vision; un tercero drenó el saldo. Rotadas, prod actualizado, código limpiado (commit `7a92950`). La key de Gemini del mismo commit ya estaba inválida. Pendientes detectados ese día: rotar la key de **Context7** en `.ruler/ruler.toml` (activa y pública desde 2026-03-07) y quitar el **AWS Access Key ID** (sin secret; riesgo bajo) de `docs/sessions/2026-04-27-mam-improvements.md`.
