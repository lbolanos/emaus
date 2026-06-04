# Búsqueda de participante al registrar un pago

Cómo funciona el buscador (autocomplete) del campo **Participante** en el modal
Agregar/Editar Pago de `/app/payments`, y por qué está implementado como un
dropdown inline en lugar del patrón `Popover` + `Command`.

## Problema

Antes, el campo "Participante" del modal de pago era un `<Select>` simple que
listaba a **todos** los participantes del retiro sin posibilidad de búsqueda.
En retiros con muchos participantes había que desplazar una lista larga para
encontrar a la persona.

## Comportamiento actual

El campo es un **buscador con filtrado en tiempo real**:

- Un botón _trigger_ muestra el participante seleccionado (`Nombre Apellido
  (apodo)`) o el placeholder `Buscar participante...`.
- Al hacer clic se reemplaza por un input de búsqueda y un dropdown con la lista.
- Escribir filtra por **nombre, apellido o apodo** (case-insensitive,
  substring). También coincide con el nombre completo `"nombre apellido"`.
- Al seleccionar un participante se asigna a `paymentForm.participantId`, se
  cierra el dropdown y el trigger muestra su etiqueta. Un check ✓ marca al
  seleccionado dentro de la lista.
- Si nada coincide se muestra "No se encontraron participantes".

El resto del flujo de guardado no cambió: el pago se liga al retiro activo de la
barra lateral (`retreatStore.selectedRetreatId`), no al retiro primario del
participante.

## Implementación

Archivo: `apps/web/src/components/PaymentManagement.vue` (campo "Participante"
del modal Agregar/Editar Pago).

Estado relevante:

- `participantDropdownOpen` — controla la visibilidad del dropdown.
- `participantSearch` — texto del input de búsqueda.
- `participantSearchInput` — `ref` al `<input>` para enfocarlo al abrir.
- `filteredParticipants` — `computed` que filtra `participantStore.participants`
  por nombre/apellido/apodo según `participantSearch`.
- `selectedParticipantLabel` — `computed` con la etiqueta del seleccionado.
- `openParticipantDropdown()` / `selectParticipant(id)` — abrir y seleccionar.

El markup usa **elementos HTML nativos** (`<button>` trigger, `<input>` de
búsqueda, `<div>` con la lista posicionado en absoluto), no componentes de
overlay.

## Por qué NO se usa `Popover` + `Command`

El primer intento usó el patrón shadcn `Popover` + `Command` de `@repo/ui`.
**No funciona dentro de un Dialog de reka-ui** por tres razones encadenadas
(todas verificadas en vivo):

1. **`Command` de `@repo/ui` usa radix-vue 1.x antiguo** (no reka-ui). Su lista
   (`ComboboxContent`) solo se monta cuando el combobox interno está `open`
   (`present: forceMount || open.value`); dentro de un Popover nunca abre, así
   que la lista no aparece.
2. **`pointer-events: none` heredado.** Un Dialog abierto pone
   `pointer-events: none` en el `<body>`; el `PopoverContent` se monta en un
   _portal_ bajo `body` y hereda ese estilo → todo el popover queda
   no-clickeable.
3. **Conflicto de focus-trap.** El portal del Popover queda fuera del DOM del
   Dialog; el focus-trap del Dialog detecta el input de búsqueda como "fuera de
   su scope" y le devuelve el foco al trigger → el input nunca se puede escribir
   (ni siquiera `input.focus()` programático tiene efecto).

La solución (dropdown inline, sin portal) vive en el mismo focus-scope del
Dialog y evita las tres librerías de overlay. Regla general: **para un buscador
dentro de un Dialog de reka-ui, usar un dropdown inline, no `Popover` +
`Command`.**

## Tests

`apps/web/src/components/__tests__/PaymentManagement.search.test.ts` cubre:

- El trigger muestra el placeholder sin selección.
- Al abrir se listan todos los participantes.
- Filtrado por nombre, apellido y apodo.
- Estado vacío ("No se encontraron participantes").
- La selección asigna el participante, cierra el dropdown y muestra su label.
