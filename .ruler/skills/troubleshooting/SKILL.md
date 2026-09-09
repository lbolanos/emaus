---
name: troubleshooting
description: MUST be used cuando el usuario reporta cualquier bug, error o comportamiento inesperado en el proyecto Emaús. Índice maestro de bugs recurrentes con síntoma → causa → fix. Cubre UI congelada (reka-ui), página blanca en Safari iOS, fechas que saltan un día (TZ CDMX), checkbox sin reacción, Set/Map no reactivos, migrations SQLite que borran data silenciosamente, tap-to-assign en móvil, registro que no avanza de paso por el autofill del celular, tests Vue con defineModel, mocks Jest con ESM, tests 403, y más. Triggers — "se congela", "no responde", "página en blanco", "Safari", "iPhone", "fechas saltan", "un día antes", "checkbox no funciona", "no marca", "migration borró", "perdió data", "tap no responde", "no asigna en móvil", "no me deja avanzar", "no avanza el registro", "el botón Siguiente no hace nada", "dice que el teléfono no es número", "test falla", "ReferenceError mock", "Cannot access before initialization", "vue-i18n", "stack overflow", "Maximum call stack", "el switch no se mueve", "seleccionar todos no hace nada", "seleccioné y dice que no seleccioné nada", "el resumen sale vacío".
---

# Troubleshooting — bugs recurrentes del proyecto Emaús

Cuando el usuario reporta un problema, primero ubicá el **síntoma** en la tabla, luego saltá a la sección detallada. Cada bug tiene un skill dedicado o sección de `CLAUDE.md` con más profundidad — los enlaces están al final de cada sección.

## Índice por síntoma

| El usuario dice... | Saltá a |
| --- | --- |
| "se congela la UI", "no responde después de cerrar el menú", "tengo que recargar", "pointer-events none" | [#1 reka-ui Dialog/DropdownMenu](#1-reka-ui-dialogdropdownmenu-congela-la-ui) |
| "página en blanco en iPhone/iPad", "Safari crashea", "Maximum call stack" en móvil | [#2 Safari iOS blank page](#2-safari-ios-blank-page) |
| "las fechas salen un día antes", "el picker arranca el día previo", "el min/max del input está mal" | [#3 Timezone CDMX salta un día](#3-timezone-cdmx-salta-un-día) |
| "el checkbox no marca", "el switch no se mueve", "seleccioné y no se seleccionó nada", "seleccionar todos no hace nada" | [#4 Checkbox y Switch de reka-ui ignoran `:checked`](#4-checkbox-y-switch-de-reka-ui-ignoran-checked) |
| "la lista no se actualiza", "el contador no cambia aunque cambien los datos" | [#5 Set/Map en `ref` no son reactivos](#5-setmap-en-ref-no-son-reactivos) |
| "la migration borró data", "se perdieron rows", "tablas hijas vacías" | [#6 SQLite recreate-table cascade](#6-sqlite-recreate-table-borra-data-en-tablas-hijas) |
| "el tap en móvil no asigna", "drag funciona pero tap no", "Chrome DevTools touch falla" | [#7 Tap-to-assign móvil/DevTools](#7-tap-to-assign-no-funciona-en-móvildevtools) |
| "el test falla con ReferenceError" / "Cannot access X before initialization" (backend Jest) | [#8 Jest mock factory con ESM](#8-jest-mock-factory-con-esm-experimental) |
| "el test 403 no se dispara", "el mock de authorization no se usa" | [#9 Tests 403 con ESM + path aliases](#9-tests-de-autorización-403-con-esm--path-aliases) |
| "el test Vue rompe porque Input no tiene min/max" / "defineModel" | [#10 Tests Vue con defineModel](#10-tests-vue-con-componentes-definemodel) |
| "el botón no navega", "click al Button no me lleva a la página", "as=router-link no funciona" | [#11 Button con `as` string ignora componentes Vue](#11-button-con-as-string-ignora-componentes-vue-router-link) |
| "el botón no tiene ícono", "el ícono no aparece", "el componente sale vacío pero no hay error" | [#12 Ícono/componente usado sin importar en `<script setup>`](#12-íconocomponente-usado-sin-importar-en-script-setup) |
| "el tooltip tarda mucho en salir", "demora en aparecer el texto al pasar el mouse" | [#13 Tooltip lento: `title` nativo vs reka-ui](#13-tooltip-lento-title-nativo-vs-reka-ui) |
| "el botón Eliminar/Confirmar sigue deshabilitado aunque escribí el nombre exacto" | [#14 Confirmación por nombre nunca se habilita (whitespace)](#14-confirmación-por-nombre-nunca-se-habilita-whitespace) |
| "no me deja avanzar el registro", "el botón Siguiente no hace nada", "dice que el teléfono no es número pero sí lo es", "llenó todo bien desde el celular y no pasa" | [#15 Caracteres invisibles del autofill móvil](#15-caracteres-invisibles-del-autofill-móvil-bloquean-la-validación) |
| "la suite del API falla en tests que no toqué", "SQLITE_MISUSE / Database handle is closed", "pasa aislado pero falla completo" | [#16 Fallos fantasma por dos jest simultáneos](#16-fallos-fantasma-al-correr-dos-jest-a-la-vez-api) |
| "el test del scroll lock pasa aislado y falla en el archivo completo", "body.style.overflow me da '' cuando acabo de ponerlo en hidden" (Vitest) | [#17 happy-dom: `body.style` se queda pegado tras resetearlo](#17-happy-dom-bodystyle-se-queda-pegado-tras-resetearlo) |
| "compartí el link del retiro por WhatsApp y sale sin título/imagen", "el preview no dice de qué retiro es", "sigue saliendo la tarjeta vieja" | [#18 El preview del enlace no muestra el retiro](#18-el-preview-del-enlace-no-muestra-el-retiro) |
| "el encabezado del PDF sale abajo", "la cabecera se monta encima del texto", "solo sale en la primera página" | [#19 Encabezado con `position: fixed` se pinta al pie](#19-el-encabezado-repetido-con-position-fixed-se-pinta-al-pie-y-tapa-el-texto) |
| "en el PDF hay palabras pegadas", "sale un espacio antes del signo de interrogación", "SERVIR ?" | [#20 Texto con negritas: espacios perdidos o inventados](#20-texto-con-negritas-se-pierden-o-se-inventan-espacios) |
| "la suite falla en tests distintos cada vez", "Maximum call stack size exceeded en un test", "Exceeded timeout of 10000 ms" | [#21 La suite de jest falla en suites distintas cada vez](#21-la-suite-de-jest-falla-en-suites-distintas-cada-vez-sin-tocar-ese-código) |
| "elegí las tallas y el resumen dice que no elegí ninguna", "lo capturé y la pantalla lo muestra vacío", "el reporte sale en cero aunque hay datos" | [#22 La pantalla lee un campo legacy que el formulario ya no llena](#22-la-pantalla-lee-un-campo-legacy-que-el-formulario-ya-no-llena) |
| "al dar clic en elegir foto no sale nada", "el botón de subir archivo no hace nada", "en local no funciona pero en prod sí" | [#23 El selector de archivos no abre: la ref quedó vieja por el hot-reload](#23-el-selector-de-archivos-no-abre-la-ref-quedó-vieja-por-el-hot-reload) |
| "no me deja seleccionar el país", "se sale al inicio y pierdo el registro", "en el iPhone se cierra solo", "se queda en Cargando…" | [#24 Un paquete de datos entero en un selector tumba Safari iOS](#24-un-paquete-de-datos-entero-en-un-selector-tumba-safari-ios) |
| "importé el Excel y faltan personas", "subí 140 y salen 108", "el retiro no está abierto para registro público", "cannot start a transaction within a transaction", "hay tres personas en una habitación de dos", "se perdieron las habitaciones que ya había asignado la parroquia" | [#25 La importación del Excel pierde gente en silencio](#25-la-importación-del-excel-pierde-gente-en-silencio) |
| "Cannot call trigger on an empty DOMWrapper", "el test no encuentra el thead/la fila", "el selector existe en la app pero no en el test", "el `mount()` me da la tabla vacía" (Vitest) | [#26 La vista montada sigue en el skeleton: falta `flushPromises`](#26-la-vista-montada-sigue-en-el-skeleton-falta-flushpromises) |
| "el test que lee un archivo del repo revienta con ERR_INVALID_URL_SCHEME" | [#27 `import.meta.url` no es una URL file: bajo `src/test/`](#27-importmetaurl-no-es-una-url-file-bajo-srctest) |
| "el PDF no trae las imágenes", "en el Word sí se ven y en el PDF no", "salen solo algunas fotos", "falta el dibujo de la charla" | [#28 El PDF pierde las imágenes que van pegadas al texto](#28-el-pdf-pierde-las-imágenes-que-van-pegadas-al-texto) |
| "salió un error y no hay nada en el log del servidor", "An unexpected error occurred", "se registró desde la computadora porque el celular no lo dejó", "le dio error pero sí quedó registrado" | [#29 El error que no dejó rastro: la petición nunca llegó](#29-el-error-que-no-dejó-rastro-la-petición-nunca-llegó) |
| "en producción sale la clave de traducción en pantalla", "dice serverRegistration.algo.otro en vez del texto", "el test pasa pero el texto sale mal" | [#30 Una clave de i18n inexistente pasa verde en toda la suite](#30-una-clave-de-i18n-inexistente-pasa-verde-en-toda-la-suite) |
| "Jest encountered an unexpected token" apuntando a un import nuestro, "Test suite failed to run" antes de correr nada, "este módulo no tiene ni un test" | [#31 Un módulo con `import.meta` es invisible para Jest](#31-un-módulo-con-importmeta-es-invisible-para-jest--y-su-lógica-nunca-se-prueba) |
| "el contador de arriba no cuadra con la lista", "aquí dice recibidas y allá pendiente", "el total se come registros" | [#32 Un mismo campo con varios criterios](#32-un-mismo-campo-con-varios-criterios-que-se-contradicen) |

---

## 1. reka-ui Dialog/DropdownMenu congela la UI

**Síntoma**: tras cerrar un `DropdownMenu` que abre un `Dialog`/`AlertDialog`/`Sheet`/`Drawer` de `@repo/ui`, ningún click responde. DevTools muestra `pointer-events: none` u `overflow: hidden` huérfano en `<body>`.

**Causa**: reka-ui (port de Radix) inyecta `pointer-events: none` en `<body>` por unos ms al cerrar un overlay. Si un Dialog abre en ese mismo tick, hereda el body bloqueado.

**Solución estándar** — usar el composable `useRekaDialogFix` (`apps/web/src/composables/useRekaDialogFix.ts`). Encapsula las tres reglas y registra polling automático cada 500ms para auto-reparar estado huérfano:

```ts
import { useRekaDialogFix } from '@/composables/useRekaDialogFix';

const { deferOpen } = useRekaDialogFix();
// Polling + cleanup en unmount registrados automáticamente.
```

```vue
<!-- Regla 1: usar @select + deferOpen, NO @click -->
<DropdownMenuItem @select="deferOpen(() => showXDialog = true)">…</DropdownMenuItem>

<!-- Para handlers que ya hacen trabajo sin args, basta pasar la referencia -->
<DropdownMenuItem @select="deferOpen(openHistoryDialog)">…</DropdownMenuItem>
```

```ts
// Regla 3: confirm/save cierra el dialog ANTES del await pesado
async function confirmX() {
  const ctx = xContext.value;
  showXDialog.value = false;        // ← cerrar primero
  xContext.value = null;
  try { await store.heavyReload(ctx.id); }
  catch (e) { toast({ title: 'Error', variant: 'destructive' }); }
}
```

> **Regla 2** está implementada DENTRO del composable: `restoreBodyOverflow` limpia `overflow`, `paddingRight`, `pointerEvents` y `data-scroll-locked`. No reimplementes saneadores locales — siempre usa el composable.

**Opt-out de polling** (e.g. en tests): `useRekaDialogFix({ poll: false })`.

**Excepción**: si el "dialog" es `<Teleport>` custom (no reka-ui), no aplica. La mayoría de modales del repo son Teleports.

**Auditar el repo**:
```bash
# Patrón A — DropdownMenuItem sin defer que abre Dialog reka-ui
grep -rn 'DropdownMenuItem @click' apps/web/src/ | grep -v 'deferOpen'

# Patrón B — confirm cerrando Dialog en finally tras await
grep -rn -B 8 '} finally {' apps/web/src/views/ | grep -B 6 'Dialog.value = false'

# ¿Vista usa el composable ya?
grep -l 'useRekaDialogFix' apps/web/src/
```

**Casos** (todos resueltos vía el composable):
- 2026-05-14 — `InventoryView.vue`: historial y delete congelaban UI.
- 2026-05-14 — `HouseBedMap.vue`: bulkDeleteBeds, bulkChangeType, startEditFloorLabel, openChangeSector.
- 2026-05-14 — `BedAssignmentsView.vue`: isAutoAssignDialogOpen, isClearAssignmentsDialogOpen.

**Tests del composable**: `apps/web/src/composables/__tests__/useRekaDialogFix.test.ts` (9 tests). Nota: happy-dom tiene un quirk donde `style.foo = ''` envenena la propiedad para reasignaciones posteriores en el mismo describe — los tests usan spies sobre `setInterval`/`removeAttribute` en lugar de leer back styles para evitarlo.

---

## 2. Safari iOS blank page

**Síntoma**: en iPhone/iPad la app abre con pantalla en blanco. Error en logs: `Maximum call stack size exceeded`. Funciona en Chrome desktop.

**Causa**: stack overflow al evaluar módulos importados estáticamente. Safari iOS tiene límite de stack ~2-3x más bajo que desktop.

**Reglas**:
- `apps/web/src/main.ts` MUST usar dynamic `await import()` — los static imports causan stack overflow.
- TODAS las rutas en `router.ts` MUST ser lazy: `() => import('@/views/Foo.vue')`.
- Traducciones (`*.json` de next-intl): escapar `@` como `{'@'}` (ej. `correo{'@'}ejemplo.com`) o vue-i18n compiler explota.
- `country-state-city` (paquete de 8MB) MUST usar `defineAsyncComponent` o el bundle explota.
- `App.vue` MUST tener UN SOLO root element — multi-root fragments rompen DOM en Safari.

**Deploy**:
- Siempre limpiar `/dist/assets/` antes de copiar (evitar chunks viejos cacheados).
- Usar `?v=` cache bust en el entry JS.
- SSH server: `ssh -i ~/.ssh/emaus-key.pem ubuntu@emaus.cc`, path `/var/www/emaus/apps/web/dist`.

**Detalle**: skill `safari-ios-compatibility` (`.ruler/skills/safari-ios-compatibility/SKILL.md`).

---

## 3. Timezone CDMX salta un día

**Síntoma**: el default de un picker arranca el día antes del esperado (ej. 04 jun cuando el retiro empieza el 05). Filtros por rango horario descartan registros válidos. `min`/`max` de un input bloquea el último día.

**Causa**: el backend devuelve fechas en ISO UTC (`"2026-06-05T00:00:00.000Z"`). En CDMX (UTC-6) eso es **04 jun 18:00 hora local**. `.getDate()`, `.setHours()` operan sobre la hora local desplazada → el calendario "salta" un día.

**Patrón seguro** — extraer `YYYY-MM-DD` del string ANTES de construir el `Date`:

```ts
function calendarDateOnly(value: string | Date | null | undefined) {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.slice(0, 10));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
const c = calendarDateOnly(retreat.startDate);
const localDefault = new Date(c.y, c.m - 1, c.d, 8, 0, 0, 0); // 08:00 LOCAL
const minLocal = `${c.y}-${pad(c.m)}-${pad(c.d)}T00:00`; // input datetime-local
```

**Reglas**:
- **Nunca** `new Date(isoUtc).setHours(...)` para construir un default de UI sin normalizar primero.
- En tests, fijá el TZ: `process.env.TZ = 'America/Mexico_City'`.
- Helpers existentes: `atLocalHour()`/`toLocalInput()` en `SantisimoAdminView.vue`, `calendarDateOnly()` en `AngelitoAvailabilityEditor.vue`.

**Casos**: 2026-05-08 — editor de disponibilidad de angelitos: default arrancaba el día anterior.
**Detalle**: skill `timezone-handling` + `CLAUDE.md` sección "Manejo de fechas y zonas horarias".

---

## 4. Checkbox y Switch de reka-ui ignoran `:checked`

**Síntoma**: el usuario marca una casilla o mueve un switch y **no pasa nada visible**. A veces
la acción sí ocurre por detrás (el contador sube, el filtro se aplica) pero el control se ve
apagado; a veces no ocurre nada en absoluto. El usuario lo reporta como *"seleccioné y me dice
que no seleccioné ninguna"*.

**Causa**: reka-ui 2.x sólo entiende **`modelValue` / `update:modelValue`**. El par
`checked` / `update:checked` de radix-vue se descarta en silencio: la prop cae como atributo HTML
en el `<button>` interno y el emit nunca se dispara.

| Lo que escribís | `data-state` | Evento al hacer clic |
| --- | --- | --- |
| `:model-value="true"` | `checked` ✅ | `update:modelValue` ✅ |
| `:checked="true"` | `unchecked` ❌ | `update:modelValue` (el handler de `@update:checked` nunca corre) ❌ |

```vue
<!-- ❌ MAL -->
<Checkbox :checked="row.selected" @update:checked="toggle(row.id)" />
<Switch v-model:checked="override.granted" />

<!-- ✅ BIEN -->
<Checkbox :model-value="row.selected" @update:model-value="toggle(row.id)" />
<Switch v-model="override.granted" />

<!-- Tercer estado del checkbox: NO existe la prop `indeterminate` -->
<Checkbox :model-value="allSelected ? true : (someSelected ? 'indeterminate' : false)" />
```

**Combinación que engaña**: `:checked` + `@click="toggle(...)"`. El clic funciona (es un evento
DOM), así que la selección avanza, pero la casilla nunca se pinta. Es el caso más difícil de ver
en una demo rápida y el que más confunde al usuario.

**Por qué la suite no lo atrapa**: `apps/web/src/test/setup.ts` mockea `@repo/ui` entero con
componentes que aceptan cualquier prop. Ningún test montado con el mock global puede ver esto.
El guard vive en `apps/web/src/test/repoUiToggleApi.test.ts`, que importa los componentes
**reales** por ruta relativa (`../../../../packages/ui/src/...`, saltándose el mock) y además
grepea `apps/web` para que no reaparezca la forma vieja. Si un test de una vista necesita
comprobar selección, su `vi.mock('@repo/ui')` local debe replicar el contrato real
(ver `src/components/community/__tests__/ImportMembersModal.test.ts`).

**Ojo al arreglar el wrapper de `@repo/ui`** (`packages/ui/src/components/ui/switch/Switch.vue`),
dos trampas que costaron un rato:

- `useForwardPropsEmits` re-emite `update:modelValue` **además** del que emite el wrapper: cada
  handler del consumidor se ejecutaría dos veces y un toggle volvería a su estado inicial. Hay que
  escribir el forward a mano.
- Vue castea a `false` una prop booleana ausente, así que `props.modelValue ?? props.checked`
  **nunca** llega a `checked`. Las props de valor tienen que declararse con
  `withDefaults(..., { checked: undefined, modelValue: undefined })`.

**Auditar el repo**:
```bash
grep -rn 'Checkbox.*:checked\|Checkbox.*@update:checked' apps/web/src/
grep -rn 'v-model:checked' apps/web/src/          # afecta a Switch
# `<input type="checkbox" :checked>` nativo NO es bug: filtrá por el componente.
```

**Casos**:
- 2026-08-20 `ImportMembersModal.vue` — "seleccionar todos" no hacía nada y los checks de fila
  nunca se pintaban; `RetreatRoleManagementView.vue` — el switch Permitir/Denegar estaba muerto,
  imposible crear un override de denegación; `FilterDialog.vue` — el switch de etiquetas se veía
  apagado con el filtro aplicado.

---


### El mismo defecto en `Progress`: `:value` deja la barra en cero (2026-09-07)

No es exclusivo de los controles de formulario: **cualquier** envoltorio de `@repo/ui` sobre
reka-ui hereda `…RootProps`, y ahí la prop es `modelValue`. `Progress.vue` la declara con
`withDefaults(..., { modelValue: 0 })`, así que `:value="80"` cae como atributo y la barra se
pinta **al 0 %** — sin error, sin warning, sin test rojo.

```vue
<Progress :value="rate" />        <!-- ❌ barra vacía siempre -->
<Progress :model-value="rate" />  <!-- ✅ -->
```

**Cómo se detecta**: mirando la pantalla. El mock global de `@repo/ui` acepta cualquier prop, así
que la suite pasa igual (misma causa que arriba). El guard es
`apps/web/src/test/repoUiProgressApi.test.ts`, que importa el `Progress` real y además lleva una
**allowlist de la deuda conocida**: 14 ocurrencias con `:value` (7 en `RetreatDashboardView.vue`,
7 en `TelemetryDashboardView.vue`) que ya estaban y siguen pintando barras vacías. Si vas a tocar
esas vistas, arreglalas y bajá el número de la allowlist; un archivo nuevo con `:value` rompe el
test a propósito.

Regla general que sale de las dos: **antes de pasarle una prop a un componente de `@repo/ui`,
comprobá su nombre en `packages/ui/src/components/ui/<nombre>/`.** La intuición de Vue/HTML
(`checked`, `value`, `indeterminate`) es justo la que falla, y falla en silencio.

## 5. Set/Map en `ref` no son reactivos

**Síntoma**: agregás/quitás elementos a un `Set` o `Map` envuelto en `ref()`, pero los `computed` o templates que dependen de `.has()` / `.get()` no se actualizan.

**Causa**: Vue 3 tracking funciona sobre objetos y arrays. `Set.has()` y `Map.get()` no son interceptados por el sistema de reactividad de Vue cuando viven dentro de un `ref`.

```ts
// ❌ MAL: el template no reacciona a .add()/.delete()
const selectedIds = ref<Set<number>>(new Set());
const isSelected = computed(() => selectedIds.value.has(currentId));

// ✅ BIEN: usar arrays o Record
const selectedIds = ref<number[]>([]);
const isSelected = computed(() => selectedIds.value.includes(currentId));

// O Record si necesitás lookup por clave
const colorById = ref<Record<number, string>>({});
```

> Workaround si necesitás Set/Map: reasignar el contenedor entero al mutarlo (`selectedIds.value = new Set([...selectedIds.value, newId])`), pero es feo. Mejor usar arrays.

---

## 6. SQLite recreate-table borra data en tablas hijas

**Síntoma**: después de correr `pnpm --filter api migration:run`, tablas hijas (`community_member`, `community_meeting`, etc.) están vacías sin error visible. El backup pre-migration tiene la data intacta.

**Causa**: cuando una migration recrea una tabla padre con `CREATE/COPY/DROP/RENAME`, TypeORM envuelve `up()` en una transacción. SQLite documenta que `PRAGMA foreign_keys = OFF` **se ignora** dentro de una transacción ya iniciada. El `DROP TABLE` cascadea por las FK `ON DELETE CASCADE` de las tablas hijas y borra todo.

**Fix obligatorio** — toda migration con `DROP TABLE` sobre tabla con FKs entrantes DEBE declarar:

```ts
export class FooBar20260507120000 implements MigrationInterface {
  transaction = false;   // ← TypeORM no envuelve up()/down() en transacción
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`PRAGMA foreign_keys = OFF`);
    // CREATE new → COPY → DROP old → RENAME
    await queryRunner.query(`PRAGMA foreign_keys = ON`);
  }
}
```

**Antes de aprobar/correr la migration**:
1. ¿`transaction = false` está declarado? Si no, exigirlo.
2. ¿Hay test seed-and-verify? Insertar rows en cada hija, correr `up()`, validar `COUNT(*)` ≠ 0.
3. ¿Backup manual hecho? `cp apps/api/database.sqlite apps/api/database.sqlite.backup-<desc>`.

**Recuperación** si ya pasó y hay backup:
```sql
ATTACH DATABASE 'database.sqlite.backup-X' AS bak;
INSERT INTO main.community_member SELECT * FROM bak.community_member
  WHERE id NOT IN (SELECT id FROM main.community_member);
DETACH DATABASE bak;
```

**Casos**: 2026-05-07 — `AddPublicRegistrationToCommunity` perdió 66 `community_member` + 8 `community_meeting`.
**Detalle**: skill `sqlite-migrations` (`.ruler/skills/sqlite-migrations/SKILL.md`).

---

## 7. Tap-to-assign no funciona en móvil/DevTools

**Síntoma**: en móvil (o en Chrome DevTools touch emulation) el usuario tapea un participante y luego una zona, pero la asignación no se dispara. El drag-and-drop sí funciona.

**Causa**: Chrome DevTools dispara `touchmove` aunque el usuario no mueva (drift del mouse en hold ~1280ms). Cualquier detector de scroll basado en `touchmove` o delta de posición da falsos positivos.

**Fix**: los elementos zona necesitan AMBOS handlers — `@touchend` Y `@click`:

```vue
<div
  @touchend="tapZone(zoneId)"
  @click="tapZoneClick(zoneId)"
>…</div>

<!-- Pills asignados adentro de la zona necesitan @click.stop -->
<span class="pill" @click.stop>…</span>
```

- `useTapAssign.ts` expone `onZoneClick` que chequea `tappedParticipant` y llama al callback.
- `touchend` se dispara primero y limpia `tappedParticipant` → el `click` queda como no-op automático.
- Usar `lastHandledByTouch` timestamp guard de 500ms para evitar double-fire.

---

## 8. Jest mock factory con ESM experimental

**Síntoma**: `ReferenceError: Cannot access 'mockX' before initialization` en tests del backend (`apps/api`) cuando se corre con `NODE_OPTIONS=--experimental-vm-modules`.

**Causa**: con ESM experimental, los factories de `jest.mock()` se hoizan antes de cualquier declaración del módulo. Las `const`/`let` del scope del módulo no están inicializadas cuando el factory ejecuta.

```ts
// ❌ MAL: mockSendEmail no existe aún cuando factory corre
const mockSendEmail = jest.fn();
jest.mock('@/services/emailService', () => ({
  EmailService: jest.fn(() => ({ sendEmail: mockSendEmail })),
}));

// ✅ BIEN: factory sin referencias externas
jest.mock('@/services/emailService', () => ({
  EmailService: jest.fn(() => ({
    sendEmail: jest.fn().mockResolvedValue(true),
  })),
}));
```

**Para verificar llamadas**: usar `result.sent`, `signupId` en un `Map`, o estado observable — no accedas al mock internamente. `jest.requireMock` puede dar contextos distintos con ESM.

**`await import()` DENTRO del test resuelve otra instancia del módulo.** Un
`const { fn } = await import('@/services/xService')` escrito dentro del `it()` devuelve un módulo
distinto del que cargó el `test-setup`, con un `AppDataSource` **sin** el swap a la base de test.
Salta como `ConnectionIsNotSetError: Connection with sqlite database is not established` en la
primera transacción — idéntico a un bug de producción. El import va **estático, arriba del
archivo**. (2026-08-31, al testear `anonymizeParticipantByToken`.)

**Singletons**: instanciar el servicio directo en cada test para estado limpio:
```ts
const svc = new (MyService as any)();
```

**Detalle**: `CLAUDE.md` sección "Tests de servicios con singleton".

---

## 9. Tests de autorización 403 con ESM + path aliases

**Síntoma**: querés testear que un endpoint devuelve 403, hacés `jest.mock('@/middleware/authorization')` con `jest.requireMock(...)`, pero el mock no se aplica y la request pasa.

**Causa**: con ESM + path aliases (`@/`), `jest.requireMock('@/middleware/authorization')` puede no retornar el mismo objeto que el `import` del módulo testado. Hay dos contextos distintos del módulo y el mock vive en uno solo.

**Workaround actual**: los tests de integration **no testean el 403**. Solo testean el happy-path de la lógica de negocio. La autorización se cubre en tests de middleware independientes (sin path aliases).

**Detalle**: `CLAUDE.md` sección "Tests de autorización 403".

---

## 10. Tests Vue con componentes `defineModel`

**Síntoma**: un test de un componente que usa `<Input type="number" :min="0" :max="100" />` falla porque el mock global de `Input` en `apps/web/src/test/setup.ts` no incluye `min`/`max`.

**Causa**: los mocks globales de `@repo/ui` en `setup.ts` solo exponen las props básicas (Input/Button/Tooltip). Si tu componente usa más atributos HTML, hay que sobrescribir el mock localmente.

```ts
// En el .test.ts del componente:
vi.mock('@repo/ui', () => ({
  Input: {
    name: 'Input',
    props: ['modelValue', 'type', 'min', 'max'],
    emits: ['update:modelValue'],
    template:
      '<input :type="type" :value="modelValue" :min="min" :max="max" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  // ... resto de componentes que necesitas
}));
```

**No uses cast TS dentro de templates** — Vue compila el template y rechaza `as HTMLInputElement` en strings. Pasá el valor crudo del evento.

**Detalle**: `CLAUDE.md` sección "Tests para componentes con `defineModel`".

---

## 11. Button con `as` string ignora componentes Vue (router-link)

**Síntoma**: un `<Button as="router-link" to="/x">` renderiza visualmente correcto pero el click no navega a ninguna parte. Tampoco hay error en consola.

**Causa**: `@repo/ui/Button` envuelve a `Primitive` de `radix-vue`. El prop `as` espera un **nombre de tag HTML** (`button`, `a`, `div`) o un **componente importado**. Cuando recibe un string como `"router-link"` o `"RouterLink"`, lo trata como custom element HTML, no como componente Vue → el browser renderiza un `<router-link>` literal y no hace nada al click.

**Fix** — usar el patrón `as-child` de Radix (el `Button` aplica sus clases al child y delega comportamiento):

```vue
<!-- ❌ MAL — no navega -->
<Button as="router-link" to="/login">
  Ir al login
</Button>

<!-- ✅ BIEN — patrón as-child -->
<Button as-child>
  <router-link to="/login">Ir al login</router-link>
</Button>
```

**Alternativa equivalente** — pasar el componente importado a `:as` (no string):

```vue
<script setup>
import { RouterLink } from 'vue-router';
</script>
<Button :as="RouterLink" to="/login">Ir al login</Button>
```

**Auditar el repo**:
```bash
# Cualquier as= con string que NO sea HTML tag estándar
grep -rEn 'as="[a-z-]+"' apps/web/src/ | grep -v 'as="\(button\|a\|div\|span\|form\|label\|input\|select\|ul\|li\|nav\|section\|article\|h[1-6]\|p\|img\|table\)"'

# Específicamente router-link / RouterLink
grep -rEn 'as="(router-link|RouterLink|Router-Link)"' apps/web/src/

# as= con PascalCase (suele ser un componente Vue, no un HTML tag)
grep -rEn 'as="[A-Z][a-zA-Z]+"' apps/web/src/
```

**Aplica al mismo patrón en**: cualquier componente de `@repo/ui` basado en `Primitive` de radix-vue/reka-ui (Button, Badge, Card, etc.). El mismo bug ocurriría con `<Badge as="router-link">`.

**Casos**:
- 2026-05-17 `apps/web/src/views/VerifyEmailView.vue:19` — el botón "Ir al login" tras verificar email no navegaba. Fix con `as-child` + computed `continueTarget`/`continueLabel` para enviar al user autenticado a `/app` en lugar de `/login`.

**Detalle**: docs de radix-vue sobre [`Primitive` y `as-child`](https://www.radix-vue.com/utilities/primitive).

---

## 12. Ícono/componente usado sin importar en `<script setup>`

**Síntoma**: un botón (u otro elemento) aparece **sin su ícono** — el hueco está pero el SVG no. No hay error en consola y **`pnpm build` (vue-tsc) pasa sin quejarse**.

**Causa**: en `<script setup>`, un componente usado en el template (p. ej. `<Trash2 />`) debe estar **importado**. Si falta el import, Vue no lo resuelve y **renderiza nada** en silencio. `vue-tsc` no lo detecta como error de tipos, así que el build queda verde. Los tests con mock global de lucide tampoco fallan (el mock resuelve el ícono aunque el componente real no lo importe).

**Fix** — importar el ícono en el bloque de imports de lucide:

```ts
import { Plus, Edit as EditIcon, Trash2 } from 'lucide-vue-next'; // ← faltaba Trash2
```

**Auditar el repo** — íconos usados en template pero ausentes del import (heurística):
```bash
# Lista íconos PascalCase usados en <template> y compáralos con el import de lucide del archivo
grep -oE '<[A-Z][A-Za-z0-9]+' apps/web/src/components/layout/Sidebar.vue | sort -u
```

**Casos**:
- 2026-07-21 `Sidebar.vue` — el botón "Eliminar retiro" salía sin ícono porque `Trash2` se usaba en el template pero no estaba en el import de `lucide-vue-next`. El build pasó igual.

**Relacionado**: distinto del bug del **mock** de lucide en tests (agregar el ícono al allowlist de `src/test/setup.ts`) — aquí el problema es el import en el **componente real**.

---

## 13. Tooltip lento: `title` nativo vs reka-ui

**Síntoma**: el usuario pasa el mouse sobre un elemento y el texto de ayuda **tarda ~1s en aparecer** (o se siente lento).

**Causa**: se usó el atributo **`title` nativo** del HTML. El navegador tiene un delay fijo (~700ms+) no configurable para mostrar el tooltip nativo.

**Fix** — usar el componente **`Tooltip` de `@repo/ui`** (reka-ui) con `delay-duration` corto:

```vue
<script setup>
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@repo/ui';
</script>

<TooltipProvider :delay-duration="150">
  <Tooltip>
    <TooltipTrigger as-child>
      <Button variant="outline" size="icon"><Trash2 class="w-4 h-4" /></Button>
    </TooltipTrigger>
    <TooltipContent>Eliminar retiro</TooltipContent>
  </Tooltip>
</TooltipProvider>
```

Notas:
- `TooltipTrigger as-child` envuelve el elemento real (Button, incluso un `SelectTrigger`) — el contexto de reka-ui va por provide/inject, así que anidar dentro de un `Select` funciona.
- Un `TooltipProvider` puede envolver varios `Tooltip` (fija el delay para todos).

**Auditar el repo**:
```bash
grep -rnE ':?title=' apps/web/src/ | grep -v 'EmptyState\|<title>'   # candidatos a migrar a Tooltip
```

**Casos**:
- 2026-07-21 `Sidebar.vue` / `MyRetreatsView.vue` — el nombre del retiro y los botones +/✏️/🗑️ usaban `title` nativo (lento); migrados a `Tooltip` de reka-ui.

---

## 14. Confirmación por nombre nunca se habilita (whitespace)

**Síntoma**: un diálogo de borrado tipo "escribe el nombre para confirmar" deja el botón **deshabilitado aunque el usuario escribió el nombre exacto** que se muestra en pantalla.

**Causa**: la comparación trimea **solo un lado**: `input.trim() === entidad.nombre`. Si el nombre guardado en la BD trae **espacios al borde** (frecuente en datos reales, p. ej. `"… | Mexico City "`), nunca coincide.

**Fix** — trimear **ambos lados**:

```ts
const canConfirm = computed(
  () => !!retreat.value && input.value.trim() === (retreat.value.parish ?? '').trim(),
);
```

**Casos**:
- 2026-07-21 `DeleteRetreatDialog.vue` — el `parish` del retiro tenía un espacio final; la confirmación por nombre era imposible hasta trimear ambos lados. Descubierto en el e2e por la UI real (no lo veían los tests con nombres limpios).

**Detalle**: feature completa en `docs/features/retreat-deletion.md`.

---

## 15. Caracteres invisibles del autofill móvil bloquean la validación

**Síntoma**: el usuario llena un formulario desde el celular y **no puede avanzar de paso**. Manda capturas donde todos los campos se ven llenos y correctos. Si acaso llega a ver el error, es absurdo: "el teléfono solo puede contener números" sobre un número que en pantalla es 100% numérico.

**Causa**: al autocompletar desde **Contactos** (o al pegar), iOS envuelve el valor en **caracteres de formato Unicode invisibles** — marcas bidi `U+202D`/`U+202C`, espacios de ancho cero `U+200B`, BOM `U+FEFF` — y deja espacios al borde. No se ven, pero cuentan como contenido: `DIGITS_ONLY_REGEX` falla (`not_digits`) y `z.string().email()` rechaza el correo.

Por qué el usuario no puede diagnosticarlo solo:
- El único aviso es un toast que se desvanece, fácil de perder en móvil.
- El borde rojo **desaparece al tocar el campo** (el `watch` sobre `formData` limpia el error al editar) → para cuando mira, no hay rastro.
- Lo percibe como "el botón Siguiente no hace nada".

**Fix** — ya aplicado para teléfonos y correos del registro (2026-08-14). El saneo vive en `packages/types/src/text.ts` y se aplica en el schema, no en el componente, para que el valor limpio sea el que se persiste:

```ts
// Campo nuevo de correo: usar los helpers, NO el viejo preprocess de ''→undefined
emergencyContact1Email: optionalEmailField(z.string().email().optional()),

// normalizePhone ya limpia los invisibles antes de quitar separadores
normalizePhone('\u202D5530978314\u202C'); // → '5530978314'
```

**Diagnosticar un campo sospechoso** (consola del navegador):
```js
[...document.querySelector('#cellPhone').value].map((c) => c.codePointAt(0).toString(16));
// 202d / 202c / 200b / feff en la lista = es esto.
```

**Desbloqueo inmediato del usuario, sin deploy**: borrar el campo completo y teclear el valor a mano, sin pegar ni aceptar la sugerencia de autocompletar.

**Al escribir tests de esto**: nunca dejes el carácter invisible **literal** en el archivo — va como escape (`'\u202D'`) o constante con nombre. Literal es ilegible en el diff y un formatter puede comérselo sin dejar rastro, y entonces el test pasa por la razón equivocada.

**Auditar el repo** — validaciones estrictas sobre texto de formulario que aún no sanean:
```bash
# Campos de correo con el preprocess viejo (solo ''→undefined)
grep -rn "val === '' ? undefined" apps/web/src/ packages/types/src/

# Validaciones de solo-dígitos que no pasen por normalizePhone
grep -rn "\^\[0-9\]" packages/types/src/ apps/api/src/
```

**Casos**:
- 2026-08-14 registro de servidor de Celaya (`/celayav/server`) — un servidor no pasaba del paso 1; reproducido en producción con WebKit emulando iPhone. Mismo síntoma que el bug de la lada (`+52`/`044`) de junio, causa distinta.

**Detalle**: `docs/features/mobile-autofill-input-sanitization.md` (y `docs/features/phone-validation-by-country.md` para la regla por país).

---

## 16. Fallos fantasma al correr dos jest a la vez (api)

**Síntoma**: `pnpm --filter api test` reporta un puñado de tests fallidos en suites que no tocaste, con errores de base de datos (`SQLITE_MISUSE: Database handle is closed`, `QueryFailedError`). Corriendo esas mismas suites solas, todas pasan.

**Causa**: dos procesos de jest compartiendo la base SQLite de test. Ocurre fácil sin darse cuenta: lanzás la suite completa en background y mientras tanto corrés un subconjunto para ir mirando, o quedó viva una corrida anterior. El segundo proceso cierra el handle que el primero está usando.

**Antes de investigar un fallo de la suite, verificá que solo haya una corrida**:
```bash
ps aux | grep "[j]est" | wc -l    # más de un jest node = los fallos pueden ser fantasma
pkill -f jest                     # dejá una sola corrida y repetí
```

**Otras dos cosas que muerden en la misma tarea**:
- La suite completa puede morir con **SIGABRT (exit 134)** por memoria antes de imprimir el resumen. Correrla con más heap y pedir el resultado estructurado evita quedarse sin dato: `NODE_OPTIONS="--experimental-vm-modules --max-old-space-size=8192" npx jest --forceExit --silent --json --outputFile=/tmp/api-result.json`.
- Si redirigís con `| tail -N`, el archivo de salida se queda solo con esas N líneas **y el exit code es el de `tail`** (0 aunque jest falle). Para diagnosticar, redirigí el log completo.

**Para comprobar que un fix es el que hace pasar un test** (que el test falla sin él), **no uses `git stash`**: el stash abarca el árbol completo, y al hacer `pop` puede chocar con artefactos generados (p. ej. `apps/web/playwright-report/index.html`) y dejar marcadores de conflicto en archivos que no tienen nada que ver. Copiá el archivo, revertí la línea, corré, restaurá:
```bash
cp packages/types/src/phone.ts /tmp/phone.ts.bak
# … revertir el cambio y correr el test (debe fallar) …
cp /tmp/phone.ts.bak packages/types/src/phone.ts
```

**Casos**:
- 2026-08-14 — al validar el fix del autofill (#15), una corrida completa reportó 18 tests fallidos en 6 suites; con un solo jest corriendo, la suite dio 191 suites / 3039 tests en verde.

---

## 17. happy-dom: `body.style` se queda pegado tras resetearlo

**Síntoma** (solo en tests del web, `environment: 'happy-dom'`): un test que verifica el bloqueo de scroll de un modal falla con `expected '' to be 'hidden'`. Corrido aislado (`-t "..."`) pasa; en el archivo completo falla. El componente sí funciona en el navegador.

**Causa**: una vez que **algún** test del archivo ejecuta `document.body.style.overflow = ''` (por ejemplo el `onBeforeUnmount` del componente al desmontarlo con el modal abierto), el *getter* `document.body.style.overflow` devuelve `''` para siempre en ese archivo. Las escrituras posteriores sí llegan al **atributo** `style` — solo el getter miente. No es un bug de Vue ni del componente; se reproduce sin Vue:

```ts
it('a', () => { document.body.style.overflow = 'hidden'; document.body.style.overflow = ''; });
it('b', () => { document.body.style.overflow = 'hidden';
  expect(document.body.style.overflow).toBe('hidden');   // ❌ recibe ''
  expect(document.body.getAttribute('style')).toContain('overflow: hidden'); // ✅
});
```

**Fix en el test** — leer el atributo, no la propiedad:
```ts
const bodyStyle = () => document.body.getAttribute('style') ?? '';
expect(bodyStyle()).toContain('overflow: hidden');
expect(bodyStyle()).not.toContain('overflow: hidden');   // tras cerrar
```
`style.setProperty('overflow', 'hidden')` también sortea el getter, pero no cambies el componente por una limitación del entorno de test.

**Casos**:
- 2026-08-17 — `LandingVideos.test.ts` (modal del showcase de videos del landing): el test de Escape + scroll lock fallaba solo al correr después del test que deja el player abierto.

---

## 18. El preview del enlace no muestra el retiro

**Síntoma**: se comparte `https://emaus.cc/<slug>` por WhatsApp y la tarjeta sale genérica (o sin
título ni imagen), en vez de «Retiro Emaús Celaya · 28 al 30 de agosto de 2026».

**Causa raíz permanente**: los rastreadores **no ejecutan JavaScript**. Del SPA solo leen las metas
de `index.html`. El preview por retiro lo resuelve nginx desviando esos user agents a
`/api/og/<slug>` (ver `docs/features/link-previews-og.md`).

**Diagnóstico, en este orden** — cada paso descarta una causa distinta:

```bash
# 1. ¿El endpoint responde con las metas del retiro? (si falla: API viejo o sin desplegar)
curl -s -A "WhatsApp/2.23" https://emaus.cc/api/og/<slug> | grep "og:title"

# 2. ¿nginx desvía al rastreador? (si devuelve el HTML del SPA: falta copiar el conf o recargarlo)
curl -s -A "facebookexternalhit/1.1" https://emaus.cc/<slug> | grep "og:title"

# 3. ¿Las URLs salen absolutas y del dominio real? (si dicen localhost:5173: falta FRONTEND_URL)
curl -s -A "WhatsApp/2.23" https://emaus.cc/api/og/<slug> | grep -E "og:url|og:image"

# 4. ¿Una persona sigue recibiendo el SPA? (debe traer el div de la app)
curl -s https://emaus.cc/<slug> | grep 'id="app"'
```

**Causas por frecuencia**:

1. **nginx no recargado** tras copiar `nginx.conf`: `sudo nginx -t && sudo systemctl reload nginx`.
2. **`FRONTEND_URL` mal en `.env.production`**: de ahí salen `og:url` y `og:image`; si apunta a
   localhost, la tarjeta sale con URLs inservibles. Es la misma variable del CORS.
3. **Caché del rastreador**: WhatsApp y Facebook guardan el preview con fuerza. Forzar en
   `https://developers.facebook.com/tools/debug/` con «Scrape Again»; WhatsApp reutiliza ese caché.
   Sin este paso, un fix correcto parece no haber funcionado.
4. **El bloque de nginx se perdió** en una edición del conf. Lo cubre
   `apps/api/src/tests/infrastructure/nginxOgPreview.simple.test.ts`.

**Ojo**: un slug inexistente o un retiro con `isPublic = false` devuelven la tarjeta genérica **a
propósito**, para no confirmar si existe un retiro privado detrás de esa URL. No es un bug.

---

## 19. El encabezado repetido con `position: fixed` se pinta al pie y tapa el texto

**Síntoma**: en el PDF impreso desde el navegador, la franja del encabezado (retiro / fecha)
aparece **abajo de la página, encima del último párrafo**, en vez de arriba y en cada hoja.

**Causa**: `position: fixed` **no** es la forma de repetir un encabezado por página en Chrome. Con
un `top` negativo (para meterlo en el margen de `@page`) el motor lo coloca al final del flujo y lo
superpone al contenido. CSS Paged Media sí define `@top-left`/`@top-right`, pero **Chrome no los
soporta** — son de motores como Prince o WeasyPrint.

**Fix**: hay dos caminos y ninguno es CSS puro:

- **Diálogo del navegador** (`window.print()`): no se puede. El encabezado va solo en la primera
  hoja, como parte del flujo normal.
- **PDF generado**: el generador pinta el encabezado y el pie por página. Con jsPDF, en una pasada
  final (`paintChrome`) cuando ya se sabe el total de páginas.

**Auditar**: `grep -rn "position: fixed" apps/web/src --include=*.ts --include=*.vue` dentro de
hojas de impresión.

**Caso**: 2026-08-17, hoja A4 de las preparaciones. Detalle: `printable-documents`.

---

## 20. Texto con negritas: se pierden o se inventan espacios

**Síntoma**: en un PDF generado por código, `**SERVIR**?` sale impreso como `SERVIR ?`, o dos
palabras aparecen pegadas.

**Causa**: al componer texto con estilos mezclados hay que partirlo en palabras para calcular el
ajuste de línea, y al hacerlo **se pierde la información de si había un espacio** entre dos trozos
de distinto estilo. Poner un espacio entre todos, o entre ninguno, falla en la mitad de los casos.

**Fix**: cada unidad de composición guarda un `spaceBefore` con lo que había en el original:

```ts
// apps/web/src/utils/markdownToPdf.ts
export interface TextUnit extends Piece { spaceBefore: boolean; newline?: boolean }
export function toUnits(pieces: Piece[], forceItalic?: boolean): TextUnit[]
```

Y al empezar línea nueva, el `spaceBefore` de la primera unidad se descarta.

**Ojo con el falso positivo**: al revisar el PDF renderizado a baja resolución (`pdftoppm -r 80`)
las palabras **parecen** pegadas aunque el archivo esté bien. Comprobar siempre con
`pdftotext archivo.pdf -`, que es lo que de verdad hay.

**Guard**: `apps/web/src/utils/__tests__/markdownToPdf.test.ts` (bloque `toUnits`).

**Caso**: 2026-08-17, PDF de las preparaciones. Detalle: `printable-documents`.

---

## 21. La suite de jest falla en suites distintas cada vez (sin tocar ese código)

**Síntoma**: `pnpm --filter api test` completo falla con 20+ tests en `houseService`; se repite y
ahora fallan `retreatService` y `responsabilityAttachment`, y `houseService` pasa. Aisladas, todas
pasan.

**Causa**: **presión de memoria en la máquina**, no el código. Los síntomas típicos son
`RangeError: Maximum call stack size exceeded` en un regex sobre un string grande, y
`Exceeded timeout of 10000 ms` en tests que normalmente tardan milisegundos.

**Diagnóstico**:

```bash
top -l 1 -n 0 | grep -E "^(Load Avg|PhysMem)"   # >20G en compressor y <6G unused = esto es
npx jest --runInBand <las suites que fallaron>   # si pasan aisladas, es ruido
```

**Fix**: liberar memoria (skill `mac-performance`) y repetir. Si hace falta correr la suite
igualmente, `--runInBand` reduce el pico frente a los 5 workers por defecto.

**No confundir con el #16** (dos jest a la vez pisándose la SQLite de test), que da `SQLITE_MISUSE`
y es determinista mientras haya dos procesos.

**Caso**: 2026-08-17, Mac con 57G usados y 23G comprimidos.

---

## 22. La pantalla lee un campo legacy que el formulario ya no llena

**Síntoma**: el usuario captura algo y la app le muestra que no hay nada. No es un error ni un
formulario que no guarda: **el dato está bien guardado**, pero la pantalla que lo muestra lee otro
lugar. El usuario lo cuenta como *"lo seleccioné y me dice que no seleccioné ninguna"*.

**Causa**: una feature migró de columnas fijas en `participant` a una tabla por retiro
(el caso típico: `needsWhiteShirt` / `needsBlueShirt` / `needsJacket` → `participant_shirt_size`
con los tipos de `retreat_shirt_type`). El formulario se migró; **una vista se quedó leyendo las
columnas viejas**, que hoy son siempre `null`. No hay error, no hay test rojo: la vista muestra el
valor por defecto ("No necesita", 0, vacío) con total naturalidad.

**Cómo confirmarlo rápido** — comparar dónde escribe el formulario contra dónde lee la vista:

```bash
# ¿Quién lee todavía las columnas viejas?
grep -rn 'needsWhiteShirt\|needsBlueShirt\|needsJacket' apps/web/src apps/api/src --include=*.ts --include=*.vue

# ¿Qué escribe de verdad el formulario? (mirá el payload real, no el código)
#   DevTools → Network → el POST, o un e2e con page.waitForRequest
```

**Chequeo mecánico útil** en formularios grandes: sacar las claves que el formulario escribe y
compararlas con las del schema de envío. Lo que no está en el schema, Zod lo strippea sin avisar.

```bash
python3 - <<'EOF'
import re
schema = open('packages/types/src/index.ts').read()
blk = schema[schema.index('export const participantSchema'):]
blk = blk[:blk.index('\n});')]
keys = set(re.findall(r'^\t(\w+):', blk, re.M))
view = open('apps/web/src/views/ParticipantRegistrationView.vue').read()
written = set(re.findall(r'formData\.value\.(\w+)\s*=', view)) | set(re.findall(r'v-model="formData\.(\w+)"', view))
print('se pierden al enviar:', sorted(written - keys))
EOF
```

**Dónde suele esconderse el mismo patrón**: pantallas de resumen/confirmación, reportes, cálculos
de inventario, exportaciones a Excel y plantillas de mensaje — todo lo que no se toca al migrar la
captura.

**Casos**:
- 2026-08-20 `ParticipantRegistrationView.vue` — el resumen del paso 6 del registro de servidor
  mostraba "No necesita" en las tres filas legacy mientras el paso 5 guardaba las tallas por tipo
  de playera. El servidor creía que su selección se había perdido; el payload la llevaba correcta.
- Mismo día, `inventoryService.ts` (`calculateTshirtQuantity` y hermanas) contaba servidores por
  esas mismas columnas: quedó inerte tras la migración `InventoryEnhancementsBundle` (los ítems
  están `isActive = 0` y las consultas filtran por activos), pero reactivar uno haría que el
  inventario pidiera cero playeras.

---

## 23. El selector de archivos no abre: la ref quedó vieja por el hot-reload

**Síntoma**: el usuario pulsa "Elegir foto" / "Subir foto" y **no pasa nada**. Sin error en
consola. Ocurre **solo en local**; el mismo botón funciona en producción. Suele afectar a varios
botones a la vez, **incluidos los que nadie tocó ese día**.

**Causa**: el patrón `const inputRef = ref(); … inputRef.value?.click()` sobre un
`<input type="file" class="hidden">`. Cuando Vite reemplaza el componente en caliente, la
referencia puede quedar apuntando a un input **ya desconectado del DOM**, y `click()` sobre un
nodo desconectado **no hace nada y no lanza nada**. En producción no hay hot-reload; por eso ahí
nunca aparece. El mismo patrón falla además en Safari aunque no haya HMR: no abre el selector si
el input está en `display:none`.

**Diagnóstico, en este orden** — los dos primeros pasos son gratis y evitan tocar código:

```bash
# 1. ¿Cuánto lleva viva la pestaña? Si son horas, es esto casi seguro.
ps -o etime= -p $(lsof -nP -iTCP:5173 -sTCP:LISTEN -t | head -1)
# 2. ¿Falla también un control que nadie tocó? Si sí, es ambiental, no del código.
```

Recargar la pestaña (`⌘⇧R`) lo confirma en cinco segundos.

**Fix permanente** — un `<label>` que envuelve al input abre el selector por HTML, sin JS:

```vue
<label class="…clases del botón… cursor-pointer">
  <ImagePlus class="w-4 h-4 mr-2" />
  Elegir foto
  <input type="file" accept="image/*" class="sr-only" @change="onFileSelected" />
</label>
```

`sr-only` en vez de `hidden`: el input sigue renderizado (invisible), que es lo que Safari exige.
Y **sin** `:disabled` en el input — un input deshabilitado vuelve inerte a su etiqueta.

**Auditar el repo** — los que aún usan el patrón frágil:
```bash
grep -rn "\.value?\.click()" apps/web/src
```

**Casos**:
- 2026-08-31 `MemberPhotoDialog.vue` (foto de miembro) y `CommunityMeetingsView.vue` /
  `MeetingFormModal.vue` (foto de reunión). El dev server llevaba 3 h 37 min. Se persiguieron tres
  causas falsas —Safari, el `Slot` de `Button as-child`, file choosers colgados— antes de que el
  dato decisivo lo diera el usuario: *"el de la reunión tampoco funciona en local, pero en prod
  sí"*. Guard de regresión en
  `apps/web/src/components/community/__tests__/MemberPhotoDialog.test.ts`.
- Quedan seis botones de subida con el patrón frágil (importar participantes, adjuntos, avatar,
  memorias, chat, foto de reunión).

---

## 24. Un paquete de datos entero en un selector tumba Safari iOS

**Síntoma**: desde el iPhone, un paso del formulario **"no deja seleccionar"** el campo (el
desplegable se queda en *Cargando…* o abre una lista imposible de recorrer con el dedo) y al rato
**"se sale al inicio"**: la página vuelve a la portada y el avance se pierde. En una laptop el
mismo formulario va perfecto.

**Causa**: el campo carga un catálogo entero para pintar unas pocas opciones. El caso medido:
`import('country-state-city')` — la raíz del paquete importa sus tres assets, y `city.json` son
**7.7 MB con ~150 000 ciudades**. Abrir el paso descargaba **9.05 MB**. Dos consecuencias, que el
usuario cuenta como dos bugs distintos:

- mientras baja y se parsea, el `<Select>` está `disabled` → *"no me deja seleccionar el país"*;
- el pico de memoria basta para que **Safari mate la pestaña y la recargue** → *"se sale al inicio"*.

Safari no avisa de esto: no hay error en consola ni pantalla de error, la pestaña simplemente
vuelve a cargar. Y como en un escritorio sobra memoria y la red es rápida, no se reproduce.

**Fix** — importar sólo el trozo que se usa, y no ofrecer catálogos que el formulario no necesita:

```ts
// ❌ arrastra country + state + city (8.3 MB de JSON)
const { Country } = await import('country-state-city')

// ✅ sólo country.json (93 KB); lib/state son 542 KB
const { default: Country } = await import('country-state-city/lib/country')
```

`import type { ICountry } from 'country-state-city'` **sí** es seguro: los tipos se borran al
compilar. Lo que cuesta es el `import()` dinámico de la raíz.

**Segunda mitad del mismo síntoma**: aunque los datos ya estén cargados, un `Select` de reka-ui con
250 opciones es inservible en un teléfono. El wrapper de `@repo/ui` no incluye
`SelectScrollUpButton`/`SelectScrollDownButton`, así que en modo *item-aligned* **sólo son
alcanzables las ~19 opciones que caben en pantalla**; en escritorio no se nota porque el typeahead
del teclado salva la papeleta. Para listas largas usar
`apps/web/src/components/form/SearchableSelect.vue` (buscador que ignora acentos, lista en flujo en
móvil y flotante desde `md`, y `Escape` que cierra sólo el desplegable — sin `.stop` cierra el
`Dialog` que envuelve el formulario y el usuario pierde todo).

**Y la tercera**: si el formulario guarda borrador, restaurá también **el paso**, no sólo los
datos. Volver al paso 1 tras una recarga se lee como *"perdí todo"* aunque las respuestas estén
ahí (`loadDraft` en `ParticipantRegistrationView.vue`).

**Auditar el repo**:
```bash
# Imports dinámicos de paquetes conocidos por traer datos gordos
grep -rn "import('country-state-city')" apps/web/src

# Qué pesa de verdad cada asset del paquete
du -h node_modules/.pnpm/country-state-city@*/node_modules/country-state-city/lib/assets/*

# Selects con más de ~50 opciones que no usan SearchableSelect
grep -rn "SelectItem v-for" apps/web/src
```

**Medirlo antes de creerse el fix** — el peso se mide en el navegador, no leyendo el código:

```js
// Playwright: sumar el cuerpo de cada respuesta del propio origen entre dos pasos
page.on('response', async (r) => { bytes += (await r.body()).length })
```

Guards: `apps/web/tests/e2e/server-registration-mobile.spec.ts` (presupuesto de bytes del paso, en
iPhone 12 emulado) y `apps/web/src/components/form/__tests__/addressStepWeight.test.ts` (nadie
vuelve a importar la raíz del paquete).

**Casos**:
- 2026-09-03 registro de servidor en emaus.cc desde un iPhone — el paso «Dirección» descargaba
  9.05 MB por el selector de país. Fix: `lib/country` + `lib/state`, ciudad como texto libre
  (se eliminó `CitySelector.vue`) y `SearchableSelect`. El paso quedó en 0.67 MB.

**Relacionado**: #2 (Safari iOS blank page) — misma familia: lo que en escritorio es "un poco
pesado", en Safari iOS es una pestaña muerta.

---

## 25. La importación del Excel pierde gente en silencio

**Síntoma**: subís N filas y en el retiro aparecen menos. El endpoint responde 200 y el
`skippedCount` sale en 0 o en 1, así que nadie lo mira. Nadie avisa de las que faltan.

Son **cuatro causas distintas**, todas verificadas importando el export de la parroquia de
Veracruz (sep 2026). Conviene descartarlas en este orden.

### 25.1 Correos compartidos: N personas se funden en una

`importParticipants` busca por `LOWER(email)` dentro del retiro y, si encuentra, **actualiza en
vez de crear**; además hay índice único `UQ_participants_email_retreat` sobre `(email, retreatId)`.
En parroquias donde el coordinador inscribe a todos con su propio correo esto es masivo: 18
personas con `notengo@gmail.com` entran como **una sola**.

**Fix**: generá correos sintéticos únicos antes de importar (el celular sirve de base:
`2297003093@sincorreo.emaus.cc`) y guardá el original en `notas`. Dejá el correo compartido solo
cuando las filas son *la misma persona* repetida, que es como se reconcilian una cancelación y su
re-inscripción.

### 25.2 El retiro debe ser público o fallan TODAS las filas

`createParticipant` llama a `assertRetreatAcceptsRegistrations` en cada fila y **no hay excepción
para el import**. Con `isPublic = false` fallan las N filas con "El retiro no está abierto para
registro público". Tampoco acepta nada después de `endDate`.

### 25.3 `cannot start a transaction within a transaction`

`updateParticipant` dispara `void domainAuditService.logUpdate(...)` **sin await**, y la auditoría
escribe con `AppDataSource.getRepository(...)`, o sea la conexión compartida. Mientras ese save
sigue en vuelo, la fila siguiente abre su `AppDataSource.transaction` en `createParticipant` y
choca. El camino de *create* sí silencia su auditoría durante el import (`if (!isImporting …)`);
el de *update* no. Es una **carrera**: se reproduce con los mismos datos pero no siempre.

Solo muerde en la transición **update → create**. Dos updates seguidos no colisionan porque
`updateParticipant` no abre transacción (140 updates consecutivos, cero pérdidas).

**Reordenar el archivo NO alcanza**: el importador reordena las filas canceladas al principio, y
eso vuelve a crear la transición pase lo que pase. El workaround que sí funciona es **una sola
fila por persona** —la que decide su estado final, la activa gana sobre la cancelada—, con lo que
el camino de update no se usa y la carrera no tiene con qué chocar.

### 25.4 Camas inventadas y habitaciones mezcladas

`findAvailableBedByRoom` solo acepta una cama cuyo `defaultUsage` coincida con el tipo del
participante y, si no la encuentra, **crea una nueva** en esa habitación. Resultado: habitaciones
de 2 con 3 personas, y caminantes durmiendo con servidores.

**Fix**: no asumas el uso por módulo, derivá el de cada habitación del propio export (una cama por
ocupante asignado, con su tipo). Las parroquias usan un bloque de habitaciones para las
solicitudes de cuarto individual **de los dos tipos**.

### 25.5 Mesas fantasma: la columna `mesa` mezcla dos cosas

En el export de emaus.mx la columna `mesa` lleva **el número de mesa del caminante** (`01`-`17`)
y, para los servidores, **el nombre de su equipo de servicio** (`COMEDOR`, `SNACK`, `LOGISTICA`,
`CAMPANA`, `FINANZAS`...). El importador crea una `TableMesa` por cada valor distinto, así que los
nombres de equipo generan **mesas vacías** junto a las reales: en Veracruz salieron 27 mesas donde
había 17.

**Fix**: en la hoja curada, vaciar `mesa` cuando no sea numérica y mover el valor a `notas`.
Comprobá antes que ningún caminante tenga mesa no numérica (en Veracruz eran 23 filas, todas de
servidores). Los servidores con mesa numérica **sí** hay que conservarlos: con `tipousuario` 1 o 2
son líder y colíder de esa mesa.

### 25.6 El CSV es más frágil que el xlsx en la pantalla de importación

`parseCSV` en `ImportParticipantsModal.vue` tiene dos comportamientos que el camino xlsx no tiene:

- **Parte el archivo por `\n` antes de separar campos.** Un salto de línea dentro de un valor
  entrecomillado desplaza todas las columnas desde ahí. Hay que aplanar los valores a una línea.
- **`values[index] || null`**: el vacío se convierte en `null`, y el importador escribe ese NULL en
  columnas `NOT NULL` y la fila muere. En el xlsx el vacío llega como cadena vacía y entra sin
  problema. En Veracruz eran **272 celdas** obligatorias vacías (98 municipios, 89 estados...).

**Fix**: rellenar esas celdas con **un espacio**, no con un guion. `parseCSVLine` no recorta, así
que el espacio sobrevive al `|| null`, y el `str()` del mapeo lo deja en cadena vacía — mismo
resultado que el xlsx y sin basura visible en la pantalla. Si podés elegir, **importá el xlsx**.

### 25.7 Crear un retiro por SQL deja el retiro sin camas

`createRetreat` copia las camas de la casa a `retreat_bed` (vía `refreshRetreatBedsFromHouse`).
Una migración o un script que inserte el retiro **por SQL crudo se salta ese paso**, el retiro
nace sin mapa de camas, y el importador va creando una cama por cada habitación del Excel: en
Veracruz **139 camas inventadas**. Hay que replicar la copia a mano.

Y si la parroquia mezcló tipos en algunas habitaciones, la excepción va en `retreat_bed`
—que tiene su propio `defaultUsage`—, **no en la casa**: así la casa queda limpia y reutilizable
para el siguiente retiro. Sin eso quedaban otras 32 camas inventadas.

### Orden que funciona

1. Casa → 2. retiro (público) → 3. import → 4. `POST /retreats/:id/auto-assign-beds`.

Nunca `refreshBeds` ni auto-asignar **antes** del import: la asignación automática por edad
reparte a todos y **borra las habitaciones que ya venían en el Excel**. El auto-assign posterior
sí es seguro: salta a quien ya tiene cama.

### Regla dura

**Contá los participantes después de importar y compará contra las filas.** El importador informa
lo que saltó, pero no lo grita, y las cuatro causas de arriba fallan en silencio.

**Auditar el repo**:

```bash
grep -n "LOWER(participant.email)" apps/api/src/services/participantService.ts   # 25.1
grep -n "assertRetreatAcceptsRegistrations" apps/api/src/services/participantService.ts  # 25.2
grep -n "void domainAuditService.logUpdate" apps/api/src/services/participantService.ts  # 25.3
grep -n "createRetreatBedForRoom" apps/api/src/services/participantService.ts    # 25.4
```

**Casos**: Veracruz XXIII, sep 2026 — 213 filas de export, 41 compartiendo 8 direcciones; 31
personas se habrían perdido por 25.1 y 2 más por 25.3.

**Nota**: la fixture del e2e (`apps/web/tests/e2e/fixtures/participant-import-sample.csv`) no tiene
columnas de sacramentos ni `habitacionindividual`, así que esos caminos no se ejercitan. Y el
mapeo de sacramentos busca las claves en inglés (`sacramentobaptism`) mientras los export legados
las traen en español: hay un conversor en `scripts/convert-parish-registrations.py` que ya emite
las inglesas, así que si se unifica hay que tocar los dos a la vez.

## 26. La vista montada sigue en el skeleton: falta `flushPromises`

**Síntoma** (tests del web, Vitest): un test que monta una vista falla con
`Error: Cannot call trigger on an empty DOMWrapper` o con `Cannot read properties of undefined`
al indexar `findAll(...)`. El elemento **existe** en la app real y `w.html()` lo muestra si lo
imprimís desde otro test del mismo archivo. Lo delator: los tests que **no** esperan nada tras
`mount()` pasan, y los que hacen `await nextTick()` fallan.

**Causa**: el `onMounted` de la vista es `async` y levanta un flag de carga:

```ts
onMounted(async () => {
  loading.value = true
  try { await participantStore.fetchParticipants() } finally { loading.value = false }
})
```

`await nextTick()` cede **un** tick de microtareas: el `loading = true` ya se aplicó pero el
`finally` todavía no corrió, así que el template está en la rama del skeleton
(`<div v-if="loading">`) y la tabla real no existe en el DOM. El mensaje de VTU no menciona el
skeleton, así que se busca el error en el selector, en el mock o en el markup — donde no está.

**Fix en el test** — esperar todas las promesas pendientes, no un tick:

```ts
const w = mountView(walkers);
await flushPromises();          // ✅ el finally corre, loading vuelve a false
await w.find('button[title="Ordenar por mesa"]').trigger('click');
```

`nextTick()` alcanza para lo que ya está renderizado (un click, un `v-if` que depende de un ref
local), y de hecho los tests de búsqueda de esa misma vista lo usan sin problema: el input vive
**fuera** del bloque de `loading`. La regla corta: si el elemento está dentro de una rama que
depende del flag de carga, `flushPromises`.

**Auditar el repo** — vistas cuyo `onMounted` async mueve un flag de carga:
```bash
grep -rlZ "onMounted(async" apps/web/src/views | xargs -0 grep -l "loading.value = true"
```

**Bonus de la misma familia** — la celda de nombre de las tablas de participantes trae el avatar
de iniciales dentro del `<td>`, así que `td:nth-child(2)` devuelve `"AGAna García"` y la
comparación falla por dos letras. El nombre se lee del `span`:

```ts
const names = w => w.findAll('tbody tr').map(r => r.find('td:nth-child(2) span').text().trim());
```

**Casos**:
- 2026-09-06 — `BagsReportView.test.ts` (ordenamiento por mesa/nombre/apellido/talla): 12 tests
  nuevos en rojo, todos con el mismo mensaje de DOMWrapper vacío; el ordenamiento estaba bien
  desde el principio. Otros 5 fallos del mismo lote eran el avatar de iniciales.

**Detalle**: `docs/features/bags-report.md` § Tests.

---

## 27. `import.meta.url` no es una URL file: bajo `src/test/`

**Síntoma**: un test de Vitest que lee un archivo del repo (un guard de código, un HTML) muere
antes de correr ningún caso con `Serialized Error: { code: 'ERR_INVALID_URL_SCHEME' }` apuntando
a la línea del `fileURLToPath`. El **mismo patrón funciona** en un test de otra carpeta.

**Causa**: para los archivos bajo `apps/web/src/test/` —la carpeta del `setupFiles`— Vitest no
entrega `import.meta.url` como `file://`, así que `fileURLToPath()` lo rechaza. En
`src/components/**/__tests__/` el mismo código resuelve bien; no es el patrón, es la ubicación.

**Fix** — `__dirname`, como los tests vecinos de esa carpeta (`indexHtmlSeo.test.ts`):

```ts
// ❌ revienta en src/test/
const SRC = fileURLToPath(new URL('..', import.meta.url));

// ✅
const SRC = resolve(__dirname, '..');
```

Nada que ver con la prohibición de `__dirname` en `apps/api`, que es por el bundle ESM de
producción: en un test de Vitest no hay bundle.

**Casos**: 2026-09-07 `src/test/bootPayload.test.ts`.

---

## 28. El PDF pierde las imágenes que van pegadas al texto

**Síntoma**: el usuario compara el `.docx` original con el PDF que baja la app y faltan fotos.
No falta ninguna en concreto: **algunas** salen y otras no, sin patrón aparente para quien mira.
En las preparaciones llegaban 4 de 13. Ningún test en rojo, ningún error en consola.

**Causa**: el markdown que salió de convertir un `.docx` deja la imagen pegada al párrafo, sin
línea en blanco. marked entonces **no** emite un bloque `image`: la mete dentro del `paragraph`
(o del `heading`, en `## ![](…)`). Un renderizador que sólo dibuje el párrafo cuyo único token es
la imagen se salta todas las demás, y `flattenInline` las tira sin ruido porque el único texto de
un token `image` es su `alt`, vacío en estos documentos.

Las que sobreviven son justo las que quedaron con una línea en blanco a cada lado — de ahí que
parezca aleatorio.

**Fix**: partir el bloque en tramos por sus tokens `image` y dibujar cada tramo en orden;
recortar los blancos del tramo que sigue a una imagen o el rótulo pierde su sangría.
`drawParagraphBlock` / `drawHeadingBlock` en `apps/web/src/utils/markdownToPdf.ts`.

**Auditar el repo**:

```bash
# ¿Alguna plantilla tiene una imagen pegada a texto (sin línea en blanco)?
grep -n -A1 '^!\[' apps/api/src/data/preparation-docs/*.md | grep -v '^--$' | grep -B0 '\S'
# ¿Cuántas imágenes llegan de verdad al PDF? (ojo: >= , nunca ==)
grep -c '/Subtype */Image' salida.pdf
```

**Casos**: 2026-09-07, `apps/web/src/utils/markdownToPdf.ts` — 9 de 13 imágenes perdidas en los
documentos de las preparaciones durante tres semanas.

**Detalle**: skill `printable-documents` (por qué el conteo de `/Subtype /Image` engaña: jsPDF
deduplica imágenes idénticas y añade una máscara por cada PNG con alfa) y
`docs/features/retreat-preparations.md`.

## 29. El error que no dejó rastro: la petición nunca llegó

**Síntoma**: alguien reporta un error en una pantalla pública —típicamente con captura— y en el
servidor **no hay nada**: ni 4xx, ni 5xx, ni una línea en el access log. El mensaje suele ser
genérico ("An unexpected error occurred"). Casi siempre desde un móvil, y a menudo con la pantalla
llevando mucho tiempo abierta.

**Causa**: la petición no obtuvo respuesta. Safari de iOS mata la conexión de una pestaña que
estuvo suspendida, así que el primer XHR después falla al instante sin salir del teléfono; la red
del móvil que se cae hace lo mismo. En axios eso es un error **sin `response`**, y todo código que
lee `error.response?.data?.message` cae a su fallback.

Antes de teorizar, dos comprobaciones que descartan medio árbol:

```bash
ls /var/log/nginx/                 # el vhost escribe en emaus-access.log, NO en access.log
sudo grep <la-ruta> /var/log/nginx/emaus-access.log | tail
```

Buscar en el `access.log` genérico devuelve vacío **siempre**, y eso se lee como "no llegó" sin
haberlo comprobado. Si de verdad no aparece, quedan dos culpables fuera del API: el teléfono y
Cloudflare (un 403/challenge no toca el origen y solo se ve en Security Events).

**Fix** — en el cliente, `apps/web/src/services/apiError.ts`:

```ts
if (isNetworkError(error)) …                          // no hubo respuesta
await retryOnceOnNetworkError(send, { onRetry })      // repetir UNA vez
wasRetriedAfterNoResponse(error)                      // ¿viene del segundo intento?
```

El reintento solo en operaciones repetibles sin duplicar, y **un 409 del segundo intento no se
anuncia como éxito**: suele significar que el primero entró, pero con un correo compartido la fila
puede ser de otra persona.

**Y que la próxima deje rastro**: `POST /api/telemetry/public/client-error` escribe una línea
`[CLIENT ERROR]` en el log del API (público, exento de CSRF porque `sendBeacon` no pone
cabeceras, sin escribir en la base). Se reportan solo los fallos de los que no queda constancia.

```bash
grep '\[CLIENT ERROR\]' ~/.pm2/logs/emaus-api-error.log | tail
```

**Casos**: 2026-09-08, confirmación de registro de servidor desde un iPhone (iOS 18.7) con la
pantalla 70 minutos abierta; la persona se fue a registrarse desde una computadora.

**Detalle**: `docs/features/retreat-form-validation-and-error-messages.md` §4; rutas de logs en el
skill `infra-remota`.

---

## 30. Una clave de i18n inexistente pasa verde en toda la suite

**Síntoma**: en producción se ve la ruta de la clave en pantalla
(`serverRegistration.toasts.algo`) en lugar del texto. Ningún test falló.

**Causa**: `apps/web/src/test/setup.ts` mockea `vue-i18n` con `t: (key) => key`. Un `t()` con una
clave mal escrita, o que quedó apuntando a un bloque que se movió de sitio, devuelve la clave —que
es exactamente lo que el test espera ver— y pasa. El mock no puede distinguir una clave buena de
una inexistente: para él todas son iguales.

**Fix**: un guard que lea el archivo fuente y resuelva cada clave contra los dos locales.
`apps/web/src/views/__tests__/participantRegistrationI18nKeys.test.ts` es la plantilla:

```ts
const keys = [...source.matchAll(/\$?t\(\s*'([a-zA-Z0-9_.]+)'/g)].map((m) => m[1]);
// cada clave tiene que resolver a string en es.json Y en en.json
```

Va con un caso que comprueba que se encontraron claves: si el regex deja de casar, la aserción
sobre el conjunto vacío pasaría igual.

**Auditar el repo**: mover un bloque de claves de sitio es el disparador típico —
`grep -rn "t('<prefijo-viejo>" apps/web/src` después de cualquier reorganización de locales.

**Casos**: 2026-09-08, al mover `emailLookup.errors` → `errors` en el registro público.

---

## 31. Un módulo con `import.meta` es invisible para Jest — y su lógica nunca se prueba

**Síntoma**: al escribir el primer test de un módulo del API, Jest falla antes de correr nada:

```
Test suite failed to run
Jest encountered an unexpected token
  > 2 | import { BaseMigrationManager } from './base-migration-manager';
```

El cursor apunta a un `import` normal, así que parece un problema de configuración de rutas. No lo
es: el módulo importado —o alguno de los suyos— usa **`import.meta`**, que la transformación a
CommonJS de ts-jest no puede parsear. El caso típico es el par que reconstruye `__dirname` en ESM:

```ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```

**Cómo comprobarlo**: `grep -rln "import\.meta" apps/api/src --exclude-dir=tests`. A 2026-09-08
son dos archivos: `index.ts` y `database/base-migration-manager.ts`.

**Lo que de verdad importa no es el error, es lo que el error esconde.** Un módulo que Jest no
puede importar es un módulo que **nadie testea**, y eso no se nota: no hay rojo, no hay cobertura
que baje, simplemente ningún test lo menciona jamás. `base-migration-manager.ts` —el runner que
aplica todas las migraciones— estuvo así desde siempre, y ahí vivía el bug de que el runner
ignoraba el `transaction = false` de cada migración (ver skill `sqlite-migrations`).

**Fix**: sacar la lógica pura a un módulo propio, sin `import.meta`, e importarlo desde el módulo
ESM y desde el test. Es lo que hace `database/transaction-policy.ts`. El módulo ESM en sí sigue
sin poder importarse, así que su **cableado** se comprueba leyendo el fuente
(`migrationRunnerTransactionFlag.test.ts`, capa 3).

> Y la lección que va con esto: **un guard que lee texto no prueba comportamiento.**
> `sqliteSafePattern.simple.test.ts` exigía `transaction = false` en cada migración con
> `DROP TABLE` y llevaba meses en verde mientras el runner ignoraba la propiedad. Un guard de
> texto sirve para fijar una convención; no para creer que la convención hace algo. Si el
> comportamiento se puede ejecutar, tiene que haber un test que lo ejecute — aunque haya que
> extraer un módulo para conseguirlo. Ver también el *antipatrón del mirror* en
> `timezone-handling`: el test que replica la implementación en vez de llamarla.

## Cómo agregar un bug nuevo a este skill

Cuando descubras un bug recurrente:

1. Agregá una fila en la **tabla del índice** con el síntoma exacto que el usuario reporta.
2. Agregá una sección numerada con: **Síntoma**, **Causa**, **Fix** (código), **Auditar el repo** (grep), **Casos** (fecha + archivo), **Detalle** (link a skill o `CLAUDE.md`).
3. Si el bug merece más de 100 líneas o tiene flujo de recuperación complejo, creá un skill dedicado y aquí dejá solo el resumen + link.
4. Guardá una memoria de feedback en `~/.claude/projects/-Users-lbolanos-Developer-personal-emaus/memory/` para que persista entre sesiones.
5. Si afecta el código activamente (no solo es histórico), también documentalo en `CLAUDE.md` para que se cargue en cada sesión sin necesidad de invocar el skill.

## Skills relacionados (detalle profundo)

- `safari-ios-compatibility` — full detalle del bug Safari iOS.
- `sqlite-migrations` — patrón seguro de recreate-table, recuperación, plantillas.
- `timezone-handling` — helpers, patrón configurable por casa+retiro, tests TZ-aware.
- `vue-best-practices` — Composition API, `<script setup>`, TypeScript.
- `vue-pinia-best-practices` — stores, reactividad, setup pattern.
- `webapp-testing` — Playwright local, screenshots, logs.
- `security-best-practices` — CORS, XSS, CSRF, rate limiting, OWASP Top 10.

<!-- El #31 ("Un módulo con `import.meta` es invisible para Jest") vive en master, de otra rama.
     Esta sección arranca en 32 para no colisionar al fusionar. -->

## 32. Un mismo campo con varios criterios que se contradicen

**Síntoma**: dos pantallas discrepan sobre el mismo registro. El usuario lo cuenta como *"aquí me
dice que ya recibió y en la ficha dice pendiente"*, o *"el total no me cuadra con los que veo en
la lista"*. Nada falla: cada pantalla es coherente consigo misma.

**Causa**: una columna de texto libre que en la práctica guarda un dato estructurado, y cada sitio
que la lee inventó su propia interpretación. Caso real (`retreat_participants.palancasReceived`,
columna `TEXT` cuyo placeholder invitaba a mezclar — *"Cantidad o descripción de palancas
recibidas"*), con **tres** criterios vivos a la vez sobre las mismas filas:

| Dónde | Criterio | Con `"tres cartas de su mamá"` |
| --- | --- | --- |
| `EditParticipantForm.vue` | `Number(raw) > 0` | «Pendiente» (NaN > 0 es false) |
| `RetreatDashboardView.vue` (recibidas) | texto no vacío | «Recibidas» |
| `RetreatDashboardView.vue` (total) | `parseInt`, NaN suma 0 | no la cuenta |

Los tres son defendibles por separado. Juntos, la misma ficha está recibida y pendiente al mismo
tiempo, y desaparece del total sin que nadie lo note.

**Cómo encontrarlos**: buscar todos los lectores del campo, no sólo el que reportaron.

```bash
grep -rn 'palancasReceived' apps/web/src apps/api/src packages | grep -v '\.test\.'
```

Si aparecen dos expresiones distintas para decidir lo mismo (`Number(x) > 0`, `x.trim() !== ''`,
`parseInt(x)`), ya hay bug aunque nadie lo haya reportado todavía.

**Fix**: un helper compartido en `@repo/utils` y **todos** los lectores llamándolo. No basta con
crear el helper: si los sitios viejos siguen con su expresión, sólo se añadió un cuarto criterio
— y es fácil darlo por hecho al escribir el resumen (memoria:
`feedback_verify_summary_claims_against_diff`).

Tres decisiones que importan al escribirlo:

1. **Estricto, no permisivo.** `parsePalancasCount('3 de la mamá')` devuelve `null`, no `3`. Un
   `parseInt` laxo *parece* más útil y es justo cómo nace el criterio siguiente.
2. **"Sin capturar" es un estado propio.** `unknown` (hay texto que no se puede leer) no es `none`
   (no ha recibido). Colapsarlos es el bug original. Cuatro estados, no tres.
3. **Migrar el dato sin tocarlo.** Columna nueva `palancasReceivedCount` (integer) y backfill que
   rellena sólo donde el texto es un entero limpio, deja `NULL` el resto y **no reescribe el
   texto**. Así el backfill no puede perder información y correrlo dos veces no cambia nada
   (`WHERE palancasReceivedCount IS NULL`, que además protege una corrección manual posterior).

**El test tiene que incluir el caso que discrimina.** Un fixture con `"tres cartas de su mamá"`
pasa igual con el criterio estricto y con el laxo, porque `parseInt` da `NaN` en los dos. El que
separa un criterio del otro es **un texto que empieza con dígito** (`"3 de la mamá"`). Verificado
con un control negativo: relajando el helper a propósito, el test que sólo tenía la prosa siguió
verde y el que tenía `"3 de la mamá"` se puso rojo. Corolario general: **un fixture que no
distingue las dos implementaciones no prueba el criterio**, aunque el test se llame como si lo
hiciera.

> **Al desplegar**: unificar criterios cambia algún número que el usuario ya conocía. Avisarlo y
> mostrar el desglose de la diferencia (aquí, un contador aparte de "Cartas sin capturar"); si no,
> el número correcto se lee como un bug nuevo.

Guards: `apps/api/src/tests/services/palancasMilestone.test.ts` (el helper),
`apps/web/src/components/__tests__/palancasSingleCriterion.test.ts` (que formulario y dashboard
coincidan sobre las mismas fichas),
`apps/api/src/tests/migrations/addPalancasCountAndThreshold.test.ts` (el backfill no pierde nada).

