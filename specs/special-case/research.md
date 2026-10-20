# Research: «Caso especial» del caminante

> SDD research — versión 1.0 (2026-10-15). Estado del código relevante, verificado el
> 2026-10-15 sobre `1ee9d3ce` (tope de master al cerrar el PR #8). master avanzó después a
> `781875e8` (deploy atómico #9, fix de retreat access en table routes, fix web letters-met) —
> re-verificar las líneas citadas al codear M1: pueden haberse movido.

## Quién tiene `participant:health` (verificado por migración, no por grep de permisos)

- `20260914130000_AddParticipantHealthPermission.ts`: crea el permiso y lo concede a
  **superadmin, admin, treasurer, logistics** (el comentario lo dice explícito:
  "no a `communications` ni a `regular_server`").
- `20261007100000_GrantParticipantHealthToCommunications.ts`: lo agrega a **communications**
  ("el equipo de comunicaciones/palancas es quien contacta a las familias y quien conoce los
  problemas de los caminantes"). `regular_server` sigue fuera.

Conclusión para D2: el caso especial lo ven esos 5 roles; `regular_server` no. Quien marca
(communications) y quien atiende (admin) están dentro.

## El régimen de salud existe de punta a punta en el backend (no es solo UI)

`SENSITIVE_HEALTH_FIELDS` (`packages/types/src/permissions.ts:58-76`):

- **GET lista**: `participantController.ts:164-167` strippa los campos si el caller no tiene
  `participant:health`; idem ficha en `:199-202`.
- **PUT**: `participantController.ts:666-676` → 403 con la lista de `fields` prohibidos si el
  body trae alguno. El comentario (`:663-665`) aclara que **valores vacíos cuentan** (`''`,
  porque esta ruta usa `validateRequest` sin `assignParsedBody` y el body crudo llega entero).
- **Respuesta del update**: strippa en `:684`.
- **Otros payloads**: `retreatParticipantController.ts:33-41`
  (`stripHealthFromRetreatParticipants`, aplicado en `:180` y `:224` — **solo strippa
  `.participant`, no la fila rp: hueco a cerrar**) y `retreatBedController.ts:23-27`.
- **UI**: `ParticipantList.vue:417-424` (`HEALTH_COLUMN_KEYS` → `isColumnAllowed` `:511-515`) y
  `BulkEditParticipantsModal.vue:76`.

**Precedente exacto de campo sensible per-retiro overlaid**: `notes` — vive en
`retreat_participants` (select `participantService.ts:842`, overlay `:894`, escritura
`rpUpdates :3239`) y está en la lista sensible. El patrón que vamos a copiar funciona hoy.

## Camino de escritura (el de paysAtHouse / la beca)

`PUT /participants/:id` (`participantRoutes.ts:106-111`, `requirePermission('participant:update')`
+ `validateRequest` sin `assignParsedBody` → el body crudo llega al controller con
`contextRetreatId` incluido):

- `updateParticipant` (`participantService.ts`): destructure de campos per-retiro (~3017+),
  `effectiveRetreatId = contextRetreatId || participant.retreatId` (~3059-3062), `rpUpdates`
  (~3150+), higiene molde beca: `isScholarship === true → rpUpdates.paysAtHouse = false`
  (~3157-3165, incondicional por el re-envío del DTO hidratado), `oldAuditSnapshot` (~3132) y
  virtuales del retorno (~3369+).
- **Gate zod**: `updateParticipantSchema = participantSchema.partial()`
  (`packages/types/src/index.ts:908+`); un campo no declarado se strippea antes del servicio.
  El preprocess convierte `null`/`''` a `undefined` pero **conserva `false`** → el toggle a
  false pasa (lección del PR #8).

## Audit

`PARTICIPANT_AUDIT_FIELDS` (`participantService.ts:44-57`) es la allowlist de `logUpdate`
(`:3490-3499`), que compara contra `oldAuditSnapshot` (~3130-3138). Los campos nuevos van en
**dos** lugares: el array y el snapshot. Deuda adyacente (NO tocar aquí): `paysAtHouse` está en
el snapshot pero fuera del array, así que su diff nunca se audita.

## Hidratación de virtuales per-retiro

- Overlay de `findAllParticipants`: `select` explícito (~813-844; columna omitida = virtual
  siempre false) + asignación (~856+).
- `participantRetreatHydration.ts` (`:33-52` rama con rp, `:119` rama sin rp).
- `savedSegmentService.evaluateFilters` (~109) hidrata `paysAtHouse` en lote — fuera de alcance
  aquí (no exponemos la marca en segmentos), pero el contador del dashboard NO depende de eso:
  computa del listado.

## Frontend

- **Molde del toggle inline**: `ParticipantPaysAtHouseToggle.vue` (componente autocontenido:
  gate `useAuthPermissions().hasPermission('participant:update')`, payload con
  `contextRetreatId: retreatStore.selectedRetreatId`, refetch, `emit('saved')`). El nuevo agrega
  el gate `participant:health` y reemplaza `window.confirm` por un `Dialog` de `@repo/ui`
  (categoría obligatoria + nota opcional). Ojo DropdownMenu+Dialog → skill troubleshooting; es
  botón directo, no dropdown.
- `ParticipantList.vue`: flags por vista (`inline-phone-edit`, `inline-pays-at-house-toggle`,
  `:105-121`); cadena de celdas especiales por `colKey` — el toggle pays-at-house vive en la
  celda `lastPaymentDate` (`:1979-1982`) **antes** del default (`:1984`); el nuevo badge/acción
  va en celda propia (nombre o apellido) sin tocar esa rama. `PalancasView.vue` enciende los
  flags (`:31-33`).
- **Dashboard**: `RetreatDashboardView.vue` ya hidrata participantes
  (`participantStore.fetchParticipants` `:1702-1705`); la tarjeta Palancas (`:846-905`) cuenta
  del store → tarjeta nueva igual, **gated** `hasPermission('participant:health')`
  (`useAuthPermissions` ya presente `:1299-1302`) porque el dashboard lo ven todos los roles del
  retiro (`router/index.ts:344-350`, solo `requiresRetreat`). Tarjetas configurables:
  `dashboardSettingsStore.ts` — `SectionKey` (`:3-17`), `loadOrderFromStorage` **appendea**
  secciones nuevas (`:82-99`) → retrocompatible con localStorage existente.
- **Router/sidebar**: ruta hija del retiro hermana de `palancas` (`router/index.ts:266-271`) con
  `meta.requiresPermission: 'participant:health'` (el guard `:740-757` ya soporta ese permiso —
  mismos gates que `food`/`medicines-report` `:296-331`). Ítem de sidebar en `communications`
  tras `palancas` (`Sidebar.vue:941-948`) con `permission: 'participant', permissionOperation:
  'health'` (molde `medicines-report` `:991-999`). Badge contador opcional en `ITEM_BADGE`
  (`:468-475`).
- **Bandeja**: plantilla `WalkerView.vue` (regla de frontend.md para list views). Contacto:
  `MessageDialog` hidratado del listado, montado sin `v-if`, con `filters` reseteados (reglas de
  frontend.md).
- **i18n**: key ausente = key cruda pintada; TODA key nueva en `es.json` Y `en.json`.
- **Íconos**: `Flag` existe en lucide-vue-next 0.363.0 (verificado) → allowlist en
  `apps/web/src/test/setup.ts`; `AlertTriangle` ya está (`:451`). Un ícono sin allowlist rompe
  `mount()`.

## Migraciones — patrón canónico

Molde directo: `20261015120000_AddPaysAtHouseToRetreatParticipants.ts` (guard
`PRAGMA table_info` + ADD COLUMN; down con DROP COLUMN nativo, SQLite ≥ 3.35). Y sumar las
columnas al CREATE TABLE de `20250910163337_CreateSchema.ts` (~154, junto a `paysAtHouse`) para
DBs frescas. ADD COLUMN puro = plantilla simple del skill `sqlite-migrations`, sin
`transaction = false`.

## Tests existentes a extender

- Backend: `tests/services/paysAtHouseWritePath.test.ts` (write path),
  `tests/controllers/healthDataExposureGuards.test.ts` (strip/403),
  `tests/controllers/participantHealthAudit.test.ts` (audit),
  `tests/services/crossRetreatPayments.test.ts` (overlay per-retiro).
- Web: `components/__tests__/ParticipantPaysAtHouseToggle.test.ts` (componente con mock de
  axios), `Sidebar.test.ts`, `ParticipantList.test.ts`.
- E2E: `apps/web/tests/e2e/pays-at-house.spec.ts` (overlay GET + PUT abortado asertado) y
  `participant-health-permission-guard.spec.ts` (quitar permiso en el navegador con
  `page.route`).

## Trampas catalogadas que aplican aquí

- `select` explícito del overlay: columna no listada = virtual siempre undefined/false (badge
  fantasma / contador en 0).
- Destructure + zod: campo sin declarar = toggle silenciosamente no persiste.
- Re-envío del DTO hidratado por la UI → los guards `=== undefined` nunca disparan; la higiene
  debe ser explícita (`specialCase === false`).
- Esta ruta NO usa `assignParsedBody`: los valores vacíos (`''`) cuentan para el 403 de salud.
- Ícono lucide sin allowlist; key de i18n en un solo idioma; prop booleana sin `withDefaults`
  (frontend.md).
- Una sola corrida de jest a la vez (SQLITE_MISUSE fantasma); suite completa con shards
  secuenciales + `--max-old-space-size` al MAIN (`npx jest` directo).
