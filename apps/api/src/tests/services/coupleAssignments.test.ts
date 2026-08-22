/**
 * Tests de integración de las asignaciones couple-aware (M2):
 * - Camas: pareja como unidad en la misma habitación (couplesShareRoom=true) y
 *   dormitorios separados por género (couplesShareRoom=false, filtro duro).
 * - Mesas: registro y rebalance con parejas juntas (couplesShareTable=true) o
 *   separadas (false).
 * - Promoción atómica: sacar a un cónyuge de la lista de espera espeja al otro.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import {
	createCoupleParticipants,
	autoAssignBedsForRetreat,
	updateParticipant,
} from '@/services/participantService';
import { rebalanceTablesForRetreat } from '@/services/tableMesaService';

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

const makeSpouse = (overrides: Record<string, unknown> = {}) => ({
	firstName: 'Juan',
	lastName: 'Pérez',
	nickname: 'Juan',
	birthDate: new Date('1980-05-10'),
	maritalStatus: 'C',
	street: 'Calle 1',
	houseNumber: '10',
	postalCode: '01000',
	neighborhood: 'Centro',
	city: 'CDMX',
	state: 'CDMX',
	country: 'México',
	cellPhone: '5512345678',
	email: 'pareja@example.com',
	occupation: 'Ingeniero',
	snores: false,
	hasMedication: false,
	hasDietaryRestrictions: false,
	sacraments: ['marriage'],
	emergencyContact1Name: 'Contacto Uno',
	emergencyContact1Relation: 'Hermano',
	emergencyContact1CellPhone: '5587654321',
	...overrides,
});

const makeCoupleInput = (
	retreatId: string,
	email: string,
	names: [string, string] = ['Juan', 'María'],
) => ({
	retreatId,
	type: 'walker' as const,
	acceptedPrivacyNotice: true as const,
	husband: makeSpouse({ firstName: names[0], email }),
	wife: makeSpouse({ firstName: names[1], email }),
});

const createCouplesRetreat = (overrides: Record<string, unknown> = {}) =>
	TestDataFactory.createTestRetreat({
		retreat_type: 'couples',
		isPublic: true,
		endDate: FUTURE,
		...overrides,
	} as any);

const cleanCoupleTables = async () => {
	const ds = TestDataFactory.getDataSource();
	await ds.query(`DELETE FROM retreat_bed`);
	await ds.query(`DELETE FROM retreat_participants`);
	await ds.query(`DELETE FROM participants`);
};

const bedOf = async (participantId: string) => {
	const ds = TestDataFactory.getDataSource();
	const rows = await ds.query(
		`SELECT roomNumber, floor, id FROM retreat_bed WHERE participantId = ?`,
		[participantId],
	);
	return rows[0];
};

const rpOf = async (participantId: string, retreatId: string) => {
	const ds = TestDataFactory.getDataSource();
	const rows = await ds.query(
		`SELECT type, tableId, spouseParticipantId FROM retreat_participants
		 WHERE participantId = ? AND retreatId = ?`,
		[participantId, retreatId],
	);
	return rows[0];
};

describe('Asignación de camas couple-aware', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		await cleanCoupleTables();
	});

	it('couplesShareRoom=true: la pareja queda en la misma habitación', async () => {
		const retreat = await createCouplesRetreat();
		await TestDataFactory.createTestBeds(retreat.id, retreat.houseId, 20);
		const couple = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);

		await autoAssignBedsForRetreat(retreat.id);

		const bedH = await bedOf(couple.husband.id);
		const bedW = await bedOf(couple.wife.id);
		expect(bedH).toBeTruthy();
		expect(bedW).toBeTruthy();
		expect(bedH.roomNumber).toBe(bedW.roomNumber);
		expect(bedH.floor).toBe(bedW.floor);
	});

	it('couplesShareRoom=false: ninguna habitación mezcla géneros', async () => {
		const retreat = await createCouplesRetreat({ couplesShareRoom: false });
		await TestDataFactory.createTestBeds(retreat.id, retreat.houseId, 20);
		await createCoupleParticipants(makeCoupleInput(retreat.id, 'p1@example.com') as any);
		await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p2@example.com', ['Pedro', 'Ana']) as any,
		);

		await autoAssignBedsForRetreat(retreat.id);

		const ds = TestDataFactory.getDataSource();
		const rows = await ds.query(
			`SELECT b.roomNumber, b.floor, p.gender
			 FROM retreat_bed b INNER JOIN participants p ON p.id = b.participantId
			 WHERE b.retreatId = ? AND p.gender IS NOT NULL`,
			[retreat.id],
		);
		expect(rows.length).toBeGreaterThan(0);
		const gendersByRoom = new Map<string, Set<string>>();
		for (const row of rows) {
			const key = `${row.floor}|${row.roomNumber}`;
			if (!gendersByRoom.has(key)) gendersByRoom.set(key, new Set());
			gendersByRoom.get(key)!.add(row.gender);
		}
		for (const genders of gendersByRoom.values()) {
			expect(genders.size).toBe(1);
		}
	});
});

describe('Asignación de mesas couple-aware', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		await cleanCoupleTables();
	});

	it('registro con couplesShareTable=true: ambos cónyuges a la misma mesa', async () => {
		const retreat = await createCouplesRetreat();
		await TestDataFactory.createTestTables(retreat.id, 2);
		const couple = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);
		const rpH = await rpOf(couple.husband.id, retreat.id);
		const rpW = await rpOf(couple.wife.id, retreat.id);
		expect(rpH.tableId).toBeTruthy();
		expect(rpH.tableId).toBe(rpW.tableId);
	});

	it('registro con couplesShareTable=false: cónyuges en mesas distintas', async () => {
		const retreat = await createCouplesRetreat({ couplesShareTable: false });
		await TestDataFactory.createTestTables(retreat.id, 2);
		const couple = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);
		const rpH = await rpOf(couple.husband.id, retreat.id);
		const rpW = await rpOf(couple.wife.id, retreat.id);
		expect(rpH.tableId).toBeTruthy();
		expect(rpW.tableId).toBeTruthy();
		expect(rpH.tableId).not.toBe(rpW.tableId);
	});

	it('rebalance con couplesShareTable=true mantiene juntas a las parejas', async () => {
		const retreat = await createCouplesRetreat();
		await TestDataFactory.createTestTables(retreat.id, 2);
		const c1 = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);
		const c2 = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p2@example.com', ['Pedro', 'Ana']) as any,
		);

		await rebalanceTablesForRetreat(retreat.id, TestDataFactory.getDataSource());

		for (const couple of [c1, c2]) {
			const rpH = await rpOf(couple.husband.id, retreat.id);
			const rpW = await rpOf(couple.wife.id, retreat.id);
			expect(rpH.tableId).toBeTruthy();
			expect(rpH.tableId).toBe(rpW.tableId);
		}
	});

	it('rebalance con couplesShareTable=false separa a la pareja', async () => {
		const retreat = await createCouplesRetreat({ couplesShareTable: false });
		await TestDataFactory.createTestTables(retreat.id, 2);
		const couple = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);

		await rebalanceTablesForRetreat(retreat.id, TestDataFactory.getDataSource());

		const rpH = await rpOf(couple.husband.id, retreat.id);
		const rpW = await rpOf(couple.wife.id, retreat.id);
		expect(rpH.tableId).toBeTruthy();
		expect(rpW.tableId).toBeTruthy();
		expect(rpH.tableId).not.toBe(rpW.tableId);
	});
});

describe('Promoción atómica de lista de espera', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		await cleanCoupleTables();
	});

	it('promover a un cónyuge desde waiting promueve también al otro', async () => {
		// max_walkers=1 → la pareja (2) no cabe → ambos a waiting.
		const retreat = await createCouplesRetreat({ max_walkers: 1 });
		const couple = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);
		expect(couple.husband.type).toBe('waiting');

		await updateParticipant(couple.husband.id, { type: 'walker' } as any, true);

		const rpH = await rpOf(couple.husband.id, retreat.id);
		const rpW = await rpOf(couple.wife.id, retreat.id);
		expect(rpH.type).toBe('walker');
		expect(rpW.type).toBe('walker');
	});

	it('regresar a un cónyuge a waiting regresa también al otro', async () => {
		const retreat = await createCouplesRetreat();
		const couple = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);
		expect(couple.husband.type).toBe('walker');

		await updateParticipant(couple.wife.id, { type: 'waiting' } as any, true);

		const rpH = await rpOf(couple.husband.id, retreat.id);
		const rpW = await rpOf(couple.wife.id, retreat.id);
		expect(rpH.type).toBe('waiting');
		expect(rpW.type).toBe('waiting');
	});

	it('un cambio de rol que no toca waiting NO se espeja (override del admin)', async () => {
		const retreat = await createCouplesRetreat();
		const couple = await createCoupleParticipants(
			makeCoupleInput(retreat.id, 'p1@example.com') as any,
		);

		await updateParticipant(couple.husband.id, { type: 'server' } as any, true);

		const rpH = await rpOf(couple.husband.id, retreat.id);
		const rpW = await rpOf(couple.wife.id, retreat.id);
		expect(rpH.type).toBe('server');
		expect(rpW.type).toBe('walker');
	});
});
