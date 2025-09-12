import { DataSource } from 'typeorm';
import { BaseMigrationManager } from './base-migration-manager';
import { DatabaseType, QueryRunner, ColumnDefinition } from './types';

export class SqliteMigrationManager extends BaseMigrationManager {
	constructor(
		dataSource: DataSource,
		migrationsTable: string = 'migrations',
		migrationsPath: string = './src/migrations/sqlite',
	) {
		super(dataSource, 'sqlite', migrationsTable, migrationsPath);
	}

	createQueryRunner(): QueryRunner {
		return new SqliteQueryRunner(this.dataSource);
	}

	escapeIdentifier(identifier: string): string {
		return `"${identifier}"`;
	}

	escapeValue(value: any): string {
		if (value === null || value === undefined) {
			return 'NULL';
		}
		if (typeof value === 'string') {
			return `'${value.replace(/'/g, "''")}'`;
		}
		if (typeof value === 'boolean') {
			return value ? '1' : '0';
		}
		if (value instanceof Date) {
			return `'${value.toISOString()}'`;
		}
		return String(value);
	}

	async createMigrationsTable(): Promise<void> {
		const queryRunner = this.createQueryRunner();

		if (!(await queryRunner.tableExists(this.migrationsTable))) {
			const sql = `
        CREATE TABLE ${this.escapeIdentifier(this.migrationsTable)} (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name VARCHAR(255) NOT NULL,
          timestamp VARCHAR(14) NOT NULL,
          executed_at DATETIME NOT NULL,
          execution_time INTEGER NOT NULL,
          UNIQUE(name, timestamp)
        )
      `;
			await queryRunner.execute(sql);
		}
	}

	generateTimestamp(): string {
		const now = new Date();
		return (
			now.getFullYear().toString() +
			String(now.getMonth() + 1).padStart(2, '0') +
			String(now.getDate()).padStart(2, '0') +
			String(now.getHours()).padStart(2, '0') +
			String(now.getMinutes()).padStart(2, '0') +
			String(now.getSeconds()).padStart(2, '0')
		);
	}
}

class SqliteQueryRunner implements QueryRunner {
	private queryRunner: any;

	constructor(private dataSource: DataSource) {
		this.queryRunner = dataSource.createQueryRunner();
	}

	async query(sql: string, params: any[] = []): Promise<any> {
		return this.queryRunner.query(sql, params);
	}

	async execute(sql: string, params: any[] = []): Promise<void> {
		await this.queryRunner.query(sql, params);
	}

	async beginTransaction(): Promise<void> {
		await this.queryRunner.query('BEGIN TRANSACTION');
	}

	async commitTransaction(): Promise<void> {
		await this.queryRunner.query('COMMIT');
	}

	async rollbackTransaction(): Promise<void> {
		await this.queryRunner.query('ROLLBACK');
	}

	async tableExists(tableName: string): Promise<boolean> {
		const sql = `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name='${tableName}'
    `;
		const result = await this.query(sql);
		return result.length > 0;
	}

	async columnExists(tableName: string, columnName: string): Promise<boolean> {
		const sql = `
      PRAGMA table_info(${tableName})
    `;
		const columns = await this.query(sql);
		return columns.some((col: any) => col.name === columnName);
	}

	async createTable(tableName: string, columns: ColumnDefinition[]): Promise<void> {
		const columnDefs = columns.map((col) => this.getColumnDefinition(col)).join(', ');
		const sql = `CREATE TABLE ${this.escapeIdentifier(tableName)} (${columnDefs})`;
		await this.execute(sql);
	}

	async dropTable(tableName: string): Promise<void> {
		const sql = `DROP TABLE ${this.escapeIdentifier(tableName)}`;
		await this.execute(sql);
	}

	async addColumn(tableName: string, column: ColumnDefinition): Promise<void> {
		const columnDef = this.getColumnDefinition(column);
		const sql = `ALTER TABLE ${this.escapeIdentifier(tableName)} ADD COLUMN ${columnDef}`;
		await this.execute(sql);
	}

	async dropColumn(tableName: string, columnName: string): Promise<void> {
		// SQLite doesn't support DROP COLUMN directly
		// This would require table recreation
		throw new Error('DROP COLUMN not supported in SQLite. Use table recreation approach.');
	}

	async renameColumn(tableName: string, oldName: string, newName: string): Promise<void> {
		// SQLite doesn't support RENAME COLUMN directly
		// This would require table recreation
		throw new Error('RENAME COLUMN not supported in SQLite. Use table recreation approach.');
	}

	async addIndex(
		tableName: string,
		indexName: string,
		columns: string[],
		unique: boolean = false,
	): Promise<void> {
		const uniqueStr = unique ? 'UNIQUE' : '';
		const columnsStr = columns.map((col) => this.escapeIdentifier(col)).join(', ');
		const sql = `CREATE ${uniqueStr} INDEX ${this.escapeIdentifier(indexName)} ON ${this.escapeIdentifier(tableName)} (${columnsStr})`;
		await this.execute(sql);
	}

	async dropIndex(tableName: string, indexName: string): Promise<void> {
		const sql = `DROP INDEX ${this.escapeIdentifier(indexName)}`;
		await this.execute(sql);
	}

	private escapeIdentifier(identifier: string): string {
		return `"${identifier}"`;
	}

	private getColumnDefinition(column: ColumnDefinition): string {
		let definition = `${this.escapeIdentifier(column.name)} ${column.type}`;

		if (column.primary) {
			definition += ' PRIMARY KEY';
		}

		if (column.autoIncrement) {
			definition += ' AUTOINCREMENT';
		}

		if (column.unique) {
			definition += ' UNIQUE';
		}

		if (column.nullable === false) {
			definition += ' NOT NULL';
		}

		if (column.default !== undefined) {
			definition += ` DEFAULT ${this.escapeValue(column.default)}`;
		}

		if (column.length) {
			definition += `(${column.length})`;
		}

		return definition;
	}

	private escapeValue(value: any): string {
		if (value === null || value === undefined) {
			return 'NULL';
		}
		if (typeof value === 'string') {
			return `'${value.replace(/'/g, "''")}'`;
		}
		if (typeof value === 'boolean') {
			return value ? '1' : '0';
		}
		if (value instanceof Date) {
			return `'${value.toISOString()}'`;
		}
		return String(value);
	}
}
