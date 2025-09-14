import { z } from 'zod';
import { UserSchema } from './base';

export const UserRoleSchema = z.object({
	id: z.number(),
	userId: z.string(),
	roleId: z.number(),
	createdAt: z.date(),
});

export const UserRetreatSchema = z.object({
	id: z.number(),
	userId: z.string(),
	retreatId: z.string(),
	roleId: z.number(),
	invitedBy: z.string().nullable().optional(),
	invitedAt: z.date().nullable().optional(),
	expiresAt: z.date().nullable().optional(),
	status: z.enum(['pending', 'active', 'expired', 'revoked']),
	permissionsOverride: z.string().nullable().optional(),
	updatedAt: z.date(),
	createdAt: z.date(),
});

export const PermissionSchema = z.object({
	id: z.number(),
	resource: z.string(),
	operation: z.string(),
	description: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const RoleSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string().optional(),
	createdAt: z.date(),
	updatedAt: z.date(),
});

export const RolePermissionSchema = z.object({
	id: z.number(),
	roleId: z.number(),
	permissionId: z.number(),
	createdAt: z.date(),
});

export const UserPermissionSchema = z.object({
	resource: z.string(),
	operation: z.string(),
});

export const UserRoleDetailSchema = z.object({
	role: RoleSchema,
	retreats: z.array(
		z.object({
			retreatId: z.string(),
			role: RoleSchema,
		}),
	),
	globalPermissions: z.array(UserPermissionSchema),
});

export const UserProfileSchema = z.object({
	roles: z.array(UserRoleDetailSchema),
	permissions: z.array(UserPermissionSchema),
});

// Role Request types
export const RoleRequestSchema = z.object({
	id: z.string().uuid(),
	userId: z.string().uuid(),
	retreatId: z.string().uuid(),
	requestedRoleId: z.number(),
	requestedRole: z.string(),
	message: z.string().optional(),
	status: z.enum(['pending', 'approved', 'rejected']),
	requestedAt: z.date(),
	approvedAt: z.date().nullable().optional(),
	rejectedAt: z.date().nullable().optional(),
	approvedBy: z.string().uuid().nullable().optional(),
	rejectedBy: z.string().uuid().nullable().optional(),
	rejectionReason: z.string().optional(),
});

export const CreateRoleRequestSchema = z.object({
	body: RoleRequestSchema.omit({
		id: true,
		status: true,
		requestedAt: true,
		approvedAt: true,
		rejectedAt: true,
		approvedBy: true,
		rejectedBy: true,
	}),
});

export const UpdateRoleRequestSchema = z.object({
	body: z.object({
		status: z.enum(['approved', 'rejected']),
		rejectionReason: z.string().optional(),
	}),
	params: z.object({
		id: z.string().uuid(),
	}),
});

// Permission Override types
export const PermissionOverrideSchema = z.object({
	resource: z.string(),
	operation: z.string(),
	granted: z.boolean(),
	reason: z.string().optional(),
	expiresAt: z.date().optional(),
});

export const CreatePermissionOverrideSchema = z.object({
	body: z.object({
		overrides: z.array(PermissionOverrideSchema),
		reason: z.string().optional(),
	}),
	params: z.object({
		retreatId: z.string().uuid(),
		userId: z.string().uuid(),
	}),
});

export type User = z.infer<typeof UserSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type UserRetreat = z.infer<typeof UserRetreatSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type RolePermission = z.infer<typeof RolePermissionSchema>;
export type UserPermission = z.infer<typeof UserPermissionSchema>;
export type UserRoleDetail = z.infer<typeof UserRoleDetailSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
export type RoleRequest = z.infer<typeof RoleRequestSchema>;
export type CreateRoleRequest = z.infer<typeof CreateRoleRequestSchema.shape.body>;
export type UpdateRoleRequest = z.infer<typeof UpdateRoleRequestSchema.shape.body>;
export type PermissionOverride = z.infer<typeof PermissionOverrideSchema>;
export type CreatePermissionOverride = z.infer<typeof CreatePermissionOverrideSchema.shape.body>;
