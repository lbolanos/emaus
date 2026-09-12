/**
 * Integration test for the participants LIST with per-size price overrides.
 *
 * `findAllParticipants` joins `shirtSizes.shirtType.sizePrices` — a THREE-part
 * relation the generic relation loop does not handle (it only joins two
 * levels). The explicit branch added for it lives in participantService; this
 * test proves the query builds, the overrides hydrate, and the computed
 * balance applies COALESCE(override, base, 0) per size.
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Retreat } from '@/entities/retreat.entity';
import { House } from '@/entities/house.entity';
import { ParticipantShirtSize } from '@/entities/participantShirtSize.entity';
import { v4 as uuidv4 } from 'uuid';

import { createShirtType } from '@/services/shirtTypeService';
import { findAllParticipants } from '@/services/participantService';

const getDS = () => TestDataFactory['testDataSource'];

async function makeRetreat(): Promise<string> {
	const ds = getDS();
	const houseRepo = ds.getRepository(House);
	const retreatRepo = ds.getRepository(Retreat);

	const house = houseRepo.create({
		id: uuidv4(),
		name: 'Test House',
		address1: '1',
		city: 'CDMX',
		state: 'CDMX',
		zipCode: '00000',
		country: 'MX',
		capacity: 30,
	} as any);
	await houseRepo.save(house);

	const retreat = retreatRepo.create({
		id: uuidv4(),
		parish: 'Test Parish',
		startDate: new Date('2030-01-01'),
		endDate: new Date('2030-01-03'),
		houseId: (house as any).id,
		isPublic: true,
	} as any);
	await retreatRepo.save(retreat);
	return (retreat as any).id;
}

async function assignShirtSize(
	participantId: string,
	shirtTypeId: string,
	size: string,
): Promise<void> {
	const repo = getDS().getRepository(ParticipantShirtSize);
	await repo.save(repo.create({ participantId, shirtTypeId, size }));
}

describe('findAllParticipants — per-size price overrides', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('hydrates the overrides and applies them to chargeBreakdown.shirts', async () => {
		const retreatId = await makeRetreat();
		const polo = await createShirtType(retreatId, {
			name: 'Polo',
			price: 135,
			sizePrices: [{ size: 'XXL', price: 250 }],
		});

		const xxl = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Ana',
			type: 'server',
		} as any);
		await assignShirtSize(xxl.id, polo.id, 'XXL');

		const medium = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Beto',
			type: 'server',
		} as any);
		await assignShirtSize(medium.id, polo.id, 'M');

		const rows = await findAllParticipants(retreatId);

		// The three-part relation loaded the override rows alongside the type.
		const ana = rows.find((p) => p.firstName === 'Ana')!;
		const overrideRow = ana.shirtSizes?.[0]?.shirtType?.sizePrices ?? [];
		expect(overrideRow.map((sp) => ({ size: sp.size, price: Number(sp.price) }))).toEqual([
			{ size: 'XXL', price: 250 },
		]);

		// Effective price per size: override for XXL, base for M.
		expect(ana.chargeBreakdown.shirts).toBe(250);
		expect(rows.find((p) => p.firstName === 'Beto')!.chargeBreakdown.shirts).toBe(135);
	});

	it('walkers keep shirts at 0 even with an override configured', async () => {
		const retreatId = await makeRetreat();
		const polo = await createShirtType(retreatId, {
			name: 'Polo',
			price: 135,
			requiredForWalkers: true,
			sizePrices: [{ size: 'XXL', price: 250 }],
		});

		const walker = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Cami',
			type: 'walker',
		} as any);
		await assignShirtSize(walker.id, polo.id, 'XXL');

		const rows = await findAllParticipants(retreatId);
		expect(rows.find((p) => p.firstName === 'Cami')!.chargeBreakdown.shirts).toBe(0);
	});
});
