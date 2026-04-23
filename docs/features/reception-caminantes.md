# Recepción de Caminantes

Funcionalidad para registrar la llegada de caminantes el día del retiro y visualizar el progreso en tiempo real.

---

## Resumen

| Aspecto | Detalle |
|---------|---------|
| **Ruta frontend** | `/app/retreats/:id/reception` |
| **Nombre de ruta** | `reception` |
| **Endpoint check-in** | `PUT /participants/:id/checkin` |
| **Endpoint stats** | `GET /participants/reception/:retreatId` |
| **Campo de datos** | `retreat_participants.checkedIn` + `checkedInAt` |
| **Migración** | `20260422130000_AddCheckinToRetreatParticipant` |

---

## Qué hace

### Vista de recepción (`/app/retreats/:id/reception`)
- **Dashboard**: 3 tarjetas (Total / Llegaron / Faltan) + barra de progreso con porcentaje
- **Hora esperada de llegada**: badge con la hora del retiro (`walkerArrivalTime`). Si hoy es el día del retiro muestra además "hace X min" / "en X min" / "ahora" con color dinámico (azul → ámbar → rojo)
- **Lista de pendientes**: caminantes que aún no han llegado, con búsqueda + clear por nombre o número
- **Check-in con un clic**: botón "Llegó" por fila. Si el registro no tiene `participantId` muestra badge ámbar "Sin vínculo" en lugar del botón
- **Lista de llegados** (colapsable): muestra hora de llegada, búsqueda propia y botón "Deshacer"
- **Auto-refresh cada 30 s**: múltiples recepcionistas pueden usarla simultáneamente

### Dashboard del retiro
- Card "Recepción de Caminantes" con Total / Llegaron / Faltan + barra de progreso. Clickeable → navega a la vista de recepción

### Sidebar
- Ítem "Recepción" con **badge ámbar** mostrando el número de caminantes pendientes
- Badges de conteo en todos los ítems de participantes:

| Ítem | Color | Muestra |
|------|-------|---------|
| Caminantes | Azul | Total walkers activos |
| Servidores | Verde | Total servidores activos |
| Angelitos | Morado | Total partial_servers activos |
| Lista de Espera | Ámbar | Total en espera |
| Cancelados | Rojo | Total cancelados |
| Recepción | Ámbar | Pendientes de llegar |

Los badges se cargan automáticamente al cambiar de retiro, sin necesidad de visitar cada vista.

### Vista de Caminantes
- Botón "Ir a Recepción" junto al `+` en la barra de herramientas de la lista

---

## Base de datos

### Columnas agregadas a `retreat_participants`

| Columna | Tipo | Default | Descripción |
|---------|------|---------|-------------|
| `checkedIn` | `boolean` | `false` | Si el caminante ya llegó |
| `checkedInAt` | `datetime` | `NULL` | Momento exacto del check-in |

### Migración

```
apps/api/src/migrations/sqlite/20260422130000_AddCheckinToRetreatParticipant.ts
```

Reversible: `down()` reconstruye la tabla sin las columnas.

---

## API

### `PUT /participants/:participantId/checkin`

Marca o desmarca la llegada de un caminante.

**Requiere permiso:** `participant:update`

**Body:**
```json
{ "retreatId": "uuid", "checkedIn": true }
```

**Response `200`:**
```json
{ "checkedIn": true, "checkedInAt": "2026-04-22T15:30:00.000Z" }
```

`checkedIn: false` limpia `checkedInAt` a `null`.

---

### `GET /participants/reception/:retreatId`

Estadísticas de recepción para el retiro.

**Requiere permiso:** `participant:list`

**Response `200`:**
```json
{
  "total": 40, "arrived": 25, "pending": 15,
  "pendingList": [
    { "retreatParticipantId": "uuid", "participantId": "uuid", "idOnRetreat": 3,
      "firstName": "María", "lastName": "González", "cellPhone": "5551234567",
      "checkedIn": false, "checkedInAt": null }
  ],
  "arrivedList": [
    { "retreatParticipantId": "uuid", "participantId": "uuid", "idOnRetreat": 1,
      "firstName": "Juan", "lastName": "Pérez", "cellPhone": "5559876543",
      "checkedIn": true, "checkedInAt": "2026-04-22T15:30:00.000Z" }
  ]
}
```

Solo incluye walkers (`type = 'walker'`, `isCancelled = false`), ordenados por `idOnRetreat ASC`.

---

## Archivos modificados / creados

### Backend

| Archivo | Cambio |
|---------|--------|
| `apps/api/src/migrations/sqlite/20260422130000_AddCheckinToRetreatParticipant.ts` | Nueva migración |
| `apps/api/src/entities/retreatParticipant.entity.ts` | Campos `checkedIn`, `checkedInAt` |
| `apps/api/src/services/participantService.ts` | `setParticipantCheckIn()`, `getReceptionStats()` |
| `apps/api/src/controllers/participantController.ts` | `checkInParticipant()`, `getReceptionStats()` |
| `apps/api/src/routes/participantRoutes.ts` | `PUT /:id/checkin`, `GET /reception/:retreatId` |

### Frontend

| Archivo | Cambio |
|---------|--------|
| `apps/web/src/views/RecepcionView.vue` | Vista nueva con i18n, hora esperada, búsqueda |
| `apps/web/src/views/RetreatDashboardView.vue` | Card de recepción |
| `apps/web/src/views/WalkersView.vue` | Botón "Ir a Recepción" junto al `+` |
| `apps/web/src/stores/receptionStore.ts` | Store de pendingCount |
| `apps/web/src/services/api.ts` | `getReceptionStats()`, `checkInParticipant()` |
| `apps/web/src/router/index.ts` | Ruta `retreats/:id/reception` |
| `apps/web/src/components/layout/Sidebar.vue` | Ítem Recepción + badges todos los ítems + carga automática |
| `apps/web/src/components/layout/SidebarMenuItem.vue` | Prop `badge` + `badgeColor` |
| `apps/web/src/layouts/AppLayout.vue` | Título de página para ruta `reception` |
| `apps/web/src/locales/es.json` | Sección `reception.*` + `sidebar.reception` |

### Tests

| Archivo | Cobertura |
|---------|-----------|
| `apps/api/src/tests/services/reception.simple.test.ts` | Lógica de stats, check-in, progress % |
| `apps/api/src/tests/services/receptionBadges.simple.test.ts` | Badges sidebar, conteos participantes, receptionStore |

---

## Tests

```bash
cd apps/api && npx jest reception --forceExit
```

**Suites:**

| Suite | Tests | Qué verifica |
|-------|-------|-------------|
| `computeReceptionStats / counters` | 5 | Totales, pendientes y llegados |
| `computeReceptionStats / filtering` | 3 | Solo walkers activos |
| `computeReceptionStats / pendingList` | 3 | Forma y contenido de pendientes |
| `computeReceptionStats / arrivedList` | 2 | Forma y contenido de llegados |
| `applyCheckIn` | 4 | Timestamps, idempotencia |
| `receptionPercent` | 6 | Cálculo % barra de progreso |
| `computeParticipantCounts` | 4 | Conteos por tipo |
| `itemBadge` | 10 | Badge correcto por ítem, null en 0 |
| `itemBadgeColor` | 7 | Colores por ítem, fallback gris |
| `receptionStore` | 5 | setPending, clear, secuencias |

**Total: 49 tests**

---

## Badge de tiempo transcurrido

El badge "hace X min" / "en X min" en la vista de recepción:
- Solo aparece si el retiro tiene `walkerArrivalTime` configurado
- Solo aparece el **día de inicio** del retiro (`startDate === hoy`)
- Se actualiza cada 30 segundos
- Colores: azul (antes de hora), ámbar (0-30 min tarde), rojo (>30 min tarde)

Si el retiro no tiene `walkerArrivalTime`, configurarlo en los ajustes del retiro en el campo "Hora de llegada de caminantes".
