# Simulación de Minuto a Minuto en local

Procedimiento para simular un retiro **en curso** en `localhost` y verificar el comportamiento del feature MaM (indicador "AHORA", item activo con pulse, tiempo relativo, attachments, fix del bug "en curso" duplicado).

Este documento es una guía operativa: lo que el dev hace para ver el sistema vivo sin esperar 3 días.

## Prerequisitos

- API y web corriendo: `pnpm dev` (API en `:3001`, web en `:5173`).
- Login funcionando: `leonardo.bolanos@gmail.com` / `123456`.
- DB con al menos un retiro creado (cualquiera) y los seeders de attachments aplicados al boot.
- Acceso a `sqlite3 apps/api/database.sqlite` (o equivalente para Postgres).

## Resumen del flujo

```
1. Cambiar fechas del retiro a [ayer, mañana]
2. Re-materializar agenda con baseDate=ayer (clearExisting=true)
3. Shift los items del Día 3 (hoy) hasta que cubran "now"
4. Marcar status según horario:
   - Día 1, Día 2 → completed
   - Día 3 con endTime < now → completed
   - Día 3 con startTime ≤ now ≤ endTime → active
5. Verificar en Chrome (o curl) que la UI reacciona
```

## Paso 1 — Fechas del retiro

```sql
-- Hoy = 2026-04-27. Día 1 = ayer, Día 3 = hoy, Día 4 = mañana.
UPDATE retreat
SET startDate = '2026-04-26T00:00:00.000Z',
    endDate   = '2026-04-28T00:00:00.000Z'
WHERE id = '<retreatId>';
```

> **TODO**: la web ya permite editarlo desde "Editar retiro" (sidebar), pero requiere muchos clicks. Para simulación va más rápido por SQL.

## Paso 2 — Materializar agenda

Vía API (recomendado, dispara también la creación de Responsabilidades de charla y resolución de Santísimo):

```bash
# Login
curl -c /tmp/c.txt -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"leonardo.bolanos@gmail.com","password":"123456"}' >/dev/null

CSRF=$(curl -s -b /tmp/c.txt http://localhost:3001/api/csrf-token | jq -r .csrfToken)
RID="<retreatId>"

# Materializar
curl -s -b /tmp/c.txt -X POST \
  "http://localhost:3001/api/schedule/retreats/$RID/materialize" \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: $CSRF" \
  -d '{"baseDate":"2026-04-26","clearExisting":true}' \
  | jq 'length as $n | "Materializados: \($n) items"'
```

O desde la UI: `Logística → Minuto a Minuto → Importar desde template` (botón visible cuando la agenda está vacía, o desde `⋮ Más acciones`).

## Paso 3 — Alinear items del Día 3 con `now`

Aquí está la parte que requiere iteración. El `materializeFromTemplate` parsea `baseDate` como UTC midnight y los `defaultStartTime` como horarios UTC, así que el Día N puede caer en un calendario distinto al esperado según tu timezone.

### Verificar el rango actual del Día 3

```sql
SELECT datetime('now') AS now_utc,
       MIN(startTime) AS first_start,
       MAX(endTime) AS last_end
FROM retreat_schedule_item
WHERE retreatId = '<retreatId>' AND day = 3;
```

### Calcular el shift necesario

```
shift_horas ≈ now_utc - (first_start + (last_end - first_start) / 2)
```

### Aplicar shift y re-marcar status

```sql
-- Reset Día 3 + shift en una sola transacción
UPDATE retreat_schedule_item
SET status = 'pending',
    actualStartTime = NULL,
    actualEndTime = NULL,
    startTime = datetime(startTime, '+5 hours'),  -- ajustar según el cálculo arriba
    endTime   = datetime(endTime,   '+5 hours')
WHERE retreatId = '<retreatId>' AND day = 3;
```

> **TIP**: si el primer intento queda demasiado pasado (todo `completed`), aplicá otro `+N hours`. Si queda demasiado futuro (todo `pending`), `-N hours`. Generalmente 2-3 iteraciones bastan.

## Paso 4 — Marcar status según horario

```sql
-- Día 1 y 2: pasados completos
UPDATE retreat_schedule_item
SET status = 'completed',
    actualStartTime = startTime,
    actualEndTime   = endTime
WHERE retreatId = '<retreatId>' AND day IN (1, 2);

-- Día 3 items con endTime < now → completed
UPDATE retreat_schedule_item
SET status = 'completed',
    actualStartTime = startTime,
    actualEndTime   = endTime
WHERE retreatId = '<retreatId>'
  AND day = 3
  AND endTime < datetime('now');

-- El item del Día 3 cuyo slot temporal contiene 'now' → active
UPDATE retreat_schedule_item
SET status = 'active', actualStartTime = startTime
WHERE id = (
  SELECT id FROM retreat_schedule_item
  WHERE retreatId = '<retreatId>'
    AND day = 3
    AND startTime <= datetime('now')
    AND endTime   >= datetime('now')
  ORDER BY startTime DESC LIMIT 1
);
```

### Verificación rápida

```sql
SELECT day, status, COUNT(*) AS n
FROM retreat_schedule_item
WHERE retreatId = '<retreatId>'
GROUP BY day, status ORDER BY day, status;

SELECT 'Active:', strftime('%H:%M', startTime, 'localtime') AS time, name
FROM retreat_schedule_item
WHERE status = 'active' AND retreatId = '<retreatId>';
```

**Esperado**: Día 1 + Día 2 = todos completed. Día 3 = N completed, **1 active**, M pending.

## Paso 5 — Verificación en UI (Chrome)

1. Abrir `http://localhost:5173/login` y autenticarse.
2. Si el sidebar muestra otro retiro, abrir el dropdown del sidebar (botón "RETIRO") y seleccionar el retiro de la simulación.
   > **Bug conocido**: navegar directo a la URL `/app/retreats/<id>/...` redirige al retiro guardado en `selectedRetreatId`. Hay que cambiar via dropdown.
3. Navegar a `Logística → Minuto a Minuto`.
4. Verificar visualmente:
   - Header muestra "Día 3 — <fecha actual> — N/total completados"
   - Línea **`⏵ AHORA · HH:MM`** rosa entre items pasado/futuro
   - Item active con fondo verde tenue + punto pulse
   - Botones `✓ −5 +5` siempre visibles en active, hover en otros
   - Items completados tachados/grises con `"completado"` o `"hace Xm/h"`
   - Items futuros con `"en Xm"` / `"en Xh Ym"`
   - Items pending cuyo horario incluye `now` muestran `"ahora"` (NO "en curso")
   - Solo el item active muestra `"en curso"`

### Métricas DOM esperadas (via DevTools console)

```js
// En la pestaña del retiro, F12 → Console:
const text = document.body.innerText;
({
  activeBg: document.querySelectorAll('.bg-green-50').length, // == 1
  enCurso: (text.match(/en curso/gi) || []).length,           // == 1 (solo active)
  nowLine: (text.match(/AHORA · /g) || []).length,            // == 1
  completados: (text.match(/completado(?!s)/gi) || []).length, // > 100
  ahoraSlot: (text.match(/\bahora\b(?! ·)/gi) || []).length,   // 0+ items en slot pero no active
});
```

## Casos a verificar manualmente

### A) Iniciar y completar un item

1. En el item active, click `✓` → debería pasar a "completado".
2. En el siguiente item pending, click `▶` → debería volverse active (verde + pulse).
3. WS confirma cambio: si abrís 2 pestañas del MaM, la segunda debe actualizarse sin recargar.

### B) Atrasar/adelantar items

1. Click `+5` en el item active → todos los items siguientes del día se desplazan +5min (con `propagate=true` por default).
2. Click `−5` revierte.

### C) Attachments por responsabilidad

1. En el item active "Campana — pasar al comedor", debe aparecer `📎 1`.
2. Click → dialog read-only con `Guion Campanero.md` (5KB+).
3. Botones `⬇ MD` y `⬇ PDF` funcionan (genera PDF cliente-side con `jspdf`).

### D) Búsqueda

1. Escribir "santisimo" en la barra sticky → highlight de los items con esa responsabilidad.
2. Enter avanza al siguiente match. Esc/× limpia.

### E) Toggle Día / Responsabilidad

1. Click en `🎤 Responsabilidad` → vista cambia a agrupada por rol (Comedor, Campanero, etc.).
2. La preferencia persiste en localStorage.

### F) Mi agenda (vista del servidor)

1. En otro browser/incognito, login con un participante asignado a alguna Responsabilidad del retiro.
2. Navegar a `Mi agenda`.
3. Solo deben aparecer los items donde el participante es responsable principal o apoyo.
4. Cada item con guion debería mostrar chips de descarga directos.

## Reset de la simulación

```sql
-- Volver el retiro a su estado original (ajustar fechas según el retiro real)
UPDATE retreat SET startDate = '<original>', endDate = '<original>' WHERE id = '<retreatId>';

-- O re-materializar limpio (clearExisting=true)
curl -X POST .../schedule/retreats/$RID/materialize \
  -d '{"baseDate":"<original>","clearExisting":true}'
```

## Limitaciones conocidas (cosas que NO se pueden hacer hoy desde la UI)

Ver `TODO.md` sección "Bugs encontrados durante simulación":

- Shift masivo de horarios (`+5h` a un día completo) — solo SQL.
- Backfill: marcar items pasados como `completed` con `actualStartTime = startTime` (no `now()`) — solo SQL.
- Cambiar de retiro vía URL no funciona — hay que usar el dropdown del sidebar.
- Editar campos `status` / `actualStartTime` / `actualEndTime` desde el modal de item — no expuestos en UI.

## Tiempo aproximado

- **Setup completo desde DB limpia**: ~25 min.
- **Re-correr la simulación con DB ya configurada**: ~5 min.
- **Solo verificar en UI**: ~3 min.

La parte que más toma es **encontrar el shift correcto en el paso 3**, porque depende del timezone y de cuántas horas tiene el día seleccionado en el template (Polanco vs Santa Clara).
