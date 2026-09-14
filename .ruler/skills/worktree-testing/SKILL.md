---
name: worktree-testing
description: MUST be used cuando trabajes en un git worktree del proyecto Emaús y necesites probar con Playwright/Chrome DevTools/curl, o levantar `pnpm dev` sin chocar con la sesión del main que ya ocupa los puertos 3084/5173. Cubre setup de puertos paralelos (3002/5174), DB SQLite aislada, override de CORS y proxy de Vite, y workaround del bug de `runtimeConfig.ts` con `import_meta`. Triggers — "puertos están tomados", "el main está corriendo", "no puedo levantar dev en el worktree", "probar con playwright", "chrome devtools", "test e2e en worktree", "API ya está usando 3084".
---

# Worktree Testing — levantar dev paralelo sin chocar con el main

Cuando estás en `.claude/worktrees/<branch>/` y el dev del main ya ocupa los puertos default (`:3084` API, `:5173` web), levantar `pnpm dev` falla. Este skill explica el setup de puertos paralelos con DB aislada, y provee scripts ejecutables.

> **Regla clave**: el frontend del worktree **debe** hablar con la API del worktree, no con la del main. Si solo cambiás el puerto de la API el web seguirá pegándole a `:3084` (proxy hardcoded + `runtimeConfig` con bug). Necesitás los **tres** ajustes de abajo.

---

## TL;DR

```bash
# Desde la raíz del worktree (defaults 3002/5174):
bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh
# Con otros puertos (varios worktrees a la vez):
API_PORT=3003 WEB_PORT=5175 bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh
# Cuando termines (mismos overrides si los usaste):
bash .ruler/skills/worktree-testing/scripts/stop-worktree-dev.sh
```

Esto deja:
- API en `http://localhost:3002` (DB `apps/api/database.worktree.sqlite`, copia de la del main)
- Web en `http://localhost:5174`
- Login con `leonardo.bolanos@gmail.com` / `123456`
- Logs en `/tmp/emaus-worktree-{api,web}.log`

---

## Por qué se necesitan tres ajustes

### 1. CORS de la API

`apps/api/src/index.ts:78-79` arma la allowlist con `frontendUrl` (de `FRONTEND_URL` env, default `http://localhost:5173`) más dos hardcoded (`:5173`, `:3084`). Si tu web corre en `:5174`, la API del worktree lo bloquea.

**Fix**: levantar API con `FRONTEND_URL=http://localhost:5174`.

### 2. Proxy de Vite

`apps/web/vite.config.ts:90` ya es configurable: `env.VITE_API_PROXY_TARGET || 'http://localhost:3084'` (default 3084, el del main). Para que el web del worktree hable con la API del worktree:

**Fix permanente** (ya en el repo; el snippet de abajo es el código actual):

```ts
// apps/web/vite.config.ts
target: env.VITE_API_PROXY_TARGET || 'http://localhost:3084',
```

Y setear `VITE_API_PROXY_TARGET=http://localhost:3002` al arrancar Vite.

### 3. `runtimeConfig.ts` (bug pre-existente)

`apps/web/src/config/runtimeConfig.ts:139` chequea `import_meta` (con underscore) en vez de `import.meta`. Como esa variable nunca está definida, `VITE_API_URL` es ignorada y el cliente cae al default `http://localhost:3084/api` aunque hayas seteado la env.

**Workaround sin tocar source**: crear `apps/web/public/runtime-config.js` que inyecta `window.EMAUS_RUNTIME_CONFIG` antes de que cargue el bundle. El `index.html` ya tiene `<script src="/runtime-config.js">`.

```js
// apps/web/public/runtime-config.js
window.EMAUS_RUNTIME_CONFIG = {
  apiUrl: 'http://localhost:3002/api',
  environment: 'development',
  isDevelopment: true,
  isProduction: false,
  isStaging: false,
};
```

> **No commitees ni `runtime-config.js` ni `.env.local`** — son sólo para el dev local del worktree. Están en `.gitignore` por convención (`apps/web/public/runtime-config.js` excepto en producción donde lo genera el deploy).

---

## `@repo/ui` hay que construirlo (worktree nuevo)

`@repo/ui` se sirve desde `packages/ui/dist` (así lo declaran `main`/`module`/`exports`), y
**`pnpm install` no construye los paquetes del workspace**. En el main ese `dist` existe de
builds anteriores; en un worktree recién creado, no — y el web arranca roto:

```
[plugin:vite:import-analysis] Failed to resolve entry for package "@repo/ui".
```

```bash
pnpm --filter @repo/ui build
rm -rf apps/web/node_modules/.vite   # la caché de deps queda con referencias muertas
```

El script `start-worktree-dev.sh` ya lo hace si falta. Los otros paquetes (`@repo/types`,
`@repo/utils`) apuntan directo a `src/*.ts` y no necesitan build.

> **La trampa de verdad no es el error, es no verlo.** Un e2e que use `APIRequestContext`
> (Playwright hablando HTTP contra la API) **nunca monta el frontend**: sigue en verde con la
> web caída. Si vas a dar por bueno un cambio con e2e, que al menos uno abra la app en el
> navegador y falle ante el overlay de error de Vite y ante errores de consola. Ejemplo:
> `apps/web/tests/e2e/participant-import-ui.spec.ts` (2026-08-25).

## 3002/5174 no son tuyos: otra sesión los puede tener

Este skill fija 3002/5174, así que **dos worktrees que lo sigan chocan**. El que arranca segundo
pierde: `--strictPort` mata el suyo, o el primero ya tiene el puerto y el segundo muere en silencio.

Lo caro no es el fallo, es el **falso negativo**: `localhost:5174` sigue respondiendo 200 y sirviendo
la app… de la OTRA rama. Pasó el 2026-09-08 en emaus — el usuario estuvo mirando la vista sin el
botón que acababa de implementarse, y la base que consultaba era la del otro worktree (el Minuto a
Minuto importado "había desaparecido"). Media hora buscando un bug que no existía.

**Antes de creerte que falta algo que acabas de escribir, comprueba de quién es el servidor:**

```bash
# ¿Qué sirve el puerto? Si el fuente no lleva tu cambio, no es tu servidor.
curl -s http://localhost:5174/src/views/TuVista.vue | grep -c "algo-que-acabas-de-añadir"

# ¿De qué worktree salen los dev servers que hay vivos?
ps -Ao pid,args | grep -E "vite|nodemon" | grep worktrees | sed -E 's|.*/worktrees/([^/]+)/.*|\1|' | sort -u
```

Si hay otro worktree con dev arriba, **levanta el tuyo en otros puertos** (3003/5175, 3004/5176…)
con los env overrides del script — él solo ajusta los tres sitios (`FRONTEND_URL` del API,
`.env.local` y `public/runtime-config.js`):

```bash
API_PORT=3003 WEB_PORT=5175 bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh
```

Y al terminar, mata solo los tuyos — para con los mismos overrides
(`API_PORT=3003 WEB_PORT=5175 bash …/stop-worktree-dev.sh`) o por PID, no `lsof -ti :3002 | xargs
kill` a secas, que se lleva el de la otra sesión.

## DB aislada (importante)

**Nunca uses la DB del main en el worktree** — vas a contaminar el trabajo en curso del main (sesiones, datos de prueba, migrations a medias). Siempre copiá **los tres archivos** (sin el `-wal`/`-shm` la copia queda desparejada y el API puede morir con `SQLITE_CORRUPT`):

```bash
for EXT in "" "-wal" "-shm"; do
  cp /Users/lbolanos/Developer/personal/emaus/apps/api/database.sqlite$EXT \
     apps/api/database.worktree.sqlite$EXT 2>/dev/null || true
done
```

Si la copia falla por WAL/locks (poco común), usá:

```bash
sqlite3 /Users/lbolanos/Developer/personal/emaus/apps/api/database.sqlite \
  ".backup apps/api/database.worktree.sqlite"
```

Después la API se levanta apuntando a esa copia con `DB_DATABASE=database.worktree.sqlite`.

## El script re-copia la DB en CADA arranque: las siembras no sobreviven

`start-worktree-dev.sh` copia la DB del main **cada vez que arranca** ("snapshot al momento del
start"), no solo la primera vez. Todo lo que hayas sembrado en `database.worktree.sqlite` —
usuarios fixture de e2e, datos de prueba — **se pierde en el próximo arranque, sin error en el
log**. Pasó el 2026-09-13: sembrar los usuarios `@test.local` con el API detenida, re-arrancar
con el script, y la corrida de e2e falló con `401 Incorrect email or password` aunque la siembra
hubiera verificado verde dos minutos antes.

Encadenado con eso, los fixtures de e2e **ya no existen en la dev DB del main** (0 filas
`@test.local`): las migraciones `SeedE2ETestUsers`/`SeedE2eSuperadminAndHouse` están registradas
en la tabla `migrations`, así que el runner no las vuelve a aplicar. Y borrar esas filas no
sirve: el próximo arranque del script **re-copia la DB completa del main** y las filas vuelven
(sin usuarios). Consecuencia: un spec que loguee como `E2E_USERS.other`/`superadmin` falla 401
contra dev. `sequences-inbox.spec.ts` tiene fallback a credenciales locales y sí corre:

```bash
E2E_BASE_URL=http://localhost:5174 \
E2E_LOCAL_EMAIL=leonardo.bolanos@gmail.com E2E_LOCAL_PASSWORD=123456 \
  npx playwright test tests/e2e/sequences-inbox.spec.ts --project=chromium
```

Para los specs sin fallback (`crm-notes-timeline.spec.ts`), la secuencia que funciona es
**sembrar con el API detenida y arrancar MANUALMENTE** (los comandos de la sección siguiente,
sin el script — que volvería a copiar la DB y pisar la siembra):

```bash
# 1. Parar el dev (script) — DB fría, sin manejador abierto
bash .ruler/skills/worktree-testing/scripts/stop-worktree-dev.sh

# 2. Sembrar los dos usuarios que los specs de auth necesitan. Hash con el
#    bcrypt del propio API; la fuente de verdad de los fixtures completos
#    (comunidades, casa) son las migraciones 20260516200000 / 20260721130000.
cd apps/api
HASH=$(node -e "const b=require('bcrypt');process.stdout.write(b.hashSync('Test1234!',10))")
sqlite3 database.worktree.sqlite "
INSERT OR IGNORE INTO users (id, email, displayName, password, createdAt, updatedAt)
  VALUES (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
          'e2e-other@test.local', 'E2E Other Owner', '$HASH', datetime('now'), datetime('now'));
INSERT OR IGNORE INTO users (id, email, displayName, password, createdAt, updatedAt)
  VALUES (lower(hex(randomblob(4))||'-'||hex(randomblob(2))||'-4'||substr(hex(randomblob(2)),2)||'-a'||substr(hex(randomblob(2)),2)||'-'||hex(randomblob(6))),
          'e2e-superadmin@test.local', 'E2E Superadmin', '$HASH', datetime('now'), datetime('now'));
INSERT INTO user_roles (userId, roleId, createdAt)
  SELECT u.id, r.id, datetime('now') FROM users u, roles r
  WHERE u.email='e2e-superadmin@test.local' AND r.name='superadmin'
  AND NOT EXISTS (SELECT 1 FROM user_roles ur WHERE ur.userId=u.id AND ur.roleId=r.id);"

# 3. Arrancar API y web con los comandos manuales (sección siguiente), NO con
#    el script. Parar sigue pudiendo usar el script (mata por puertos).
```

> Ojo con el rate limit de `/auth/login` (10 intentos / 15 min): una corrida completa de
> `crm-notes-timeline` gasta 5 logins. Si choca con 429, esperá la ventana — el spec de bandeja
> **lanza** el 429 a propósito en vez de saltarse en verde.

---

## Comandos manuales (si no querés usar los scripts)

### Levantar

```bash
# 1. Copiar DB del main
cp ~/Developer/personal/emaus/apps/api/database.sqlite apps/api/database.worktree.sqlite

# 2. Crear .env.local para el web
cat > apps/web/.env.local <<'EOF'
VITE_API_URL=http://localhost:3002/api
VITE_API_PROXY_TARGET=http://localhost:3002
EOF

# 3. Crear runtime-config.js (workaround del bug)
cat > apps/web/public/runtime-config.js <<'EOF'
window.EMAUS_RUNTIME_CONFIG = {
  apiUrl: 'http://localhost:3002/api',
  environment: 'development',
  isDevelopment: true,
};
EOF

# 4. Arrancar API en background
PORT=3002 \
DB_DATABASE=database.worktree.sqlite \
FRONTEND_URL=http://localhost:5174 \
  pnpm --filter api dev > /tmp/emaus-worktree-api.log 2>&1 &

# 5. Esperar a que API responda
until curl -sf http://localhost:3002/api/csrf-token \
  -H "Origin: http://localhost:5174" -o /dev/null; do sleep 1; done

# 6. Arrancar web en background (SIN `--` entre dev y los flags: pnpm lo pasa
#    literal y Vite lo lee como fin de opciones, ignorando el puerto)
pnpm --filter web dev --port 5174 --strictPort \
  > /tmp/emaus-worktree-web.log 2>&1 &

# 7. Esperar a que web responda
until curl -sf http://localhost:5174 -o /dev/null; do sleep 1; done

echo "Listo: http://localhost:5174"
```

### Bajar

```bash
lsof -ti :3002,:5174 2>/dev/null | xargs -r kill -KILL 2>/dev/null
echo "Detenidos"
```

---

## Probar con Playwright/Chrome DevTools

Una vez arriba, navegá a `http://localhost:5174/login` y autenticá con `leonardo.bolanos@gmail.com` / `123456`. Los datos disponibles son los del snapshot de la DB del main al momento de la copia.

### Limitaciones conocidas

- **Chrome DevTools MCP** falla si el main ya tiene una sesión de Chrome abierta con el mismo `userDataDir`. Usá Playwright MCP en ese caso (`mcp__playwright__browser_navigate`, etc.).
- **vite-node no hot-reloadea código del API server** (no es Express HMR). Si cambiás `apps/api/src/services/*` o `apps/api/src/controllers/*`, **reiniciá la API**:

  ```bash
  lsof -ti :3002 | xargs -r kill -KILL
  PORT=3002 DB_DATABASE=database.worktree.sqlite FRONTEND_URL=http://localhost:5174 \
    pnpm --filter api dev > /tmp/emaus-worktree-api.log 2>&1 &
  ```

  Reiniciar la API **invalida los CSRF tokens en memoria**, así que tendrás que hacer login otra vez en el navegador.

- **Vite sí hot-reloadea el web** — cambios a `apps/web/src/**` se reflejan sin reiniciar.

---

## Diagnóstico rápido

Si el browser se queja de `localhost:3084` aunque hiciste todo:

```bash
# 1. Confirmar que runtime-config.js existe y está en /public
ls -la apps/web/public/runtime-config.js

# 2. Confirmar que el browser lo recibe (no 404)
curl -sI http://localhost:5174/runtime-config.js | head -1
# debe ser HTTP/1.1 200, no 404

# 3. Si es 404, Vite no la está sirviendo desde public — chequear restart
```

Si el browser se queja de CORS desde `localhost:3002`:

```bash
# Verificar que la API tenga FRONTEND_URL set
curl -sI -H "Origin: http://localhost:5174" http://localhost:3002/api/csrf-token | grep -i "access-control"
# Debe mostrar: Access-Control-Allow-Origin: http://localhost:5174
```

Si vacío → la API se levantó sin `FRONTEND_URL=http://localhost:5174`. Reiniciar.

---

## Tests sin levantar nada

Para validar lógica pura del backend o frontend, **NO necesitás levantar dev** — los tests usan SQLite in-memory (Jest) o happy-dom (Vitest):

```bash
# Backend Jest (un archivo)
pnpm --filter api test src/tests/services/miService.test.ts

# Frontend Vitest (un archivo)
pnpm --filter web test src/views/__tests__/MiView.test.ts -- --run

# Typecheck
pnpm --filter api exec tsc --noEmit
pnpm --filter web exec vue-tsc --noEmit
```

El setup de puertos paralelos sólo se necesita para **probar end-to-end con browser** o validar el comportamiento integrado en navegador.

---

## Bugs históricos del script de arranque (ya corregidos)

Corregidos el 2026-09-12 directamente en los scripts; quedan documentados para no reintentarlos:

- **`pnpm --filter web dev -- --port 5174`**: el `--` extra llegaba a Vite como argumento literal,
  así que **ignoraba los flags y arrancaba en 5173** — el puerto del main. Se veía en el log
  (`vite "--" "--port" "5174"`). Fix: sin el `--`.
- **La copia de la DB no se llevaba el `-wal`**: la copia quedaba con un WAL desparejado y el
  API moría con `SQLITE_CORRUPT: database disk image is malformed`. Fix: copiar los **tres**
  archivos (`.sqlite`, `-wal`, `-shm`) con `cp`; nunca el `sqlite3` CLI sobre la base viva.
- **Faltaba `apps/api/.env`**: sin `MIGRATIONS_AUTO_RUN=true` el API del worktree arrancaba y se
  apagaba solo ("Migration verification failed"). Fix: el script lo copia del main si no existe.

## Scripts incluidos

- [`scripts/start-worktree-dev.sh`](scripts/start-worktree-dev.sh) — automatiza todo el setup
  arriba. Puertos configurables: `API_PORT`/`WEB_PORT` (defaults 3002/5174).
- [`scripts/stop-worktree-dev.sh`](scripts/stop-worktree-dev.sh) — mata API+web en los puertos
  configurados (mismos defaults/overrides).

Ambos asumen que estás corriendo desde la raíz del worktree (donde está `pnpm-workspace.yaml`).
