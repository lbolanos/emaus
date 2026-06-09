/**
 * Checks funcionales de AddMissingServiceTeams20260603120000.
 *
 * La migración (reescrita sin @repo/types — ver skill db-production-resilience)
 * siembra 3 equipos de servicio por retiro: Sacerdotes, Compras y
 * "Examen de Conciencia / Quema de Pecados", y hace backfill del líder de
 * Sacerdotes/Compras desde la responsabilidad homónima.
 *
 * Verificamos: inserción de los 3 equipos con su teamType, backfill del líder
 * (equipo + service_team_member 'líder'), e idempotencia (correr up() dos veces
 * no duplica). Mismo patrón cubre AddComprasSacerdotesTeams (subconjunto: 2 equipos).
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Responsability } from '@/entities/responsability.entity';

describe('AddMissingServiceTeams20260603120000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import('@/migrations/sqlite/20260603120000_AddMissingServiceTeams');
		migration = new mod.AddMissingServiceTeams20260603120000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	async function runUp() {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();
	}

	it('inserta los 3 equipos por retiro con el teamType correcto', async () => {
		const ds = TestDataFactory.getDataSource();
		const retreat = await TestDataFactory.createTestRetreat();

		await runUp();

		const teams = await ds.query(
			`SELECT name, teamType FROM service_teams WHERE retreatId = ? ORDER BY name`,
			[retreat.id],
		);
		const byName: Record<string, any> = Object.fromEntries(teams.map((t: any) => [t.name, t]));
		expect(Object.keys(byName).sort()).toEqual([
			'Compras',
			'Examen de Conciencia / Quema de Pecados',
			'Sacerdotes',
		]);
		expect(byName['Compras'].teamType).toBe('compras');
		expect(byName['Sacerdotes'].teamType).toBe('sacerdotes');
		expect(byName['Examen de Conciencia / Quema de Pecados'].teamType).toBe('dinamica');
	});

	it('hace backfill del líder de Sacerdotes desde la responsabilidad homónima', async () => {
		const ds = TestDataFactory.getDataSource();
		const retreat = await TestDataFactory.createTestRetreat();
		const participant = await TestDataFactory.createTestParticipant(retreat.id);
		await ds.getRepository(Responsability).save({
			name: 'Sacerdotes',
			retreatId: retreat.id,
			participantId: participant.id,
		});

		await runUp();

		const teams = await ds.query(
			`SELECT name, leaderId FROM service_teams WHERE retreatId = ?`,
			[retreat.id],
		);
		const byName: Record<string, any> = Object.fromEntries(teams.map((t: any) => [t.name, t]));
		// Sacerdotes recibió al participante como líder; Compras/Examen no (sin responsabilidad con participante)
		expect(byName['Sacerdotes'].leaderId).toBe(participant.id);
		expect(byName['Compras'].leaderId).toBeFalsy();
		expect(byName['Examen de Conciencia / Quema de Pecados'].leaderId).toBeFalsy();

		// se creó el miembro líder en service_team_members
		const members = await ds.query(
			`SELECT stm.role, stm.participantId FROM service_team_members stm
			 JOIN service_teams st ON st.id = stm.serviceTeamId
			 WHERE st.name = 'Sacerdotes' AND st.retreatId = ?`,
			[retreat.id],
		);
		expect(members).toHaveLength(1);
		expect(members[0].role).toBe('líder');
		expect(members[0].participantId).toBe(participant.id);
	});

	it('es idempotente: correr up() dos veces no duplica equipos ni miembros', async () => {
		const ds = TestDataFactory.getDataSource();
		const retreat = await TestDataFactory.createTestRetreat();
		const participant = await TestDataFactory.createTestParticipant(retreat.id);
		await ds.getRepository(Responsability).save({
			name: 'Sacerdotes',
			retreatId: retreat.id,
			participantId: participant.id,
		});

		await runUp();
		await runUp();

		const teamCount = await ds.query(
			`SELECT COUNT(*) AS n FROM service_teams WHERE retreatId = ?`,
			[retreat.id],
		);
		expect(Number(teamCount[0].n)).toBe(3);

		const memberCount = await ds.query(
			`SELECT COUNT(*) AS n FROM service_team_members stm
			 JOIN service_teams st ON st.id = stm.serviceTeamId WHERE st.retreatId = ?`,
			[retreat.id],
		);
		expect(Number(memberCount[0].n)).toBe(1);
	});
});
