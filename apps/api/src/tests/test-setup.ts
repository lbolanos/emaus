import { DataSource } from 'typeorm';
import path from 'node:path';

// Test database configuration
const testDataSource = new DataSource({
	type: 'sqlite',
	database: ':memory:',
	synchronize: false,
	entities: [path.join(__dirname, '../entities/*.entity.ts')],
	migrations: [path.join(__dirname, '../migrations/sqlite/*.ts')],
});

export async function setupTestDatabase() {
	await testDataSource.initialize();

	// Run all migrations
	await testDataSource.runMigrations();

	return testDataSource;
}

export async function teardownTestDatabase() {
	if (testDataSource.isInitialized) {
		await testDataSource.destroy();
	}
}

export async function clearTestData() {
	if (testDataSource.isInitialized) {
		// Clear all tables
		const entities = testDataSource.entityMetadatas;
		for (const entity of entities) {
			const repository = testDataSource.getRepository(entity.name);
			await repository.query(`DELETE FROM ${entity.tableName};`);
		}
	}
}
