# participant:health — la ficha de salud detrás de su propio permiso

La ficha del participante guarda datos sensibles que no necesita todo rol que debe "ver la
lista". `participant:read` lo tiene hasta `regular_server` — roles de servicio que trabajan la
logística — así que la salud vive en una operación aparte: `participant:health`.

## Qué se protege exactamente

La lista canónica es `SENSITIVE_HEALTH_FIELDS` en `packages/types/src/permissions.ts`
(`@repo/types`), compartida por el gate del API y por el filtro de columnas y formularios de la
web: si divergen, el formulario ofrece un campo cuyo guardado el API rechaza con 403.
Son `medicationDetails`,
`medicationSchedule`, `dietaryRestrictionsDetails`, `disabilitySupport`, `notes` y los dos
contactos de emergencia completos (`emergencyContact1*` / `emergencyContact2*`: nombre,
relación y todos los teléfonos y correos).

**Fuera a propósito**: `snores`, `hasMedication` y `hasDietaryRestrictions` son booleanos que
la asignación de camas necesita y no tienen ruta protegida; `sacraments` es un dato religioso,
no de salud. Se protege el detalle libre y los contactos, no las banderas operativas.

## Quién la ve

La migración `apps/api/src/migrations/sqlite/20260914130000_AddParticipantHealthPermission.ts`
crea el permiso y lo asigna a **superadmin, admin, treasurer y logistics** (idempotente:
`INSERT OR IGNORE` en `permissions` + chequeo por rol en `role_permissions`). Superadmin
además bypasea el check del router web.

Desde el 2026-10-07, **communications** también lo tiene
(`20261007100000_GrantParticipantHealthToCommunications.ts`): el diseño
original lo excluía ("no necesita la ficha médica"), pero en la operación el equipo de
comunicaciones/palancas es quien contacta a las familias y quien conoce los problemas de los
caminantes — sin contactos de emergencia no puede trabajar (reporte 2026-10-07, communications
en Buen Despacho). `regular_server` sigue fuera, como en el diseño original.

Quien solo tiene `participant:read` recibe la ficha sin las columnas de salud: el filtrado es
**server-side** (`stripSensitiveHealthFields`), no una cortesía del frontend. Desde el mismo
cambio el gate también aplica en **escritura** sobre `PUT /participants/:id`
(`updateParticipant`): si el body trae algún campo de salud y el caller no tiene el permiso,
responde **403** con `fields: [...]` y no guarda nada — ni siquiera el resto del body. No es un
strip silencioso como `scholarshipAmount`: un 200 con el campo descartado hacía que la nota
escrita se perdiera sin aviso.

Un campo de salud **vacío** (`null` o `''`) también cuenta, y es el caso más peligroso: en esta
ruta `validateRequest` solo valida (no usa `assignParsedBody`), así que el preprocess
`null`/`''` → `undefined` de `updateParticipantSchema` queda en la copia parseada y al servicio
llega el body crudo. Ahí `notes: ''` se guarda como `NULL` y `medicationDetails: null` vacía la
columna: sin el gate, un cliente que reenvía la ficha con esas claves vacías borraría datos que
el usuario ni siquiera ve.

El frontend no debe llegar a ese 403: `ParticipantList.vue` filtra con `isColumnAllowed` tanto
las columnas de la tabla como las del formulario de edición, y `BulkEditParticipantsModal.vue`
solo ofrece los campos de salud cuyas columnas le llegan. Antes del fix, las columnas de
formulario que pasa cada vista (`columnsToShowInForm`/`columnsToEditInForm`) se saltaban el
filtro, y `CancellationAndNotesView`/`NotesAndMeetingPointsView` mostraban `notes` a quien no
tenía el permiso.

Alcance del gate de escritura: solo ese endpoint. El alta (`createParticipant`, registro
público) escribe salud por diseño, `PUT /participants/self` solo toca la ficha propia, y la
importación por Excel (`participantService.ts`, rama `isImporting`) no está gateada por este
permiso.

## El set combinado global + rol del retiro

El permiso puede llegar por rol **global** o por **rol en el retiro activo**; el API evalúa el
set combinado (`authorizationService.hasPermission`). El frontend tiene que hacer exactamente
lo mismo, o muestra menos de lo que el usuario puede usar.

Bug cerrado (2026-09): el sidebar filtraba "Comida" y "Reporte de medicinas" con los permisos
del retiro solamente y los ocultaba a usuarios con el permiso **global** — aunque entrando por
URL las vistas sí cargaban, porque el guard del router mira el set combinado. El check
unificado vive en `filteredMenuSections` (`apps/web/src/components/layout/Sidebar.vue`): los
ítems con `permission` + `permissionOperation` pasan por `canAccessResource`, sobre el mismo
set combinado.

## Superficies protegidas

### API

| Superficie | Qué defiende |
| --- | --- |
| `controllers/participantController.ts` | Usa `SENSITIVE_HEALTH_FIELDS` de `@repo/types` y exporta `canViewHealthData` + `stripSensitiveHealthFields`; listado y detalle filtran antes de responder; `updateParticipant` responde 403 con `fields` si el body trae campos de salud sin el permiso |
| `controllers/retreatParticipantController.ts` | Reimporta ambos helpers: el listado por retiro embebe la misma forma de Participant (contactos de emergencia) |
| `controllers/retreatBedController.ts` | El mapa de camas expone salud junto a cada cama — mismo gate |
| `controllers/tableMesaController.ts` | Las mesas exponen restricciones dietéticas por integrante — mismo gate |
| `controllers/communityController.ts` | La búsqueda de participantes en contexto comunidad aplica el mismo strip |
| `routes/participantRoutes.ts` | `POST /health-export-audit` (el beacon del export) exige `requirePermission('participant:health')` |
| `routes/tableMesaRoutes.ts` | La ruta que devuelve mesas con dietas exige `participant:health` además del acceso a la mesa |
| `packages/types/src/audit.ts` | Acciones `participant.health_view` / `participant.health_export` / `participant.health_data_purged` |

### Web

| Superficie | Qué defiende |
| --- | --- |
| `components/ParticipantList.vue` | Columnas de salud/emergencia solo con el permiso, en la tabla y en el formulario de edición (`isColumnAllowed`); la preferencia de columnas recordada en localStorage se sanitiza (un permiso revocado no revive columnas); el export que incluye salud dispara el beacon |
| `components/BulkEditParticipantsModal.vue` | La edición masiva tiene su propia lista de campos (`fieldCategories`): ofrece un campo de salud solo si `allColumns`, ya filtrado por el padre, trae su columna. Sin eso, cada fila del guardado masivo recibía el 403 |
| `components/layout/Sidebar.vue` | Ítems "Comida" y "Reporte de medicinas" (`permission: 'participant'`, `permissionOperation: 'health'`); check unificado del set combinado |
| `router/index.ts` | `meta.requiresPermission: 'participant:health'` en `food` y `medicines-report`; deny → home, que manda al dashboard del retiro más reciente o a walkers; bypass superadmin |
| `services/api.ts` | `auditHealthDataExport` — el beacon que registra el export de datos de salud |

## Tests de referencia

| Suite | Qué fija |
| --- | --- |
| `apps/api/src/tests/controllers/healthDataExposureGuards.test.ts` | Listado/detalle sin el permiso no exponen los campos |
| `apps/api/src/tests/controllers/bedTableHealthGuards.test.ts` | Camas y mesas con el mismo gate |
| `apps/api/src/tests/controllers/participantHealthAudit.test.ts` | Auditoría de vista/export de salud; el gate de escritura: 403 con `fields` y nada guardado sin permiso, guardado normal sin campos de salud |
| `apps/api/src/tests/routes/participantHealthWriteGate.simple.test.ts` | El gate de escritura por el router real (`validateRequest` + controlador): 403 con `fields` también para `null`/`''`, `participant:update` evaluado antes, escritura normal con el permiso |
| `apps/api/src/tests/migrations/grantParticipantHealthToCommunications.simple.test.ts` | La concesión a communications: solo ese rol, idempotente, `down()` selectivo |
| `apps/web/src/router/__tests__/index.test.ts` | El guard: deny sin permiso, allow con permiso, fallback de destino, bypass superadmin |
| `apps/web/src/components/__tests__/Sidebar.test.ts` (describe "Health data guard") | Los ítems solo aparecen con el permiso |
| `apps/web/src/components/__tests__/ParticipantList.test.ts` (describe "Columnas de salud/contacto de emergencia") | Columnas condicionadas en tabla y formulario, sanitización del localStorage y beacon del export |
| `apps/web/src/components/__tests__/BulkEditParticipantsModal.test.ts` | El modal masivo oculta y ofrece los campos de salud según las columnas que recibe |
| `apps/web/tests/e2e/participant-health-permission-guard.spec.ts` | Sidebar y router con usuarios reales; y el formulario de edición de `/app/cancellation-and-notes` sin `notes` cuando falta el permiso (simulado en el navegador: a 2026-10-07 ningún rol del catálogo tiene `participant:update` sin `participant:health` — verificado en `role_permissions` de la base de dev; communications fue el último), con control positivo y cero escrituras |

Para correr el e2e basta una cuenta con `participant:update` y `participant:health` en el retiro
de `E2E_HEALTH_RETREAT_ID`, pasada inline (nunca escrita en el spec):

```bash
cd apps/web && E2E_ADMIN_HEALTH_EMAIL=… E2E_ADMIN_HEALTH_PASSWORD=… \
  npx playwright test tests/e2e/participant-health-permission-guard.spec.ts --project=chromium
```

Los dos tests de `regular_server` necesitan su fixture sembrado; sin él saltan, y tras unas
corridas el motivo del skip pasa a ser el 429 del limitador de login (ver
`.claude/rules/e2e-tests.md`).
