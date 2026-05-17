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
import { getShirtOrdersForRetreat } from '@/services/shirtReportService';

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
});
