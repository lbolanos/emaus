# AGENTS.md

This file provides guidance to AI Agents when working with code in this repository.

## Project Architecture

This is a retreat logistics management system built as a monorepo using pnpm workspaces and Turborepo. The system manages religious retreats with features for participant management, housing assignments, table assignments, and various administrative tasks.

### Monorepo Structure

- **apps/api**: Express.js backend with TypeORM and SQLite
- **apps/web**: Vue.js 3 frontend with Composition API, Vite, and Pinia
- **packages/config**: Shared ESLint configurations
- **packages/tsconfig**: Shared TypeScript configurations
- **packages/types**: Shared Zod schemas and TypeScript types
- **packages/ui**: Shared Vue components

### Core Development Commands

```bash
# Install dependencies
pnpm install

# Run all pending migrations
pnpm --filter api migration:run

# Development (runs both API and web)
pnpm dev

# Build all applications
pnpm build

# Lint all applications
pnpm lint

# Format code
pnpm format

# Testing
pnpm test                    # Run all tests (field mapping tests)
pnpm test:field-mapping      # Run Excel field mapping tests specifically
pnpm test:watch             # Run tests in watch mode
pnpm test:coverage          # Run tests with coverage reporting
```

### Development Environment

- API runs on `http://localhost:3001`
- Web app runs on `http://localhost:5173`

## Key Business Concepts

### Participants

- Two main types: 'walkers' (caminantes) and 'servers' (servidores)
- Participants are never deleted - marked as 'deleted' instead
- Can be imported/exported via Excel/CSV
- Family/friend relationships are tracked with color coding
- Age-based room assignments (younger participants get bunk beds, older get regular beds on lower floors)

### Retreats

- Each retreat has a house with specific room/bed configurations
- Room assignments consider age, snoring habits, and bed types (normal, bunk, mattress)
- Table assignments with leaders (lider, colider1, colider2) and walkers
- Maximum limits for walkers and servers based on house capacity

### Houses

- Track rooms with beds (identified by room number + bed number)
- Bed types: normal, bunk, mattress
- Default usage: walker or server
- Google Maps integration and notes about facilities

### Data Management

- Import/export functionality for participants, inventory, payments
- Excel/CSV support with column selection
- Real-time validation and error handling
- Soft delete pattern for data integrity

## Current Implementation Status

The codebase has extensive Spanish documentation and requirements. Key features being implemented:

- Participant filtering and column selection
- Family/friend color coding system
- Drag-and-drop table assignments
- Room assignment algorithms
- Inventory management with walker-to-item ratios
- Payment tracking and scholarship management
- WhatsApp message templates

## Database Schema

the file for database is in apps/api/database.sqlite

The system uses TypeORM with SQLite. Key entities include:

- Participant (with family_friend_color, snoring info)
- Retreat (with house, capacity limits, notes)
- House (with rooms and beds)
- RoomBed (retreat-specific bed assignments)
- Table (with leader assignments)
- Various assignment and tracking entities

## Community Search (Landing Page)

### Cómo funciona

La sección "Encuentra tu Comunidad" en `LandingView.vue` permite a los visitantes públicos filtrar y ordenar comunidades Emaús activas sin autenticación.

**Fuente de datos:**
- `GET /api/communities/public` — devuelve `{ id, name, city, state, latitude, longitude }` de comunidades con `status: 'active'`.
- `GET /api/communities/public/meetings` — devuelve próximas 20 reuniones (30 días) con la comunidad embebida.

### Computed properties clave

```ts
// Filtra por texto (name/city/state) y ordena por distancia cuando hay ubicación
const filteredCommunities = computed(() => { ... });

// Filtra meetings a las comunidades que salen en filteredCommunities,
// y los reordena para que sigan el mismo orden por cercanía/búsqueda
const filteredMeetings = computed(() => { ... });
```

`filteredCommunities` se basa en dos piezas de estado:
- `searchQuery: ref('')` — texto del input de búsqueda (v-model reactivo)
- `userLocation: ref<{lat,lng}|null>(null)` — coordenadas del navegador

`filteredMeetings` reusa el orden de `filteredCommunities` mediante un `Map<communityId, index>`: las reuniones de las comunidades más cercanas (o más relevantes en búsqueda) aparecen primero en la tabla "Horarios de Reuniones".

### Geolocalización

Al montar el componente, `detectLocationSilently()` llama a `navigator.geolocation.getCurrentPosition()` de forma silenciosa — si el usuario ya concedió el permiso antes, las comunidades y reuniones se ordenan por cercanía automáticamente. Si se deniega, no se muestra ningún error.

El botón "Usar Mi Ubicación" llama a `useMyLocation()`, que hace lo mismo pero sí muestra error con toast si falla.

La distancia se calcula con **Haversine** en la función `haversineDistance(lat1,lon1,lat2,lon2): number` (resultado en km).

### Comportamiento del mapa

- Pines: `filteredCommunities.slice(0, 4)` — máximo 4 pines en posiciones fijas decorativas.
- Tarjeta "Círculo Más Cercano": muestra `filteredCommunities[0]` con ciudad, estado, y distancia en km/m.
- Sin resultados: muestra estado vacío con botón "Limpiar filtros" → `clearFilters()`.

### Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `apps/web/src/views/LandingView.vue` | Lógica: `filteredCommunities`, `filteredMeetings`, `haversineDistance`, `useMyLocation`, `detectLocationSilently`, `clearFilters` |
| `apps/web/src/views/__tests__/LandingView.test.ts` | Bloque `describe('Community Search')` — 30+ tests |
| `apps/api/src/services/communityService.ts` | `getPublicCommunities()`, `getPublicMeetings()` |
| `apps/api/src/routes/communityRoutes.ts` | `GET /communities/public`, `GET /communities/public/meetings` |

### Tests

```bash
pnpm --filter web test src/views/__tests__/LandingView.test.ts
```

Cubre: carga de datos, filtrado por nombre/ciudad/estado (case-insensitive), estado vacío, botón Limpiar, contador de resultados, geolocalización automática silenciosa, ordenamiento por distancia, distancia en tarjeta, ordenamiento de la tabla de reuniones por cercanía.

## Authentication and Authorization

### User Roles and Permissions

The system implements role-based access control (RBAC) with the following roles:

- **Superadmin**: Complete system access, including database management and user administration
- **Admin**: Full access to retreat management features, user management within their scope
- **Coordinator**: Retreat-specific access, can manage participants and assignments for assigned retreats
- **Viewer**: Read-only access to retreat information and participant lists

### Authentication System

- JWT-based authentication with refresh tokens
- Session management with configurable expiration
- Password encryption using bcrypt
- Account lockout after failed login attempts
- Email verification for new user registration

### Security Measures

#### Cross-Site Request Forgery (CSRF) Protection

- CSRF tokens for all state-changing operations
- SameSite cookie settings
- Origin header validation
- Token refresh mechanism with secure handling

#### Data Security

- Input validation using Zod schemas
- SQL injection prevention through TypeORM parameterized queries
- XSS protection through proper output encoding
- Secure file upload handling with validation
- Rate limiting on authentication endpoints

#### API Security

- HTTPS enforcement in production
- CORS configuration with allowed origins
- API key management for third-party integrations
- Request logging for security auditing
- Error handling that doesn't expose sensitive information

### Database Migration System

#### Migration Management

- TypeORM migration system for database schema changes
- Automated migration generation with `pnpm --filter api migration:generate`
- Manual migration files in `apps/api/src/migrations/sqlite/`
- Migration rollback capabilities with `pnpm --filter api migration:revert`
- Database seeding with `SEED_FORCE=true pnpm --filter api migration:run`

#### Migration Best Practices

- All schema changes must go through migrations
- Migrations should be reversible
- Test migrations in development before production deployment
- Include data transformation logic when changing existing schemas
- Document breaking changes in migration files

### RBAC Implementation

#### Permission Structure

- Role-based permissions defined in database
- Fine-grained permissions for specific actions
- Hierarchical role inheritance
- Dynamic permission checking in middleware

#### Authorization Middleware

- Route-level protection using decorators
- Resource-based authorization checks
- Permission caching for performance
- Audit logging for sensitive operations

### Important Implementation Notes

- All UI text should be in Spanish
- Use existing WalkerView.vue as template for new list views
- Participants marked as 'waiting' when capacity exceeded
- Room assignments consider snoring compatibility
- Table assignments prevent family/friend conflicts
- Superadmin capabilities for database management
- Always validate user permissions before data access
- Implement proper error handling for unauthorized access
- Use secure HTTP headers in all API responses

### API Integration

**Always use the centralized API service** - never direct fetch calls.

```typescript
// ✅ CORRECT
import { getSmtpConfig } from '@/services/api';
const config = await getSmtpConfig();

// ❌ INCORRECT
const response = await fetch('/api/endpoint', {
	headers: await setupCsrfHeaders(),
	credentials: 'include',
});
```

**Benefits**: Built-in CSRF protection, error handling, authentication, and consistent configuration. Add new functions to `/apps/web/src/services/api.ts`.

## Troubleshooting

Cuando un usuario reporta bugs ("se congela la UI", "página en blanco en iPhone", "fechas saltan un día", "migration borró data", "checkbox no marca", "test falla con ReferenceError", etc.) → cargar el skill **`troubleshooting`** (`.ruler/skills/troubleshooting/SKILL.md`). Es el índice maestro de bugs recurrentes con síntoma → causa → fix, incluyendo:

- reka-ui Dialog/DropdownMenu congela la UI (`@click` sin `deferOpen`, `confirmX` cerrando dialog en `finally`, `restoreBodyOverflow` sin `pointerEvents`)
- Safari iOS blank page (stack overflow por static imports, vue-i18n `@`, chunks gigantes)
- Timezone CDMX salta un día (ISO UTC tratada como hora local)
- Checkbox reka-ui ignora `:checked` (usar `:model-value`)
- `Set`/`Map` en `ref` no reactivos
- SQLite recreate-table borra data en tablas hijas (FK cascade dentro de transacción TypeORM)
- Tap-to-assign móvil/DevTools (necesita `@touchend` + `@click`)
- Tests Jest mock factory con ESM (`ReferenceError: Cannot access before initialization`)
- Tests 403 con ESM + path aliases
- Tests Vue con `defineModel` (sobrescribir mocks globales de `@repo/ui`)

Cada bug está documentado con código antes/después, comandos `grep` para auditar el repo, y referencia al skill específico si existe (`safari-ios-compatibility`, `sqlite-migrations`, `timezone-handling`).

## Testing System

### Available Tests

- **Backend (Jest)**: Field mapping, services, controllers, integration con TypeORM real (SQLite). 2100+ tests.
- **Frontend (Vitest)**: Componentes Vue, stores Pinia, utils, views. 1500+ tests con `happy-dom` y mocks globales en `apps/web/src/test/setup.ts`.
- **Test Framework**: Jest para backend (`apps/api`), Vitest para frontend (`apps/web`).

### Test Status

✅ **Backend**: ~2100 tests pasando (`pnpm --filter api test`).
✅ **Frontend**: ~1500 tests pasando (`pnpm --filter web test`).
⚠️ **E2E**: Playwright configurado pero los tests reales son escasos.

### Key Test Files

- `apps/api/jest.config.json` — configuración Jest del backend
- `apps/api/src/tests/jest.setup.ts` — setup global del backend
- `apps/api/src/tests/test-setup.ts` — `setupTestDatabase`/`teardownTestDatabase` con `testDataSource` para integration tests
- `apps/web/vitest.config.ts` — configuración Vitest del frontend
- `apps/web/src/test/setup.ts` — mocks globales de `@repo/ui`, `lucide-vue-next`, `vue-router`, `vue-i18n`, `axios`

### Cómo correr

```bash
# Todos los tests
pnpm test

# Solo backend
pnpm --filter api test

# Solo frontend
pnpm --filter web test

# Un archivo específico (frontend)
pnpm --filter web test src/components/__tests__/AngelitoAvailabilityEditor.test.ts
```

### Tests para componentes con `defineModel`

Los mocks globales de `@repo/ui` en `apps/web/src/test/setup.ts` exponen Input/Button/Tooltip básicos pero **no incluyen todos los atributos HTML** (ej. `min`/`max` en `Input`). Si tu componente los usa, sobrescribe el mock localmente en el test:

```ts
vi.mock('@repo/ui', () => ({
  Input: {
    name: 'Input',
    props: ['modelValue', 'type', 'min', 'max'],
    emits: ['update:modelValue'],
    template:
      '<input :type="type" :value="modelValue" :min="min" :max="max" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
  // ...resto de componentes que necesitas
}));
```

**No uses cast TypeScript (`as HTMLInputElement`) en strings de templates** — Vue compila el template y rechaza la sintaxis. Pasa el valor crudo del evento.

### Tests de servicios con singleton (backend Jest + ESM experimental)

Con `NODE_OPTIONS=--experimental-vm-modules`, los factories de `jest.mock` se hoizan antes de cualquier declaración del módulo. Las variables `const/let` del scope del módulo **no están inicializadas** cuando el factory se ejecuta → `ReferenceError: Cannot access before initialization`. El patrón correcto:

```ts
// ❌ FALLA: referencia a variable externa en factory
const mockSendEmail = jest.fn();
jest.mock('@/services/emailService', () => ({
  EmailService: jest.fn(() => ({ sendEmail: mockSendEmail })), // ← mockSendEmail no existe aún
}));

// ✅ CORRECTO: factory sin referencias externas
jest.mock('@/services/emailService', () => ({
  EmailService: jest.fn(() => ({ sendEmail: jest.fn().mockResolvedValue(true) })),
}));
// Para verificar llamadas: usa result.sent, signupId en Map, o estado observable — no accedas
// al mock internamente. jest.requireMock puede tener contextos distintos con ESM.
```

Para servicios singleton, instancia directamente en cada test para estado limpio:
```ts
const svc = new (MyService as any)();
```

### Tests de autorización 403 en integration tests

Con ESM + path aliases (`@/`), `jest.requireMock('@/middleware/authorization')` puede no retornar el mismo objeto que el import del módulo testado. Por eso los tests de integration **no testean el 403** — solo testean el happy-path de la lógica de negocio. La autorización se cubre en tests de middleware independientes.

## Chrome tool
Guarda los screenshots en la carpeta /tmp/chrome


Trata de crear un solo archivo de migración.  Dime cuando requieras restaurar el backup de la base de datos.

## Manejo de fechas y zonas horarias (bug recurrente)

El servidor y los usuarios principales operan en CDMX (UTC-6). El backend guarda y devuelve fechas en **ISO UTC** (`"2026-06-05T00:00:00.000Z"`). Cuando el frontend usa esa fecha como base para `<input type="datetime-local">`, mínimos/máximos o defaults, **es muy fácil cruzar la medianoche y caer un día atrás**.

### Síntomas típicos
- El default de un picker arranca el día previo al esperado (ej. 04 jun cuando el retiro empieza el 05).
- El `min`/`max` de un input bloquea el último día del retiro o permite uno anterior.
- Filtros por rango horario descartan registros aparentemente válidos.

### Causa raíz
`new Date("2026-06-05T00:00:00.000Z")` en CDMX representa internamente **04 jun 18:00 hora local**. Llamar `.getDate()`, `.getHours()` o `setHours(N)` opera sobre esa hora local desplazada → el calendario "salta" un día.

### Patrón seguro
Cuando un valor venga del backend como ISO UTC pero represente un **día calendario** (no un instante), extrae `YYYY-MM-DD` directamente del string y reconstruye un `Date` local con esa fecha:

```ts
function calendarDateOnly(value: string | Date | null | undefined) {
  if (!value) return null;
  const raw = value instanceof Date ? value.toISOString() : String(value);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw.slice(0, 10));
  return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
}
// uso:
const c = calendarDateOnly(retreat.startDate);
const localDefault = new Date(c.y, c.m - 1, c.d, 8, 0, 0, 0); // 08:00 LOCAL del día calendario
```

Para inputs `datetime-local`, arma el string a mano (no uses `.toISOString().slice(0,16)`):

```ts
const minLocal = `${c.y}-${pad(c.m)}-${pad(c.d)}T00:00`;
const maxLocal = `${c.y}-${pad(c.m)}-${pad(c.d)}T23:59`;
```

### Otras pautas
- **Nunca** uses `new Date(isoUtc).setHours(...)` para construir un default de UI sin antes normalizar al día calendario local.
- En filtros de rango contra slots/eventos, asegúrate de que ambos lados estén en el mismo huso (todo UTC o todo local) — no mezcles.
- En tests, fija el TZ con `process.env.TZ = 'America/Mexico_City'` si la lógica depende del huso del servidor.
- Patrón existente reutilizable: `atLocalHour()` y `toLocalInput()` en `apps/web/src/views/SantisimoAdminView.vue`, y `calendarDateOnly()` en `apps/web/src/components/AngelitoAvailabilityEditor.vue`.

### Casos donde ya tropezamos
- 2026-05-08 — Editor de disponibilidad de angelitos: el default del bloque arrancaba el día anterior al inicio del retiro porque `defaultStart()` hacía `new Date(retreat.startDate).setHours(8)` sobre un Date que era medianoche UTC del primer día.