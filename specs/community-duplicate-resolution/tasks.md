# Tasks — duplicados: integración + gaps

> SDD tasks — versión 1.0 (2026-10-08). Marcar `[x]` al completar; anotar desviaciones reales
> respecto a `plan.md` al cerrar cada milestone.

## M0 — Caso Marco (sin código)

- [x] Crear los 4 artefactos SDD (spec/research/plan/tasks)
- [x] E2E local: abrir Comunidad Buen despacho → Miembros → "Duplicados", localizar el par
      Lafori/Martínez, preview, fusionar keep=`31188942-…` (gmail) — preview "Se moverán 2
      registros", sin blockers (2026-10-08)
- [x] Verificar post-merge local: candidato fuera de "Asisten pero no se han inscrito"
      (diff SQL pre/post = exactamente la fila de Marco), 11/11 asistencias intactas, lápida
      `mergedIntoParticipantId` correcta, cero referencias huérfanas, Marco visible en el
      ranking del equipo servidor
- [x] Limpiar nombre: participant queda firstName="Marco Antonio", lastName="Martínez Solís"
      (vía Angelitos → Editar Participante); overlay del member vaciado (Miembros → Más
      acciones → Editar datos → Apellido vacío) → display final "Marco Antonio Martínez Solís"
- [ ] Checklist de prod para el usuario (ver abajo) — ejecutado por el usuario

### Checklist merge en PROD (lo ejecuta el usuario)

1. `/Users/lbolanos/Developer/personal/emaus/backup-db.sh`
2. emaus.cc → comunidad Buen despacho → Miembros → "Duplicados"
3. Par "Marco Antonio Martínez Solís Martínez Solís / Marco Antonio Lafori" (matchedBy
   teléfono) → superviviente: la ficha gmail (10 registros, marcada "Ésta se conserva") →
   "Ver qué se movería" → debe decir "Se moverán 2 registros" sin blockers → Fusionar
4. Verificar: la lista "Duplicados" ya no trae el par; en attendance stats con el filtro del
   retiro, Marco sale de "Asisten pero no se han inscrito" y aparece en el ranking del equipo
5. Limpiar el nombre (mismo fix que en local):
   a. Sidebar del retiro → Personas → Angelitos → fila de Marco → Editar Participante →
      Nombre: "Marco Antonio" (Apellido se queda "Martínez Solís") → Guardar
   b. Comunidad → Miembros → fila de Marco → Más acciones → Editar datos → vaciar Apellido →
      Guardar cambios (display final: "Marco Antonio Martínez Solís")
6. Nota: este merge no queda en audit log (M4 pendiente) — excepción consciente

## M1 — Hint en attendance stats

- [x] `MergePairDialog.vue` nuevo + test (4 casos: sin preview deshabilitado; blocker;
      cambio de superviviente invalida preview; merge con dirección correcta + `merged`) —
      quedaron 5: se añadió "al llegar un par nuevo se resetean elección y preview"
- [x] `CommunityAttendanceStatsView.vue`: fetch one-shot de duplicados para owners,
      `duplicateHintByParticipantId`, badge + botón en desktop y móvil, `@merged` recarga
- [x] i18n es+en — ver desviación 1
- [x] Extender test de la vista: hint presente; fail-soft con fetch rechazado — quedaron
      3: se añadió co-admin sin fetch ni hint (lo pide FR1)
- [x] `pnpm --filter web build`

Desviaciones reales respecto a `plan.md` (2026-10-08):

1. **i18n**: sólo se creó `community.attendanceStats.duplicateHint`. El botón del hint
   reusa `community.duplicates.merge` ("Fusionar") y el toast de éxito vive en el dialog
   (`community.duplicates.merged`, clave existente). Se añadieron además
   `community.duplicates.pairTitle/pairDescription` para el diálogo de un par;
   `duplicateHintAction`/`duplicateMerged` quedaron sin crear por redundantes.
2. **E2E en navegador** (dev local): verificado el fetch one-shot (`/duplicates` 1 vez al
   cargar, no se repite al cambiar filtros), la vista estable y la ausencia de badge
   (correcta: ningún candidato cruza con los 2 pares vivos). El badge+diálogo con cruce
   real no se pudo ver en navegador porque **ya no existe ningún cruce** en las 13
   comunidades de la dev — el caso Marco (M0) era el único. Ese wiring queda cubierto por
   los unit tests con el cruce fabricado.
3. El test del dialog cazó un bug real en el componente nuevo: faltaba invalidar el
   preview al cambiar de superviviente (el watch existe en el molde y no se copió).
   Corregido antes de integrar.

## M2 — Badge de conteo

- [ ] Extraer `loadDuplicateGroups` en `participantMergeService.ts` (comportamiento idéntico;
      tests existentes en verde)
- [ ] `countDuplicateCandidatesForCommunity` + test de acuerdo (count === lista, 3 escenarios)
- [ ] `communityDuplicateCountSchema` en `packages/types` + controller + ruta owner-only
- [ ] `getCommunityDuplicateCount` en api.ts + `DuplicateCountBadge.vue` + test
- [ ] Integrar badge en botón "Duplicados" (CommunityMembersView, owners); dashboard: decidir
- [ ] `touch apps/api/src/index.ts` (packages/types tocado)

## M3 — Dismiss de falsos positivos

- [ ] Migration `2026100X0000_CreateCommunityDuplicateDismissal` (skill `sqlite-migrations`;
      up/down probados contra copia local)
- [ ] Entidad `communityDuplicateDismissal.entity.ts` + registro en
      `apps/api/src/database/config.ts`
- [ ] Schemas + 3 endpoints owner-only (dismiss idempotente con canonicalización,
      list, undo) + tests controller (400 inválidos, 200, 403 co-admin)
- [ ] `loadDuplicateGroups` filtra pares dismissados (solo grupos de 2) + tests service
      (lista Y count; grupo de 3 no se filtra; idempotencia)
- [ ] UI: "No son la misma persona" en ambos dialogs + sección "Pares descartados" con
      Deshacer + handler en vista de stats + i18n es+en
- [ ] Tests UI de ambos dialogs

## M4 — Audit del merge [P — paralelizable con M2/M3]

- [ ] `PARTICIPANT_MERGE` en `CommunityAuditAction` + `matchedBy` opcional en
      `mergeParticipantsSchema.body`
- [ ] Log fire-and-forget en controller tras el merge (metadata compacta del `MergeResult`)
- [ ] Ambos dialogs pasan `matchedBy: pair.matchedBy`
- [ ] Tests: fila de audit tras 200; merge 200 aunque audit rechace

## Cierre

- [ ] Marcar tareas y anotar desviaciones por milestone
- [ ] Proponer commit(s)
