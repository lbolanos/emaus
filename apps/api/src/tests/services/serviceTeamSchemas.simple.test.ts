// Tests for Zod schemas in packages/types/src/serviceTeam.ts
// Pure validation, no database dependencies

import {
	ServiceTeamType,
	createServiceTeamSchema,
	updateServiceTeamSchema,
	serviceTeamSchema,
} from '@repo/types';
import { v4 as uuidv4 } from 'uuid';

describe('Service Team Zod Schemas', () => {
	const validUuid = uuidv4();
	const validUuid2 = uuidv4();

	describe('ServiceTeamType enum', () => {
		test('should have exactly 18 values', () => {
			const values = Object.values(ServiceTeamType);
			expect(values).toHaveLength(18);
		});
	});

	describe('createServiceTeamSchema', () => {
		test('should accept valid input', () => {
			const input = {
				name: 'Cocina',
				teamType: ServiceTeamType.COCINA,
				retreatId: validUuid,
			};
			const result = createServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		test('should accept valid input with all optional fields', () => {
			const input = {
				name: 'Cocina',
				teamType: ServiceTeamType.COCINA,
				retreatId: validUuid,
				description: 'Kitchen team',
				instructions: 'Cook food',
				leaderId: validUuid2,
				priority: 5,
				isActive: false,
			};
			const result = createServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		test('should reject missing name', () => {
			const input = { teamType: ServiceTeamType.COCINA, retreatId: validUuid };
			const result = createServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		test('should reject missing teamType', () => {
			const input = { name: 'Cocina', retreatId: validUuid };
			const result = createServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		test('should reject missing retreatId', () => {
			const input = { name: 'Cocina', teamType: ServiceTeamType.COCINA };
			const result = createServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		test('should reject invalid teamType', () => {
			const input = { name: 'Cocina', teamType: 'invalid_type', retreatId: validUuid };
			const result = createServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(false);
		});

		test('should reject invalid UUID for retreatId', () => {
			const input = { name: 'Cocina', teamType: ServiceTeamType.COCINA, retreatId: 'not-a-uuid' };
			const result = createServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(false);
		});
	});

	describe('updateServiceTeamSchema', () => {
		test('should accept partial updates', () => {
			const input = { name: 'New Name' };
			const result = updateServiceTeamSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		test('should accept empty object (all fields optional)', () => {
			const result = updateServiceTeamSchema.safeParse({});
			expect(result.success).toBe(true);
		});

		test('should accept nullable leaderId', () => {
			const result = updateServiceTeamSchema.safeParse({ leaderId: null });
			expect(result.success).toBe(true);
		});

		test('should reject invalid teamType', () => {
			const result = updateServiceTeamSchema.safeParse({ teamType: 'bad' });
			expect(result.success).toBe(false);
		});
	});

	describe('serviceTeamSchema', () => {
		test('should validate a full team object', () => {
			const input = {
				id: validUuid,
				name: 'Cocina',
				teamType: ServiceTeamType.COCINA,
				retreatId: validUuid,
				priority: 1,
				isActive: true,
			};
			const result = serviceTeamSchema.safeParse(input);
			expect(result.success).toBe(true);
		});

		test('should reject missing id', () => {
			const input = {
				name: 'Cocina',
				teamType: ServiceTeamType.COCINA,
				retreatId: validUuid,
			};
			const result = serviceTeamSchema.safeParse(input);
			expect(result.success).toBe(false);
		});
	});
});
