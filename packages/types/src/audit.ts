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
] as const;

export type DomainResourceType = (typeof DOMAIN_RESOURCE_TYPES)[number];
