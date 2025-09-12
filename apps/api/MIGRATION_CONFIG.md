# Migration Verification Configuration

The migration verification system automatically checks for pending migrations when the application starts up. This ensures your database schema is always up to date.

## Environment Variables

### Migration Verification Settings

| Variable                         | Default | Description                                                 |
| -------------------------------- | ------- | ----------------------------------------------------------- |
| `MIGRATION_AUTO_RUN`             | `false` | Automatically run pending migrations on startup             |
| `MIGRATION_WARN_ONLY`            | `false` | Only warn about pending migrations, don't stop application  |
| `MIGRATION_DRY_RUN`              | `false` | Show what migrations would be executed without running them |
| `MIGRATION_LOG_LEVEL`            | `info`  | Logging level: `error`, `warn`, `info`, `debug`             |
| `MIGRATION_MAX_PENDING`          | `10`    | Maximum allowed pending migrations before failing           |
| `MIGRATION_IGNORE_MISSING_TABLE` | `false` | Ignore missing migrations table (useful for first run)      |

### Seed Data Settings

| Variable                    | Default             | Description                                              |
| --------------------------- | ------------------- | -------------------------------------------------------- |
| `SEED_AUTO_RUN`             | `false`             | Automatically run seed migration on startup              |
| `SEED_DRY_RUN`              | `false`             | Show what seed data would be created without creating it |
| `SEED_FORCE`                | `false`             | Force update existing seed data (use with caution)       |
| `SEED_MASTER_USER_EMAIL`    | `admin@example.com` | Email for master user account                            |
| `SEED_MASTER_USER_NAME`     | `Administrator`     | Display name for master user account                     |
| `SEED_MASTER_USER_PASSWORD` | `password`          | Password for master user account                         |

### Database Type

| Variable  | Default  | Description                             |
| --------- | -------- | --------------------------------------- |
| `DB_TYPE` | `sqlite` | Database type: `sqlite` or `postgresql` |

## Configuration Examples

### Development Environment

```bash
# .env.development
DB_TYPE=sqlite
MIGRATION_AUTO_RUN=true
MIGRATION_WARN_ONLY=false
MIGRATION_DRY_RUN=false
MIGRATION_LOG_LEVEL=debug
MIGRATION_MAX_PENDING=10
SEED_AUTO_RUN=true
SEED_DRY_RUN=false
SEED_FORCE=false
SEED_MASTER_USER_PASSWORD=your_secure_password_here
```

### Production Environment

```bash
# .env.production
DB_TYPE=postgresql
MIGRATION_AUTO_RUN=false
MIGRATION_WARN_ONLY=true
MIGRATION_DRY_RUN=false
MIGRATION_LOG_LEVEL=warn
MIGRATION_MAX_PENDING=5
```

### Testing Environment

```bash
# .env.test
DB_TYPE=sqlite
MIGRATION_AUTO_RUN=true
MIGRATION_WARN_ONLY=false
MIGRATION_DRY_RUN=true
MIGRATION_IGNORE_MISSING_TABLE=true
SEED_AUTO_RUN=true
SEED_DRY_RUN=true
SEED_FORCE=false
SEED_MASTER_USER_PASSWORD=test_password_here
```

## Migration Verification Behavior

### When Migrations and Seed Data Are Up to Date

```
✅ Data Source has been initialized!
✅ All migrations and seed data are up to date
Server is running on http://localhost:3001
```

### When Pending Migrations Exist (Auto-run enabled)

```
✅ Data Source has been initialized!
⚠️  2 pending migrations found
📋 Migration Actions:
   ✅ AddUserProfileTable (125ms)
   ✅ CreateParticipantsTable (89ms)
   ✅ SeedInitialData (45ms)
✅ Pending migrations have been executed
✅ Seed data has been applied
Server is running on http://localhost:3001
```

### When Pending Migrations Exist (Warn-only mode)

```
✅ Data Source has been initialized!
⚠️  2 pending migrations found
⚠️  Pending migrations detected (auto-run disabled)
Server is running on http://localhost:3001
```

### When Too Many Pending Migrations

```
✅ Data Source has been initialized!
❌ Migration Errors:
   Too many pending migrations (15). Maximum allowed: 10
❌ Migration verification failed. Please run migrations manually or fix the issues.
```

## Best Practices

### Development

- Enable `MIGRATION_AUTO_RUN=true` for automatic migration execution
- Use `MIGRATION_LOG_LEVEL=debug` for detailed logging
- Set `MIGRATION_DRY_RUN=true` to test migrations without executing them

### Production

- Set `MIGRATION_AUTO_RUN=false` for safety
- Use `MIGRATION_WARN_ONLY=true` to avoid stopping the application
- Set a low `MIGRATION_MAX_PENDING` value (3-5) to catch issues early
- Monitor logs for migration warnings

### Testing

- Use `MIGRATION_DRY_RUN=true` to test migration logic
- Set `MIGRATION_IGNORE_MISSING_TABLE=true` for fresh databases
- Enable `MIGRATION_AUTO_RUN=true` for automated test environments

## Migration Table Creation

The system automatically creates the migrations table if it doesn't exist (unless `MIGRATION_IGNORE_MISSING_TABLE=true`). The table tracks:

- Migration name and timestamp
- Execution time
- When the migration was executed

## Error Handling

The verification system handles various error scenarios:

1. **Missing migrations table**: Automatically created (unless ignored)
2. **Pending migrations**: Logged, optionally executed, or cause application to stop
3. **Failed migrations**: Logged and cause application to stop (unless warn-only)
4. **Database connection errors**: Logged and cause application to stop

## Integration with CI/CD

### GitHub Actions Example

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: pnpm install

      - name: Run migrations
        run: pnpm migration:run
        env:
          DB_TYPE: postgresql
          MIGRATION_AUTO_RUN: true

      - name: Start application
        run: pnpm start
        env:
          DB_TYPE: postgresql
          MIGRATION_AUTO_RUN: false
          MIGRATION_WARN_ONLY: true
```

## Monitoring

### Health Check Endpoint

You can add a health check endpoint to monitor migration status:

```typescript
app.get('/health', (req, res) => {
	// Check migration status here
	res.json({
		status: 'healthy',
		migrations: {
			upToDate: true,
			lastChecked: new Date().toISOString(),
		},
	});
});
```

### Logging Configuration

The migration verification logs can be integrated with your existing logging system:

- Use `MIGRATION_LOG_LEVEL=warn` in production to reduce noise
- Set `MIGRATION_LOG_LEVEL=debug` during development for troubleshooting
- Configure log aggregation to capture migration events
