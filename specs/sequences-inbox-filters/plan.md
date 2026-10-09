# Plan técnico — bandeja: filtros, historial y ficha

> SDD plan — versión 1.0 (2026-10-08). Tesis: casi toda la infraestructura existe (helper de
> chat sin texto, popover de ficha, enriquecimiento server-side de la cola). El trabajo es
> integración + un enriquecimiento nuevo (`assignedToName`). Cero migraciones, cero endpoints
> nuevos.

## M1 — API: `assignedToName` en la cola (FR-API, habilita FR2/FR3)

**Decisión: enriquecer `listQueued`, no un endpoint nuevo ni join en el find** (D2): cuarta
variable del molde existente (`followUpStatus`, `templateName`, palanqueros) — lookup bulk
`In([ids])` sobre `users.displayName` + Map, `null` cuando `assignedTo` es null.

- `apps/api/src/services/messageSequenceService.ts` → `listQueued`: resolver
  `assignedToName` por ítem (una query para toda la cola).
- `apps/web/src/services/api.ts` → `ScheduledMessageQueueItem`: añadir
  `assignedToName?: string | null` con comentario (el resto del payload ya documenta su
  enriquecimiento ahí).
- Test jest (`messageSequence.test.ts`, describe de targeting/ownership): 2 ítems asignados a 2
  usuarios distintos + 1 sin asignar → nombres correctos/null. Molde: `seedDue` + update directo
  de `assignedTo` en el repo.

Verificación: `pnpm --filter api test src/tests/services/messageSequence.test.ts`.

## M2 — Controles de listado de la bandeja (FR1, FR2-cliente, FR3, FR4)

Todo client-side sobre `MessageSequencesView.vue`. Los tres controles entran en la barra
escritorio (~:2068) Y en el menú móvil (~:2007) — mismo patrón dual de sort/filter actuales.

1. **Filtro "Plantilla"** (`queueTemplateFilter: string | null`):
   - Opciones: `computed` sobre `queue` — clave `step.templateId ?? 'type:' + templateType`,
     etiqueta `itemTemplateName(it)` (nombre resuelto server-side, fallback label por tipo),
     conteo por plantilla (D3).
   - Se aplica en `filteredQueue` junto a los demás (antes del texto, después de assign — orden
     indiferente, compone).
2. **Filtro por asignado** (extiende `queueAssignFilter`):
   - Opciones dinámicas `computed` de `queue`: `user:<id>` → `Asignado: {assignedToName} (n)`.
     Solo asignados presentes; `mine`/`unassigned`/`paused`/`all` quedan igual.
   - Branch en `filteredQueue`: `user:<id>` → `it.assignedTo === id` (respeta pausados como el
     resto de las opciones no-`all`).
3. **Nombre en fila** (FR3): reemplazar el `v-else-if` anónimo "· Asignado" por
   `· Asignado: {assignedToName}` (fallback "Asignado" sin nombre — ítems legacy antes del deploy).
4. **Selector "Por página"** (`queuePageSize: number | 'all'`, default 10, D4):
   - `pagedQueue`/`queueTotalPages` lo respetan; paginador se oculta con `all` (ya lo hace con
     `total <= 1`).
   - Persistencia `localStorage 'seq.queuePageSize'` (molde `autoConfirmSend`); sanitizar al leer
     (valor no válido → 10).
   - `watch` de reset de página (~:878) gana `queueTemplateFilter` y `queuePageSize`.
5. **i18n** es+en: `sequences.filter.template` ("Plantilla"), `sequences.filter.allTemplates`
   ("Todas"), `sequences.filter.assignee` ("Asignado: {name}"), `sequences.pageSizeLabel`
   ("Mensajes por página"), `sequences.pageSizeAll` ("Todos"). El conteo de opciones reusa
   formateo simple `({n})`.

Tests vitest (extender `MessageSequencesView.test.ts`, molde `mountView(queue)`):
- cola con 2 plantillas → select tiene ambas + "Todas"; filtrar deja las filas de una;
- 2 asignados + 1 sin asignar → opciones "Asignado:" con nombres (mock del payload con
  `assignedToName`); filtrar por uno deja sus filas; fila muestra "Asignado: Ana";
- 12 ítems con page size 10 → 2 páginas; cambiar a "Todos" → 12 filas y sin paginador; a 5 →
  página 1 y 3 páginas.

Verificación: vitest de la vista + `pnpm --filter web build`. **Depende de M1** para el payload
real (los tests mockean, pero el wiring contra prod requiere el campo).

## M3 — Acciones de fila: conversación y ficha (FR5, FR6)

**Paralelizable con M2** (no comparten archivos críticos más que la vista; si se hace en serie,
orden M2→M3 para conflictos mínimos en el template).

1. **`resolveRecipientContact(item)`**: extraer de `buildWhatsappLink` (~:1340) la resolución de
   `{ phone, country }` (snapshot + fallback + contactos de emergencia); `buildWhatsappLink` la
   reusa (refactor puro, cero cambio de comportamiento del envío).
2. **"Ver conversación"** (icono `MessageCircle`, ghost icon-only):
   - Fila (antes de Omitir) y footer del panel de detalle (junto a WhatsApp).
   - `openWhatsappHistory(item)`: `buildWhatsAppChatLink(phone, country)` → null ⇒ toast
     `sequences.noPhone`; si no, `window.open(url, '_blank', 'noopener,noreferrer')` SIN awaits
     ni mutaciones (D1 — directo en el gesto, sin popup problem).
   - Sin teléfono ⇒ botón oculto (el envío ya avisa con toast).
3. **"Detalles del participante"** (D5): `ParticipantInfoPopover` nuevo `variant: 'pill' | 'icon'`
   (`withDefaults` default `'pill'`; en `icon` no hay slot-timer: el trigger ES el botón ⓘ,
   siempre visible; el template pill queda intacto para TablesView/TableCard/ServerDropZone).
   - Fila de bandeja: icono `User` → popover con `item.participant` (el popover se enriquece del
     store por id; `attendance` no se pasa — es dato de comunidad).
   - Tests del popover: variante icon abre al clic (mount con `attachTo` + `enableAutoUnmount`,
     memoria `feedback_a11y_tests_need_attached_dom`); variante pill sin cambios (regresión).
4. **i18n** es+en: `sequences.viewConversation` ("Ver conversación en WhatsApp"),
   `sequences.participantDetail` ("Detalles del participante").

Tests vitest: botón presente por fila; click llama `window.open` con URL `api.whatsapp.com/send?phone=…`
SIN `text=` (spy) y SIN llamadas al store (`open`/`dispatch` no llamados); sin teléfono → sin
botón; popover abre con el participante del store.

Verificación: vitest vista + popover + `pnpm --filter web build`.

## M4 — E2E en el worktree + cierre

Extender `apps/web/tests/e2e/sequences-inbox.spec.ts` (molde `createScenario`, que hoy siembra
1 walker × N pasos; parametrizar walkers ≥ 2 y pasos 2 → ≥ 12 ítems queued, 2 plantillas):

- filtros: select Plantilla deja solo filas de esa plantilla; select asignado (asignar un ítem
  por API `assign` antes) deja su fila con "Asignado: …";
- página: "Todos" muestra todas las filas y el paginador desaparece;
- conversación: `toHaveAttribute('href', /^https:\/\/api\.whatsapp\.com\/send\?phone=\d+$/)` (sin
  `text=`) y cero requests a `open`/`dispatch` (listener `resourceType() === 'xhr'`);
- ficha: click en el icono → contenido del popover visible; la página sigue interactiva tras
  cerrar.

Corrida contra el dev del worktree (skill `worktree-testing`: puertos propios, DB copiada con
los 3 archivos, `FRONTEND_URL` inline):

```bash
E2E_BASE_URL=http://localhost:5174 \
E2E_LOCAL_EMAIL=leonardo.bolanos@gmail.com E2E_LOCAL_PASSWORD=123456 \
  npx playwright test tests/e2e/sequences-inbox.spec.ts --project=chromium
```

Cierre: marcar `tasks.md`, anotar desviaciones por milestone, screenshot de la bandeja con los
controles nuevos para el usuario, proponer commits (uno por milestone).

## Secuencia y dependencias

M1 → M2 → M3 → M4 (M3 paralelizable con M2 si se prefiere; M4 último siempre).

Transversal (checklist de `research.md`): i18n en ambos locales; mock lucide para íconos nuevos
(`User`/`MessageCircle` — este último ya está importado en la vista); watch de reset de página;
`pnpm --filter web build` por milestone de UI; una sola corrida de jest; reiniciar el API del
worktree tras tocar servicios.
