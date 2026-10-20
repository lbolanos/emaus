# Spec: Mesas — segundo ciclo (deuda del primero)

**Estado**: prospectiva · **Branch**: `worktree-mesas-ciclo2` · **Fecha**: 2026-10-20

Segunda vuelta sobre las specs `tables-mobile-ux` y `table-memory-photo` (ambas fusionadas a
master el 2026-10-20). Este ciclo NO reabre sus decisiones: recoge la deuda que su propio
Reconcile y su review de cierre dejaron anotada, más dos follow-ups de backend detectados en el
merge.

Cambio de alcance respecto a la lista original: el default "Mesa N+1" **ya no entra** — llegó a
master antes que este ciclo por la otra sesión (`e87d9e26 fix(tables): number new tables on the
server from the stored ones`, en `createTable` vía `nextTableName`), verificado 2026-10-20.

## Problema

Cuatro puntos, verificados en el código de master (`fe7eedba`):

1. **El sticky se comió la pantalla de nuevo — ahora con las pastillas dentro.** El merge dejó
   TODO el panel dentro del sticky (`TablesView.vue:5-427`): búsqueda + tabs + toggle + bloque
   de sin-asignar + banner. En un teléfono, con el panel expandido y la página scrolleada, las
   pastillas de sin asignar quedan pinned sobre el contenido (~250-350 px de 844); colapsar el
   panel es manual y el toggle queda arriba, lejos del contenido que estás viendo. La deuda
   anotada en `tables-mobile-ux` ("sticky compacto con el banner integrado") sigue abierta: el
   banner sí quedó pinned (el merge lo subió al sticky), pero a costa de que también pinned todo
   lo demás.
2. **Eliminar la foto de mesa no pide confirmación.** `TableMemoryPhotoDialog.vue:158`
   `removePhoto` ejecuta el DELETE al primer toque del botón "Eliminar foto". Es la única
   acción destructiva del área sin confirmación — borrar la mesa SÍ confirma
   (`TablesView.handleDeleteTable` → `isDeleteDialogOpen`).
3. **N+1 en "Mis Retiros".** `retreatController.getAttendedRetreats` llama
   `tablePhotosForRetreat(retreat.id)` una vez por retiro atendido
   (`retreatController.ts:709-714`): un usuario con N retiros dispara N queries a `tables` por
   cada apertura de la vista.
4. **Presign repetido de las mismas keys + mass-assignment en POST /tables.** (a) Cada lectura
   presigna cada foto: la vista de Mesas (`findTablesByRetreatId`), el detalle, la subida
   (respuesta) y la galería firman la MISMA key S3 una y otra vez — `getSignedReadUrl` no tiene
   caché (`s3Service.ts:404`). (b) `createTable` del controller pasa `req.body` crudo al
   service (`tableMesaController.ts:91`), y el service hace `repos.tableMesa.create({...tableData})`:
   un POST con `photoUrl`/`liderId`/lo-que-sea colaría campos que no corresponden a la creación
   (mass-assignment).

## Objetivo

Que el panel sticky de Mesas ocupe en móvil solo lo imprescindible (con el banner de
tap-to-assign siempre visible cuando hay seleccionado), que eliminar la foto de mesa pida
confirmación como el resto de las acciones destructivas, y que los dos follow-ups de backend
(query batch y presign cache) cierren el costo de la galería de recuerdos.

## Decisiones

| # | Decisión | Alternativa descartada |
| --- | --- | --- |
| D1 | **Pastillas fuera del sticky en móvil**: el bloque móvil de sin-asignar (`md:hidden`, `v-show="unassignedPanelOpen"`) sale del panel sticky y scrolla con el contenido. El banner de tap-to-assign NO se mueve (ya vive en el sticky, arriba del bloque de pastillas) y queda pinned junto a la búsqueda + ⋮ y la fila de tabs + toggle. El flujo no se rompe: para elegir pastilla se scrollea arriba (están al inicio), y con participante seleccionado el banner pinned guía desde cualquier punto de la página. Desktop (`md+`): sin cambios. | Auto-colapsar las pastillas al scrollear (listener de scroll + clase): más móvil de JS, parpadeo en el borde del scroll, y el usuario pierde el control de su propio panel. |
| D2 | **Confirmación inline en dos pasos para eliminar la foto**: el botón "Eliminar foto" del `TableMemoryPhotoDialog` pasa a estado de confirmación en el mismo lugar ("¿Eliminar foto?" + Cancelar/Confirmar) tras el primer toque. Sin dialog anidado. | `AlertDialog` de `@repo/ui` sobre el dialog existente: dialog-sobre-dialog con reka-ui suma el riesgo del freeze (`useRekaDialogFix`) para una acción de bajo costo (la foto se puede resubir). Sin confirmación: inconsistente con borrar mesa, que sí confirma. |
| D3 | **`tablePhotosForRetreats(retreatIds)` batch**: una sola query `where: { retreatId: In(ids) }`, agrupado por retiro; `tablePhotosForRetreat(id)` delega en ella. `getAttendedRetreats` la usa con todos los retiros atendidos. | Dejar el N+1: "son pocas filas" — pero crece con la historia del usuario y la vista se abre en cada login a "Mis Retiros". |
| D4 | **Caché de presign en `getSignedReadUrl`**: `Map<key, {url, expiresAt}>` en memoria del proceso; una firma se reusa mientras falte >30 min para expirar (firma a 60 min, `SIGNED_URL_TTL_SECONDS = 3600`). Podado al crecer (>500 entradas, las más viejas primero). Como la key S3 de la foto de mesa es fija por mesa (`tables/{tableId}.webp`), reemplazar la foto NO invalida la URL cacheada — apunta a la key, no a una versión. | Memoización por request: seguiría firmando en cada request; la firma es crypto local (Sin red), pero list + galería + detalle pisan las mismas keys decenas de veces por sesión. |
| D5 | **zod en `POST /tables`**: `createTableBodySchema` (`retreatId` uuid, `name` opcional acotado) en el controller antes de llamar al service, patrón de `updateTable` (`renameTableBodySchema`). El spread `...tableData` del service queda limitado a campos conocidos. | Sanitizar en el service con pick de campos: el controller es la frontera del API y ya lo hace así para rename. |

## Historias

1. Como coordinador con el celular, scrolleo la vista de Mesas con el panel expandido y las
   pastillas se van con el contenido — solo queda pinned lo que necesito: búsqueda, tabs y (si
   hay seleccionado) el banner con Quitar/Cancelar.
2. Como coordinador, al tocar "Eliminar foto" el sistema me pide confirmar antes de borrar, y
   puedo arrepentirme sin cerrar el diálogo.
3. Como usuario con retiros acumulados, "Mis Retiros" no dispara una query de mesas por retiro.
4. Como desarrollador, las firmas S3 de las fotos (mesa y galería) se calculan una vez por
   ventana de 30 min y `POST /tables` solo acepta los campos de creación.

## Requerimientos

- **R1** (D1): a 390 px, sticky base (sin banner, sin barra de asistencia) ≤ 130 px; con
  participante seleccionado y la página scrolleada, el banner `tap-assign-banner` sigue visible
  con sus botones accionables; el bloque de pastillas NO queda pinned al scrollear. Desktop sin
  cambios de layout (`md+` igual que hoy).
- **R2** (D2): el primer toque en "Eliminar foto" NO llama al API; muestra confirmación inline;
  confirmar ejecuta el DELETE; cancelar restaura el botón normal. Keys i18n en es.json Y en.json.
- **R3** (D3): `getAttendedRetreats` ejecuta exactamente 1 query contra `tables` para todos los
  retiros atendidos (verificable con spy en el repo), y la respuesta es byte-idéntica a la de
  hoy (mismos items, mismo orden por retiro).
- **R4** (D4): dos llamadas a `getSignedReadUrl(key)` dentro de la ventana de caché retornan la
  misma URL sin re-firmar; a los 30 min re-firma; el podado no tira entradas vigentes.
- **R5** (D5): `POST /tables` con campos extra (`photoUrl`, `liderId`, …) responde 201 y crea
  la mesa SOLO con `retreatId`/`name` — los extras no llegan a la fila; body sin `retreatId`
  uuid válido → 400.

## Criterios de aceptación

Contra datos que existen: retiro demo Buen Despacho (`e9b3c568`, 10 mesas con walkers, DB de
dev). Si no hay mesas con `photoUrl` en la DB del worktree, se sube una por el API en la
verificación (R2/R4 la necesitan).

- Tests: `tableMemoryPhoto.test.ts` extendido con el batch (R3) y el parse de creación (R5);
  `s3PresignPrivateUrl.test.ts` extendido con la caché (R4); test del diálogo de foto con la
  confirmación inline (R2); `TablesView` suites del área verdes tras el cambio de R1.
- Verificación manual en Playwright (viewport 390×844 touch, Buen Despacho): medir el sticky
  base con la página scrolleada; pastillas expandidas se van al scrollear; con pastilla
  seleccionada, banner visible y "Quitar de mesa"/"Cancelar" clicables con la página abajo;
  eliminación de foto con confirmación en dos pasos; asignación por tap sigue funcionando
  (regresión del flujo D5 de la spec madre).
- `vue-tsc` limpio; suites Jest del área verdes (una corrida a la vez).

## Fuera de alcance

- Reabrir decisiones de las specs madre (⋮ siempre, banner, dialog móvil, foto por mesa): este
  ciclo solo mueve el bloque de pastillas y añade la confirmación.
- La barra de asistencia (queda pinned cuando está activa; es opt-in y compacta).
- Caché de presign compartida entre procesos / Redis: un solo proceso pm2 sirve el API.
- Renumerar o migrar specs madre: sus Reconcile quedan como historia; este ciclo es una spec
  nueva que las cita.
