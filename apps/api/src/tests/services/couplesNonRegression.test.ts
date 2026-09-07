/**
 * Garantía de NO REGRESIÓN de la feature de retiros de matrimonios.
 *
 * Todo lo que agregó esa feature debe estar apagado en los retiros que no son
 * de parejas (men/women/effeta y los que no declaran tipo). Este archivo existe
 * porque hay retiros reales en curso —Celaya— que corren con este código: si
 * alguna de estas afirmaciones se rompe, la feature se está filtrando.
 *
 * Cubre las cinco superficies que la feature tocó y que comparten todos los retiros:
 *   1. Índice de email (la migración lo reescribió).
 *   2. Auto-asignación de camas (mapa de género + parejas primero).
 *   3. Rebalanceo de mesas (parejas juntas/separadas).
 *   4. Cambio de tipo en updateParticipant (espejo de lista de espera).
 *   5. Tarifa del retiro (mitad por cónyuge).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { autoAssignBedsForRetreat, updateParticipant } from '@/services/participantService';
import { rebalanceTablesForRetreat } from '@/services/tableMesaService';
import { retreatFeeForType } from '@/utils/retreatCharges';

const FUTURE = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

/** Retiro de hombres, como los que están en curso hoy. */
const createMensRetreat = (overrides: Record<string, unknown> = {}) =>
	TestDataFactory.createTestRetreat({
		retreat_type: 'men',
		isPublic: true,
		endDate: FUTURE,
		...overrides,
	} as any);

const cleanParticipants = async () => {
	const ds = TestDataFactory.getDataSource();
	await ds.query(`DELETE FROM retreat_bed`);
	await ds.query(`DELETE FROM retreat_participants`);
	await ds.query(`DELETE FROM participants`);
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

describe('No regresión: retiros que NO son de parejas', () => {
	beforeAll(async () => {
		await setupTestDatabase();
		// setupTestDatabase sincroniza el esquema desde las entities, que NO
		// declaran índices: sin esto la base de test no tiene
		// UQ_participants_email_retreat y el guard de correo duplicado pasaría
		// en verde sin estar probando nada. Se instala el índice real.
		const mod = await import('@/migrations/sqlite/20260822130000_AddCouplesRetreatSupport');
		const migration = new mod.AddCouplesRetreatSupport20260822130000();
		const qr = TestDataFactory.getDataSource().createQueryRunner();
		await migration.down(qr);
		await migration.up(qr);
		await qr.release();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		await cleanParticipants();
	});

	describe('índice de email', () => {
		it('sigue bloqueando el mismo correo dos veces en el retiro', async () => {
			const retreat = await createMensRetreat();
			await TestDataFactory.createTestParticipant(retreat.id, { email: 'juan@example.com' });
			await expect(
				TestDataFactory.createTestParticipant(retreat.id, { email: 'juan@example.com' }),
			).rejects.toThrow();
		});

		it('sigue permitiendo el mismo correo en retiros distintos', async () => {
			const a = await createMensRetreat();
			const b = await createMensRetreat();
			await TestDataFactory.createTestParticipant(a.id, { email: 'juan@example.com' });
			const second = await TestDataFactory.createTestParticipant(b.id, {
				email: 'juan@example.com',
			});
			expect(second.id).toBeTruthy();
		});
	});

	describe('asignación de camas', () => {
		it('asigna camas como siempre (sin lógica de pareja)', async () => {
			const retreat = await createMensRetreat();
			await TestDataFactory.createTestBeds(retreat.id, retreat.houseId, 20);
			for (let i = 0; i < 4; i++) {
				await TestDataFactory.createTestParticipant(retreat.id, {
					email: `walker${i}@example.com`,
					birthDate: new Date(`197${i}-01-01`),
				});
			}

			const result = await autoAssignBedsForRetreat(retreat.id);
			expect(result.assigned).toBe(4);
			expect(result.skipped).toBe(0);
		});

		it('NO aplica el filtro de género aunque los participantes tengan gender', async () => {
			// Un retiro de hombres cuyos participantes traen gender (p. ej. porque
			// alguien lo editó): el filtro duro es exclusivo de los retiros de
			// parejas con habitaciones separadas y aquí no debe activarse.
			const retreat = await createMensRetreat();
			await TestDataFactory.createTestBeds(retreat.id, retreat.houseId, 20);
			for (let i = 0; i < 4; i++) {
				await TestDataFactory.createTestParticipant(retreat.id, {
					email: `mixed${i}@example.com`,
					gender: i % 2 === 0 ? 'M' : 'F',
					birthDate: new Date(`197${i}-01-01`),
				});
			}

			const result = await autoAssignBedsForRetreat(retreat.id);
			// Los 4 reciben cama: ninguna habitación queda vetada por género.
			expect(result.assigned).toBe(4);
			expect(result.skipped).toBe(0);
		});
	});

	describe('rebalanceo de mesas', () => {
		it('distribuye a los caminantes como siempre', async () => {
			const retreat = await createMensRetreat();
			await TestDataFactory.createTestTables(retreat.id, 2);
			const ids: string[] = [];
			for (let i = 0; i < 6; i++) {
				const p = await TestDataFactory.createTestParticipant(retreat.id, {
					email: `mesa${i}@example.com`,
				});
				ids.push(p.id);
			}

			await rebalanceTablesForRetreat(retreat.id, TestDataFactory.getDataSource());

			const assigned = [];
			for (const id of ids) assigned.push((await rpOf(id, retreat.id)).tableId);
			// Todos con mesa y repartidos entre las dos disponibles.
			expect(assigned.every(Boolean)).toBe(true);
			expect(new Set(assigned).size).toBe(2);
		});
	});

	describe('cambio de tipo', () => {
		it('mover a alguien a lista de espera no arrastra a nadie más', async () => {
			const retreat = await createMensRetreat();
			const a = await TestDataFactory.createTestParticipant(retreat.id, {
				email: 'uno@example.com',
			});
			const b = await TestDataFactory.createTestParticipant(retreat.id, {
				email: 'dos@example.com',
			});

			await updateParticipant(a.id, { type: 'waiting' } as any, true);

			expect((await rpOf(a.id, retreat.id)).type).toBe('waiting');
			// El otro caminante del retiro sigue intacto.
			expect((await rpOf(b.id, retreat.id)).type).toBe('walker');
		});

		it('sacar a alguien de lista de espera tampoco arrastra a nadie', async () => {
			const retreat = await createMensRetreat();
			const a = await TestDataFactory.createTestParticipant(retreat.id, {
				email: 'uno@example.com',
				type: 'waiting',
			} as any);
			const b = await TestDataFactory.createTestParticipant(retreat.id, {
				email: 'dos@example.com',
				type: 'waiting',
			} as any);

			await updateParticipant(a.id, { type: 'walker' } as any, true);

			expect((await rpOf(a.id, retreat.id)).type).toBe('walker');
			expect((await rpOf(b.id, retreat.id)).type).toBe('waiting');
		});
	});

	describe('tarifa del retiro', () => {
		it('cobra el costo completo en retiros que no son de parejas', () => {
			expect(retreatFeeForType('walker', { cost: '$3,000', retreat_type: 'men' })).toBe(3000);
			expect(retreatFeeForType('walker', { cost: '$3,000', retreat_type: 'women' })).toBe(3000);
			expect(retreatFeeForType('walker', { cost: '$3,000', retreat_type: 'effeta' })).toBe(3000);
			// Sin tipo declarado (el caso de los retiros más viejos).
			expect(retreatFeeForType('walker', { cost: '$3,000' })).toBe(3000);
			expect(retreatFeeForType('walker', { cost: '$3,000', retreat_type: null })).toBe(3000);
		});

		it('cobra el fee de servidor completo', () => {
			expect(
				retreatFeeForType('server', { cost: '$3,000', serverFeeAmount: 900, retreat_type: 'men' }),
			).toBe(900);
			expect(retreatFeeForType('server', { cost: '$3,000', serverFeeAmount: 900 })).toBe(900);
		});
	});

	describe('participantes sin vínculo de pareja', () => {
		it('un participante de un retiro normal no queda vinculado a nadie', async () => {
			const retreat = await createMensRetreat();
			const p = await TestDataFactory.createTestParticipant(retreat.id, {
				email: 'solo@example.com',
			});
			const rp = await rpOf(p.id, retreat.id);
			expect(rp.spouseParticipantId).toBeNull();
		});
	});
});
