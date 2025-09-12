#!/usr/bin/env node

import { Command } from 'commander';
import { AppDataSource } from '../data-source';
import { MigrationManagerFactory } from '../database/migration-manager-factory';
import { DatabaseType } from '../database/types';
import 'dotenv/config';

const program = new Command();

program.name('migration').description('Database migration CLI').version('1.0.0');

// Create migration command
program
	.command('create')
	.description('Create a new migration file')
	.option('-n, --name <name>', 'Migration name', 'migration')
	.option('-t, --timestamp <timestamp>', 'Custom timestamp')
	.option('--dry-run', 'Dry run mode')
	.option('--db-type <type>', 'Database type (sqlite|postgresql)', process.env.DB_TYPE || 'sqlite')
	.action(async (options) => {
		try {
			const manager = await getMigrationManager(options.dbType);
			const fileName = await manager.createMigration({
				name: options.name,
				timestamp: options.timestamp,
				dryRun: options.dryRun,
			});

			console.log(`✅ Migration created: ${fileName}`);
		} catch (error) {
			console.error('❌ Failed to create migration:', error);
			process.exit(1);
		}
	});

// Run migrations command
program
	.command('run')
	.description('Run pending migrations')
	.option('-s, --step <number>', 'Number of migrations to run', parseInt)
	.option('--dry-run', 'Dry run mode')
	.option('--transaction', 'Use transactions')
	.option('-v, --verbose', 'Verbose output')
	.action(async (options) => {
		try {
			if (options.verbose) {
				console.log('🔄 Starting migration process...');
				console.log('📊 Initializing database connection...');
			}

			const manager = await getMigrationManager();

			if (options.verbose) {
				console.log('📋 Creating migrations table if not exists...');
			}

			// Ensure migrations table exists
			await manager.createMigrationsTable();

			if (options.verbose) {
				console.log('🚀 Running migrations...');
			}

			const results = await manager.runMigrations({
				step: options.step,
				dryRun: options.dryRun,
				transaction: options.transaction,
			});

			if (options.verbose && results.length === 0) {
				console.log('ℹ️  No pending migrations found.');
			}

			results.forEach((result) => {
				if (result.success) {
					console.log(`✅ ${result.message}`);
				} else {
					console.error(`❌ ${result.message}`);
					if (result.error) {
						console.error(result.error);
					}
				}
			});

			if (options.verbose) {
				console.log('🎉 Migration process completed.');
			}
		} catch (error) {
			console.error('❌ Failed to run migrations:', error);
			process.exit(1);
		}
	});

// Revert migrations command
program
	.command('revert')
	.description('Revert migrations')
	.option('-s, --step <number>', 'Number of migrations to revert', parseInt)
	.option('--dry-run', 'Dry run mode')
	.option('--transaction', 'Use transactions')
	.action(async (options) => {
		try {
			const manager = await getMigrationManager();

			const results = await manager.revertMigrations({
				step: options.step,
				dryRun: options.dryRun,
				transaction: options.transaction,
			});

			results.forEach((result) => {
				if (result.success) {
					console.log(`✅ ${result.message}`);
				} else {
					console.error(`❌ ${result.message}`);
					if (result.error) {
						console.error(result.error);
					}
				}
			});
		} catch (error) {
			console.error('❌ Failed to revert migrations:', error);
			process.exit(1);
		}
	});

// Show migrations command
program
	.command('show')
	.description('Show migration status')
	.option('-v, --verbose', 'Verbose output')
	.action(async (options) => {
		try {
			const manager = await getMigrationManager();

			const stats = await manager.showMigrations({
				verbose: options.verbose,
			});

			console.log(`📊 Migration Status:`);
			console.log(`   Total: ${stats.total}`);
			console.log(`   Executed: ${stats.executed}`);
			console.log(`   Pending: ${stats.pending}`);
			console.log();

			if (options.verbose) {
				console.log(`📋 Migration List:`);
				stats.migrations.forEach((migration) => {
					const status = migration.executedAt ? '✅' : '⏳';
					const executedAt = migration.executedAt
						? migration.executedAt.toISOString()
						: 'Not executed';
					const executionTime = migration.executionTime ? `${migration.executionTime}ms` : '-';
					console.log(`   ${status} ${migration.name} (${migration.timestamp})`);
					console.log(`      Executed: ${executedAt}`);
					console.log(`      Duration: ${executionTime}`);
					console.log();
				});
			}
		} catch (error) {
			console.error('❌ Failed to show migrations:', error);
			process.exit(1);
		}
	});

// Initialize migrations command
program
	.command('init')
	.description('Initialize migrations table')
	.action(async () => {
		try {
			const manager = await getMigrationManager();
			await manager.createMigrationsTable();
			console.log('✅ Migrations table initialized');
		} catch (error) {
			console.error('❌ Failed to initialize migrations:', error);
			process.exit(1);
		}
	});

async function getMigrationManager(dbType?: string) {
	const type = (dbType || process.env.DB_TYPE || 'sqlite') as DatabaseType;

	// Initialize data source if not already initialized
	if (!AppDataSource.isInitialized) {
		await AppDataSource.initialize();
	}

	return MigrationManagerFactory.create(AppDataSource, type);
}

program.parse(process.argv);
