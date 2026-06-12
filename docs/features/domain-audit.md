# Auditoría de dominio

Registra **quién** crea / edita / borra los datos centrales del retiro (participantes, mesas, camas/casas, pagos, retiros), con doble destino: tabla en base de datos **y** archivo NDJSON para análisis posterior.

Complementa a los logs ya existentes (`audit_logs` para RBAC, `community_audit_log` para comunidades). No los reemplaza.

---

## Qué se audita

| Área | Acciones (`action`) | Dónde se instrumenta |
|---|---|---|
| Participantes | `participant.create`, `participant.update`, `participant.delete` (soft), `participant.import` (resumen), `participant.confirm`, `participant.checkin`, `participant.anonymize` | `services/participantService.ts` |
| Mesas | `table.create/update/delete`, `table.assign_leader`, `table.unassign_leader`, `table.assign_walker`, `table.unassign_walker`, `table.rebalance` (resumen), `table.clear_all` (resumen) | `services/tableMesaService.ts` |
| Camas/Casas | `bed.assign`, `bed.unassign`, `bed.toggle_active`, `bed.clear_all` (resumen), `house.create/update/delete` | `controllers/retreatBedController.ts`, `services/houseService.ts` |
| Pagos | `payment.create`, `payment.update`, `payment.delete` | `controllers/paymentController.ts` |
| Deudas | `participant_debt.create`, `participant_debt.update`, `participant_debt.delete` | `controllers/participantDebtController.ts` |
| Retiros | `retreat.create`, `retreat.update`, `retreat.memory.photo_upload`, `retreat.memory.update` | `services/retreatService.ts` |

> El actor (`actorUserId`/`ipAddress`) se resuelve del request actual; cuando no hay
> request (seed, cron, jobs) queda `null` sin romper la operación.

> Las operaciones masivas (import, rebalance, clear) registran **un solo evento-resumen** con conteos, no uno por fila.

---

## Arquitectura

### Captura del actor (sin tocar firmas)
Los servicios de dominio no reciben el `userId`. Para saber **quién** actúa se usa `AsyncLocalStorage`:

- `middleware/requestContext.ts` puebla `{ userId, ip, userAgent }` por request (después de `passport.session()`).
- `utils/auditContext.ts` expone `run/get/getUserId/...`.
- `services/domainAuditService.ts` lee ese contexto cuando el evento no trae actor explícito.

Fuera de un request (seed, jobs, tests) el actor queda `null` sin romper nada.

### Sinks
`domainAuditService.log()` escribe en paralelo a:
1. **DB** — tabla `domain_audit_log` (entidad `entities/domainAuditLog.entity.ts`, migration `20260606000000_CreateDomainAuditLog.ts`).
2. **Archivo** — NDJSON rotado por día vía `utils/auditLogger.ts` (winston + winston-daily-rotate-file).

Es **fire-and-forget**: un fallo de auditoría nunca rompe la operación de negocio (los call sites usan `void domainAuditService.log(...)`).

### Privacidad
`utils/auditDiff.ts` registra **solo los campos que cambiaron** y excluye secretos (passwords, tokens). La anonimización GDPR (`participant.anonymize`) registra solo el hecho, nunca los valores borrados.

---

## Configuración (env)

| Variable | Default | Descripción |
|---|---|---|
| `AUDIT_DB_ENABLED` | `true` | Sink a base de datos |
| `AUDIT_FILE_ENABLED` | `true` | Sink a archivo NDJSON |
| `AUDIT_LOG_DIR` | dev `apps/api/logs`, prod `/var/log/emaus` | Directorio de los NDJSON |
| `AUDIT_LOG_RETENTION_DAYS` | `90d` | Retención (días o nº de archivos) |
| `AUDIT_LOG_MAX_SIZE` | `20m` | Tamaño por archivo antes de rotar |

En tests el logger de archivo está en `silent` (no abre file handles).

---

## Tabla `domain_audit_log`

`id`, `actorUserId`, `action`, `resourceType` (`participant|participant_debt|table|bed|house|payment|retreat`), `resourceId`, `retreatId`, `oldValues`, `newValues`, `metadata` (JSON en TEXT), `ipAddress`, `userAgent`, `createdAt`. Append-only, sin FK CASCADE (IDs históricos para forense). Índices por `(resourceType,resourceId)`, `retreatId`, `(retreatId,createdAt)` (query principal del trail: filtro por retiro + orden por fecha; migración `20260610130000_AddDomainAuditRetreatCreatedAtIndex.ts`), `actorUserId`, `(action,createdAt)`.

### Analizar el archivo
```bash
# Cambios de un retiro hoy
jq -c 'select(.retreatId=="<id>")' /var/log/emaus/audit-$(date +%F).ndjson
# Acciones de un usuario
jq -c 'select(.actorUserId=="<userId>")' /var/log/emaus/audit-*.ndjson
```

---

## Consulta desde la app

- **Endpoint**: `GET /api/domain-audit/retreat/:retreatId` (`controllers/domainAuditController.ts` +
  `routes/domainAuditRoutes.ts`). Filtros por query: `action`, `resourceType`, `resourceId`,
  `actorUserId`, `startDate`, `endDate`, `limit` (máx 200), `offset`. Enriquece el
  actor con `displayName`/`email` y parsea los JSON.
- **Autorización de lectura** (el trail expone diffs de pagos, deudas y datos de
  participantes): `audit:read` (superadmin) **OR** creador del retiro **OR** rol
  **`admin` del retiro** (`RETREAT_ROLES.admin` = el rol coordinador). Un miembro
  regular del retiro (`hasRetreatAccess`) **no** puede leer auditoría.
  `auditController.ts` (auditoría RBAC legacy) conserva su gating amplio — follow-up.
- **Filtro de fechas con timezone del retiro**: `startDate`/`endDate` viajan como
  `YYYY-MM-DD` planos y el backend construye las fronteras del día en la timezone
  efectiva del retiro (`retreat.timezone ?? house.timezone ?? America/Mexico_City`)
  con `makeDateInTimezone`; el fin de día es exclusivo (inicio del día siguiente).
  El frontend no calcula fronteras ni manda `T23:59:59`.
- **Frontend**: vista `apps/web/src/views/DomainAuditView.vue` en `/app/audit` (ítem
  "Auditoría" del sidebar). Presets de rango rápido (1 semana … 6 meses, Todo; default
  1 mes, con `aria-pressed`), filtros por área/acción/fechas, diff old→new y paginación.
  Carga robusta: guard de secuencia (respuestas fuera de orden no pintan) +
  coalescencia por microtask (watchers en cascada → una sola request).
  Cliente: `getDomainAuditLogs` en `apps/web/src/services/api.ts`.

### Tipos compartidos e i18n (anti-drift)

- Las constantes `DomainAuditAction`, `DomainAuditActionType`, `DomainResourceType` y
  `DOMAIN_RESOURCE_TYPES` viven en **`packages/types/src/audit.ts`** (`@repo/types`).
  `domainAuditService` las re-exporta (los call sites del api no cambian) y los helpers
  `logCreate/logUpdate/logDelete` exigen `resourceType: DomainResourceType` (compile-time).
- Las etiquetas de UI viven en los locales bajo el namespace **`audit`**
  (`audit.actions.<action>` anidado por puntos, `audit.resources.<rt>`, `audit.ranges.*`,
  `audit.ui.*`) en `apps/web/src/locales/{es,en}.json`. El view deriva las listas de
  `@repo/types` y traduce con `t()` (fallback a la key cruda si falta).
- **Keystone**: `apps/web/src/locales/__tests__/auditLocaleCoverage.test.ts` exige que
  cada acción/recurso declarado en `@repo/types` tenga etiqueta no vacía en es y en.
  Agregar una acción sin su traducción rompe el test.

### Autorización de escritura en deudas y pagos (`ensureRetreatAccess`)

En deudas y pagos el `retreatId` viene del body o se deriva del registro cargado por
`:id`, así que `requireRetreatAccess` (middleware de ruta) no aplica. El guard
**`ensureRetreatAccess(req, res, retreatId)`** (`middleware/authorization.ts`) se usa
dentro del controller: responde 401/403 él mismo y devuelve `false`; el patrón es

```ts
if (!(await ensureRetreatAccess(req, res, effectiveRetreatId))) return;
```

Aplicado en create/update/delete de `participantDebtController` y `paymentController`
(cierra el IDOR cross-retiro con solo `payment:*`). Superadmin pasa por el bypass
interno de `hasRetreatAccess`. Reusar este guard para cualquier endpoint nuevo cuyo
retiro efectivo no venga en la ruta.

---

## Tests

| Archivo | Cubre |
|---|---|
| `apps/api/src/tests/utils/auditContext.test.ts` | AsyncLocalStorage: propagación, aislamiento, fuera de request |
| `apps/api/src/tests/utils/auditDiff.test.ts` | diff de campos cambiados, allowlist, denylist de secretos |
| `apps/api/src/tests/services/domainAuditService.test.ts` | persistencia, fire-and-forget, actor del ALS vs explícito, helpers |
| `apps/api/src/tests/services/domainAudit.integration.test.ts` | instrumentación de Mesas → ALS → DB (create/update/delete) |
| `apps/api/src/tests/services/domainAudit.participant.integration.test.ts` | instrumentación de Participantes (checkin, delete) |
| `apps/api/src/tests/controllers/domainAuditController.test.ts` | endpoint: 401/403 (incl. miembro no-admin → 403), filtros, fechas en TZ del retiro, enriquecimiento de actor, aislamiento por retiro |
| `apps/api/src/tests/controllers/participantDebt.audit.integration.test.ts` | instrumentación de deudas + 403 cross-retiro (create/update/delete) |
| `apps/api/src/tests/controllers/payment.authz.integration.test.ts` | 403 cross-retiro en pagos (create/update/delete) |
| `apps/api/src/tests/middleware/ensureRetreatAccess.test.ts` | guard de controller: 401 sin user, 403 sin acceso, true sin tocar la response |
| `apps/web/src/locales/__tests__/auditLocaleCoverage.test.ts` | keystone: toda acción/recurso de `@repo/types` tiene etiqueta es/en |
| `apps/api/src/tests/migrations/createDomainAuditLog.test.ts` | migration up/down + índices, idempotencia |
| `apps/web/src/views/__tests__/DomainAuditView.test.ts` | vista: carga, render de acciones/actor/diff, filtros |

```bash
# Backend
pnpm --filter api exec jest src/tests/services/domainAuditService.test.ts
# Frontend
pnpm --filter web exec vitest run src/views/__tests__/DomainAuditView.test.ts
```

> Nota de testing: la auditoría es fire-and-forget, así que en los tests de integración
> se espera a que la fila aparezca (poll corto) en vez de asumir que ya está al retornar
> la operación. Los servicios con repos a nivel de módulo (p.ej. `participantService`) se
> importan dinámicamente **después** de `setupTestDatabase()`.

---

## Lecciones aprendidas

1. **Toda dependencia nueva de Node en `apps/api` debe externalizarse en
   `apps/api/vite.config.ts`** (`rollupOptions.external`). El api se empaqueta como bundle
   SSR; si no se externaliza, Rollup intenta bundlear sus imports nativos de Node y
   `pnpm build` falla con *"Rollup failed to resolve import"*. Nos pasó con `winston`/
   `winston-daily-rotate-file`. **Ni los tests, ni el lint, ni `vue-tsc`/`tsc` detectan
   esto** — solo `pnpm build`. Regla: tras `pnpm --filter api add <dep>`, agregarla al
   array `external` y correr `pnpm build` antes de cerrar.

2. **Capturar "quién" sin tocar firmas: `AsyncLocalStorage`.** Los servicios de dominio no
   reciben `userId`. En vez de propagarlo por decenas de firmas (y romper ~2100 tests), un
   middleware puebla un store por-request y el audit service lo lee. Patrón reusable para
   cualquier cross-cutting concern (actor, request-id, tenant).

3. **Fire-and-forget = los tests deben esperar la fila.** Como los call sites usan
   `void domainAuditService.log(...)`, el INSERT no está garantizado al retornar la
   operación. En tests de integración: poll corto hasta que aparezca la fila; nunca asumir
   timing. En producción es la propiedad deseada (un fallo de auditoría no rompe el negocio).

4. **Repos a nivel de módulo + test data source.** `participantService.ts` hace
   `const repo = AppDataSource.getRepository(...)` al cargar el módulo. Si se importa
   estáticamente en un test, captura el data source **antes** del monkey-patch de
   `setupTestDatabase()` → `Class constructor X cannot be invoked without 'new'`. Fix:
   importar el servicio dinámicamente dentro de `beforeAll`, después del setup.

5. **`text` + `JSON.stringify`, no `json`, para SQLite.** `oldValues`/`newValues`/`metadata`
   se guardan como `text` (igual que `community_audit_log`); el tipo `json` de TypeORM da
   fricción en SQLite.

6. **PII en auditoría:** diff solo de campos cambiados + denylist de secretos; el borrado
   GDPR (`participant.anonymize`) registra el hecho pero **nunca** los valores eliminados.

> Bug colateral encontrado al correr la regresión (no de auditoría, ya corregido en el
> mismo branch): `recurrenceUtils.calculateNextOccurrence` con `weekly` sin `dayOfWeek`
> caía a domingo y rompía los topes de `recurrenceEndDate` de forma dependiente de la
> fecha. Fix: sin día explícito, "weekly" = +7 días manteniendo el día del inicio.
