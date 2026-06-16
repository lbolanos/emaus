import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { AppDataSource } from '@/data-source';
import { Session } from '@/entities/session.entity';
import { revokeUserSessions } from '@/services/sessionService';

/**
 * revokeUserSessions borra las sesiones persistidas de un usuario buscando el
 * fragmento que passport serializa en el JSON: "passport":{"user":"<id>"}.
 * Se usa al cambiar/resetear la contraseña.
 */
describe('revokeUserSessions (integración)', () => {
	const USER_A = '11111111-1111-1111-1111-111111111111';
	const USER_B = '22222222-2222-2222-2222-222222222222';

	const sessionJson = (userId: string) =>
		JSON.stringify({ cookie: {}, passport: { user: userId }, csrfToken: 'x' });

	async function seedSession(id: string, userId: string) {
		await AppDataSource.getRepository(Session).save({
			id,
			expiredAt: Date.now() + 60_000,
			json: sessionJson(userId),
		});
	}

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// clearTestData usa el nombre 'session' (singular); la tabla real es
		// 'sessions', así que la limpiamos explícitamente para counts fiables.
		await AppDataSource.getRepository(Session).clear();
		await seedSession('a-current', USER_A);
		await seedSession('a-other', USER_A);
		await seedSession('b-session', USER_B);
	});

	test('revoca todas las sesiones del usuario, sin tocar a otros', async () => {
		const deleted = await revokeUserSessions(USER_A);
		expect(deleted).toBe(2);

		const repo = AppDataSource.getRepository(Session);
		expect(await repo.findOneBy({ id: 'a-current' })).toBeNull();
		expect(await repo.findOneBy({ id: 'a-other' })).toBeNull();
		// La sesión de otro usuario sobrevive.
		expect(await repo.findOneBy({ id: 'b-session' })).not.toBeNull();
	});

	test('conserva la sesión excluida (la actual del propio request)', async () => {
		const deleted = await revokeUserSessions(USER_A, 'a-current');
		expect(deleted).toBe(1);

		const repo = AppDataSource.getRepository(Session);
		expect(await repo.findOneBy({ id: 'a-current' })).not.toBeNull();
		expect(await repo.findOneBy({ id: 'a-other' })).toBeNull();
		expect(await repo.findOneBy({ id: 'b-session' })).not.toBeNull();
	});

	test('no borra nada y devuelve 0 con userId vacío', async () => {
		const deleted = await revokeUserSessions('');
		expect(deleted).toBe(0);
		expect(await AppDataSource.getRepository(Session).count()).toBe(3);
	});
});
