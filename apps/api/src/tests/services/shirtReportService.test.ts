/**
 * Tests for shirtReportService — listing servidores y angelitos con prendas pedidas
 * para el reporte semanal.
 *
 * Reglas cubiertas:
 *  - Walkers excluidos (aunque tengan prendas en `participant_shirt_size`).
 *  - Participantes cancelados excluidos.
 *  - Participantes sin prendas excluidos.
 *  - Angelitos (`partial_server`) incluidos junto con servers.
 *  - shirtTypes en la respuesta vienen ordenados por `sortOrder`.
 *  - Cada participante trae todas sus prendas para este retiro.
 *  - Prendas de OTRO retiro se filtran (no se mezclan).
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Retreat } from '@/entities/retreat.entity';
import { House } from '@/entities/house.entity';
import { ParticipantShirtSize } from '@/entities/participantShirtSize.entity';
import { v4 as uuidv4 } from 'uuid';

import { createShirtType } from '@/services/shirtTypeService';
import { getShirtOrdersForRetreat, getParticipantShirtOrderSummary } from '@/services/shirtReportService';

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

describe('Shirt Report Service', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('returns empty arrays when retreat has no shirt types and no participants', async () => {
		const retreatId = await makeRetreat();
		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.shirtTypes).toEqual([]);
		expect(result.participants).toEqual([]);
	});

	it('lists shirtTypes ordered by sortOrder regardless of insertion order', async () => {
		const retreatId = await makeRetreat();
		await createShirtType(retreatId, { name: 'Chamarra', sortOrder: 5 });
		await createShirtType(retreatId, { name: 'Playera', sortOrder: 1 });
		await createShirtType(retreatId, { name: 'Polo', sortOrder: 3 });

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.shirtTypes.map((t) => t.name)).toEqual(['Playera', 'Polo', 'Chamarra']);
	});

	it('excludes walkers even when they have shirt sizes', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, { name: 'Playera' });

		const walker = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Cami',
			lastName: 'Walker',
			type: 'walker',
		} as any);
		await assignShirtSize(walker.id, shirt.id, 'M');

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.participants).toEqual([]);
	});

	it('excludes cancelled servers and angelitos', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, { name: 'Playera' });

		const cancelledServer = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Cancelled',
			lastName: 'Server',
			type: 'server',
			isCancelled: true,
		} as any);
		await assignShirtSize(cancelledServer.id, shirt.id, 'G');

		const cancelledAngel = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Cancelled',
			lastName: 'Angel',
			type: 'partial_server',
			isCancelled: true,
		} as any);
		await assignShirtSize(cancelledAngel.id, shirt.id, 'S');

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.participants).toEqual([]);
	});

	it('excludes servers and angelitos who did not order any garment', async () => {
		const retreatId = await makeRetreat();
		await createShirtType(retreatId, { name: 'Playera' });

		await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'No',
			lastName: 'Order',
			type: 'server',
		} as any);

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.participants).toEqual([]);
	});

	it('includes both servers and angelitos with their shirts', async () => {
		const retreatId = await makeRetreat();
		const playera = await createShirtType(retreatId, { name: 'Playera', sortOrder: 1 });
		const chamarra = await createShirtType(retreatId, { name: 'Chamarra', sortOrder: 2 });

		const server = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Ana',
			lastName: 'López',
			type: 'server',
			id_on_retreat: 10,
		} as any);
		await assignShirtSize(server.id, playera.id, 'M');
		await assignShirtSize(server.id, chamarra.id, 'G');

		const angel = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Beto',
			lastName: 'Pérez',
			type: 'partial_server',
			id_on_retreat: 11,
		} as any);
		await assignShirtSize(angel.id, playera.id, 'S');

		const result = await getShirtOrdersForRetreat(retreatId);

		expect(result.participants).toHaveLength(2);

		const ana = result.participants.find((p) => p.firstName === 'Ana')!;
		expect(ana.type).toBe('server');
		expect(ana.idOnRetreat).toBe(10);
		expect(ana.shirts.map((s) => `${s.shirtTypeName}:${s.size}`).sort()).toEqual([
			'Chamarra:G',
			'Playera:M',
		]);

		const beto = result.participants.find((p) => p.firstName === 'Beto')!;
		expect(beto.type).toBe('partial_server');
		expect(beto.shirts).toHaveLength(1);
		expect(beto.shirts[0]).toMatchObject({ shirtTypeName: 'Playera', size: 'S' });
	});

	it('filters out placeholder sizes (empty string, "null", NULL)', async () => {
		const retreatId = await makeRetreat();
		const playera = await createShirtType(retreatId, { name: 'Playera', sortOrder: 1 });
		const chamarra = await createShirtType(retreatId, { name: 'Chamarra', sortOrder: 2 });

		const server = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Mix',
			lastName: 'Sizes',
			type: 'server',
		} as any);
		// Una talla real + dos placeholders del esquema legacy.
		await assignShirtSize(server.id, playera.id, 'M');
		await assignShirtSize(server.id, chamarra.id, 'null');

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.participants).toHaveLength(1);
		expect(result.participants[0].shirts).toHaveLength(1);
		expect(result.participants[0].shirts[0]).toMatchObject({
			shirtTypeName: 'Playera',
			size: 'M',
		});
	});

	it('does not include shirts from a different retreat', async () => {
		const retreatA = await makeRetreat();
		const retreatB = await makeRetreat();

		const shirtA = await createShirtType(retreatA, { name: 'Playera A' });
		const shirtB = await createShirtType(retreatB, { name: 'Playera B' });

		const server = await TestDataFactory.createTestParticipant(retreatA, {
			firstName: 'Cross',
			lastName: 'Retreat',
			type: 'server',
		} as any);
		await assignShirtSize(server.id, shirtA.id, 'M');
		// Asignación a tipo de OTRO retiro — no debería aparecer en el reporte de A
		await assignShirtSize(server.id, shirtB.id, 'G');

		const result = await getShirtOrdersForRetreat(retreatA);
		expect(result.participants).toHaveLength(1);
		expect(result.participants[0].shirts).toHaveLength(1);
		expect(result.participants[0].shirts[0].shirtTypeName).toBe('Playera A');
	});

	// --- Precio / shirtCharge / totalCharge ---

	it('shirtTypes in the response include the price (or null when not configured)', async () => {
		const retreatId = await makeRetreat();
		await createShirtType(retreatId, { name: 'Playera', sortOrder: 1, price: 135 });
		await createShirtType(retreatId, { name: 'Chamarra', sortOrder: 2 });

		const result = await getShirtOrdersForRetreat(retreatId);
		const playera = result.shirtTypes.find((t) => t.name === 'Playera')!;
		const chamarra = result.shirtTypes.find((t) => t.name === 'Chamarra')!;
		expect(playera.price).toBe(135);
		expect(chamarra.price).toBeNull();
	});

	it('shirtCharge per participant adds up the price of each garment ordered', async () => {
		const retreatId = await makeRetreat();
		const playera = await createShirtType(retreatId, { name: 'Playera', sortOrder: 1, price: 135 });
		const chamarra = await createShirtType(retreatId, { name: 'Chamarra', sortOrder: 2, price: 275 });

		const server = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Ana',
			lastName: 'López',
			type: 'server',
		} as any);
		await assignShirtSize(server.id, playera.id, 'M');
		await assignShirtSize(server.id, chamarra.id, 'G');

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.participants[0].shirtCharge).toBe(410);
		expect(result.participants[0].shirts.find((s) => s.shirtTypeName === 'Playera')?.price).toBe(
			135,
		);
	});

	it('shirtCharge is 0 when the type has no price configured', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, { name: 'Playera' });

		const server = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Sin',
			lastName: 'Precio',
			type: 'server',
		} as any);
		await assignShirtSize(server.id, shirt.id, 'M');

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.participants[0].shirtCharge).toBe(0);
		expect(result.participants[0].shirts[0].price).toBeNull();
	});

	it('totalCharge in the response adds up the shirtCharge of all participants', async () => {
		const retreatId = await makeRetreat();
		const playera = await createShirtType(retreatId, { name: 'Playera', price: 135 });

		const server = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Ana',
			lastName: 'López',
			type: 'server',
		} as any);
		await assignShirtSize(server.id, playera.id, 'M');

		const angel = await TestDataFactory.createTestParticipant(retreatId, {
			firstName: 'Beto',
			lastName: 'Pérez',
			type: 'partial_server',
		} as any);
		await assignShirtSize(angel.id, playera.id, 'S');

		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.totalCharge).toBe(270);
	});

	it('totalCharge is 0 when there are no participants with garments', async () => {
		const retreatId = await makeRetreat();
		const result = await getShirtOrdersForRetreat(retreatId);
		expect(result.totalCharge).toBe(0);
	});
});

describe('getParticipantShirtOrderSummary', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('server: charges for a garment with a configured price', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, { name: 'Playera', price: 150 });
		const server = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'server',
		} as any);
		await assignShirtSize(server.id, shirt.id, 'M');

		const result = await getParticipantShirtOrderSummary(server.id, retreatId);
		expect(result.shirtCharge).toBe(150);
		expect(result.shirtOrderSummary).toContain('Playera');
	});

	it('partial_server (angelito): charges the same as a server', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, { name: 'Playera', price: 150 });
		const angel = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'partial_server',
		} as any);
		await assignShirtSize(angel.id, shirt.id, 'S');

		const result = await getParticipantShirtOrderSummary(angel.id, retreatId);
		expect(result.shirtCharge).toBe(150);
	});

	// Regression: `computeCharges()` on the entity only charges server/partial_server
	// for garments — a walker's shirt is included in their retreat fee, not billed
	// separately. Without this guard, `GET /participants/:id/shirt-order` would show
	// a nonzero charge for a walker (they can have rows in `participant_shirt_size`
	// via a `requiredForWalkers` garment type that independently carries a price),
	// which the real balance never reflects — misleading in a manual message.
	it('walker: never charges, even for a garment with a configured price (matches computeCharges)', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, {
			name: 'Playera',
			price: 150,
			requiredForWalkers: true,
		});
		const walker = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'walker',
		} as any);
		await assignShirtSize(walker.id, shirt.id, 'M');

		const result = await getParticipantShirtOrderSummary(walker.id, retreatId);
		expect(result.shirtCharge).toBe(0);
		// The garment itself is still listed (informational), just without a price.
		expect(result.shirtOrderSummary).toContain('Playera');
		expect(result.shirtOrderSummary).not.toContain('150');
	});

	it('resolves the type via retreat_participants when participantType is not passed', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, { name: 'Playera', price: 150 });
		const walker = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'walker',
		} as any);
		await assignShirtSize(walker.id, shirt.id, 'M');

		// No third argument: must look up the type itself and still exclude walkers.
		const result = await getParticipantShirtOrderSummary(walker.id, retreatId);
		expect(result.shirtCharge).toBe(0);
	});

	it('honors an explicit participantType, skipping the retreat_participants lookup', async () => {
		const retreatId = await makeRetreat();
		const shirt = await createShirtType(retreatId, { name: 'Playera', price: 150 });
		const server = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'server',
		} as any);
		await assignShirtSize(server.id, shirt.id, 'M');

		// Passing 'walker' explicitly (even though the row says 'server') should be honored.
		const result = await getParticipantShirtOrderSummary(server.id, retreatId, 'walker');
		expect(result.shirtCharge).toBe(0);
	});

	it('falls back to the "not configured" message when there are no rows', async () => {
		const retreatId = await makeRetreat();
		const server = await TestDataFactory.createTestParticipant(retreatId, {
			type: 'server',
		} as any);

		const result = await getParticipantShirtOrderSummary(server.id, retreatId);
		expect(result.shirtOrderSummary).toBe('Aún no has configurado tus tallas');
		expect(result.shirtCharge).toBe(0);
	});
});
