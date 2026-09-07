/**
 * Integration test (TypeORM real, vía testDataSource) para el `nickname` que
 * `getReceptionStats` agrega a cada caminante.
 *
 * En la puerta mucha gente se presenta por su apodo, así que el buscador de
 * recepción tiene que poder encontrarlo. Sin este campo en el payload, el
 * frontend no tiene por dónde buscar.
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { getReceptionStats, setParticipantCheckIn } from '@/services/participantService';

describe('getReceptionStats - nickname', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('incluye el apodo del caminante en la lista de pendientes', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'José Luis',
			lastName: 'García Ramírez',
			nickname: 'Pepe',
		});

		const stats = await getReceptionStats(retreat.id);
		const entry = stats.pendingList.find((p) => p.participantId === walker.id);

		expect(entry).toBeDefined();
		expect(entry!.nickname).toBe('Pepe');
	});

	it('mantiene el apodo cuando el caminante ya llegó', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Ana',
			lastName: 'Pérez',
			nickname: 'Anita',
		});

		await setParticipantCheckIn(walker.id, retreat.id, true);

		const stats = await getReceptionStats(retreat.id);
		const entry = stats.arrivedList.find((p) => p.participantId === walker.id);

		expect(entry).toBeDefined();
		expect(entry!.nickname).toBe('Anita');
	});

	it('reporta null cuando el caminante no tiene apodo', async () => {
		const retreat = await TestDataFactory.createTestRetreat();
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			firstName: 'Sin',
			lastName: 'Apodo',
			nickname: undefined,
		});

		const stats = await getReceptionStats(retreat.id);
		const entry = stats.pendingList.find((p) => p.participantId === walker.id);

		expect(entry).toBeDefined();
		expect(entry!.nickname).toBeNull();
	});
});
