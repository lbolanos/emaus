# El catálogo de controles por campo de participante (`participantFieldControls`)

> Feature doc. Reglas duras para cualquier superficie que edite campos de participante:
> qué control renderiza cada campo, y qué valores puede aceptar `palancasCoordinator`.

## El problema que originó el catálogo

El formulario individual (`EditParticipantForm.vue`) y el modal de edición en lote
(`BulkEditParticipantsModal.vue`) clasificaban cada campo en un tipo de control con **dos
copias independientes de las mismas heurísticas**. Derivaron: el modal mostraba
`palancasCoordinator` como texto libre mientras el formulario individual ofrecía un select —
y el texto libre rompe el match verbatim `'Palanquero 1|2|3'` que hace
`messageSequenceService` para las notificaciones `PALANQUERO_NEW_WALKER` (fix puntual:
commit `2cf89c23`, 2026-10). La auditoría del mismo commit encontró 4 desfasores más
(`type` sin `waiting`/`partial_server`, `pickupLocation`, `palancasReceivedCount`).

Desde 2026-10-06 ambas superficies clasifican a través de **un solo catálogo**:
`apps/web/src/constants/participantFieldControls.ts`.

## El catálogo

```ts
inferFieldControl(key): { control, options? }
```

Tres capas, en orden de precedencia:

1. **`EXACT_FIELD_CONTROLS`** — los campos cuya forma no se deriva del nombre:
   los selects cerrados (`type`, `palancasCoordinator`, `pickupLocation`), los contadores
   numéricos (`palancasReceivedCount`, `scholarshipAmount`, `mealCount`), los texto-libre
   por retiro (`tshirtSize`), los campos de relación (`tableMesa.name`,
   `retreatBed.roomNumber`) y `tags`.
2. **Booleanos por prefijo** (`is*`, `has*`, `requests*`) más la lista explícita
   `EXTRA_BOOLEAN_KEYS` (`arrivesOnOwn`, `snores`, `palancasRequested`, `takesFridayMeal`).
3. **Heurísticas por sufijo** (`notes`/`details` → textarea, `date` → date,
   `amount` → number) y default `text`.

**Regla dura: un campo nuevo no obvio va en `EXACT_FIELD_CONTROLS`, no "funciona" por
heurística.** `scholarshipAmount` es hoy el único campo con sufijo `amount`; que la heurística
acierte para otro campo futuro es coincidencia, no diseño.

Los labels de los selects cerrados también viven en el catálogo:
`PARTICIPANT_TYPE_OPTIONS` mapea los cuatro valores que permite `@repo/types`
(`walker`, `server`, `waiting`, `partial_server`) a las keys i18n
`participants.types.*` — existe una sola lista, no una por superficie.

### Los dos consumidores

- `EditParticipantForm.getColumnType`: el `col.type` que venga en `allColumns` **gana** sobre
  el catálogo (los llamadores pueden sobreescribir un campo puntual); todo lo demás sale de
  `inferFieldControl`.
- `BulkEditParticipantsModal.getFieldType`: sale del catálogo, con una degradación
  explícita — si `palancasCoordinator` no tiene opciones cargadas (falló el fetch de
  `GET /responsibilities/palanquero-options`), renderiza texto libre en vez de un select
  vacío.

## El test de paridad

`apps/web/src/components/__tests__/participantFieldControlParity.test.ts` monta **ambos
componentes reales** y verifica, campo por campo, que el control renderizado coincida con el
catálogo. La detección es por DOM: booleano = radios (modal) o `[role="switch"]` (form),
select = `.select-root`, input por su `type`. El mock local de `@repo/ui` replica el
contrato real de reka-ui (`modelValue` in / `update:modelValue` out) — patrón de
`ImportMembersModal.test.ts`, ver `troubleshooting` §4.

Si cualquiera de las dos superficies deja de consumir el catálogo —o ramifica el template
en un control distinto— este test rompe. **Tocar el template de un campo de participante
sin tocar el otro exige actualizar el catálogo (o el test dirá cuál de los dos quedó
distinto).**

## El guard del API para `palancasCoordinator`

`retreat_participants.palancasCoordinator` es un VARCHAR sin enum, pero el dominio real es
`'Palanquero 1' | 'Palanquero 2' | 'Palanquero 3'` (así lo matchea
`messageSequenceService`). Desde 2026-10-06, `updateParticipant`
(`apps/api/src/services/participantService.ts`) rechaza los valores **nuevos** inválidos
con `400 INVALID_PALANQUERO_COORDINATOR`.

La semántica es deliberadamente asimétrica, por el patrón conocido del cliente web
(reenvía el DTO completo por spread — un schema estricto daría 400 al re-guardar fichas
legacy):

| Payload | Resultado |
| --- | --- |
| `'Palanquero 2'` (válido) | guarda |
| valor nuevo inválido (`'El papá'`) | 400 `INVALID_PALANQUERO_COORDINATOR`, no escribe nada |
| el valor inválido **ya almacenado** en la fila | pasa tal cual (congelado, no revalidado) |
| basura almacenada → otra basura distinta | 400 (cambiarla por basura nueva no está permitido) |
| `null` / `''` | limpia (el write site normaliza `''` → `null`) |
| `undefined` | no toca |
| cualquier cosa con `isImporting=true` | pasa (la columna Excel `palancasencargado` es texto libre) |

Tests: `apps/api/src/tests/services/palanqueroCoordinatorGuard.test.ts` (integración,
patrón de `palancasCountWritePath.test.ts`).

**No** está guardado: `createParticipant` (no hay vector UI que escriba el coordinator al
crear) ni la importación Excel (exenta a propósito).

### Deuda conocida

- Hay filas legacy con prosa en `palancasCoordinator` (≈37 en dev, traídas por
  importaciones históricas). El guard las congela pero no las limpia: mapearlas a
  `Palanquero N` o nulificarlas es una decisión de datos pendiente.
- Largo plazo: `palancasCoordinator` como FK a `responsibility` en vez de string mágico.

## `scripts/verify-deploy.mjs`

El deploy de este repo es build local + scp, y el healthcheck solo prueba que el servidor
responde — no qué JS sirve. El script verifica el **sitio vivo**:

```bash
node scripts/verify-deploy.mjs "Cartas Recibidas" "palancasReceivedCount"
node scripts/verify-deploy.mjs --base http://localhost:5173 "otro marcador"
```

Descarga el `index.html`, descubre por BFS los chunks lazy (entrada + lo referenciado con
nombre `Chunk-<hash8>.js`), grepea cada marcador en todos los assets y reporta en cuál
apareció. Exit 1 si falta un marcador o si no encontró ningún JS.

**Trampa grabada en el propio script**: la regex de descubrimiento usa **una sola clase
con un solo cuantificador**. Apilar dos cuantificadores de clases solapadas
(`[\w.-]*[A-Za-z0-9_-]+-…`) dispara backtracking catastrófico sobre bundles de MBs — 100%
de CPU por minutos sin un solo match, hallado en vivo contra el vendor de 2.7 MB.

Los marcadores conviene sin acentos (supervivencia a escapados de minificador) y lo
suficientemente peculiares de la feature que se verifica (un literal de UI en español, un
nombre de campo, un path de endpoint).
