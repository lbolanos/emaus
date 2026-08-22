/**
 * Tests de integración de createCoupleParticipants / validateCoupleParticipants
 * (registro de parejas, retiros retreat_type='couples') contra la DB de test.
 *
 * Cubre:
 * - Alta feliz: dos participantes M/F vinculados simétricamente, mismo color,
 *   email compartido permitido.
 * - Capacidad atómica: si no caben LOS DOS, ambos quedan en 'waiting'.
 * - Doble submit de la misma pareja → ALREADY_REGISTERED_IN_RETREAT.
 * - Reuso por email+gender al registrarse en un segundo retiro (no duplica filas).
 * - Retiro no-couples → RETREAT_NOT_COUPLES.
 * - Tarifa por pareja: retreatFeeForType parte el costo a la mitad por cónyuge.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import {
	createCoupleParticipants,
	validateCoupleParticipants,
} from '@/services/participantService';
import { retreatFeeForType } from '@/utils/retreatCharges';

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
	overrides: Record<string, unknown> = {},
) => ({
	retreatId,
	type: 'walker' as const,
	acceptedPrivacyNotice: true as const,
	husband: makeSpouse({ firstName: 'Juan' }),
	wife: makeSpouse({ firstName: 'María' }),
	...overrides,
});

const createCouplesRetreat = (overrides: Record<string, unknown> = {}) =>
	TestDataFactory.createTestRetreat({
		retreat_type: 'couples',
		isPublic: true,
		endDate: FUTURE,
		...overrides,
	} as any);

describe('createCoupleParticipants', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// clearTestData no limpia `participants` (borra 'participant', singular);
		// limpiamos explícito para que el índice único email+retiro+gender no
		// arrastre filas entre tests.
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM retreat_participants`);
		await ds.query(`DELETE FROM participants`);
	});

	it('crea a los dos cónyuges vinculados, con gender, mismo color y email compartido', async () => {
		const retreat = await createCouplesRetreat();
		const result = await createCoupleParticipants(makeCoupleInput(retreat.id) as any);

		expect(result.husband.id).not.toBe(result.wife.id);
		expect(result.husband.gender).toBe('M');
		expect(result.wife.gender).toBe('F');
		expect(result.husband.email).toBe('pareja@example.com');
		expect(result.wife.email).toBe('pareja@example.com');
		expect(result.husband.type).toBe('walker');
		expect(result.wife.type).toBe('walker');
		expect(result.husband.family_friend_color).toBeTruthy();
		expect(result.husband.family_friend_color).toBe(result.wife.family_friend_color);

		// Vínculo simétrico persistido en retreat_participants.
		const ds = TestDataFactory.getDataSource();
		const rows = await ds.query(
			`SELECT participantId, spouseParticipantId, type FROM retreat_participants WHERE retreatId = ?`,
			[retreat.id],
		);
		expect(rows).toHaveLength(2);
		const byParticipant = Object.fromEntries(
			rows.map((r: any) => [r.participantId, r.spouseParticipantId]),
		);
		expect(byParticipant[result.husband.id]).toBe(result.wife.id);
		expect(byParticipant[result.wife.id]).toBe(result.husband.id);
	});

	it('capacidad atómica: si la pareja no cabe completa, AMBOS quedan en waiting', async () => {
		// 1 caminante ya registrado y cupo de 2: queda 1 lugar → la pareja (2) no cabe.
		const retreat = await createCouplesRetreat({ max_walkers: 2 });
		await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'previo@example.com',
		});

		const result = await createCoupleParticipants(makeCoupleInput(retreat.id) as any);
		expect(result.husband.type).toBe('waiting');
		expect(result.wife.type).toBe('waiting');
	});

	it('con 2 lugares libres la pareja entra completa', async () => {
		const retreat = await createCouplesRetreat({ max_walkers: 2 });
		const result = await createCoupleParticipants(makeCoupleInput(retreat.id) as any);
		expect(result.husband.type).toBe('walker');
		expect(result.wife.type).toBe('walker');
	});

	it('el doble submit de la misma pareja lanza ALREADY_REGISTERED_IN_RETREAT', async () => {
		const retreat = await createCouplesRetreat();
		await createCoupleParticipants(makeCoupleInput(retreat.id) as any);
		await expect(
			createCoupleParticipants(makeCoupleInput(retreat.id) as any),
		).rejects.toMatchObject({ code: 'ALREADY_REGISTERED_IN_RETREAT' });
	});

	it('reusa las filas por email+gender al registrarse en un segundo retiro', async () => {
		const retreatA = await createCouplesRetreat();
		const first = await createCoupleParticipants(makeCoupleInput(retreatA.id) as any);

		const retreatB = await createCouplesRetreat();
		const second = await createCoupleParticipants(makeCoupleInput(retreatB.id) as any);

		// Misma persona física: no se duplican filas de participants.
		expect(second.husband.id).toBe(first.husband.id);
		expect(second.wife.id).toBe(first.wife.id);

		const ds = TestDataFactory.getDataSource();
		const count = await ds.query(
			`SELECT COUNT(*) AS c FROM participants WHERE LOWER(email) = 'pareja@example.com'`,
		);
		expect(count[0].c).toBe(2);
	});

	it('rechaza el registro de pareja en un retiro que no es de parejas', async () => {
		const retreat = await TestDataFactory.createTestRetreat({
			retreat_type: 'men',
			isPublic: true,
			endDate: FUTURE,
		} as any);
		await expect(
			createCoupleParticipants(makeCoupleInput(retreat.id) as any),
		).rejects.toMatchObject({ code: 'RETREAT_NOT_COUPLES' });
	});
});

describe('validateCoupleParticipants (dry-run)', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM retreat_participants`);
		await ds.query(`DELETE FROM participants`);
	});

	it('avisa que la pareja quedará en lista de espera cuando no caben 2', async () => {
		const retreat = await createCouplesRetreat({ max_walkers: 2 });
		await TestDataFactory.createTestParticipant(retreat.id, {
			email: 'previo@example.com',
		});
		const result = await validateCoupleParticipants(makeCoupleInput(retreat.id) as any);
		expect(result.valid).toBe(true);
		expect(result.warnings.join(' ')).toContain('lista de espera');
	});

	it('marca inválido si uno de los cónyuges ya está registrado en el retiro', async () => {
		const retreat = await createCouplesRetreat();
		await createCoupleParticipants(makeCoupleInput(retreat.id) as any);
		const result = await validateCoupleParticipants(makeCoupleInput(retreat.id) as any);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('ya está registrado');
	});

	it('marca inválido en retiro no público', async () => {
		const retreat = await createCouplesRetreat({ isPublic: false });
		const result = await validateCoupleParticipants(makeCoupleInput(retreat.id) as any);
		expect(result.valid).toBe(false);
	});
});

describe('retreatFeeForType — tarifa por pareja', () => {
	it('parte el costo del caminante a la mitad en retiros couples', () => {
		expect(retreatFeeForType('walker', { cost: '$3,000', retreat_type: 'couples' })).toBe(1500);
		expect(retreatFeeForType('walker', { cost: '$3,000', retreat_type: 'men' })).toBe(3000);
		expect(retreatFeeForType('walker', { cost: '$3,000' })).toBe(3000);
	});

	it('parte serverFeeAmount a la mitad en retiros couples (con fallback a cost)', () => {
		expect(
			retreatFeeForType('server', {
				cost: '$3,000',
				serverFeeAmount: 1000,
				retreat_type: 'couples',
			}),
		).toBe(500);
		expect(
			retreatFeeForType('server', { cost: '$3,000', retreat_type: 'couples' }),
		).toBe(1500);
		expect(retreatFeeForType('server', { cost: '$3,000', serverFeeAmount: 1000 })).toBe(1000);
	});

	it('angelito sigue sin cobro de retiro', () => {
		expect(
			retreatFeeForType('partial_server', { cost: '$3,000', retreat_type: 'couples' }),
		).toBe(0);
	});
});
