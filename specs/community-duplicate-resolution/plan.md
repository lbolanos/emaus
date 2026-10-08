# Plan técnico — duplicados: integración + gaps

> SDD plan — versión 1.0 (2026-10-08). Aprobado. Tesis: el motor (detector + preview + merge)
> ya existe y está probado; los 4 gaps son de **descubrimiento y confianza**. Ningún milestone
> toca `mergeParticipants` ni `PARTICIPANT_REFERENCES`.

## M0 — Caso Marco: specs + E2E local + merge en prod (sin código)

1. Este set de specs.
2. **E2E en dev local** (DB local = prod del pull 2026-10-08): UI existente → Miembros →
   "Duplicados" → par Lafori/Martínez → preview → fusionar con keep = ficha gmail
   (`31188942-…`). Verificar: candidato fuera de "Asisten pero no se han inscrito", 11
   asistencias intactas, lápida correcta. Post-merge: limpiar el nombre de la ficha
   superviviente (apellido duplicado en firstName+lastName) y el overlay del member si
   duplica texto.
3. **Merge en prod**: lo ejecuta el usuario por la UI tras `backup-db.sh` (el agente no opera
   prod). Checklist en `tasks.md`. Este merge no queda auditado (M4 no existe aún) —
   documentado aquí como excepción consciente.

## M1 — Hint síntoma→solución en attendance stats (Gap 1)

**Decisión: NO extender el response del endpoint de stats.** El cruce se hace en el frontend
con una llamada a `GET /duplicates` (una por visita, gateada a owner/superadmin) y se extrae
un `MergePairDialog` para UN par.

Justificación:

- `/attendance-stats` corre en cada cambio de filtro y cuelga de `requireCommunityAccess`
  (co-admins); `/duplicates` es `requireCommunityOwner`. Meter el detector en el response de
  stats expone funcionalidad owner-only a co-admins Y paga el N+1 (25 queries × ficha) en cada
  filtro. Los duplicados no dependen de los filtros → basta una llamada por visita.
- Fail-soft: si la llamada falla, la vista funciona igual (hint ausente ≠ error).
- Extraer `MergePairDialog` en vez de reutilizar `DuplicateMembersDialog` (listado
  auto-hidratado con estado indexado `keepBy[i]`/`previews[i]`): desde la vista de stats el
  contexto es UN par identificado; ver los 3 pares cuando persigues uno cambia el foco.
  `DuplicateMembersDialog` no se toca en M1 — su flujo queda verificado E2E por M0. La
  consolidación de ambos (listado → abre MergePairDialog por par) queda anotada como refactor
  posterior, junto con el `countReferences` batcheado (UNION ALL) para comunidades grandes.

Archivos:

- **Nuevo** `apps/web/src/components/community/MergePairDialog.vue` (+ test): props `{open,
  communityId, pair}`, emits `update:open`, `merged`, `dismissed` (dismiss llega en M3).
  Misma UX que el par del dialog existente: superviviente default = más referencias, preview
  obligatorio ("Ver qué se movería"), fusionar deshabilitado hasta `preview && !blockers`,
  invalidación del preview al cambiar superviviente.
- **Modificar** `apps/web/src/views/CommunityAttendanceStatsView.vue`: `duplicates` ref +
  fetch one-shot cuando `isOwnerOrSuperadmin && unenrolledCandidates.length > 0`; computed
  `duplicateHintByParticipantId` (aplanando `participants[].id`); badge "Posible duplicado" +
  botón "Fusionar" en fila desktop y lista móvil; `@merged` → `await load()` + reset del
  fetch de duplicados (el merge mueve la inscripción y el candidato debe salir en caliente).
- i18n `community.attendanceStats.{duplicateHint,duplicateHintAction,duplicateMerged}` en
  AMBOS locales; ícono lucide nuevo → añadir al mock del test de la vista.

Tests: MergePairDialog (deshabilitado sin preview; blocker lo impide; cambiar superviviente
invalida preview; merge llama API con la dirección elegida y emite `merged`); vista (hint
aparece con candidato en par; fetch rechazado → render igual sin hint). `pnpm --filter web
build` antes de cerrar.

## M2 — Badge de duplicados pendientes (Gap 2)

**Decisión: endpoint liviano `GET /:id/duplicates/count` que NO reusa el detector completo.**
El enriquecimiento (`references`, `hasUser`, `isCommunityMember`) es lo que causa el N+1 y solo
sirve para elegir superviviente. Extraer `loadDuplicateGroups(communityId)` (SELECT de scope +
huellas + dedupe de pares por firma, sin queries por ficha) y construir sobre él AMBAS
funciones — **badge y lista no pueden divergir sobre qué es un duplicado** (decisión D3).

- `apps/api/src/services/participantMergeService.ts`: extraer `loadDuplicateGroups`;
  `findDuplicateCandidatesForCommunity` = grupos + enriquecimiento (comportamiento
  idéntico, sus tests existentes son la red); nuevo `countDuplicateCandidatesForCommunity` =
  `grupos.length` (− dismissals a partir de M3).
- `packages/types/src/community.ts`: `communityDuplicateCountSchema`.
- Controller `getDuplicateCandidatesCount` + ruta junto a las existentes,
  `requireCommunityOwner()`, sin rate limiter (GET barato).
- Frontend: `getCommunityDuplicateCount` en `apps/web/src/services/api.ts`; componente nuevo
  `apps/web/src/components/community/DuplicateCountBadge.vue` (autocontenido: fetch al montar,
  no pinta nada con 0/error), dentro del botón "Duplicados" de `CommunityMembersView.vue`,
  solo owners. Dashboard: opcional, decidir en implementación.

Tests: **acuerdo** `count === findDuplicateCandidates(...).length` en 3 escenarios; controller
200 `{count}`; componente (pinta N>0; nada con 0; nada con error). Tras tocar `packages/types`:
`touch apps/api/src/index.ts`.

## M3 — Dismiss de falsos positivos (Gap 3)

Decisiones:

- Tabla nueva `community_duplicate_dismissal` con el **par canónico en dos columnas**
  (`participantAId < participantBId`, impuesto por código + `CHECK` en SQLite) y
  `UNIQUE (communityId, participantAId, participantBId)`: dos columnas permiten FKs reales a
  `participants` y un índice usable.
- **Solo grupos de exactamente 2** se ofrecen a dismiss: descartar en bloque un grupo de 3+
  ambiguo escondería pares verdaderos (A–C puede ser real aunque A–B no).
- **Idempotente**: repetir el dismiss devuelve la fila existente (200), no 409.
- **Con visibilidad y undo**: `GET .../dismissals` + `DELETE`, sección colapsada en el dialog —
  sin esto, un misclick esconde un duplicado real para siempre.

Archivos:

- Migration `apps/api/src/migrations/sqlite/2026100X0000_CreateCommunityDuplicateDismissal.ts`
  (molde `20260908150000_CreateParticipantNotes.ts`; sin `@repo/types`; `transaction = false
  as const`; cargar skill `sqlite-migrations`). Columnas: id PK, communityId FK→community
  CASCADE, participantAId/participantBId FK→participants CASCADE, dismissedBy FK→users SET
  NULL, reason text nullable, createdAt. CHECK + UNIQUE index + índice por communityId.
- Entidad nueva `apps/api/src/entities/communityDuplicateDismissal.entity.ts` (molde
  `communityAuditLog.entity.ts`) + registro en `entities` de
  `apps/api/src/database/config.ts` (sin esto, el `synchronize` de tests no la ve — silencio).
- `packages/types/src/community.ts`: `dismissDuplicatePairSchema` (canonicaliza orden en
  servidor), `duplicateDismissalSchema`, `undoDismissalSchema`.
- 3 endpoints owner-only: `POST /:id/duplicates/dismiss`, `GET /:id/duplicates/dismissals`,
  `DELETE /:id/duplicates/dismissals/:dismissalId`.
- `loadDuplicateGroups` carga los dismissals de la comunidad (Set de firmas `a|b`) y filtra
  grupos de 2 → **lista, count y hints consistentes de una sola vez**.
- UI: botón "No son la misma persona" (confirmación en dos pasos, sin AlertDialog) en AMBOS
  dialogs + sección "Pares descartados" con Deshacer; handler `dismissed` en la vista de
  stats (refetch de duplicados). i18n en ambos locales bajo `community.duplicates.*`.

Tests: par dismissado fuera de lista Y count; grupo de 3 NO se filtra; idempotencia;
canonicalización `A,B`/`B,A` → misma fila; GET lista; DELETE undo; 403 co-admin; UI en ambos
dialogs. Migración: probar up/down contra copia local antes de desplegar.

## M4 — Audit del merge (Gap 4)

- `PARTICIPANT_MERGE: 'community.participant.merge'` en `CommunityAuditAction`
  (`apps/api/src/services/communityAuditService.ts`).
- Log fire-and-forget en el controller **después** de que `mergeParticipants` resuelva (patrón
  `updateMemberProfile`): `{keepId, mergeId, matchedBy?, totalRowsMoved, attendanceMoved,
  attendanceMerged}` desde el `MergeResult`. Nunca dentro del servicio/transacción (decisión
  D5: SQLite single-writer; audit rojo no debe poder tirar atrás un merge hecho).
- `matchedBy: z.enum(['name','phone','email']).optional()` en `mergeParticipantsSchema.body`
  (llega del cliente, que lo sabe del candidato; opcional para no romper llamadas). Ambos
  dialogs lo pasan.

Tests: fila en `community_audit_log` tras merge 200 (action, communityId, metadata);
el merge responde 200 aunque `communityAuditService.log` rechace.

## Secuencia y dependencias

M0 → M1 → M2 → M3 (M3 filtra dentro del refactor de M2); **M4 paralelizable** con M2/M3.

Transversal: i18n en AMBOS locales; mock de íconos lucide nuevos; `pnpm --filter web build` al
tocar vistas; UNA corrida de jest a la vez; tras tocar `packages/types`,
`touch apps/api/src/index.ts`.
