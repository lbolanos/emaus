# Tests — Timezone configurable + Botón "Borrar todo y regenerar"

Esta documentación cubre los tests añadidos al implementar:
- **Timezone configurable** en `house` y `retreat` (skill `timezone-handling`)
- **Botón destructivo** "Borrar todo y regenerar" del Santísimo (skill `santisimo`)

44 tests nuevos · 7 archivos · 4 capas (helper → service → controller → routing).

---

## Resumen ejecutivo

| # | Suite | Capa | Tests | Propósito |
|---|---|---|---|---|
| 1 | `services/inferTimezoneFromCoords.simple.test.ts` | helper puro | 11 | tz-lookup wrapper (CDMX/Bogotá/Madrid/Lima/edge cases) |
| 2 | `services/scheduleMaterializeTimezone.simple.test.ts` | lógica pura | 26 | `makeDateInTimezone` + `computeItemDateRange(tz)` con DST |
| 3 | `services/santisimoMaterializeAutogen.test.ts` (3 nuevos) | service + DB | +3 | regenerate caso San Agustín, deduplicación, preservación manual |
| 4 | `controllers/houseController.timezone.test.ts` | controller (mocks) | 5 | endpoint `/houses/timezone-from-coords` |
| 5 | `controllers/santisimoController.regenerate.test.ts` | controller (mocks) | 5 | endpoint `regenerate-from-schedule` |
| 6 | `routes/santisimoRoutes.regenerate.simple.test.ts` | source-level | 4 | URL registrada · permiso · frontend api apunta correcto |

Plus integración real validada vía script ad-hoc:
- `apps/api/scripts/test-regenerate-san-agustin.ts` — ejecuta el método contra DB real.

---

## Cómo ejecutar

```bash
# Todos los tests del feature
pnpm --filter api test \
  'inferTimezoneFromCoords|scheduleMaterializeTimezone|santisimoMaterializeAutogen|santisimoController.regenerate|houseController.timezone|santisimoRoutes.regenerate'

# Solo timezone helpers
pnpm --filter api test 'inferTimezoneFromCoords|scheduleMaterializeTimezone'

# Solo regenerate flow
pnpm --filter api test 'santisimoController.regenerate|santisimoRoutes.regenerate|santisimoMaterializeAutogen'

# Suite completa (debe pasar 118/118 suites · 2130/2130 tests)
pnpm --filter api test
```

---

## 1. `inferTimezoneFromCoords.simple.test.ts`

**Qué prueba**: el helper `inferTimezoneFromCoords(lat, lon)` que el endpoint
`GET /api/houses/timezone-from-coords` envuelve. Internamente carga `tz-lookup`
(CommonJS) vía dynamic import para que funcione tanto en runtime ESM como en
Jest CJS.

### Tests
- **5 puntos terrestres reales**: CDMX, Bogotá, Madrid, Cancún (zona distinta a
  CDMX), Lima — cada uno asserts el IANA exacto esperado.
- **Edge cases**:
  - `null`/`undefined` → `null` sin lanzar
  - `NaN` en lat o lon → `null`
  - Lat fuera de `[-90, 90]` → `null`
  - Lon fuera de `[-180, 180]` → `null`
  - Boundaries `(90, 180)` → string válido (no null)
- **Mar abierto Pacífico**: regex `^(Etc/|Pacific/)` (tz-lookup tiene catálogo de
  océanos como `Etc/GMT+10`)
- **Concurrencia**: 3 llamadas en `Promise.all` con 3 zonas distintas — verifica
  que la cache interna no devuelve la misma respuesta a todos.

### Patrón
```ts
expect(await inferTimezoneFromCoords(19.4326, -99.1332)).toBe('America/Mexico_City');
```

---

## 2. `scheduleMaterializeTimezone.simple.test.ts` (26 tests)

**Qué prueba**: lógica pura de `makeDateInTimezone` y `computeItemDateRange`
(sin DB, sin TypeORM). Cubre el bug histórico del shift de hora cuando server-tz
≠ retreat-tz.

### Estructura

#### `describe('makeDateInTimezone — direct helper')`
Asserts del **instante UTC** producido por el helper:

```ts
// CDMX (UTC-6 sin DST desde 2022)
expect(makeDateInTimezone(2026, 3, 26, 16, 0, 'America/Mexico_City').toISOString())
  .toBe('2026-04-26T22:00:00.000Z');

// Bogotá (UTC-5 sin DST)
expect(makeDateInTimezone(2026, 3, 26, 16, 0, 'America/Bogota').toISOString())
  .toBe('2026-04-26T21:00:00.000Z');

// Madrid invierno CET (UTC+1)
expect(makeDateInTimezone(2026, 0, 15, 16, 0, 'Europe/Madrid').toISOString())
  .toBe('2026-01-15T15:00:00.000Z');

// Madrid verano CEST (UTC+2)
expect(makeDateInTimezone(2026, 6, 15, 16, 0, 'Europe/Madrid').toISOString())
  .toBe('2026-07-15T14:00:00.000Z');

// UTC: identidad
expect(makeDateInTimezone(2026, 3, 26, 16, 0, 'UTC').toISOString())
  .toBe('2026-04-26T16:00:00.000Z');
```

#### `describe('computeItemDateRange — TZ-aware materialization')`
Cubre el flujo del controller: `baseDate = new Date('2026-04-26')` parseado como
UTC midnight, luego `computeItemDateRange(baseDate, day, '16:00', 60, tz)`.

Edge cases cubiertos:
- Día 1, 2, 3 normales en CDMX y Bogotá
- Default `09:00` cuando `defaultStartTime` es null/undefined
- Parser de `"07:05"` con cero a la izquierda
- `endTime = startTime + durationMinutes`
- Cross-month: `30-abr` día 3 → 02-may
- Cross-year: `30-dic-2025` día 4 → 02-ene-2026
- Diferencia exacta de 24h entre días consecutivos en CDMX (sin DST)

#### `describe('Bug K — items madrugada saltan al siguiente día calendario')`
Items con `defaultStartTime < '06:00'` (ej. Vigilia a las 00:10 día 1) son
"after-midnight" — pertenecen al flujo nocturno del día anterior pero en el
calendario caen al día siguiente. Tests del shift `dayOffset = h < 6 ? day : day - 1`:

```ts
// Día 1 a 00:10 CDMX → calendario 27 (no 26)
expect(computeItemDateRange(baseDate, 1, '00:10', 360, MX).startTime.toISOString())
  .toBe('2026-04-27T06:10:00.000Z');

// Día 1 a 06:00 ya NO se considera next-morning (boundary)
expect(computeItemDateRange(baseDate, 1, '06:00', 30, MX).startTime.toISOString())
  .toBe('2026-04-26T12:00:00.000Z');
```

### Por qué `toISOString()` y no `getHours()`
Las aserciones sobre `getHours()` son **server-local** y fallan en CI cuando el
runner usa otra zona. Convertir a `toISOString()` es estable en cualquier zona.

---

## 3. `santisimoMaterializeAutogen.test.ts` (3 tests nuevos sobre regenerate)

**Qué prueba**: el método `regenerateSantisimoSlotsFromSchedule(retreatId)` con
DB real (TypeORM + SQLite in-memory).

### Tests añadidos

#### `regenerateSantisimoSlotsFromSchedule descarta items santísimo viejos con timestamps incorrectos (caso San Agustín)`
- Setup: casa CDMX, retiro 2026-06-05, template `Exposición @ 16:00`.
- Materializa correctamente (item a `22:00 UTC`).
- **Inserta manualmente** un item viejo a `16:00 UTC` (= 10 AM CDMX) y slots
  viejos directamente con `slotRepo.save()`.
- Llama `regenerateSantisimoSlotsFromSchedule`.
- Assertions:
  - `itemsAfter` tiene 1 (viejo borrado, nuevo re-materializado)
  - `itemsAfter[0].startTime === '2026-06-05T22:00:00.000Z'` (16:00 CDMX)
  - `slotsAfter[0].startTime === '2026-06-05T22:00:00.000Z'`
  - `result.replacedItems = 1`

#### `regenerateSantisimoSlotsFromSchedule deduplica items con el mismo scheduleTemplateId (caso comidas duplicadas)`
- Setup: 1 santísimo + 1 comida (`Desayuno @ 08:20 día 2`).
- Materializa correctamente.
- **Inserta manualmente** un duplicado del Desayuno con timestamp viejo (`08:20 UTC`).
- Verifica `dupesBefore` tiene 2 entradas con el mismo templateId.
- Llama regenerate.
- Assertions:
  - Solo 1 item de comida después
  - Su startTime es `2026-06-06T14:20:00.000Z` (8:20 AM CDMX, correcto)
  - `result.removedTemplateItems >= 2`

#### `regenerateSantisimoSlotsFromSchedule preserva items manuales (sin scheduleTemplateId)`
- Setup: template materializado + 1 item manual sin templateId.
- Llama regenerate.
- Assertions:
  - El item manual sigue presente (mismo `id`, mismo `startTime`, `scheduleTemplateId IS NULL`)
  - Items del template se re-materializaron sin duplicar

### Truco crítico — `startDate` con SQL directo

TypeORM con SQLite y columnas `'date'` trunca `Date` usando hora local del proceso:

```ts
// ❌ FRÁGIL — en CDMX local, new Date('2026-06-05') = 2026-06-04T18:00 → guarda '2026-06-04'
await retreatRepo.update(id, { startDate: new Date('2026-06-05') });

// ✅ ESTABLE — bypassa el bug
await ds.query(`UPDATE retreat SET startDate = '2026-06-05' WHERE id = ?`, [id]);
```

---

## 4. `houseController.timezone.test.ts`

**Qué prueba**: el controller `getTimezoneFromCoords` con mocks de
`inferTimezoneFromCoords`. Aísla la lógica HTTP (parseo de query, status,
shape del JSON, error handling).

```ts
test('responde 200 con { timezone } cuando las coords son válidas', async () => {
  jest.spyOn(dateTransformer, 'inferTimezoneFromCoords')
    .mockResolvedValue('America/Mexico_City');

  const req = createMockRequest({ query: { lat: '19.43', lon: '-99.13' } });
  await houseController.getTimezoneFromCoords(req, res, mockNext);

  expect(dateTransformer.inferTimezoneFromCoords).toHaveBeenCalledWith(19.43, -99.13);
  expect(res.json).toHaveBeenCalledWith({ timezone: 'America/Mexico_City' });
});
```

Cubre 5 escenarios: válidas, inválidas (`'abc'` → NaN), negativos, excepción
del helper, query vacío.

---

## 5. `santisimoController.regenerate.test.ts`

**Qué prueba**: el controller `regenerateFromSchedule` con mocks de
`retreatScheduleService` y `authorizationService`.

| Test | Cubre |
|---|---|
| 403 sin acceso | `authorizationService.hasRetreatAccess` mocked false |
| 200 con body completo | `{ deleted, created, replacedItems, removedTemplateItems, slots[] }` |
| 200 con `created=0` | retreat sin items santísimo (cero slots) |
| 500 con mensaje | service rejects con Error |
| Auth fail no invoca service | `serviceSpy` no se llama |

---

## 6. `santisimoRoutes.regenerate.simple.test.ts`

**Source-level**: lee `santisimoRoutes.ts` y `apps/web/src/services/api.ts` como
texto y verifica patrones regex. Caza regresiones de URL mismatch sin necesidad
de bootear Express + supertest.

| Assertion | Regex |
|---|---|
| URL registrada | `router\.post\(\s*['"]\/retreats\/:retreatId\/slots\/regenerate-from-schedule['"]` |
| Permiso correcto | `requirePermission\(\s*['"]santisimo:manage['"]\s*\)` dentro del bloque |
| Controller importado | `regenerateFromSchedule` aparece en imports |
| Frontend api consistente | `\/santisimo\/retreats\/\$\{retreatId\}\/slots\/regenerate-from-schedule` en api.ts |

Patrón heredado de `routes/communityCommunicationRoutes.simple.test.ts`.

---

## 7. Validación end-to-end con script ad-hoc

`apps/api/scripts/test-regenerate-san-agustin.ts` — invoca el service real
contra `database.sqlite`, reporta diff antes/después.

```bash
cd apps/api
DOTENV_CONFIG_PATH=./.env npx vite-node --require dotenv/config \
  scripts/test-regenerate-san-agustin.ts
```

Output esperado en una DB con duplicados (caso local de mi máquina):
```
SLOTS ANTES: { total: 46, first_start: '2026-06-05 16:00:00', last_end: '2026-06-07 19:41:00' }
ITEMS totales ANTES: 269 · duplicados: 133

RESULT: { deleted: 46, created: 46, replacedItems: 136, removedTemplateItems: 269 }

SLOTS DESPUÉS: { total: 46, first_start: '2026-06-05 22:00:00', last_end: '2026-06-07 19:41:00' }
ITEMS totales DESPUÉS: 136 · duplicados: 0
Items "Desayuno día 2" DESPUÉS:
   2026-06-06 14:20:00
```

Validación contra DB de **producción real** (sin duplicados, sin signups):
```
SLOTS ANTES: { total: 46, first_start: '2026-06-05 16:00:00', ... }   ← bug
RESULT: { deleted: 46, created: 46, replacedItems: 136, removedTemplateItems: 136 }
SLOTS DESPUÉS: { total: 46, first_start: '2026-06-05 22:00:00', ... } ← arreglado
```

⚠️ **Backup obligatorio antes de correrlo**: el script es destructivo.

---

## Patrones recurrentes

### Helper de mocks Request/Response

Repetido en `houseController.timezone` y `santisimoController.regenerate`:

```ts
const createMockRequest = (overrides: any = {}) => ({
  params: {}, body: {}, query: {}, user: { id: 'user-id-1' }, ...overrides,
});
const createMockResponse = () => ({
  status: jest.fn().mockReturnThis(),
  json: jest.fn().mockReturnThis(),
  send: jest.fn().mockReturnThis(),
});
```

### Setup de tests con DB real (TypeORM in-memory)

`santisimoMaterializeAutogen.test.ts` usa `setupTestDatabase()` + `getDS()` para
acceso al DataSource de test. Cada test limpia los repos relevantes en
`beforeEach`:

```ts
beforeEach(async () => {
  const ds = getDS();
  await ds.getRepository(SantisimoSignup).clear();
  await ds.getRepository(SantisimoSlot).clear();
  await ds.getRepository(RetreatScheduleItem).clear();
  await ds.getRepository(ScheduleTemplate).clear();
  await ds.getRepository(ScheduleTemplateSet).clear();
  await ds.getRepository(Responsability).clear();

  testRetreat = await TestDataFactory.createTestRetreat();
  await createDefaultResponsibilitiesForRetreat(testRetreat, ds);
  // ...
});
```

### Forzar timezone del retiro en test

```ts
const houseRepo = ds.getRepository((await import('@/entities/house.entity')).House);
const retreatRow = await retreatRepo.findOne({
  where: { id: testRetreat.id }, relations: ['house'],
});
await houseRepo.update(retreatRow!.house.id, { timezone: 'America/Mexico_City' });
await ds.query(
  `UPDATE retreat SET startDate = '2026-06-05', timezone = NULL WHERE id = ?`,
  [testRetreat.id],
);
```

---

## Cómo agregar un test nuevo

### Para timezone helper
Archivo: `services/scheduleMaterializeTimezone.simple.test.ts`. Agrega un caso
con assertion `toISOString()` para asegurar el instante UTC esperado en la zona
del test.

### Para el flujo de regenerate
Archivo: `services/santisimoMaterializeAutogen.test.ts`. Sigue el patrón:
1. Setup retreat + house + template + materialize
2. Mutar el estado para reproducir el bug que quieres cubrir
3. Llamar `service.regenerateSantisimoSlotsFromSchedule(testRetreat.id)`
4. Asserts sobre items, slots, y fields del result

### Para el endpoint
Si tocas el contrato HTTP, actualiza `controllers/santisimoController.regenerate.test.ts`
y `routes/santisimoRoutes.regenerate.simple.test.ts`. El segundo es
source-level (regex), pero efectivo contra mismatches de URL.

---

## Troubleshooting

- **"Cannot use 'import.meta' outside a module"** al correr Jest contra
  `date.transformer.ts`: significa que alguien volvió a usar `createRequire(import.meta.url)`. Reemplazar por dynamic `await import('tz-lookup' as any)` (ver helper actual).
- **Test pasa local pero falla en CI**: aserciones sobre `getHours()`/`getDate()`
  son server-local. Convierte a `toISOString()` o `getUTCHours()`.
- **`startDate` queda un día antes** en setup de test: bug de TypeORM con
  columna `'date'`. Usa `ds.query("UPDATE retreat SET startDate = '...' WHERE id = ?")`.
- **`tz-lookup` no carga**: paquete CommonJS. Si tu helper usa `import` estático
  funciona en runtime pero falla en Jest (CJS). Usa el patrón actual con
  `await import('tz-lookup' as any)` y la cache interna `tzLookupFn`.
- **Suite cuelga sin output**: si hay un dev server corriendo (`pnpm --filter
  api dev`) puede mantener un lock del SQLite. Mátalo (`pkill -f "vite-node"`)
  y reintenta.

---

## Cobertura alcanzada

| Capa | Bug histórico cubierto |
|---|---|
| **Pure helper** | `makeDateInTimezone` correcto en MX/CO/Madrid (incluye DST) |
| **Lógica del template** | `computeItemDateRange` recibe tz; `dayOffset` para after-midnight |
| **Service + DB** | regenerate caso San Agustín; dedup de comidas duplicadas; preservación manual |
| **Controller HTTP** | auth, body shape, error mapping para ambos endpoints |
| **Routing** | URL registrada · permiso · frontend api consistente |
| **End-to-end real** | script validado contra DB local (con dups) y prod (sin dups) |

Total: **44 tests automáticos** + **1 script de integración real** = `regenerateSantisimoSlotsFromSchedule` y `inferTimezoneFromCoords` con cobertura suficiente para ir a producción con confianza.
