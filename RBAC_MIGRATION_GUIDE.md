# RBAC Migration and Setup Guide

## Prerequisites

- Node.js 18+
- PostgreSQL 14+ or SQLite 3+
- pnpm package manager

## Installation

```bash
# Install dependencies
pnpm install

# Build all applications
pnpm build
```

## Database Setup

### 1. Database Migration

```bash
# Run all pending migrations
pnpm --filter api migration:run

# Check migration status
pnpm --filter api migration:show

# If you need to rollback (use with caution)
pnpm --filter api migration:revert
```

### 2. Database Seeding

```bash
# Seed initial data (roles, permissions, admin user)
pnpm --filter api db:seed

# Force re-seed (for development)
SEED_FORCE=true pnpm --filter api db:seed
```

## Migration Details

### New Tables Created

#### 1. `roles`

```sql
CREATE TABLE "roles" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "name" varchar NOT NULL,
  "description" varchar,
  "level" integer DEFAULT 0,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
);
```

#### 2. `permissions`

```sql
CREATE TABLE "permissions" (
  "id" integer PRIMARY KEY AUTOINCREMENT,
  "resource" varchar NOT NULL,
  "operation" varchar NOT NULL,
  "description" varchar,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now'))
);
```

#### 3. `role_permissions`

```sql
CREATE TABLE "role_permissions" (
  "role_id" integer NOT NULL,
  "permission_id" integer NOT NULL,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
  FOREIGN KEY("permission_id") REFERENCES "permissions"("id") ON DELETE CASCADE
);
```

#### 4. `user_roles`

```sql
CREATE TABLE "user_roles" (
  "user_id" uuid NOT NULL,
  "role_id" integer NOT NULL,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE CASCADE
);
```

#### 5. `user_retreats`

```sql
CREATE TABLE "user_retreats" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid NOT NULL,
  "retreat_id" uuid NOT NULL,
  "role_id" integer NOT NULL,
  "status" varchar NOT NULL DEFAULT 'active',
  "invited_by" uuid,
  "invited_at" datetime,
  "expires_at" datetime,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "updated_at" datetime NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY("retreat_id") REFERENCES "retreats"("id") ON DELETE CASCADE,
  FOREIGN KEY("role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
  FOREIGN KEY("invited_by") REFERENCES "users"("id") ON DELETE SET NULL
);
```

#### 6. `permission_delegations`

```sql
CREATE TABLE "permission_delegations" (
  "id" uuid PRIMARY KEY,
  "from_user_id" uuid NOT NULL,
  "to_user_id" uuid NOT NULL,
  "retreat_id" uuid NOT NULL,
  "permissions" text NOT NULL,
  "expires_at" datetime NOT NULL,
  "created_at" datetime NOT NULL DEFAULT (datetime('now')),
  "revoked_at" datetime,
  "revoked_by" uuid,
  "status" varchar NOT NULL DEFAULT 'active',
  FOREIGN KEY("from_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY("to_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  FOREIGN KEY("retreat_id") REFERENCES "retreats"("id") ON DELETE CASCADE,
  FOREIGN KEY("revoked_by") REFERENCES "users"("id") ON DELETE SET NULL
);
```

#### 7. `audit_logs`

```sql
CREATE TABLE "audit_logs" (
  "id" uuid PRIMARY KEY,
  "user_id" uuid,
  "action_type" varchar NOT NULL,
  "resource_type" varchar NOT NULL,
  "resource_id" varchar,
  "target_user_id" uuid,
  "details" text,
  "ip_address" varchar,
  "user_agent" varchar,
  "timestamp" datetime NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  FOREIGN KEY("target_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);
```

### Indexes Created

```sql
-- Performance indexes
CREATE INDEX "idx_user_retreat_composite" ON "user_retreats"("user_id", "retreat_id", "status");
CREATE INDEX "idx_role_permissions_composite" ON "role_permissions"("role_id", "permission_id");
CREATE INDEX "idx_retreat_users_status" ON "user_retreats"("retreat_id", "status");
CREATE INDEX "idx_user_retreats_created" ON "user_retreats"("created_at");

-- Audit log indexes
CREATE INDEX "idx_audit_logs_user" ON "audit_logs"("user_id");
CREATE INDEX "idx_audit_logs_action" ON "audit_logs"("action_type");
CREATE INDEX "idx_audit_logs_resource" ON "audit_logs"("resource_type");
CREATE INDEX "idx_audit_logs_timestamp" ON "audit_logs"("timestamp");

-- Permission delegation indexes
CREATE INDEX "idx_permission_delegations_from_user" ON "permission_delegations"("from_user_id");
CREATE INDEX "idx_permission_delegations_to_user" ON "permission_delegations"("to_user_id");
CREATE INDEX "idx_permission_delegations_retreat" ON "permission_delegations"("retreat_id");
CREATE INDEX "idx_permission_delegations_expires_at" ON "permission_delegations"("expires_at");
CREATE INDEX "idx_permission_delegations_status" ON "permission_delegations"("status");
```

## Initial Data Seeding

### Roles Created

1. **superadmin** (Level: 100) - Full system access
2. **admin** (Level: 90) - System administration
3. **retreat_admin** (Level: 80) - Retreat management
4. **retreat_manager** (Level: 70) - Retreat operations
5. **retreat_user** (Level: 60) - Basic retreat access
6. **tesorero** (Level: 65) - Financial management

### Permissions Created

#### System Permissions

- `users:create`, `users:read`, `users:update`, `users:delete`
- `roles:create`, `roles:read`, `roles:update`, `roles:delete`
- `permissions:create`, `permissions:read`, `permissions:update`, `permissions:delete`

#### Retreat Permissions

- `retreats:create`, `retreats:read`, `retreats:update`, `retreats:delete`, `retreats:manage`

#### Participant Permissions

- `participants:create`, `participants:read`, `participants:update`, `participants:delete`, `participants:manage`

#### Audit Permissions

- `audit:read`, `audit:manage`

#### Permission Management

- `permission:delegate`, `permission:override`, `permission:read`

#### Performance Permissions

- `performance:read`, `performance:manage`

### Role-Permission Mapping

#### superadmin

- All permissions (`*:*`)

#### admin

- System permissions (except user management)
- Full retreat and participant permissions
- Audit permissions

#### retreat_admin

- Full retreat permissions (for assigned retreats)
- Participant management permissions
- Audit read permissions

#### retreat_manager

- Retreat read/update permissions
- Full participant management
- Limited audit access

#### retreat_user

- Basic retreat and participant read access

#### tesorero

- Financial management permissions
- Retreat and participant read access
- Payment management

## Environment Configuration

Add these environment variables to your `.env` file:

```bash
# Performance Optimization
CACHE_TTL=300
CACHE_CHECK_PERIOD=60
MEMORY_THRESHOLD=80

# Security Settings
PERMISSION_DELEGATION_MAX_DAYS=30
ROLE_EXPIRATION_DAYS=365
SESSION_SECRET=your-secret-key-here

# Database (if using PostgreSQL)
DB_TYPE=postgres
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=your_username
DB_PASSWORD=your_password
DB_DATABASE=your_database
```

## Application Integration

### 1. Update Express App

```typescript
// src/index.ts
import {
	trackPerformance,
	optimizePermissionCheck,
	optimizeRetreatUserQuery,
	monitorMemory,
	optimizeDatabaseQueries,
} from './middleware/performanceMiddleware';

// Add performance middleware
app.use(trackPerformance);
app.use(optimizePermissionCheck);
app.use(optimizeRetreatUserQuery);
app.use(monitorMemory);
app.use(optimizeDatabaseQueries);
```

### 2. Initialize Services

```typescript
// src/index.ts
import { performanceOptimizationService } from './services/performanceOptimizationService';
import { roleCleanupService } from './services/roleCleanupService';

// Start background services
roleCleanupService.startScheduledTasks();
await performanceOptimizationService.optimizeHeavyQueries();
```

### 3. Update Route Protection

```typescript
// Example: Update existing routes
import { requireRetreatRole, requirePermission } from '../middleware/authorization';

// Before: Global role check
router.put('/retreats/:id', requireRole('admin'), retreatController.update);

// After: Retreat-specific role check
router.put('/retreats/:id', requireRetreatRole('retreat_admin'), retreatController.update);
```

## Testing the Migration

### 1. Verify Database Schema

```bash
# Check if all tables exist
sqlite3 database.db ".tables"

# Verify table schemas
sqlite3 database.db ".schema roles"
sqlite3 database.db ".schema user_retreats"
sqlite3 database.db ".schema audit_logs"
```

### 2. Test Basic Functionality

```typescript
// Test script to verify RBAC functionality
import { authorizationService } from '../src/middleware/authorization';

async function testRBAC() {
	// Test user role assignment
	await authorizationService.assignRetreatRole(
		'test-user-id',
		'test-retreat-id',
		3, // retreat_admin role
		'system',
	);

	// Test permission checking
	const hasAccess = await authorizationService.hasRetreatAccess('test-user-id', 'test-retreat-id');
	console.log('Retreat access:', hasAccess);

	// Test role checking
	const hasRole = await authorizationService.hasRetreatRole(
		'test-user-id',
		'test-retreat-id',
		'retreat_admin',
	);
	console.log('Retreat admin role:', hasRole);
}
```

### 3. Run Integration Tests

```bash
# Run RBAC integration tests
pnpm test rbac.integration.test.ts

# Run all tests
pnpm test
```

## Migration Troubleshooting

### Common Issues

#### 1. Migration Already Applied

```bash
# Check migration status
pnpm --filter api migration:show

# If migrations are already applied, they'll be skipped
```

#### 2. Database Connection Issues

```bash
# Verify database is running
# Check connection string in config
# Ensure proper permissions
```

#### 3. Permission Errors

```sql
-- If you get permission errors, manually run:
GRANT ALL PRIVILEGES ON DATABASE your_database TO your_user;
```

#### 4. Cache Issues

```typescript
// Clear caches if needed
import { performanceOptimizationService } from '../src/services/performanceOptimizationService';
performanceOptimizationService.clearAllCaches();
```

### Rolling Back Changes

```bash
# Rollback last migration
pnpm --filter api migration:revert

# Rollback multiple migrations (repeat as needed)
pnpm --filter api migration:revert
pnpm --filter api migration:revert
```

### Manual Database Cleanup

If you need to start fresh:

```sql
-- Drop all RBAC tables (SQLite)
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS permission_delegations;
DROP TABLE IF EXISTS user_retreats;
DROP TABLE IF EXISTS user_roles;
DROP TABLE IF EXISTS role_permissions;
DROP TABLE IF EXISTS permissions;
DROP TABLE IF EXISTS roles;

-- Reset migration table
DELETE FROMtypeorm_metadata WHERE type = 'migration';
```

## Performance Monitoring

### 1. Monitor Cache Performance

```typescript
// Check cache statistics
const stats = performanceOptimizationService.getCacheStats();
console.log('Cache performance:', stats);

// Monitor memory usage
const memory = await performanceOptimizationService.checkMemoryUsage();
console.log('Memory usage:', memory);
```

### 2. Audit Log Monitoring

```bash
# Check recent audit activity
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/audit/retreat/your-retreat-id?limit=10"

# Get audit statistics
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:3001/api/audit/retreat/your-retreat-id/stats"
```

## Next Steps

1. **Test Thoroughly**: Run all integration tests
2. **Monitor Performance**: Keep an eye on cache hit rates
3. **Audit Regularly**: Review audit logs for security monitoring
4. **Update UI**: Implement role management interface
5. **Document Processes**: Create internal documentation for your team

---

_This guide covers the complete RBAC migration process. For additional questions, refer to the [API Reference](./RBAC_API_REFERENCE.md) and [full documentation](./RBAC_DOCUMENTATION.md)._
