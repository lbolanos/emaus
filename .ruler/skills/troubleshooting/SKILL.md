---
name: troubleshooting
description: MUST be used cuando el usuario reporta cualquier bug, error o comportamiento inesperado en el proyecto Emaús. Índice maestro de bugs recurrentes con síntoma → causa → fix. Cubre UI congelada (reka-ui), página blanca en Safari iOS, fechas que saltan un día (TZ CDMX), checkbox sin reacción, Set/Map no reactivos, migrations SQLite que borran data silenciosamente, tap-to-assign en móvil, tests Vue con defineModel, mocks Jest con ESM, tests 403, y más. Triggers — "se congela", "no responde", "página en blanco", "Safari", "iPhone", "fechas saltan", "un día antes", "checkbox no funciona", "no marca", "migration borró", "perdió data", "tap no responde", "no asigna en móvil", "test falla", "ReferenceError mock", "Cannot access before initialization", "vue-i18n", "stack overflow", "Maximum call stack".
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

---

## 1. reka-ui Dialog/DropdownMenu congela la UI

**Síntoma**: tras cerrar un `DropdownMenu` que abre un `Dialog`/`AlertDialog`/`Sheet`/`Drawer` de `@repo/ui`, ningún click responde. DevTools muestra `pointer-events: none` u `overflow: hidden` huérfano en `<body>`.

**Causa**: reka-ui (port de Radix) inyecta `pointer-events: none` en `<body>` por unos ms al cerrar un overlay. Si un Dialog abre en ese mismo tick, hereda el body bloqueado.

**Tres reglas obligatorias**:

```vue
<!-- Regla 1: usar @select + deferOpen, NO @click -->
<DropdownMenuItem @select="deferOpen(() => showXDialog = true)">…</DropdownMenuItem>
```

```ts
// Regla 2: restoreBodyOverflow DEBE limpiar pointerEvents
function restoreBodyOverflow() {
  if (document.querySelectorAll('[role="dialog"][data-state="open"]').length > 0) return;
  if (document.querySelectorAll('[role="menu"][data-state="open"]').length > 0) return;
  if (document.body.style.overflow === 'hidden') document.body.style.overflow = '';
  if (document.body.style.paddingRight) document.body.style.paddingRight = '';
  if (document.body.style.pointerEvents === 'none') document.body.style.pointerEvents = ''; // ← crítico
  document.body.removeAttribute('data-scroll-locked');
}

// Regla 3: confirm/save cierra el dialog ANTES del await pesado
async function confirmX() {
  const ctx = xContext.value;
  showXDialog.value = false;        // ← cerrar primero
  xContext.value = null;
  try { await store.heavyReload(ctx.id); }
  catch (e) { toast({ title: 'Error', variant: 'destructive' }); }
}
```

**Excepción**: si el "dialog" es `<Teleport>` custom (no reka-ui), no aplica. La mayoría de modales del repo son Teleports.

**Auditar el repo**:
```bash
grep -rn 'DropdownMenuItem @click' apps/web/src/ | grep -v 'deferOpen'
grep -rn -B 8 '} finally {' apps/web/src/views/ | grep -B 6 'Dialog.value = false'
```

**Casos**: 2026-05-14 en `apps/web/src/views/InventoryView.vue` — historial y delete congelaban UI.
**Detalle**: `CLAUDE.md` sección "reka-ui Dialog/DropdownMenu — UI congelada".

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
