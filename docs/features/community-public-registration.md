# Registro público de comunidades

## Motivación

La landing pública (`LandingView.vue`) muestra un mapa con las comunidades de Emaús
existentes, pero antes de esta feature solo se podían crear comunidades desde el
panel autenticado por usuarios con permiso `community:create`. Para que cualquier
comunidad pueda darse de alta sin pasar por un superadmin manualmente, se añadió
un flujo público con validación, reCAPTCHA, rate limiting y aprobación posterior.

## Flujo

```
visitante anónimo                superadmin
        │                            │
        ▼                            │
[/registrar-comunidad]               │
   formulario                        │
        │                            │
        │ POST /communities/public/register
        │   reCAPTCHA + rate limit + Zod
        ▼                            │
   community.status = 'pending'      │
   submittedAt = now                 │
   createdBy   = NULL                │
        │                            │
        │  ◀─────  notificación  ─────│
        │                            ▼
        │                    [/app/communities/pending]
        │                       Aprobar  ──▶  status='active', approvedAt, approvedBy
        │                                     CommunityAdmin(owner)  ←  superadmin
        │                                     CommunityMeeting recurrente (si hay horario)
        │                       Rechazar ──▶  status='rejected', rejectionReason
        ▼
   GET /communities/public  filtra por status='active'
   landing pública la muestra en el mapa
```

## Datos capturados

### Tabla `community` — columnas añadidas (migración `20260507120000_AddPublicRegistrationToCommunity`)

| Columna                          | Tipo            | Notas                                                                                |
|----------------------------------|-----------------|--------------------------------------------------------------------------------------|
| `status`                         | varchar(20)     | enum `pending` / `active` / `rejected` — default `'active'`. Comunidades previas se backfillean a `active`. |
| `parish`                         | varchar(255)    | Parroquia                                                                             |
| `diocese`                        | varchar(255)    | Diócesis                                                                              |
| `website`                        | varchar(500)    | URL del sitio                                                                         |
| `facebookUrl`                    | varchar(500)    | URL de Facebook                                                                       |
| `instagramUrl`                   | varchar(500)    | URL de Instagram                                                                      |
| `contactName`                    | varchar(255)    | Nombre del responsable que registra                                                   |
| `contactEmail`                   | varchar(255)    | Email del responsable                                                                 |
| `contactPhone`                   | varchar(50)     | Teléfono del responsable                                                              |
| `submittedAt`                    | datetime        | Cuándo se envió el registro público                                                   |
| `approvedAt`                     | datetime        | Cuándo aprobó (o rechazó) el superadmin                                               |
| `approvedBy`                     | uuid            | FK a `users.id`, el superadmin que actuó                                              |
| `rejectionReason`                | text            | Razón opcional capturada al rechazar                                                  |
| `defaultMeetingDayOfWeek`        | varchar(20)     | enum `monday`–`sunday` — usado al aprobar para crear la reunión recurrente            |
| `defaultMeetingInterval`         | int             | Cada cuántas semanas (1, 2, 3, 4)                                                     |
| `defaultMeetingTime`             | varchar(5)      | Hora `HH:mm` (24h)                                                                    |
| `defaultMeetingDurationMinutes`  | int             | Duración en minutos (default 90)                                                      |
| `defaultMeetingDescription`      | text            | Descripción del lugar (ej. "Detrás de la sacristía después de la misa")               |

`createdBy` ahora es **nullable** (registros públicos no tienen usuario asociado).

La migración recrea la tabla (SQLite no permite `ALTER COLUMN` para hacer
nullable un NOT NULL existente), preserva los datos previos y añade el índice
`IDX_community_status` para acelerar `getPublicCommunities`.

## Endpoints

### Públicos (sin auth)

| Método | Path                                  | Middleware                                | Descripción                                                                |
|--------|---------------------------------------|-------------------------------------------|----------------------------------------------------------------------------|
| POST   | `/api/communities/public/register`    | `publicCommunityRegisterLimiter` (3/IP/h) + `validateRequest(publicRegisterCommunitySchema)` | Crea comunidad en `pending`. Verifica reCAPTCHA antes. |
| GET    | `/api/communities/public`             | —                                         | Lista comunidades **`active`** (devuelve sólo `id, name, city, state, lat, lng`). |
| GET    | `/api/communities/public/meetings`    | —                                         | Reuniones próximas (no relacionado a esta feature).                        |

### Autenticados (`requireRole('superadmin')`)

| Método | Path                                | Descripción                                                                  |
|--------|-------------------------------------|------------------------------------------------------------------------------|
| GET    | `/api/communities/pending`          | Lista comunidades con `status='pending'`, ordenadas por `submittedAt DESC`. |
| POST   | `/api/communities/:id/approve`      | Cambia a `active`, asigna superadmin como `CommunityAdmin(owner)`, crea reunión recurrente automática si hay datos de horario. |
| POST   | `/api/communities/:id/reject`       | Cambia a `rejected`, guarda `rejectionReason` opcional.                      |

`getCommunities()` (la vista `/app/communities`) hace **bypass para
superadmin**: devuelve todas las comunidades activas independientemente de
si el usuario tiene un registro `community_admin`. Antes filtraba sólo por
`community_admin` y dejaba colgando las comunidades sin admins.

## Vista pública: `/registrar-comunidad`

Componente: `apps/web/src/views/RegisterCommunityView.vue`. Layout autónomo
(no usa `AppLayout`). Secciones:

1. **Datos de la comunidad**: nombre*, descripción, parroquia, diócesis.
2. **Ubicación**: `<gmp-place-autocomplete>` con autocompletado de Google
   Places que rellena `address1/2`, ciudad, estado, CP, país, lat/lng,
   `googleMapsUrl`. Mapa interactivo con marker arrastrable
   (`AdvancedMarkerElement`) y `gestureHandling: 'greedy'` (zoom con scroll
   wheel y move con un dedo en móvil).
3. **Horario de reunión (opcional)**: día (selector con 7 opciones),
   frecuencia (cada 1/2/3/4 semanas), hora (input `type="time"`),
   duración, descripción del lugar. Si todos los campos del horario están
   llenos, al aprobar se crea automáticamente una `CommunityMeeting`
   recurrente.
4. **Sitio web y redes sociales (opcional)**: URLs.
5. **Datos del responsable**: contactName*, contactEmail*, contactPhone.

**reCAPTCHA**: token generado con
`getRecaptchaToken(RECAPTCHA_ACTIONS.COMMUNITY_REGISTER)` y enviado en el
body. El backend lo valida con `RecaptchaService.verifyToken({ minScore: 0.5 })`.

**Validación**: Zod doble (cliente + servidor) con
`publicRegisterCommunitySchema` en `packages/types/src/community.ts`.

## Vista de moderación: `/app/communities/pending`

Componente: `apps/web/src/views/PendingCommunitiesView.vue`. Solo visible
para `superadmin` (guard `requiresSuperadmin: true` en el router; entrada
añadida en `Sidebar.vue`).

Cada tarjeta muestra todos los datos de la comunidad pendiente
(dirección, contacto, redes, horario propuesto en español) con dos
acciones:

- **Aprobar**: confirm dialog → `approveCommunity(id)`. La comunidad
  desaparece de la lista; queda en `active` y aparece en la landing.
- **Rechazar**: modal con textarea para razón opcional →
  `rejectCommunity(id, reason)`. Guarda `rejectionReason`.

## Lógica de aprobación

`communityService.approveCommunity(id, approverId)`:

1. Carga la comunidad. Si ya está `active`, no-op.
2. Setea `status='active'`, `approvedAt`, `approvedBy`, limpia
   `rejectionReason`.
3. Si transitó desde `pending`:
   - Crea registro `CommunityAdmin` con `role='owner'`,
     `status='active'` para el aprobador (si no existe ya). Permite
     que el superadmin pueda gestionar la comunidad después y eventualmente
     invitar al responsable real como admin con el sistema de invitaciones
     existente (`inviteCommunityAdmin`).
   - Llama a `createDefaultMeetingForCommunity` si hay
     `defaultMeetingDayOfWeek` + `defaultMeetingInterval` +
     `defaultMeetingTime`. La meeting se crea con
     `isRecurrenceTemplate=true`, `recurrenceFrequency='weekly'`,
     `recurrenceDayOfWeek` y `recurrenceInterval` heredados, y
     `startDate` calculado al próximo día de la semana indicado a partir
     de la hora dada (helper `getNextDayOfWeekDate`).

## Configuración

### Rate limiting (`rateLimiting.ts`)

```ts
publicCommunityRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,  // 1 hora
  max: 3,                     // 3 registros / IP
  keyGenerator: req => req.ip,
});
```

Skipeado en `NODE_ENV=development` con `SKIP_RATE_LIMIT=true`.

### reCAPTCHA

- Acción: `community_register` (constante en
  `apps/web/src/services/recaptcha.ts`).
- Score mínimo: 0.5.
- En desarrollo (`NODE_ENV=development`) `RecaptchaService` salta la
  verificación y devuelve siempre `{ valid: true }`.

### Google Maps

- API key: `VITE_GOOGLE_MAPS_API_KEY` (en `apps/web/.env*`).
- Helper compartido `apps/web/src/utils/googleMaps.ts` carga el script con
  `loading=async`. Tras esta feature se añadió un poll que **espera a que
  `google.maps.importLibrary` esté disponible** antes de resolver — sin
  esto, en Safari/WebKit el `script.onload` resolvía antes de que los
  constructores estuvieran instanciables y `new google.maps.Map(...)`
  lanzaba `TypeError`.
- `AdvancedMarkerElement` (la API moderna no-deprecada) requiere `mapId`
  en el `Map`. Se usan strings ad-hoc `'EMAUS_REGISTER_MAP'` y
  `'EMAUS_HOUSE_MAP'`. Si en el futuro se quieren estilos custom, se
  registran en Google Cloud Console.

## i18n

Strings nuevos en `apps/web/src/locales/{es,en}.json`:

- `landing.registerCommunityCta`: "Registra tu comunidad" / "Register your community"
- `sidebar.pendingCommunities`: "Comunidades pendientes" / "Pending communities"

El resto de la vista pública usa strings hardcodeados en español
(consistente con el dominio del proyecto).

## Tests

Archivo: `apps/api/src/tests/services/communityPublicRegistration.simple.test.ts`

27 tests que cubren:

- **Zod**: input válido, horario opcional completo, URLs vacías
  transformadas a `undefined`, email y lat/lng inválidos, name vacío y
  sobre 200 chars, recaptchaToken obligatorio, día/hora con formato
  inválido, intervalos no positivos, normalización (toLowerCase email,
  trim de strings).
- **`approveCommunitySchema` / `rejectCommunitySchema`**: aceptan UUID
  válido, rechazan no-UUID, razón opcional con tope de 2000 chars.
- **Enums**: `CommunityStatusEnum` y `DayOfWeekEnum` exponen los valores
  esperados.
- **`getNextDayOfWeekDate`**: lógica del cálculo del próximo día de la
  semana — siguiente semana si ya pasó, mismo día si la hora aún no
  llegó, case-insensitive del día de la semana.

```bash
pnpm --filter api exec jest src/tests/services/communityPublicRegistration.simple.test.ts
# Tests: 27 passed
```

## Verificación end-to-end

1. **Migración**:
   ```bash
   pnpm --filter api migration:run
   sqlite3 apps/api/database.sqlite "PRAGMA table_info(community);"
   ```
   Verificar que las columnas nuevas existen y `createdBy` es nullable.
   Comunidades previas quedan con `status='active'`.

2. **Registro público sin login**: abrir `/registrar-comunidad`, llenar
   con autocomplete Google, mapa, horario y enviar. Verificar pantalla
   de éxito y la fila en BD con `status='pending'`, `submittedAt`,
   `createdBy=NULL`, datos íntegros.

3. **Filtrado público**: `curl /api/communities/public` no debe incluir
   la nueva. La landing tampoco.

4. **Endpoints protegidos**: `curl /api/communities/pending` sin cookies
   → 401. `curl POST /api/communities/:id/approve` sin cookies → 403.

5. **Aprobación** desde `/app/communities/pending` con login superadmin.
   Verificar:
   - `community.status='active'`, `approvedAt`, `approvedBy` poblados.
   - `community_admin` con `role='owner'`, `status='active'`.
   - `community_meeting` con `isRecurrenceTemplate=1`, fecha del próximo
     día de la semana indicado, hora correcta convertida a UTC.
   - `/api/communities/public` ahora incluye la comunidad.

6. **Rechazo**: misma vista, botón rechazar con razón. BD: `status='rejected'`,
   `rejectionReason` poblado. No aparece en `/api/communities/public`.

7. **Rate limit**: cuatro POST a `/communities/public/register` en una
   hora desde la misma IP → el 4º responde 429. (Saltable con
   `SKIP_RATE_LIMIT=true` en dev.)

8. **Safari/WebKit**: probar `/registrar-comunidad` y abrir el modal de
   `AddEditHouseModal` (`/app/houses` → editar). Mapa debe renderizar
   tiles al primer intento, sin errores `TypeError: google.maps.Map`.
