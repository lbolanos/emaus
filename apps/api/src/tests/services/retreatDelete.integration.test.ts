/**
 * deleteRetreat — borrado en cascada seguro + matriz de autorización.
 *
 * Matriz:
 *   - superadmin → borra cualquier retiro, con o sin participantes.
 *   - admin      → solo retiros que él creó (createdBy) y SIN participantes activos.
 *
 * El borrado es explícito (no confía en ON DELETE CASCADE): verificamos que el retiro
 * y sus tablas hijas quedan vacías (sin huérfanos).
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { deleteRetreat, getRetreatDeletionImpact } from '../../services/retreatService';
import { authorizationService } from '../../middleware/authorization';
import { Retreat } from '../../entities/retreat.entity';
import { TableMesa } from '../../entities/tableMesa.entity';
import { MessageTemplate } from '../../entities/messageTemplate.entity';
import { RetreatParticipant } from '../../entities/retreatParticipant.entity';
import type { DataSource } from 'typeorm';

describe('deleteRetreat (cascada + autorización)', () => {
	let ds: DataSource;

	beforeAll(async () => {
		ds = (await setupTestDatabase()) as DataSource;
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	afterEach(() => {
		jest.restoreAllMocks();
	});

	// Crea un retiro con hijas representativas (mesas + plantillas de mensajes).
	async function seedRetreatWithChildren(overrides: Partial<Retreat> = {}) {
		const retreat = await TestDataFactory.createTestRetreat(overrides);
		await TestDataFactory.createTestTables(retreat.id, 3);
		await TestDataFactory.createTestMessageTemplates(retreat.id);
		return retreat;
	}

	async function addActiveParticipant(retreatId: string) {
		const repo = ds.getRepository(RetreatParticipant);
		await repo.save(
			repo.create({
				retreatId,
				roleInRetreat: 'walker',
				type: 'walker',
				isCancelled: false,
			}),
		);
	}

	it('superadmin borra un retiro y elimina sus hijas (sin huérfanos)', async () => {
		jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
		const retreat = await seedRetreatWithChildren();

		// Precondición: las hijas existen.
		expect(await ds.getRepository(TableMesa).count({ where: { retreatId: retreat.id } })).toBe(3);
		expect(
			await ds.getRepository(MessageTemplate).count({ where: { retreatId: retreat.id } }),
		).toBeGreaterThan(0);

		await deleteRetreat(retreat.id, { id: 'super-user' }, ds);

		expect(await ds.getRepository(Retreat).findOne({ where: { id: retreat.id } })).toBeNull();
		expect(await ds.getRepository(TableMesa).count({ where: { retreatId: retreat.id } })).toBe(0);
		expect(
			await ds.getRepository(MessageTemplate).count({ where: { retreatId: retreat.id } }),
		).toBe(0);
	});

	it('superadmin puede borrar un retiro CON participantes (borra todo)', async () => {
		jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
		const retreat = await seedRetreatWithChildren();
		await addActiveParticipant(retreat.id);

		await deleteRetreat(retreat.id, { id: 'super-user' }, ds);

		expect(await ds.getRepository(Retreat).findOne({ where: { id: retreat.id } })).toBeNull();
		expect(
			await ds.getRepository(RetreatParticipant).count({ where: { retreatId: retreat.id } }),
		).toBe(0);
	});

	it('admin creador SIN participantes puede borrar', async () => {
		jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
		const admin = await TestDataFactory.createTestUser();
		const retreat = await seedRetreatWithChildren({ createdBy: admin.id });

		await deleteRetreat(retreat.id, { id: admin.id }, ds);

		expect(await ds.getRepository(Retreat).findOne({ where: { id: retreat.id } })).toBeNull();
	});

	it('admin creador CON participante activo → 409 y no borra', async () => {
		jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
		const admin = await TestDataFactory.createTestUser();
		const retreat = await seedRetreatWithChildren({ createdBy: admin.id });
		await addActiveParticipant(retreat.id);

		await expect(deleteRetreat(retreat.id, { id: admin.id }, ds)).rejects.toMatchObject({
			statusCode: 409,
		});
		expect(await ds.getRepository(Retreat).findOne({ where: { id: retreat.id } })).not.toBeNull();
	});

	it('admin NO creador → 403 y no borra', async () => {
		jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(false);
		const owner = await TestDataFactory.createTestUser();
		const other = await TestDataFactory.createTestUser();
		const retreat = await seedRetreatWithChildren({ createdBy: owner.id });

		await expect(deleteRetreat(retreat.id, { id: other.id }, ds)).rejects.toMatchObject({
			statusCode: 403,
		});
		expect(await ds.getRepository(Retreat).findOne({ where: { id: retreat.id } })).not.toBeNull();
	});

	it('retiro inexistente → 404', async () => {
		jest.spyOn(authorizationService, 'hasRole').mockResolvedValue(true);
		await expect(
			deleteRetreat('nonexistent-id', { id: 'super-user' }, ds),
		).rejects.toMatchObject({ statusCode: 404 });
	});

	it('getRetreatDeletionImpact devuelve los conteos correctos', async () => {
		const retreat = await seedRetreatWithChildren();
		await addActiveParticipant(retreat.id);

		const impact = await getRetreatDeletionImpact(retreat.id, ds);

		expect(impact.tables).toBe(3);
		expect(impact.activeParticipants).toBe(1);
		expect(impact.totalRegistrations).toBeGreaterThanOrEqual(1);
	});
});
