# Trabajar sin conexión en la casa de retiro

La app sigue funcionando en el teléfono cuando la casa de retiro no tiene señal, y envía sola
lo que el equipo hizo cuando vuelve la conexión. El qué y el porqué (decisiones D1-D12,
criterios de aceptación) viven en **`specs/offline-mode/spec.md`**; el diseño por capas en
`specs/offline-mode/plan.md`. Esta página es para operarlo.

## Las tres piezas

| Pieza | Dónde | Qué hace |
|---|---|---|
| Cascarón (PWA) | `apps/web/vite.config.ts` (`VitePWA`), `src/pwa/registerSw.ts` | Service worker que precachea la app: recargar o abrir sin señal funciona. Solo dentro de `/app`. Nunca cachea `/api` |
| Datos guardados | `src/offline/readCache.ts`, `storage.ts` | Los GET de las vistas del retiro se guardan en IndexedDB (`emaus-offline`) **sin datos de salud**; sin señal se responden desde ahí |
| Cola de cambios | `src/offline/outbox.ts`, `outboxKinds.ts`, `syncService.ts` + API `middleware/idempotency.ts` | 12 escrituras pueden esperar la señal; se envían en orden con `Idempotency-Key` y la hora del dispositivo |

Las 12 escrituras: llegada / deshacer / cobro / cancelar a quien no llegó (Recepción), bolsa
hecha, iniciar / completar / ±5 / mover día (Minuto a minuto), asignar o liberar cama, asignar
o quitar caminante de mesa, y corregir la ficha (solo los campos de
`OFFLINE_EDITABLE_PARTICIPANT_FIELDS`; 409 si alguien cambió el mismo dato mientras tanto).

## Interruptor de apagado

Sin redeploy del frontend: en el servidor, agregar `offlineMode: false` al
`window.EMAUS_RUNTIME_CONFIG` de `runtime-config.js` (el que genera el deploy en
`apps/web/releases/<id>/`). En la siguiente carga de cada teléfono:

- el service worker se desregistra y borra sus cachés;
- no se guardan ni sirven respuestas, y la cola no se envía.

Los cambios que ya estaban en la cola de un teléfono **se quedan ahí** hasta que el interruptor
vuelva a `true` (o se quite): nunca se descartan solos. `runtime-config.js` se sirve con
`no-cache` justamente para que el cambio llegue.

## Despliegue: nginx primero

`nginx.conf` del repo trae tres `location =` en `no-cache`: `/sw.js`, `/manifest.webmanifest` y
`/runtime-config.js`. Sin ellas, el regex de assets los sirve `immutable` un año: el service
worker nunca se actualizaría y el interruptor no llegaría. **Aplicar el nginx del servidor antes
del push** que trae el cascarón. El workflow de deploy no toca nginx y el archivo del servidor no
es copia del repo (en octubre de 2026 ya servía `runtime-config.js` con `no-store`, cosa que el
repo no hace): leerlo antes y añadir solo los bloques que falten. El vivo es
`/etc/nginx/sites-enabled/emaus`, un archivo y no un enlace a `sites-available`. Aplicado el
2026-10-20: `sw.js` y el manifest con el CSP de prod; `runtime-config.js` ya tenía el suyo.
Comprobar después de recargar, con un segundo intento si el primero sale con la configuración
vieja (un worker viejo puede atender el instante de la recarga):

```bash
curl -sI https://emaus.cc/sw.js | grep -i cache-control              # no-cache
curl -sI https://emaus.cc/manifest.webmanifest | grep -i content-type   # application/manifest+json
curl -sI https://emaus.cc/runtime-config.js | grep -i cache-control     # no-cache
```

El guard `apps/api/src/tests/infrastructure/nginxOfflineShell.simple.test.ts` falla si alguien
quita esos bloques del repo; no ve el nginx real del servidor.

## Actualizaciones de la app

El service worker nuevo **no se activa solo** (`registerType: 'prompt'`): espera a que el usuario
pulse **Actualizar** en el banner de versión de siempre. El poll de `version.json` además pide
al navegador que baje el `sw.js` nuevo, así que al pulsar suele estar listo. "Actualizar"
espera hasta 20 s a que termine de instalarse; si no, recarga normal.

## Base de datos

Una tabla nueva, `idempotency_keys` (migración `20261020120000_CreateIdempotencyKeys`): una
fila por clave, con el resultado de la primera ejecución (cuerpo solo de los 4xx). Se purga a
los 7 días (cron diario). La auditoría de dominio guarda `occurredAt` y `syncedFromOutbox` en
`metadata` de las escrituras que llegaron con clave.

## Probarlo

El service worker solo existe en el build de producción: los e2e corren contra `vite preview`.

```bash
# Stack del worktree (DB desechable), puertos libres:
API_PORT=3009 WEB_PORT=5179 bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh
cd apps/web && npx vite build --mode production
printf "window.EMAUS_RUNTIME_CONFIG = { apiUrl: '/api', environment: 'development' };\n" > dist/runtime-config.js
VITE_API_PROXY_TARGET=http://localhost:3009 npx vite preview --mode production --port 4179 --strictPort &
E2E_BASE_URL=http://localhost:4179 npx playwright test tests/e2e/offline-shell.spec.ts tests/e2e/offline-read-cache.spec.ts --project=chromium
# Este escribe en la base: solo contra la copia desechable
E2E_OFFLINE_WRITES=1 E2E_BASE_URL=http://localhost:4179 npx playwright test tests/e2e/offline-outbox.spec.ts --project=chromium
```

Corridas seguidas de e2e pueden chocar con el limitador del API (300 peticiones/min por IP):
la siguiente pantalla recibe 429. Esperar un minuto entre corridas.

## Síntomas y causas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Dice "Sin conexión" y sí hay wifi | Wifi sin salida a internet; el estado sale de lo que pasa con las peticiones | Tocar el estado del menú: vuelve a probar en el acto |
| "N cambios sin enviar" que no bajan con señal | Sesión vencida (401) | El menú dice "Inicia sesión para enviar": entrar de nuevo |
| Un cambio "rechazado" | El servidor no lo aceptó (cama ocupada, participante cancelado…) | Abrir la lista desde el menú: leer el motivo, corregir y **Reintentar**, o **Descartar** |
| Alimentación / Medicamentos dicen "solo con conexión" | Decisión de diseño: la salud nunca se guarda en el teléfono | Abrir con señal |
| Recargar sin señal muestra la página de error del navegador | El teléfono nunca abrió `/app` con señal tras el último deploy, o el interruptor está en `false` | Abrir la app una vez con señal |
| Un iPhone perdió todo lo guardado | Safari borra el almacenamiento de webs no usadas en 7 días | "Agregar a pantalla de inicio" y preparar de nuevo |
