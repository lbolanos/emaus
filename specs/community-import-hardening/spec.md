# Spec: Importar miembros desde un retiro, sin sorpresas

**Estado**: implementado, sin mergear a master · **Branch**: `worktree-community-import-hardening` · **Fecha**: 2026-10-22

## Problema

El 2026-10-22, al importar a la comunidad «Buen despacho» los participantes del retiro Buen
Despacho 2026, el modal mostró «Request failed with status code 500». Lo que pasó por debajo:

- **Un participante compartía teléfono con un miembro.** Alberto Garay (caminante, cancelado) se
  registró con el teléfono de Eduardo Garay, que ya era miembro. El trigger de teléfono único por
  comunidad rechazó el alta y el error escaló crudo como 500. El arreglo de urgencia (`80be2d96`,
  en prod) salta y reporta a quien choca, pero **el aviso llega después de importar** y es un toast
  de 15 segundos: si el admin no lo lee a tiempo, no queda rastro de quién se quedó fuera.
- **El import no era atómico.** Antes del error ya habían entrado 25 personas; el admin vio un
  error y no supo que la mitad sí entró.
- **Entraron 7 cancelados**: el modal ofrecía a todos, y «Seleccionar todos» los incluía.
- **El modal no conocía el tipo ni la cancelación**: leía la lista de `participants.retreatId`
  (el retiro primario) y no de `retreat_participants`. El filtro Caminantes/Servidores no
  funcionaba y un servidor activo cuyo retiro primario es otro (Oscar Martínez Díaz) nunca se
  ofrecía.
- **Hueco de autorización**: los dos endpoints solo validan que el usuario administre la
  comunidad. Con un `retreatId` de un retiro ajeno, un admin de comunidad puede listar su roster
  (nombre, correo, teléfono, dirección) y meter a cualquier participante de cualquier retiro como
  miembro, aunque no esté en el retiro elegido.
- **Los tests no podían verlo**: la base de test se arma con `synchronize`, que no crea los
  triggers de las migraciones, y la factory da el mismo teléfono a todos los participantes. Los
  tests del import pasaban con dos participantes del mismo teléfono, algo imposible en prod.

## Objetivo

El admin ve **antes** de importar a quién no se puede traer y por qué, el resultado del import
queda a la vista hasta que lo cierra, y nadie puede importar ni listar gente de un retiro al que
no tiene acceso.

## Decisiones

| # | Decisión | Alternativa descartada |
| --- | --- | --- |
| D0 | **Cancelados fuera por defecto** (ya hecho en M0): la lista sale de `retreat_participants` con `type` e `isCancelled`; los cancelados se ocultan y un interruptor «Incluir cancelados (N)» los muestra. | Filtrar en el servidor: el admin no podría importar a un cancelado que sí quiere en la comunidad. |
| D1 | **Conflicto de teléfono visible antes de importar**: el candidato cuyo teléfono ya tiene un miembro se muestra con «Su teléfono ya es de X», sin casilla habilitada, y «Seleccionar todos» lo salta. | Dejarlo seleccionable y saltarlo al importar: es lo que hay hoy, y el aviso llega tarde. |
| D2 | **El resultado se queda en el modal**: si alguien se quedó fuera, el diálogo no se cierra; muestra quién no entró y por qué, y recarga la lista. Si entraron todos, toast y cierre, como ahora. | Toast más largo: sigue desapareciendo, y con varias personas no cabe. |
| D3 | **El servidor solo importa a quien está en el roster del retiro** (`retreat_participants`, sin datos borrados). El resto se salta con motivo, no se crea. | Confiar en que el modal solo manda ids del roster: el endpoint es la frontera de seguridad, no el modal. |
| D4 | **Ambos endpoints exigen acceso al retiro**, con la misma regla que arma la lista de retiros del modal: `user_retreats` activo, creador del retiro o superadmin (`requireRetreatAccessOrCreator`). | `requireRetreatAccess` a secas: deja fuera al creador del retiro, que sí ve el retiro en la lista del modal. |
| D5 | **Una fila que falla no corta el lote**: se reporta como «error inesperado» en el resultado y queda en el log del API. | Transacción única: los helpers usan los repositorios globales y SQLite ya dio «cannot start a transaction within a transaction» en el import de participantes (troubleshooting §25.3). |
| D6 | **La base de test instala el trigger y el índice de teléfono** corriendo el `up()` de la propia migración, y la factory da un teléfono distinto a cada participante. | Copiar el SQL en cada test que lo necesite: es lo que hay hoy en un `describe`, y el resto de la suite sigue sin verlo. |
| D7 | **Errores legibles**: el modal usa `apiErrorMessage` (mensaje del servidor), y el controlador responde en español si el import falla entero. | Mostrar `error.message` de axios: «Request failed with status code 500» no dice nada. |

## Historias

1. Como admin de comunidad, al elegir un retiro veo a Alberto Garay marcado «Su teléfono ya es de
   Eduardo Garay» y no puedo seleccionarlo; «Seleccionar todos» trae a los demás.
2. Como admin, si al importar alguien no entra (por ejemplo, otro admin agregó a su familiar un
   segundo antes), el modal sigue abierto y me dice quién y por qué.
3. Como admin de una comunidad, si mando un `retreatId` de un retiro al que no tengo acceso, el
   API responde 403 tanto al listar como al importar.
4. Como admin, si mando ids de personas que no están en el retiro, no entran y el resultado lo dice.
5. Como desarrollador, un test que crea dos miembros con el mismo teléfono falla igual que en prod.

## Requerimientos

- R1 `GET /communities/:id/members/potential` devuelve, para cada candidato que no es miembro,
  `phoneConflictWith` con el nombre del miembro que ya tiene su teléfono (misma normalización que
  `findPhoneCollision`: últimos 10 dígitos, mínimo 7).
- R2 `POST /communities/:id/members/import` responde `{ imported, skipped }`; `skipped[].reason` es
  `phone_duplicate_in_community`, `not_in_retreat` o `error`.
- R3 Los dos endpoints responden 403 sin acceso al retiro y 400 sin `retreatId`.
- R4 El modal: fila con conflicto deshabilitada y con el motivo; panel de resultado cuando hay
  saltados; mensajes de error del servidor.
- R5 `setupTestDatabase` instala `trg_cm_phone_uniq_insert`, `trg_cm_phone_uniq_update` y
  `uniq_community_member_overlay_phone`; la suite completa del API sigue en verde.

## Criterios de aceptación

- Con la base de dev, el modal muestra el conflicto de un candidato que comparte teléfono con un
  miembro, y al importar «todos» no aparece ningún 500.
- Tests del servicio: roster ajeno saltado, conflicto marcado en la lista, fila con error no corta
  el lote.
- Tests de rutas: 403 sin acceso al retiro en los dos endpoints.
- Suite completa del API y del web en verde; `vue-tsc` y `tsc` sin errores nuevos.

## Fuera de alcance

- **Familias que comparten teléfono.** La regla de un teléfono por comunidad se mantiene; el
  segundo familiar entra solo por el alta manual con otro número. Cambiar la regla es decisión de
  producto (pendiente con el usuario).
- Quitar de la comunidad a los 7 cancelados importados el 2026-10-22 en prod (operación de datos
  aparte, pendiente de decisión).
- Avisar de dos candidatos seleccionados que comparten teléfono entre ellos: el segundo se salta
  al importar y sale en el panel de resultado (D2).
- La etiqueta de origen del miembro (`sourceRetreatId`), que trae otra sesión en paralelo: se
  integra al mergear.
