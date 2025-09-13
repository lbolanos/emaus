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

export type User = z.infer<typeof UserSchema>;
export type UserRole = z.infer<typeof UserRoleSchema>;
export type UserRetreat = z.infer<typeof UserRetreatSchema>;
export type Permission = z.infer<typeof PermissionSchema>;
export type Role = z.infer<typeof RoleSchema>;
export type RolePermission = z.infer<typeof RolePermissionSchema>;
export type UserPermission = z.infer<typeof UserPermissionSchema>;
export type UserRoleDetail = z.infer<typeof UserRoleDetailSchema>;
export type UserProfile = z.infer<typeof UserProfileSchema>;
