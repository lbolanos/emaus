# Reporte de Bolsas

Vista que permite gestionar la preparación de bolsas para cada caminante de un retiro.

---

## Acceso

`/app/bags-report` — disponible en el menú lateral bajo "Reportes".

---

## Funcionalidades

### 1. Progreso general

El encabezado de la vista muestra en tiempo real:

| Elemento | Descripción |
|---|---|
| Contador "listas" | Bolsas marcadas como realizadas |
| Contador "faltan" | Bolsas aún pendientes |
| Barra de progreso | Porcentaje de bolsas completadas |
| Badges de tallas | Resumen de tallas (S/M/L/XL/XXL) visible en pantallas grandes |

Cuando todas las bolsas están realizadas, la barra y el contador cambian a verde.

---

### 2. Checklist de contenido

Lista de 5 ítems que representa el contenido estándar de cada bolsa:

- Agua bendita
- Playera
- Celulares
- Palancas
- Invitación para otro retiro

**Comportamiento:**

- **Persistencia**: el estado se guarda en `localStorage` con la clave `bags-checklist-v1:<retreatId>`, por lo que es independiente por retiro y sobrevive recargas de página.
- **Auto-colapso**: al marcar todos los ítems, el checklist se colapsa automáticamente y se reemplaza por un pequeño chip verde "Contenido listo ✓".
- **Re-expandir**: hacer clic en el chip vuelve a mostrar el checklist completo para editar.
- **Alcance**: este checklist es de sesión local (un solo equipo). No se sincroniza entre usuarios.

---

### 3. Tabla de caminantes

Muestra todos los caminantes del retiro seleccionado ordenados por `id_on_retreat`.

**Columnas:**

| Columna | Descripción |
|---|---|
| `#` | Número de caminante en el retiro (`id_on_retreat`) |
| Nombre | Avatar con iniciales + nombre completo. Verde si la bolsa está realizada |
| Mesa | Mesa asignada al caminante |
| Talla | Talla de playera (S/M/L/XL/XXL) |
| Bolsa | Botón-checkbox para marcar la bolsa como realizada |

#### Checkbox de bolsa realizada

- **Optimista**: el cambio visual es inmediato; si la API falla, se revierte.
- **Spinner**: mientras la petición está en vuelo, el botón muestra un spinner y se deshabilita para evitar dobles clicks.
- **Persistencia**: se guarda en la columna `bagMade` de la tabla `retreat_participants` en la base de datos.
- **Scope**: el estado es por participante **por retiro** (el mismo participante puede tener bolsa marcada en un retiro y no en otro).

---

### 4. Búsqueda

Campo de texto en el toolbar de la tabla. Filtra en tiempo real por:

- Nombre completo (firstName + lastName)
- Nombre de mesa
- Número de caminante (`id_on_retreat`)

La búsqueda es **insensible a mayúsculas**. Al limpiar el campo con el botón `X` se restauran todos los resultados.

---

### 5. Tabs de filtro

| Tab | Muestra |
|---|---|
| Todos | Todos los caminantes |
| Pendientes | Solo caminantes con `bagMade = false` |
| Realizadas | Solo caminantes con `bagMade = true` |

Cada tab incluye su conteo actual entre paréntesis. Los filtros de búsqueda y de tab se aplican juntos.

---

### 6. Estado vacío

Cuando la combinación de búsqueda + tab no devuelve resultados, se muestra:

- **"Sin resultados para tu búsqueda"** si hay texto en el buscador.
- **"No hay caminantes en este filtro"** si es solo por tab (p.ej., "Realizadas" cuando ninguna bolsa está hecha).
- Enlace **"Limpiar filtros"** que resetea búsqueda y tab a sus valores por defecto.

---

### 7. Footer de la tabla

Muestra el conteo de filas visibles vs. total, y el porcentaje de bolsas completadas.

---

### 8. Impresión

El botón del impresora en el encabezado ejecuta `window.print()`. Los elementos marcados con `no-print` (botón de imprimir, toolbar, etc.) quedan ocultos en la vista de impresión gracias a CSS.

---

## Arquitectura técnica

### Frontend (`BagsReportView.vue`)

```
apps/web/src/views/BagsReportView.vue
```

- Vue 3 Composition API con `<script setup>`
- Estado local: `checkedItems` (checklist), `searchQuery`, `activeFilter`, `updatingBag`
- Stores: `useRetreatStore`, `useParticipantStore`

### API

```
PATCH /history/retreat/:retreatId/participant/:participantId/bag-made
Body: { bagMade: boolean }
Permiso requerido: participant:update
```

Llama a `syncRetreatFields(participantId, retreatId, { bagMade })` — actualiza la fila existente en `retreat_participants` sin crear una nueva.

### Base de datos

```sql
-- Columna en retreat_participants
bagMade  BOOLEAN  NOT NULL  DEFAULT 0
```

Migración: `20260422130000_AddBagMadeToRetreatParticipants.ts`

### Overlay en participantService

`findAllParticipants` incluye `bagMade` en el SELECT de `retreat_participants` y lo superpone sobre el objeto `Participant` como campo virtual antes de devolver la respuesta.

---

## Tests

```
apps/web/src/views/__tests__/BagsReportView.test.ts
```

Cubre: checklist (render, interacción, colapso, localStorage, persistencia por retiro), progreso, resumen de tallas, búsqueda, tabs de filtro, toggle de bolsa (optimista + revert en error + prevención de doble clic), estado vacío, footer, impresión y carga de datos.

```bash
pnpm --filter web test BagsReportView
```
