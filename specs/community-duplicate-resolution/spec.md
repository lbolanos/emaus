# Duplicados de participantes: del síntoma a la solución

> SDD spec — versión 1.0 (2026-10-08). Estado: aprobado, M0 en ejecución.

## Problema

La misma persona puede existir dos veces en `participants`: una ficha creada al alta en el
padrón de una comunidad y otra creada por la inscripción pública a un retiro. La inscripción
pública matchea **solo por email** (`participantService.createParticipant`), y las altas sin
correo reciben un email de relleno (`@ignore.com`) que nunca matchea → ficha nueva aunque el
teléfono ya exista.

El caso real (2026-10-08, comunidad Buen despacho, retiro Buen Despacho Del Valle II): Marco
Antonio aparece en "Asisten pero no se han inscrito al retiro" pese a estar inscrito como
angelito, porque su `community_member` apunta a la ficha del padrón y su inscripción colgó de
la otra. Efecto colateral: las notificaciones del miembro se van al email de relleno.

La detección y la fusión **ya existen** (`participantMergeService` + `DuplicateMembersDialog`,
sept 2026) y funcionan — el par de Marco sale detectado por huella de teléfono y su merge no
tiene blockers. El problema es de **descubrimiento y confianza**:

1. Nadie encontró la herramienta: el síntoma (la lista de "no inscritos") no guía a la acción.
2. El botón "Duplicados" no indica si hay algo pendiente.
3. Los falsos positivos (dos hermanos con mismo apellido y teléfono) salen para siempre: no
   hay forma de descartarlos.
4. El merge no emite audit log: operación destructiva invisible en la traza de la comunidad.

## Decisiones de dominio

| # | Decisión | Por qué |
| --- | --- | --- |
| D1 | La ficha absorbida no se borra: queda con `mergedIntoParticipantId` (lápida) | Operación auditable y reversible a mano; el merge ya lo hace así |
| D2 | El cruce síntoma→duplicados se hace en el frontend, no extendiendo el response del endpoint de stats | `/attendance-stats` corre por cambio de filtro y es accesible a co-admins; `/duplicates` es owner-only y caro (N+1). Ver `plan.md` M1 |
| D3 | Badge y lista comparten la MISMA definición de duplicado (`loadDuplicateGroups`) | El badge y el listado no pueden divergir (lección del incidente badge-vs-ranking de asistencia) |
| D4 | Un dismiss descarta solo pares de exactamente 2 fichas, es idempotente, y siempre es visible y reversible | Un descarte que borra en bloque un grupo ambiguo, o invisible, esconde duplicados reales para siempre |
| D5 | El audit del merge se emite en el controller, después de la transacción, fire-and-forget | SQLite single-writer: el audit no debe competir con la transacción ni poder tirarla atrás |
| D6 | El merge es owner-only, con preview obligatorio | Ya está así hoy; no se relaja nada |

## Historias de usuario

- **HU1** — *Coordinador ve el síntoma*: "Veo a alguien en 'asisten pero no se inscribieron';
  quiero que la pantalla me diga que puede ser un duplicado y poder resolverlo ahí mismo, sin
  saber de antemano que existe una herramienta de duplicados."
- **HU2** — *Owner entra a miembros*: "Quiero ver de un vistazo si hay duplicados pendientes de
  revisar, sin abrir el diálogo."
- **HU3** — *Owner revisa candidatos*: "Dos hermanos comparten apellido y teléfono; necesito
  decir 'no son la misma persona' y que dejen de salir — y poder deshacerlo si me equivoqué."
- **HU4** — *Auditoría*: "Alguien fusionó dos fichas de un miembro; necesito ver quién, cuándo
  y qué se movió, en el log de auditoría de la comunidad."

## Requerimientos funcionales

- **FR1 (M1)**: En la vista de attendance stats con filtro de retiro, cada candidato de
  "Asisten pero no se han inscrito" cuya ficha participa en un par de duplicados muestra un
  badge "Posible duplicado" y un botón "Fusionar" que abre el diálogo de fusión de UN par
  (solo para owner/superadmin; co-admins ven la lista como hoy).
- **FR2 (M1)**: El diálogo de fusión exige preview, respeta blockers y deshabilita "Fusionar"
  hasta que el preview esté cargado y sin blockers. Tras fusionar, la lista de candidatos se
  recarga.
- **FR3 (M2)**: El botón "Duplicados" muestra un contador de pares pendientes (0 = nada). El
  contador y la lista provienen de la misma detección.
- **FR4 (M3)**: El owner puede descartar un par ("no son la misma persona") con confirmación;
  el par desaparece de la lista, del contador y de los hints. Los descartes se listan y se
  pueden deshacer.
- **FR5 (M3)**: El descartador queda registrado (quién, cuándo, motivo opcional).
- **FR6 (M4)**: Todo merge emite `community.participant.merge` en el audit log de la comunidad
  con keep/merge, motivo de match y contadores de filas movidas.

## Criterios de aceptación

- CA1 (M0): tras el merge del caso Marco, el candidato desaparece de "Asisten pero no se han
  inscrito", sus asistencias siguen contando y la ficha absorbida queda con lápida.
- CA2 (M1): la vista de stats funciona idéntica si la llamada de duplicados falla (sin hint,
  sin error).
- CA3 (M2): `countDuplicateCandidatesForCommunity(c) === findDuplicateCandidatesForCommunity(c).length`
  en todos los escenarios de test, con y sin dismissals.
- CA4 (M3): dismiss idempotente (repetir devuelve la fila existente); `A,B` y `B,A` producen la
  misma fila; un grupo de 3+ NO se descarta.
- CA5 (M4): tras un merge 200 existe la fila de audit; un fallo del audit no afecta el 200.

## No-goals

- **No** se cambia el matching del alta pública (`createParticipant` por email): la causa raíz
  de los duplicados queda fuera de este spec; el detector retroactivo la compensa. Revisar por
  separado si crece.
- **No** se toca `mergeParticipants` ni `PARTICIPANT_REFERENCES`: el motor está probado.
- **No** hay fusión automática ni sugerencias proactivas fuera de las dos superficies (stats y
  diálogo de duplicados).
- **No** se cubre deduplicación entre comunidades distintas (el scope del detector es una
  comunidad y sus retiros).
