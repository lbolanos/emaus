# CRM de mensajería (segmentos, secuencias, pipeline)

Capacidades tipo CRM construidas sobre el sistema de plantillas existente. Branch: `worktree-crm-messaging`.

## Decisión de canal de WhatsApp (clave)

Requisito: **cada usuario envía desde SU propia cuenta de WhatsApp** (no un número central).

- ❌ **API oficial de Meta**: descartada — es centralizada (1 número de negocio); un número personal no puede estar en la app y en la API a la vez.
- ⚠️ **Baileys multi-sesión**: único camino 100% desatendido multi-cuenta, pero frágil y va contra los ToS (riesgo de ban del número personal). No se usó.
- ✅ **Deep-link asistido** (`api.whatsapp.com/send`): elegido. Cada quien envía desde su WhatsApp con 1 clic. Cero riesgo/costo. **Consecuencia transversal**: por WhatsApp nada es desatendido ni recibe respuestas → lo "automático" se materializa como **bandeja de pendientes** que el coordinador despacha. Email sí es 100% desatendido (SMTP).

## Fases

### Fase 1 — Cola WhatsApp asistida + segmentos guardados
- `SavedSegment` (filtros con nombre, scope retiro/comunidad). Tipo compartido `SegmentFilters` en `@repo/types`.
- API: `/saved-segments` (CRUD + `/preview`).
- UI: `WhatsAppSendQueue.vue` (cola de envío 1-clic con registro en `participant_communications`) + guardar/aplicar segmentos desde `ParticipantList.vue`.

### Fase 2 — Motor de secuencias (drip)
- Entidades `MessageSequence` / `SequenceStep` / `ScheduledMessage`.
- `messageSequenceService` (cron horario, patrón de `santisimoReminderService`): enrolamiento idempotente por audiencia (fuente `retreat_participants`), fecha TZ-aware (`makeDateInTimezone`), procesamiento de vencidos — **email envía+registra; whatsapp encola**.
- Triggers: `participant_created`, `days_before_retreat`, `days_after_retreat`, `birthday`.
- API: `/message-sequences` (CRUD + `/queue` + `/run` + `/scheduled/:id/dispatch`).
- UI: `MessageSequencesView.vue` (editor de pasos + bandeja de pendientes).

### Fase 3 — Segmentos dinámicos + tablero
- `savedSegmentService.evaluateFilters`: evalúa filtros en vivo (type/attendance vía `retreat_participants`; `paymentStatus` computado en memoria; tags; búsqueda). Usado como **audiencia dinámica** de secuencias (`MessageSequence.segmentId`).
- `CommunicationDashboardView.vue`: totales por canal, cobertura, actividad 30 días, top plantillas, pendientes.

### Fase 4 — Pipeline de seguimiento + tareas
- `ParticipantFollowUp` (estado `pending/contacted/confirmed/no_answer/declined` + nota + auditoría, único por participante-retiro; generaliza `CommunityMember.state`).
- `CrmTask` (recordatorios del coordinador con vencimiento).
- API: `/crm` (`/follow-ups` upsert, `/tasks` CRUD). UI: `FollowUpView.vue`.
- **Fuera de alcance**: bandeja 2-way de email (requiere ingesta IMAP/inbound) y 2-way de WhatsApp (inviable con deep-link). El seguimiento se registra manualmente.

## Notas de implementación
- `participant.type` es **virtual**; la fuente per-retiro de type/isCancelled es `retreat_participants` (las queries de audiencia lo usan).
- Resolución de variables en backend vía `@repo/utils` `replaceAllVariables`.
- Las 3 migraciones declaran `transaction = false` (DROP TABLE en `down()` → guard `sqliteSafePattern`); inerte en runtime.
- Navegación: rutas bajo `/app/settings/*` + `/app/follow-up`, items en `Sidebar.vue`.

## Tests
- Backend: `savedSegment.test.ts`, `messageSequence.test.ts`, `crmService.test.ts` (14 tests).
- Frontend: `WhatsAppSendQueue.test.ts` (3 tests). Suite web completa verde.
