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
# Desde la raíz del worktree:
bash .ruler/skills/worktree-testing/scripts/start-worktree-dev.sh
# Cuando termines:
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

## DB aislada (importante)

**Nunca uses la DB del main en el worktree** — vas a contaminar el trabajo en curso del main (sesiones, datos de prueba, migrations a medias). Siempre copiá:

```bash
cp /Users/lbolanos/Developer/personal/emaus/apps/api/database.sqlite \
   apps/api/database.worktree.sqlite
```

Si la copia falla por WAL/locks (poco común), usá:

```bash
sqlite3 /Users/lbolanos/Developer/personal/emaus/apps/api/database.sqlite \
  ".backup apps/api/database.worktree.sqlite"
```

Después la API se levanta apuntando a esa copia con `DB_DATABASE=database.worktree.sqlite`.

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

# 6. Arrancar web en background
pnpm --filter web dev -- --port 5174 --strictPort \
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

## Scripts incluidos

- [`scripts/start-worktree-dev.sh`](scripts/start-worktree-dev.sh) — automatiza todo el setup arriba.
- [`scripts/stop-worktree-dev.sh`](scripts/stop-worktree-dev.sh) — mata API+web en :3002/:5174.

Ambos asumen que estás corriendo desde la raíz del worktree (donde está `pnpm-workspace.yaml`).
