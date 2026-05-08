---
name: timezone-handling
description: "Manejo correcto de zonas horarias en Emaús: cuándo usar UTC vs hora local del retiro, helpers makeDateInTimezone/inferTimezoneFromCoords, patrón timezone configurable por casa+retiro, tests TZ-aware."
---

# Manejo de zonas horarias en Emaús

Sistema multi-zona: retiros pueden ser en México, Colombia, España, etc. Cada **casa** tiene una `timezone` IANA fija (default `'America/Mexico_City'`); cada **retiro** puede sobrescribirla con `retreat.timezone` (nullable).

Este skill cubre los patrones que NO se deben olvidar al tocar fechas/horas en el backend.

## Regla N°1 — almacenamiento siempre UTC

Todas las columnas `datetime` en SQLite se almacenan en UTC sin excepción:

```ts
@Column('datetime')
startTime!: Date;
```

`DateTimeTransformer` (`apps/api/src/utils/date.transformer.ts`) garantiza que SQLite strings sin sufijo `Z` se interpreten como UTC al leerlos.

Lo que cambia con el feature de timezone configurable es **CÓMO se construye el `Date` UTC** desde una hora local del retiro (ej. `'16:00'` del template).

## Regla N°2 — `new Date(y, m, d, h, mi)` está prohibido para horas del retiro

El constructor `new Date(year, monthIndex, day, hour, minute)` interpreta `hour:minute` como **hora local del proceso Node**. Si el server está en UTC y el retiro en CDMX, `new Date(2026, 5, 5, 16, 0)` se vuelve `2026-06-05T16:00:00Z` (= `10:00 AM CDMX`). Bug histórico que afectó al Santísimo en San Agustín.

**Usa siempre `makeDateInTimezone()`** del helper:

```ts
import { makeDateInTimezone } from '@/utils/date.transformer';

const tz = retreat.timezone ?? retreat.house?.timezone ?? 'America/Mexico_City';
const startTime = makeDateInTimezone(2026, 5 /* junio = 0-indexed */, 5, 16, 0, tz);
// → Date apuntando al instante UTC `2026-06-05T22:00:00Z` (CST -6)
```

`makeDateInTimezone` es DST-aware vía `Intl.DateTimeFormat` (verano de Madrid sale UTC+2, invierno UTC+1, automático).

## Regla N°3 — el componente calendario de un baseDate viene en UTC, no local

Cuando el controller recibe `baseDate` del JSON (`new Date(req.body.baseDate)`), una string `"2026-06-05"` se parsea como `2026-06-05T00:00:00Z`. Si lees `.getDate()` (server-local) en CDMX (UTC-6) obtienes `4`, no `5`.

**Lee siempre los componentes UTC**:

```ts
const yyyy = baseDate.getUTCFullYear();
const mm = baseDate.getUTCMonth();
const dd = baseDate.getUTCDate();
```

Ver `computeItemDateRange()` en `retreatScheduleService.ts:592-617` como referencia.

## Regla N°4 — para "¿hoy ya pasó?" usa `Intl.DateTimeFormat` con la zona del retiro

NO uses `new Date().getDate()` (server-local) ni `new Date().getUTCDate()` (que cierra el retiro 6h antes para usuarios en CDMX).

Patrón existente en `participantService.ts:121-131`:

```ts
const todayYmd = new Intl.DateTimeFormat('en-CA', {
  timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date());
// → "2026-06-05"
```

## API: timezone configurable por casa + retiro

### Modelo
- `house.timezone` (varchar 64, NOT NULL, default `'America/Mexico_City'`).
- `retreat.timezone` (varchar 64, nullable). Si null, hereda de `house.timezone`.

### Resolución efectiva (en código)
```ts
const tz = retreat.timezone ?? retreat.house?.timezone ?? 'America/Mexico_City';
```

### Migración
`apps/api/src/migrations/sqlite/20260507280000_AddTimezoneToHouseAndRetreat.ts` — solo `ADD COLUMN`.

### Inferencia desde lat/lon (Google Places)
`inferTimezoneFromCoords(lat, lon)` (async) — usa `tz-lookup` (~30KB embebido, sin Internet). Devuelve `null` para coords inválidas o mar abierto sin zona.

Endpoint: `GET /api/houses/timezone-from-coords?lat=&lon=` → `{ timezone: string | null }`.

UI: `AddEditHouseModal.vue` watcher de `(latitude, longitude)` autocompleta el campo.

## Patrón legacy `APP_TIMEZONE` env var

Para chequeos globales (ej. `isRetreatPast`) donde no hay retreat-context, sigue válido:

```ts
const tz = process.env.APP_TIMEZONE || 'America/Mexico_City';
```

NO usarlo en horarios materializados — esos siempre deben usar la timezone del retiro.

## Tests TZ-aware

Las aserciones sobre `getHours()` / `getDate()` son **server-local** y no son seguras en CI. Aserta el instante UTC:

```ts
// ❌ FRÁGIL — depende del TZ del runner
expect(d.getHours()).toBe(16);
expect(d.getDate()).toBe(5);

// ✅ ESTABLE — instante absoluto
expect(d.toISOString()).toBe('2026-06-05T22:00:00.000Z');
```

Suite de referencia: `apps/api/src/tests/services/scheduleMaterializeTimezone.simple.test.ts` — 26 tests con assertions UTC para CDMX, Bogotá, Madrid (DST), edge cases (cross-month, after-midnight, default fallback).

Suite del helper: `apps/api/src/tests/services/inferTimezoneFromCoords.simple.test.ts` — 11 tests cubriendo coords reales, inválidas, mar abierto, concurrencia.

## Setup en SQLite + TypeORM

Cuando guardas un `Date` en columna `'date'` (no `'datetime'`), TypeORM con SQLite truncá usando hora local del proceso:

```ts
await retreatRepo.update(id, { startDate: new Date('2026-06-05') });
// Server en CDMX (UTC-6): new Date('2026-06-05') = 2026-06-04T18:00 local
// → SQLite guarda '2026-06-04' ❌
```

Workaround en tests: usar SQL directo:

```ts
await ds.query(`UPDATE retreat SET startDate = '2026-06-05' WHERE id = ?`, [id]);
```

En código de producción: el flujo del UI ya envía la string `YYYY-MM-DD` — no construyas Date desde JS para luego volver a string.

## Frontend

### Render
`getHours()` / `getMinutes()` — son **del navegador**, no del retiro. Esto es intencional: un padrino en España que ve un retiro en CDMX ve horas Europe/Madrid (la inscripción la hace cuando le conviene a él).

### Captura
`<input type="datetime-local">` produce strings en hora local del navegador. `new Date(value)` los interpreta también local. Si capturas la hora del retiro y el usuario está en otra zona, **muestra la timezone del retiro como ayuda visual** o convierte explícitamente.

`atLocalHour(value, hour)` en `SantisimoAdminView.vue:493` extrae `YYYY-MM-DD` del string crudo (evita el shift de `new Date('2026-06-05')`) y construye la hora local del navegador.

## Troubleshooting

- **Slots arrancan a "10am" cuando deberían ser 16:00**: classic TZ-shift bug. El item del template fue materializado con `new Date(yyyy, mm, dd, h, m)` antes del fix. Solución: confirmar `house.timezone` y "Borrar todo y regenerar" en Santísimo (re-materializa con `makeDateInTimezone`).
- **Items duplicados con `scheduleTemplateId` repetido**: doble materialización (típicamente antes y después del fix). El método `regenerateSantisimoSlotsFromSchedule` borra todos los items con templateId y re-materializa, eliminando la duplicación.
- **Retiro se cierra "un día antes"**: usaste `new Date().getDate()` o `getUTCDate()` en lugar de `Intl.DateTimeFormat` con zona del retiro.
- **Test pasa local pero falla en CI**: aserciones sobre `getHours()`/`getDate()` son server-local. Convierte a `toISOString()` o `getUTCHours()`.
- **`tz-lookup` no carga en Jest**: usa dynamic `await import('tz-lookup' as any)` en lugar de `require()` — la package es CommonJS y `import.meta.url` no existe en Jest.

## Archivos clave

| Archivo | Propósito |
|---|---|
| `apps/api/src/utils/date.transformer.ts` | `makeDateInTimezone`, `inferTimezoneFromCoords`, `DateTransformer`, `DateTimeTransformer` |
| `apps/api/src/services/retreatScheduleService.ts:592-617` | `computeItemDateRange(timezone)` con makeDateInTimezone |
| `apps/api/src/services/retreatScheduleService.ts` `resolveRetreatTimezone()` | resuelve `retreat.timezone ?? house.timezone ?? default` |
| `apps/api/src/migrations/sqlite/20260507280000_AddTimezoneToHouseAndRetreat.ts` | añade columnas |
| `apps/api/src/services/participantService.ts:121-131` | patrón `todayYmdInAppTz` con `APP_TIMEZONE` env (legacy global) |
| `apps/web/src/components/AddEditHouseModal.vue` | selector + watcher de coords → autocompletar TZ |
| `apps/web/src/components/RetreatModal.vue` | selector con opción "Heredar de la casa" |
