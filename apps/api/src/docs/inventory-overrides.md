# Overrides de Inventario por Retiro

## Contexto

El catálogo global de inventario (`inventory_item`) define valores que aplican a todos los retiros:
- `ratio` — cantidad por caminante (ej. 3.0 = 3 litros de agua por persona)
- `requiredQuantity` — cantidad fija independiente del número de caminantes

Los **overrides por retiro** permiten ajustar estos valores para un retiro específico sin modificar el catálogo global.

---

## Campos en `retreat_inventory`

| Campo | Tipo | Descripción |
|-------|------|-------------|
| `ratioOverride` | `decimal(10,2) NULL` | Ratio alternativo para este retiro. Sobreescribe `inventory_item.ratio`. |
| `requiredQtyOverride` | `decimal(10,2) NULL` | Cantidad fija para este retiro. Sobreescribe el cálculo por ratio y **no se borra al recalcular**. |
| `isExcluded` | `boolean DEFAULT 0` | Si `true`, el ítem se omite en alertas y cálculos. El frontend lo filtra de la tabla por defecto. |

---

## Lógica de cálculo (`calculateRequiredQuantities`)

El orden de prioridad al calcular `requiredQuantity` es:

```
1. isExcluded = true           → omitir (no modificar requiredQuantity)
2. requiredQtyOverride ≠ null  → usar ceil(requiredQtyOverride)
3. retreatShirtTypeId          → contar ParticipantShirtSize
4. inventoryItem.isCalculated  → calcular por talla (tshirt/jacket)
5. inventoryItem.requiredQuantity ≠ null → usar valor fijo del catálogo
6. default                     → ceil(effectiveRatio × walkerBase)
   donde effectiveRatio = ratioOverride ?? inventoryItem.ratio
```

---

## API

### Actualizar overrides de un ítem

```
PUT /api/inventory/retreat/:retreatId/:itemId
```

Body (todos opcionales):
```json
{
  "ratioOverride": 5.0,
  "requiredQtyOverride": 42,
  "isExcluded": true
}
```

- Para limpiar `ratioOverride` o `requiredQtyOverride`, enviar `null`.
- `isExcluded: true` oculta el ítem de alertas y lo filtra del frontend.

### Agregar ítem del catálogo con overrides desde creación

```
POST /api/inventory/retreat/:retreatId/items/:itemId
```

Body (opcional):
```json
{
  "ratioOverride": 3.0,
  "requiredQtyOverride": 25
}
```

---

## Comportamiento de los endpoints

### `GET /retreat/:retreatId` y `getRetreatInventory`

Por defecto **filtra** los ítems excluidos (`includeExcluded = false`).
Para incluirlos (administración interna):
```typescript
getRetreatInventory(retreatId, dataSource, includeExcluded = true)
```

### `GET /retreat/:retreatId/by-category` y `getRetreatInventoryByCategory`

**Siempre devuelve todos los ítems, incluidos los excluidos.**
El filtrado lo hace el frontend en el computed `allItems` basándose en el estado del pill "Ver excluidos". Esto evita una segunda llamada a la API cuando el usuario activa el pill.

### `GET /retreat/:retreatId/alerts` y `getInventoryAlerts`

**Siempre filtra** ítems excluidos — no generan alertas aunque tengan déficit.

---

## Propagación al crear inventario de retiro

Cuando se crea el inventario por defecto de un retiro (`createDefaultInventoryForRetreat`), los ítems que tienen `requiredQuantity` fija en el catálogo global propagan ese valor a `requiredQtyOverride`. Esto permite que el coordinador modifique la cantidad del retiro sin afectar el catálogo global.

---

## UI — Frontend

### Menú ⋯ → "Config. para este retiro"

Abre un dialog con tres campos editables:

| Campo | Descripción |
|-------|-------------|
| **Ratio para este retiro** | Input numérico. Vacío = usar ratio global del catálogo. |
| **Cantidad fija para este retiro** | Input numérico. Vacío = calcular por ratio. No se borra al "Recalcular". |
| **Excluir del inventario** | Checkbox. Oculta el ítem de la tabla y alertas de este retiro. |

El dialog muestra el ratio global actual como referencia (`Ratio global: X`).

### Badges visuales (en la columna "Artículo")

Los badges aparecen **inline junto al nombre** del ítem:

| Badge | Color | Condición | Descripción |
|-------|-------|-----------|-------------|
| `r=X` | Morado | `ratioOverride != null` | Ratio override activo |
| `🔒N` | Ámbar | `requiredQtyOverride != null` | Cantidad fija, no se sobreescribirá |
| `Excluido` | Naranja | `isExcluded = true` | Ítem excluido de este retiro |

### Pill "Ver excluidos" / "Ocultar excluidos"

Toggle en la barra de filtros. El backend **siempre devuelve** los ítems excluidos en `by-category`; el frontend los filtra en el computed `allItems`.

- **OFF (defecto)**: ítems excluidos ocultos de la tabla
- **ON**: ítems excluidos visibles con badge naranja `Excluido`

El pill cambia su etiqueta según el estado:
- "Ver excluidos" → al hacer clic activa la visibilidad
- "Ocultar excluidos" → al hacer clic la desactiva

---

## Decisión de diseño: filtrado en frontend vs backend

El endpoint `by-category` retorna **todos** los ítems (incluyendo excluidos) deliberadamente. Esto permite que el pill "Ver excluidos" sea instantáneo sin necesidad de una segunda llamada al servidor. El tradeoff es que el payload incluye ítems extras, pero son pocos y el beneficio de UX es claro.

El endpoint de alertas sí filtra en servidor porque las alertas nunca deben mostrar ítems excluidos.

---

## Tests

### Backend (`apps/api/src/tests/services/inventoryService.test.ts`) — 67 tests de inventario

Sección `overrides por retiro` — **13 casos**:
- `ratioOverride` en `calculateRequiredQuantities`
- `requiredQtyOverride` en `calculateRequiredQuantities` y `updateRetreatInventory`
- `isExcluded` en `getRetreatInventory`, `calculateRequiredQuantities`, `getInventoryAlerts`, `updateRetreatInventory`
- `addItemToRetreat` con overrides desde creación

Sección `copyInventoryFromRetreat` — **2 casos adicionales**:
- Copia ítems que solo tienen overrides (sin cantidad/caja/notas)
- Copia `isExcluded=true` al retiro destino

Sección `getRetreatInventoryByCategory` — **2 casos adicionales**:
- Incluye ítems excluidos (para que el frontend pueda filtrarlos)
- Contraste con `getRetreatInventory` que sí los filtra

### Frontend (`apps/web/src/views/__tests__/InventoryView.test.ts`) — 30 tests

Sección `Agregar item con overrides del catálogo` — **2 casos**:
- `confirmAddItems` pasa `ratioOverride` y `requiredQtyOverride` al store
- Sin overrides pasa `null` en ambos campos

Sección `Recalcular — aviso de overrides` — **2 casos**:
- Aviso `🔒 N items...no cambiarán` visible cuando hay `requiredQtyOverride`
- Aviso ausente cuando no hay overrides

Sección `Overrides por retiro` — **7 casos**:
- Badge `r=X` cuando `ratioOverride` definido
- Badge `🔒N` cuando `requiredQtyOverride` definido
- Ítem excluido oculto por defecto (store devuelve todos, frontend filtra)
- Ítem excluido visible con badge al activar pill
- Pill cambia texto entre "Ver excluidos" / "Ocultar excluidos"
- Dialog de config abre desde menú ⋯
- `confirmOverride` llama a `updateRetreatInventory` con los 3 campos
