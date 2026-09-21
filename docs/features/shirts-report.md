# Reporte de Camisetas

Vista de **confirmación uno-a-uno** de las prendas (playera, chamarra, etc.) que pidieron servidores y angelitos de un retiro, con el **valor a cobrar** por cada una. Pensada para imprimirse y llevarse a la reunión semanal de preparación, donde el coordinador valida con cada persona qué pidió y de qué talla.

Cada tipo de prenda puede tener un `price` (configurable en `/app/settings/shirt-types`); ese valor se suma al saldo esperado de servidores y angelitos (`Participant.chargeBreakdown.shirts`) — el caminante no lo paga aparte, va incluido en la cuota del retiro. Detalle del cargo: [Confirmación de camisetas y precio por prenda](./shirt-pricing-and-confirmation.md).

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
| Valor total | Suma de `shirtCharge` de todos los participantes listados (`totalCharge` de la respuesta) |
| Confirmados | `X/Y` — cuántos ya confirmaron su pedido (`shirtOrderConfirmedAt` no-null) sobre el total listado |

Botón **Imprimir** a la derecha (icono de impresora) que ejecuta `window.print()`.

---

### 2. Tabla de pedidos

Una **fila por persona**. Las columnas se generan dinámicamente según los `RetreatShirtType` configurados en el retiro (en `/app/settings/shirt-types`):

| Columna fija | Descripción |
|---|---|
| `#` | `idOnRetreat` o `—` si no tiene |
| Nombre | `firstName lastName` |

Después se agrega una columna por cada tipo de prenda configurado (orden por `sortOrder`):

- Si la persona pidió esa prenda, muestra la talla en un badge índigo (`S`, `M`, `G`, `X`, `2`, etc.).
- Si **no** la pidió, muestra `—`.

Últimas columnas fijas:

| Columna fija | Descripción |
|---|---|
| Valor | `shirtCharge` de la persona (suma del precio de cada prenda con precio configurado; `$0.00` si ninguna lo tiene) |
| Confirmado | Badge clicable **✓ Confirmado** (verde) / **● Sin confirmar** (gris) + botón de WhatsApp — ver [Confirmación del pedido](#5-confirmación-del-pedido). Oculta al imprimir |
| `✓` | Solo visible al imprimir: **✓ verde** si ya confirmó, cuadrito vacío si no |

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

Junto al buscador vive el chip **"Solo sin confirmar"** (con el conteo de pendientes) — ver [Confirmación del pedido](#5-confirmación-del-pedido).

---

### 5. Confirmación del pedido

El proceso real: se lanza la secuencia de WhatsApp "Confirmación de camisetas (servidores)" (plantillas `SERVER_SHIRT_CONFIRMATION`), el servidor responde confirmando sus tallas/cargo, y el coordinador le da el chulo desde esta vista. Antes esto se cuadraba imprimiendo el reporte y palomeando a mano; ahora el estado queda registrado **por retiro** en `retreat_participants.shirtOrderConfirmedAt`.

**Semántica**: `NULL` = sin confirmar; timestamp = cuándo se dio el chulo. Un solo estado, sin notas ni quién lo marcó.

Piezas:

- **Badge clicable** en la columna Confirmado: clic marca (timestamp `new Date()` server-side), otro clic desmarca (`NULL`). Toggle optimista con rollback + toast destructivo si falla el guardado; guard anti doble-tap por participante (`savingStates`); sin refetch del reporte tras el toggle. Escribir en pantalla NO envía ningún mensaje — el chulo es manual, tras leer la respuesta del servidor.
- **Botón de WhatsApp** (ícono `MessageSquare`, junto al badge): abre `https://api.whatsapp.com/send?phone=…` con la lada resuelta del país del participante (`buildWhatsAppChatLink(cellPhone, country)` de `apps/web/src/utils/phone.ts`), en pestaña nueva. Sin texto precargado: abre la **conversación real**, donde viven las respuestas (la app solo registra lo que ella envía). Si el participante no tiene teléfono, el botón no se renderiza.
- **Filtro "Solo sin confirmar"**: chip en el toolbar que deja la lista en pendientes. Compone **AND** con la búsqueda; el contador del chip siempre cuenta sobre el total del reporte.

**Permisos**: ver el reporte requiere `participant:read`; dar/quitar el chulo requiere `participant:update` + acceso al retiro. El teléfono/país viajan en la respuesta del reporte bajo esos mismos permisos.

**Endpoint**:

```
PATCH /api/history/retreat/:retreatId/participant/:participantId/shirt-order-confirmation
Body: { confirmed: boolean }   → { ok: true }
Permiso: participant:update + requireRetreatAccess
```

`confirmed: true` estampa `shirtOrderConfirmedAt = new Date()`; `false` lo limpia a `NULL`. Con un par retiro×participante inexistente afecta 0 filas y responde `ok: true` (mismo contrato que `bag-made`).

Aplica a `server` y `partial_server` (ambos ya salen en el reporte); los walkers no participan de este flujo. Sin evento realtime: el reporte es de un coordinador, no una pantalla compartida (a diferencia de `bag-made` que sí emite para recepción).

---

### 6. Estado vacío

Cuando el retiro no tiene servidores ni angelitos con prendas pedidas:

> Ningún servidor o angelito ha pedido prendas en este retiro.

(Por ejemplo, retiro recién creado, o donde nadie ha completado el formulario de servidor.)

---

### 7. Impresión

Estilos `@media print` ocultan el toolbar, la cabecera del sidebar, los botones, el footer y la **columna Confirmado** (clase `.no-print`). Lo que queda visible al imprimir:

- Header con totales (incluye el badge "Confirmados X/Y").
- Tabla con bordes sólidos en cada celda y la columna `✓` con **estado real**: ✓ verde si ya confirmó en el sistema, cuadrito vacío para los pendientes (útil como lista de seguimiento en la reunión semanal).

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
   SELECT p.*, rp.idOnRetreat, rp.type, rp.shirtOrderConfirmedAt, p.cellPhone, p.country,
          pss.shirtTypeId, rst.name, pss.size, rst.price, ...
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

   La query es cruda: SQLite devuelve `datetime`/`decimal` como **string** — `shirtOrderConfirmedAt`, `cellPhone` y `country` se tipan `string | null` en todo el pipeline (nunca `z.coerce.date()`).

3. **Agrupar** las filas por `participantId` para producir el array `participants[].shirts[]`, sumando `shirtCharge` por persona y `totalCharge` global (redondeo a centavos en cada suma; SQLite devuelve `decimal` como string, siempre `Number(...)` antes de sumar).

#### Controller y route

```
apps/api/src/controllers/shirtReportController.ts
apps/api/src/controllers/retreatParticipantController.ts  (updateShirtOrderConfirmationController)
apps/api/src/routes/shirtTypeRoutes.ts:18-22
apps/api/src/routes/retreatParticipant.routes.ts  (PATCH shirt-order-confirmation)
```

```
GET /api/retreats/:retreatId/shirt-report
Permiso: participant:read

PATCH /api/history/retreat/:retreatId/participant/:participantId/shirt-order-confirmation
Body: { confirmed: boolean }
Permiso: participant:update + requireRetreatAccess('retreatId')
```

El PATCH usa `syncRetreatFields` (mismo camino que `bag-made`) contra la fila de `retreat_participants`: `confirmed: true` → `shirtOrderConfirmedAt = new Date()`, `false` → `NULL`. Responde `{ ok: true }`.

Devuelve `ShirtReportResponse`:

```ts
{
  shirtTypes: Array<{ id, name, color, sortOrder, price: number | null }>,
  participants: Array<{
    participantId, firstName, lastName, idOnRetreat,
    type: 'server' | 'partial_server',
    shirtOrderConfirmedAt: string | null,
    cellPhone: string | null,
    country: string | null,
    shirts: Array<{ shirtTypeId, shirtTypeName, color, sortOrder, size, price: number | null }>,
    shirtCharge: number,
  }>,
  totalCharge: number,
}
```

### Tipos compartidos

```
packages/types/src/index.ts (sección "Shirt Report")
```

- `shirtReportShirtSchema` / `ShirtReportShirt` — incluye `price: number | null`.
- `shirtReportParticipantSchema` / `ShirtReportParticipant` — incluye `shirtCharge: number`, `shirtOrderConfirmedAt`, `cellPhone` y `country` (los tres `string | null`).
- `shirtReportShirtTypeSchema` / `ShirtReportShirtType` — incluye `price: number | null`.
- `shirtReportResponseSchema` / `ShirtReportResponse` — incluye `totalCharge: number`.
- `setShirtOrderConfirmationSchema` / `SetShirtOrderConfirmation` — body del PATCH (`{ confirmed: boolean }`).

### Frontend

```
apps/web/src/views/ShirtsReportView.vue
apps/web/src/services/api.ts  (getShirtReport + updateShirtOrderConfirmation)
apps/web/src/utils/phone.ts   (buildWhatsAppChatLink)
```

- Vue 3 Composition API con `<script setup>`.
- Estado local: `loading`, `report`, `searchQuery`, `onlyUnconfirmed`, `savingStates`, `currentRetreatId`.
- Stores: `useRetreatStore` (para obtener `selectedRetreatId`); `useToast` para el rollback del toggle.
- Llama `getShirtReport(retreatId)` en `onMounted` (guarda `currentRetreatId` para el toggle).
- Computed: `filteredParticipants` (búsqueda AND solo-sin-confirmar), `totals` (incluye `confirmed`), `sortedShirtTypes`.
- `toggleConfirmation`: patrón `CommunityAttendanceView.toggleAttendance` — guard por `savingStates[participantId]`, flip optimista del objeto local, await PATCH, catch → rollback + toast, finally limpia el guard. Sin refetch.
- Sin Pinia store dedicado — el reporte se recarga cada vez que entras a la vista.

### Base de datos

Reusa las tablas existentes (no agrega ninguna):

- `participants` — datos personales (`cellPhone`, `country` alimentan el botón de WhatsApp).
- `retreat_participants` — overlay por retiro (`type`, `isCancelled`, `idOnRetreat`). Columna `shirtOrderConfirmedAt` (datetime nullable) agregada por la migración `20260921220000_AddShirtOrderConfirmedAtToRetreatParticipants` — el estado de confirmación es **por retiro**.
- `participant_shirt_size` — relación M:N persona ↔ tipo de playera + talla.
- `retreat_shirt_type` — catálogo de tipos por retiro; columna `price` (nullable, `NULL`/`0` = sin cargo) agregada por la migración `ServerShirtPricingAndConfirmation`.

---

## Tests

### Backend (Jest)

```
apps/api/src/tests/services/shirtReportService.test.ts
apps/api/src/tests/routes/shirtOrderConfirmation.routes.simple.test.ts
```

27 casos en el spec del service (filtrado, precios, totales, orden, y desde la feature de confirmación):

- `shirtOrderConfirmedAt` llega `null` por defecto, junto con `cellPhone`/`country`.
- Tras confirmar por `syncRetreatFields`, el reporte devuelve el timestamp como string no-null.
- Al limpiar (`false`) vuelve a `NULL`.
- El estado es por retiro: confirmado en retiro A no aparece en el reporte del retiro B.

9 casos en el spec de rutas (supertest contra el router real con middlewares stubbeados — el 403 vive en el middleware, invisible al controller directo):

- Wiring: 200 registra `requirePermission('participant:update')` + `requireRetreatAccess('retreatId')`; 401 sin sesión; 403 sin permiso; 403 sin acceso al retiro (flag intacto en cada caso).
- Semántica: 400 si `confirmed` no es booleano o falta; `true` estampa timestamp (verificado por query directa); `false` → `NULL`; par inexistente responde `ok: true` (contrato documentado).

```bash
pnpm --filter api test src/tests/services/shirtReportService.test.ts
pnpm --filter api test src/tests/routes/shirtOrderConfirmation.routes.simple.test.ts
```

### Frontend (Vitest)

```
apps/web/src/views/__tests__/ShirtsReportView.test.ts
```

29 casos: carga inicial, header con totales (incluye "Confirmados X/Y"), columnas dinámicas, render de tallas y `—`, búsqueda por nombre/número/talla, estado vacío, footer con conteos, impresión, y el bloque de confirmación: badges por estado, toggle optimista (args correctos, sin refetch), rollback con toast, doble-tap con un solo PATCH, filtro "Solo sin confirmar" (+ composición AND con búsqueda), link wa.me con la lada resuelta por país (y ausente sin teléfono), y la columna ✓ print con estado real.

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

### ¿Por qué el chulo es manual y no se parsea la respuesta de WhatsApp?

El mensaje de la secuencia pide al servidor confirmar tallas y cargo; la respuesta llega al WhatsApp **del coordinador** (número personal, no uno conectado a la app). La app no puede leerla — el chulo lo estampa la persona que leyó la respuesta. El botón de WhatsApp por fila existe justo para acortar ese paso: abrir la conversación, leer, dar el chulo.

### ¿Por qué `shirtOrderConfirmedAt` datetime y no un boolean?

Un solo estado de dos valores, pero el timestamp gratis responde "¿cuándo confirmó?" — dato que un boolean obligaría a reconstruir. `NULL` = sin confirmar. Mismo patrón que `checkedInAt` (datetime nullable por participante-retiro).

### ¿Por qué sin realtime ni refetch tras el toggle?

El reporte lo usa **un coordinador a la vez**; a diferencia de `bag-made` (recepción multi-pantalla), no hay segunda pantalla que enterarse del cambio. El toggle optimista actualiza el estado local y el contador; recargar la vista re-lee del servidor.

### ¿Por qué solo `window.print()` y no exportación a Excel?

El usuario lo eligió explícitamente — para la reunión semanal basta con un papel impreso. Si en el futuro se quiere `.xlsx`, agregar usando ExcelJS (ya está en `apps/api/package.json`).

---

## Trabajos relacionados

- **Configuración de tipos de playera**: `/app/settings/shirt-types` (vista existente, `RetreatShirtTypesView.vue`).
- **Asignación de tallas durante el registro**: `ParticipantRegistrationView.vue` paso 5 (servidores y caminantes).
- **Inventario derivado**: `retreat_inventory.requiredQuantity` se recalcula automáticamente cuando cambian las tallas (ver `participantService.ts:492-504`).
