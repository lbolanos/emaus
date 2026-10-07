# Tasks: palancas-quick-phone-edit

Convención: al cerrar cada milestone se marcan los items y se añade una línea `**Done**:`
con fecha. Toda desviación del plan va en una sección `### Desviaciones <fecha>` al pie del
milestone correspondiente.

## M0 — worktree + specs SDD

- [x] Branch `palancas-quick-phone-edit` + worktree `.claude/worktrees/palancas-quick-phone-edit`
- [x] `pnpm install` + copia de `apps/api/.env` + `pnpm --filter @repo/ui build`
- [x] `spec.md` (problema, decisiones fechadas, R1-R8, CA1-CA12, fuera de alcance)
- [x] `research.md` (anclas del código pre-M1)
- [x] `plan.md` (M0-M4 con verificación)
- [x] `tasks.md`
- [x] Commit `docs(specs): ... (M0)`

**Done**: 2026-10-07.

## M1 — backend `PATCH /participants/:id/phones`

- [x] `updateParticipantPhonesSchema` en `packages/types/src/index.ts`
- [x] Ruta PATCH con `participant:update` + `requireRetreatAccess` en `participantRoutes.ts`
- [x] `updateParticipantPhones` controller (validación por país, semántica de vacío, 404/400/403)
- [x] `updateParticipantPhones` service (canonización `toNationalPhone`, audit allowlist 3 campos)
- [x] Suite Jest: happy, `+52`/`044` canonizan, inválido 400 por campo, `''` EC1 400 / EC2 null,
      403 permiso, 403 retreat ajeno, audit row — 27 tests en 3 archivos: controller (9, unitario
      con mocks), service (6, unitario con mocks) y route wiring con supertest + DB de test (12:
      401/403/403, strip de campos extra por `assignParsedBody`, canonización verificada en DB,
      `''` EC2 → NULL, 404 cross-retreat)
- [x] `pnpm --filter api exec tsc --noEmit` — 143 errores, todos preexistentes de master
      (baseline verificado al cerrar M1); ninguno en líneas nuevas
- [x] Commit `feat(api): ... (M1)` — d61d76dc

**Done**: 2026-10-07.

### Desviaciones 2026-10-07 (M1)

1. **tsc con 143 errores preexistentes**: el plan pedía "tsc limpio"; master ya falla tsc con
   esos 143 errores (baseline). Criterio aplicado: no sumar errores nuevos (verificado por
   conteo y por archivo).
2. **Import de `retreatService.findById` estático, no dinámico**: el controller resuelve el país
   con import estático (como `shirtReportService`), no con `await import` (patrón de
   `createParticipant`). Motivo: `jest.config.json` tiene `resetModules: true`; el import
   dinámico dentro del handler re-carga `retreatService` después del reset y devuelve un
   `AppDataSource` fresco que los tests de integración nunca swapearon a la DB de test →
   `EntityMetadataNotFoundError`. Con import estático el binding pertenece al registry #1 que
   `setupTestDatabase` sí swapea.
3. **Service resuelve sus repos perezosamente** (`AppDataSource.getRepository(...)` dentro de la
   función, no el `participantRepository` module-level): el repo module-level se crea antes del
   swap de los tests de integración e hidrata con clases de otro registry ("Class constructor
   Participant cannot be invoked without 'new'", misma limitación documentada en
   `shirtOrderConfirmation.routes.simple.test.ts`). En prod no cambia nada (mismo
   `AppDataSource`); el patrón ya existía en `syncRetreatFields`.
4. **Test de wiring extra** (`participantPhones.routes.simple.test.ts`): el plan pedía solo la
   suite del endpoint; se partió en 3 (controller/service/route) siguiendo la convención del
   repo, y el route test validó de paso el strip de campos por `assignParsedBody` (CA del M2
   adelantado a nivel backend).

## M2 — editor + tabla

- [x] `updateParticipantPhones` en `apps/web/src/services/api.ts`
- [x] Action `updateParticipantPhones` en `participantStore.ts` (optimista + rollback + valores
      canónicos)
- [x] `ParticipantQuickPhoneEditor.vue` (popover manual, 3 campos, validación país, payload
      cambios-only, gate permiso, `saved`/`close`)
- [x] Prop `inlinePhoneEdit` (withDefaults false) + celda cellPhone con ✏ en `ParticipantList.vue`
- [x] `PalancasView.vue`: columna `cellPhone` + `inline-phone-edit`
- [x] `pnpm --filter web exec vue-tsc --noEmit` limpio
- [x] Vitest de regresión: ParticipantList (65) + paridad campo/control + EditParticipantForm +
      cobertura de locales — 85/85
- [x] Commit `feat(web): ... (M2)` — c90d42fe

**Done**: 2026-10-07.

### Desviaciones 2026-10-07 (M2)

1. **Claves i18n del editor adelantadas a M2** (el plan las tenía en M3): el componente las
   necesita para renderizar; se agregaron `participants.quickPhones.*` en es.json Y en.json.
2. **Mensajes de formato inválido en español directo** vía `phoneValidationMessage`
   (`@repo/types`), no claves i18n por mensaje: es el mismo contrato que usa el wizard público
   (ParticipantRegistrationView), que ya muestra esos mensajes en español. La única clave
   propia nueva para errores es `requiredEmpty`.
3. **`cellPhone` también en `nonEditableColumns` de PalancasView**: la columna entra a la
   tabla con ✏, pero NO como campo editable del form del diálogo (evita que el PUT genérico
   sin validación de teléfono la toque por esa vía; el diálogo la corrige el mini-editor de M3).
4. **Tests de Vitest del editor/wiring corren en M3** como estaba planeado; en M2 se corrió la
   suite de regresión existente (85/85) para confirmar que la prop y la columna no rompen
   ParticipantList ni la paridad campo/control.

## M3 — diálogo + i18n + tests

- [x] ✏ en header palancas de `EditParticipantForm.vue` + `participant-patched`
- [x] Claves i18n es+en completas (labels, botones, errores, toasts) — adelantadas a M2
- [x] Vitest editor: permiso, validación bloquea, payload cambios-only, rollback — 8/8
- [x] Vitest wiring EditParticipantForm (montaje palancas + re-emit `participant-patched`) — 10/10
- [x] Vitest wiring ParticipantList: default sin ✏ + con prop abre seeded de la fila — 67/67
- [x] `pnpm --filter web exec vue-tsc --noEmit` limpio
- [x] Commit `feat(web): ... (M3)` — a102497b

**Done**: 2026-10-07.

### Desviaciones 2026-10-07 (M3)

1. **Los tests cazaron 2 bugs reales del editor de M2** (ambos corregidos en el propio M3 antes
   del commit):
   - **Autofocus roto**: los string refs dentro de `v-for` se recogen en un array (Vue 3), así
     que `firstInput.value` era `[input]` y `.focus()` lanzaba TypeError asincrónico en cada
     apertura. Fix: function ref `setFirstInput`.
   - **`validate()` nunca pasaba**: retornaba `Object.keys(errors).length === 0`, pero `errors`
     es un Record con las 3 claves siempre presentes (string vacío = sin error) → el guardado
     quedaba bloqueado para siempre (bug de M2 que el navegador habría cazado en M4). Fix:
     `Object.values(errors).every(m => m === '')`.
2. **Wiring de ParticipantList: `createTestWrapper` no sirve para probar props** — descarta las
   options.props y además crea/activa SU propia pinia, así que los stores que siembra el test y
   los que lee el componente (montado con otra pinia) son instancias distintas. Los tests de
   wiring montan con `mount()` directo + `setActivePinia(pinia)` explícito (molde
   "Control de confirmación de asistencia" del mismo archivo). Añadido `Pencil` al mock local
   de lucide (el editor real lo importa; el mock local reemplaza al global).
3. **Editor real (no stub) en el wiring de la tabla**: para validar de paso que la celda le
   pasa fila y país correctos al abrir el popover (seed del input `#qp-cellPhone`).

## M4 — verificación + docs

- [x] tsc + vue-tsc + jest + vitest + `pnpm build` api/web — tsc api: 143 errores, baseline
      exacto de master (sin nuevos); vue-tsc limpio; jest M1 27/27 (una sola corrida); vitest
      web completo: 210 archivos / 3161 passed | 2 skipped; builds de api y web OK (solo
      warning preexistente de chunk size en web)
- [x] Correr `dist/index.js` del API (o grep `__dirname`) — grep: 2 ocurrencias, ambas el
      `const __dirname` local ESM derivado de `import.meta.url` (static serving preexistente
      del web); sin el global CJS que crashea el bundle
- [x] Navegador: CA7-CA12 en worktree — `API_PORT=3003 WEB_PORT=5175` (3002 ocupado por el
      worktree de otra sesión); confirmado por curl que 5175 sirve ESTE worktree
      (`inline-phone-edit` en PalancasView.vue servido). CA7 (columna + ✏), CA8 (corrección
      sin recarga; flujo de guardado OK tras el fix de `validate()`), CA9 (diálogo + header y
      colapsable EC refrescados en caliente por `participant-patched`; diálogo de Caminantes
      sin ✏), CA10 (EC2 vacío→valor→vacío, persistido y seedeado al reabrir), CA11 (`+52
      5644571015` canonizó a nacional en la fila; `123` bloqueado con mensaje, sin request)
      verificados en navegador. CA12 cubierto por unit tests (ver desviaciones). Extras:
      autofocus del primer input (fix `setFirstInput`), Guardar disabled sin cambios, consola
      limpia (solo 403 telemetry + warning `DialogContent` preexistentes)
- [x] `docs/features/palancas-quick-phone-edit.md` (con limitación de snapshots)
- [x] Reconcile del spec a modo retroactivo (estado "implementado" + sección Reconcile)
- [x] Commit `docs(features): ... (M4)`

**Done**: 2026-10-07.

### Desviaciones 2026-10-07 (M4)

1. **CA12 verificado por unit tests, no en navegador**: la dev DB no tiene una cuenta con rol
   sin `participant:update` (Leonardo es superadmin) y crear una solo para la verificación
   tocaba datos de más. El gate del editor (Vitest M3: sin permiso no renderiza el ✏) y el
   403 de la ruta (Jest M1) cubren el criterio por las dos capas. El plan ya contemplaba este
   fallback («si no hay cuenta menor en dev, cubrir con los unit tests y documentarlo»).

## Cierre

- [ ] Merge a `master` (tras visto bueno de Leonardo)
- [ ] Demo al equipo si aplica
