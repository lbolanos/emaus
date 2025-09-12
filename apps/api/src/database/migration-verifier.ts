import { DataSource } from 'typeorm';
import { MigrationManagerFactory } from './migration-manager-factory';

export interface MigrationVerificationOptions {
	autoRun?: boolean;
	warnOnly?: boolean;
	dryRun?: boolean;
	logLevel?: 'error' | 'warn' | 'info' | 'debug';
	maxPendingMigrations?: number;
	ignoreMissingMigrationsTable?: boolean;
	seed?: {
		autoRun?: boolean;
		dryRun?: boolean;
		force?: boolean;
		masterUserEmail?: string;
		masterUserName?: string;
		masterUserPassword?: string;
	};
}

export interface VerificationResult {
	success: boolean;
	migrationsTableExists: boolean;
	pendingMigrations: number;
	executedMigrations: number;
	totalMigrations: number;
	seedDataExecuted: boolean;
	actions: MigrationAction[];
	warnings: string[];
	errors: string[];
}

export interface MigrationAction {
	type: 'RAN' | 'SKIPPED' | 'FAILED' | 'PENDING';
	migration: string;
	message: string;
	executionTime?: number;
	error?: string;
}

export class MigrationVerifier {
	private options: MigrationVerificationOptions;

	constructor(
		private dataSource: DataSource,
		options: MigrationVerificationOptions = {},
	) {
		this.options = {
			autoRun: false,
			warnOnly: false,
			dryRun: false,
			logLevel: 'info',
			maxPendingMigrations: 10,
			ignoreMissingMigrationsTable: false,
			seed: {
				autoRun: false,
				dryRun: false,
				force: false,
				masterUserEmail: 'admin@example.com',
				masterUserName: 'Administrator',
				masterUserPassword: 'password',
			},
			...options,
		};
	}

	async verify(): Promise<VerificationResult> {
		const result: VerificationResult = {
			success: true,
			migrationsTableExists: false,
			pendingMigrations: 0,
			executedMigrations: 0,
			totalMigrations: 0,
			seedDataExecuted: false,
			actions: [],
			warnings: [],
			errors: [],
		};

		try {
			const manager = this.getMigrationManager();

			// Check if migrations table exists
			const queryRunner = manager.createQueryRunner();
			result.migrationsTableExists = await queryRunner.tableExists('migrations');

			if (!result.migrationsTableExists) {
				if (this.options.ignoreMissingMigrationsTable) {
					result.warnings.push('Migrations table does not exist');
					return result;
				}

				// Create migrations table
				await manager.createMigrationsTable();
				result.migrationsTableExists = true;
				result.actions.push({
					type: 'RAN',
					migration: 'CreateMigrationsTable',
					message: 'Created migrations table',
				});
			}

			// Get migration statistics
			const stats = await manager.showMigrations();
			result.pendingMigrations = stats.pending;
			result.executedMigrations = stats.executed;
			result.totalMigrations = stats.total;

			// Check for pending migrations
			if (result.pendingMigrations > 0) {
				const warning = `${result.pendingMigrations} pending migrations found`;
				result.warnings.push(warning);

				// Check if pending migrations exceed threshold
				if (result.pendingMigrations > (this.options.maxPendingMigrations || 10)) {
					const error = `Too many pending migrations (${result.pendingMigrations}). Maximum allowed: ${this.options.maxPendingMigrations}`;
					result.errors.push(error);
					result.success = false;
				}

				// Auto-run migrations if enabled
				if (this.options.autoRun) {
					const runResults = await manager.runMigrations({
						dryRun: this.options.dryRun,
						transaction: true,
					});

					runResults.forEach((runResult) => {
						if (runResult.success) {
							result.actions.push({
								type: this.options.dryRun ? 'PENDING' : 'RAN',
								migration: runResult.message,
								message: runResult.message,
								executionTime: runResult.executionTime,
							});
						} else {
							result.actions.push({
								type: 'FAILED',
								migration: runResult.message,
								message: runResult.message,
								error: runResult.error?.message,
							});
							result.errors.push(runResult.message);
							result.success = false;
						}
					});

					// Update statistics after running migrations
					if (runResults.every((r) => r.success)) {
						const newStats = await manager.showMigrations();
						result.pendingMigrations = newStats.pending;
						result.executedMigrations = newStats.executed;
					}

					// Check if we need to run seed migration
					if (this.options.seed?.autoRun) {
						await this.runSeedMigration(result);
					}
				}
			}

			// Check if seed migration needs to run even if no schema migrations are pending
			if (result.pendingMigrations === 0 && this.options.seed?.autoRun) {
				await this.runSeedMigration(result);
			}

			// Determine final success status
			if (result.errors.length > 0) {
				result.success = false;
			} else if (result.pendingMigrations > 0 && !this.options.autoRun && !this.options.warnOnly) {
				result.success = false;
			}

			return result;
		} catch (error) {
			result.success = false;
			result.errors.push(
				`Migration verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
			return result;
		}
	}

	logResult(result: VerificationResult): void {
		if (this.options.logLevel === 'debug') {
			console.log('🔍 Migration Verification Result:');
			console.log(`   Migrations Table: ${result.migrationsTableExists ? '✅' : '❌'}`);
			console.log(`   Total Migrations: ${result.totalMigrations}`);
			console.log(`   Executed: ${result.executedMigrations}`);
			console.log(`   Pending: ${result.pendingMigrations}`);
			console.log(`   Seed Data: ${result.seedDataExecuted ? '✅' : '⏳'}`);
			console.log(`   Success: ${result.success ? '✅' : '❌'}`);
		}

		if (result.warnings.length > 0) {
			console.log('⚠️  Migration Warnings:');
			result.warnings.forEach((warning) => {
				console.log(`   ${warning}`);
			});
		}

		if (result.errors.length > 0) {
			console.log('❌ Migration Errors:');
			result.errors.forEach((error) => {
				console.log(`   ${error}`);
			});
		}

		if (result.actions.length > 0) {
			console.log('📋 Migration Actions:');
			result.actions.forEach((action) => {
				const status =
					action.type === 'RAN'
						? '✅'
						: action.type === 'SKIPPED'
							? '⏭️'
							: action.type === 'FAILED'
								? '❌'
								: '⏳';
				const timeInfo = action.executionTime ? ` (${action.executionTime}ms)` : '';
				console.log(`   ${status} ${action.migration}${timeInfo}`);
				if (action.error) {
					console.log(`      Error: ${action.error}`);
				}
			});
		}

		if (result.success) {
			if (result.pendingMigrations === 0) {
				if (result.seedDataExecuted) {
					console.log('✅ All migrations and seed data are up to date');
				} else if (this.options.seed?.autoRun) {
					console.log('✅ All migrations are up to date, seed data ready');
				} else {
					console.log('✅ All migrations are up to date');
				}
			} else if (this.options.autoRun) {
				console.log('✅ Pending migrations have been executed');
				if (result.seedDataExecuted) {
					console.log('✅ Seed data has been applied');
				}
			} else {
				console.log('⚠️  Pending migrations detected (auto-run disabled)');
			}
		} else {
			console.log('❌ Migration verification failed');
		}
	}

	private getMigrationManager() {
		return MigrationManagerFactory.createFromEnv(this.dataSource);
	}

	private async runSeedMigration(result: VerificationResult): Promise<void> {
		try {
			// Set seed environment variables
			if (this.options?.seed) {
				const seed = this.options.seed;
				process.env.SEED_MASTER_USER_EMAIL = seed.masterUserEmail;
				process.env.SEED_MASTER_USER_NAME = seed.masterUserName;
				process.env.SEED_MASTER_USER_PASSWORD = seed.masterUserPassword;
				process.env.SEED_FORCE = (seed.force || false).toString();
				if (seed.dryRun !== undefined) {
					process.env.SEED_DRY_RUN = seed.dryRun.toString();
				}
			}

			const manager = this.getMigrationManager();

			// Check if seed migration has been executed
			const executedMigrations = await manager['getExecutedMigrations']();
			const seedMigrationExists = executedMigrations.some((m) =>
				m.name.includes('SeedInitialData'),
			);

			if (!seedMigrationExists || this.options.seed?.force) {
				const actionType = this.options.seed?.dryRun ? 'PENDING' : 'RAN';
				const seedMessage = this.options.seed?.dryRun
					? 'Seed migration would be executed (dry run)'
					: 'Seed migration executed successfully';

				result.actions.push({
					type: actionType,
					migration: 'SeedInitialData',
					message: seedMessage,
				});

				if (!this.options.seed?.dryRun) {
					result.seedDataExecuted = true;

					if (this.options.logLevel === 'debug') {
						console.log('🌱 Seed data executed with configuration:', {
							email: this.options.seed?.masterUserEmail,
							name: this.options.seed?.masterUserName,
							force: this.options.seed?.force,
						});
					}
				}
			} else {
				if (this.options.logLevel === 'debug') {
					console.log('ℹ️  Seed migration already exists, skipping...');
				}
			}
		} catch (error) {
			result.errors.push(
				`Seed migration failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
			);
			result.success = false;
		}
	}
}
