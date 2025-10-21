import { computed } from 'vue';
import { useAuthStore } from '@/stores/authStore';
import { useRetreatStore } from '@/stores/retreatStore';
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
	const retreatStore = useRetreatStore();

	// Get current user permissions reactively
	const userPermissions = computed(() => {
		if (!authStore.userProfile) return [];

		// Get permissions from the profile.permissions (if available) and from role globalPermissions
		const profilePermissions = authStore.userProfile.permissions || [];
		const globalPermissions: Array<{resource: string, operation: string}> = [];

		// Extract permissions from all role globalPermissions
		authStore.userProfile.roles?.forEach((roleDetail) => {
			if (roleDetail.globalPermissions) {
				globalPermissions.push(...roleDetail.globalPermissions);
			}
		});

		// Combine and format all permissions
		const allPermissions = [...profilePermissions, ...globalPermissions];
		const formattedPermissions = allPermissions.map((p) => `${p.resource}:${p.operation}`);

		return formattedPermissions;
	});

	// Get retreat-specific permissions based on selected retreat
	const retreatSpecificPermissions = computed(() => {
		if (!authStore.userProfile || !retreatStore.selectedRetreatId) return [];

		// Get permissions from user's role for the selected retreat
		const retreatRole = authStore.userProfile.roles.find((roleDetail) =>
			roleDetail.retreats.some((retreat) => retreat.retreatId === retreatStore.selectedRetreatId),
		);

		if (!retreatRole) {
			// If no specific retreat role, fall back to global permissions
			return userPermissions.value;
		}

		// Combine global permissions with retreat-specific permissions
		const profilePermissions = authStore.userProfile.permissions || [];
		const roleGlobalPermissions: Array<{resource: string, operation: string}> = [];

		// Extract permissions from all role globalPermissions
		authStore.userProfile.roles?.forEach((roleDetail) => {
			if (roleDetail.globalPermissions) {
				roleGlobalPermissions.push(...roleDetail.globalPermissions);
			}
		});

		const globalPermissions = [...profilePermissions, ...roleGlobalPermissions].map(
			(p) => `${p.resource}:${p.operation}`,
		);
		const retreatPermissions = retreatRole.globalPermissions.map(
			(p) => `${p.resource}:${p.operation}`,
		);

		// Remove duplicates and return unique permissions
		return [...new Set([...globalPermissions, ...retreatPermissions])];
	});

	// Basic permission checking - use retreat-specific permissions
	const hasPerm = (permission: Permission) => {
		return hasPermission(retreatSpecificPermissions.value, permission);
	};

	const hasAnyPerm = (permissions: Permission[]) => {
		return hasAnyPermission(retreatSpecificPermissions.value, permissions);
	};

	const hasAllPerms = (permissions: Permission[]) => {
		return hasAllPermissions(retreatSpecificPermissions.value, permissions);
	};

	// Resource-based permission checking - use retreat-specific permissions
	const canAccess = (resource: ResourceType, operation: OperationType) => {
		return canAccessResource(retreatSpecificPermissions.value, resource, operation);
	};

	const can = {
		create: (resource: ResourceType) => canCreate(retreatSpecificPermissions.value, resource),
		read: (resource: ResourceType) => {
			// For resources that don't require a retreat (like 'house'), use global permissions
			// For retreat-specific resources, use retreat-specific permissions
			const permissionsToUse = retreatStore.selectedRetreatId ? retreatSpecificPermissions.value : userPermissions.value;
			return canRead(permissionsToUse, resource);
		},
		update: (resource: ResourceType) => canUpdate(retreatSpecificPermissions.value, resource),
		delete: (resource: ResourceType) => canDelete(retreatSpecificPermissions.value, resource),
		list: (resource: ResourceType) => {
			// For resources that don't require a retreat (like 'house'), use global permissions
			const permissionsToUse = retreatStore.selectedRetreatId ? retreatSpecificPermissions.value : userPermissions.value;
			return canList(permissionsToUse, resource);
		},
		manage: (resource: ResourceType) => {
			return canAccessResource(retreatSpecificPermissions.value, resource, 'manage');
		},
	};

	// Role-based permission checking - use retreat-specific permissions
	const isSuper = computed(() => isSuperadmin(retreatSpecificPermissions.value));
	const isAdm = computed(() => isAdmin(retreatSpecificPermissions.value));

	const canManage = {
		retreat: computed(() => canManageRetreat(retreatSpecificPermissions.value)),
		participants: computed(() => canManageParticipants(retreatSpecificPermissions.value)),
		houses: computed(() => canManageHouses(retreatSpecificPermissions.value)),
		inventory: computed(() => canManageInventory(retreatSpecificPermissions.value)),
		tables: computed(() => canManageTables(retreatSpecificPermissions.value)),
		payments: computed(() => canManagePayments(retreatSpecificPermissions.value)),
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

	// Get current user's role for the selected retreat
	const currentRetreatRole = computed(() => {
		if (!authStore.userProfile || !retreatStore.selectedRetreatId) return null;

		const retreatRole = authStore.userProfile.roles.find((roleDetail) =>
			roleDetail.retreats.some((retreat) => retreat.retreatId === retreatStore.selectedRetreatId),
		);

		return retreatRole?.role || null;
	});

	// Check if user has any role in the current retreat
	const hasRoleInCurrentRetreat = computed(() => {
		return !!currentRetreatRole.value;
	});

	return {
		// Raw permissions
		userPermissions,
		retreatSpecificPermissions,

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
		currentRetreatRole,
		hasRoleInCurrentRetreat,

		// Retreat-based permissions
		userRetreats,
		canManageRetreatById,
	};
}
