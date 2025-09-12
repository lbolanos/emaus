import { DataSource } from 'typeorm';
import { SqliteMigrationManager } from './sqlite-migration-manager';
import { PostgresMigrationManager } from './postgres-migration-manager';
import { DatabaseType } from './types';

export interface MigrationManagerFactoryOptions {
	migrationsTable?: string;
	migrationsPath?: string;
}

export class MigrationManagerFactory {
	static create(
		dataSource: DataSource,
		dbType: DatabaseType,
		options: MigrationManagerFactoryOptions = {},
	) {
		const { migrationsTable = 'migrations', migrationsPath } = options;

		switch (dbType) {
			case 'sqlite':
				return new SqliteMigrationManager(
					dataSource,
					migrationsTable,
					migrationsPath || './src/migrations/sqlite',
				);
			case 'postgresql':
				return new PostgresMigrationManager(
					dataSource,
					migrationsTable,
					migrationsPath || './src/migrations/postgresql',
				);
			default:
				throw new Error(`Unsupported database type: ${dbType}`);
		}
	}

	static createFromEnv(dataSource: DataSource, options: MigrationManagerFactoryOptions = {}) {
		const dbType = (process.env.DB_TYPE || 'sqlite') as DatabaseType;
		return this.create(dataSource, dbType, options);
	}
}
