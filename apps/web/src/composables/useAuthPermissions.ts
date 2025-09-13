import { computed } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import type { Permission, ResourceType, OperationType } from '@/utils/permissions';
import {
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
} from '@/utils/permissions';

/**
 * Vue composable for checking user permissions
 * Provides reactive permission checking based on the current user's profile
 */
export function useAuthPermissions() {
	const authStore = useAuthStore();

	// Get current user permissions reactively
	const userPermissions = computed(() => {
		if (!authStore.userProfile) return [];
		return authStore.userProfile.permissions.map((p) => `${p.resource}:${p.operation}`);
	});

	// Basic permission checking
	const hasPerm = (permission: Permission) => {
		return hasPermission(userPermissions.value, permission);
	};

	const hasAnyPerm = (permissions: Permission[]) => {
		return hasAnyPermission(userPermissions.value, permissions);
	};

	const hasAllPerms = (permissions: Permission[]) => {
		return hasAllPermissions(userPermissions.value, permissions);
	};

	// Resource-based permission checking
	const canAccess = (resource: ResourceType, operation: OperationType) => {
		return canAccessResource(userPermissions.value, resource, operation);
	};

	const can = {
		create: (resource: ResourceType) => canCreate(userPermissions.value, resource),
		read: (resource: ResourceType) => canRead(userPermissions.value, resource),
		update: (resource: ResourceType) => canUpdate(userPermissions.value, resource),
		delete: (resource: ResourceType) => canDelete(userPermissions.value, resource),
		list: (resource: ResourceType) => canList(userPermissions.value, resource),
	};

	// Role-based permission checking
	const isSuper = computed(() => isSuperadmin(userPermissions.value));
	const isAdm = computed(() => isAdmin(userPermissions.value));

	const canManage = {
		retreat: computed(() => canManageRetreat(userPermissions.value)),
		participants: computed(() => canManageParticipants(userPermissions.value)),
		houses: computed(() => canManageHouses(userPermissions.value)),
		inventory: computed(() => canManageInventory(userPermissions.value)),
		tables: computed(() => canManageTables(userPermissions.value)),
		payments: computed(() => canManagePayments(userPermissions.value)),
	};

	// Get user roles
	const userRoles = computed(() => {
		if (!authStore.userProfile?.roles) return [];
		return authStore.userProfile.roles.map((roleDetail) => roleDetail.role.name);
	});

	// Check if user has specific role
	const hasRole = (roleName: string) => {
		return userRoles.value.includes(roleName);
	};

	// Get user retreats (for scoped permissions)
	const userRetreats = computed(() => {
		if (!authStore.userProfile?.roles) return [];
		const retreats: Array<{ retreatId: string; roleName: string }> = [];

		authStore.userProfile.roles.forEach((roleDetail) => {
			roleDetail.retreats.forEach((retreatRole) => {
				retreats.push({
					retreatId: retreatRole.retreatId,
					roleName: retreatRole.role.name,
				});
			});
		});

		return retreats;
	});

	// Check if user can manage a specific retreat
	const canManageRetreatById = (retreatId: string) => {
		return userRetreats.value.some(
			(retreat) =>
				retreat.retreatId === retreatId && ['superadmin', 'admin'].includes(retreat.roleName),
		);
	};

	return {
		// Raw permissions
		userPermissions,

		// Permission checking functions
		hasPermission: hasPerm,
		hasAnyPermission: hasAnyPerm,
		hasAllPermissions: hasAllPerms,
		canAccessResource: canAccess,

		// Resource-based helpers
		can,

		// Role-based computed properties
		isSuperadmin: isSuper,
		isAdmin: isAdm,
		canManage,

		// Role information
		userRoles,
		hasRole,

		// Retreat-based permissions
		userRetreats,
		canManageRetreatById,
	};
}
