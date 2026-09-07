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
| Badges de tallas | Resumen por talla, con los códigos tal como se configuraron en el retiro (`M`, `G`, `X`, `2`…) y un badge "Sin talla" si falta alguno. Visible en pantallas grandes |

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

Muestra todos los caminantes del retiro seleccionado. El orden inicial es por `id_on_retreat`
y se puede cambiar desde los encabezados (ver *Ordenamiento*).

**Columnas:**

| Columna | Descripción | Ordenable |
|---|---|---|
| `#` | Número de caminante en el retiro (`id_on_retreat`) | Sí |
| Nombre | Avatar con iniciales + nombre completo. Verde si la bolsa está realizada | Sí, por nombre **y** por apellido (dos controles) |
| Mesa | Mesa asignada al caminante | Sí |
| Talla | Talla de playera, con el código tal como se configuró en el retiro (p. ej. `M`, `G`, `X`, `2`) | Sí |
| Bolsa | Botón-checkbox para marcar la bolsa como realizada | No |

#### Checkbox de bolsa realizada

- **Optimista**: el cambio visual es inmediato; si la API falla, se revierte.
- **Spinner**: mientras la petición está en vuelo, el botón muestra un spinner y se deshabilita para evitar dobles clicks.
- **Persistencia**: se guarda en la columna `bagMade` de la tabla `retreat_participants` en la base de datos.
- **Scope**: el estado es por participante **por retiro** (el mismo participante puede tener bolsa marcada en un retiro y no en otro).

---

### 4. Ordenamiento

Los encabezados de la tabla son botones: el primer click ordena ascendente, el segundo invierte
la dirección, y pasar a otra columna vuelve a empezar en ascendente. La columna activa se pinta
en índigo con una flecha ↑/↓; las demás muestran la flecha doble en gris.

Como la celda de nombre trae el nombre completo, ese encabezado lleva **dos** controles
independientes: `Nombre / Apellido`.

**Criterios de comparación** (`sortedWalkers` en la vista):

| Orden | Cómo compara |
|---|---|
| `#` | Numérico por `id_on_retreat` |
| Nombre / Apellido | `createLocaleComparator('es', …)` — insensible a mayúsculas y acentos, así que "Álvarez" cae entre "Adame" y "Avendaño", y "CARLOS" no se va al principio |
| Mesa | Mismo comparador, con collator numérico: `Mesa 2` va antes de `Mesa 10` |
| Talla | **Orden lógico**, no alfabético: `XS → S → M → G → L → X → XL → 2 → XXL` (constante `FALLBACK_ORDER`, la misma que ordena los badges del encabezado) |

Tres reglas que aplican a todos los órdenes:

- **Los vacíos van siempre al final**, en ambas direcciones: quien no tiene mesa asignada o no
  tiene talla no se mezcla con el resto al invertir el orden. Lo trae `createLocaleComparator`
  para nombre/mesa y `compareBySize` para la talla.
- **El desempate es el número de participante ascendente.** Por eso al ordenar por mesa cada
  mesa queda numerada de menor a mayor, que es como se arman las bolsas, y el orden es estable
  (dos renders con los mismos datos dan la misma lista).
- **Una talla que no esté en `FALLBACK_ORDER`** se coloca después de las conocidas y se compara
  alfabéticamente entre iguales, en lugar de romper el orden.

El orden se aplica **sobre el resultado de la búsqueda y del tab activo**, no sobre la lista
completa; y **no se persiste**: al recargar la vista vuelve a `#` ascendente.

Accesibilidad: el `<th>` activo lleva `aria-sort="ascending" | "descending"`, el resto `"none"`.

---

### 5. Búsqueda

Campo de texto en el toolbar de la tabla. Filtra en tiempo real por:

- Nombre completo (firstName + lastName)
- Nombre de mesa
- Número de caminante (`id_on_retreat`)

La búsqueda es **insensible a mayúsculas**. Al limpiar el campo con el botón `X` se restauran todos los resultados.

---

### 6. Tabs de filtro

| Tab | Muestra |
|---|---|
| Todos | Todos los caminantes |
| Pendientes | Solo caminantes con `bagMade = false` |
| Realizadas | Solo caminantes con `bagMade = true` |

Cada tab incluye su conteo actual entre paréntesis. Los filtros de búsqueda y de tab se aplican juntos.

---

### 7. Estado vacío

Cuando la combinación de búsqueda + tab no devuelve resultados, se muestra:

- **"Sin resultados para tu búsqueda"** si hay texto en el buscador.
- **"No hay caminantes en este filtro"** si es solo por tab (p.ej., "Realizadas" cuando ninguna bolsa está hecha).
- Enlace **"Limpiar filtros"** que resetea búsqueda y tab a sus valores por defecto.

---

### 8. Footer de la tabla

Muestra el conteo de filas visibles vs. total, y el porcentaje de bolsas completadas.

---

### 9. Impresión

El botón de la impresora en el encabezado ejecuta `window.print()`.

La vista **no tenía bloque `<style>`** hasta 2026-09-06, así que su clase `no-print` no ocultaba
nada: era una clase sin regla. Hoy el bloque scoped define la media query, y en papel se omiten
el botón de imprimir, las flechas de orden, el separador `/` y el control "Apellido" del
encabezado (el texto "Nombre" y el resto de los encabezados sí se imprimen).

```css
@media print {
  .no-print { display: none !important; }
}
```

Al imprimir se respeta el orden que esté activo en pantalla — ordenar por mesa y luego imprimir
es la forma de sacar la lista agrupada por mesa.

---

## Arquitectura técnica

### Frontend (`BagsReportView.vue`)

```
apps/web/src/views/BagsReportView.vue
```

- Vue 3 Composition API con `<script setup>`
- Estado local: `checkedItems` (checklist), `searchQuery`, `activeFilter`, `sortKey`, `sortOrder`, `updatingBag`
- Cadena de computeds: `walkers` → `filteredWalkers` (tab + búsqueda) → `sortedWalkers` (lo que
  renderiza la tabla, el footer y el estado vacío)
- `createLocaleComparator` viene de `apps/web/src/utils/sort.ts`, el mismo comparador que usa
  la lista de participantes
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

Cubre: checklist (render, interacción, colapso, localStorage, persistencia por retiro), progreso, resumen de tallas, búsqueda, tabs de filtro, **ordenamiento**, toggle de bolsa (optimista + revert en error + prevención de doble clic), estado vacío, footer, impresión y carga de datos.

```bash
pnpm --filter web test BagsReportView
```

Del ordenamiento se fijan: el orden por defecto, la inversión al segundo click, el reset a
ascendente al cambiar de columna, mesa (incluido `Mesa 2` antes de `Mesa 10`), nombre, apellido,
acentos y mayúsculas, talla por orden lógico, los vacíos al final en ambas direcciones, el
desempate por número dentro de una misma mesa, la composición con la búsqueda activa y el
`aria-sort` de la columna activa.

**Dos trampas al escribir tests de esta vista:**

1. Después de `mount()` hay que esperar con `flushPromises()`, no con `nextTick()`. El
   `onMounted` pone `loading = true` y lo baja en el `finally`; con un solo tick la tabla
   todavía es el skeleton y `thead`/`tbody` no existen — los selectores fallan con
   *"Cannot call trigger on an empty DOMWrapper"* sin decir por qué.
2. La celda de nombre incluye el avatar de iniciales, así que `td:nth-child(2)` devuelve
   `"AGAna García"`. Para leer el nombre hay que bajar al `span`: `td:nth-child(2) span`.

El archivo mockea `lucide-vue-next` **localmente** (no usa el mock global de
`src/test/setup.ts`), así que un ícono nuevo en la vista hay que agregarlo a ese mock del test
o el `mount()` falla. Los íconos de orden (`ArrowUp`, `ArrowDown`, `ArrowUpDown`) también se
agregaron al mock global, para las suites que monten la vista en el futuro.

### Verificado en la app real

El 2026-09-07, contra el retiro San Miguel Arcángel en local (93 caminantes, mesas `01`–`17`,
tallas `M`/`G`/`X`/`2`): mesa ascendente da `01…17` con cada mesa numerada de menor a mayor,
descendente da `17…01`, talla da `M(27) → G(40) → X(21) → 2(5)` — que alfabéticamente sería
`2, G, M, X`, o sea confirma el orden lógico —, apellido coloca `Adame → Álvarez → Avendaño` y
el orden sobrevive a filtrar por tab y buscar.
