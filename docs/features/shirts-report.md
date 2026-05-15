# Reporte de Camisetas

Vista de **confirmación uno-a-uno** de las prendas (playera, chamarra, etc.) que pidieron servidores y angelitos de un retiro. Pensada para imprimirse y llevarse a la reunión semanal de preparación, donde el coordinador valida con cada persona qué pidió y de qué talla.

> No confundir con [Reporte de Bolsas](./bags-report.md) (sólo caminantes, una talla simple) ni con el [Inventario](../../apps/api/src/services/inventoryService.ts) (conteos agregados para compra).

---

## Acceso

`/app/shirts-report` — disponible en el menú lateral bajo **Reportes**, entre "Reporte de Bolsas" y "Reporte de Medicinas".

Permiso requerido: `participant:read` (mismo nivel que ver el listado de servidores).

---

## Funcionalidades

### 1. Cabecera con totales

| Badge | Descripción |
|---|---|
| Servidores | Cuenta de `type = 'server'` con al menos una prenda solicitada |
| Angelitos | Cuenta de `type = 'partial_server'` con al menos una prenda solicitada |
| Prendas | Total de filas en `participant_shirt_size` para los participantes listados |

Botón **Imprimir** a la derecha (icono de impresora) que ejecuta `window.print()`.

---

### 2. Tabla de pedidos

Una **fila por persona**. Las columnas se generan dinámicamente según los `RetreatShirtType` configurados en el retiro (en `/app/settings/shirt-types`):

| Columna fija | Descripción |
|---|---|
| `#` | `idOnRetreat` o `—` si no tiene |
| Nombre | `firstName lastName` |
| Tipo | Badge **SERVIDOR** (azul) o **ANGELITO** (rosa) |

Después se agrega una columna por cada tipo de prenda configurado (orden por `sortOrder`):

- Si la persona pidió esa prenda, muestra la talla en un badge índigo (`S`, `M`, `G`, `X`, `2`, etc.).
- Si **no** la pidió, muestra `—`.

Última columna fija:

| Columna fija | Descripción |
|---|---|
| `✓` | Cuadrito vacío con borde — para que el coordinador marque a mano cuando confirma con la persona |

**Ordenamiento**: por `lastName`, luego `firstName` (alfabético, en SQL).

---

### 3. Filtro por inclusión

La lista **solo incluye servidores y angelitos que pidieron al menos una prenda**. Se excluyen automáticamente:

- Caminantes (`walker`) — éstos van en [Reporte de Bolsas](./bags-report.md).
- Cancelados (`isCancelled = true`).
- Servidores/angelitos sin filas en `participant_shirt_size` para este retiro.
- Filas con `size` vacío, `null` (cadena placeholder legacy) o `NULL`.

---

### 4. Búsqueda

Campo de texto en el toolbar de la tabla. Filtra en tiempo real (insensible a mayúsculas) por:

- Nombre completo (`firstName + lastName`)
- Número de retiro (`idOnRetreat`)
- Talla (`size` de cualquiera de sus prendas)

Botón `X` para limpiar la búsqueda. Cuando no hay resultados se muestra "Sin resultados para tu búsqueda" con un link rápido para limpiar.

---

### 5. Estado vacío

Cuando el retiro no tiene servidores ni angelitos con prendas pedidas:

> Ningún servidor o angelito ha pedido prendas en este retiro.

(Por ejemplo, retiro recién creado, o donde nadie ha completado el formulario de servidor.)

---

### 6. Impresión

Estilos `@media print` ocultan el toolbar, la cabecera del sidebar, los botones y el footer (clase `.no-print`). Lo que queda visible al imprimir:

- Header con totales.
- Tabla con bordes sólidos en cada celda y un cuadrito vacío en la columna `✓` para marcar a mano.

Tipografía reducida en print (`11px`) para que quepa más por hoja.

---

## Arquitectura técnica

### Backend

#### Service

```
apps/api/src/services/shirtReportService.ts
```

Una sola función exportada:

```ts
export const getShirtOrdersForRetreat = async (
  retreatId: string,
): Promise<ShirtReportResponse>
```

Internamente hace:

1. **Listar tipos de prenda** del retiro (TypeORM repo) ordenados por `sortOrder ASC, createdAt ASC`.
2. **Single SQL query** con joins:

   ```sql
   SELECT p.*, rp.idOnRetreat, rp.type, pss.shirtTypeId, rst.name, pss.size, ...
     FROM participants p
     INNER JOIN retreat_participants rp
       ON rp.participantId = p.id
       AND rp.retreatId = ?
       AND rp.isCancelled = 0
       AND rp.type IN ('server', 'partial_server')
     INNER JOIN participant_shirt_size pss
       ON pss.participantId = p.id
       AND pss.size IS NOT NULL
       AND pss.size != ''
       AND pss.size != 'null'
     INNER JOIN retreat_shirt_type rst
       ON rst.id = pss.shirtTypeId
       AND rst.retreatId = ?
     ORDER BY p.lastName ASC, p.firstName ASC, rst.sortOrder ASC
   ```

3. **Agrupar** las filas por `participantId` para producir el array `participants[].shirts[]`.

#### Controller y route

```
apps/api/src/controllers/shirtReportController.ts
apps/api/src/routes/shirtTypeRoutes.ts:18-22
```

```
GET /api/retreats/:retreatId/shirt-report
Permiso: participant:read
```

Devuelve `ShirtReportResponse`:

```ts
{
  shirtTypes: Array<{ id, name, color, sortOrder }>,
  participants: Array<{
    participantId, firstName, lastName, idOnRetreat,
    type: 'server' | 'partial_server',
    shirts: Array<{ shirtTypeId, shirtTypeName, color, sortOrder, size }>,
  }>,
}
```

### Tipos compartidos

```
packages/types/src/index.ts (sección "Shirt Report")
```

- `shirtReportShirtSchema` / `ShirtReportShirt`
- `shirtReportParticipantSchema` / `ShirtReportParticipant`
- `shirtReportShirtTypeSchema` / `ShirtReportShirtType`
- `shirtReportResponseSchema` / `ShirtReportResponse`

### Frontend

```
apps/web/src/views/ShirtsReportView.vue
apps/web/src/services/api.ts  (función getShirtReport)
```

- Vue 3 Composition API con `<script setup>`.
- Estado local: `loading`, `report`, `searchQuery`.
- Stores: `useRetreatStore` (para obtener `selectedRetreatId`).
- Llama `getShirtReport(retreatId)` en `onMounted`.
- Computed: `filteredParticipants`, `totals`, `sortedShirtTypes`.
- Sin Pinia store dedicado — el reporte se recarga cada vez que entras a la vista.

### Base de datos

Reusa las tablas existentes (no agrega ninguna):

- `participants` — datos personales.
- `retreat_participants` — overlay por retiro (`type`, `isCancelled`, `idOnRetreat`).
- `participant_shirt_size` — relación M:N persona ↔ tipo de playera + talla.
- `retreat_shirt_type` — catálogo de tipos por retiro.

---

## Tests

### Backend (Jest)

```
apps/api/src/tests/services/shirtReportService.test.ts
```

8 casos:

- Devuelve arrays vacíos cuando no hay datos.
- `shirtTypes` ordenados por `sortOrder` independientemente del orden de inserción.
- Excluye walkers aunque tengan filas en `participant_shirt_size`.
- Excluye servidores y angelitos cancelados.
- Excluye servidores y angelitos sin pedidos.
- Incluye ambos (server + partial_server) con todas sus prendas.
- Filtra placeholders de talla (`''`, `'null'`, `NULL`).
- No mezcla prendas de otro retiro.

```bash
pnpm --filter api test src/tests/services/shirtReportService.test.ts
```

### Frontend (Vitest)

```
apps/web/src/views/__tests__/ShirtsReportView.test.ts
```

19 casos: carga inicial, header con totales, columnas dinámicas, badges de tipo, render de tallas y `—`, búsqueda por nombre/número/talla, estado vacío, footer con conteos, e impresión.

```bash
pnpm --filter web test src/views/__tests__/ShirtsReportView.test.ts
```

### E2E

No hay tests E2E dedicados (la cobertura backend + frontend es suficiente). Si en el futuro se requiere, agregar en `apps/web/tests/e2e/shirts-report.spec.ts`.

---

## Decisiones de diseño

### ¿Por qué un endpoint nuevo en vez de reusar `findAllParticipants`?

`findAllParticipants` ya carga participantes con muchas relaciones, pero **no carga `shirtSizes`** (sólo `findParticipantById` lo hace). Hacer un fetch + N llamadas a `findParticipantById` sería un N+1.

El endpoint dedicado:
- Una sola query SQL → 1 round-trip a la DB.
- Filtra a nivel SQL (sin pedidos = sin fila), evita post-procesamiento.
- Devuelve un payload pequeño y específico para esta vista.

### ¿Por qué la columna ✓ vacía en vez de un checkbox real?

El propósito es marcar **a mano sobre el papel impreso**. Un checkbox interactivo añadiría complejidad (estado, persistencia) sin valor real para el caso de uso (la confirmación es offline, en la reunión semanal).

### ¿Por qué solo `window.print()` y no exportación a Excel?

El usuario lo eligió explícitamente — para la reunión semanal basta con un papel impreso. Si en el futuro se quiere `.xlsx`, agregar usando ExcelJS (ya está en `apps/api/package.json`).

---

## Trabajos relacionados

- **Configuración de tipos de playera**: `/app/settings/shirt-types` (vista existente, `RetreatShirtTypesView.vue`).
- **Asignación de tallas durante el registro**: `ParticipantRegistrationView.vue` paso 5 (servidores y caminantes).
- **Inventario derivado**: `retreat_inventory.requiredQuantity` se recalcula automáticamente cuando cambian las tallas (ver `participantService.ts:492-504`).
