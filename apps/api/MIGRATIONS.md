# Database Migration System

## Overview

This project now includes a comprehensive database migration system that supports both SQLite and PostgreSQL databases. The migration system provides version control for database schema changes, allowing for safe deployment across environments.

## Features

- **Multi-Database Support**: SQLite and PostgreSQL
- **Migration Tracking**: Automatic tracking of executed migrations
- **CLI Commands**: Easy-to-use command-line interface
- **Transaction Support**: Optional transaction-based migrations
- **Dry Run Mode**: Test migrations without executing them
- **Rollback Support**: Revert migrations when needed

## Database Types

The system supports two database types:

- `sqlite` - For development and local testing
- `postgresql` - For production environments

## Migration CLI Commands

### Create a new migration

```bash
# Create a new migration with default name
pnpm migration:create

# Create a migration with a specific name
pnpm migration:create --name "AddNewFeature"

# Create a migration with custom timestamp (for testing)
pnpm migration:create --name "AddNewFeature" --timestamp "20240910120000"
```

### Run pending migrations

```bash
# Run all pending migrations
pnpm migration:run

# Run a specific number of migrations
pnpm migration:run --step 2

# Dry run (show what would be executed)
pnpm migration:run --dry-run

# Run with transactions
pnpm migration:run --transaction
```

### Revert migrations

```bash
# Revert the last migration
pnpm migration:revert

# Revert multiple migrations
pnpm migration:revert --step 2

# Dry run
pnpm migration:revert --dry-run

# Revert with transactions
pnpm migration:revert --transaction
```

### Show migration status

```bash
# Show basic migration status
pnpm migration:show

# Show detailed migration information
pnpm migration:show --verbose
```

### Initialize migrations table

```bash
# Create the migrations tracking table
pnpm migration:init
```

## Migration File Structure

Migrations are stored in `src/migrations/` directory with the naming convention:
`{timestamp}_{description}.ts`

Example migration file:

```typescript
import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsersTable20240910120000 implements MigrationInterface {
	name = 'CreateUsersTable';
	timestamp = '20240910120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
            CREATE TABLE "users" (
                "id" INTEGER PRIMARY KEY AUTOINCREMENT,
                "email" VARCHAR(255) NOT NULL,
                "password" VARCHAR(255) NOT NULL,
                "created_at" DATETIME NOT NULL DEFAULT (datetime('now'))
            )
        `);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP TABLE "users"`);
	}
}
```

## Database Configuration

The migration system automatically detects the database type from the environment variable `DB_TYPE` or defaults to `sqlite`.

### SQLite Configuration

```typescript
// src/data-source.ts
export const AppDataSource = new DataSource({
	type: 'sqlite',
	database: 'database.sqlite',
	synchronize: false, // Disable synchronize when using migrations
	entities: [
		/* ... */
	],
	migrations: [
		/* ... */
	],
});
```

### PostgreSQL Configuration

```typescript
// src/data-source.ts
export const AppDataSource = new DataSource({
	type: 'postgres',
	host: process.env.DB_HOST || 'localhost',
	port: parseInt(process.env.DB_PORT || '5432'),
	username: process.env.DB_USERNAME || 'postgres',
	password: process.env.DB_PASSWORD || 'password',
	database: process.env.DB_DATABASE || 'emaus',
	synchronize: false, // Disable synchronize when using migrations
	entities: [
		/* ... */
	],
	migrations: [
		/* ... */
	],
});
```

## Migration Best Practices

1. **Always test migrations in development first**
2. **Use descriptive migration names**
3. **Keep migrations focused and atomic**
4. **Always implement both `up` and `down` methods**
5. **Use transactions for complex migrations**
6. **Back up production databases before running migrations**
7. **Test rollback procedures**

## Database-Specific Considerations

### SQLite Limitations

- No direct `DROP COLUMN` support (requires table recreation)
- No direct `RENAME COLUMN` support (requires table recreation)
- Limited ALTER TABLE capabilities

### PostgreSQL Features

- Full ALTER TABLE support
- Advanced data types
- Better performance for large datasets
- Native transaction support

## Migration Tracking

The system creates a `migrations` table to track executed migrations:

- `id` - Primary key
- `name` - Migration name
- `timestamp` - Migration timestamp
- `executed_at` - When the migration was executed
- `execution_time` - How long the migration took

## Error Handling

The migration system includes comprehensive error handling:

- Failed migrations are logged with detailed error messages
- Transactions can be rolled back on failure
- Migration state is maintained even if errors occur
- Dry run mode helps catch issues before execution

## Integration with Existing Code

The migration system is designed to work alongside existing TypeORM entities:

1. Disable `synchronize: true` in your DataSource configuration
2. Use migrations for all schema changes
3. Keep your entity definitions up to date
4. Run migrations during deployment
