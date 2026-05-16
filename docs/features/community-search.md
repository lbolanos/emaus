# Community Search (Landing Page)

Búsqueda y descubrimiento de comunidades Emaús desde el landing público (`/`), sin requerir autenticación.

## Vista general

La sección "Encuentra tu Comunidad" en `LandingView.vue` permite a los visitantes:

- **Buscar comunidades** por nombre, ciudad o estado (filtrado en tiempo real)
- **Ordenar por cercanía** usando la geolocalización del navegador
- **Ver reuniones próximas** en una tabla que se reordena/filtra junto con las comunidades
- **Solicitar unirse** a una comunidad vía `PublicJoinRequestModal`

## Fuentes de datos

Dos endpoints públicos (sin auth):

| Endpoint | Devuelve |
|---|---|
| `GET /api/communities/public` | Comunidades con `status: 'active'`. Campos: `id, name, description, city, state, zipCode, address1, address2, country, parish, diocese, googleMapsUrl, website, facebookUrl, instagramUrl, latitude, longitude, defaultMeetingDayOfWeek, defaultMeetingTime, defaultMeetingDurationMinutes, defaultMeetingDescription` |
| `GET /api/communities/public/meetings` | Próximas ~20 reuniones (30 días) con la comunidad embebida |

Implementados en `apps/api/src/services/communityService.ts` y expuestos en `apps/api/src/routes/communityRoutes.ts`.

## Lógica del cliente (LandingView.vue)

### Estado

```ts
const searchQuery = ref('');                                   // texto del input (reactivo inmediato)
const debouncedSearchQuery = refDebounced(searchQuery, 200);   // versión debounced (200ms)
const userLocation = ref<{ lat: number; lng: number } | null>(null);
const isGeolocating = ref(false);                              // spinner durante getCurrentPosition
const communities = ref<any[]>([]);                            // payload del API
const meetings = ref<any[]>([]);                               // payload del API
```

El input usa `v-model="searchQuery"` (responsivo al usuario) pero el computed `filteredCommunities` consume `debouncedSearchQuery` para evitar recalcular Haversine en cada keystroke.

### Computed properties

```ts
// Filtra por texto (name/city/state/zipCode/parish) y ordena por distancia
const filteredCommunities = computed(() => {
  let result = communities.value;
  if (q) {
    result = result.filter(c =>
      c.name?.toLowerCase().includes(q) ||
      c.city?.toLowerCase().includes(q) ||
      c.state?.toLowerCase().includes(q) ||
      c.zipCode?.toLowerCase().includes(q) ||
      c.parish?.toLowerCase().includes(q)
    );
  }
  if (userLocation) {
    result = [...result].sort((a, b) => distance(a) - distance(b));
  }
  return result;
});

// Filtra meetings a las comunidades de filteredCommunities, y las
// reordena para seguir el mismo orden (cercanía/relevancia)
const filteredMeetings = computed(() => {
  const orderIndex = new Map<string, number>();
  filteredCommunities.value.forEach((c, i) => orderIndex.set(c.id, i));
  return meetings.value
    .filter(m => orderIndex.has(m.community?.id))
    .sort((a, b) => {
      const ai = orderIndex.get(a.community?.id) ?? Infinity;
      const bi = orderIndex.get(b.community?.id) ?? Infinity;
      return ai !== bi ? ai - bi : (new Date(a.startDate).getTime() - new Date(b.startDate).getTime());
    });
});
```

### Geolocalización

Tres puntos de entrada:

1. **`detectLocationSilently()`** — llamada en `onMounted`. Si el usuario ya concedió permiso, las comunidades se ordenan por cercanía automáticamente. Si se deniega, **no se muestra ningún error** (UX silenciosa).
2. **`useMyLocation()`** — llamada al clicar el botón "Usar Mi Ubicación". Igual al anterior pero sí muestra toast de error si falla.
3. **`clearFilters()`** — resetea `searchQuery` y `userLocation`.

Distancias calculadas con la fórmula de **Haversine** en `haversineDistance(lat1, lon1, lat2, lon2): number` (resultado en km).

### Comportamiento visual

- **Mapa Leaflet real con OpenStreetMap:** `CommunityMap.vue` carga Leaflet de forma lazy (vía `defineAsyncComponent`) y muestra pines reales sobre la geografía. Click en un pin abre el modal de detalle.
- **Tarjeta "Círculo Más Cercano":** muestra `filteredCommunities[0]` con ciudad/estado y distancia (km/m) si hay geolocalización.
- **Modal de detalle (`CommunityDetailModal.vue`):** paso intermedio antes de "Unirse". Muestra dirección, parroquia/diócesis, día y hora de reuniones, links a Google Maps / web / redes sociales.
- **Estado vacío:** cuando `filteredCommunities.length === 0` con filtro activo, se muestra ícono + mensaje + botón "Limpiar filtros".
- **Contador de resultados:** "{N} comunidades encontradas" debajo del input, con `aria-live="polite"` para screen readers.
- **Botón cambia entre "Buscar" y "× Limpiar"** según haya filtros activos.

### Accesibilidad

- Input de búsqueda con `<label class="sr-only">`, `aria-label`, `type="search"`, `autocomplete="off"`.
- Botón "Usar Mi Ubicación" con `aria-pressed` (refleja si la ubicación está activa) y `aria-busy` durante la solicitud.
- Mapa Leaflet con `aria-hidden="true"` (es decoración geográfica; los datos están en las cards y modal).
- Contador con `role="status" aria-live="polite"` para anunciar cambios al filtrar.
- Modal con `role="dialog" aria-modal="true"` y `aria-label` con el nombre de la comunidad.

### Manejo de errores

`fetchData()` usa `Promise.allSettled` — un fallo en un endpoint no rompe los otros. Si `getPublicCommunities()` falla, se muestra toast con `landing.fetchError` + `landing.fetchErrorDesc`. Si solo falla retreats o meetings, se loguea silenciosamente.

### Notificaciones por email al unirse

Cuando un visitante envía una solicitud pública (`createPublicJoinRequest`), se disparan dos emails de forma **fire-and-forget** (un fallo de SMTP no rompe la creación del miembro):

1. **A los admins de la comunidad** — todos los `CommunityAdmin` con `status='active'` y `role IN ('owner','admin')`. Incluye nombre, email y teléfono del solicitante.
2. **Confirmación al solicitante** — confirma que los coordinadores fueron notificados y se pondrán en contacto.

Los emails se renderizan inline con HTML semántico. Todo input del solicitante se escapa con un helper `escapeHtml` para prevenir XSS en clientes de correo que renderizan HTML.

Si SMTP no está configurado (`isSmtpConfigured() === false`), se omite el envío sin error. La función `notifyJoinRequest()` está en `apps/api/src/services/communityService.ts` con tests en `apps/api/src/tests/services/communityService.test.ts > createPublicJoinRequest — notificaciones`.

## Archivos clave

| Archivo | Propósito |
|---|---|
| `apps/web/src/views/LandingView.vue` | UI principal + lógica de búsqueda/geolocalización |
| `apps/web/src/components/landing/CommunityMap.vue` | Mapa Leaflet lazy-loaded con marcadores reales |
| `apps/web/src/components/landing/CommunityDetailModal.vue` | Modal de detalle paso intermedio (dirección, parroquia, horarios) |
| `apps/web/src/views/__tests__/LandingView.test.ts` | Unit tests — bloque `describe('Community Search')` (32 casos) |
| `apps/web/tests/e2e/community-search.spec.ts` | E2E Playwright — 6 escenarios con geolocalización real |
| `apps/web/src/locales/{es,en}.json` | Claves: `landing.search*`, `landing.clearSearch`, `landing.noCommunitiesFound`, `landing.clearFilters`, `landing.location*`, `landing.communitiesFound`, `landing.usingLocation`, `landing.detail.*`, `landing.fetchError*` |
| `apps/api/src/services/communityService.ts` | `getPublicCommunities()`, `getPublicMeetings()` |
| `apps/api/src/routes/communityRoutes.ts` | Rutas públicas: `/communities/public`, `/communities/public/meetings` |

## Tests

**Unit tests (Vitest):**
```bash
pnpm --filter web test src/views/__tests__/LandingView.test.ts
```

**E2E tests (Playwright):**
```bash
cd apps/web && pnpm exec playwright test community-search.spec.ts --project=chromium
```

Cubre:

- Carga de datos al montar
- Filtrado por nombre, ciudad y estado (case-insensitive)
- Estado vacío y restauración al limpiar
- Botón "Limpiar" aparece/oculta y resetea filtros
- Contador de resultados solo con filtro activo
- Geolocalización automática silenciosa al montar
- No mostrar error si la geolocalización es denegada
- Ordenamiento de comunidades por distancia
- Distancia en tarjeta inferior (km/m)
- Spinner mientras geolocalizando
- Tabla de reuniones filtrada por búsqueda
- Tabla de reuniones ordenada por cercanía

## Decisiones de diseño

- **Leaflet + OpenStreetMap (no Google Maps):** sin API key, sin costo, ~40 KB gzip. Lazy-loaded vía `defineAsyncComponent` para no inflar el bundle inicial del landing.
- **Override de Tailwind preflight:** `img { max-width: 100% }` rompe los tiles de Leaflet (quedan con width=0). En `CommunityMap.vue` hay un `<style>` global que restaura `max-width: none` para `.leaflet-container img.*`.
- **CRÍTICO — Ref `mapEl` debe ir en div sin `:class` reactivo:** si el div que recibe `L.map(el)` tiene un `:class` reactivo, Vue resincroniza el atributo `class` y borra `.leaflet-container` que Leaflet añade. Usar wrapper externo para estados reactivos.
- **Filtrado client-side:** el API público devuelve todas las comunidades activas (~12-20 registros), por lo que filtrar en el navegador es trivial. No tiene sentido agregar params de búsqueda al endpoint hasta que el volumen lo justifique.
- **Geolocalización silenciosa al cargar:** los navegadores recuerdan permisos por origen. Si el usuario ya dio permiso antes, la experiencia es instantánea sin prompts. Si nunca lo dio, el browser muestra el banner habitual y no hay UX rota.
- **Debounce 200ms:** balance entre responsividad visual (input v-model inmediato) y costo de recálculo (Haversine + sort).
- **Modal de detalle antes de Unirse:** evita "lead leakage" — el usuario ve la info de la comunidad (horario, ubicación, contacto) antes de comprometerse a llenar el formulario de solicitud.
