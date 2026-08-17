---
name: troubleshooting
description: MUST be used cuando el usuario reporta cualquier bug, error o comportamiento inesperado en el proyecto Emaús. Índice maestro de bugs recurrentes con síntoma → causa → fix. Cubre UI congelada (reka-ui), página blanca en Safari iOS, fechas que saltan un día (TZ CDMX), checkbox sin reacción, Set/Map no reactivos, migrations SQLite que borran data silenciosamente, tap-to-assign en móvil, registro que no avanza de paso por el autofill del celular, tests Vue con defineModel, mocks Jest con ESM, tests 403, y más. Triggers — "se congela", "no responde", "página en blanco", "Safari", "iPhone", "fechas saltan", "un día antes", "checkbox no funciona", "no marca", "migration borró", "perdió data", "tap no responde", "no asigna en móvil", "no me deja avanzar", "no avanza el registro", "el botón Siguiente no hace nada", "dice que el teléfono no es número", "test falla", "ReferenceError mock", "Cannot access before initialization", "vue-i18n", "stack overflow", "Maximum call stack".
---

# Troubleshooting — bugs recurrentes del proyecto Emaús

Cuando el usuario reporta un problema, primero ubicá el **síntoma** en la tabla, luego saltá a la sección detallada. Cada bug tiene un skill dedicado o sección de `CLAUDE.md` con más profundidad — los enlaces están al final de cada sección.

## Índice por síntoma

| El usuario dice... | Saltá a |
| --- | --- |
| "se congela la UI", "no responde después de cerrar el menú", "tengo que recargar", "pointer-events none" | [#1 reka-ui Dialog/DropdownMenu](#1-reka-ui-dialogdropdownmenu-congela-la-ui) |
| "página en blanco en iPhone/iPad", "Safari crashea", "Maximum call stack" en móvil | [#2 Safari iOS blank page](#2-safari-ios-blank-page) |
| "las fechas salen un día antes", "el picker arranca el día previo", "el min/max del input está mal" | [#3 Timezone CDMX salta un día](#3-timezone-cdmx-salta-un-día) |
| "el checkbox no marca", "no responde al click", "queda en otro estado" | [#4 Checkbox reka-ui ignora :checked](#4-checkbox-reka-ui-ignora-checked) |
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

## 4. Checkbox reka-ui ignora :checked

**Síntoma**: un checkbox renderiza pero no responde al click, o muestra el estado equivocado.

**Causa**: reka-ui `CheckboxRoot` usa la prop `modelValue`, no `checked`. El emit es `update:modelValue`, no `update:checked`. Si pasás `:checked="bool"`, reka-ui lo ignora y el atributo cae como HTML attr en el `<button>` interno.

```vue
<!-- ❌ MAL: cualquier valor de :checked se ignora -->
<Checkbox :checked="row.selected" @update:checked="toggle(row.id)" />

<!-- ✅ BIEN -->
<Checkbox :model-value="row.selected" @update:model-value="toggle(row.id)" />
```

**Auditar el repo**:
```bash
grep -rn 'Checkbox.*:checked' apps/web/src/
grep -rn 'Checkbox.*@update:checked' apps/web/src/
```

> Hay componentes en el codebase que aún usan `:checked` (bug latente). Cuando los toques, migralos a `:model-value`.

---

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
