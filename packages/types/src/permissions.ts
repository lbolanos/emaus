export const DEFAULT_OPERATIONS = ['create', 'read', 'update', 'delete', 'list'] as const;
export type Operation = (typeof DEFAULT_OPERATIONS)[number];

export const RESOURCES = {
	house: [...DEFAULT_OPERATIONS] as const,
	inventoryItem: [...DEFAULT_OPERATIONS] as const,
	retreat: [...DEFAULT_OPERATIONS] as const,
	participant: [...DEFAULT_OPERATIONS] as const,
	user: [...DEFAULT_OPERATIONS] as const,
	table: [...DEFAULT_OPERATIONS] as const,
	payment: [...DEFAULT_OPERATIONS] as const,
} as const;

export type Resource = keyof typeof RESOURCES;
export type ResourcePermission<T extends Resource> = `${T}:${(typeof RESOURCES)[T][number]}`;
export type Permission = ResourcePermission<Resource>;

export const ROLES = {
	superadmin: 'superadmin',
	admin: 'admin',
	servidor: 'servidor',
	tesorero: 'tesorero',
	logística: 'logística',
	palancas: 'palancas',
} as const;

export type Role = keyof typeof ROLES;
