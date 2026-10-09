/**
 * Constantes y tipos de la auditoría de dominio, compartidos entre api y web.
 * El backend (`domainAuditService`) los re-exporta; el frontend (`DomainAuditView`)
 * deriva de aquí las listas de acciones/recursos y sus keys de i18n
 * (`audit.actions.<action>`, `audit.resources.<resourceType>`).
 *
 * NOTA: las migraciones NO deben importar este paquete (regla del repo) —
 * usar literales en migraciones.
 */
export const DomainAuditAction = {
	// Participantes
	PARTICIPANT_CREATE: 'participant.create',
	PARTICIPANT_UPDATE: 'participant.update',
	PARTICIPANT_SELF_UPDATE: 'participant.self_update',
	PARTICIPANT_DELETE: 'participant.delete',
	PARTICIPANT_IMPORT: 'participant.import',
	PARTICIPANT_CONFIRM: 'participant.confirm',
	PARTICIPANT_CHECKIN: 'participant.checkin',
	PARTICIPANT_ATTENDANCE_CONFIRMATION: 'participant.attendance_confirmation',
	PARTICIPANT_ANONYMIZE: 'participant.anonymize',
	PARTICIPANT_MERGE: 'participant.merge',
	// Lectura/exportación de datos sensibles de salud (participant:health) — a
	// diferencia del resto de acciones de este catálogo (solo escrituras), estas
	// dos registran acceso de LECTURA porque el dato es sensible bajo LFPDPPP art. 9.
	PARTICIPANT_HEALTH_VIEW: 'participant.health_view',
	PARTICIPANT_HEALTH_EXPORT: 'participant.health_export',
	PARTICIPANT_HEALTH_DATA_PURGED: 'participant.health_data_purged',
	// Mesas
	TABLE_CREATE: 'table.create',
	TABLE_UPDATE: 'table.update',
	TABLE_DELETE: 'table.delete',
	TABLE_ASSIGN_LEADER: 'table.assign_leader',
	TABLE_UNASSIGN_LEADER: 'table.unassign_leader',
	TABLE_ASSIGN_WALKER: 'table.assign_walker',
	TABLE_UNASSIGN_WALKER: 'table.unassign_walker',
	TABLE_REBALANCE: 'table.rebalance',
	TABLE_CLEAR_ALL: 'table.clear_all',
	// Camas / Casas
	BED_ASSIGN: 'bed.assign',
	BED_UNASSIGN: 'bed.unassign',
	BED_TOGGLE_ACTIVE: 'bed.toggle_active',
	BED_CLEAR_ALL: 'bed.clear_all',
	HOUSE_CREATE: 'house.create',
	HOUSE_UPDATE: 'house.update',
	HOUSE_DELETE: 'house.delete',
	// Pagos
	PAYMENT_CREATE: 'payment.create',
	PAYMENT_UPDATE: 'payment.update',
	PAYMENT_DELETE: 'payment.delete',
	// Deudas de participantes
	PARTICIPANT_DEBT_CREATE: 'participant_debt.create',
	PARTICIPANT_DEBT_UPDATE: 'participant_debt.update',
	PARTICIPANT_DEBT_DELETE: 'participant_debt.delete',
	// Retiros
	RETREAT_CREATE: 'retreat.create',
	RETREAT_UPDATE: 'retreat.update',
	RETREAT_MEMORY_PHOTO_UPLOAD: 'retreat.memory.photo_upload',
	RETREAT_MEMORY_UPDATE: 'retreat.memory.update',
	// Secuencias de mensajes (incidente Buen Despacho 2026-10-06: ningún cambio
	// de secuencias tenía autor registrado). `run_now` = "Ejecutar ahora" manual
	// (o el alta de un participante); `cron_run` = corrida horaria del motor,
	// agregada por retiro tocado.
	MESSAGE_SEQUENCE_CREATE: 'message_sequence.create',
	MESSAGE_SEQUENCE_UPDATE: 'message_sequence.update',
	MESSAGE_SEQUENCE_DELETE: 'message_sequence.delete',
	MESSAGE_SEQUENCE_RUN_NOW: 'message_sequence.run_now',
	MESSAGE_SEQUENCE_CRON_RUN: 'message_sequence.cron_run',
	MESSAGE_SEQUENCE_REGENERATE_QUEUE: 'message_sequence.regenerate_queue',
	// Pasos de secuencia (el "Ejecutar ahora"/reprogramar de un paso mueve
	// TODOS sus pendientes: el recurso es el paso, el conteo va en metadata)
	SEQUENCE_STEP_RESCHEDULE: 'sequence_step.reschedule',
	// Mensajes programados — sólo transiciones manuales de la bandeja/programados
	SCHEDULED_MESSAGE_DISPATCH: 'scheduled_message.dispatch',
	SCHEDULED_MESSAGE_SKIP: 'scheduled_message.skip',
	SCHEDULED_MESSAGE_RETRY: 'scheduled_message.retry',
	SCHEDULED_MESSAGE_DISCARD: 'scheduled_message.discard',
	SCHEDULED_MESSAGE_ASSIGN: 'scheduled_message.assign',
	SCHEDULED_MESSAGE_BULK_RESOLVE: 'scheduled_message.bulk_resolve',
	// Plantillas de mensaje (editar una plantilla cambia lo que se envía)
	MESSAGE_TEMPLATE_CREATE: 'message_template.create',
	MESSAGE_TEMPLATE_UPDATE: 'message_template.update',
	MESSAGE_TEMPLATE_DELETE: 'message_template.delete',
	// Plantillas globales de secuencias (sin retiro; `copy_to_retreat` sí lleva retreatId)
	GLOBAL_MESSAGE_SEQUENCE_CREATE: 'global_message_sequence.create',
	GLOBAL_MESSAGE_SEQUENCE_UPDATE: 'global_message_sequence.update',
	GLOBAL_MESSAGE_SEQUENCE_DELETE: 'global_message_sequence.delete',
	GLOBAL_MESSAGE_SEQUENCE_TOGGLE_ACTIVE: 'global_message_sequence.toggle_active',
	GLOBAL_MESSAGE_SEQUENCE_COPY_TO_RETREAT: 'global_message_sequence.copy_to_retreat',
	// Plantillas globales de mensaje (texto base que los retiros/comunidades copian)
	GLOBAL_MESSAGE_TEMPLATE_CREATE: 'global_message_template.create',
	GLOBAL_MESSAGE_TEMPLATE_UPDATE: 'global_message_template.update',
	GLOBAL_MESSAGE_TEMPLATE_DELETE: 'global_message_template.delete',
	GLOBAL_MESSAGE_TEMPLATE_TOGGLE_ACTIVE: 'global_message_template.toggle_active',
	GLOBAL_MESSAGE_TEMPLATE_COPY_TO_RETREAT: 'global_message_template.copy_to_retreat',
	GLOBAL_MESSAGE_TEMPLATE_COPY_TO_COMMUNITY: 'global_message_template.copy_to_community',
	GLOBAL_MESSAGE_TEMPLATE_COPY_FROM_RETREAT: 'global_message_template.copy_from_retreat',
	// Tanda P2 — operación del retiro. Plantillas globales de tareas pre-retiro
	PRE_RETREAT_TASK_TEMPLATE_SET_CREATE: 'pre_retreat_task_template_set.create',
	PRE_RETREAT_TASK_TEMPLATE_SET_UPDATE: 'pre_retreat_task_template_set.update',
	PRE_RETREAT_TASK_TEMPLATE_SET_DELETE: 'pre_retreat_task_template_set.delete',
	PRE_RETREAT_TASK_TEMPLATE_CREATE: 'pre_retreat_task_template.create',
	PRE_RETREAT_TASK_TEMPLATE_UPDATE: 'pre_retreat_task_template.update',
	PRE_RETREAT_TASK_TEMPLATE_DELETE: 'pre_retreat_task_template.delete',
	// Plantillas globales de minuto a minuto
	SCHEDULE_TEMPLATE_SET_CREATE: 'schedule_template_set.create',
	SCHEDULE_TEMPLATE_SET_UPDATE: 'schedule_template_set.update',
	SCHEDULE_TEMPLATE_SET_DELETE: 'schedule_template_set.delete',
	SCHEDULE_TEMPLATE_CREATE: 'schedule_template.create',
	SCHEDULE_TEMPLATE_UPDATE: 'schedule_template.update',
	SCHEDULE_TEMPLATE_DELETE: 'schedule_template.delete',
	// Tareas pre-retiro de un retiro
	PRE_RETREAT_TASK_CREATE: 'pre_retreat_task.create',
	PRE_RETREAT_TASK_UPDATE: 'pre_retreat_task.update',
	PRE_RETREAT_TASK_DELETE: 'pre_retreat_task.delete',
	PRE_RETREAT_TASK_SET_STATUS: 'pre_retreat_task.set_status',
	PRE_RETREAT_TASK_MATERIALIZE: 'pre_retreat_task.materialize',
	// Minuto a minuto de un retiro. `resolveSantisimoConflicts` y la
	// auto-asignación de angelitos NO se auditan: son consecuencias derivadas
	// que corren tras casi cada edición (ruido); la traza queda en el evento
	// de la acción manual que las disparó.
	SCHEDULE_ITEM_CREATE: 'schedule_item.create',
	SCHEDULE_ITEM_UPDATE: 'schedule_item.update',
	SCHEDULE_ITEM_DELETE: 'schedule_item.delete',
	SCHEDULE_ITEM_BULK_ASSIGN: 'schedule_item.bulk_assign',
	SCHEDULE_ITEM_RELINK: 'schedule_item.relink',
	SCHEDULE_ITEM_MATERIALIZE: 'schedule_item.materialize',
	SCHEDULE_ITEM_START: 'schedule_item.start',
	SCHEDULE_ITEM_COMPLETE: 'schedule_item.complete',
	SCHEDULE_ITEM_SHIFT_DAY: 'schedule_item.shift_day',
	SCHEDULE_ITEM_SHIFT_ALL: 'schedule_item.shift_all',
	SCHEDULE_ITEM_SHIFT_DOWNSTREAM: 'schedule_item.shift_downstream',
	SCHEDULE_ITEM_REORDER_DAY: 'schedule_item.reorder_day',
	SCHEDULE_ITEM_REGENERATE_SANTISIMO: 'schedule_item.regenerate_santisimo',
	// Tanda P2, bloque B — Santísimo. `generate` es la generación masiva de
	// turnos (agregada: los conteos van en metadata).
	SANTISIMO_SLOT_CREATE: 'santisimo_slot.create',
	SANTISIMO_SLOT_UPDATE: 'santisimo_slot.update',
	SANTISIMO_SLOT_DELETE: 'santisimo_slot.delete',
	SANTISIMO_SLOT_GENERATE: 'santisimo_slot.generate',
	// Inscripciones al Santísimo. `public_signup` sale de la ruta pública sin
	// sesión: no hay actor del auditContext y la IP viaja en el propio evento.
	SANTISIMO_SIGNUP_ADMIN_CREATE: 'santisimo_signup.admin_create',
	SANTISIMO_SIGNUP_PUBLIC_SIGNUP: 'santisimo_signup.public_signup',
	SANTISIMO_SIGNUP_DELETE: 'santisimo_signup.delete',
	SANTISIMO_SIGNUP_CANCEL: 'santisimo_signup.cancel',
	// Responsabilidades. `createDefaultResponsibilitiesForRetreat` y
	// `ensureCharlaResponsibilitiesFromTemplateSet` NO se auditan: son semilla
	// al crear el retiro / derivadas de materializar el minuto a minuto — la
	// traza vive en retreat.create y schedule_item.materialize.
	RESPONSABILITY_CREATE: 'responsability.create',
	RESPONSABILITY_UPDATE: 'responsability.update',
	RESPONSABILITY_DELETE: 'responsability.delete',
	RESPONSABILITY_ASSIGN: 'responsability.assign',
	RESPONSABILITY_REMOVE: 'responsability.remove',
	RESPONSABILITY_CREATE_SPEAKER: 'responsability.create_speaker',
	// Documentos de responsabilidades (archivos y markdown). `storageUrl`
	// nunca entra al log (data:URL de hasta 10MB); `restore_version` vuelve a
	// una entrada del historial de ediciones.
	RESPONSABILITY_ATTACHMENT_CREATE: 'responsability_attachment.create',
	RESPONSABILITY_ATTACHMENT_UPDATE: 'responsability_attachment.update',
	RESPONSABILITY_ATTACHMENT_RESTORE_VERSION: 'responsability_attachment.restore_version',
	RESPONSABILITY_ATTACHMENT_DELETE: 'responsability_attachment.delete',
	// Equipos de servicio. `createDefaultServiceTeamsForRetreat` NO se audita
	// (semilla de retreat.create) y la sincronización líder↔responsabilidad
	// (leaderSyncService) es derivada de estas acciones manuales.
	SERVICE_TEAM_CREATE: 'service_team.create',
	SERVICE_TEAM_UPDATE: 'service_team.update',
	SERVICE_TEAM_DELETE: 'service_team.delete',
	SERVICE_TEAM_ADD_MEMBER: 'service_team.add_member',
	SERVICE_TEAM_REMOVE_MEMBER: 'service_team.remove_member',
	SERVICE_TEAM_ASSIGN_LEADER: 'service_team.assign_leader',
	SERVICE_TEAM_UNASSIGN_LEADER: 'service_team.unassign_leader',
	// Tanda P2, bloque C — catálogo global de inventario (categorías, equipos
	// e ítems). No llevan retreatId: son compartidos por todos los retiros,
	// como los documentos de responsabilidad.
	INVENTORY_CATEGORY_CREATE: 'inventory_category.create',
	INVENTORY_TEAM_CREATE: 'inventory_team.create',
	INVENTORY_ITEM_CREATE: 'inventory_item.create',
	INVENTORY_ITEM_UPDATE: 'inventory_item.update',
	// Inventario de un retiro. `updateRetreatInventory` también escribe el
	// historial por-campo (retreat_inventory_history): esa tabla sigue siendo
	// el detalle por ítem; este evento es la traza forense unificada con actor
	// implícito del auditContext e IP. Los bulk (update/remove) reusan los
	// individuales en loop: cada fila deja su propio evento, sin agregado
	// extra. `syncShirtItemsForRetreat` y `createDefaultInventoryForRetreat`
	// NO se auditan (derivada del CRUD de playeras / semilla de retreat.create).
	RETREAT_INVENTORY_CREATE: 'retreat_inventory.create',
	RETREAT_INVENTORY_UPDATE: 'retreat_inventory.update',
	RETREAT_INVENTORY_DELETE: 'retreat_inventory.delete',
	RETREAT_INVENTORY_SYNC_CATALOG: 'retreat_inventory.sync_catalog',
	RETREAT_INVENTORY_RECALCULATE: 'retreat_inventory.recalculate',
	RETREAT_INVENTORY_COPY_FROM_RETREAT: 'retreat_inventory.copy_from_retreat',
	RETREAT_INVENTORY_IMPORT: 'retreat_inventory.import',
	// Tipos de playera del retiro. `seedDefaultShirtTypes` (semilla) y
	// `syncInventoryShirts` (derivada del CRUD) NO se auditan.
	SHIRT_TYPE_CREATE: 'shirt_type.create',
	SHIRT_TYPE_UPDATE: 'shirt_type.update',
	SHIRT_TYPE_DELETE: 'shirt_type.delete',
	// Seguimiento CRM. Crear/editar NOTAS no se audita: la nota ES el registro
	// (autor y fecha viven en su propia fila); borrarla sí, porque es pérdida
	// de información sin rastro. El hito de palancas es derivado del conteo
	// de cartas (la raíz es el participant.update que ya se audita).
	CRM_FOLLOW_UP_UPDATE: 'crm_follow_up.update',
	CRM_TASK_CREATE: 'crm_task.create',
	CRM_TASK_UPDATE: 'crm_task.update',
	CRM_TASK_DELETE: 'crm_task.delete',
	PARTICIPANT_NOTE_DELETE: 'participant_note.delete',
	// Preparaciones del equipo servidor. `generate` y `skip_holiday` son
	// masivas: un evento agregado por retiro.
	RETREAT_PREPARATION_CREATE: 'retreat_preparation.create',
	RETREAT_PREPARATION_UPDATE: 'retreat_preparation.update',
	RETREAT_PREPARATION_DELETE: 'retreat_preparation.delete',
	RETREAT_PREPARATION_GENERATE: 'retreat_preparation.generate',
	RETREAT_PREPARATION_SKIP_HOLIDAY: 'retreat_preparation.skip_holiday',
	RETREAT_PREPARATION_RESYNC_DOCS: 'retreat_preparation.resync_docs',
	// Documentos de preparación. `url` (data:URL/binario S3) y `content`
	// (markdown) NUNCA entran al log — sizeBytes informa el tamaño.
	RETREAT_PREPARATION_DOCUMENT_CREATE: 'retreat_preparation_document.create',
	RETREAT_PREPARATION_DOCUMENT_UPDATE: 'retreat_preparation_document.update',
	RETREAT_PREPARATION_DOCUMENT_DELETE: 'retreat_preparation_document.delete',
} as const;

export type DomainAuditActionType = (typeof DomainAuditAction)[keyof typeof DomainAuditAction];

export const DOMAIN_RESOURCE_TYPES = [
	'participant',
	'participant_debt',
	'table',
	'bed',
	'house',
	'payment',
	'retreat',
	'message_sequence',
	'sequence_step',
	'scheduled_message',
	'message_template',
	'global_message_sequence',
	'global_message_template',
	'pre_retreat_task_template_set',
	'pre_retreat_task_template',
	'schedule_template_set',
	'schedule_template',
	'pre_retreat_task',
	'schedule_item',
	'santisimo_slot',
	'santisimo_signup',
	'responsability',
	'responsability_attachment',
	'service_team',
	'inventory_category',
	'inventory_team',
	'inventory_item',
	'retreat_inventory',
	'shirt_type',
	'crm_follow_up',
	'crm_task',
	'participant_note',
	'retreat_preparation',
	'retreat_preparation_document',
] as const;

export type DomainResourceType = (typeof DOMAIN_RESOURCE_TYPES)[number];
