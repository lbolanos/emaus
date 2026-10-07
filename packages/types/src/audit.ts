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
] as const;

export type DomainResourceType = (typeof DOMAIN_RESOURCE_TYPES)[number];
