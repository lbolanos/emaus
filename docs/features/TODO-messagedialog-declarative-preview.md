# TODO (deuda técnica): preview declarativo en MessageDialog

**Estado:** pendiente · **Prioridad:** media · **Tipo:** refactor / robustez (no agrega feature de usuario)

## Problema

El texto del mensaje en `apps/web/src/components/MessageDialog.vue` se calcula con la función
**imperativa** `updateMessagePreview()` (≈ línea 732), que hay que **llamar a mano** desde ~6
watchers distintos:

- `watch(selectedTemplate)`
- `watch(selectedContact)`
- `watch(() => props.tableData)` (con `flush: 'post'`)
- `watch(props.open)`
- `watch(sendMethod)`
- `watch(responsabilityStore.responsibilities)`
- la rama de `forceTemplateType` al seleccionar la plantilla forzada

El mensaje depende de muchas entradas reactivas (plantilla, contacto, `tableData`, retiro,
comunidad, palanquero, método de envío). Al ser actualización manual:

1. **Familia de bugs "stale":** si una entrada cambia y no se llama `updateMessagePreview()` —o se
   llama en el tick equivocado— el preview queda desactualizado. Ej. real: `{table.name}` salía
   literal porque `updateMessagePreview` corría antes de que `props.tableData` estuviera
   commiteado (se parchó con `flush: 'post'`, pero la clase de bug sigue latente).
2. **Mantenimiento frágil:** cada entrada/variable nueva exige acordarse de cablear otro watcher.

## Qué hacer

Migrar el preview a un modelo **declarativo**:

- `generatedMessage = computed(() => replaceAllVariables(...))` — Vue rastrea automáticamente
  TODAS las dependencias (plantilla, `props.tableData`, `selectedContactKey`, retreatData,
  communityData, palanquero…) y recalcula en el tick correcto. Elimina de raíz las carreras de
  timing.
- Como el textarea es **editable**, separar:
  - `generatedMessage` (computed puro = fuente de verdad).
  - `userOverride` / `editedMessage` (lo que tipeó el usuario; gana mientras `isUserEditing`).
  - El textarea muestra `userOverride ?? generatedMessage`; al cambiar plantilla/contacto se
    descarta el override.
- Derivar también de forma declarativa: `emptyVariables`, `messagePreview` (HTML→WhatsApp/Email),
  `emailPreviewHtml`.

## Riesgo y cómo abordarlo

`MessageDialog.vue` (~1600 líneas, 35 tests) entrelaza el preview con: borradores de localStorage,
flag `isUserEditing`, conversión HTML→WhatsApp/Email, preview de email, `emptyVariables`,
preselección por `forceTemplateType`, overlay de comunidad. Tocar el preview toca todos esos
caminos.

**Hacerlo como pase dedicado:**
1. Agregar tests de caracterización del comportamiento actual ANTES de refactorizar.
2. Refactor a `computed`/`watchEffect`.
3. Quitar los ~6 `updateMessagePreview()` imperativos y los watchers redundantes.
4. Verificar los 35 tests de `MessageDialog` + e2e de todos los flujos (briefing, confirmación,
   comunidad, borradores, email backend, contacto de emergencia).

No urgente: el bug concreto ya está cubierto con `flush: 'post'` + tests.
