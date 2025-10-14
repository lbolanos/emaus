import { DataSource, QueryRunner as TypeORMQueryRunner } from 'typeorm';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import {
	DatabaseType,
	MigrationInfo,
	MigrationOptions,
	MigrationResult,
	MigrationStats,
	QueryRunner,
	ColumnDefinition,
	CreateOptions,
	RunOptions,
	RevertOptions,
	ShowOptions,
} from './types';

export abstract class BaseMigrationManager {
	protected dataSource: DataSource;
	protected dbType: DatabaseType;
	protected migrationsTable: string;
	protected migrationsPath: string;

	constructor(
		dataSource: DataSource,
		dbType: DatabaseType,
		migrationsTable: string = 'migrations',
		migrationsPath: string = './migrations',
	) {
		this.dataSource = dataSource;
		this.dbType = dbType;
		this.migrationsTable = migrationsTable;
		this.migrationsPath = migrationsPath;
	}

	abstract createQueryRunner(): QueryRunner;
	abstract escapeIdentifier(identifier: string): string;
	abstract escapeValue(value: any): string;
	abstract createMigrationsTable(): Promise<void>;
	abstract generateTimestamp(): string;

	async createMigration(options: CreateOptions = {}): Promise<string> {
		const timestamp = options.timestamp || this.generateTimestamp();
		const name = options.name || 'migration';
		const fileName = `${timestamp}_${name}.ts`;

		const template = `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${this.camelize(timestamp)}${this.camelize(name)} implements MigrationInterface {
    name = '${name}';
    timestamp = '${timestamp}';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Write your migration here
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Write your rollback migration here
    }
}
`;

		// In a real implementation, you would write this to a file
		console.log(`Migration file created: ${fileName}`);
		console.log(template);

		return fileName;
	}

	async runMigrations(options: RunOptions = {}): Promise<MigrationResult[]> {
		const results: MigrationResult[] = [];

		try {
			const pendingMigrations = await this.getPendingMigrations();

			if (pendingMigrations.length === 0) {
				return [
					{
						success: true,
						message: 'No pending migrations',
					},
				];
			}

			const limit = options.step || pendingMigrations.length;
			const migrationsToRun = pendingMigrations.slice(0, limit);

			for (const migration of migrationsToRun) {
				const result = await this.runMigration(migration, options);
				results.push(result);

				if (!result.success && options.transaction) {
					break;
				}
			}

			return results;
		} catch (error) {
			return [
				{
					success: false,
					message: 'Failed to run migrations',
					error: error as Error,
				},
			];
		}
	}

	async revertMigrations(options: RevertOptions = {}): Promise<MigrationResult[]> {
		const results: MigrationResult[] = [];

		try {
			const executedMigrations = await this.getExecutedMigrations();

			if (executedMigrations.length === 0) {
				return [
					{
						success: true,
						message: 'No migrations to revert',
					},
				];
			}

			const limit = options.step || 1;
			const migrationsToRevert = executedMigrations.slice(-limit);

			for (const migration of migrationsToRevert.reverse()) {
				const result = await this.revertMigration(migration, options);
				results.push(result);

				if (!result.success && options.transaction) {
					break;
				}
			}

			return results;
		} catch (error) {
			return [
				{
					success: false,
					message: 'Failed to revert migrations',
					error: error as Error,
				},
			];
		}
	}

	async showMigrations(options: ShowOptions = {}): Promise<MigrationStats> {
		const allMigrations = await this.getAllMigrations();
		const executedMigrations = await this.getExecutedMigrations();

		const stats: MigrationStats = {
			total: allMigrations.length,
			executed: executedMigrations.length,
			pending: allMigrations.length - executedMigrations.length,
			migrations: allMigrations.map((migration) => {
				const executed = executedMigrations.find((em) => em.name === migration.name);
				return {
					...migration,
					executedAt: executed?.executedAt,
					executionTime: executed?.executionTime,
				};
			}),
		};

		return stats;
	}

	protected async runMigration(
		migration: MigrationInfo,
		options: RunOptions,
	): Promise<MigrationResult> {
		const startTime = Date.now();

		try {
			if (!options.dryRun) {
				const queryRunner = this.createQueryRunner();

				if (options.transaction) {
					await queryRunner.beginTransaction();
				}

				try {
					// Load and execute migration
					console.log(`🔄 Running migration: ${migration.name}`);
					const migrationClass = await this.loadMigration(migration.name);
					await migrationClass.up(queryRunner);
					console.log(`✅ Migration ${migration.name} up() method completed`);

					// Record migration
					await this.recordMigration({
						...migration,
						executedAt: new Date(),
						executionTime: Date.now() - startTime,
					});

					if (options.transaction) {
						await queryRunner.commitTransaction();
					}

					return {
						success: true,
						message: `Migration ${migration.name} executed successfully`,
						executionTime: Date.now() - startTime,
					};
				} catch (error) {
					if (options.transaction) {
						await queryRunner.rollbackTransaction();
					}
					throw error;
				}
			}

			return {
				success: true,
				message: `Migration ${migration.name} would be executed (dry run)`,
				executionTime: Date.now() - startTime,
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to run migration ${migration.name}`,
				error: error as Error,
			};
		}
	}

	protected async revertMigration(
		migration: MigrationInfo,
		options: RevertOptions,
	): Promise<MigrationResult> {
		const startTime = Date.now();

		try {
			if (!options.dryRun) {
				const queryRunner = this.createQueryRunner();

				if (options.transaction) {
					await queryRunner.beginTransaction();
				}

				try {
					// Load and execute migration down
					const migrationClass = await this.loadMigration(migration.name);
					if (migrationClass.down) {
						await migrationClass.down(queryRunner);
					}

					// Remove migration record
					await this.removeMigrationRecord(migration.name);

					if (options.transaction) {
						await queryRunner.commitTransaction();
					}

					return {
						success: true,
						message: `Migration ${migration.name} reverted successfully`,
						executionTime: Date.now() - startTime,
					};
				} catch (error) {
					if (options.transaction) {
						await queryRunner.rollbackTransaction();
					}
					throw error;
				}
			}

			return {
				success: true,
				message: `Migration ${migration.name} would be reverted (dry run)`,
				executionTime: Date.now() - startTime,
			};
		} catch (error) {
			return {
				success: false,
				message: `Failed to revert migration ${migration.name}`,
				error: error as Error,
			};
		}
	}

	protected async getPendingMigrations(): Promise<MigrationInfo[]> {
		const allMigrations = await this.getAllMigrations();
		const executedMigrations = await this.getExecutedMigrations();

		const executedNames = executedMigrations.map((m) => m.name);
		return allMigrations.filter((m) => !executedNames.includes(m.name));
	}

	protected async getExecutedMigrations(): Promise<MigrationInfo[]> {
		const queryRunner = this.createQueryRunner();

		if (!(await queryRunner.tableExists(this.migrationsTable))) {
			return [];
		}

		const sql = `SELECT name, timestamp, executed_at, execution_time FROM ${this.escapeIdentifier(this.migrationsTable)} ORDER BY timestamp ASC`;
		const results = await queryRunner.query(sql);

		return results.map((row: any) => ({
			name: row.name,
			timestamp: row.timestamp,
			executedAt: new Date(row.executed_at),
			executionTime: row.execution_time,
		}));
	}

	protected async getAllMigrations(): Promise<MigrationInfo[]> {
		try {
			const isProd = __filename.includes('/dist/');
			const fileExtension = isProd ? '.js' : '.ts';
			const migrationsDir = isProd
				? this.migrationsPath.replace('/src/', '/dist/')
				: this.migrationsPath;

			const absolutePath = path.resolve(process.cwd(), migrationsDir);
			if (!fs.existsSync(absolutePath)) {
				console.warn(`Migrations directory not found: ${absolutePath}`);
				return [];
			}

			const migrationFiles = fs
				.readdirSync(absolutePath)
				.filter((file: string) => file.endsWith(fileExtension))
				.sort();

			const migrations: MigrationInfo[] = [];
			const matchRegex = new RegExp(`(\\d{14})_(.+)\\${fileExtension}$`);

			for (const file of migrationFiles) {
				const filePath = path.join(absolutePath, file);
				const match = file.match(matchRegex);

				if (match) {
					const [, timestamp, name] = match;
					migrations.push({
						name: name.replace(/_/g, ' '),
						timestamp,
						fileName: file,
						filePath,
					});
				}
			}

			return migrations;
		} catch (error) {
			console.warn(`Could not read migrations directory: ${(error as Error).message}`);
			return [];
		}
	}

	protected async recordMigration(migration: MigrationInfo): Promise<void> {
		const queryRunner = this.createQueryRunner();
		const sql = `
      INSERT INTO ${this.escapeIdentifier(this.migrationsTable)} 
      (name, timestamp, executed_at, execution_time) 
      VALUES (${this.escapeValue(migration.name)}, ${this.escapeValue(migration.timestamp)}, ${this.escapeValue(migration.executedAt)}, ${this.escapeValue(migration.executionTime)})
    `;
		await queryRunner.execute(sql);
	}

	protected async removeMigrationRecord(name: string): Promise<void> {
		const queryRunner = this.createQueryRunner();
		const sql = `DELETE FROM ${this.escapeIdentifier(this.migrationsTable)} WHERE name = ${this.escapeValue(name)}`;
		await queryRunner.execute(sql);
	}

	protected async loadMigration(name: string): Promise<any> {
		// Find the migration file
		const migrationFiles = await this.getAllMigrations();
		const migrationFile = migrationFiles.find((m) => m.name === name);

		if (!migrationFile) {
			throw new Error(`Migration file not found: ${name}`);
		}

		// Dynamic import to load the migration class
		if (!migrationFile.filePath) {
			throw new Error(`Migration file path not found: ${name}`);
		}

		const migration = await import(migrationFile.filePath);

		// Get the class name from the file
		const className = this.getMigrationClassName(name, migrationFile.timestamp);

		if (!migration[className]) {
			throw new Error(
				`Migration class ${className} not found in file ${migrationFile.fileName || name}`,
			);
		}

		const MigrationClass = migration[className];
		const migrationInstance = new MigrationClass();
		return migrationInstance;
	}

	private getMigrationClassName(name: string, timestamp: string): string {
		return this.camelize(name) + timestamp;
	}

	protected camelize(str: string): string {
		return str
			.replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => {
				return word.toUpperCase();
			})
			.replace(/\s+/g, '');
	}
}
