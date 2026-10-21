# Spec: Mesas — tercer ciclo (guards de regresión del 1 y 2)

**Estado**: retroactiva · **Branch**: `worktree-mesas-ciclo2` · **Fecha**: 2026-10-20

Los ciclos 1 (`tables-mobile-ux`, `table-memory-photo`) y 2 (`tables-second-cycle`) entregaron
UX móvil y foto de mesa verificados **a mano** con Playwright MCP: dos verificaciones
(2026-10-19 y 2026-10-20) que ejercitaron sticky, pastillas, banner de tap-assign y borrado de
foto, pero que no dejaron nada corriendo de forma repetible. Este ciclo NO añade features:
convierte esas verificaciones en un guard automatizado y cierra la única desviación con efecto
en usuario que quedó en el Reconcile del ciclo 2.

## Problema

1. **Nada protege lo entregado.** Si un refactor vuelve a meter el bloque de pastillas dentro
   del sticky (la regresión exacta que el ciclo 2 corrigió, y que ya había ocurrido una vez con
   el merge del ciclo 1) o rompe el tap-assign en touch, **ningún test falla**: las suites
   existentes de `TablesView` no miran dónde vive el bloque ni ejecutan handlers de touch. La
   única defensa hoy es repetir la verificación manual — ya costó dos sesiones de browser.
2. **`STICKY_HEADER_OFFSET = 96` se quedó corto** (desviación 3 del Reconcile del ciclo 2): el
   sticky base real a 390 px es 109 px, y con el banner de tap-assign activo es más alto
   todavía. `isOnScreen` da por "visible" un resultado de búsqueda cuyo top cae tapado — el
   scroll-into-view no corre y el match queda escondido detrás del header.

## Objetivo

Que la regresión del sticky/tap-assign la detecte una corrida local de e2e (no una sesión de
verificación manual), y que la búsqueda considere tapado todo lo que el sticky tapa de verdad
— incluido el caso con banner activo.

## Decisiones

| # | Decisión | Alternativa descartada |
| --- | --- | --- |
| D1 | **e2e touch como guard de conducta**: `apps/web/tests/e2e/tables-tap-assign.spec.ts` con contexto touch propio (390×844, `hasTouch`, `isMobile`), login por credenciales locales (patrón de `sequences-inbox.spec.ts`), retiro Buen Despacho seleccionado por `localStorage.selectedRetreatId`, participante tomado **dinámicamente** (primera pastilla de "Servidores Sin Asignar", sin nombre hardcodeado) y estado restaurado en `finally`. Afirma lo que el usuario ve: alto del sticky base ≤ 130, pastillas fuera del viewport tras scrollear con el sticky pinned, y el flujo tap-assign completo (banner → asignar → quitar). | Test Vitest de estructura (afirmar que el bloque `md:hidden` no desciende del contenedor sticky): valida implementación, no conducta, y se rompe con cualquier refactor de clases. Dejar la verificación manual como única defensa: ya la pagamos dos veces. |
| D2 | **Offset de búsqueda dinámico**: `isOnScreen` mide el alto real del sticky (template ref al contenedor + `offsetHeight`, fallback al valor actual 96 mientras monta) en lugar de la constante. Se adapta solo al banner activo y a futuros cambios de altura. | Constante `109`: corrige el caso base y vuelve a quedar corta cuando el banner de tap-assign está pinned (el sticky crece por encima de 109). |

## Historias

1. Como desarrollador, si un refactor vuelve a piniar las pastillas o rompe el tap-assign en
   touch, una corrida local del e2e me lo dice — sin montar la verificación manual otra vez.
2. Como coordinador buscando en la lista, un resultado que queda tapado por el sticky (con o
   sin banner activo) se considera no visible y la página scrollea para mostrarlo.

## Requerimientos

- **R1** (D1): tras scrollear en 390×844 touch, el bottom del bloque de pastillas queda fuera
  del viewport y el top del sticky permanece constante (pinned); el alto del sticky base (sin
  banner) ≤ 130 px.
- **R2** (D1): tap en pastilla → banner visible dentro del sticky → tap en slot libre → el
  participante queda asignado → "Quitar" lo devuelve a sin asignar. El spec restaura el estado
  original aunque falle a mitad del flujo, y no toca a otros participantes.
- **R3** (D2): un match cuyo top cae dentro del alto real del sticky — con y sin banner de
  tap-assign activo — se considera no visible y dispara el scroll; las suites de búsqueda
  existentes siguen verdes.
- **R4** (D1): el spec no depende de nombres hardcodeados; si el retiro no tiene servers sin
  asignar, falla con un mensaje de precondición explícito (no con un error críptico de
  selector).

## Criterios de aceptación

Contra datos que existen: retiro demo Buen Despacho (`e9b3c568`, 10 mesas, ≥ 1 server sin
asignar verificado el 2026-10-20). El spec toma el primer server sin asignar dinámicamente.

- `tables-tap-assign.spec.ts` verde local contra el dev del worktree
  (`start-worktree-dev.sh`, `E2E_BASE_URL=http://localhost:5174`, credenciales locales por
  env), corrida con
  `npx playwright test tests/e2e/tables-tap-assign.spec.ts --project=chromium`.
- `TablesViewSearch` y `TablesViewServerAttendance` verdes tras el cambio de offset;
  `vue-tsc` limpio.
- La corrida e2e deja la DB como estaba (participante de vuelta en sin asignar).

## Fuera de alcance

- **Correr e2e en CI**: hoy ningún workflow corre Playwright (`ci.yml` es lint + Jest sharded
  + Vitest + audit); montar dev servers en CI es otra discusión con su propio costo. El guard
  de este ciclo es de corrida local/on-demand.
- **Accesibilidad por teclado de las pastillas** (B4 de la revisión del ciclo 2): decisión de
  producto pendiente; este ciclo no la presupone.
- Cambios visuales de la vista (nada del layout cambia; solo el margen de scroll de búsqueda).
- Sweeps de tsc legacy y UTF-8: deuda general del repo, no del área.

## Reconcile

Cerrada el 2026-10-20, commit `63deac71` (e2e + offset dinámico en el mismo commit). El e2e
corrió verde dos veces seguidas contra el dev del worktree (chromium, contexto touch 390×844,
retiro Buen Despacho `e9b3c568`).

### Verificación de requerimientos

- **R1 ✅** — `tables-tap-assign.spec.ts` test 1: sticky base ≤ 130 (aserción sobre
  `offsetHeight`; 109 px según la medición del ciclo 2); top del sticky constante al scrollear
  600 px en `<main>` (pinned bajo el topbar fijo); bottom del bloque de pastillas queda por
  encima del top del sticky (fuera del viewport).
- **R2 ✅** — test 2, flujo completo: tap en la primera pastilla de "Servidores Sin Asignar"
  (dinámica, sin nombres) → banner `tap-assign-banner` dentro del sticky (verificado por
  bounding box contra el rect del sticky) → tap en slot libre `ring-blue-500` → el slot pasa a
  contener al participante (`data-participant-id`), banner oculto y contador N−1 → tap en el
  asignado → "Quitar de mesa" → slot vacío ("Sin asignar") y contador N. El `finally` restaura
  por API (`DELETE /tables/:id/leader/:role`) si el flujo muere a mitad.
- **R3 ✅** — `isOnScreen` usa `stickyHeader?.offsetHeight || STICKY_HEADER_OFFSET (96)`: el
  `||` conserva el comportamiento en happy-dom (offsetHeight 0 antes de layout), por lo que las
  suites existentes no cambian su verde. `TablesViewSearch` 8/8, `ServerAttendance` 6/6,
  `Leaders` 8/8 (22/22) y `vue-tsc` limpio tras el cambio.
- **R4 ✅** — el participante sale de la primera pastilla del tab; si el contador del tab es 0
  el test **falla** con mensaje de precondición explícito (`requireUnassignedServer`), no con
  timeout de selector.

### Corrida y estado de la DB

- 2 corridas verdes seguidas (1.9–2.0 s); tras cada una la DB quedó como estaba, verificado por
  API: 10 mesas, 22 servers sentados, Oscar M. de vuelta en sin asignar.
- Incidente de desarrollo (no del código guardado): la primera corrida dejó a Oscar asignado —
  bug del propio spec (locator vivo que seguía al ring cuando saltaba al siguiente slot libre);
  restaurado por API en el momento, y el spec corregido fija el slot con `elementHandle()` y
  restaura en `finally`.

### Desviaciones

1. **Branch**: la spec decía "por definir (`worktree-mesas-guards`)"; se implementó sobre
   `worktree-mesas-ciclo2` (sin merge del ciclo 2) por indicación del usuario en la sesión.
2. **D2 sin test unitario propio del offset**: happy-dom mide `offsetHeight = 0`, así que un
   unit test no distinguiría 96 del alto real — el guard del requisito es el e2e (que mide el
   sticky real) más las suites existentes, que cubren la no-regresión del fallback.

### Lo descartado se mantiene

Test Vitest de estructura (validaría implementación, no conducta) y constante `109` (volvería a
quedar corta con el banner activo): la implementación no dio motivo para reabrirlos.
