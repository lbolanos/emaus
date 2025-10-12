# RBAC System Documentation

## Overview

The Retreat-Specific Role-Based Access Control (RBAC) system allows users to have different roles and permissions across different retreats. This enables flexible permission management where a user can be an administrator in one retreat they created while being a treasurer (treasurer) in another retreat they were invited to join.

## Core Concepts

### 1. Retreat-Specific Roles

Users can have different roles in different retreats:

- **Global Roles**: System-wide permissions (superadmin, admin)
- **Retreat-Specific Roles**: Permissions limited to specific retreats
- **Dynamic Assignment**: Roles can be assigned/revoked per retreat

### 2. Permission Structure

Permissions follow the format: `resource:operation`

- **Resources**: retreats, participants, users, audit, etc.
- **Operations**: create, read, update, delete, manage, etc.

### 3. Role Hierarchy

Roles inherit permissions from lower-level roles:

- `superadmin` > `admin` > `retreat_admin` > `retreat_manager` > `retreat_user`

## System Architecture

### Database Schema

#### Core Tables

```sql
-- Users
users (id, email, display_name, password, ...)

-- Roles
roles (id, name, description, level)

-- Permissions
permissions (id, resource, operation, description)

-- Role-Permission Mapping
role_permissions (role_id, permission_id)

-- Global User Roles
user_roles (user_id, role_id, ...)

-- Retreat-Specific User Roles
user_retreats (user_id, retreat_id, role_id, status, ...)

-- Permission Delegations
permission_delegations (from_user_id, to_user_id, retreat_id, permissions, ...)

-- Audit Logs
audit_logs (id, user_id, action_type, resource_type, ...)
```

### Service Layer

#### Authorization Service (`authorization.ts`)

- `getUserPermissions()` - Get all user permissions
- `hasPermission()` - Check specific permission
- `hasRetreatAccess()` - Check retreat access
- `hasRetreatRole()` - Check retreat-specific role
- `assignRetreatRole()` - Assign user to retreat role
- `revokeRetreatRole()` - Remove user from retreat role

#### Performance Optimization Service (`performanceOptimizationService.ts`)

- Multi-layer caching with NodeCache
- Batch operations for efficiency
- Memory management and cleanup
- Performance metrics collection

#### Permission Inheritance Service (`permissionInheritanceService.ts`)

- Role hierarchy resolution
- Permission delegation
- Inherited permission calculation

## API Endpoints

### Retreat Role Management

#### Assign User to Retreat Role

```http
POST /api/retreat-roles
Content-Type: application/json

{
  "userId": "user-uuid",
  "retreatId": "retreat-uuid",
  "roleId": 1,
  "invitedBy": "admin-uuid",
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

#### Revoke User from Retreat Role

```http
DELETE /api/retreat-roles/:retreatId/users/:userId
Content-Type: application/json

{
  "roleId": 1
}
```

#### Get Retreat Users

```http
GET /api/retreat-roles/:retreatId/users
Response:
{
  "users": [
    {
      "id": "user-uuid",
      "displayName": "John Doe",
      "email": "john@example.com",
      "role": "retreat_admin",
      "joinedAt": "2024-01-01T00:00:00Z"
    }
  ]
}
```

### Permission Management

#### Get User Permissions

```http
GET /api/retreat-roles/:retreatId/users/:userId/permissions
Response:
{
  "permissions": [
    "retreat:read",
    "retreat:update",
    "participant:create",
    "participant:read"
  ],
  "roles": ["retreat_admin"],
  "inheritedPermissions": ["audit:read"]
}
```

#### Delegate Permissions

```http
POST /api/permission-delegations
Content-Type: application/json

{
  "fromUserId": "admin-uuid",
  "toUserId": "user-uuid",
  "retreatId": "retreat-uuid",
  "permissions": ["participant:create", "participant:update"],
  "expiresAt": "2024-12-31T23:59:59Z"
}
```

### Audit Logging

#### Get Audit Logs

```http
GET /api/audit/retreat/:retreatId?limit=50&offset=0&actionType=role_assigned
Response:
{
  "logs": [
    {
      "id": "log-uuid",
      "userId": "admin-uuid",
      "actionType": "role_assigned",
      "resourceType": "user_retreat",
      "targetUserId": "user-uuid",
      "details": {
        "retreatId": "retreat-uuid",
        "oldRole": null,
        "newRole": "retreat_admin"
      },
      "timestamp": "2024-01-01T00:00:00Z"
    }
  ],
  "total": 1,
  "hasMore": false
}
```

## Usage Examples

### Example 1: Creating a Retreat and Assigning Roles

```typescript
// 1. User creates a retreat (automatically becomes retreat_admin)
const retreat = await retreatService.createRetreat({
	name: 'Retreat 2024',
	parish: 'Main Parish',
	createdBy: userId,
});

// 2. Assign another user as retreat_manager
await authorizationService.assignRetreatRole(
	'user-2-id',
	retreat.id,
	ROLE_IDS.RETREAT_MANAGER,
	userId,
);

// 3. Assign a third user as retreat_user with limited permissions
await authorizationService.assignRetreatRole(
	'user-3-id',
	retreat.id,
	ROLE_IDS.RETREAT_USER,
	userId,
);
```

### Example 2: Permission Checking in Controllers

```typescript
import { requireRetreatRole, requirePermission } from '../middleware/authorization';

// Only retreat_admin can update retreat settings
router.put(
	'/retreats/:retreatId',
	requireRetreatRole('retreat_admin'),
	retreatController.updateRetreat,
);

// Anyone with retreat access can read participants
router.get(
	'/retreats/:retreatId/participants',
	requireRetreatAccess(),
	participantController.getParticipants,
);

// Only users with participant:create permission can add participants
router.post(
	'/retreats/:retreatId/participants',
	requirePermission('participant:create'),
	participantController.createParticipant,
);
```

### Example 3: Permission Delegation

```typescript
// Retreat admin delegates participant management to a trusted user
await permissionInheritanceService.delegatePermissions({
	fromUserId: 'admin-id',
	toUserId: 'manager-id',
	retreatId: 'retreat-id',
	permissions: ['participant:create', 'participant:update', 'participant:read'],
	expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
});

// The delegated user can now perform these operations
const canCreateParticipants = await authorizationService.hasPermission(
	'manager-id',
	'participant:create',
); // true
```

### Example 4: Using Performance Optimization

```typescript
// Batch permission checking for multiple users (optimized)
const userIds = ['user-1', 'user-2', 'user-3', 'user-4'];
const retreatId = 'retreat-1';

const permissions = await performanceOptimizationService.batchGetUserPermissions(
	userIds,
	retreatId,
);

// Results are cached for subsequent requests
const cachedPermissions = await performanceOptimizationService.getCachedPermissions(
	'user-1',
	retreatId,
);
```

## Role Definitions

### Global Roles

- **superadmin**: Full system access
- **admin**: System administration except user management

### Retreat-Specific Roles

- **retreat_admin**: Full retreat management
- **retreat_manager**: Retreat operations and participant management
- **retreat_user**: Basic retreat access and read-only operations

### Default Permissions by Role

#### superadmin

- `*:*` (all permissions)

#### admin

- `users:read`
- `retreats:*`
- `participants:*`
- `audit:*`

#### retreat_admin

- `retreat:*` (for assigned retreat)
- `participants:*` (for assigned retreat)
- `audit:read` (for assigned retreat)

#### retreat_manager

- `retreat:read`, `retreat:update` (for assigned retreat)
- `participant:*` (for assigned retreat)

#### retreat_user

- `retreat:read` (for assigned retreat)
- `participant:read` (for assigned retreat)

## Performance Features

### Caching Strategy

- **User Retreat Cache**: 5-minute TTL
- **Permission Cache**: Retreat-scoped, 5-minute TTL
- **Retreat Cache**: 3-minute TTL
- **Automatic Invalidation**: Cache cleared on role changes

### Database Optimizations

- **Composite Indexes**: Optimized for common query patterns
- **Batch Operations**: Efficient bulk permission checking
- **Query Hints**: Automatic index usage optimization

### Memory Management

- **Automatic Cleanup**: When memory usage exceeds 80%
- **Cache Size Limits**: Maximum 10,000 keys total
- **Periodic Maintenance**: Every 5 minutes

## Security Features

### Audit Logging

All role changes are logged with:

- User who made the change
- Action type (role_assigned, role_removed, etc.)
- Resource affected
- Before/after values
- Timestamp

### Permission Inheritance

- Role hierarchy with automatic permission inheritance
- Permission delegation with expiration
- Cascading permission revocation

### Data Validation

- User must have retreat access to assign roles
- Role expiration prevents indefinite access
- Permission scope limited to specific retreats

## Error Handling

### Common Error Codes

- **401 Unauthorized**: User not authenticated
- **403 Forbidden**: User lacks required permissions
- **400 Bad Request**: Invalid input data
- **404 Not Found**: Resource not found
- **500 Internal Server Error**: System error

### Error Response Format

```json
{
	"message": "Error description",
	"error": "Detailed error information",
	"code": "ERROR_CODE"
}
```

## Testing

### Integration Tests

The system includes comprehensive integration tests covering:

- Role assignment and revocation
- Permission checking
- Permission inheritance
- Performance optimization
- Audit logging
- Error scenarios

### Running Tests

```bash
# Run all tests
pnpm test

# Run specific test file
pnpm test rbac.integration.test.ts
```

## Configuration

### Environment Variables

```bash
# Performance optimization
CACHE_TTL=300                  # Cache time-to-live in seconds
CACHE_CHECK_PERIOD=60          # Cache cleanup check period
MEMORY_THRESHOLD=80            # Memory cleanup threshold percentage

# Security
PERMISSION_DELEGATION_MAX_DAYS=30  # Maximum delegation period
ROLE_EXPIRATION_DAYS=365           # Default role expiration
```

### Performance Tuning

For large deployments (>1000 users per retreat):

- Increase cache TTL: `CACHE_TTL=600`
- Enable batch operations by default
- Monitor memory usage regularly
- Consider Redis for distributed caching

## Migration Guide

### From Simple RBAC to Retreat-Specific RBAC

1. **Run Database Migrations**

```bash
pnpm --filter api migration:run
```

2. **Update Existing User Roles**

```typescript
// Migrate global roles to retreat-specific roles
await migrationService.migrateUserRoles();
```

3. **Update Controllers**

```typescript
// Replace global role checks with retreat-specific checks
// Before: requireRole('admin')
// After: requireRetreatRole('retreat_admin')
```

4. **Test Permission Changes**

```typescript
// Verify all existing functionality still works
await testMigrationCompatibility();
```

## Best Practices

### 1. Role Assignment

- Use the least privilege principle
- Assign specific roles rather than broad permissions
- Regularly review and audit role assignments
- Set appropriate expiration dates for temporary roles

### 2. Permission Delegation

- Delegate only necessary permissions
- Use short expiration times for temporary delegation
- Monitor delegated permissions through audit logs
- Revoke delegation when no longer needed

### 3. Performance Optimization

- Leverage caching for frequently accessed permissions
- Use batch operations for multiple user permission checks
- Monitor performance metrics regularly
- Clean up expired roles and delegations

### 4. Security

- Implement proper error handling to prevent information leakage
- Use audit logs for security monitoring
- Regularly review user access and permissions
- Implement proper session management

## Troubleshooting

### Common Issues

#### Permission Cache Issues

```typescript
// Clear user cache
performanceOptimizationService.invalidateUserPermissionCache(userId);

// Clear retreat cache
performanceOptimizationService.invalidateRetreatPermissionCache(retreatId);

// Clear all caches
performanceOptimizationService.clearAllCaches();
```

#### Performance Problems

```typescript
// Check cache statistics
const stats = performanceOptimizationService.getCacheStats();
console.log('Cache hit rate:', stats.metrics.cacheHitRate);

// Check memory usage
const memory = await performanceOptimizationService.checkMemoryUsage();
console.log('Memory usage:', memory.percentage + '%');
```

#### Role Assignment Issues

```typescript
// Check user's current roles and permissions
const userPermissions = await authorizationService.getUserPermissions(userId);
console.log('User permissions:', userPermissions);

// Verify retreat access
const hasAccess = await authorizationService.hasRetreatAccess(userId, retreatId);
console.log('Retreat access:', hasAccess);
```

## Support

For issues and questions:

1. Check the troubleshooting section
2. Review audit logs for permission-related issues
3. Monitor performance metrics for optimization opportunities
4. Ensure all migrations are properly applied

---

_This documentation covers the complete RBAC system implementation. For additional questions or specific use cases, please refer to the code comments and integration tests._
