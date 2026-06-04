# Tarjetas de los Caminantes (Lottery Cards)

Diálogo que imprime una tarjeta recortable por cada caminante del retiro, usada para el sorteo/asignación manual de mesas. Cada tarjeta muestra el **ID en el retiro** (grande) y el **nombre** del caminante, con una franja de color a la izquierda que corresponde a su grupo de familia/amigos (`family_friend_color`).

---

## Acceso

Vista de Asignación de Mesas (`TablesView.vue`) → menú de impresión → opción **"Tarjetas de los Caminantes"**. Abre el diálogo `LotteryCardsDialog.vue`.

El diálogo recibe `allWalkers` (computed de `participantStore.participants` filtrando `type === 'walker'` y no cancelados), por lo que cada tarjeta tiene acceso al objeto `Participant` completo, incluido el campo `invitedBy`.

---

## Acciones de impresión

El header del diálogo ofrece dos botones de impresión:

| Botón | Handler | Contenido de la tarjeta |
|---|---|---|
| **Imprimir** | `printCards()` | ID + nombre |
| **Imprimir con invitador** | `printCardsWithInviter()` | ID + nombre + línea `Invitado por: <nombre>` |

Ambos delegan en un único builder `buildAndPrint(withInviter: boolean)`. El invitador (`invitedBy`, texto libre del participante) solo se renderiza cuando `withInviter` es `true` **y** el caminante tiene el campo poblado; los caminantes sin invitador imprimen la tarjeta normal sin línea extra.

---

## Implementación de la impresión

La impresión **no** usa el truco de `@media print` + `visibility: hidden` sobre el DOM del diálogo (que dependía del `position: fixed` del modal y causaba que el grid se saliera de la hoja, dejando solo 3 columnas visibles). En su lugar, `buildAndPrint` abre una **ventana dedicada** con `window.open` y escribe su propio HTML/CSS autocontenido — el mismo patrón que el resto de impresiones del proyecto (`apps/web/src/utils/tablesPrint.ts`).

Características del layout de impresión:

- `@page { size: A4; margin: 8mm; }`
- Grid de **4 columnas**: `grid-template-columns: repeat(4, 1fr)` con `width: 100%`, medido contra el área imprimible real de `@page` (por eso las 4 columnas caben sin desbordar).
- Cada tarjeta usa `break-inside: avoid` para no partirse entre páginas.
- `print-color-adjust: exact` para conservar la franja de color de familia/amigos.
- Toda la data del participante se pasa por `escapeHtml` antes de inyectarse en el HTML de la ventana (previene inyección de HTML/scripts vía nombre o invitador).
- Si el navegador bloquea el popup (`window.open` retorna `null`), la función retorna sin lanzar error.

---

## i18n

Claves usadas (en `apps/web/src/locales/{es,en}.json`):

| Clave | Español | English |
|---|---|---|
| `tables.lotteryCards.title` | Tarjetas de los Caminantes | Walker Cards |
| `tables.lotteryCards.description` | Imprime y recorta las tarjetas… | Print and cut a card… |
| `tables.lotteryCards.print` | Imprimir | Print |
| `tables.lotteryCards.printWithInviter` | Imprimir con invitador | Print with inviter |
| `tables.lotteryCards.noWalkers` | No hay caminantes registrados… | No walkers registered… |
| `tables.invitedBy` | Invitado por | Invited by |

> El label de la línea de invitador se obtiene con `t('tables.invitedBy')` dentro del builder, por lo que respeta el idioma activo.

---

## Archivos relevantes

| Archivo | Rol |
|---|---|
| `apps/web/src/components/LotteryCardsDialog.vue` | Diálogo + lógica de impresión (`buildAndPrint`, `printCards`, `printCardsWithInviter`) |
| `apps/web/src/views/TablesView.vue` | Monta el diálogo (`isLotteryCardsOpen`, `:walkers="allWalkers"`) |
| `apps/web/src/components/__tests__/LotteryCardsDialog.test.ts` | Tests (render, orden, color, ambas acciones de impresión, escape HTML, popup bloqueado) |

---

## Notas

- El campo `invitedBy` es **texto libre** en `Participant` (no es FK a otro participante). Su fuente de verdad por retiro vive en `retreat_participants.invitedBy`, con fallback en `participants.invitedBy`.
- El grid de 4 columnas se mantiene fijo en impresión a propósito; las tarjetas con `1fr` se encogen para caber y el nombre/invitador se truncan con ellipsis (`white-space: nowrap`) si son muy largos.
