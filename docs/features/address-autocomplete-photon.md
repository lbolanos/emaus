# Buscador de direcciones — Photon (OpenStreetMap)

Migración de todos los buscadores de dirección de Google Maps Platform a
**Photon** (photon.komoot.io, sobre OpenStreetMap). Motivo: la API key de Google
expiró (nov 2026) y Maps Platform exige tarjeta de crédito para renovarla, con
créditos mensuales que la organización no puede garantizar administrativamente.

Fecha: 2026-11-21. Commits: `11eaccbf` (casas), `c66a4b59` (comunidades/retiros)
+ limpieza.

## Qué usa cada pieza

| Pieza | Antes (Google) | Ahora |
| --- | --- | --- |
| Autocomplete de direcciones | `gmp-place-autocomplete` + Place Details (2 llamadas) | `AddressAutocomplete.vue` + `searchPhoton` (1 llamada) |
| Mapa del modal de casa | `google.maps.Map` + `AdvancedMarkerElement` | iframe embed público (`maps?q=lat,lng&output=embed`), sin key |
| Mapa del registro de comunidad (pin arrastrable/clicable) | Maps JS API | **Leaflet** + tiles OSM |
| Geocoder forward (recoloca pin al editar campos) | `google.maps.Geocoding` | `searchPhoton` (primer resultado) |
| URL de Google Maps de una dirección | `googleMapsURI` de Place Details | link construido `google.com/maps/search/?api=1&query=lat,lng` |
| Inferencia de timezone | `tz-lookup` (offline, en el API) | sin cambios |

Dónde vive cada consumidor: `AddEditHouseModal.vue` (casas),
`CommunityListView.vue` (admin de comunidades), `RegisterCommunityView.vue`
(registro público) y `RetreatModal.vue` (iglesia de clausura, tab Clausura).

## Servicio: `apps/web/src/services/photon.ts`

- `searchPhoton(query, { limit, signal, lat, lon, zoom })` — HTTP GET a
  `https://photon.komoot.io/api/` con `lang=default` (Photon no soporta `es`;
  `default` devuelve nombres locales). CORS abierto, sin key.
- `parsePhotonFeature(feature)` — compone `PhotonAddress` desde el GeoJSON.
  Reglas de parseo para México: la colonia viene en `locality` y la ciudad en
  `district` (no en `city`); la cadena de fallback de ciudad es
  `city → town → village → municipality → county → district`.
- `address1` = `calle número, colonia` (partes filtradas: nunca coma huérfana —
  el compositor de Google producía `", EL PEDREGAL"` cuando faltaban partes).
- `placeName` — nombre del POI si el resultado no es una calle (se usa para
  autollenar el nombre de la iglesia de clausura).
- Sin calle ni POI la sugerencia se descarta (`null`): "Colonia X" sola no es
  una dirección utilizable.

## Componente: `apps/web/src/components/form/AddressAutocomplete.vue`

- Props: `modelValue` (soporta `string | null`), `placeholder`, `error` y sesgo
  geográfico `biasLat`/`biasLon`/`biasZoom` (**default CDMX, zoom 9** — sin
  sesgo, "CDMX" devuelve primero España/Colombia; con él, México primero).
- Emite `update:modelValue` mientras se escribe y `select(PhotonAddress)` al
  elegir una sugerencia (que llena ciudad/estado/CP/país/coords/URL Maps).
- Debounce 300 ms, `AbortController` para cancelar búsquedas obsoletas,
  teclado (flechas/Enter/Escape). El dropdown es inline `position: absolute`
  (dentro de Dialogs, `Popover`+`Command` no monta — ver skill `troubleshooting`
  del buscador dentro de diálogo).

## Leaflet (solo registro de comunidad)

- Deps: `leaflet` + `@types/leaflet` (~40 KB gzip). Tiles:
  `tile.openstreetmap.org` con atribución.
- El pin es un `L.divIcon` con CSS (los iconos default de Leaflet traen rutas de
  imagen que los bundlers rompen).
- La CSP de prod (`default-src 'self' https:`) ya permite iframe de Google,
  tiles OSM y `fetch` a photon.komoot.io — no se tocó nginx.

## Trade-offs aceptados

- Photon es un servicio comunitario de komoot sin SLA. Para el volumen de
  Emaús (decenas de búsquedas/mes) sobra; fallback natural si un día molesta:
  Nominatim o self-host (imagen Docker de photon).
- Calidad de sugerencias: OSM es bueno en zonas urbanas de MX; numeraciones
  nuevas pueden faltar. Para capturar casas de retiro e iglesias, suficiente.
- `runtime-config.js` de prod sigue inyectando la key muerta (nadie la lee):
  inofensivo. Pendiente opcional: quitar la variable del workflow de deploy, de
  los scripts `deploy/aws/*.sh` y el secret de GitHub.

## Tests

- `apps/web/src/services/__tests__/photon.test.ts` — parseo (formato MX, POI,
  sin coords, coma huérfana), URL de la llamada, abort, bias geográfico.
- `apps/web/src/components/form/__tests__/AddressAutocomplete.test.ts` —
  debounce, seleccionar con click y Enter, Escape, mínimo de caracteres.
