---
name: openclaw
description: "Guia completa de OpenClaw: conexion, configuracion, arquitectura y lecciones aprendidas"
---

# OpenClaw — Guia Completa

## Que es OpenClaw

OpenClaw es una plataforma de agente AI que corre como daemon en un servidor. Gestiona canales de comunicacion (WhatsApp, Telegram) y responde mensajes usando un modelo AI configurable. El agente se llama **Enzo**.

## Conexion al Servidor

### SSH
```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104
```

### Inicializar entorno Node (REQUERIDO antes de usar npx)
```bash
export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"
```

Sin esto, `npx openclaw` no se encuentra. Incluir en cada comando SSH remoto:
```bash
ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104 'export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"; npx openclaw channels status --probe'
```

## Arquitectura

### Componentes
- **Daemon/Gateway**: Proceso que corre como servicio systemd (`openclaw-gateway.service`), escucha mensajes entrantes y los procesa con el modelo AI
- **Canales**: WhatsApp (via Baileys), Telegram — cada canal tiene su propia autenticacion y config
- **SOUL.md**: Archivo de instrucciones que define la personalidad y reglas del agente
- **Skills**: Capacidades modulares del agente (en `~/emaus-dev/skills/`)
- **Workspace**: Directorio de trabajo del agente (`~/.openclaw/workspace/`)

### Flujo de un mensaje
1. Mensaje llega por canal (WhatsApp/Telegram)
2. Gateway verifica `allowFrom` — si el numero no esta, lo ignora
3. Gateway pasa el mensaje al modelo AI con contexto de SOUL.md + skills
4. Modelo genera respuesta
5. Gateway envia respuesta por el mismo canal

## Estructura de Archivos (en servidor emaus.cc)

```
~/.openclaw/
├── openclaw.json                    # Config principal
├── whatsapp-allowed-contacts.json   # Lista de contactos autorizados para envio
├── workspace/
│   └── SOUL.md                      # Reglas de comportamiento del agente (EL QUE IMPORTA)
└── credentials/
    └── whatsapp/                    # Sesion de WhatsApp Web (Baileys)

~/emaus-dev/
├── SOUL.md                          # OTRA copia de SOUL.md (NO es la que OpenClaw lee)
└── skills/
    ├── whatsapp-send/SKILL.md       # Skill de envio seguro
    └── whatsapp-admin/SKILL.md      # Skill de admin WhatsApp
```

**CRITICO**: OpenClaw lee `~/.openclaw/workspace/SOUL.md`, NO `~/emaus-dev/SOUL.md`. Son archivos diferentes. Siempre editar el de workspace.

## Configuracion Principal (openclaw.json)

### Campos clave

```json
{
  "agent": {
    "name": "Enzo",
    "provider": "zai",
    "model": "glm-4.7"
  },
  "providers": {
    "zai": {
      "baseUrl": "https://api.z.ai/api/coding/paas/v4",
      "apiKey": "VALOR_DIRECTO"
    }
  },
  "channels": {
    "whatsapp": {
      "dmPolicy": "allowlist",
      "allowFrom": ["+525511406977", "+5215511406977", "..."]
    }
  }
}
```

### Reglas importantes de configuracion

1. **API Keys**: SIEMPRE usar valor directo, NUNCA `${ENV_VAR}`. Las variables de entorno causan crash si faltan: `"required secrets are unavailable"`

2. **allowFrom**: Controla TANTO mensajes entrantes como salientes. No existe `allowSendTo` separado (PR #33924 pendiente). Si necesitas enviar a un numero pero no quieres que el bot le responda, agregalo a allowFrom y usa SOUL.md para la regla de "no responder".

3. **dmPolicy**: Usar `"allowlist"`. El modo `"open"` requiere `"*"` en allowFrom (acepta de cualquiera).

4. **Providers con fallback**: Se pueden definir multiples providers. Fallbacks actuales: `anthropic/claude-sonnet-4-6`, `nvidia/kimi-k2.5`

### Modelo AI Actual
- **Primario**: zai / GLM-4.7
- **Base URL**: `https://api.z.ai/api/coding/paas/v4` (NO cambiar)
- **Fallbacks**: Claude Sonnet, Kimi K2.5

## SOUL.md — Reglas del Agente

El archivo `~/.openclaw/workspace/SOUL.md` define:
- Personalidad y tono
- A quien responder y a quien ignorar
- Reglas de mencion (@enzo)
- Restricciones de seguridad (no enviar sin confirmacion)

### Patron: Controlar respuestas por contacto

Como `allowFrom` controla ambas direcciones, para permitir envio pero bloquear respuesta automatica:
1. Agregar numero a `allowFrom` (permite envio)
2. En SOUL.md agregar regla: "NO respondas mensajes de +52XXXXXXXXXX"

### Patron: Requerir mencion

En SOUL.md:
```
Solo responde a Angela si su mensaje contiene @enzo. Si no menciona @enzo, ignora el mensaje.
```

## Comandos CLI Esenciales

```bash
# === ESTADO ===
npx openclaw channels status --probe     # Estado de todos los canales
npx openclaw config validate              # Validar configuracion
npx openclaw doctor                       # Diagnostico completo

# === DAEMON ===
npx openclaw daemon start                 # Iniciar gateway
npx openclaw daemon stop                  # Detener gateway
npx openclaw daemon restart               # Reiniciar gateway

# === MENSAJES ===
npx openclaw message send --channel whatsapp --target "+521XXXXXXXXXX" --message "texto"  # SIEMPRE usar 521 para MX

# === LOGS ===
npx openclaw logs --max-bytes 20000       # Logs generales
npx openclaw channels logs --channel whatsapp  # Logs de WhatsApp

# === WHATSAPP ===
npx openclaw channels login --channel whatsapp  # Login con QR
npx openclaw directory peers list --channel whatsapp --query "NUMERO"  # Buscar contacto

# === ACTUALIZACION ===
npx openclaw update                       # PELIGROSO: puede cambiar requisitos de config
```

## Lecciones Aprendidas

### 1. Numeros mexicanos y WhatsApp (CRITICO)

Los numeros mexicanos en WhatsApp usan JID con prefijo **521** (no solo 52):
- `+5215511406977` → JID correcto
- `+525511406977` → JID incorrecto, mensaje no llega

**Solucion**: SIEMPRE agregar AMBOS formatos en `allowFrom`.

En el CLI para enviar, usar formato **sin 521** (`+525524306997`). El CLI normaliza automaticamente.

### 2. Baileys no puede iniciar conversaciones nuevas

WhatsApp Web (Baileys) necesita una sesion de encriptacion establecida con cada contacto. Si el contacto nunca ha enviado un mensaje al bot:
- El CLI reporta "sent" exitosamente
- Pero el mensaje **nunca llega**
- **Fix**: Pedir al contacto que envie un "hola" primero
- Una vez establecida, la sesion **no expira** (a menos que se borren credenciales)

### 3. Variables de entorno causan crash

Usar `${ZAI_AUTH_TOKEN}` en openclaw.json causaba warning. Despues de `openclaw update`, se volvio error fatal:
```
Startup failed: required secrets are unavailable
```
**Fix**: Hardcodear API key directamente en el JSON.

### 4. `openclaw update` puede romper cosas

El comando `npx openclaw update` puede cambiar requisitos de configuracion. Lo que antes era un warning puede volverse un error fatal despues del update. Siempre verificar config despues de actualizar.

### 5. Session conflicts (440)

Si otra sesion de WhatsApp Web esta activa, OpenClaw recibe errores 440. Fix:
1. En el telefono: Configuracion > Dispositivos vinculados > cerrar otras sesiones
2. `npx openclaw daemon restart`

### 6. Session zombie

El gateway reporta "sent" pero nada llega, y no hay errores 440:
1. `npx openclaw daemon stop`
2. `rm -rf ~/.openclaw/credentials/whatsapp`
3. `npx openclaw channels login --channel whatsapp` (escanear QR desde el telefono)
4. `npx openclaw daemon start`

### 7. Dos SOUL.md diferentes

- `~/.openclaw/workspace/SOUL.md` — **ESTE es el que OpenClaw lee**
- `~/emaus-dev/SOUL.md` — Copia de desarrollo, NO se usa en runtime

Siempre editar el de workspace para cambios inmediatos.

### 8. Config invalida se ignora silenciosamente

Campos invalidos como `peers` en la config de WhatsApp no causan error — simplemente se ignoran. Si un cambio de config "no funciona", puede ser que el campo no exista. Verificar con `npx openclaw config validate`.

### 9. Logs utiles para debugging

```bash
# Logs del dia
cat /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | tail -50

# Logs de WhatsApp especificos
npx openclaw channels logs --channel whatsapp
```

## Workflow para Agregar Nuevo Contacto

1. Agregar ambos formatos a `allowFrom` en openclaw.json:
   ```json
   "+52XXXXXXXXXX", "+521XXXXXXXXXX"
   ```
2. Agregar a `whatsapp-allowed-contacts.json` si puede recibir sin confirmacion
3. Agregar regla en SOUL.md si necesitas controlar cuando responder
4. `npx openclaw daemon restart`
5. Pedir al contacto que envie "hola" al bot para establecer sesion
6. Verificar con `npx openclaw channels status --probe`

### 10. Google Calendar / gog CLI — OAuth en servidor headless

El agente usa `gog` CLI (v0.12.0+) para acceder a Google Calendar y Gmail. La autenticacion se guarda en un keyring encriptado con AES.

**Archivos clave:**
- `/usr/local/bin/gog` — CLI instalado
- `~/.config/gogcli/credentials.json` — Client secret de Google OAuth
- `~/.config/gogcli/keyring/` — Tokens encriptados (refresh tokens)

**Variables de entorno requeridas:**
- `GOG_KEYRING_PASSWORD` — Password para desencriptar el keyring (actualmente: `openclaw`)
- `GOG_ACCOUNT` — Email de la cuenta (actualmente: `leonardo.bolanos@cariai.com`)

**CRITICO**: Estas variables DEBEN estar en el entorno del proceso gateway para que Enzo pueda ejecutar comandos gog. Se configuran via systemd override:
```
~/.config/systemd/user/openclaw-gateway.service.d/gog.conf
```
```ini
[Service]
Environment=GOG_KEYRING_PASSWORD=openclaw
Environment=GOG_ACCOUNT=leonardo.bolanos@cariai.com
```
Despues de modificar: `systemctl --user daemon-reload && systemctl --user restart openclaw-gateway.service`

**NO basta con agregarlas a `gateway.env`** — ese archivo no propaga las vars al entorno de ejecucion de los agentes.

**OAuth flow para servidor headless (si los tokens se pierden):**
```bash
# Paso 1: Generar URL (en servidor)
GOG_KEYRING_PASSWORD='openclaw' gog auth add EMAIL --remote --step 1 --services calendar,gmail --force-consent

# Paso 2: Abrir URL en browser local, autorizar, copiar la URL de redirect (http://127.0.0.1:PORT/...)

# Paso 3: Intercambiar codigo (en servidor)
GOG_KEYRING_PASSWORD='openclaw' gog auth add EMAIL --remote --step 2 --services calendar,gmail --force-consent --auth-url 'URL_COPIADA'

# Verificar
GOG_KEYRING_PASSWORD='openclaw' gog auth list
GOG_KEYRING_PASSWORD='openclaw' GOG_ACCOUNT='EMAIL' gog calendar events primary --from TODAY --to TODAY
```

**Comandos utiles de gog:**
```bash
gog auth list                        # Listar cuentas autenticadas
gog calendar calendars               # Listar calendarios
gog calendar events primary --from X --to Y  # Eventos del calendario principal
```

## Workflow para Troubleshooting Rapido

```
Mensaje no llega?
├── Verificar numero tiene formato 521 en allowFrom
├── Contacto ha enviado mensaje previo al bot?
│   └── NO → Pedir que envie "hola" primero
├── npx openclaw channels status --probe
│   ├── "running, connected" → OK
│   ├── "linked" pero no "connected" → daemon restart
│   └── no aparece → re-login con QR
├── Ver logs: npx openclaw logs --max-bytes 20000
└── Si nada funciona → session zombie reset (borrar creds + QR + restart)
```
