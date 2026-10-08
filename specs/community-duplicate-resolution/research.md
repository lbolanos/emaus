# Research — estado actual y evidencia

> SDD research — versión 1.0 (2026-10-08). Datos de prod verificados con SQL sobre el pull
> del 2026-10-08 13:14 (copia read-only en `/tmp/emaus-lookup/db.sqlite`).

## Lo que ya existe (sept 2026) — y funciona

### Detección retroactiva

`apps/api/src/services/participantMergeService.ts` → `findDuplicateCandidatesForCommunity(communityId)`:

- **Scope**: fichas de `community_member` de la comunidad + fichas en `retreat_participants`
  de los retiros vinculados a ella. Excluye `dataDeletedAt` y lápidas
  (`mergedIntoParticipantId IS NOT NULL`).
- **Huellas** (`packages/utils/src/index.ts`): email (`email:`) > teléfono
  (`phoneFingerprint`, últimos 10 dígitos) > nombre (`normalizePersonName`). Un par se reporta
  una sola vez con su huella más fuerte.
- **Enriquecimiento** por ficha (esto es el N+1: ~25 queries por ficha vía
  `countReferences`): total de referencias (orienta el superviviente), `hasUser`,
  `isCommunityMember`.
- **Costo medido en el diseño**: para una comunidad de ~84 miembros en scope son del orden de
  2.000 queries por invocación. Aceptable a demanda; prohibitivo por cambio de filtro.

### Merge

`mergeParticipants(keepId, mergeId)` — transacción que reapunta 23 columnas de 19 tablas
(`PARTICIPANT_REFERENCES`, con guard test `participantMergeReferences.test.ts` que compara
contra el esquema real). Políticas: `repoint`, `dedupe` (índice único),
`merge-member` (mueve `community_member.participantId` Y `community_attendance` sin perder
asistencias — borrar el member sería CASCADE y las perdería), `retreat-overlap` (gana la
inscripción activa; bloquea si las dos activas), `block-on-overlap` (user en ambas fichas).
Lápida final: `mergedIntoParticipantId = keepId, retreatId = NULL` (decisión D1).
`previewMerge` devuelve moves/blockers; el merge se niega con blockers.

### Endpoints + UI

- `apps/api/src/routes/communityRoutes.ts` (~:348-362): `GET /:id/duplicates`,
  `POST /:id/duplicates/preview`, `POST /:id/duplicates/merge` — `requireCommunityOwner()`.
- `apps/web/src/services/api.ts` (~:1722-1776): `getCommunityDuplicates`,
  `previewParticipantMerge`, `mergeParticipantDuplicates`.
- `apps/web/src/components/community/DuplicateMembersDialog.vue`: listado de pares, elección
  de superviviente, preview obligatorio, merge deshabilitado con blockers. Abierto desde el
  botón "Duplicados" de `CommunityMembersView.vue`.
- Doc: `docs/features/participant-duplicate-merge.md`.

### Prevención en el alta (no retroactiva)

`docs/features/community-phone-duplicate-prevention.md` y
`docs/features/duplicate-registration-guard.md`: guards en el alta pública (doble registro por
retiro, retiro cerrado, email ajeno). Nada de esto arregla el histórico.

## Evidencia: el caso Marco (2026-10-08)

Comunidad **Buen despacho** (`f1060047-5305-4f75-89c4-a649e449975e`), retiro **Buen Despacho
Del Valle II** (`e9b3c568-050a-4d66-a99d-305f287a59df`).

| Ficha | id | nombre | email | teléfono | origen |
| --- | --- | --- | --- | --- | --- |
| Padrón | `90608129-e169-431f-93ed-ac69abd04dca` | Marco Antonio **Lafori** | `marco2@ignore.com` (relleno) | 5529603456 | alta community_member 20-jun-2026, 11 asistencias; overlay `lastName` = "Martinez Solis" |
| Retiro | `31188942-2358-4b8e-948a-0eda2e85832f` | Marco Antonio Martínez Solís (firstName) + Martínez Solís (lastName, duplicado) | `marcoantoniomartinezsolis@gmail.com` | 5529603456 | inscripción pública 12-sep-2026 como `partial_server` (angelito) activo |

- El detector **sí encuentra el par** (huella `phone:5529603456`) — verificado reproducendo el
  SQL del detector sobre la copia de prod.
- El merge `keep=31188942, merge=90608129` **no tiene blockers**: la ficha del padrón no tiene
  filas de retiro, ninguna de las dos tiene user.
- La ficha del retiro trae el nombre sucio de la inscripción (apellido en firstName y
  lastName): el display post-merge se revisa y corrige en M0.

### Resultado del merge (E2E local, 2026-10-08)

Ejecutado por la UI existente contra la dev local (= prod del pull 13:14). Preview "Se
moverán 2 registros", sin blockers; `keep=31188942`, `merge=90608129`. Verificado con SQL
sobre copias pre (`/tmp/emaus-lookup`) y post del estado:

- El diff de "Asisten pero no se han inscrito" es exactamente la fila de Marco; los otros 9
  candidatos idénticos. Marco pasa al ranking del equipo servidor (7/7 preparaciones).
- Lápida `90608129.mergedIntoParticipantId = 31188942`, `retreatId = NULL`; 0 referencias
  restantes a la ficha absorbida; member único apuntando a la superviviente.
- 11/11 registros de asistencia intactos (`community_attendance` keyed por `memberId`).
- Nombre corregido tras el merge: participant `firstName="Marco Antonio",
  lastName="Martínez Solís"` (antes el nombre completo venía en firstName) y overlay del
  member vaciado — display final "Marco Antonio Martínez Solís". Los pasos exactos quedaron
  en el checklist de prod de `tasks.md`.

### Los otros 2 pares detectados en esa comunidad (mismo pull)

- **Garay**: hermanos (mismo apellido, teléfono de casa compartido) → **falso positivo**; caso
  de uso del dismiss (M3) una vez construido.
- **Vallejos**: duplicado real → merge directo con la UI existente.

## Los 4 gaps (lo que este spec construye)

1. **Síntoma → solución**: la vista de attendance stats
   (`apps/web/src/views/CommunityAttendanceStatsView.vue`, bloque
   `unenrolledCandidates`) no sabe nada de duplicados. Nadie que ve el síntoma llega a la
   herramienta.
2. **Descubrimiento**: el botón "Duplicados" de CommunityMembersView no dice si hay pendientes.
3. **Falsos positivos**: sin dismiss, Garay saldrá para siempre y erosiona la confianza en la
   herramienta.
4. **Trazabilidad**: `communityAuditService` no registra merges.

## Patrones relevantes del repo (a seguir)

- Rutas community: `requireCommunityOwner()` + `validateRequest(zodSchema)`; schemas en
  `packages/types/src/community.ts` (`mergeParticipantsSchema` ~:837 como modelo).
- Audit: `communityAuditService.log` fire-and-forget en el controller tras resolver la
  operación (patrón `updateMemberProfile`, communityController ~:363-389). NUNCA dentro de una
  transacción (SQLite single-writer).
- Frontend: funciones en `apps/web/src/services/api.ts` con JSDoc en español; Dialog de
  `@repo/ui` (no hay AlertDialog: patrón preview + botón deshabilitado); i18n en AMBOS
  `es.json`/`en.json` bajo `community.*`; mocks globales en
  `apps/web/src/test/setup.ts` (lucide es allowlist; `@repo/ui` acepta cualquier prop).
- Migrations: sin imports de `@repo/types`, un archivo por feature, reversible,
  `transaction = false as const` para DDL (skill `sqlite-migrations`).
- Entidades nuevas: registrarlas en el array `entities` de
  `apps/api/src/database/config.ts` — el `synchronize` de tests no las ve si falta, y nada
  falla, en silencio.
