# participant:health — la ficha de salud detrás de su propio permiso

La ficha del participante guarda datos sensibles que no necesita todo rol que debe "ver la
lista". `participant:read` lo tiene hasta `regular_server` — roles de servicio que trabajan la
logística — así que la salud vive en una operación aparte: `participant:health`.

## Qué se protege exactamente

La lista canónica es `SENSITIVE_HEALTH_FIELDS` en
`apps/api/src/controllers/participantController.ts`: `medicationDetails`,
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
cambio el gate también aplica en **escritura**: `updateParticipant` dropea los campos de salud
del body cuando el caller no tiene el permiso — quien no puede leer, no puede escribir.

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
| `controllers/participantController.ts` | Define `SENSITIVE_HEALTH_FIELDS` y exporta `canViewHealthData` + `stripSensitiveHealthFields`; listado y detalle filtran antes de responder; `updateParticipant` dropea los campos de salud del body sin el permiso |
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
| `components/ParticipantList.vue` | Columnas de salud/emergencia solo con el permiso; la preferencia de columnas recordada en localStorage se sanitiza (un permiso revocado no revive columnas); el export que incluye salud dispara el beacon |
| `components/layout/Sidebar.vue` | Ítems "Comida" y "Reporte de medicinas" (`permission: 'participant'`, `permissionOperation: 'health'`); check unificado del set combinado |
| `router/index.ts` | `meta.requiresPermission: 'participant:health'` en `food` y `medicines-report`; deny → home, que manda al dashboard del retiro más reciente o a walkers; bypass superadmin |
| `services/api.ts` | `auditHealthDataExport` — el beacon que registra el export de datos de salud |

## Tests de referencia

| Suite | Qué fija |
| --- | --- |
| `apps/api/src/tests/controllers/healthDataExposureGuards.test.ts` | Listado/detalle sin el permiso no exponen los campos |
| `apps/api/src/tests/controllers/bedTableHealthGuards.test.ts` | Camas y mesas con el mismo gate |
| `apps/api/src/tests/controllers/participantHealthAudit.test.ts` | Auditoría de vista/export de salud; el gate de escritura del body (con y sin permiso) |
| `apps/api/src/tests/migrations/grantParticipantHealthToCommunications.simple.test.ts` | La concesión a communications: solo ese rol, idempotente, `down()` selectivo |
| `apps/web/src/router/__tests__/index.test.ts` | El guard: deny sin permiso, allow con permiso, fallback de destino, bypass superadmin |
| `apps/web/src/components/__tests__/Sidebar.test.ts` (describe "Health data guard") | Los ítems solo aparecen con el permiso |
| `apps/web/src/components/__tests__/ParticipantList.test.ts` (describe "Columnas de salud/contacto de emergencia") | Columnas condicionadas, sanitización del localStorage y beacon del export |
