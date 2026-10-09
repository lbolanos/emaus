export const DEFAULT_OPERATIONS = ['create', 'read', 'update', 'delete', 'list'] as const;
export type Operation = (typeof DEFAULT_OPERATIONS)[number];

export const RESOURCES = {
	house: [...DEFAULT_OPERATIONS] as const,
	inventoryItem: [...DEFAULT_OPERATIONS] as const,
	retreat: [...DEFAULT_OPERATIONS, 'invite'] as const,
	participant: [...DEFAULT_OPERATIONS] as const,
	user: [...DEFAULT_OPERATIONS, 'manage'] as const,
	table: [...DEFAULT_OPERATIONS] as const,
	payment: [...DEFAULT_OPERATIONS] as const,
	retreatInventory: [...DEFAULT_OPERATIONS] as const,
	responsability: [...DEFAULT_OPERATIONS] as const,
	messageTemplate: [...DEFAULT_OPERATIONS] as const,
	globalMessageTemplate: [...DEFAULT_OPERATIONS] as const,
} as const;

export type Resource = keyof typeof RESOURCES;
export type ResourcePermission<T extends Resource> = `${T}:${(typeof RESOURCES)[T][number]}`;
export type Permission = ResourcePermission<Resource>;

// Global roles (for user_roles table)
export const GLOBAL_ROLES = {
	superadmin: 'superadmin',
	region_admin: 'region_admin',
	regular: 'regular',
} as const;

// Retreat roles (for user_retreats table)
export const RETREAT_ROLES = {
	superadmin: 'superadmin',
	admin: 'admin',
	treasurer: 'treasurer',
	logistics: 'logistics',
	communications: 'communications',
	regular_server: 'regular_server',
} as const;

// All roles combined for backward compatibility
export const ROLES = {
	...GLOBAL_ROLES,
	...RETREAT_ROLES,
} as const;

export type Role = keyof typeof ROLES;

/**
 * Participant health and emergency-contact fields that only callers with
 * `participant:health` may read or write. The API strips them from responses
 * and rejects writes with 403; the web hides their columns and form fields.
 * One list for both sides: if they drift, the form shows a field whose save
 * the API rejects.
 *
 * Left out on purpose: `snores`/`hasMedication`/`hasDietaryRestrictions`
 * (booleans the bed assignment reads) and `sacraments` (religious data, not
 * health) — only the free-text details and the contacts.
 */
export const SENSITIVE_HEALTH_FIELDS = [
	'medicationDetails',
	'medicationSchedule',
	'dietaryRestrictionsDetails',
	'disabilitySupport',
	'notes',
	'emergencyContact1Name',
	'emergencyContact1Relation',
	'emergencyContact1HomePhone',
	'emergencyContact1WorkPhone',
	'emergencyContact1CellPhone',
	'emergencyContact1Email',
	'emergencyContact2Name',
	'emergencyContact2Relation',
	'emergencyContact2HomePhone',
	'emergencyContact2WorkPhone',
	'emergencyContact2CellPhone',
	'emergencyContact2Email',
] as const;
