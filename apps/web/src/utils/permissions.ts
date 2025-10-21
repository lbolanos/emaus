import type { UserPermission, UserProfile } from '@repo/types';

// Permission constants
export const DEFAULT_OPERATIONS = ['create', 'read', 'update', 'delete', 'list'] as const;

export const RESOURCES = {
	house: [...DEFAULT_OPERATIONS] as const,
	inventoryItem: [...DEFAULT_OPERATIONS] as const,
	retreat: [...DEFAULT_OPERATIONS] as const,
	participant: [...DEFAULT_OPERATIONS] as const,
	user: [...DEFAULT_OPERATIONS, 'manage'] as const,
	table: [...DEFAULT_OPERATIONS] as const,
	payment: [...DEFAULT_OPERATIONS] as const,
	responsability: [...DEFAULT_OPERATIONS] as const,
	retreatInventory: [...DEFAULT_OPERATIONS] as const,
	messageTemplate: [...DEFAULT_OPERATIONS] as const,
} as const;

export type ResourceType = keyof typeof RESOURCES;
export type OperationType = (typeof DEFAULT_OPERATIONS)[number] | 'manage';

// Generate all possible permissions
export type Permission = `${ResourceType}:${OperationType}`;

// Permission checking utilities
export function hasPermission(
	userPermissions: string[] | undefined,
	requiredPermission: Permission,
): boolean {
	if (!userPermissions) return false;
	return userPermissions.includes(requiredPermission);
}

export function hasAnyPermission(
	userPermissions: string[] | undefined,
	requiredPermissions: Permission[],
): boolean {
	if (!userPermissions) return false;
	return requiredPermissions.some((permission) => userPermissions.includes(permission));
}

export function hasAllPermissions(
	userPermissions: string[] | undefined,
	requiredPermissions: Permission[],
): boolean {
	if (!userPermissions) return false;
	return requiredPermissions.every((permission) => userPermissions.includes(permission));
}

// Resource-based permission checking
export function canAccessResource(
	userPermissions: string[] | undefined,
	resource: ResourceType,
	operation: OperationType,
): boolean {
	const permission = `${resource}:${operation}` as Permission;
	return hasPermission(userPermissions, permission);
}

export function canCreate(userPermissions: string[] | undefined, resource: ResourceType): boolean {
	return canAccessResource(userPermissions, resource, 'create');
}

export function canRead(userPermissions: string[] | undefined, resource: ResourceType): boolean {
	return canAccessResource(userPermissions, resource, 'read');
}

export function canUpdate(userPermissions: string[] | undefined, resource: ResourceType): boolean {
	return canAccessResource(userPermissions, resource, 'update');
}

export function canDelete(userPermissions: string[] | undefined, resource: ResourceType): boolean {
	return canAccessResource(userPermissions, resource, 'delete');
}

export function canList(userPermissions: string[] | undefined, resource: ResourceType): boolean {
	return canAccessResource(userPermissions, resource, 'list');
}

// Helper functions for common permission checks
export function isSuperadmin(userPermissions: string[] | undefined): boolean {
	return hasPermission(userPermissions, 'user:delete');
}

export function isAdmin(userPermissions: string[] | undefined): boolean {
	return hasAnyPermission(userPermissions, [
		'house:create',
		'inventoryItem:create',
		'retreat:create',
	]);
}

export function canManageRetreat(userPermissions: string[] | undefined): boolean {
	return hasAnyPermission(userPermissions, ['retreat:update', 'retreat:delete']);
}

export function canManageParticipants(userPermissions: string[] | undefined): boolean {
	return hasAnyPermission(userPermissions, [
		'participant:create',
		'participant:update',
		'participant:delete',
	]);
}

export function canManageHouses(userPermissions: string[] | undefined): boolean {
	return hasAnyPermission(userPermissions, ['house:create', 'house:update']);
}

export function canManageInventory(userPermissions: string[] | undefined): boolean {
	return hasAnyPermission(userPermissions, ['inventoryItem:create', 'inventoryItem:update']);
}

export function canManageTables(userPermissions: string[] | undefined): boolean {
	return hasAnyPermission(userPermissions, ['table:create', 'table:update']);
}

export function canManagePayments(userPermissions: string[] | undefined): boolean {
	return hasAnyPermission(userPermissions, ['payment:create', 'payment:update']);
}

// Vue composable for permission checking
export function usePermissions() {
	const getUserPermissions = (userProfile: UserProfile | null | undefined): string[] => {
		if (!userProfile) return [];
		return userProfile.permissions.map((p) => `${p.resource}:${p.operation}`);
	};

	return {
		hasPermission,
		hasAnyPermission,
		hasAllPermissions,
		canAccessResource,
		canCreate,
		canRead,
		canUpdate,
		canDelete,
		canList,
		isSuperadmin,
		isAdmin,
		canManageRetreat,
		canManageParticipants,
		canManageHouses,
		canManageInventory,
		canManageTables,
		canManagePayments,
		getUserPermissions,
	};
}
