# Eliminación de retiros

Permite eliminar un retiro completo (borrado físico definitivo). Nació de un caso real: un
coordinador creó **dos retiros por error** y necesitaba borrar el duplicado, algo que el sistema
no permitía de ninguna forma (no había botón, ni endpoint, ni soft-delete).

> ⚠️ **El borrado es permanente e irreversible.** Antes de borrar en producción, disparar un backup
> manual: `ssh … "bash /var/www/emaus/backup-db.sh"`.

## Quién puede borrar (matriz de autorización)

La ruta exige el permiso `retreat:delete` (lo tienen **admin** y **superadmin**). El servicio aplica
además esta matriz:

| Rol | Qué puede borrar |
| --- | --- |
| **Superadmin** | **Cualquier** retiro, con o sin participantes, sin importar quién lo creó |
| **Admin** | Solo retiros **que él mismo creó** (`retreat.createdBy === user.id`) **y sin participantes activos** |
| Coordinator / Viewer | Nada (no tienen `retreat:delete`) |

"Participante activo" = fila en `retreat_participants` con `isCancelled = false` (el ground truth del
soft-delete de participantes). Un admin que intente borrar un retiro con inscritos recibe **409**; si
intenta borrar un retiro ajeno recibe **403**.

## Dónde vive en la UI

- **Mis retiros** (`/app/my-retreats`, `views/social/MyRetreatsView.vue`): nueva sección **"Retiros
  que administras"** (lista real `retreatStore.retreats`) con **crear / editar / eliminar**. Debajo
  queda la galería de recuerdos de siempre. El botón Eliminar solo aparece según la matriz.
- **Sidebar** (`components/layout/Sidebar.vue`): junto al selector de retiro, los botones compactos
  `+` (crear), ✏️ (editar) y 🗑️ (eliminar, gated por la matriz). Al pasar el mouse sobre el nombre del
  retiro se muestra el texto completo (tooltip), y el nombre largo se trunca con ellipsis.
- Confirmación: componente compartido **`DeleteRetreatDialog.vue`** que exige **teclear el nombre
  exacto** del retiro (`retreat.parish`) para habilitar el botón Eliminar.

## Cómo funciona el borrado (backend)

`retreatService.deleteRetreat(retreatId, actor, dataSource?)`:

1. Verifica que el retiro existe (404 si no) y aplica la matriz de autorización (403 / 409).
2. **No confía en `ON DELETE CASCADE`**: en SQLite el cascade solo aplica si el DDL real lo declara y
   `PRAGMA foreign_keys` está activo, cosa que la config no garantiza. Por eso borra **explícitamente
   y en orden** dentro de una transacción:
   - **Nietas** (sin `retreatId` directo): `sequence_steps`, `retreat_preparation_document`,
     `retreat_schedule_item_responsable`, `service_team_members`, `santisimo_signup`,
     `participant_shirt_size`, `participant_tags` — se borran por su FK al padre.
   - **Hijas** (con `retreatId`): mesas, plantillas/secuencias de mensajes, inventario, playeras,
     preparaciones, camas, minuto-a-minuto, tareas pre-retiro, santísimo, responsabilidades, tags,
     segmentos, memorias, chat, CRM, pagos y tablas de participantes, `user_retreats`, etc.
   - **Históricas** (`audit_logs`, `domain_audit_log`, `telemetry_events`, `telemetry_metrics`,
     `testimonials`): se **preserva el registro** poniendo `retreatId = NULL`.
   - **Legacy** (`permission_overrides`, `role_requests`, no mapeadas como entidad TypeORM): limpieza
     defensiva por SQL (ignora "no such table").
   - Finalmente, el propio `retreat`.
3. Invalida las cachés de permisos/datos del retiro y registra el borrado en la auditoría de dominio.

## Endpoints

- `DELETE /api/retreats/:id` → `requirePermission('retreat:delete')` → `deleteRetreat`.
  Respuestas: `204` (ok), `404` / `403` / `409` según el caso.
- `GET /api/retreats/:id/deletion-impact` → `requirePermission('retreat:read')` →
  `getRetreatDeletionImpact`. Devuelve conteos (`activeParticipants`, `totalRegistrations`,
  `payments`, `tables`, `scheduledMessages`) para advertir en el diálogo qué se perdería.

## Mejoras (2026-07-21)

- **Trim de nombres (server):** `retreatSchema.parish` usa `.trim()` (limpia espacios al borde en cada
  create/update) + migración `20260721120000_TrimRetreatParishWhitespace` que limpió los ya guardados.
- **Advertencia de impacto:** el `DeleteRetreatDialog` consulta `deletion-impact` al abrir y muestra
  cuántos participantes/pagos/mesas/mensajes se perderían (sobre todo cuando un superadmin borra un
  retiro poblado).
- **Detector de duplicados:** en "Retiros que administras", badge "Posible duplicado" cuando dos
  retiros comparten nombre (trim) + fecha de inicio.
- **E2E:** `tests/e2e/retreat-deletion.spec.ts` cubre el límite de autorización (403) y el happy-path
  (crear→borrar→verificar) como `e2e-superadmin` (sembrado por `20260721130000`, prod-guarded).

## Archivos

- Backend: `apps/api/src/services/retreatService.ts` (`deleteRetreat`, `getRetreatDeletionImpact`),
  `controllers/retreatController.ts`, `routes/retreatRoutes.ts`.
- Frontend: `stores/retreatStore.ts` (acción `deleteRetreat`), `components/DeleteRetreatDialog.vue`,
  `views/social/MyRetreatsView.vue`, `components/layout/Sidebar.vue`, `services/api.ts`.
- Tests: `apps/api/src/tests/services/retreatDelete.integration.test.ts` (cascada + matriz + impacto),
  `apps/web/src/stores/__tests__/retreatStore.test.ts` (acción del store),
  `apps/web/src/components/__tests__/DeleteRetreatDialog.test.ts` (confirmación por nombre),
  `apps/web/tests/e2e/retreat-deletion.spec.ts` (e2e autorización + happy-path).

## Notas de implementación

- El permiso `retreat:delete` **ya existía** en el schema (asignado a admin/superadmin) → no hizo
  falta migración.
- El DataSource de test omitía `ChatConversation`; se agregó a `tests/test-setup.ts` para que el
  borrado en cascada pueda resolver su repositorio. Ojo: ese DataSource de test **sí enforcea FKs**
  (pese al comentario que dice lo contrario), así que las filas de fixtures con columnas FK deben
  apuntar a filas reales.

## Lecciones aprendidas (gotchas)

Todas también indexadas en el skill `troubleshooting`:

1. **`Retreat` no tiene `createdAt`.** Para decidir "cuál de dos retiros se creó primero" (p. ej. al
   deduplicar) hay que mirar el `createdAt` de sus **hijos sembrados** (mesas, `message_sequences`,
   `retreat_preparation`…), no del retiro.
2. **Confirmación por nombre: trimear ambos lados.** El `parish` en datos reales puede traer espacios
   al borde (`"… | Mexico City "`); comparar `input.trim() === parish` (sin trimear el parish) hace
   imposible confirmar. Se compara `input.trim() === parish.trim()`. (troubleshooting #14)
3. **Ícono lucide usado sin importar → no renderiza, y el build no falla.** `Trash2` se usó en el
   template del sidebar sin importarlo: el botón salía sin ícono y `vue-tsc` no lo detectó.
   (troubleshooting #12)
4. **`title` nativo es lento (~700ms+).** Los tooltips de ayuda usan `Tooltip` de `@repo/ui`
   (reka-ui) con `delay-duration` corto, no el atributo `title`. (troubleshooting #13)
5. **No confiar en `ON DELETE CASCADE` en SQLite** (ver arriba) — el borrado es explícito y ordenado.
6. **El e2e por la UI real encontró bugs que los unit tests no** (el espacio final del parish, el
   ícono faltante): vale la pena conducir la feature real antes de darla por cerrada.
