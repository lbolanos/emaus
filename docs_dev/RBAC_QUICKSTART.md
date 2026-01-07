# RBAC Quick Start Guide

## Getting Started

### 1. Database Setup

```bash
# Run migrations to create RBAC tables
pnpm --filter api migration:run

# Seed initial data (roles, permissions, etc.)
pnpm --filter api db:seed
```

### 2. Basic Role Assignment

```typescript
import { authorizationService } from '../middleware/authorization';

// Assign user as retreat admin
await authorizationService.assignRetreatRole(
	userId, // User to assign
	retreatId, // Retreat ID
	ROLE_IDS.RETREAT_ADMIN, // Role ID
	currentUserId, // Who is assigning
);
```

### 3. Permission Checking

```typescript
// Check if user has specific permission
const canCreateParticipants = await authorizationService.hasPermission(
	userId,
	'participant:create',
);

// Check retreat-specific role
const isRetreatAdmin = await authorizationService.hasRetreatRole(
	userId,
	retreatId,
	'retreat_admin',
);
```

### 4. Middleware Usage

```typescript
import { requireRetreatRole, requirePermission } from '../middleware/authorization';

// Protect routes with middleware
router.post('/participants', requirePermission('participant:create'), participantController.create);

router.put('/retreats/:retreatId', requireRetreatRole('retreat_admin'), retreatController.update);
```

## Common Use Cases

### Creating a New Retreat

```typescript
// 1. Create retreat
const retreat = await retreatService.create({
	name: 'Weekend Retreat 2024',
	parish: "St. Mary's",
	createdBy: userId,
});

// 2. Creator automatically gets retreat_admin role
// No additional setup needed
```

### Managing Retreat Staff

```typescript
// Assign different roles to staff members
await authorizationService.assignRetreatRole(
	'manager-id',
	retreatId,
	ROLE_IDS.RETREAT_MANAGER,
	userId,
);

await authorizationService.assignRetreatRole(
	'coordinator-id',
	retreatId,
	ROLE_IDS.RETREAT_USER,
	userId,
);
```

### Temporary Permissions

```typescript
// Delegate permissions temporarily (7 days)
await permissionInheritanceService.delegatePermissions({
	fromUserId: 'admin-id',
	toUserId: 'temp-admin-id',
	retreatId: retreatId,
	permissions: ['participant:create', 'participant:update'],
	expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
});
```

## API Reference

### Key Endpoints

| Method | Endpoint                                                  | Description                 | Required Permissions  |
| ------ | --------------------------------------------------------- | --------------------------- | --------------------- |
| POST   | `/api/retreat-roles`                                      | Assign user to retreat role | `retreat:manage`      |
| DELETE | `/api/retreat-roles/:retreatId/users/:userId`             | Remove user role            | `retreat:manage`      |
| GET    | `/api/retreat-roles/:retreatId/users`                     | List retreat users          | `retreat:read`        |
| GET    | `/api/retreat-roles/:retreatId/users/:userId/permissions` | Get user permissions        | `retreat:read`        |
| POST   | `/api/permission-delegations`                             | Delegate permissions        | `permission:delegate` |
| GET    | `/api/audit/retreat/:retreatId`                           | View audit logs             | `audit:read`          |

### Role IDs Reference

```typescript
export const ROLE_IDS = {
	SUPERADMIN: 1,
	ADMIN: 2,
	RETREAT_ADMIN: 3,
	RETREAT_MANAGER: 4,
	RETREAT_USER: 5,
	TESORERO: 6,
};
```

### Permission Examples

```typescript
// Retreat permissions
('retreat:create', 'retreat:read', 'retreat:update', 'retreat:delete');

// Participant permissions
('participant:create', 'participant:read', 'participant:update', 'participant:delete');

// Audit permissions
('audit:read', 'audit:manage');

// User permissions (global)
('users:read', 'users:create', 'users:update');
```

## Testing Your Implementation

```typescript
// Test basic functionality
const testUserId = 'test-user-id';
const testRetreatId = 'test-retreat-id';

// 1. Assign role
await authorizationService.assignRetreatRole(
	testUserId,
	testRetreatId,
	ROLE_IDS.RETREAT_ADMIN,
	'system',
);

// 2. Check permissions
const hasAccess = await authorizationService.hasRetreatAccess(testUserId, testRetreatId);
console.log('Has retreat access:', hasAccess);

// 3. Verify role
const hasRole = await authorizationService.hasRetreatRole(
	testUserId,
	testRetreatId,
	'retreat_admin',
);
console.log('Has retreat admin role:', hasRole);
```

## Performance Tips

1. **Use Caching**: Permission checks are automatically cached
2. **Batch Operations**: Use `batchGetUserPermissions` for multiple users
3. **Monitor Performance**: Check cache hit rates regularly
4. **Clean Up Expired Roles**: Use the automated cleanup service

## Next Steps

1. Review the [full documentation](./RBAC_DOCUMENTATION.md)
2. Run the integration tests: `pnpm test`
3. Implement role assignment UI components
4. Set up audit log monitoring
5. Configure performance monitoring

---

_This quick start guide covers the essential RBAC functionality. For detailed information, please refer to the complete documentation._
