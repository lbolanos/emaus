---
name: closing-mass-church
description: "Misa de Clausura por retiro — captura de iglesia + dirección + lat/lng vía Google Places, visualización en dashboard con detección de plataforma (iOS/Android/desktop) y plantillas globales de invitación a familiares (WhatsApp + Email)."
---

# Misa de Clausura — Iglesia, dirección y plantillas para invitar familiares

Sistema para capturar **dónde se realiza la misa de clausura** de cada retiro y disponibilizarla en el dashboard del retiro y en plantillas de mensajes para invitar a los familiares. La iglesia puede ser distinta a la parroquia organizadora (`Retreat.parish`) y a la casa del retiro (`House.address1`), por eso se guarda **por retiro**.

## Modelo de datos

Cuatro columnas nullable en `retreat`:

| Columna | Tipo | Origen |
| --- | --- | --- |
| `closingChurchName` | `VARCHAR(255)` | `place.displayName` |
| `closingChurchAddress` | `TEXT` | formato derivado de `place.addressComponents` |
| `closingChurchLatitude` | `REAL` | `place.location.lat()` |
| `closingChurchLongitude` | `REAL` | `place.location.lng()` |

**`closingChurchMapsUrl` NO se persiste.** Las URLs (Maps universal y Waze) se construyen en runtime desde lat/lng con dos helpers de `@repo/utils`:

```ts
buildClosingChurchMapsUrl(lat, lng);  // https://www.google.com/maps/search/?api=1&query=lat,lng
buildClosingChurchWazeUrl(lat, lng);  // https://waze.com/ul?ll=lat,lng&navigate=yes
```

Ambos devuelven cadena vacía si lat/lng son `null`/`undefined` para no romper plantillas con `"Cómo llegar: undefined"`.

Migration: `apps/api/src/migrations/sqlite/20260509000000_AddClosingChurchAndFamilyInvitationTemplates.ts`.

## Captura UI — RetreatModal tab "Clausura"

**Archivo:** `apps/web/src/components/RetreatModal.vue`.

Tab nueva entre "Notes" y "Flyer" (`<TabsTrigger value="closing">Clausura</TabsTrigger>`). Reutiliza el patrón de `<gmp-place-autocomplete>` que ya existe en `AddEditHouseModal.vue:56-92`:

```html
<gmp-place-autocomplete
  v-if="closingChurchAddressEditing"
  ref="closingChurchAutocompleteField"
  :requested-fields="['displayName', 'addressComponents', 'location']"
  :value="formData.closingChurchAddress"
/>
```

`handleClosingPlaceChange` llena los 4 campos del retiro, usando `place.displayName` como fallback del nombre solo si el campo está vacío (no sobrescribe lo que el usuario haya tipeado).

**Carga lazy de Google Maps**: el script `loadGoogleMaps()` se importa al activar la tab Clausura (watcher sobre `activeTab`) y al primer click sobre el input — evita cargar el SDK si el usuario no edita esa pestaña.

Bloque "Vista previa de URLs" muestra ambos links (Maps + Waze) construidos desde lat/lng, con botones Copiar/Abrir, para que el coordinador confirme antes de guardar qué URLs irán a las plantillas.

## Visualización en dashboard

**Archivo:** `apps/web/src/views/RetreatDashboardView.vue`, sección "Información Adicional" (línea ~915).

`Card v-if="closingChurchName || closingChurchAddress"` con dos botones:

- **`Abrir mapa`** — llama `openLocation(lat, lng)` de `apps/web/src/utils/openLocation.ts`. Detección por `navigator.userAgent`:
  - iOS (iPhone/iPad/iPod) → `maps://?q=lat,lng` (abre Apple Maps directo).
  - Android → `geo:lat,lng?q=lat,lng` (invoca el **selector nativo**: Google Maps, Waze, etc.).
  - Otro / desktop → fallback a la URL universal HTTPS en pestaña nueva.
- **`Abrir en Waze`** — `window.open(buildClosingChurchWazeUrl(lat, lng), '_blank')`.

## Plantillas de mensajes — variables disponibles

`packages/utils/src/index.ts → buildRetreatReplacements()` expone 4 placeholders:

| Variable | Valor |
| --- | --- |
| `{retreat.closingChurchName}` | Nombre de la iglesia |
| `{retreat.closingChurchAddress}` | Dirección formateada |
| `{retreat.closingChurchMapsUrl}` | URL universal Google Maps (construida desde lat/lng) |
| `{retreat.closingChurchWazeUrl}` | URL universal Waze (construida desde lat/lng) |

`BaseMessageTemplateModal.vue` las lista en el panel de variables del editor.

## Plantillas globales sembradas

La migración hace seed idempotente de dos plantillas en `global_message_templates` (skip si ya existen por nombre):

### `FAMILY_CLOSING_INVITATION_WHATSAPP` (texto plano)

```
Hola, queremos invitarte con mucho cariño a la *Misa de Clausura* del retiro de *{retreat.parish}*.

📅 {retreat.endDate}
⛪ {retreat.closingChurchName}
📍 {retreat.closingChurchAddress}

🗺️ Cómo llegar (Maps): {retreat.closingChurchMapsUrl}
🚗 En Waze: {retreat.closingChurchWazeUrl}

¡Te esperamos! 🙏
```

### `FAMILY_CLOSING_INVITATION_EMAIL` (HTML)

`<h2>Te invitamos a la Misa de Clausura</h2>` (el procesador de plantillas extrae el `subject` del primer `<h1>`/`<h2>`) + datos del retiro y dos `<a href>` con las URLs derivadas.

## Por qué URL universal en plantillas y deeplink en botones

Distinción crítica que hay que mantener:

- **En texto que viaja por WhatsApp/Email/QR** → usar siempre la URL universal HTTPS (`https://www.google.com/maps/search/?api=1&query=...`). Cualquier dispositivo o app de escaneo la abre sin error. **Nunca pongas `geo:` o `maps://` en texto/QR** — escaners y clientes de email los rechazan o muestran texto plano.
- **En botones in-app del dashboard** → usar `openLocation()` que detecta plataforma y dispatcha al esquema nativo (`maps://` en iOS, `geo:` en Android, fallback HTTPS en desktop). Esto invoca el chooser nativo en mobile.

El deeplink corto de Places (`https://maps.app.goo.gl/...` que devuelve `place.googleMapsURI`) **no se persiste** porque:
- Su vida útil depende de Google y puede cambiar.
- No aporta nada que `lat/lng + name` no nos den.
- Una columna menos.

## Tests

- `apps/api/src/tests/services/closingChurchUrls.test.ts` — 11 tests sobre los helpers (formato HTTPS, signos negativos, equator, valores `null`/`undefined`).
- `apps/api/src/tests/services/messageVariables.test.ts → describe('Closing church variables')` — 5 tests end-to-end via `replaceAllVariables` y `findEmptyVariables`.
- `apps/web/src/utils/__tests__/openLocation.test.ts` — 6 tests de detección de plataforma con UAs de iPhone/iPad/Android/Chrome desktop + UA vacío.

## Archivos relevantes

### Backend / paquetes compartidos
- `apps/api/src/migrations/sqlite/20260509000000_AddClosingChurchAndFamilyInvitationTemplates.ts`
- `apps/api/src/entities/retreat.entity.ts` — 4 `@Column` nuevas tras `timezone`.
- `apps/api/src/entities/globalMessageTemplate.entity.ts` — 2 valores nuevos en `GlobalMessageTemplateType`.
- `packages/types/src/index.ts` — 4 campos en `retreatSchema`.
- `packages/types/src/message-template.ts` — 2 valores en `messageTemplateTypes`.
- `packages/utils/src/index.ts` — `RetreatData` extendido + helpers `buildClosingChurchMapsUrl/WazeUrl` + entries en `buildRetreatReplacements`.

### Frontend
- `apps/web/src/utils/openLocation.ts` — helper de plataforma.
- `apps/web/src/components/RetreatModal.vue` — tab "Clausura".
- `apps/web/src/views/RetreatDashboardView.vue` — Card "Misa de Clausura".
- `apps/web/src/components/BaseMessageTemplateModal.vue` — variables nuevas en el panel.

## Flujo end-to-end manual

1. Editar un retiro → tab "Clausura" → escribir nombre de iglesia → seleccionar resultado del autocompletado → confirmar coordenadas → guardar.
2. Ir a `/app/retreats/:id/dashboard` → confirmar que aparece la card "Misa de Clausura" con dos botones funcionales.
3. Ir a "Plantillas Globales" → confirmar que existen `FAMILY_CLOSING_INVITATION_WHATSAPP` y `FAMILY_CLOSING_INVITATION_EMAIL`.
4. Procesar plantilla con un retiro que tenga datos de iglesia → verificar que las 4 variables se sustituyen.
5. **Mobile QA real**: en iPhone "Abrir mapa" debe abrir Apple Maps; en Android debe ofrecer chooser (Google Maps, Waze, etc.); en desktop debe abrir Google Maps web en pestaña nueva.

## Antipatrones

- **No agregues una columna `closingChurchMapsUrl`** — usa el helper. Cualquier futuro link (Apple Maps, OpenStreetMap, etc.) se construye igual desde lat/lng.
- **No uses `place.googleMapsURI`** ya. Lo eliminamos a propósito; depender de su shortlink era frágil.
- **No metas `geo:` ni `maps://` en plantillas WhatsApp/Email** — solo URL HTTPS universal.
- **No hagas detección de plataforma en backend** — el contexto de plataforma vive solo en el navegador del usuario final que abrirá el link, no en el servidor que renderiza la plantilla.
- **No omitas el chequeo `lat != null`** en helpers de URL. Si lat/lng son `null` y se devolviera `https://...?query=null,null` los usuarios irían a la mitad del Pacífico.
