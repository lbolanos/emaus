// Global test setup for Jest
import { expect, jest } from '@jest/globals';
import { DataSource } from 'typeorm';
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
import { Session } from '../entities/session.entity';
import { UserProfile } from '../entities/userProfile.entity';
import { Follow } from '../entities/follow.entity';
import { Friend } from '../entities/friend.entity';
import { UserActivity } from '../entities/userActivity.entity';
import { Testimonial } from '../entities/testimonial.entity';

const entities = [
	Session,
	House,
	Bed,
	Retreat,
	RetreatBed,
	TableMesa,
	Participant,
	User,
	UserProfile,
	Follow,
	Friend,
	UserActivity,
	Testimonial,
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

// Test database connection singleton
let testDataSource: DataSource | null = null;

/**
 * Get or create the test database connection
 */
export async function getTestDataSource(): Promise<DataSource> {
	if (testDataSource && testDataSource.isInitialized) {
		return testDataSource;
	}

	testDataSource = new DataSource({
		type: 'sqlite',
		database: ':memory:',
		synchronize: true, // Auto-create schema for tests
		logging: false,
		entities,
		dropSchema: true, // Drop and recreate schema between test runs
		subscribers: [],
	});

	await testDataSource.initialize();

	return testDataSource;
}

/**
 * Close the test database connection
 */
export async function closeTestDataSource(): Promise<void> {
	if (testDataSource && testDataSource.isInitialized) {
		await testDataSource.destroy();
		testDataSource = null;
	}
}

/**
 * Clear all data from test database tables
 */
export async function clearTestData(dataSource: DataSource): Promise<void> {
	if (!dataSource.isInitialized) {
		return;
	}

	// Clear all tables in correct order (respecting foreign keys)
	const tablesToClear = [
		'payment',
		'participant_tag',
		'participant_communication',
		'participant',
		'retreat_inventory',
		'retreat_bed',
		'table_mesa',
		'message_template',
		'retreat',
		'inventory_item',
		'inventory_category',
		'inventory_team',
		'house',
		'user_role',
		'user_retreat',
		'role_permission',
		'role',
		'permission',
		'user',
		'tag',
		'telemetry_event',
		'telemetry_metric',
		'telemetry_session',
		'telemetry_dashboard',
		'audit_log',
		'session',
		'migration',
	];

	for (const table of tablesToClear) {
		try {
			await dataSource.query(`DELETE FROM ${table};`);
		} catch (error) {
			// Table might not exist or already empty, continue
		}
	}
}

// Add custom matchers for field mapping validation
expect.extend({
	toBeValidDateString(received: string) {
		const pass = !isNaN(Date.parse(received));
		return {
			message: () =>
				pass
					? `expected ${received} not to be a valid date string`
					: `expected ${received} to be a valid date string`,
			pass,
		};
	},

	toBeValidEmail(received: string) {
		const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const pass = emailRegex.test(received);
		return {
			message: () =>
				pass
					? `expected ${received} not to be a valid email`
					: `expected ${received} to be a valid email`,
			pass,
		};
	},

	toBeValidPhone(received: string) {
		// Basic phone validation - can be extended based on requirements
		const phoneRegex = /^[\d\s\-\+\(\)]+$/;
		const pass = phoneRegex.test(received) && received.replace(/\D/g, '').length >= 10;
		return {
			message: () =>
				pass
					? `expected ${received} not to be a valid phone number`
					: `expected ${received} to be a valid phone number`,
			pass,
		};
	},

	toBeInEnum<T>(received: T, enumObject: T) {
		const pass = Object.values(enumObject as any).includes(received);
		return {
			message: () =>
				pass ? `expected ${received} not to be in enum` : `expected ${received} to be in enum`,
			pass,
		};
	},

	toHaveValidId(received: { id?: string }) {
		const pass = received.id !== undefined && received.id !== null && received.id !== '';
		return {
			message: () =>
				pass ? `expected object not to have a valid id` : `expected object to have a valid id`,
			pass,
		};
	},
});

// Extend Jest matchers type
declare global {
	namespace jest {
		interface Matchers<R> {
			toBeValidDateString(): R;
			toBeValidEmail(): R;
			toBeValidPhone(): R;
			toBeInEnum<T>(enumObject: T): R;
			toHaveValidId(): R;
		}
	}
}

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.DB_DATABASE = ':memory:';
process.env.JWT_SECRET = 'test-secret-key';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-key';
process.env.CSRF_SECRET = 'test-csrf-secret-key';

// Mock console methods in tests to reduce noise
const originalConsole = global.console;
global.console = {
	...console,
	// Uncomment to ignore specific console methods in tests
	// log: jest.fn(),
	// debug: jest.fn(),
	// info: jest.fn(),
	// warn: jest.fn(),
	// error: jest.fn(),
};

// Global test teardown
afterAll(async () => {
	// Cleanup performance optimization service to prevent open handles
	try {
		const {
			performanceOptimizationService,
		} = require('../services/performanceOptimizationService');
		performanceOptimizationService.cleanup();
	} catch (error) {
		// Ignore cleanup errors
	}

	// Close test database connection
	await closeTestDataSource();

	// Restore console
	global.console = originalConsole;
});

// Increase timeout for database operations
jest.setTimeout(10000);
