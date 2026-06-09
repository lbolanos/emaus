# Detalle de participante en Asignación de Mesas

Al interactuar con la pastilla de un participante (caminante o servidor) en la vista de **Asignación de Mesas** se abre un popover con **toda** su información relacionada, más un acceso directo para mandar mensaje. Antes solo existía un tooltip en hover con datos mínimos (`#`, nombre, invitado por, cama).

Esta entrega también dejó **responsive el `MessageDialog`** para que sea usable en celular.

## Disparador (clic vs botón)

El popover convive con la asignación drag-and-drop / tap-to-assign y con el doble clic para desasignar, así que el disparador depende del dispositivo:

| Plataforma | Cómo se abre el detalle | Por qué |
| --- | --- | --- |
| **Desktop** (md+, ≥768px) | **Clic sobre la pastilla** (no hay botón visible) | En desktop la asignación es por arrastre; el clic en la pastilla no hacía nada. |
| **Móvil** (<768px) | Botón **ⓘ** junto a la pastilla | En móvil el toque sobre la pastilla se reserva para **tap-to-assign** (seleccionar para asignar a una mesa). |

Detalles de la lógica (`ParticipantInfoPopover.vue`):

- Se detecta desktop con `window.matchMedia('(min-width: 768px)')`.
- El botón **ⓘ** existe siempre en el DOM (sirve de **ancla** del `PopoverContent`), pero en desktop se oculta visualmente con `md:w-0 md:h-0 md:opacity-0 md:pointer-events-none`.
- El clic en la pastilla distingue **clic simple** (abre el detalle, con ~200 ms de gracia) de **doble clic** (desasignar de la mesa): si llega un segundo clic dentro de la ventana, se cancela la apertura. Así el doble clic sigue desasignando sin abrir el popover.

## Datos que muestra

Con el participante **enriquecido** (ver más abajo):

- Encabezado: `#` (id en retiro), nombre completo y apodo.
- **Tags** del retiro (componente `TagBadge`).
- **Teléfonos** del participante (`cellPhone` / `homePhone` / `workPhone`) como enlaces `tel:`.
- Datos del antiguo mouseover: ubicación de cama (`piso-hab-cama`), parroquia y email.
- Sección **Invitador**: `invitedBy`, Emaús sí/no (`isInvitedByEmausMember`), teléfonos e email del invitador. Se **oculta** si no hay datos sustantivos del invitador (p. ej. servidores: `isInvitedByEmausMember` por sí solo no la dispara).
- Botón **"Mandar mensaje"**.

Los teléfonos placeholder sin dígitos (p. ej. `"-"`) se **filtran** para no generar enlaces `tel:-` inservibles.

## Origen de los datos — sin cambios de backend

> ⚠️ Punto clave de arquitectura.

El endpoint de mesas (`GET /tables/retreat/:id`, `tableMesaService.ts`) **no** incluye `tags` ni el overlay del invitador para los participantes **asignados** (solo trae los teléfonos personales del `Participant`). En cambio, el **`participantStore`** —que alimenta las listas de no-asignados en `TablesView.vue`— carga **todos** los participantes del retiro vía `GET /participants` **con `tags` + info del invitador completa**.

Por eso `ParticipantInfoPopover` busca el participante **enriquecido en `participantStore` por su `id`**, con _fallback_ al objeto de la pastilla si no se encuentra:

```ts
const enriched = computed<Participant>(
  () => participantStore.participants.find((p) => p.id === props.participant.id) ?? props.participant,
);
```

Resultado: tags y datos del invitador aparecen también para participantes **dentro** de una mesa, **sin tocar el backend**.

## Botón "Mandar mensaje" → MessageDialog compartido

Como los popovers están anidados (`TablesView` → `TableCard` → `ServerDropZone`), se evita el prop-drilling con un **singleton** a nivel de módulo: `useParticipantMessageDialog.ts` expone `{ isOpen, participant, open }`. Se monta **una sola** instancia de `<MessageDialog>` en `TablesView.vue` enlazada al singleton; cualquier popover llama `open(participanteEnriquecido)`.

Para evitar el bug de `pointer-events: none` huérfano de reka-ui (popover → dialog), el popover se **cierra antes** de abrir el diálogo (`popoverOpen = false` y luego `open()` en `nextTick`).

## MessageDialog responsive (celular)

Cambios en `MessageDialog.vue` (el `DialogContent` base de `@repo/ui` centra con `-translate-y-1/2` **sin** límite de alto, por lo que en móvil el contenido se cortaba sin poder scrollear):

- `class="w-[95vw] max-h-[90vh] overflow-y-auto overflow-x-hidden p-4 sm:p-6"` en el `DialogContent`.
- `min-w-0` en el `DialogHeader` para que el título trunque (evita overflow horizontal).
- El contenido principal + panel de historial apilan en móvil: `flex flex-col md:flex-row`. El panel de historial usa `w-full md:w-80` con bordes/padding responsivos.
- `window.open(url, '_blank')` **sin** features `width/height` (algunos navegadores móviles rompían el deep link de WhatsApp con esos parámetros).

## Archivos

**Nuevos**

- `apps/web/src/composables/useParticipantMessageDialog.ts` — singleton del diálogo de mensaje.
- `apps/web/src/components/ParticipantInfoPopover.vue` — popover de detalle (envuelve la pastilla como slot).

**Modificados**

- `apps/web/src/views/TablesView.vue` — popover en no-asignados (desktop + móvil) y montaje del `MessageDialog`.
- `apps/web/src/views/TableCard.vue` — popover en caminantes de la mesa.
- `apps/web/src/views/ServerDropZone.vue` — popover en líderes/co-líderes.
- `apps/web/src/components/MessageDialog.vue` — responsive móvil.
- `apps/web/src/locales/{es,en}.json` — claves `tables.detail.*`.
- `apps/web/src/test/setup.ts` — mock global de `Popover/PopoverTrigger/PopoverContent`.

## Tests

- `apps/web/src/components/__tests__/ParticipantInfoPopover.test.ts` — enriquecimiento desde el store, filtrado de teléfonos `-`, botón de mensaje, fallback, sección invitador oculta para servidor, y los 3 casos del disparador (clic desktop abre con gracia, doble clic cancela, móvil no abre).
- `apps/web/src/composables/__tests__/useParticipantMessageDialog.test.ts` — comportamiento singleton del diálogo.

```bash
pnpm --filter web test src/components/__tests__/ParticipantInfoPopover.test.ts
pnpm --filter web test src/composables/__tests__/useParticipantMessageDialog.test.ts
```
