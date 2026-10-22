# Tasks: Importar miembros desde un retiro, sin sorpresas

Marcar al cerrar cada milestone, anotando las desviaciones reales respecto al plan.

## M0 — Cancelados fuera por defecto (D0)

Hecho en el árbol principal y movido a este worktree como parche.

- [x] `getPotentialMembers` lee `retreat_participants` y devuelve `type` e `isCancelled`
- [x] Modal: cancelados ocultos, interruptor «Incluir cancelados (N)», badge «Cancelado», etiquetas de tipo
- [x] Tests: servicio (roster con tipo y cancelación) y modal (3 casos)

## M1 — Autorización por retiro (D3, D4)

- [x] `requireRetreatAccessOrCreator` con `source` (`params` | `body` | `query`)
- [x] Rutas `potential` e `import` con el middleware
- [x] `importFromRetreat` salta `not_in_retreat` (roster sin datos borrados)
- [x] Tests: 403 en las dos rutas (`communityMemberImportRoutes.simple.test.ts`), middleware
  (`requireRetreatAccessOrCreator.test.ts`), roster ajeno, datos borrados e id inexistente

Desviaciones:

- El middleware responde 400 también cuando el id llega **repetido** en la query
  (`?retreatId=a&retreatId=b` llega como array): con un array, `hasRetreatAccess` habría validado
  un valor y el servicio usado otro.
- El chequeo de roster va **antes** que el de «ya es miembro»: un id fuera del roster sale como
  `not_in_retreat` aunque sea miembro. Así el endpoint no confirma membresías de ids ajenos.
- Los 4 tests de rutas de comunidad que mockean `middleware/authorization` con una lista fija de
  exports necesitaron `requireRetreatAccessOrCreator`: sin él, el router no carga.

## M2 — Conflicto de teléfono visible antes de importar (D1) [P]

- [x] `phoneKey` compartido por `findPhoneCollision` y el listado
- [x] `getPotentialMembers` devuelve `phoneConflictWith`
- [x] Modal: fila deshabilitada con el motivo; select-all la salta
- [x] Tests: servicio (formatos distintos del mismo número, el propio miembro sin conflicto) y modal
  (motivo visible, casilla deshabilitada, select-all, clic en la fila)

Desviaciones:

- El clic en la **fila** también se ignora para esos candidatos (`toggleParticipant`), no solo la
  casilla: la fila entera es clicable.

## M3 — Resultado y errores legibles (D2, D5, D7) [P]

- [x] `importFromRetreat`: fila con error → `skipped` `error`, lote sigue, log
- [x] Controlador: 500 en español si falla entero
- [x] Modal: panel de resultado con saltados; `apiErrorMessage`
- [x] Tipos: `ImportMembersSkip.reason` con los tres motivos
- [x] Tests: servicio (fila con error, carrera que solo ve el trigger), rutas (500 en español) y
  modal (panel con los tres motivos, recarga de la lista, mensaje del servidor)

Desviaciones:

- El `try` cubre **toda la fila**, no solo `addMember`: la búsqueda de «ya es miembro» o del
  choque de teléfono también puede fallar, y el mensaje del controlador («no se agregó a nadie»)
  solo es cierto si ninguna fila lanza.
- Con saltados, el modal no muestra toast: el panel lo reemplaza.

## M4 — La base de test se comporta como prod (D6) [P]

- [x] `setupTestDatabase` corre el `up()` de `UniquePhonePerCommunity20260521170000`
- [x] Factory con teléfono único por defecto (`55` + contador de 8 dígitos)
- [x] Quitar la copia local del trigger en `communityService.test.ts`
- [x] Suite completa del API en verde

Desviaciones:

- Dos tests dependían del teléfono por defecto de la factory (`participantPhones.routes`,
  `shirtReportService`): ahora lo pasan explícito.
- El trigger destapó un test que creaba **tres miembros con el mismo teléfono** en una comunidad
  (`messageSequence.test.ts`, «excluye los estados de canal roto y no-contactar»): imposible en
  prod. Ahora cada uno lleva el suyo; el test prueba estados, no teléfonos.

## M5 — Cierre

- [x] Suites completas: API en 2 shards (336 suites, 5010 tests) y web (260 archivos, 3791 tests)
- [x] `vue-tsc` limpio; `tsc` del API sin errores nuevos (los 9 de los archivos tocados son previos)
- [x] Modal probado en el navegador contra el dev del worktree, comunidad Buen despacho y retiro
  Buen Despacho 2026: Alberto Garay sale deshabilitado con «Su teléfono ya es de Eduardo Garay»,
  «Seleccionar todos» ofrece 25 (sin cancelados) y el import da «Se importaron 25», sin error en
  el log del API
- [x] Desviaciones anotadas en este archivo

### Después del cierre: `POST /communities/:id/members` eliminada

El mismo hueco del import, en otra ruta: agregaba cualquier `participantId` sin validar retiro ni
teléfono. Antes de borrarla se verificó que nadie la usa: ninguna pantalla llama
`addCommunityMember` (solo existía en `api.ts`), los e2e solo hacen `GET`, y en prod hubo 0 `POST`
a esa ruta en los 15 logs de nginx (~14 días). Como control, el mismo patrón sí encontró los
`POST …/members/import` del día. Se borraron la ruta, el controlador y `addCommunityMember`;
`communityService.addMember` sigue como helper interno. Guard: test de rutas que espera 404.

### Revisión de código del cierre

Arreglado:

- Un id repetido en la petición (doble envío) salía dos veces en `imported`: el import deduplica.
- El import ya no recorre todos los miembros por cada fila (`findPhoneCollision`): carga una vez
  quién es miembro y qué teléfonos están tomados (`loadMemberPhoneIndex`, solo las columnas que
  hacen falta) y lo actualiza a medida que entra gente. El listado usa el mismo helper en vez de
  traer la ficha completa de cada participante.
- `participantIds` con tope de 1000 en el schema: acota el `IN` del roster y el bucle de una petición.
- Comentario de `test-setup.ts`: solo este trigger va para toda la suite; el resto de índices de
  migraciones se instala por test.

Descartado, con motivo:

- *`phoneKey` quita todo lo que no es dígito y el trigger no*: el listado y el import usan la misma
  función, así que el modal nunca marca algo que el import deje pasar. Que el código sea más
  estricto que el trigger (puntos) ya era así en `findPhoneCollision` y es lo correcto: es el mismo
  número.
- *El gate de retiro no coincide con la lista del modal*: sí coincide. `GET /retreats`
  (`getRetreatsForUser`) y `requireRetreatAccessOrCreator` usan la misma regla.
- *Doble `fetchMembers` tras importar*: ya pasaba antes (`emit('imported')` existía).
- *`typeLabel` cae en «Servidor» con tipo desconocido*: conserva el comportamiento previo, y
  `retreat_participants.type` siempre viene informado desde el registro y el import.
- *Un error sistémico (base bloqueada) sale como filas `error` con 201*: es la decisión D5. El panel
  lista a cada persona que no entró, y el log del API registra cada falla.
