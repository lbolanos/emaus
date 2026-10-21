# Spec: modo sin conexión durante el retiro (offline + sincronización)

> SDD spec — versión 1.1 (2026-10-19). Estado: **en revisión con Leonardo** (gate de M0: no se
> codea M1 sin el OK de commit). Cerradas en la revisión del 2026-10-19: la caché vive solo
> durante la ventana del retiro y se borra al cerrarla (D9); los datos de salud nunca se guardan
> en el dispositivo (D3/D9); M1 (PWA) sale a prod por separado (plan.md §Despliegue).
> Artefactos: [spec.md](spec.md) (qué y por qué) → [research.md](research.md) (estado actual
> verificado) → [plan.md](plan.md) (cómo) → [tasks.md](tasks.md) (desglose por milestones).

**Branch**: `worktree-offline-mode` (worktree `.claude/worktrees/offline-mode`, base
`origin/master` = `1bf67691`) · **Fecha**: 2026-10-19

## Problema

En la casa de retiro el internet es muy malo: a ratos no hay señal y a ratos hay señal que no
alcanza para completar una petición. La app es 100 % en línea:

- cada vista pide sus datos al montar y, si la petición falla, muestra un toast de error o una
  pantalla vacía (`participantStore.fetchParticipants`, `RecepcionView.fetchStats`);
- cada acción es una llamada REST que, si no llega, se pierde: el check-in de recepción, el cobro
  en la puerta, la bolsa marcada, el "Completar" del minuto a minuto, el cambio de cama;
- si el equipo recarga la página sin señal, no carga ni el cascarón: `index.html` se sirve con
  `no-store` desde nginx y no hay service worker;
- al arrancar sin señal, el guard del router no puede confirmar la sesión y manda al login
  (`router.beforeEach` → `checkAuthStatus` → `isAuthenticated=false`).

El resultado práctico, vivido en los retiros: el equipo vuelve al papel durante el fin de semana
y captura todo el lunes, o nunca. Lo que se necesita es **poder seguir operando sin señal con los
datos que ya se tenían, y que lo hecho sin señal llegue al servidor solo, cuando haya señal**.

## Decisiones de dominio (defaults propuestos; se confirman o corrigen en la revisión)

| # | Decisión | Default propuesto |
|---|----------|-------------------|
| D1 | **Ventana** en la que aplica el modo sin conexión | El retiro "en vivo" según `isRetreatLive` (desde 1 día antes de `startDate` hasta `endDate` inclusive, en la TZ del retiro, `apps/web/src/utils/retreatLiveStatus.ts`). Fuera de la ventana la app sigue siendo solo en línea, salvo la preparación manual (D4). |
| D2 | **Qué se puede hacer sin señal** (nivel 1, escrituras encoladas) | Recepción: llegó / deshacer / cobrar en la puerta / **cancelar al que no llegó** (cerrado 2026-10-19: se espera hasta la noche del viernes y se cancela el sábado en la mañana, en la casa). Bolsas: marcar / desmarcar. Minuto a minuto: iniciar, completar, −5/+5 de un ítem, mover el día entero. Camas: asignar, mover, desasignar. Mesas: asignar y quitar caminante. Nada más se encola en v1 (ver "Fuera de alcance"). La cancelación sin señal es **solo la bandera** `isCancelled` (con su cascada de siempre: libera cama y mesa); la nota del motivo se escribe con señal, porque `notes` es un campo de salud (D3). |
| D3 | **Qué se puede consultar sin señal** (nivel 2, lectura desde caché) | Lo que el equipo consulta en la casa: caminantes, servidores, angelitos, recepción, camas, mesas, minuto a minuto (con los guiones markdown inline), responsabilidades, mi agenda, bolsas, playeras, gafetes, palancas, Santísimo (solo lectura), dashboard del retiro. Se sirve lo último descargado, con indicador de antigüedad. **Salud queda fuera (cerrado 2026-10-19)**: Alimentación y Medicamentos son solo en línea, y los campos de `SENSITIVE_HEALTH_FIELDS` (`packages/types/src/permissions.ts`: detalle de medicación y dieta, apoyo por discapacidad, `notes` y los dos contactos de emergencia completos) se recortan de la lista de participantes **antes** de guardarla, tenga o no el usuario `participant:health`. Consecuencia visible: sin señal no se ven notas ni contactos de emergencia. |
| D4 | **Cuándo se descargan los datos** | Automático: cada vez que el usuario abre el retiro con señal dentro de la ventana D1. Manual: botón "Preparar para trabajar sin conexión" en el dashboard del retiro, disponible desde 7 días antes de `startDate` (el jueves en casa, antes de salir). Sin señal se usa lo que haya; si no hay nada descargado, la vista lo dice en vez de quedar vacía. |
| D5 | **Resolución de conflictos** entre dispositivos | **Orden de llegada al servidor** con las validaciones de siempre: el servidor aplica cada operación encolada como si se hubiera hecho en línea. Lo que el servidor rechaza (cama ocupada, participante cancelado, ítem borrado) queda en una lista de **Conflictos** en el dispositivo que lo generó, con el mensaje del servidor, para que esa persona lo resuelva a mano (reintentar o descartar). No hay fusión automática ni "el último gana" sobre registros completos. |
| D6 | **Cobros duplicados** | Cada operación encolada lleva una **clave de idempotencia** generada en el dispositivo: reenviarla (por timeout o por reintento) nunca crea un segundo pago. Dos personas distintas cobrando al mismo caminante sin señal producen **dos pagos**, igual que hoy en línea; el resumen de sincronización lista los pagos aplicados para que tesorería lo vea. |
| D7 | **Hora de los hechos** | El check-in, el inicio y el fin de una actividad del minuto a minuto guardan la **hora en que ocurrió en el dispositivo** (`occurredAt`), no la hora en que llegó al servidor. Hoy el servidor pone `new Date()` en los tres casos; con sincronización diferida, el domingo todos los check-ins quedarían a la misma hora. |
| D8 | **Identidad sin señal** | La sesión es la cookie de siempre (30 días rolling, techo 90 días); no hay login sin señal. Para arrancar la app sin señal se guarda en el dispositivo el **perfil de permisos** que devolvió `/auth/status` la última vez; sirve solo para pintar la UI. **El servidor sigue validando cada operación al sincronizar**: si la sesión murió, las operaciones quedan en cola y la app pide iniciar sesión cuando vuelva la señal; nada se descarta. |
| D9 | **Datos personales en el dispositivo** (cerrado 2026-10-19) | La caché guarda lo que la API devolvió a ese usuario **menos los campos de salud** (D3). **Dura solo la ventana D1**: al cerrarla (día siguiente a `endDate` en la TZ del retiro) se borra sola, al arrancar la app o al terminar una sincronización; también se borra al cerrar sesión y con el botón "Borrar datos sin conexión". La **cola de pendientes nunca se borra sola**: si al cerrar la ventana quedan cambios sin sincronizar, se conservan y el panel lo avisa hasta que se sincronicen o se descarten. Sin cifrado adicional (sin clave que proteger no hay cifrado real en un navegador); el riesgo se documenta en la ayuda. |
| D10 | **Señal mala vs. sin señal** | No se confía en `navigator.onLine`. El estado se deriva del resultado de las peticiones: fallo de red o **timeout de 10 s** en una escritura de nivel 1 → la operación se encola y la app pasa a "sin conexión"; una petición que vuelve a responder → "en línea". Sincroniza al volver la señal (`online`, al volver a la pestaña, cada 30 s mientras haya cola, y con botón manual). |
| D11 | **Qué ve el equipo** | Un chip de estado permanente en el sidebar: `En línea` · `Sin conexión · N cambios pendientes` · `Sincronizando…` · `N conflictos`. Un panel "Pendientes de sincronizar" con cada cambio (qué, quién, cuándo), reintentar y descartar. Las vistas de nivel 2 muestran "datos de hace X min" cuando sirven caché. Las acciones que no funcionan sin señal (mensajes, importar, exportar, auto-asignar, borrar) se deshabilitan con el motivo, no fallan con un toast genérico. |
| D12 | **Cascarón de la app sin señal** (PWA) | Service worker que precachea la app para que **recargar o abrir la app sin señal funcione**, y `manifest` para "Agregar a pantalla de inicio" (en iOS además evita que Safari borre el almacenamiento a los 7 días). La API **no** se cachea en el service worker: los datos viven en IndexedDB bajo control de la app (D3), para poder mostrar antigüedad y aplicar encima los cambios pendientes. |
| D13 | **Corregir la ficha sin señal** (pedido 2026-10-20) | Solo campos personales de una lista cerrada, `OFFLINE_EDITABLE_PARTICIPANT_FIELDS` en `packages/types`: nombre, apellido, apodo, celular, teléfonos de casa y trabajo, parroquia, ocupación, dirección (calle, número, colonia, CP, municipio, estado, país), talla de playera y si ronca. Se envían **solo los campos cambiados** junto con el valor que tenían al editarlos (`expectedValues`); el servidor rechaza con 409 si alguno cambió en el servidor mientras tanto, así que nunca pisa en silencio el cambio de otro (no hay "último gana"). Quedan fuera: el correo (identidad global del participante), salud, los datos del retiro (tipo, beca, palancas, invitador, notas), fechas, sacramentos y etiquetas. |

## Objetivo

Que el equipo del retiro siga usando la app el fin de semana con señal mala o nula, en sus propios
teléfonos, viendo los datos que ya tenía y registrando lo que pasa (llegadas, cobros, bolsas,
agenda, camas, mesas), y que todo lo registrado llegue al servidor solo y sin duplicados cuando
haya señal, con la hora real de cada hecho y con un lugar donde ver lo que el servidor rechazó.

## Historias de usuario

- **HU-1 (recepcionista, viernes en la puerta)**: Abro Recepción sin señal, veo la lista de
  pendientes que descargué, marco "Llegó" y cobro en efectivo a quien paga en la casa. Más tarde,
  cuando el teléfono agarra señal un momento, todo sube solo; si abro la vista en otro celular,
  veo los mismos llegados.
- **HU-2 (coordinador de minuto a minuto)**: Marco Iniciar/Completar y ajusto −5/+5 durante el
  sábado sin señal. El domingo, al sincronizar, cada actividad conserva la hora real en que la
  marqué (no la hora de la sincronización).
- **HU-3 (logística, viernes noche)**: Un caminante no llegó y otro ronca; muevo gente de cama
  sin señal. Si otra persona movió a alguien a esa misma cama desde otro dispositivo, al
  sincronizar veo el conflicto con el mensaje del servidor y lo resuelvo yo.
- **HU-3b (recepción, sábado en la mañana)**: Los que no llegaron en toda la noche del viernes
  los cancelo desde la lista de Faltan, sin señal. Al sincronizar quedan cancelados, sin cama y
  sin mesa, igual que si lo hubiera hecho en línea. El motivo lo anoto después, con señal.
- **HU-4 (servidor, cualquier momento)**: Abro Mi agenda y los guiones de mi charla sin señal.
- **HU-5 (coordinador, jueves en casa)**: Pulso "Preparar para trabajar sin conexión" con buen
  internet y salgo tranquilo: todas las vistas del retiro quedan descargadas en mi teléfono.
- **HU-6 (cualquiera, con señal intermitente)**: Una acción tarda más de 10 s; la app no se queda
  colgada: la encola, me lo dice, y la reenvía sola sin duplicarla.
- **HU-7 (tesorero, lunes)**: Veo en el resumen de sincronización qué pagos se registraron sin
  señal, por quién y cuándo.

## Requerimientos

### Cascarón y arranque

- **FR-1** La app instala un service worker que precachea `index.html` y todos los chunks con
  hash salvo `vendor-geo` (solo lo usa el registro público), y cachea en tiempo de ejecución
  `runtime-config.js` (red primero), los chunks excluidos y las imágenes del mismo origen.
  Recargar o abrir la app sin señal renderiza el cascarón y cualquier vista del retiro. Solo se
  registra dentro de `/app`; con `offlineMode: false` se desregistra y borra sus cachés.
- **FR-2** La actualización del service worker se integra al banner existente de nueva versión
  (`UpdateBanner.vue` / `versionStore`): nunca se activa una versión nueva sin que el usuario
  acepte, para no cambiar chunks debajo de una vista abierta.
- **FR-3** `manifest.webmanifest` con nombre, íconos y `display: standalone`.
- **FR-4** Sin señal (o con un 429 del limitador) el arranque **no** redirige al login si hay un
  perfil de permisos guardado de menos de 30 días (D8). Con señal, `/auth/status` sigue
  mandando; un 401 real limpia el perfil guardado.
- **FR-5** nginx sirve `sw.js`, el manifest y `runtime-config.js` con `no-cache` (hoy todo `.js`
  es `immutable` un año, lo que congelaría el service worker y el interruptor `offlineMode`).

### Datos de lectura (nivel 2)

- **FR-6** Las respuestas de los GET de la lista blanca (research §"Endpoints por vista") se
  guardan en IndexedDB con la URL completa como clave, `fetchedAt`, `userId` y `retreatId`.
- **FR-7** Si un GET de la lista blanca falla por red o timeout, se responde desde IndexedDB
  marcando la respuesta como `fromCache` con su `fetchedAt`; un banner común bajo el
  encabezado dice "datos guardados hace X" (el más viejo mostrado). Si no hay caché, el error
  dice "Sin conexión y sin datos guardados para esta pantalla" y el banner lo menciona.
- **FR-8** "Preparar para trabajar sin conexión" descarga en secuencia todos los datasets de la
  lista blanca para el retiro seleccionado y precalienta los chunks de las vistas de D3, con
  barra de progreso y resumen final (qué se descargó, tamaño, hora). Nunca descarga ni calienta
  Alimentación ni Medicamentos.
- **FR-9** La preparación automática (D4) corre al abrir el retiro con señal dentro de la ventana
  D1, en segundo plano, sin bloquear la navegación, y como máximo una vez cada 15 min.
- **FR-9b** Antes de guardar cualquier respuesta de `/participants` en IndexedDB se le aplica el
  recorte de `SENSITIVE_HEALTH_FIELDS` (la misma lista que usa el API en
  `stripSensitiveHealthFields`); un test fija que ninguna clave de esa lista llega al
  almacenamiento. Las vistas Alimentación y Medicamentos no entran en la lista blanca y sin
  señal muestran "Necesita conexión".
- **FR-9c** Al cerrar la ventana D1 se borran las respuestas cacheadas del retiro (D9), al
  arrancar la app o al terminar una sincronización; la cola con pendientes se conserva y el
  panel avisa.

### Escrituras (nivel 1) y sincronización

- **FR-10** Cada operación de D2 se encola en IndexedDB con: id, `idempotencyKey` (UUID),
  `kind`, `payload`, `retreatId`, `userId`, `occurredAt` (hora del dispositivo), `attempts`,
  `status` (`pending` | `syncing` | `conflict` | `done`), `lastError`.
- **FR-11** La cola se **aplica localmente** de inmediato: cada `kind` tiene un reductor que
  parchea los datasets cacheados que afecta (p. ej. `checkin` mueve al caminante de `pendingList`
  a `arrivedList` y marca `checkedIn` en la lista de participantes), de modo que las vistas
  reflejan lo hecho aunque recarguen desde caché.
- **FR-12** La sincronización reenvía la cola **en orden FIFO, de una en una**, por los mismos
  endpoints de siempre, con cabecera `Idempotency-Key` y `occurredAt` en el body donde aplica
  (D7). Pausa ante error de red/timeout/5xx (reintento con backoff) y ante 401 (pide login).
  Ante 4xx de validación marca esa operación como `conflict` y **sigue** con la siguiente.
- **FR-13** Al terminar una sincronización con éxito, se refrescan los datasets del retiro desde
  el servidor y se descartan los parches locales ya aplicados.
- **FR-14** Panel "Pendientes de sincronizar" (D11) con la cola, los conflictos con el mensaje
  del servidor, y acciones reintentar / descartar por operación y "sincronizar ahora".
- **FR-15** Las acciones no encolables (D11) se deshabilitan sin señal con tooltip
  "Necesita conexión"; en ningún caso se pierde silenciosamente una acción.
- **FR-15b** Cancelar al que no llegó es una acción propia por fila en la lista de Faltan de
  Recepción (y en Caminantes), con confirmación y gate `participant:update`. Manda un body
  **explícito** `{ isCancelled: true, contextRetreatId }` a `PUT /participants/:id`, nunca la
  ficha completa; sin señal se encola y el reductor la quita de Faltan, libera su cama y su
  mesa en la caché. Reactivar es la misma operación con `false`.
- **FR-15c** (D13) Sin señal, "Guardar" en la ficha manda a la cola solo los campos cambiados
  de la lista blanca, con `expectedValues` y `contextRetreatId`. Si cambiaste un campo fuera de
  la lista, no se guarda nada y el aviso nombra esos campos; el diálogo queda abierto con lo
  escrito. Al abrir la ficha sin señal, un aviso dice qué se puede guardar. El reductor pinta
  los campos en Caminantes, Recepción, Camas y Mesas.

### Servidor

- **FR-16** Middleware de idempotencia para los endpoints de D2: con `Idempotency-Key` presente,
  la primera ejecución guarda `(key, userId, method, path, status)` en una tabla nueva, más el
  cuerpo solo si es un 4xx; cualquier repetición devuelve ese resultado sin volver a ejecutar
  (un 2xx se repite como `{ idempotentReplay: true }`); TTL 7 días. Mientras la primera sigue en
  curso responde 409 `IDEMPOTENCY_IN_PROGRESS`; un 5xx libera la clave. Una misma clave con
  distinto `userId`, `method` o `path` responde 422.
- **FR-16b** (D13) `PUT /participants/:id` acepta `expectedValues` (opcional). Si viene, compara
  cada campo listado de la lista blanca con el valor actual (vacío = nulo; teléfonos ya
  normalizados) y, si alguno difiere, responde 409 `PARTICIPANT_CHANGED_MEANWHILE` con los
  campos y no escribe nada. `expectedValues` nunca se guarda. Sin `expectedValues`, la edición de
  siempre no cambia.
- **FR-17** `PUT /participants/:id/checkin`, `POST /schedule/items/:id/start` y
  `POST /schedule/items/:id/complete` aceptan `occurredAt` opcional (ISO 8601, no futuro, no más
  de 14 días atrás) y lo usan como `checkedInAt` / `actualStartTime` / `actualEndTime`. Sin el
  campo, se comportan como hoy.
- **FR-18** La auditoría de dominio registra `occurredAt` (de `X-Client-Time`) en la metadata
  de las operaciones que llegaron con `Idempotency-Key`, y `syncedFromOutbox: true` cuando
  además traen `X-Outbox-Sync: 1` (reenviadas desde la cola), para distinguir el hecho de su
  llegada.
- **FR-19** Migración única, SQL plano, sin imports del workspace, reversible, para la tabla de
  idempotencia.

### No funcionales

- **NFR-1 — Tamaño**: la preparación de un retiro grande (181 inscritos con pagos, 149 ítems de
  agenda, 188 camas, 17 mesas, 45 turnos de Santísimo — máximos de la DB de dev) cabe en
  < 5 MB de IndexedDB y < 2 MB de descarga comprimida.
- **NFR-2 — Peso móvil**: el guard `mobile-page-weight.spec.ts` sigue verde; el service worker
  no precachea chunks de ruta pesados (registro, mapas) y no descarga nada en las rutas
  públicas (landing, registro, Santísimo público).
- **NFR-3 — Safari iOS**: el registro del service worker ocurre después de `app.mount` desde un
  `import()` dinámico; nada estático nuevo en `main.ts` (skill `safari-ios-compatibility`).
- **NFR-4 — Sin cambios en línea**: con señal buena, ninguna vista cambia de comportamiento
  observable salvo el chip de estado; los tests existentes siguen verdes.
- **NFR-5 — Reversible**: un flag de runtime (`window.EMAUS_RUNTIME_CONFIG.offlineMode`) apaga
  la cola y la caché sin redeploy del frontend; desinstalar el service worker es un release.

## Criterios de aceptación (end-to-end)

> Datos: la DB de dev tiene un retiro recién terminado (`e9b3c568…`, 2026-10-16/18, 31 caminantes
> y 23 servidores) y uno grande (`293a9f80…`, 2026-09-04/06, 93/57, 181 inscritos). Ninguno está
> "en vivo" hoy; para los CA que dependen de D1 se **mueven las fechas de un retiro en la DB
> desechable del worktree** (`start-worktree-dev.sh` la recrea en cada arranque) o se inyecta
> `now` en los tests unitarios. Los CA de conflicto (10) necesitan dos sesiones; se verifican con
> dos contextos de Playwright.

1. **Cascarón**: con el stack del worktree, abrir el dashboard del retiro, poner el contexto en
   `setOffline(true)` y recargar → la app renderiza (no página en blanco ni error de red), el
   chip dice "Sin conexión".
2. **Arranque sin login**: tras un login con señal, cerrar la pestaña, abrir una nueva sin señal
   → entra al dashboard, no al login (D8). Con señal y sesión revocada en la DB → 401 → login y
   perfil guardado borrado.
3. **Preparar**: botón en el dashboard → progreso → resumen con los datasets y el tamaño total;
   `indexedDB` contiene una entrada por URL de la lista blanca con `retreatId` del retiro.
4. **Lectura desde caché**: sin señal, Caminantes, Camas, Mesas, Minuto a minuto, Recepción y
   Responsabilidades muestran los datos preparados y el indicador "datos de hace X min"; un
   retiro no preparado muestra "Sin datos descargados". Alimentación y Medicamentos sin señal
   muestran "Necesita conexión", y la ficha de un caminante en la lista cacheada no tiene
   `medicationDetails`, `notes` ni contactos de emergencia aunque el usuario sea superadmin.
5. **Check-in encolado**: sin señal, "Llegó" mueve al caminante a Llegados con la hora del
   dispositivo, el chip dice "1 cambio pendiente"; recargar sin señal conserva ese estado (FR-11).
   Al volver la señal, el servidor queda con `checkedIn=true` y `checkedInAt` igual a la hora
   del dispositivo (D7), no la de la sincronización.
6. **Cobro idempotente**: sin señal, cobrar $500 en efectivo → encolado; cortar la señal a mitad
   de la sincronización (ruta abortada tras llegar al servidor) y reintentar → **un solo pago** en
   `payments` con esa `Idempotency-Key`.
7. **Minuto a minuto**: sin señal, Iniciar → Completar → +5 en tres ítems; al sincronizar, el
   orden se respeta y `actualStartTime/actualEndTime` son las horas del dispositivo.
8. **Camas y mesas**: sin señal, mover un caminante de cama y de mesa; al sincronizar, el servidor
   refleja ambos movimientos y la otra pestaña (WebSocket) los ve.
9. **Bolsas**: sin señal marcar 3 bolsas → al sincronizar `bagMade=true` en las tres.
10. **Conflicto**: dos contextos sin señal mueven a dos caminantes distintos a la **misma cama**;
    el primero en sincronizar gana; el segundo ve la operación en "Conflictos" con el mensaje del
    servidor y puede descartarla o reintentarla tras elegir otra cama.
11. **Sesión caída**: cola con 2 cambios y sesión destruida en la DB → la sincronización se
    detiene con "Inicia sesión para sincronizar", la cola se conserva, y tras el login se vacía.
12. **Timeout = encolar, no duplicar**: con la API respondiendo en 15 s (`page.route` con delay),
    un check-in se encola a los 10 s; cuando el servidor sí procesó el original, el reenvío con la
    misma clave devuelve la respuesta guardada y no hay segundo evento de auditoría.
13. **Acciones bloqueadas**: sin señal, "Enviar WhatsApp", "Importar", "Auto-asignar camas" y
    "Exportar" aparecen deshabilitados con el tooltip; ninguna produce toast de error.
14. **Purga**: cerrar sesión borra IndexedDB; un retiro cuya ventana cerró (`endDate` anterior a
    hoy en su TZ) no tiene respuestas cacheadas al abrir la app; si ese retiro tenía una cola
    con pendientes, la cola sigue ahí y el panel la muestra con el aviso.
16. **Cancelar al que no llegó**: sin señal, en Faltan, "No llegó → cancelar" sobre un caminante
    con cama y mesa asignadas → desaparece de Faltan, su cama queda libre en Camas y su mesa sin
    él, chip "1 cambio pendiente"; al sincronizar, `retreat_participants.isCancelled=1`,
    `retreat_bed.participantId` nulo y `tableId` nulo en el servidor, y el total de Recepción baja
    en uno en la otra pestaña. Reactivarlo con señal lo devuelve a Faltan sin cama ni mesa.
17. **Corregir la ficha** (D13): sin señal, cambiar la parroquia y el celular de un caminante →
    "Guardado en el teléfono", chip con 1 cambio, la lista muestra los valores nuevos y siguen
    tras recargar; al volver la señal el servidor tiene esos dos campos, y la salud y los demás
    campos quedan como estaban. Si mientras tanto otra persona cambió ese celular en el servidor,
    el cambio queda **rechazado** con el motivo y el servidor conserva el valor de la otra
    persona. Cambiar el correo sin señal no guarda nada y el aviso lo nombra.
15. **Regresión**: `pnpm --filter web test`, `pnpm --filter api test` (2 shards), `vue-tsc`,
    `pnpm --filter api build` y `mobile-page-weight.spec.ts` en verde; `grep __dirname
    dist/index.js` sin el global.

**Negativos** (lo que NO debe pasar):

- Un pago encolado nunca se registra dos veces, ni con reintentos ni con timeouts.
- La caché nunca contiene un campo de `SENSITIVE_HEALTH_FIELDS` ni una respuesta de Alimentación
  o Medicamentos, tenga o no el usuario `participant:health`.
- La caché de un retiro nunca sobrevive al cierre de su ventana; la cola sí, hasta que el usuario
  la sincronice o la descarte.
- Una operación encolada nunca se descarta sin acción explícita del usuario (ni por 401, ni por
  recarga, ni por cierre de pestaña).
- El service worker nunca sirve una respuesta de `/api/*` desde caché.
- Con señal buena, ninguna petición pasa por la cola.

## Fuera de alcance (v1)

- Encolar edición completa de participante (`PUT /participants/:id` con la ficha entera; la
  cancelación entra solo como bandera explícita, FR-15b, y desde D13 los campos personales de la
  lista blanca, solo los cambiados), notas (incluida la del motivo de cancelación), el editor
  rápido de teléfonos de la lista (`PATCH …/phones`; sin señal se corrigen desde la ficha), palancas, inventario, Santísimo (escrituras), responsabilidades, campanazo
  (`POST /schedule/retreats/:id/bell`: sin señal no llega a nadie), crear/borrar ítems de agenda,
  reordenar día, auto-asignaciones, importaciones, exportaciones, mensajes y secuencias.
- Fusión automática de conflictos, versiones por registro (`updatedAt` como ETag) y
  "último gana" sobre registros completos.
- Un endpoint de "bundle" del retiro en una sola respuesta (optimización posterior; v1 reutiliza
  los endpoints de cada vista para que la caché tenga exactamente los DTOs que las vistas
  consumen).
- Cachear archivos de S3 (PDFs/imágenes de guiones); el zip "Descargar guiones" existente sigue
  siendo la vía.
- Servidor local en la casa de retiro con base sincronizada (evaluado y descartado en plan.md).
- Datos de salud sin señal (Alimentación, Medicamentos, notas y contactos de emergencia en la
  ficha): decisión D3/D9, no un olvido.
- Cifrado de IndexedDB con PIN; notificaciones push; modo sin conexión en las vistas públicas
  (`/mam/:slug`, `/santisimo/:slug`) y en comunidades.
- Tests en Firefox/WebKit de Playwright para el service worker (solo chromium en v1; WebKit se
  verifica a mano en un iPhone en la prueba de campo).

## Reconcile

Cerrado el 2026-10-19 sobre `worktree-offline-mode` (base `1bf67691`), todavía sin commits de
código. Cada criterio contra lo implementado; "e2e" son los tres specs de
`apps/web/tests/e2e/offline-*.spec.ts` en chromium contra `vite preview` del build y el API del
worktree (base desechable); las desviaciones de diseño están en `tasks.md` por milestone.

| CA | Estado | Cómo se verificó |
|---|---|---|
| 1 Cascarón | ✓ | e2e: recarga sin red con el worker → la app; control con el worker bloqueado → error del navegador |
| 2 Arranque sin login | ✓ | e2e: pestaña nueva en frío sin red → sin login, datos guardados. 401 → login y perfil borrado: unit (`authStore.offline.test.ts`), no e2e |
| 3 Preparar | ✓ | Unit: los 15 pasos usan la misma clave que las vistas, progreso, fallas, ventana de 7 días. Auditoría 2026-10-20 (al grabar el video): solo "Preparar", sin abrir ninguna vista con señal, y luego las 17 vistas del retiro sin red comparando cada GET con lo guardado. Encontró que faltaban la lista de Caminantes/Servidores/Angelitos (`isCancelled=false`) y la de Angelitos (`type=partial_server`): "sin datos guardados". Corregido; la lista de cancelados de Mesas se agregó después (ver "Imprimir sin conexión") |
| 4 Lectura desde caché | ✓ con matiz | e2e: Caminantes, Recepción y Minuto a minuto sin red desde lo guardado; Alimentación con el aviso de salud; ninguna persona guardada con campos de salud. Camas y Responsabilidades: se guardan (e2e) pero su pantalla sin red no se afirmó |
| 5 Check-in encolado | ✓ | e2e: sin red → Llegados, sobrevive a recargar, al volver la señal el servidor tiene `checkedInAt` **igual** a la hora del dispositivo (reloj del navegador fijado distinto del servidor) |
| 6 Cobro idempotente | ✓ | e2e: un solo pago en el servidor; integración: misma clave dos veces → un solo `handler`; prueba en vivo `POST /payments` ×2 → 1 pago |
| 7 Minuto a minuto | ✓ con matiz | Unit: reductores de iniciar/completar/±5/día, respuesta sintética, `occurredAt` en el servidor (integración). Sin e2e por la UI |
| 8 Camas y mesas | ✓ con matiz | Unit: reductores, respuesta sintética, guard de rutas con idempotencia. Sin e2e por la UI (arrastrar) |
| 9 Bolsas | ✓ con matiz | Unit (reductor); sin e2e |
| 10 Conflicto | ✓ con matiz | e2e: rechazo simulado por ruta (404) → conflicto con el mensaje → descartar; el 409 real de cama ocupada está en el controller (research) |
| 11 Sesión caída | ✓ con matiz | Unit: 401 detiene, conserva la cola y pide login; panel lo muestra. Sin e2e |
| 12 Timeout sin duplicar | ✓ | e2e: respuesta retenida 11 s → se encola con la misma clave → el reenvío lleva `X-Outbox-Sync: 1` y el servidor responde `Idempotent-Replayed: true` |
| 13 Acciones bloqueadas | Parcial | Camas: auto-asignar, exportar y vaciar deshabilitados sin señal. El resto falla con un mensaje claro en español en vez de deshabilitarse (desviación M4) |
| 14 Purga | ✓ | Unit: al cerrar la ventana en la TZ del retiro, nunca la cola; logout borra perfil y respuestas. Los e2e tuvieron que fijar el reloj dentro del retiro justamente por esto |
| 15 Regresión | ✓ | Web 237 archivos / 3517 tests; API 2 shards; `vue-tsc`; builds de web y API; `mobile-page-weight` verde con las claves de Maps/reCAPTCHA |
| 16 Cancelar al que no llegó | ✓ | e2e: sin red "No llegó" → al sincronizar B ya no aparece en Recepción; integración: el body explícito cancela y libera cama y mesa sin tocar la ficha |
| 17 Corregir la ficha (D13, 2026-10-20) | ✓ con matiz | e2e `offline-edit.spec.ts` (escribe; base desechable): sin red parroquia y celular → 1 pendiente, siguen tras recargar, llegan al servidor y la salud, el correo y el nombre no cambian; el celular cambiado por "otra persona" → 409, rechazado con "celular" en la lista, se descarta y el servidor conserva el de la otra persona. Integración: comparación contra la base de test (vacío = nulo, `snores` falso = nada, campo fuera de la lista → 400). El bloqueo por un campo fuera de la lista (correo) va por unit (`ParticipantList`, `planOfflineEdit`): en la ficha por defecto el correo no es editable |

**Negativos**: un pago nunca dos veces ✓ (arriba); la caché nunca con salud ✓ (unit + e2e a
nivel persona); una escritura nunca se descarta sola ✓ (401, recarga y conflicto la conservan;
solo "Descartar" la quita); el worker nunca responde `/api` ✓ (e2e); con buena señal nada pasa
por la cola ✓ por diseño (solo sin señal o sin respuesta), sin test explícito; las páginas
públicas no crean almacenamiento offline ✓ (e2e, guarda agregada en M5).

**Lo que la implementación agregó o cambió respecto de la v1.1**: reclamo de reservas de
idempotencia abandonadas a los 2 min (un reinicio del API a mitad de un request las dejaba en
409 por 7 días); orden estable en la cola para el mismo milisegundo; 429 en arranque en frío
también usa el perfil guardado; carga perezosa de la cola y ninguna lectura de IndexedDB hasta
el primer guardado.

**Hallazgos al grabar el video (2026-10-20)**, después de los commits del 2026-10-20:

- Cada arranque sin señal mostraba 2-3 avisos de ruido: "Could not refresh permissions" (en
  inglés), el de casas (`RetreatModal` pide `/houses` al montarse en el sidebar, con el texto de
  escrituras "esta acción necesita señal") y el de alertas de inventario en el dashboard.
  Corregido: esas tres cargas de fondo ya no avisan cuando el fallo es falta de red; el banner y
  el chip ya lo dicen (D11). Con error del servidor siguen avisando.
- El toast "Guardado en el teléfono" casi nunca se ve: `TOAST_LIMIT = 1` y la vista muestra
  enseguida el suyo ("Pago registrado para…", "… marcado como llegado"). El chip sí cambia al
  instante, que es lo que exige D11. **Decidido el 2026-10-20: sí.** En un solo lugar
  (`src/offline/queuedToast.ts`, instalado en `AppLayout`): el primer toast de éxito de la
  pantalla dentro de 1,5 s de una escritura encolada lleva la nota "Guardado en el teléfono: se
  enviará solo cuando vuelva la señal."; si la pantalla no muestra toast, sale el de la cola. Sin
  tocar cada vista ni `@repo/ui`. e2e: el cobro sin señal en Recepción muestra la nota.

**Imprimir sin conexión (pedido 2026-10-20)**: gafetes, mesas y minuto a minuto. Verificado
imprimiendo cada opción con señal y, en un contexto nuevo que solo pasó por "Preparar", sin
señal, comparando el texto de lo que sale en papel y las imágenes rotas: gafetes, minuto a
minuto y 6 de las 7 hojas de Mesas salen idénticas. Hallazgos, corregidos:

- "Imprimir Mesas" lleva medicamentos, alimentación, apoyos y contacto de emergencia; desde lo
  guardado salían "—" ("nada que reportar") o "✅ Sí" sin el detalle. Ahora, si las mesas vienen
  del teléfono, esas columnas dicen "Solo con conexión" y la hoja lleva un aviso arriba.
  `tableMesaStore.fromCache` lo sabe por una marca no enumerable que `answerFromCache` pone en
  los datos (`markServedFromDevice`), porque los helpers de `api.ts` solo devuelven `data`.
- Los logos de los gafetes (`/man_logo.png`, `/woman_logo.png`, `/crossRoseButtT.png`) viven en
  `public/` y el worker no los guardaba: dependían de la caché HTTP del navegador, que iOS
  vacía. Ahora están en el precache (~1 MB, se baja una vez por versión: 310 entradas, 8,7 MB).
- Dos opciones del menú de Mesas se llamaban "Imprimir Mesas"; la primera descarga un Word
  armado por el servidor y sin señal fallaba. Renombrada "Descargar Mesas (Word)" y, como
  "Exportar DOCX" de gafetes, desactivada sin señal con "Necesita conexión" (D11).
- "Preparar" guarda también la lista de cancelados de Mesas (15 pasos); sin ella el banner decía
  "Algunas pantallas no tienen datos guardados" con el tablero completo.

**Integración con master (2026-10-20, ~50 commits)**. Lo que llegó y toca el modo sin señal:

- **Casos especiales** (`specs/special-case`): los tres campos `specialCase*` entraron en
  `SENSITIVE_HEALTH_FIELDS`, así que el teléfono ya no los guarda sin cambiar nada aquí. Pero
  la bandeja y la tarjeta del dashboard contaban sobre la lista guardada y decían "0 por
  atender". Ahora, si la lista viene del teléfono, dicen que se consultan con conexión
  (`HealthNeedsConnection` con mensaje propio), como Alimentación y Medicamentos.
- **Corrección de correo** (`specs/participant-email-change`): el correo es de solo lectura en
  la ficha y el PUT genérico lo descarta. D13 no cambia (nunca estuvo en la lista); la ayuda
  usaba el correo como ejemplo de campo que no se guarda sin señal y ahora usa la fecha de
  nacimiento.
- **Impresión compacta del minuto a minuto** (`specs/mam-compact-print`): se arma en el
  navegador con lo cargado; sin señal imprime igual (e2e `offline-print.spec.ts`, las dos).
- Días colapsables y menú ⋮ por mesa: solo los selectores del e2e de impresión.

**Pendiente fuera de esta sesión**: prueba de campo en un iPhone y un Android reales; nginx de
producción antes del primer push; los PR y despliegues (dos releases, decisión 2026-10-19).
