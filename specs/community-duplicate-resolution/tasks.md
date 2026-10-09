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

- [x] Extraer `loadDuplicateGroups` en `participantMergeService.ts` (comportamiento idéntico;
      tests existentes en verde — 30/30 en las 2 suites de merge)
- [x] `countDuplicateCandidatesForCommunity` + test de acuerdo (count === lista, 3 escenarios
      con valores absolutos para que el acuerdo no sea trivial) + controlador 200
- [x] `communityDuplicateCountSchema` en `packages/types` + controller + ruta owner-only
      `GET /:id/duplicates/count`
- [x] `getCommunityDuplicateCount` en api.ts + `DuplicateCountBadge.vue` + test (4 casos:
      número, cero, error, refresco al cambiar comunidad)
- [x] Integrar badge en botón "Duplicados" (CommunityMembersView, owners); dashboard: decidir
      — NO (ver desviación 1)
- [x] `touch apps/api/src/index.ts` (packages/types tocado)

Desviaciones reales respecto a `plan.md` (2026-10-08):

1. **Dashboard: sin badge.** El plan lo dejaba "opcional, decidir en implementación". El
   dashboard no tiene entrada a duplicados; el único lugar donde el número significa algo
   accionable es el botón que abre el listado. Un badge sin acción al lado es ruido.
2. El test del controlador vive dentro de la suite del service (`participantMerge.test.ts`),
   junto al de `previewParticipantMerge` que ya estaba ahí — mismo molde, no suite aparte.
3. Refresh tras fusión: `:key="duplicatesVersion"` remonta el badge en cada `@merged` del
   `DuplicateMembersDialog`, en vez de exponer un método — el componente se queda autocontenido
   (solo props, sin API imperativa).
4. Sin i18n ni íconos nuevos: el badge es un número dentro del botón ya etiquetado.
5. Verificado en dev local contra datos reales (pull de prod de hoy): Buen despacho
   `count === listado === 2` (Garay + Vallejos por teléfono, ya sin Marco tras M0).

## M3 — Dismiss de falsos positivos

- [x] Migration `20261009094500_CreateCommunityDuplicateDismissal` (skill `sqlite-migrations`;
      tabla nueva sin FKs entrantes, `transaction = false as const`, `CREATE ... IF NOT EXISTS`
      idempotente) — la aplicó el auto-run de nodemon a la dev DB al guardar (comportamiento
      documentado del skill), re-ejecución segura
- [x] Entidad `communityDuplicateDismissal.entity.ts` + registro en
      `apps/api/src/database/config.ts` — y en DOS lugares más (ver desviación 1)
- [x] Schemas + 3 endpoints owner-only (dismiss idempotente con canonicalización,
      list, undo) + tests controller (400 inválidos, 200, 403 co-admin — wiring en
      `communityDismissalRoutes.simple.test.ts`, 403 con middleware stubbeado)
- [x] `loadDuplicateGroups` filtra pares dismissados (solo grupos de 2) + tests service
      (lista Y count; grupo de 3 no se filtra; idempotencia; canonicalización A,B/B,A;
      undo revive el par; undo cross-comunidad rechazado) — 45/45 en las 3 suites
- [x] UI: "No son la misma persona" en ambos dialogs + sección "Pares descartados" con
      Deshacer + handler en vista de stats + i18n es+en (9 claves nuevas, paridad verificada
      por `auditLocaleCoverage.test.ts`)
- [x] Tests UI de ambos dialogs (MergePairDialog 8, DuplicateMembersDialog 10) +
      `pnpm --filter web build` verde

Desviaciones reales respecto a `plan.md` (2026-10-09):

1. **La entidad se registra en TRES listas, no una.** Además de `database/config.ts`, el
   DataSource de tests (`apps/api/src/tests/test-setup.ts`) tiene su propio array de entities
   — sin registro ahí, "No metadata for CommunityDuplicateDismissal" tumba 16 tests — y
   `clearTestData()` necesita la tabla en su `clearOrder` o las filas de descarte se filtran
   entre tests (fallos fantasma de contaminación cross-suite). El plan sólo prevenía la
   primera.
2. **El 403 de co-admin no es un test HTTP contra middleware real**: va en
   `communityDismissalRoutes.simple.test.ts` (molde `communityUpdateRoutes`), que fija que el
   gate es `requireCommunityOwner` (no mero acceso) y que la validación Zod corre antes del
   controller. Los tests de controller quedaron embebidos en la suite de service, mismo
   criterio que M2.
3. **El undo emite el mismo evento `dismissed` que el dismiss**: ambos cambian el conteo
   pendiente y el badge del botón debe refrescarse en los dos sentidos; `onDuplicatesMerged`
   no aplica porque un descarte no toca miembros. En la vista de stats, el handler saca el
   par de la lista local sin recargar (el descarte no cambia inscripciones ni asistencia).
4. **La sección de descartados es fail-soft con error visible**: si su GET falla, el dialog
   sigue vivo pero la sección muestra el error en vez de un "no hay pares descartados" que
   mentiría (la sección existe justamente para que un misclick no esconda un duplicado real).
5. **Hallazgo de los tests UI**: el mock de `Button` hacía `$emit('click')` además del
   fallthrough del onclick del padre → el handler corría DOS veces por click y la
   confirmación en dos pasos se ejecutaba en un solo click. Corregido el mock para reflejar
   el Button real (Primitive de radix: sólo fallthrough). El componente de producción nunca
   tuvo el bug.

## M4 — Audit del merge [P — paralelizable con M2/M3]

- [ ] `PARTICIPANT_MERGE` en `CommunityAuditAction` + `matchedBy` opcional en
      `mergeParticipantsSchema.body`
- [ ] Log fire-and-forget en controller tras el merge (metadata compacta del `MergeResult`)
- [ ] Ambos dialogs pasan `matchedBy: pair.matchedBy`
- [ ] Tests: fila de audit tras 200; merge 200 aunque audit rechace

## Cierre

- [ ] Marcar tareas y anotar desviaciones por milestone
- [ ] Proponer commit(s)
