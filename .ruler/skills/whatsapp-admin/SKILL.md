---
name: whatsapp-admin
description: "Administracion y troubleshooting de WhatsApp en OpenClaw"
---

# WhatsApp Admin — Configuracion y Troubleshooting

## Arquitectura

OpenClaw usa **Baileys** (WhatsApp Web API) como linked device del telefono de Leo (+5215511406977).
NO es WhatsApp Business API — es una sesion de WhatsApp Web vinculada.

## Numeros Mexicanos — CRITICO

Los numeros mexicanos en WhatsApp usan JID con prefijo **521** (no solo 52):
- Correcto: `+5215511406977` → JID: `5215511406977@s.whatsapp.net`
- Incorrecto: `+525511406977` → JID: `525511406977@s.whatsapp.net` (no entrega)

**SIEMPRE agregar AMBOS formatos** en `allowFrom`:
```json
["+525511406977", "+5215511406977"]
```

Para enviar mensajes outbound, usar formato **con 521** en el CLI:
```bash
npx openclaw message send --channel whatsapp --target "+5215524306997" --message "texto"
```
Despues del `openclaw update` (2026-03-19), el CLI ya NO normaliza numeros mexicanos. SIEMPRE usar formato 521.

## Contactos Autorizados

### Respuesta (inbound)
- **Leo** (+5215511406977): responde siempre
- **Angela** (+5215524306997): responde solo si menciona @enzo

### Envio sin confirmacion (outbound)
Lista en `~/.openclaw/whatsapp-allowed-contacts.json`:
- Leo (+5215511406977)
- Angela (+5215524306997)
- Contacto autorizado (+5215591548803)

Para cualquier otro numero, pedir confirmacion antes de enviar.

## Configuracion

### allowFrom en openclaw.json
Controla TANTO inbound como outbound. No existe `allowSendTo` aun (PR #33924 pendiente).
Si necesitas enviar a un numero, DEBE estar en allowFrom aunque no quieras responderle.
La regla de "no responder" se maneja en SOUL.md.

### Archivos clave (en servidor emaus.cc)
- `~/.openclaw/openclaw.json` — config principal (allowFrom, dmPolicy, etc.)
- `~/.openclaw/whatsapp-allowed-contacts.json` — lista de contactos para envio seguro
- `~/.openclaw/workspace/SOUL.md` — reglas de comportamiento (a quien responder, menciones)
- `~/.openclaw/credentials/whatsapp/` — credenciales de sesion de WhatsApp Web
- `~/emaus-dev/skills/whatsapp-send/SKILL.md` — skill de envio seguro
- `~/emaus-dev/skills/whatsapp-admin/SKILL.md` — este skill (copia en servidor)

### Modelo AI
- Provider: zai (GLM-4.7) via `https://api.z.ai/api/coding/paas/v4`
- API Key hardcoded en openclaw.json (no usar env var ${ZAI_AUTH_TOKEN}, causa crash al faltar)
- Fallbacks: anthropic/claude-sonnet-4-6, nvidia/kimi-k2.5

### Servidor
- SSH: `ssh -i ~/.ssh/lightsail-emaus.pem ubuntu@18.116.102.104`
- OpenClaw CLI: requiere `export NVM_DIR="$HOME/.nvm"; [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh"` antes de usar `npx openclaw`

## Troubleshooting

### Mensajes enviados pero no entregados
1. Verificar formato de numero (debe ser 521 para JID mexicano)
2. El contacto debe tener conversacion existente con el bot (Baileys no puede iniciar chats nuevos de forma confiable)
3. Pedir al contacto que envie un "hola" primero para establecer sesion de encriptacion
4. Una vez establecida, no expira (a menos que se borren credenciales)

### Gateway no arranca (exit code 1)
1. Verificar config: `npx openclaw config validate`
2. Ver logs: `cat /tmp/openclaw/openclaw-$(date +%Y-%m-%d).log | tail -30`
3. Error comun: "required secrets are unavailable" — API key faltante como env var
4. Solucion: usar API key directa en config, no `${ENV_VAR}`

### Session conflict (status 440)
- Otra sesion de WhatsApp Web compite con OpenClaw
- Fix: cerrar otras sesiones en telefono (Dispositivos vinculados), luego `npx openclaw daemon restart`

### Session zombie (reporta "sent" pero no entrega)
1. `npx openclaw daemon stop`
2. `rm -rf ~/.openclaw/credentials/whatsapp`
3. `npx openclaw channels login --channel whatsapp` (escanear QR)
4. `npx openclaw daemon start`

### WhatsApp muestra "linked" pero no "running, connected"
- Restart completo: `npx openclaw daemon stop && sleep 3 && npx openclaw daemon start`
- Si persiste, re-vincular (ver "Session zombie" arriba)

## Comandos Utiles

```bash
# Estado de canales
npx openclaw channels status --probe

# Enviar mensaje
npx openclaw message send --channel whatsapp --target "+52XXXXXXXXXX" --message "texto"

# Ver logs
npx openclaw logs --max-bytes 20000

# Logs de WhatsApp
npx openclaw channels logs --channel whatsapp

# Buscar contacto
npx openclaw directory peers list --channel whatsapp --query "NUMERO"

# Validar config
npx openclaw config validate

# Restart daemon
npx openclaw daemon restart

# Login WhatsApp (QR)
npx openclaw channels login --channel whatsapp

# Doctor
npx openclaw doctor
```

## Historial de Cambios (2026-03-19/20)

1. Agregado +525591548803 a allowFrom
2. Creado whatsapp-allowed-contacts.json con contactos autorizados
3. Creado skill whatsapp-send con reglas de envio seguro
4. Agregada regla de seguridad de WhatsApp a SOUL.md (workspace)
5. Descubierto bug de formato: numeros MX necesitan 521 en JID, no solo 52
6. Agregados ambos formatos (52 y 521) a allowFrom
7. Reset de credenciales para fix de sesion zombie
8. Fix de crash por ZAI_AUTH_TOKEN faltante — hardcodeado API key
9. Restaurado baseUrl original de zai
10. Agregada regla: solo responder a Leo y Angela, ignorar otros
11. Agregada regla: Angela necesita mencionar @enzo para obtener respuesta
