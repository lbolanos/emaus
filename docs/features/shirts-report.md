# Reporte de Camisetas

Vista de **confirmación uno-a-uno** de las prendas (playera, chamarra, etc.) del **equipo servidor completo** de un retiro — servidores y angelitos, **incluidos quienes no pidieron prendas** — con el **valor a cobrar** por cada una. Pensada para imprimirse y llevarse a la reunión semanal de preparación, donde el coordinador valida con cada persona qué pidió y de qué talla.

Al final, un **resumen de pedido** junta lo que hay que comprarle al proveedor: las piezas por talla del equipo, las camisetas de los caminantes inscritos y un estimado de los caminantes que faltan por inscribirse — ver [Resumen de pedido](#8-resumen-de-pedido-al-proveedor).

Cada tipo de prenda puede tener un `price` (configurable en `/app/settings/shirt-types`); ese valor se suma al saldo esperado de servidores y angelitos (`Participant.chargeBreakdown.shirts`) — el caminante no lo paga aparte, va incluido en la cuota del retiro. Detalle del cargo: [Confirmación de camisetas y precio por prenda](./shirt-pricing-and-confirmation.md).

> No confundir con [Reporte de Bolsas](./bags-report.md) (sólo caminantes, una talla simple) ni con el [Inventario](../../apps/api/src/services/inventoryService.ts) (conteos agregados para compra).

---

## Acceso

`/app/shirts-report` — disponible en el menú lateral bajo **Reportes**, entre "Reporte de Bolsas" y "Reporte de Medicinas".

Permiso requerido: `participant:read` **+ acceso al retiro** (`requireRetreatAccess('retreatId')`). El reporte lista `cellPhone`/`country` de todos los servidores del retiro — PII con alcance por retiro: `participant:read` solo (permiso global) dejaría a cualquier usuario autenticado enumerar los teléfonos de un retiro ajeno.

---

## Funcionalidades

### 1. Cabecera con totales

| Badge | Descripción |
|---|---|
| Servidores | Cuenta de `type = 'server'` del retiro (equipo completo, pida o no prendas) |
| Angelitos | Cuenta de `type = 'partial_server'` del retiro (equipo completo) |
| Prendas | Total de filas en `participant_shirt_size` para los participantes listados |
| Valor total | Suma de `shirtCharge` de todos los participantes listados (`totalCharge` de la respuesta) |
| Confirmados | `X/Y` — cuántos ya confirmaron su pedido (`shirtOrderConfirmedAt` no-null) sobre el equipo completo listado |

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

### 3. Universo y filtro «Requieren camiseta»

La lista base es **todo el equipo servidor del retiro**: la secuencia de WhatsApp `SERVER_SHIRT_CONFIRMATION` se enrola a todos los servidores y angelitos no cancelados, y quien no pidió prendas también responde ("no necesito camisetas") y recibe su chulo — excluirlo del reporte dejaba a esa gente fuera de la cuadratura de confirmación.

Quien no pidió aparece con `shirts: []`: columnas de talla en `—`, Valor `$0.00`, badge y botón de WhatsApp operativos. Solo se excluye a:

- Caminantes (`walker`) — éstos van en [Reporte de Bolsas](./bags-report.md).
- Cancelados (`isCancelled = true`).

Para estrechar la lista al pedido de compra viven dos chips en el toolbar:

- **«Requieren camiseta»** (badge con el conteo): deja solo a quienes pidieron ≥1 prenda de este retiro — la lista para la reunión de compra.
- **«Solo sin confirmar»**: deja solo pendientes de confirmación (ver [Confirmación del pedido](#5-confirmación-del-pedido)).

Ambos componen **AND** entre sí y con la búsqueda; los contadores (chips y "Confirmados X/Y") siempre miden sobre el equipo completo, no sobre la lista filtrada.

---

### 4. Búsqueda

Campo de texto en el toolbar de la tabla. Filtra en tiempo real (insensible a mayúsculas) por:

- Nombre completo (`firstName + lastName`)
- Número de retiro (`idOnRetreat`)
- Talla (`size` de cualquiera de sus prendas)

Botón `X` para limpiar la búsqueda. Cuando la tabla queda vacía el mensaje distingue quién la vació: con búsqueda activa, "Sin resultados para tu búsqueda" con link para limpiar; con el chip "Solo sin confirmar" como único filtro activo y todo confirmado, "Todos los pedidos de este retiro están confirmados" con link **Mostrar todos**; con "Requieren camiseta" activo (solo o combinado) y nadie que cumpla, "Nadie coincide con los filtros activos" con link **Quitar filtros** (desactiva ambos chips, no limpia la búsqueda).

Junto al buscador viven los chips **"Requieren camiseta"** y **"Solo sin confirmar"** (cada uno con su conteo) — ver [Universo y filtro](#3-universo-y-filtro-requieren-camiseta) y [Confirmación del pedido](#5-confirmación-del-pedido).

---

### 5. Confirmación del pedido

El proceso real: se lanza la secuencia de WhatsApp "Confirmación de camisetas (servidores)" (plantillas `SERVER_SHIRT_CONFIRMATION`), el servidor responde confirmando sus tallas/cargo, y el coordinador le da el chulo desde esta vista. Antes esto se cuadraba imprimiendo el reporte y palomeando a mano; ahora el estado queda registrado **por retiro** en `retreat_participants.shirtOrderConfirmedAt`.

**Semántica**: `NULL` = sin confirmar; timestamp = cuándo se dio el chulo. Un solo estado, sin notas ni quién lo marcó.

Piezas:

- **Badge clicable** en la columna Confirmado: clic marca (timestamp `new Date()` server-side), otro clic desmarca (`NULL`). En pantallas angostas (celular) la leyenda se oculta y queda solo el glifo (`✓`/`●` en un `span hidden sm:inline`). Toggle optimista con rollback + toast destructivo si falla el guardado; guard anti doble-tap por participante (`savingStates`); sin refetch del reporte tras el toggle. Escribir en pantalla NO envía ningún mensaje — el chulo es manual, tras leer la respuesta del servidor.
- **Botón de WhatsApp** (ícono `MessageSquare`, junto al badge): abre `https://api.whatsapp.com/send?phone=…` con la lada resuelta del país del participante (`buildWhatsAppChatLink(cellPhone, country)` de `apps/web/src/utils/phone.ts`), en pestaña nueva. Sin texto precargado: abre la **conversación real**, donde viven las respuestas (la app solo registra lo que ella envía). Si el participante no tiene teléfono, el botón no se renderiza.
- **Botón "Enviar mensaje de confirmación"** (ícono `Send`, último de la celda): abre el dialog central de mensajería (`MessageDialog.vue`) con la plantilla `SERVER_SHIRT_CONFIRMATION` preseleccionada (`forceTemplateType`) y el pedido resuelto — mismo flujo que el botón de mensaje de ParticipantList. El coordinador puede editar el texto (o cambiar de plantilla, p. ej. al `_REMINDER`) antes de enviar; el envío es deep-link asistido + clipboard y queda registrado en el historial de comunicaciones del participante. Visible en toda fila, incluso sin teléfono (el dialog permite email). Antes de hidratar limpia los filtros heredados del `participantStore` (otra vista puede haber dejado `type='server'`, que excluiría a los angelitos de la query), y si el retiro cambia en el sidebar mientras carga la ficha, el dialog no abre — evita mezclar la ficha de un retiro con el id de otro.
- **Filtro "Solo sin confirmar"**: chip en el toolbar que deja la lista en pendientes. Compone **AND** con la búsqueda; el contador del chip siempre cuenta sobre el total del reporte.

**Permisos**: ver el reporte requiere `participant:read` + acceso al retiro (`requireRetreatAccess`); dar/quitar el chulo requiere `participant:update` + acceso al retiro. El teléfono/país viajan en la respuesta del reporte bajo esos mismos permisos.

**Endpoint**:

```
PATCH /api/history/retreat/:retreatId/participant/:participantId/shirt-order-confirmation
Body: { confirmed: boolean }   → { ok: true }
Permiso: participant:update + requireRetreatAccess('retreatId')
Body validado por setShirtOrderConfirmationSchema (validateRequest): un body
ausente o con confirmed no-booleano recibe 400 antes de llegar al controller.
```

`confirmed: true` estampa `shirtOrderConfirmedAt = new Date()`; `false` lo limpia a `NULL`. Con un par retiro×participante inexistente afecta 0 filas y responde `ok: true` (mismo contrato que `bag-made`).

**Write-protect**: `shirtOrderConfirmedAt` solo lo escribe este PATCH. El CRUD de historial sin scope (`PUT`/`POST /history`) lo excluye por tipo (`Omit<RetreatSnapshotFields, 'shirtOrderConfirmedAt'>`) y en runtime (`stripWriteProtectedFields` al entrar a `createHistoryEntry`/`updateHistoryEntry`) — sin eso, un `PUT` con el campo en el body bypasearía el gate de retiro del PATCH.

Aplica a `server` y `partial_server` (ambos ya salen en el reporte); los walkers no participan de este flujo. Sin evento realtime: el reporte es de un coordinador, no una pantalla compartida (a diferencia de `bag-made` que sí emite para recepción).

---

### 6. Estado vacío

Cuando el retiro no tiene equipo servidor:

> No hay servidores ni angelitos en este retiro.

(Por ejemplo, retiro recién creado. Quien sí existe pero no pidió prendas **sí aparece** — con tallas en `—` y Valor `$0.00`.)

---

### 7. Impresión

Estilos `@media print` ocultan el toolbar, la cabecera del sidebar, los botones, el footer y la **columna Confirmado** (clase `.no-print`). Lo que queda visible al imprimir:

- Header con totales (incluye el badge "Confirmados X/Y").
- Tabla con bordes sólidos en cada celda y la columna `✓` con **estado real**: ✓ verde si ya confirmó en el sistema, cuadrito vacío para los pendientes (útil como lista de seguimiento en la reunión semanal).
- La tarjeta **Resumen de pedido** completa (sin sus botones ni la nota de "ninguna prenda marcada para caminantes").

Tipografía reducida en print (`11px`) para que quepa más por hoja.

---

### 8. Resumen de pedido al proveedor

Tarjeta al final de la vista con las **piezas por talla** que hay que comprar. Nació de un conteo hecho a mano sobre el reporte impreso (2026-10-02) para mandarle el pedido al proveedor.

Secciones (cada una con su subtotal; solo se muestran las que tienen algo):

| Sección | De dónde sale |
|---|---|
| **Equipo servidor** | `participants[].shirts[]` — el **equipo completo**, como los contadores del header: ni la búsqueda ni los chips la mueven, porque es la lista que se compra. Nota: "N de M personas" (quienes pidieron ≥1 prenda) |
| **Caminantes inscritos** | `walkerShirts` + `walkerCount`. Nota: "N inscritos" y, con estimado, "se esperan M" |
| **Estimado de caminantes faltantes** | `estimate.estimatedShirts` (manual, ver abajo). Nota: "faltan ~(esperados − inscritos)" |
| **Total a pedir** | Las anteriores sumadas por prenda × talla. Solo aparece cuando más de una sección tiene piezas (con una sola, repetiría lo mismo) |

Pie: **Total del pedido: N piezas**. Las tallas de cada fila siguen el orden configurado del tipo (`availableSizes`; si no tiene, `S M G X 2`), no el orden de quien pidió primero.

**La prenda del caminante.** Un caminante lleva una sola prenda: el tipo marcado `requiredForWalkers` en `/app/settings/shirt-types`. Si ninguno está marcado, sus piezas van en una fila propia, **"Camiseta de caminante"**, y la tarjeta lo avisa (la nota no se imprime): fundirlas con una prenda del equipo que quizás no es la suya haría que el pedido saliera mal sin que nadie lo notara. Marcar el tipo las suma a esa prenda.

**La talla del caminante.** Una por caminante no cancelado: su fila de `participant_shirt_size` para un tipo de **este** retiro (el marcado para caminantes primero) o, si no tiene, la columna legacy `participants.tshirtSize`. Los caminantes importados de Excel solo traen la columna legacy (es la que lee el [Reporte de Bolsas](./bags-report.md)); sin ese respaldo, en Buen Despacho los 11 caminantes salían con 0 piezas.

**Estimado de caminantes faltantes** — botón **Estimar caminantes** (visible con `retreat:update`), abre un dialog con:

- **Caminantes esperados en total** (ej. 40) → muestra "Faltan ~29 por inscribirse" (esperados − inscritos).
- Una casilla por talla de la prenda del caminante (más cualquier talla ya en uso por inscritos o guardada).
- **Repartir los faltantes como los inscritos**: llena las casillas con los faltantes en la misma proporción de tallas de los inscritos (redondeo de mayor residuo: la suma da exacta). Deshabilitado sin esperados o sin inscritos con talla.
- **Guardar** persiste el estimado del retiro; guardar sin nada escrito lo borra en vez de guardar uno vacío. **Quitar estimado** lo borra. Sin recargar el reporte: el estado local se actualiza con lo que se mandó.

El estimado vive en `retreat.shirtOrderEstimate` (simple-json, `NULL` = sin estimado): `{ expectedWalkers: number | null, estimatedShirts: { [talla]: piezas } }`. Lo escriben **solo** sus endpoints:

```
PUT    /api/retreats/:retreatId/shirt-order-estimate   body: { expectedWalkers?, estimatedShirts? } → { ok: true }
DELETE /api/retreats/:retreatId/shirt-order-estimate   → { ok: true }   (vuelve a NULL)
Permiso: retreat:update + requireRetreatAccess('retreatId'); 404 si el retiro no existe
Body: setShirtOrderEstimateSchema con assignParsedBody — el controller solo ve los dos
campos; enteros ≥ 0, ≤ 30 tallas
```

`PUT /retreats/:id` (edición general del retiro) **ignora** `shirtOrderEstimate`: `retreatService.update` hace `Object.assign` con el body crudo, y el formulario del retiro reenvía el DTO completo — una copia vieja pisaría en silencio un estimado más nuevo guardado desde aquí.

**Copiar resumen** deja el pedido en el portapapeles listo para WhatsApp (negrita con un asterisco, viñetas `-`, una sección por bloque con su emoji, y el bloque "Total a pedir"). **Sin precios**: al proveedor se le piden piezas; los precios son lo que se le cobra a cada servidor. Ejemplo real (Buen Despacho, con estimado de 40):

```
*Pedido de prendas — Buen Despacho* 👕

👥 *Equipo servidor* (13 de 28 personas)
- Blanca Emaus (12): M×5, G×3, X×2, 2×2
- …

🚶 *Caminantes inscritos* (11 inscritos, se esperan 40)
- Camiseta de caminante (11): S×1, M×3, G×4, X×2, 2×1

➕ *Estimado de caminantes faltantes* (faltan ~29)
- Camiseta de caminante (29): S×3, M×8, G×10, X×5, 2×3

📦 *Total a pedir*
- …
- Camiseta de caminante (40): S×4, M×11, G×14, X×7, 2×4

*Total: 75 piezas*
```

La tarjeta no aparece si el retiro no tiene tipos de prenda; con tipos y sin nada pedido dice "Aún no hay prendas pedidas en este retiro" y deja estimar, pero no copiar.

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
     LEFT JOIN (
       SELECT pss2.participantId, pss2.shirtTypeId, pss2.size
         FROM participant_shirt_size pss2
         INNER JOIN retreat_shirt_type rst2
           ON rst2.id = pss2.shirtTypeId
           AND rst2.retreatId = ?
        WHERE pss2.size IS NOT NULL
          AND pss2.size != ''
          AND pss2.size != 'null'
     ) pss ON pss.participantId = p.id
     LEFT JOIN retreat_shirt_type rst
       ON rst.id = pss.shirtTypeId
     ORDER BY p.lastName ASC, p.firstName ASC, rst.sortOrder ASC
   ```

   El lado de prendas es un **LEFT JOIN a una subquery derivada**: el scope por retiro y los placeholders de talla se filtran **dentro** de la subquery, así quien no pidió nada del retiro sigue trayendo una fila (agrega a `shirts: []`) mientras las filas de otro retiro nunca llegan a la query externa. Un LEFT JOIN plano dejaría pasar filas cross-retreat con columnas `rst` NULL (prendas fantasma); mover el scope al `WHERE` eliminaría al sin-prendas otra vez.

   La query es cruda: SQLite devuelve `datetime`/`decimal` como **string** — `shirtOrderConfirmedAt`, `cellPhone` y `country` se tipan `string | null` en todo el pipeline (nunca `z.coerce.date()`).

   Para el [resumen de pedido](#8-resumen-de-pedido-al-proveedor), dos queries más y una lectura: las tallas de los caminantes (`COALESCE` de su fila en `participant_shirt_size` de un tipo de este retiro y la columna legacy `participants.tshirtSize`, agrupado por talla — solo conteos, sin PII), el conteo de caminantes no cancelados, y `retreat.shirtOrderEstimate`.

3. **Agrupar** las filas por `participantId` para producir el array `participants[].shirts[]` (la fila sin prendas crea la entrada y se salta el push — `shirtTypeId` NULL), sumando `shirtCharge` por persona y `totalCharge` global (redondeo a centavos en cada suma; SQLite devuelve `decimal` como string, siempre `Number(...)` antes de sumar).

#### Controller y route

```
apps/api/src/controllers/shirtReportController.ts
apps/api/src/controllers/retreatParticipantController.ts  (updateShirtOrderConfirmationController)
apps/api/src/routes/shirtTypeRoutes.ts:18-22
apps/api/src/routes/retreatParticipant.routes.ts  (PATCH shirt-order-confirmation)
```

```
GET /api/retreats/:retreatId/shirt-report
Permiso: participant:read + requireRetreatAccess('retreatId')

PATCH /api/history/retreat/:retreatId/participant/:participantId/shirt-order-confirmation
Body: { confirmed: boolean }  (validado por setShirtOrderConfirmationSchema)
Permiso: participant:update + requireRetreatAccess('retreatId')
```

El PATCH usa `syncRetreatFields` (mismo camino que `bag-made`) contra la fila de `retreat_participants`: `confirmed: true` → `shirtOrderConfirmedAt = new Date()`, `false` → `NULL`. Responde `{ ok: true }`.

Devuelve `ShirtReportResponse`:

```ts
{
  shirtTypes: Array<{ id, name, color, sortOrder, price: number | null,
                      availableSizes: string[] | null, requiredForWalkers: boolean }>,
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
  walkerCount: number,                              // caminantes no cancelados
  walkerShirts: Array<{ size: string, count: number }>,
  estimate: { expectedWalkers?: number | null, estimatedShirts?: Record<string, number> } | null,
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
- `shirtReportWalkerShirtSchema` (`{ size, count }`), `shirtOrderEstimateSchema` / `ShirtOrderEstimate` y `setShirtOrderEstimateSchema` (`{ body }`, para el PUT del estimado).

### Frontend

```
apps/web/src/views/ShirtsReportView.vue
apps/web/src/components/MessageDialog.vue  (reuso — botón "Enviar mensaje")
apps/web/src/services/api.ts  (getShirtReport + updateShirtOrderConfirmation)
apps/web/src/utils/phone.ts   (buildWhatsAppChatLink)
```

- Vue 3 Composition API con `<script setup>`.
- Estado local: `loading`, `report`, `searchQuery`, `onlyRequiring`, `onlyUnconfirmed`, `savingStates`, `currentRetreatId`; para el botón de envío, `sendingStates`, `messageDialogOpen`, `messageParticipant` y `messageRetreatId`.
- Stores: `useRetreatStore` (para obtener `selectedRetreatId`); `useParticipantStore` (hidrata la ficha del botón de envío); `useToast` para el rollback del toggle.
- Llama `getShirtReport(retreatId)` en `onMounted` (guarda `currentRetreatId` para el toggle) y **recarga al cambiar de retiro** (watcher de `retreatStore.selectedRetreatId`, patrón `AngelitosView`): sin él, el toggle escribiría contra el retiro del montaje.
- Computed: `filteredParticipants` (búsqueda AND requieren-camiseta AND solo-sin-confirmar), `totals` (incluye `confirmed` y `requiring`), `sortedShirtTypes`.
- Resumen de pedido: `serverCounts` / `walkerCounts` / `estimateCounts` (prenda → talla → piezas, objetos planos), `summarize()` (filas por prenda en orden de columnas, tallas por `availableSizes`), `orderSections`, `orderTotalRows`; `walkerGarment` resuelve la prenda del caminante (tipo marcado o la fila propia `__walker__`). Dialog del estimado montado desde el arranque, `can.update('retreat')` de `useAuthPermissions` para el botón.
- `toggleConfirmation`: patrón `CommunityAttendanceView.toggleAttendance` — guard por `savingStates[participantId]`, flip optimista del objeto local, await PATCH, catch → rollback + toast, finally limpia el guard. Sin refetch.
- `openMessageDialog`: guard por `sendingStates[participantId]`, hidrata la ficha vía `participantStore.fetchParticipants()` (ver decisión de diseño abajo) y abre el `MessageDialog` montado desde el arranque (sin `v-if`, para que el watcher de `forceTemplateType` dispare al abrir). Resetea `participantStore.filters` antes del fetch (claves heredadas de otras vistas viajan en la misma query y excluyen al participante), captura el `retreatId` al click (`messageRetreatId` alimenta el dialog, no el valor vivo) y aborta si el retiro cambió durante la carga; el `catch` evita que la rejection del fetch escape al errorHandler global.
- Sin Pinia store dedicado — el reporte se recarga cada vez que entras a la vista.

### Base de datos

Reusa las tablas existentes (no agrega ninguna):

- `participants` — datos personales (`cellPhone`, `country` alimentan el botón de WhatsApp).
- `retreat_participants` — overlay por retiro (`type`, `isCancelled`, `idOnRetreat`). Columna `shirtOrderConfirmedAt` (datetime nullable) agregada por la migración `20260921220000_AddShirtOrderConfirmedAtToRetreatParticipants` — el estado de confirmación es **por retiro**.
- `participant_shirt_size` — relación M:N persona ↔ tipo de playera + talla.
- `retreat_shirt_type` — catálogo de tipos por retiro; columna `price` (nullable, `NULL`/`0` = sin cargo) agregada por la migración `ServerShirtPricingAndConfirmation`.
- `retreat.shirtOrderEstimate` (text/simple-json, nullable) — el estimado de caminantes faltantes; migración `20261005120000_AddShirtOrderEstimateToRetreat` (`ADD COLUMN` idempotente, `down()` con `DROP COLUMN`).
- `participants.tshirtSize` (legacy) — talla del caminante cuando no tiene fila en `participant_shirt_size` (importados).

---

## Tests

### Backend (Jest)

```
apps/api/src/tests/services/shirtReportService.test.ts
apps/api/src/tests/routes/shirtOrderConfirmation.routes.simple.test.ts
apps/api/src/tests/routes/shirtReport.routes.simple.test.ts
```

35 casos en el spec del service (universo del equipo, filtrado de prendas, precios, totales, orden, desde la feature de confirmación, y desde el resumen de pedido: conteo de caminantes por talla fuera de `participants`, respaldo en `tshirtSize` legacy, una talla por caminante sin doble conteo, cancelados/placeholders/otro retiro fuera, `availableSizes` en los tipos, estimado null por defecto → ida y vuelta → null, retiro inexistente, estimado por retiro):

- El universo es el equipo completo: quien no pidió prendas aparece con `shirts: []`, `shirtCharge: 0` y sus campos de confirmación/contacto (también un servidor cuyas únicas filas son de otro retiro).
- `shirtOrderConfirmedAt` llega `null` por defecto, junto con `cellPhone`/`country`.
- Tras confirmar por `syncRetreatFields`, el reporte devuelve el timestamp como string no-null.
- Al limpiar (`false`) vuelve a `NULL`.
- El estado es por retiro: confirmado en retiro A no aparece en el reporte del retiro B.

12 casos en el spec de rutas del PATCH (supertest contra el router real con middlewares stubbeados — el 403 vive en el middleware, invisible al controller directo):

- Wiring: 200 registra `requirePermission('participant:update')` + `requireRetreatAccess('retreatId')`; 401 sin sesión; 403 sin permiso; 403 sin acceso al retiro (flag intacto en cada caso).
- Semántica: 400 si `confirmed` no es booleano, falta, o no hay body JSON (validateRequest); `true` estampa timestamp (verificado por query directa); `false` → `NULL`; par inexistente responde `ok: true` **y no toca al participante real del retiro** (prueba las 0 filas — un WHERE sin `participantId` estamparía al retiro entero).
- Write-protect: 2 unit tests de `stripWriteProtectedFields` (suelta el campo y conserva el resto; no-op sin el campo). El camino HTTP del PUT/POST de historial no es ejercible bajo jest — hidratar entities por el grafo del router lanza el error preexistente "Class constructor … cannot be invoked without 'new'" (documentado en `palancasCountWritePath.test.ts`).

4 casos en el spec de rutas del GET (mismo molde, mockeando `isAuthenticated` — `shirtTypeRoutes` importa otro archivo de auth):

- Wiring: 200 registra `requirePermission('participant:read')` + `requireRetreatAccess('retreatId')`; 401 sin sesión; 403 sin permiso; 403 sin acceso al retiro.

17 casos en el spec de rutas del estimado (`shirtOrderEstimate.routes.simple.test.ts`, mismo molde):

- Wiring: PUT y DELETE registran `requirePermission('retreat:update')` + `requireRetreatAccess('retreatId')`; 401/403/403 sin escribir nada.
- Validación: 400 con esperados negativo o fraccionario, piezas no numéricas o negativas, la forma anidada por tipo, o más de 30 tallas.
- Persistencia (query directa): el PUT guarda; solo los campos del schema llegan al JSON (`assignParsedBody`); body vacío guarda un estimado vacío; DELETE vuelve a NULL; 404 con retiro inexistente.
- Write-protect: `retreatService.update` ignora `shirtOrderEstimate` en su payload y sí aplica el resto.

```bash
pnpm --filter api test src/tests/services/shirtReportService.test.ts
pnpm --filter api test src/tests/routes/shirtOrderConfirmation.routes.simple.test.ts src/tests/routes/shirtReport.routes.simple.test.ts
pnpm --filter api test src/tests/routes/shirtOrderEstimate.routes.simple.test.ts
```

### Frontend (Vitest)

```
apps/web/src/views/__tests__/ShirtsReportView.test.ts
```

62 casos: carga inicial, header con totales (incluye "Confirmados X/Y"), columnas dinámicas, render de tallas y `—`, búsqueda por nombre/número/talla, estado vacío, footer con conteos, impresión, el bloque de confirmación (badges por estado y leyenda responsive del badge, toggle optimista con args correctos y sin refetch, rollback con toast, doble-tap con un solo PATCH, **recarga + toggle contra el retiro nuevo al cambiar de retiro en el sidebar**, filtro "Solo sin confirmar" + composición AND con búsqueda, link wa.me con la lada resuelta por país y ausente sin teléfono, columna ✓ print con estado real), el bloque del universo (todo el equipo listado con X/Y sobre el total, chip "Requieren camiseta" que estrecha, compone AND con el otro chip y con la búsqueda, badge con conteo, mensaje "Nadie coincide con los filtros activos" con Quitar filtros, y el chulo sobre una fila sin prendas), y el bloque de envío (botón por fila incluso sin teléfono, click que hidrata la ficha desde el listado del retiro y abre el dialog con `SERVER_SHIRT_CONFIRMATION`, participante no encontrado → toast destructive + dialog cerrado, disabled mientras carga, filtros heredados del store limpiados en el request, retiro cambiado durante la carga → dialog no abre ni toast, fetch rechazado → guard liberado y dialog cerrado), y el bloque del resumen de pedido (desglose del equipo con tallas en orden canónico, caminantes, fila propia "Camiseta de caminante" sin prenda marcada, "Total a pedir" sumado, estimado y su total, inmune a búsqueda y chips, tarjeta ausente sin tipos y "Aún no hay prendas" sin pedidos, texto copiado para WhatsApp sin precios, fallo del portapapeles, botón de estimar oculto sin `retreat:update`, y el dialog: casillas por talla, guardar sin recargar, repartir con mayor residuo, repartir deshabilitado, precarga + quitar, guardar vacío borra, fallo deja el dialog abierto).

El dialog se mockea entero (patrón `FollowUpView.test`): el real arrastra stores e íconos fuera de la allowlist del archivo, y al stub le basta exponer las props como `data-*` para assertar sobre ellas. El toggle de confirmación se selecciona por su `title` (helper `toggleButtons`), no por índice en `findAll('tbody button')` — la celda ahora también contiene el botón de envío.

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
- Define el universo y el scope de prendas a nivel SQL (equipo completo por INNER JOIN; prendas válidas del retiro por LEFT JOIN a subquery derivada).
- Devuelve un payload pequeño y específico para esta vista.

### ¿Por qué el universo es todo el equipo y no solo quien pidió prendas?

La secuencia `SERVER_SHIRT_CONFIRMATION` enrola a **todos** los servidores y angelitos no cancelados (`messageSequenceService` resuelve `audience = 'server'` sin mirar `participant_shirt_size`). Parte del equipo responde "no necesito camisetas" — y esa respuesta **también** es una confirmación que el coordinador quiere registrar y cuadrar. Con el INNER JOIN original esa gente quedaba fuera del reporte y la cuenta "Confirmados X/Y" nunca cerraba contra los mensajes enviados. La lista de compra se recupera con el chip "Requieren camiseta".

### ¿Por qué el chulo es manual y no se parsea la respuesta de WhatsApp?

El mensaje de la secuencia pide al servidor confirmar tallas y cargo; la respuesta llega al WhatsApp **del coordinador** (número personal, no uno conectado a la app). La app no puede leerla — el chulo lo estampa la persona que leyó la respuesta. El botón de WhatsApp por fila existe justo para acortar ese paso: abrir la conversación, leer, dar el chulo.

### ¿Por qué el botón de envío reusa MessageDialog y no envía directo?

En esta app WhatsApp **nunca lo envía el backend**: es deep-link asistido (abre el WhatsApp del coordinador con el texto listo + clipboard) seguido del registro en `participant_communications`. `MessageDialog.vue` ya implementa todo ese flujo (plantillas, selector de contacto, texto editable, variables resueltas, historial) — un envío "directo" desde el reporte duplicaría ese código. Con `forceTemplateType="SERVER_SHIRT_CONFIRMATION"` la plantilla llega preseleccionada y el coordinador puede editar o cambiarla antes de enviar.

**Y la ficha se hidrata desde el listado del retiro** (`participantStore.fetchParticipants()`), no de `GET /participants/:id`: la plantilla usa `{participant.paymentRemaining}`, y ese getter solo es correcto con `payments`, `debts` y `shirtSizes` cargados — `findParticipantById` no carga `shirtSizes` y el saldo saldría sin el cargo de prendas. Es la misma razón por la que el motor de secuencias tiene `hydrateParticipantForTemplateVariables`: el mismo objeto con el que ParticipantList abre este dialog.

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
