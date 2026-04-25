---
name: santisimo
description: "Horario de Guardias de la Capilla (adoración al Santísimo) — arquitectura, API, flujo público y convenciones."
---

# Santísimo / Horario de Guardias de la Capilla

Sistema de inscripción a slots horarios de adoración eucarística para cada retiro. Permite generar slots automáticamente entre dos fechas, activar un enlace público (slug del retiro) para que la comunidad externa ("angelitos") se inscriba solo con nombre, y administrar las inscripciones desde la vista admin.

## Dominio

- Formato tradicional: columnas **Viernes / Sábado / Domingo**, filas de "X a Y AM/PM".
- Rango típico: viernes 17:00 → domingo 13:00, slots de 60 min.
- Capacidad típica = **1 persona por slot** (configurable).
- Algunas horas se marcan "No se requiere" — el slot aparece pero no acepta inscripción (`isDisabled=true`).
- Quien se inscribe: mayoritariamente la **comunidad externa** (padrinos, ex-retirantes, familiares) — los caminantes no se inscriben.
- Un "angelito" puede inscribirse con solo el nombre. Teléfono y correo son opcionales.

## Modelo de datos

Dos tablas nuevas + un flag en `retreat`:

### `retreat.santisimoEnabled`
Flag booleano que habilita el enlace público. El enlace funciona si `retreat.isPublic && retreat.santisimoEnabled`.

### `santisimo_slot`
- `id`, `retreatId` (FK → retreat, CASCADE)
- `startTime`, `endTime` (datetime)
- `capacity` (int, default 1)
- `isDisabled` (boolean, default false) — equivale a "No se requiere esta hora"
- `intention`, `notes` (text, nullable)
- Índice único `(retreatId, startTime)` evita duplicados al regenerar.

### `santisimo_signup`
- `id`, `slotId` (FK → santisimo_slot, CASCADE)
- `name` (requerido, 120 chars)
- `phone`, `email` (opcionales)
- `userId` (nullable FK → users) — vincula si la persona existe como usuario
- `cancelToken` (único) — para auto-cancelación por enlace
- `ipAddress` (auditoría)

## Backend

### Archivos
- `apps/api/src/entities/santisimoSlot.entity.ts`
- `apps/api/src/entities/santisimoSignup.entity.ts`
- `apps/api/src/services/santisimoService.ts` — toda la lógica
- `apps/api/src/controllers/santisimoController.ts`
- `apps/api/src/routes/santisimoRoutes.ts` — montado bajo `/api/santisimo`
- `apps/api/src/migrations/sqlite/20260418120000_CreateSantisimo.ts`
- `packages/types/src/santisimo.ts` — Zod schemas

### Endpoints admin (auth + `requirePermission`)
- `GET    /api/santisimo/retreats/:retreatId/slots` — lista con `signedUpCount` e inscripciones
- `POST   /api/santisimo/retreats/:retreatId/slots` — crear slot
- `POST   /api/santisimo/retreats/:retreatId/slots/generate` — body `{ startDateTime, endDateTime, slotMinutes=60, capacity=1, clearExisting? }`
- `PATCH  /api/santisimo/slots/:id` — editar (incluye toggling `isDisabled`)
- `DELETE /api/santisimo/slots/:id`
- `GET    /api/santisimo/slots/:id/signups`
- `POST   /api/santisimo/retreats/:retreatId/signups` — admin inscribe (body: `{ slotId, name, phone?, email?, userId? }`, solo `name` requerido)
- `DELETE /api/santisimo/signups/:id`

### Endpoints públicos (sin auth, CSRF-exento, reCAPTCHA + rate limit)
- `GET    /api/santisimo/public/:slug` — esquema público (solo primer nombre de inscritos)
- `POST   /api/santisimo/public/:slug/signups` — body `{ slotIds[], name, phone?, email?, recaptchaToken }` → retorna `{ signups: [{ id, slotId, cancelToken }] }`
- `DELETE /api/santisimo/public/signups/:token` — auto-cancelación

Rechazos:
- 404 si `!retreat.isPublic || !retreat.santisimoEnabled`
- 409 si slot lleno (`CAPACITY`), deshabilitado (`DISABLED`), o ya pasó (`PAST`)

### Concurrencia
Capacidad suave: `SELECT COUNT → INSERT` sin lock. Overshoot de +1 aceptable (el admin puede ajustar manualmente). No usa `SELECT FOR UPDATE`.

### Permisos
- `santisimo:read` — ver horarios e inscripciones
- `santisimo:manage` — crear / editar / eliminar slots e inscripciones

Sembrados en la migración: `superadmin`, `admin`, `region_admin`, `communications` → ambos; `treasurer`, `logistics`, `regular_server`, `regular` → solo `read`.

## Frontend

### Archivos
- `apps/web/src/views/SantisimoAdminView.vue` — admin (tres columnas por día, generate dialog, inline edit, toggle disabled, inscripción admin de "angelitos")
- `apps/web/src/views/PublicSantisimoView.vue` — pública (tres columnas, checkbox multi-select, formulario con nombre/teléfono/email + reCAPTCHA, pantalla de éxito con links de cancelación)
- `apps/web/src/stores/santisimoStore.ts` — Pinia composition
- `apps/web/src/services/api.ts` — grupo `santisimoApi` al final

### Router
- `/app/retreats/:id/santisimo` (name: `santisimo`) — admin
- `/santisimo/:slug` (name: `public-santisimo`, `requiresAuth: false`) — pública

### Sidebar
Entrada en la sección `people`, icono `Cross`, con `routeName: 'santisimo'` y permiso `santisimo`. El helper `getRouteWithParams` en `Sidebar.vue` incluye `santisimo` en `routesRequiringId`.

### i18n
Claves bajo `santisimo.*` en `apps/web/src/locales/{es,en}.json`. El label de la sidebar está en `sidebar.santisimo` → "Guardias de la Capilla".

## Convenciones importantes

1. **Checkboxes**: reka-ui usa `model-value` (NO `checked`). Ya aplicado en la vista pública.
2. **reCAPTCHA**: acción `RECAPTCHA_ACTIONS.SANTISIMO_SIGNUP` añadida en `apps/web/src/services/recaptcha.ts`.
3. **CSRF**: las rutas `/santisimo/public` están en la lista de exenciones en `apps/api/src/routes/index.ts` (`applyCsrfProtectionExcept`).
4. **Slug reuse**: se usa `retreat.slug` existente, no se crea token aparte.
5. **Angelitos**: `name` es lo único obligatorio. Nunca validar contra usuarios existentes.
6. **Auto-cancelación**: los `cancelToken` solo se devuelven en la respuesta POST pública. La UI muestra URLs tipo `/santisimo/:slug?cancel=TOKEN`; el `onMounted` de la vista pública llama a `publicCancel` si detecta `?cancel=...`.

## Verificación end-to-end

1. `pnpm --filter api migration:run` → aplica `CreateSantisimo`.
2. Como admin: `/app/retreats/:id/santisimo` → activar toggle, click "Generar": viernes 17:00 → domingo 13:00, 60 min, cap 1 → se crean ~44 slots.
3. Marcar un slot como "No se requiere" → se muestra en gris con texto "No se requiere esta hora".
4. Editar capacidad de un slot a 2; añadir una inscripción admin con solo nombre.
5. Copiar enlace público; abrir en incógnita `/santisimo/<slug>`; seleccionar 2 slots, enviar con solo nombre; ver pantalla de éxito con cancelaciones.
6. La vista admin muestra las 2 inscripciones nuevas.
7. Visitar `/santisimo/<slug>?cancel=<token>` → cancela y libera cupo.
8. Endpoint público con `isPublic=false` o `santisimoEnabled=false` → 404.

## Troubleshooting

- **"Sesión expirada" al hacer POST público**: el endpoint no está en la lista CSRF-excluida. Verificar `'/santisimo/public'` en `applyCsrfProtectionExcept` en `apps/api/src/routes/index.ts`.
- **`santisimoEnabled` no se actualiza**: el campo debe estar en `retreatSchema` (`packages/types/src/index.ts`) para que `updateRetreatSchema` lo acepte.
- **"Lleno" aparece con 0 inscritos**: `capacity` quedó en 0 por un error al crear. Editar inline.
- **Conflictos al regenerar**: el índice único `(retreatId, startTime)` y la estrategia `INSERT OR IGNORE` evitan duplicados silenciosamente. Si se necesita limpiar, usar `clearExisting: true` en `generateSlots`.
- **Timezone**: se guarda UTC, se renderiza con los métodos locales del navegador (getHours/getMinutes).
