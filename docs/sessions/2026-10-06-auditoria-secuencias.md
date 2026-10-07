# Auditoría de cambios en secuencias de mensajes

> **Estado**: plan, sin implementar. Creado el 2026-10-06 tras el incidente de palancas de
> Buen Despacho. Retomar desde aquí en otra sesión.

## Disparador — incidente 2026-10-06 (retiro Buen Despacho, `e9b3c568-050a-4d66-a99d-305f287a59df`)

Tras un alta batch de 5 caminantes, los mensajes de palancas no aparecieron en la bandeja y se
hicieron cambios de corrección a ciegas. La reconstrucción forense solo fue posible leyendo
`updatedAt` de las filas — **ningún cambio tiene autor registrado**:

| Hora (CDMX) | Cambio | Autor |
| --- | --- | --- |
| 1-oct 20:22 | Se crea "Palancas (copia)" `4738ac91` (activa) | ¿? |
| 6-oct 10:32 | Alta de 5 caminantes; el guard M2 suprime pasos vencidos | sistema |
| 6-oct 10:32 / 11:58 | "Ejecutar ahora" sobre PALANCA_DEFINITION y PALANCA_REQUEST | ¿? |
| 6-oct 19:38 | Se crea "Bienvenida Caminantes" `b1073428` (activa) | ¿? |
| 6-oct 19:45 | Se **desactiva** "Palancas (copia)" → bandeja los oculta + pendientes congelados | ¿? |
| 6-oct 21:02 | Se crea "Palancas (copia)(copia)" `4882ed9d` (inactiva, vacía) | ¿? |

El síntoma "no veo los mensajes en la bandeja" tuvo dos capas: (1) el guard anti-retroactivo M2
suprimió los pasos vencidos al enrolar a los nuevos (por diseño, ver
`isRetroactiveAtEnroll` en `messageSequenceService.ts`), y (2) la desactivación de la secuencia
hizo que el filtro `'active'` de la bandeja (`MessageSequencesView.vue`, `queueAssignFilter`)
ocultara los `queued` existentes.

## Gap verificado (evidencia, no suposición)

Consultado sobre copia local de prod (db-pull del 2026-10-06 21:15):

- `domain_audit_log` tiene 1227 filas pero **solo** `participant` (991), `table` (116),
  `bed` (73), `retreat` (39), `payment` (6), `house` (2). Cero filas de secuencias.
- `audit_logs` (20 filas) solo registra `role_assigned` / `role_invited`.
- `user_activities` está **vacía** (0 filas) — mecanismo muerto, no usarlo.
- `grep -n audit apps/api/src/controllers/messageSequenceController.ts` → sin resultados;
  el servicio solo menciona "auditoría" en comentarios.

Conclusión: el mecanismo existe (`domainAuditService`), falta invocarlo desde el módulo.

## Diseño

Reutilizar `domainAuditService` (`apps/api/src/services/domainAuditService.ts`, helpers
`logCreate` / `logUpdate` / `logDelete` / `log`, con `actorUserId`, `retreatId`, `oldValues`,
`newValues`, `metadata`, `ipAddress`, `userAgent`). Sin tabla nueva ni migración.

ResourceTypes nuevos: `message_sequence`, `sequence_step`, `scheduled_message`.

### Acciones a auditar

| Método (servicio/controller) | Evento | Qué capturar |
| --- | --- | --- |
| `createSequence` | `create` message_sequence | name, trigger, audience, isActive; metadata `{ clonedFrom }` si es copia |
| `updateSequence` | `update` message_sequence | old/new de `isActive`, `maxOverdueDays`, name; **los cambios de pasos** (offsets borrados/agregados/archivados) en metadata |
| `deleteSequence` | `delete` message_sequence | snapshot mínimo (sus `scheduled_messages` se borran en cascade) |
| `runNow` (por retiro) | `custom` message_sequence, action `run_now` | metadata `{ sendNowStepIds }` — es la confirmación M5 de enviar vencidos |
| `rescheduleStep` | `custom` scheduled_message, action `reschedule` | old/new `scheduledFor` — el "Ejecutar ahora" de un paso |
| `markDispatched`, `markSkipped`, `retry`, `discard` | `custom` scheduled_message | action correspondiente; `markSkipped` exige motivo (ya existe en la UI) |
| `assign` | `custom` scheduled_message | old/new `assignedTo` |
| `markOpened` | **no auditar** (ruido: es telemetría de deep-link) | — |
| Cron `processDue`/`enrollAll` | **no auditar** por fila (volumen) | alternativa a decidir: un evento agregado por corrida si se quiere traza del motor |

### Decisiones ya tomadas

- Actor: pasar `req.user.id` desde el controller (hoy los métodos del servicio no lo reciben).
  Para eventos del motor, `actorUserId = null` + metadata `{ system: true }`.
- `scheduled_message` se audita solo en transiciones **manuales** (despacho/skip/retry/discard/
  assign/reschedule), no en el CRUD interno del motor.

## ⚠️ Riesgo conocido — no repetir el patrón del import

`participantService.ts` llama `void domainAuditService.logUpdate(...)` **sin await** dentro del
camino de import y causó `cannot start a transaction within a transaction` (skill
`troubleshooting` §25.3). En secuencias: **nunca disparar la auditoría sin await dentro de una
transacción abierta**; hacer `await` después de cerrarla, o encolarla fuera. Con el driver
síncrono better-sqlite3 la ventana es de microtasks, pero la regla se mantiene.

## Puntos abiertos (decide el usuario)

1. ¿Evento agregado por corrida de cron (`enrollAll`/`processDue`: created/processed counts)?
   Recomendación: sí, uno por corrida — barato y cierra la pregunta "¿fue el cron o una persona?".
2. ¿Mostrar los resourceTypes nuevos en el visor de auditoría existente (ver `domainAuditRoutes`
   y su vista en el web) o solo dejarlo consultable por SQL? Recomendación: visor, con labels
   i18n en `es.json` **y** `en.json` (regla del frontend: key ausente pinta la key cruda).

## Pasos de implementación

1. Leer `domainAuditService.ts` completo (firmas exactas de los helpers) y su test existente.
2. Instrumentar `apps/api/src/services/messageSequenceService.ts` (o el controller, según dónde
   estén los datos del request): lista de métodos en la tabla de arriba.
3. Pasar `userId` desde `messageSequenceController.ts` (req.user) a los métodos del servicio que
   lo necesiten — revisar cómo lo hacen `participantService` / `retreatService`.
4. Labels + filtros del visor de auditoría en el web (i18n es+en).
5. Tests nuevos en `apps/api/src/tests/services/` siguiendo el patrón de las suites existentes
   de `messageSequence` (singleton: instanciar directo; mocks ESM — skill `troubleshooting` #8).
6. Verificar en dev: copia de la base en archivo aparte (`DB_DATABASE=database.e2e.sqlite`) y
   `SMTP_HOST= SMTP_USER= SMTP_PASS=` vacíos (skill `db-production-resilience` §1).
7. Regla del bundle: si se toca `apps/api`, `grep __dirname dist/index.js` tras
   `pnpm --filter api build` antes de dar por terminado.
8. Deploy normal (sin migración de schema) + verificación en prod: hacer un cambio de prueba
   (activar/desactivar una secuencia) y comprobar la fila en `domain_audit_log`.

## Reproducir el diagnóstico forense de hoy

```bash
# Copia de la base (nunca el archivo vivo): db-pull + cp de los 3 archivos a /tmp
sqlite3 -header -column /tmp/emaus-prod-analysis/database.sqlite "
SELECT substr(id,1,8) id, name, isActive, createdAt, updatedAt
FROM message_sequences WHERE retreatId='<retreatId>' ORDER BY updatedAt;"
# Mensajes re-agendados a mano (scheduledFor == createdAt con milisegundos):
SELECT substr(sequenceId,1,8) seq, status, scheduledFor, createdAt
FROM scheduled_messages WHERE retreatId='<retreatId>' AND scheduledFor=createdAt;"
```
