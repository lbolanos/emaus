# Research: estado actual del import de miembros

Base: `80be2d96` (master del 2026-10-22, con el arreglo del 500 ya en prod).

## Datos de prod (consultas de solo lectura, 2026-10-22)

- Comunidad `f1060047-…` «Buen despacho», retiro `e9b3c568-…` Buen Despacho 2026.
- Log del API, 15:05 UTC: `POST …/members/import` → `Error: SqliteError: PHONE_DUPLICATE_IN_COMMUNITY`.
- Roster en `retreat_participants`: 71 filas sin datos borrados — 31 caminantes activos, 4
  cancelados; 23 servidores activos, 4 cancelados; 8 angelitos activos, 1 cancelado.
- Tras el import: 7 cancelados quedaron como miembros (alta 15:05 y 15:28). Alberto Garay
  (caminante cancelado) es el que chocó por teléfono con Eduardo Garay.
- Oscar Martínez Díaz: servidor activo del retiro con `participants.retreatId` de otro retiro.
  Nunca se ofrecía en el modal.

## Flujo actual

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Rutas | `apps/api/src/routes/communityRoutes.ts:129` (`GET /:id/members/potential`), `:153` (`POST /:id/members/import`) | Solo `requireCommunityAccess()`. Nada valida el retiro. |
| Listado | `communityService.getPotentialMembers` (`communityService.ts:1332`) | Tras M0: lista de `retreat_participants` con `type` e `isCancelled`, `alreadyMember`. Sin conflicto de teléfono. |
| Import | `communityService.importFromRetreat` (`:1288`) | Por cada id: si ya es miembro lo devuelve; si su teléfono choca (`findPhoneCollision`, `:712`) lo salta; si no, `addMember`. No mira el roster: `retreatId` no se usa. Un error distinto del de teléfono corta el lote con 500. |
| Controlador | `communityController.ts:242` | Sin try/catch: el 500 sale del `errorHandler` global con `{ message: 'Internal Server Error' }`. |
| Modal | `apps/web/src/components/community/ImportMembersModal.vue` | Tras M0: oculta cancelados. Toast de resultado; en error muestra `error.message` de axios. |
| Mensajes | `apps/web/src/services/apiError.ts:62` `apiErrorMessage` | Ya existe y saca `data.message` del servidor; el modal no lo usa. |

## Autorización disponible

- `requireRetreatAccess(param, source)` (`middleware/authorization.ts:653`): lee de `params` o
  `body`; `hasRetreatAccess` = superadmin o `user_retreats` activo.
- `requireRetreatAccessOrCreator(param)` (`:736`): acceso **o** creador, pero solo de `params`.
- La lista de retiros del modal sale de `getRetreatsForUser` (`retreatService.ts:89`): superadmin,
  `user_retreats` activo **o** creador. La regla equivalente es la de
  `requireRetreatAccessOrCreator`; hay que permitirle leer de `query` (listado) y `body` (import).

## Teléfono único por comunidad

- Migración `20260521170000_UniquePhonePerCommunity.ts`: índice parcial
  `uniq_community_member_overlay_phone` + triggers `trg_cm_phone_uniq_insert` /
  `trg_cm_phone_uniq_update`. Es la única migración del repo con triggers.
- Normalización: el trigger quita espacios, guiones, paréntesis y `+`; `findPhoneCollision` quita
  todo lo que no sea dígito. Los dos comparan los últimos 10 dígitos y exigen 7 o más. La
  diferencia (puntos, por ejemplo) hace a `findPhoneCollision` más estricto: si él no ve choque,
  el trigger tampoco.

## Tests

- `apps/api/src/tests/test-setup.ts:180`: `synchronize: true`, base en memoria. No corre
  migraciones, así que no hay triggers ni el índice parcial.
- `apps/api/src/tests/test-utils/testDataFactory.ts:321`: `cellPhone: '1234567890'` por defecto.
  11 archivos de test crean miembros con `createTestCommunityMember`; con el trigger instalado,
  dos miembros de la factory en la misma comunidad chocarían.
- `communityService.test.ts` ya instala el trigger a mano en el `describe` de teléfono único
  (`CM_PHONE_UNIQ_TRIGGER_SQL`), con `CREATE TRIGGER IF NOT EXISTS`.

## Trabajo en paralelo

Otra sesión (emaus-0c) tiene sin commitear en el árbol principal `community_member.sourceRetreatId`
(migración `20261022100000`), que toca `addMember` e `importFromRetreat` (calcula `onRoster` para
etiquetar el origen). Con D3, `onRoster` siempre es verdadero para quien se importa: al mergear se
simplifica a pasar `retreatId`. Su test «no etiqueta con un retiro en cuyo roster no está la
persona» pasa a «lo salta y no lo crea».
