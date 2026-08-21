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

## Respaldar el `.env.production` fuera de la instancia

`backup-db.sh` respalda **solo la base**. El `.env.production` existe únicamente en el disco de
Lightsail, así que perder la instancia significa regenerar y rotar **todos** los secretos de
prod a mano: SES, Google OAuth, InfluxDB, Grafana, las keys de IA y las de AWS. Un snapshot de
Lightsail lo cubre de rebote, pero un snapshot no es un almacén de secretos (y los
auto-snapshots están desactivados).

Procedimiento (hecho por primera vez el 2026-08-20; el resultado vive en
`s3://emaus-media/secrets/env-production-<stamp>.age`):

```bash
# 1. La clave pública se deriva de la privada de Lightsail; NO es secreta.
ssh-keygen -y -f ~/.ssh/lightsail-emaus.pem > /tmp/recipient.pub
# 2. Bajar el archivo y cifrarlo ANTES de que toque cualquier bucket.
scp -i ~/.ssh/lightsail-emaus.pem \
  ubuntu@18.116.102.104:/var/www/emaus/apps/api/.env.production /tmp/env.plain
age -R /tmp/recipient.pub -o /tmp/env.age /tmp/env.plain
# 3. Verificar el round-trip: un backup que no descifra no es un backup.
diff <(age -d -i ~/.ssh/lightsail-emaus.pem /tmp/env.age) /tmp/env.plain && echo OK
# 4. Subir a un prefijo privado y borrar el claro.
aws s3 cp /tmp/env.age s3://emaus-media/secrets/env-production-$(date +%Y%m%d_%H%M%S).age \
  --sse AES256 --profile emaus
shred -u /tmp/env.plain /tmp/recipient.pub
```

Restaurar: `aws s3 cp s3://… - --profile emaus | age -d -i ~/.ssh/lightsail-emaus.pem`

Tres cosas que muerden:

- **`age -p` (passphrase) no funciona desde Claude Code.** Necesita un TTY para preguntar, y
  bajo el prefijo `!` el script no tiene `/dev/tty`: falla con *"could not read passphrase:
  standard input is not a terminal"*. Por eso el procedimiento usa cifrado asimétrico
  (`age -R`), que no pregunta nada. Con passphrase solo funciona en una terminal de verdad.
- **La llave de Lightsail pasa a proteger también este backup.** No añade exposición (quien la
  tenga ya puede leer el archivo por SSH), pero esa llave se vuelve el punto único: sin ella no
  hay restauración. Tiene que estar respaldada en el gestor de contraseñas.
- **Es una foto, no un backup vivo.** Cada vez que cambie una variable en prod hay que repetirlo.
  El prefijo `secrets/` queda fuera del statement `PublicReadGetObject` de la policy del bucket
  (que solo cubre `avatars/` y `public-assets/`) — verificar con un GET anónimo que da 403.

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
- **2026-07-27**: cerrado el pendiente de **Context7**. La key (`ctx7sk-…e2f3`) llevaba **4,5 meses pública** en `.ruler/ruler.toml` — commit `69e6c7d` del 2026-03-07 — y el dashboard registraba uso reciente que no correspondía a ninguna invocación en el historial de Claude Code (posible uso ajeno). **Revocada.** No se generó reemplazo: Context7 funciona **sin API key** (el key solo sube rate limits), y los demás repos ya lo usaban keyless. El servidor MCP se eliminó de `emaus`, `GiK` y `defybots_svn`; en todo el historial hubo **1 sola invocación real** (en NewCariAI, único que lo conserva, sin clave).
  - Regla que se deriva: **por defecto ruler hace *merge* sobre `.mcp.json`**. Quitar un servidor del `ruler.toml` no lo quita del generado — el servidor, y su key, sobreviven. **Desde 2026-07-27 todos los repos aplican con `ruler apply --mcp-overwrite`**, que reemplaza el archivo en vez de mezclarlo; el `ruler:apply` de `package.json` ya lo lleva.
    - ⚠️ **El flag no cubre un caso**: si `ruler.toml` se queda **sin ningún** `[mcp_servers.*]`, ruler se salta el paso de MCP por completo y el `.mcp.json` viejo sobrevive intacto. Al quitar el *último* servidor de un repo, hay que borrar el archivo a mano. Verificado con experimento controlado, no supuesto.
- **2026-07-27 (cont.)**: revisados los dos hallazgos que quedaban. Ninguno requiere rotación:
  - **`private-key` en `docs/deployment/setup-guide.md`** (commit `0b5f962`, 2026-01-31) → **falso positivo confirmado**. Es el ejemplo de qué copiar al secret `EC2_SSH_PRIVATE_KEY` de GitHub Actions: cuerpo truncado (`MIIEpAIBAAKCAQEA...` + `[middle section with many lines]`), no reconstruible. `MIIEpAIBAAKCAQEA` es el prefijo DER de *cualquier* RSA-2048, de ahí el match. Ya estaba en la lista de falsos positivos de arriba — el bullet de "pendiente" era una contradicción del propio doc.
  - **AWS Access Key ID en `docs/sessions/2026-04-27-mam-improvements.md`** (commit `b5a0151`, 2026-05-03, ~2,8 meses público) → **quitado del doc**. La key sigue `Active` en IAM (única del user `emaus-app`, creada 2026-04-27) pero **el secret nunca se commiteó** — el doc solo decía "secret de 40 chars". Sin el secret un AKIA no autentica (SigV4 lo exige), así que no hubo acceso posible; lo que exponía era reconocimiento: account ID + nombre del IAM user + policy + prefijos del bucket. **Rotar es opcional.** Si algún día se filtra ese secret, el blast radius es `GetObject/PutObject/DeleteObject` sobre 6 prefijos de `emaus-media` — incluido **`backups/database/*`**.

## Prevención automática: gitleaks en el pre-commit

El agujero real de los incidentes de julio no fue detectar mal, fue **detectar tarde y a mano**: `gitleaks` estaba instalado vía brew pero no conectado a ningún hook, así que una key podía vivir meses en un repo público hasta que alguien corriera el barrido manualmente. Desde 2026-07-27 el `.husky/pre-commit` corre `gitleaks git --staged` **antes** de `lint-staged` (~20ms) y aborta el commit si encuentra algo.

- Config: **`.gitleaks.toml`** en la raíz (`[extend] useDefault = true` + allowlists). Los allowlists filtran **por valor literal, nunca por path** — a propósito: si alguien pega un secreto real en `.env.example`, se detecta igual. Verificado: sin la config habría 4 falsos positivos bloqueando commits legítimos; con ella, 0, y un `GOCSPX-…` o un secret de 40 chars pegado en `.env.example` sí dispara.
- **Falso positivo nuevo → agregarlo a `.gitleaks.toml`**, no `--no-verify`.
- Si `gitleaks` no está instalado el hook avisa y continúa (no rompe a quien no lo tenga) — o sea **el hook es best-effort y se salta con `--no-verify`**.
- **Backstop que no se puede saltar**: workflow propio **`.github/workflows/secret-scan.yml`** (mismo `.gitleaks.toml`), con `on: push` **sin filtro de ramas** + `pull_request`. No vive en `ci.yml` a propósito: ese workflow excluye `master` del trigger de push ("Deploy workflow handles it") pero `deploy-production.yml` **no lo invoca** — duplica lint/test/build por su cuenta. Un job de secretos dentro de `ci.yml` nunca correría en los pushes directos a master, que es el flujo habitual del repo. Instala gitleaks pinneado a 8.30.1 con checksum verificado y corre dos escaneos: `gitleaks dir .` sobre el árbol (14,9 MB / 1800 archivos / ~0,6s) y, en PRs, `gitleaks git --log-opts=base..head` sobre el rango — este segundo cierra el hueco de un secreto añadido y borrado dentro del mismo PR, que deja el árbol limpio pero sobrevive en el historial si el merge no es squash. Validado contra los dos incidentes reales: el commit del AKIA (`b5a0151`) da 1 hallazgo y el de las keys de Z.AI (`8c786f6`) da 6 — ambos habrían sido bloqueados.
- Ese job **no debe instalar dependencias**: `gitleaks dir` no respeta `.gitignore`, así que un `pnpm install` arrastraría `node_modules` (~1,2 GB → 35 falsos positivos de terceros).
- Límite conocido: gitleaks silencia valores que contienen stopwords como `EXAMPLE`, por eso el `wJalrXUtnFEMIK7MDENGbPxRfiCYzEXAMPLEKEY9` de la doc de AWS no dispara. Correcto por diseño, pero no confundir con cobertura.
