export type DatabaseType = 'sqlite' | 'postgresql';

export type DatabaseConfig = {
	type: DatabaseType;
	host?: string;
	port?: number;
	username?: string;
	password?: string;
	database: string;
	synchronize: boolean;
	logging: boolean;
	entities: any[];
	migrations: any[];
	subscribers: any[];
};

export interface MigrationInfo {
	name: string;
	timestamp: string;
	executedAt?: Date;
	executionTime?: number;
	fileName?: string;
	filePath?: string;
}

export interface MigrationOptions {
	name: string;
	up: (queryRunner: any) => Promise<void>;
	down?: (queryRunner: any) => Promise<void>;
}

export interface MigrationResult {
	success: boolean;
	message: string;
	executionTime?: number;
	error?: Error;
}

export interface MigrationStats {
	total: number;
	executed: number;
	pending: number;
	migrations: MigrationInfo[];
}

export interface QueryRunner {
	query: (sql: string, params?: any[]) => Promise<any>;
	execute: (sql: string, params?: any[]) => Promise<void>;
	beginTransaction: () => Promise<void>;
	commitTransaction: () => Promise<void>;
	rollbackTransaction: () => Promise<void>;
	tableExists: (tableName: string) => Promise<boolean>;
	columnExists: (tableName: string, columnName: string) => Promise<boolean>;
	createTable: (tableName: string, columns: ColumnDefinition[]) => Promise<void>;
	dropTable: (tableName: string) => Promise<void>;
	addColumn: (tableName: string, column: ColumnDefinition) => Promise<void>;
	dropColumn: (tableName: string, columnName: string) => Promise<void>;
	renameColumn: (tableName: string, oldName: string, newName: string) => Promise<void>;
	addIndex: (
		tableName: string,
		indexName: string,
		columns: string[],
		unique?: boolean,
	) => Promise<void>;
	dropIndex: (tableName: string, indexName: string) => Promise<void>;
}

export interface ColumnDefinition {
	name: string;
	type: string;
	nullable?: boolean;
	default?: any;
	primary?: boolean;
	unique?: boolean;
	autoIncrement?: boolean;
	length?: number;
	precision?: number;
	scale?: number;
	comment?: string;
}

export interface ForeignKeyDefinition {
	name: string;
	column: string;
	referencedTable: string;
	referencedColumn: string;
	onDelete?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
	onUpdate?: 'CASCADE' | 'RESTRICT' | 'SET NULL' | 'NO ACTION';
}

export interface CreateOptions {
	name?: string;
	timestamp?: string;
	dryRun?: boolean;
}

export interface RunOptions {
	dryRun?: boolean;
	step?: number;
	transaction?: boolean;
}

export interface RevertOptions {
	dryRun?: boolean;
	step?: number;
	transaction?: boolean;
}

export interface ShowOptions {
	verbose?: boolean;
}
