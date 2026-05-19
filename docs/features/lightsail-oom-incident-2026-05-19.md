# Incidente 2026-05-19 — Lightsail freeze por OOM durante build manual

## Resumen

Una sesión de "fix urgente en prod" provocó un freeze completo de la
instancia Lightsail (`emaus-prod`, bundle `micro_3_0` con 1 GB RAM).

El sitio estuvo caído ~30 minutos hasta que se reinició la VM vía
AWS Lightsail API (`aws lightsail reboot-instance`).

**Causa real**: intentar `pnpm --filter web build` directamente en el
server. `vue-tsc + vite build` consume >1 GB de RAM y el server no tenía
swap configurado. Sin swap, el kernel `oom-killer` no degrada — mata
procesos críticos o (en este caso) la VM entera entra en estado
unresponsive y AWS la sigue reportando como "running".

**Causa raíz secundaria** (la que detonó la sesión manual): un commit
anterior introdujo `require('crypto').randomUUID()` en
`createCommunication`. El bundle de producción es ESM (Vite emite
`file:///`) y `require` no existe ahí → endpoint tiraba
`ReferenceError: require is not defined` en cada POST → nginx devolvía
503 por upstream caído.

## Línea de tiempo

| Hora UTC | Evento |
|---|---|
| 02:12 | GHA deploy de `7d38a1b` (timezone + estados + lastMessage). Migrations corren limpias. |
| 02:20 | GHA deploy de `86bd6c8` (buscar por teléfono). |
| 02:27 | Usuario reporta 503 en POST `/api/community-communications`. |
| 02:40 | Push de `abbe704` (fix ESM `require → randomUUID`). GHA hace deploy auto. |
| ~02:50 | Yo SSH al server sin verificar GHA. Veo el stack viejo en logs y asumo que el fix no está deployed. |
| ~06:30 | Hago `git pull` + `rm -rf dist/assets` + `pnpm --filter web build` en server. **OOM, Exit 137.** dist/assets queda vacío. Sitio frontend caído. |
| ~06:35 | Restauro `dist/` desde `dist.bak.1776752633`. Build local en mi Mac. `scp dist/* server`. Sitio HTTP 200. |
| ~14:30 | Usuario reporta "sitio caído". |
| ~14:35 | Ping a IP: 100% packet loss. SSH timeout. HTTPS `000`. **Lightsail freeze**. |
| ~14:46 | `aws lightsail reboot-instance --instance-name emaus-prod`. |
| ~14:48 | PM2 resurrect, nginx auto-start. HTTP 200. Health check OK. |
| ~14:55 | Swap 2 GB configurado + persistido. `vm.swappiness=10`. |

## Por qué pasó

1. **Lightsail `micro_3_0` tiene 1 GB de RAM** y la imagen base de Ubuntu no
   trae swap. Sin swap, el kernel mata o congela cuando un proceso pide más
   que la RAM disponible.
2. **`vue-tsc + vite build` necesita >1 GB** (typecheck del workspace + bundle
   con Vite + Rollup). El runner de GitHub Actions tiene 7 GB y se construyó
   sin problema; el server no aguanta.
3. **Yo intenté un build manual** en vez de confiar en el workflow de GHA.
   El workflow está diseñado para construir en el runner y solo `scp` el
   `dist/` al server — precisamente para evitar este escenario.
4. **Aún sin OOM, el orden fue inseguro**: hice `rm -rf dist/assets` ANTES
   de un build que no había probado. Cuando el build falló, no había
   versión anterior a la que caer. El sitio servía HTML con refs a JS
   inexistentes.

## Recuperación aplicada

1. **Sitio frontend** (~06:30): `mv dist dist.broken.<ts>`, restaurar
   `dist.bak.1776752633` completo (consistente HTML+assets), luego scp del
   build local. Sitio HTTP 200 en ~5 min.
2. **VM freeze** (~14:46): `aws lightsail reboot-instance` vía AWS CLI con
   perfil `emaus`. La VM volvió en ~2 min; PM2 resurrect levantó
   `emaus-api`; nginx auto-start; health check 200.
3. **Mitigación permanente**: 2 GB swap file en `/swapfile`, persistido
   en `/etc/fstab`, con `vm.swappiness=10` para que el kernel prefiera
   RAM y solo use swap bajo presión real.

## Lecciones

### 1. NUNCA buildear frontend en Lightsail

`pnpm --filter web build` se cae con OOM Exit 137 incluso con
`NODE_OPTIONS=4096`. **Solo el build:api funciona en el server.**

- Build LOCAL en Mac (16+ GB RAM), `scp -r dist/* ubuntu@server:/var/www/emaus/apps/web/dist/`.
- O simplemente push a master y dejar que GHA haga su trabajo.

### 2. Antes de SSH a prod, verificar GHA

```bash
gh run list --workflow=deploy-production.yml --limit 3
```

Si el último run reciente pasó verde, el server tiene código fresco. No
hay nada que hacer manual. **El bug del 503 (`abbe704`) ya estaba
desplegado a los 13 minutos del reporte del usuario** — yo entré después
y "arreglé" algo que ya estaba arreglado, rompiendo el sitio en el camino.

### 3. Orden seguro de operaciones en `dist`

- **Mal**: `rm -rf dist/assets && pnpm build` (si el build falla, sitio caído).
- **Bien**: `mv dist dist.bak.predeploy.$(date +%s) && mkdir dist && scp …`
  (si el scp falla, `mv dist.bak.predeploy.X dist` recupera).

El workflow de GHA ya hace esto correctamente en su heredoc `CLEANEOF`.

### 4. Sin swap, OOM es catastrófico

Una VM de 1 GB sin swap muere violentamente. Una VM de 1 GB con 2 GB de
swap "se vuelve lenta" — degrada gracefully en vez de freezar. Costo: 0
(usa disco), zero downtime para aplicar.

### 5. ESLint rule contra `require()` en backend ESM

El bug raíz del 503 era `require('crypto').randomUUID()` que funciona
en dev (ts-node CJS) y revienta en prod (Vite ESM). Tests Jest no lo
atrapan porque también corren en CJS.

Aplicado: `no-restricted-syntax` con selector
`CallExpression[callee.name='require']` en `apps/api/.eslintrc.cjs`.
Bloquea el commit con mensaje claro.

## Acciones de seguimiento

- [x] ESLint rule contra `require()` en `apps/api/.eslintrc.cjs`.
- [x] Swap 2 GB persistido en `/etc/fstab` + `vm.swappiness=10`.
- [x] Skill `.ruler/skills/arquitectura/SKILL.md` actualizado con sección
      "Build & runtime de producción (CRITICAL)".
- [x] Memoria personal `feedback_lightsail_frontend_build_oom.md`.
- [ ] Considerar upgrade del bundle a `small_3_0` (2 GB RAM) si el
      tráfico crece. Costo: ~$5/mes extra. Zero-downtime con
      `aws lightsail update-instance-bundle`.
- [ ] **Smoke test del bundle de producción en CI**: arrancar
      `dist/index.js` en sandbox, curl endpoints críticos, kill. Atraparía
      otra clase de bugs CJS↔ESM (`__dirname` no definido, dynamic imports
      rotos). ~1h de trabajo, pendiente.

## Referencias

- Commits del incidente:
  - `1bbfb05` ESLint rule + skill update.
  - `abbe704` fix ESM (reemplazar 5 `require()` por `import`/`randomUUID`).
- Skill `.ruler/skills/safari-ios-compatibility/SKILL.md` también
  menciona la regla "always clean `/dist/assets/` before copying"
  pero en el contexto de SCP — no autoriza correr `rm -rf` sin un
  build probado disponible.
- `aws lightsail reboot-instance --instance-name emaus-prod --profile emaus --region us-east-2`
  para recovery de futuros freezes.
