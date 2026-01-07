import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { TestDataFactory } from './test-utils/testDataFactory';
import { House } from '../entities/house.entity';
import { Bed } from '../entities/bed.entity';
import { Retreat } from '../entities/retreat.entity';
import { RetreatBed } from '../entities/retreatBed.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { Participant } from '../entities/participant.entity';
import { User } from '../entities/user.entity';
import { Responsability } from '../entities/responsability.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { InventoryCategory } from '../entities/inventoryCategory.entity';
import { InventoryTeam } from '../entities/inventoryTeam.entity';
import { InventoryItem } from '../entities/inventoryItem.entity';
import { RetreatInventory } from '../entities/retreatInventory.entity';
import { Role } from '../entities/role.entity';
import { UserRole } from '../entities/userRole.entity';
import { RolePermission } from '../entities/rolePermission.entity';
import { UserRetreat } from '../entities/userRetreat.entity';
import { Permission } from '../entities/permission.entity';
import { Migration } from '../entities/migration.entity';
import { Payment } from '../entities/payment.entity';
import { GlobalMessageTemplate } from '../entities/globalMessageTemplate.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';
import { TelemetryMetric } from '../entities/telemetryMetric.entity';
import { TelemetryEvent } from '../entities/telemetryEvent.entity';
import { TelemetrySession } from '../entities/telemetrySession.entity';
import { TelemetryDashboard } from '../entities/telemetryDashboard.entity';
import { Tag } from '../entities/tag.entity';
import { ParticipantTag } from '../entities/participantTag.entity';
import { AuditLog } from '../entities/auditLog.entity';
// Note: RoleRequest and PermissionOverride excluded due to SQLite incompatibility
// They use 'timestamp' and 'json' types which PostgreSQL supports but SQLite doesn't
import { Session } from '../entities/session.entity';

const entities = [
	Session,
	House,
	Bed,
	Retreat,
	RetreatBed,
	TableMesa,
	Participant,
	User,
	Responsability,
	MessageTemplate,
	GlobalMessageTemplate,
	InventoryCategory,
	InventoryTeam,
	InventoryItem,
	RetreatInventory,
	Role,
	UserRole,
	RolePermission,
	UserRetreat,
	Permission,
	Migration,
	Payment,
	ParticipantCommunication,
	TelemetryMetric,
	TelemetryEvent,
	TelemetrySession,
	TelemetryDashboard,
	Tag,
	ParticipantTag,
	AuditLog,
];

// Test database configuration - will be created in setupTestDatabase
let testDataSource: DataSource | null = null;

// Helper to get or create test data source
function getTestDataSourceConfig() {
	return {
		type: 'sqlite' as const,
		database: ':memory:',
		synchronize: true, // Auto-create schema for tests
		logging: false,
		entities,
		dropSchema: true, // Drop and recreate schema between test runs
		subscribers: [],
		// Disable foreign key constraints for easier test cleanup
		extra: {
			cache: 'shared',
		},
		// Disable foreign keys for tests
		connectTimeout: 60000,
	};
}

export async function setupTestDatabase() {
	// Check if already initialized to handle multiple describe blocks calling this
	if (testDataSource && testDataSource.isInitialized) {
		// Ensure TestDataFactory has the reference
		TestDataFactory.setDataSource(testDataSource);
		return testDataSource;
	}

	// Create test data source dynamically inside the function
	// This ensures TypeORM decorators have been processed
	testDataSource = new DataSource(getTestDataSourceConfig());

	await testDataSource.initialize();

	// Build metadata explicitly to ensure all entities are registered
	// This is critical for TypeORM to have complete metadata before any repository operations
	await testDataSource.buildMetadatas();

	// Debug: Check what metadata was built
	console.log(
		'[TEST-SETUP] Built metadata for entities:',
		testDataSource.entityMetadatas.map((m: any) => m.name),
	);

	// CRITICAL FIX: Override getMetadata on testDataSource itself
	// This ensures repositories created from testDataSource can find entity metadata
	Object.defineProperty(testDataSource, 'getMetadata', {
		value: function (target: Function | string) {
			// First try to find by name if target is a string
			if (typeof target === 'string') {
				const metadata = testDataSource.entityMetadatas.find((m: any) => m.name === target);
				if (metadata) return metadata;
			}
			// Try to find by target function
			if (typeof target === 'function') {
				const metadata = testDataSource.entityMetadatas.find((m: any) => m.target === target);
				if (metadata) return metadata;
				// Also try by name if the function has a name property
				if (target.name) {
					const metadataByName = testDataSource.entityMetadatas.find(
						(m: any) => m.name === target.name,
					);
					if (metadataByName) return metadataByName;
				}
			}
			// If not found, throw descriptive error
			const targetName =
				typeof target === 'string' ? target : (target as any).name || String(target);
			throw new Error(
				`No metadata for "${targetName}" was found. Available entities: ${testDataSource.entityMetadatas.map((m: any) => m.name).join(', ')}`,
			);
		},
		writable: true,
		configurable: true,
	});

	// Swap AppDataSource to use the test database for services
	// This is a workaround for services that use AppDataSource directly
	Object.assign(AppDataSource, {
		isInitialized: true,
		driver: testDataSource.driver,
		options: testDataSource.options,
		manager: testDataSource.manager,
		queries: testDataSource.queries,
		subscribers: testDataSource.subscribers,
		relations: testDataSource.relations,
	});

	// Swap getRepository to use test data source repositories
	AppDataSource.getRepository = testDataSource.getRepository.bind(testDataSource);

	// Also swap the metadata getter to ensure repositories can find entity metadata
	Object.defineProperty(AppDataSource, 'entityMetadatas', {
		get() {
			return testDataSource.entityMetadatas;
		},
		configurable: true,
	});

	// CRITICAL: Also override getMetadata on AppDataSource to match testDataSource
	// This ensures repositories created via AppDataSource.getRepository can find metadata
	Object.defineProperty(AppDataSource, 'getMetadata', {
		value: function (target: Function | string) {
			// First try to find by name if target is a string
			if (typeof target === 'string') {
				const metadata = testDataSource.entityMetadatas.find((m: any) => m.name === target);
				if (metadata) return metadata;
			}
			// Try to find by target function
			if (typeof target === 'function') {
				const metadata = testDataSource.entityMetadatas.find((m: any) => m.target === target);
				if (metadata) return metadata;
				// Also try by name if the function has a name property
				if (target.name) {
					const metadataByName = testDataSource.entityMetadatas.find(
						(m: any) => m.name === target.name,
					);
					if (metadataByName) return metadataByName;
				}
			}
			// If not found, throw descriptive error
			const targetName =
				typeof target === 'string' ? target : (target as any).name || String(target);
			throw new Error(
				`No metadata for "${targetName}" was found. Available entities: ${testDataSource.entityMetadatas.map((m: any) => m.name).join(', ')}`,
			);
		},
		writable: true,
		configurable: true,
	});

	// Set the testDataSource in TestDataFactory so tests can access it
	TestDataFactory.setDataSource(testDataSource);

	return testDataSource;
}

export async function teardownTestDatabase() {
	if (testDataSource && testDataSource.isInitialized) {
		await testDataSource.destroy();
		testDataSource = null;
	}
}

export async function clearTestData() {
	if (!testDataSource || !testDataSource.isInitialized) {
		return;
	}

	// Clear tables in dependency order (children before parents)
	// This respects foreign key constraints
	const clearOrder = [
		'payment',
		'participant_tag',
		'participant_communication',
		'participant',
		'user_retreat',
		'role_request',
		'permission_override',
		'retreat_inventory',
		'retreat_bed',
		'table_mesa',
		'message_template',
		'tag',
		'retreat',
		'inventory_item',
		'inventory_category',
		'inventory_team',
		'house',
		'user_role',
		'role_permission',
		'users',
		'role',
		'permission',
		'audit_log',
		'session',
		'telemetry_event',
		'telemetry_metric',
		'telemetry_session',
		'telemetry_dashboard',
	];

	for (const tableName of clearOrder) {
		try {
			await testDataSource.query(`DELETE FROM ${tableName};`);
		} catch (error) {
			// Table might not exist or already empty, continue
		}
	}
}
