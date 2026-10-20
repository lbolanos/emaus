# Plan: UX del Minuto a Minuto y de Responsabilidades

> Acompaña a `spec.md` (qué y por qué) y `research.md` (evidencia). Este archivo dice dónde se toca
> y en qué orden. Asume D1-D6 tal como están recomendadas; si alguna cambia, se ajusta aquí.

## Diseño

Tres frentes independientes, que pueden ir en cualquier orden:

| Frente | Archivos | Backend |
|---|---|---|
| Minuto a Minuto (D4, D5) | `MinuteByMinuteView.vue`, `MamMoreActions.vue`, nuevo `views/mamCollapse.ts` | no |
| Encabezado y tarjetas (D2, D6) | `ResponsabilitiesView.vue` | no |
| Por servidor (D1, D3) | nuevo `components/ServerAssignmentsTab.vue` (luego `BriefingSendList.vue`, R14), `ResponsabilitiesView.vue`, `services/api.ts` | endpoint nuevo |

## Capa API (D3)

- `participantCommunicationController.getLatestByTemplateType`:
  - consulta con `createQueryBuilder` sobre `participant_communications` unida a
    `message_templates` por `templateId`, filtrada por `retreatId` y `template.type`;
  - `MAX(sentAt)` agrupado por `participantId` y `messageType`, reducido a uno por participante (el
    más reciente);
  - devuelve un mapa `participantId → { sentAt, messageType }`.
- Ruta en `participantCommunicationRoutes.ts` junto a `/retreat/:retreatId/stats`, con
  `requireRetreatAccess('retreatId')`. `type` validado con `messageTemplateTypes.safeParse` → 400 si
  no es un tipo conocido.
- Pruebas (`apps/api/src/tests/controllers/`):
  - devuelve solo el tipo pedido y el último envío;
  - 400 con un tipo desconocido;
  - 403 sin acceso al retiro (patrón de `assignmentDocumentsController.test.ts`).

## Capa Web

### Minuto a Minuto

- `mamCollapse.ts` (puro, con pruebas):
  - `collapseStorageKey(retreatId)`;
  - `readCollapsed` / `writeCollapsed` (arreglo de días, `try/catch`);
  - `retreatDayForDate(startDate, timezone, now)`;
  - `initialCollapsed(days, todayDay)`.
- `MinuteByMinuteView.vue`:
  - `collapsedDays` como arreglo (no `Set`: no es reactivo en `ref`, regla de `troubleshooting` §5);
  - `toggleDay`, `expandDay`, `collapseAll`, `expandAll`;
  - `expandDay` antes de `scrollToItem` en `onSearchNext`, `goToNow` y los chips (`nextTick` entre
    medio, para que la fila exista);
  - clase `mam-day-collapsed` en el contenedor de filas y en `@media print`
    `.mam-day-collapsed { display: block !important }`.
- `MamMoreActions.vue`: dos `run('collapse-all' | 'expand-all')` en la sección "Vista", solo con
  `groupBy === 'day'`. Se añaden al tipo `MoreAction` sin tocar las líneas de impresión (conflicto
  con `mam-compact-print`, research §1).
- Móvil:
  - el `Input` de búsqueda pasa a `min-w-0 flex-1` (crece en escritorio igual que hoy);
  - la fila de hora no envuelve las acciones;
  - `relativeTime` devuelve `''` si `now > endDate + 1 día`.

### Responsabilidades

- Encabezado:
  - el `DropdownMenu` existente crece con Crear (`deferOpen(() => openAddEditModal(null))`), un
    `DropdownMenuRadioGroup` para columnas (`hidden sm:block`), Exportar e Imprimir;
  - el `Select` y los dos botones salen del encabezado;
  - el título deja de partirse.
- Pestañas: contenedor `flex-wrap` (no `overflow-x-auto`: escondía "Por servidor"); "Por servidor" como un
  `filterTab` más. Al elegirla, en lugar de la rejilla se monta la lista.
- `ServerAssignmentsTab.vue` (en la Parte 2 se volvió `BriefingSendList.vue`, genérica):
  - props: `candidates` (lo que hoy calcula `assignmentsCandidates`), `sentByParticipant`,
    `loading`;
  - emite `send(participant)`;
  - buscador y filtro internos;
  - filas de dos líneas, nombre sin truncar.
- `ResponsabilitiesView.vue`:
  - mueve el popover a la pestaña y reusa `onChooseServer`;
  - carga `sentByParticipant` al montar la pestaña y al cerrarse el `MessageDialog` (watch de
    `messageDialogOpen` a `false`).
- Tarjetas: `DropdownMenu` por tarjeta (Editar, Agregar al equipo, Eliminar), todos con
  `deferOpen`. Los íconos de documentos quedan como están.
- `services/api.ts`: `participantCommunicationsApi.latestByTemplateType(retreatId, type)`.

## Pruebas

| Archivo | Qué fija |
|---|---|
| `views/__tests__/mamCollapse.test.ts` | estado inicial, persistencia por retiro, día de hoy en la tz del retiro |
| `views/__tests__/MinuteByMinuteCollapse.test.ts` | chevron, búsqueda que abre el día, contraer/expandir todos |
| `components/__tests__/BriefingSendList.test.ts` (antes `ServerAssignmentsTab.test.ts`) | nombres visibles, marca enviado / sin enviar, filtro, emite `send` |
| `views/__tests__/ResponsabilitiesBriefing.test.ts` (existente) | se adapta: la entrada pasa de popover a pestaña |
| `test/dropdownMenuFreezeGuard.test.ts` (existente) | sigue verde con los menús nuevos |
| API, controller test | R13 (tipo, último envío, 400, 403) |

Trampas de los mocks globales (`apps/web/src/test/setup.ts`):
- El mock global de `@repo/ui` no trae ningún `DropdownMenu*`. No afecta: las pruebas que montan
  estas vistas traen su propio mock con `Proxy`, que acepta cualquier componente (corregido al
  implementar; el plan decía que había que agregarlos).
- Íconos: `ChevronDown`, `ChevronRight`, `MoreVertical` ya están. Uno nuevo va al mock global
  y al mock local de la prueba de la vista.

Verificación final con Playwright en el dev del worktree (5177/3005) a 1280×900 y 390×844, contra
los criterios de `spec.md`.

## Riesgos

1. **Conflicto con `worktree-mam-compact-print`** en `MamMoreActions.vue` y `MinuteByMinuteView.vue`.
   Se trae `master` a la rama antes de cerrar.
2. **Reka-ui**: cada opción de menú que abre un diálogo pasa por `deferOpen`. El `MessageDialog`
   se abre desde un botón de la pestaña, no desde un menú.
3. **Impresión**: lo contraído tiene que salir en papel (R3), y nada sticky nuevo (research §1).
4. **`localStorage`** puede lanzar (navegación privada): toda lectura y escritura va en `try/catch`
   y la vista funciona sin él.
