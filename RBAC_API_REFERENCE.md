# RBAC API Reference

## Authentication

All endpoints require authentication via session cookies. Include session credentials in requests.

## Base URL

```
http://localhost:3001/api
```

## Response Format

### Success Response

```json
{
  "success": true,
  "data": { ... },
  "message": "Operation successful"
}
```

### Error Response

```json
{
	"success": false,
	"message": "Error description",
	"error": "Detailed error information",
	"code": "ERROR_CODE"
}
```

## Retreat Role Management

### POST /retreat-roles

Assign a user to a retreat-specific role.

**Request Body:**

```json
{
	"userId": "uuid",
	"retreatId": "uuid",
	"roleId": 1,
	"invitedBy": "uuid",
	"expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"id": "user-retreat-uuid",
		"userId": "user-uuid",
		"retreatId": "retreat-uuid",
		"roleId": 1,
		"status": "active",
		"invitedAt": "2024-01-01T00:00:00Z",
		"expiresAt": "2024-12-31T23:59:59Z"
	}
}
```

**Required Permissions:** `retreat:manage`

---

### DELETE /retreat-roles/:retreatId/users/:userId

Remove a user from a retreat role.

**Request Parameters:**

- `retreatId` (path): Retreat UUID
- `userId` (path): User UUID

**Request Body:**

```json
{
	"roleId": 1
}
```

**Response:**

```json
{
	"success": true,
	"message": "User role revoked successfully"
}
```

**Required Permissions:** `retreat:manage`

---

### GET /retreat-roles/:retreatId/users

List all users in a retreat with their roles.

**Request Parameters:**

- `retreatId` (path): Retreat UUID
- `role` (query, optional): Filter by role name
- `status` (query, optional): Filter by status (active, pending, revoked)

**Response:**

```json
{
	"success": true,
	"data": {
		"users": [
			{
				"id": "user-uuid",
				"displayName": "John Doe",
				"email": "john@example.com",
				"role": "retreat_admin",
				"status": "active",
				"joinedAt": "2024-01-01T00:00:00Z",
				"expiresAt": null
			}
		],
		"total": 1
	}
}
```

**Required Permissions:** `retreat:read`

---

### GET /retreat-roles/:retreatId/users/:userId/permissions

Get user permissions for a specific retreat.

**Request Parameters:**

- `retreatId` (path): Retreat UUID
- `userId` (path): User UUID

**Response:**

```json
{
	"success": true,
	"data": {
		"permissions": ["retreat:read", "retreat:update", "participant:create", "participant:read"],
		"roles": ["retreat_admin"],
		"inheritedPermissions": ["audit:read"],
		"delegatedPermissions": ["participant:manage"]
	}
}
```

**Required Permissions:** `retreat:read` and same retreat access

---

## Permission Delegation

### POST /permission-delegations

Delegate permissions from one user to another.

**Request Body:**

```json
{
	"fromUserId": "uuid",
	"toUserId": "uuid",
	"retreatId": "uuid",
	"permissions": ["participant:create", "participant:update"],
	"expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"id": "delegation-uuid",
		"fromUserId": "user-1-uuid",
		"toUserId": "user-2-uuid",
		"retreatId": "retreat-uuid",
		"permissions": ["participant:create", "participant:update"],
		"status": "active",
		"createdAt": "2024-01-01T00:00:00Z",
		"expiresAt": "2024-12-31T23:59:59Z"
	}
}
```

**Required Permissions:** `permission:delegate`

---

### GET /permission-delegations/:retreatId

List active permission delegations for a retreat.

**Request Parameters:**

- `retreatId` (path): Retreat UUID

**Response:**

```json
{
	"success": true,
	"data": {
		"delegations": [
			{
				"id": "delegation-uuid",
				"fromUser": {
					"id": "user-1-uuid",
					"displayName": "Jane Doe"
				},
				"toUser": {
					"id": "user-2-uuid",
					"displayName": "John Smith"
				},
				"permissions": ["participant:create", "participant:update"],
				"expiresAt": "2024-12-31T23:59:59Z"
			}
		]
	}
}
```

**Required Permissions:** `permission:read`

---

### DELETE /permission-delegations/:delegationId

Revoke a permission delegation.

**Request Parameters:**

- `delegationId` (path): Delegation UUID

**Response:**

```json
{
	"success": true,
	"message": "Permission delegation revoked successfully"
}
```

**Required Permissions:** `permission:delegate` or delegation owner

---

## Audit Logging

### GET /audit/retreat/:retreatId

Get audit logs for a retreat.

**Request Parameters:**

- `retreatId` (path): Retreat UUID
- `actionType` (query, optional): Filter by action type
- `resourceType` (query, optional): Filter by resource type
- `targetUserId` (query, optional): Filter by target user
- `limit` (query, optional): Results per page (default: 50)
- `offset` (query, optional): Page offset (default: 0)
- `startDate` (query, optional): Start date filter
- `endDate` (query, optional): End date filter

**Response:**

```json
{
	"success": true,
	"data": {
		"logs": [
			{
				"id": "log-uuid",
				"user": {
					"id": "user-uuid",
					"displayName": "Admin User"
				},
				"actionType": "role_assigned",
				"resourceType": "user_retreat",
				"resourceId": "user-retreat-uuid",
				"targetUser": {
					"id": "target-uuid",
					"displayName": "John Doe"
				},
				"details": {
					"retreatId": "retreat-uuid",
					"oldRole": null,
					"newRole": "retreat_admin"
				},
				"timestamp": "2024-01-01T00:00:00Z",
				"ipAddress": "192.168.1.100"
			}
		],
		"total": 1,
		"limit": 50,
		"offset": 0,
		"hasMore": false
	}
}
```

**Required Permissions:** `audit:read` or retreat admin access

---

### GET /audit/user/:userId

Get audit logs for a specific user.

**Request Parameters:**

- `userId` (path): User UUID
- `retreatId` (query, optional): Filter by retreat
- `limit` (query, optional): Results per page (default: 50)
- `offset` (query, optional): Page offset (default: 0)

**Response:**

```json
{
	"success": true,
	"data": {
		"logs": [
			{
				"id": "log-uuid",
				"actionType": "role_assigned",
				"resourceType": "user_retreat",
				"details": {
					"retreatId": "retreat-uuid",
					"role": "retreat_admin"
				},
				"timestamp": "2024-01-01T00:00:00Z"
			}
		],
		"total": 1
	}
}
```

**Required Permissions:** `audit:read` or own user access

---

### GET /audit/retreat/:retreatId/stats

Get audit statistics for a retreat.

**Request Parameters:**

- `retreatId` (path): Retreat UUID
- `startDate` (query, optional): Start date for statistics
- `endDate` (query, optional): End date for statistics

**Response:**

```json
{
	"success": true,
	"data": {
		"totalActions": 150,
		"actionsByType": {
			"role_assigned": 45,
			"role_removed": 12,
			"permission_delegated": 8,
			"permission_revoked": 3
		},
		"actionsByResource": {
			"user_retreat": 68,
			"permission_delegation": 11
		},
		"topUsers": [
			{
				"userId": "user-uuid",
				"displayName": "Admin User",
				"actionCount": 42
			}
		],
		"recentActivity": [
			{
				"timestamp": "2024-01-01T12:00:00Z",
				"actionType": "role_assigned",
				"user": "Admin User"
			}
		]
	}
}
```

**Required Permissions:** `audit:read` or retreat admin access

---

## Role Requests

### POST /role-requests

Request a role for a retreat.

**Request Body:**

```json
{
	"retreatId": "uuid",
	"requestedRoleId": 1,
	"reason": "Need access to manage participants",
	"expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"id": "request-uuid",
		"userId": "user-uuid",
		"retreatId": "retreat-uuid",
		"requestedRoleId": 1,
		"status": "pending",
		"reason": "Need access to manage participants",
		"createdAt": "2024-01-01T00:00:00Z"
	}
}
```

**Required Permissions:** None (authenticated users)

---

### GET /role-requests/:retreatId

List role requests for a retreat.

**Request Parameters:**

- `retreatId` (path): Retreat UUID
- `status` (query, optional): Filter by status (pending, approved, rejected)

**Response:**

```json
{
	"success": true,
	"data": {
		"requests": [
			{
				"id": "request-uuid",
				"user": {
					"id": "user-uuid",
					"displayName": "John Doe",
					"email": "john@example.com"
				},
				"requestedRole": "retreat_manager",
				"status": "pending",
				"reason": "Need access to manage participants",
				"createdAt": "2024-01-01T00:00:00Z"
			}
		]
	}
}
```

**Required Permissions:** `retreat:manage`

---

### PUT /role-requests/:requestId

Approve or reject a role request.

**Request Parameters:**

- `requestId` (path): Request UUID

**Request Body:**

```json
{
	"status": "approved",
	"response": "Request approved. Welcome to the team!",
	"approvedRoleId": 1
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"id": "request-uuid",
		"status": "approved",
		"response": "Request approved. Welcome to the team!",
		"processedAt": "2024-01-01T00:00:00Z",
		"processedBy": "admin-uuid"
	}
}
```

**Required Permissions:** `retreat:manage`

---

## Permission Overrides

### POST /permission-overrides

Create a permission override for a user.

**Request Body:**

```json
{
	"userId": "uuid",
	"retreatId": "uuid",
	"permissions": ["participant:delete", "audit:read"],
	"reason": "Temporary additional access for event management",
	"expiresAt": "2024-12-31T23:59:59Z"
}
```

**Response:**

```json
{
	"success": true,
	"data": {
		"id": "override-uuid",
		"userId": "user-uuid",
		"retreatId": "retreat-uuid",
		"permissions": ["participant:delete", "audit:read"],
		"reason": "Temporary additional access for event management",
		"status": "active",
		"createdAt": "2024-01-01T00:00:00Z",
		"expiresAt": "2024-12-31T23:59:59Z"
	}
}
```

**Required Permissions:** `permission:override`

---

## Performance Endpoints

### GET /performance/cache-stats

Get cache performance statistics.

**Response:**

```json
{
	"success": true,
	"data": {
		"permissionCache": {
			"keys": 150,
			"hits": 1250,
			"misses": 150,
			"hitRate": 0.89
		},
		"userRetreatCache": {
			"keys": 80,
			"hits": 800,
			"misses": 100,
			"hitRate": 0.89
		},
		"retreatCache": {
			"keys": 25,
			"hits": 200,
			"misses": 30,
			"hitRate": 0.87
		},
		"metrics": {
			"cacheHitRate": 0.88,
			"totalQueries": 2530,
			"cacheHits": 2250,
			"cacheMisses": 280
		}
	}
}
```

**Required Permissions:** `performance:read`

---

### POST /performance/cache/clear

Clear all caches.

**Response:**

```json
{
	"success": true,
	"message": "All caches cleared successfully"
}
```

**Required Permissions:** `performance:manage`

---

## Error Codes

| Code                      | Description                       |
| ------------------------- | --------------------------------- |
| `UNAUTHORIZED`            | User not authenticated            |
| `FORBIDDEN`               | User lacks required permissions   |
| `RETREAT_NOT_FOUND`       | Retreat not found                 |
| `USER_NOT_FOUND`          | User not found                    |
| `ROLE_NOT_FOUND`          | Role not found                    |
| `INVALID_ROLE_ASSIGNMENT` | Invalid role assignment           |
| `DELEGATION_EXPIRED`      | Permission delegation has expired |
| `CACHE_ERROR`             | Cache operation failed            |

## HTTP Status Codes

- `200` - Success
- `201` - Created
- `400` - Bad Request
- `401` - Unauthorized
- `403` - Forbidden
- `404` - Not Found
- `500` - Internal Server Error

---

_This API reference covers all RBAC endpoints. For implementation examples and best practices, refer to the [Quick Start Guide](./RBAC_QUICKSTART.md) and [full documentation](./RBAC_DOCUMENTATION.md)._
