/**
 * Functional test para CleanCustomMessagePlaceholder20261003120000 (M4).
 *
 * `{custom_message}` es un hueco de envío manual: la bandeja de WhatsApp no
 * edita el texto, así que una secuencia que lo usa despacha el placeholder
 * literal. La migración limpia el dato existente en TODAS las plantillas (sin
 * filtro de type — el incidente fue una SERVER_SHIRT_CONFIRMATION), con una
 * frase neutral que se lee como instrucción.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';

const PHRASE = '«Escribe aquí tu mensaje personalizado»';

// Ids deterministas legibles (la migración no tiene ids hardcodeados).
const RETREAT_TPL = 'a1b2c3d4-0000-4000-8000-000000000001'; // GENERAL retreat, HTML
const COMMUNITY_TPL = 'a1b2c3d4-0000-4000-8000-000000000002'; // GENERAL community, texto plano
const SERVER_TPL = 'a1b2c3d4-0000-4000-8000-000000000003'; // SERVER_WELCOME con hueco
const CLEAN_TPL = 'a1b2c3d4-0000-4000-8000-000000000004'; // sin placeholder: intacta

describe('CleanCustomMessagePlaceholder20261003120000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import('@/migrations/sqlite/20261003120000_CleanCustomMessagePlaceholder');
		migration = new mod.CleanCustomMessagePlaceholder20261003120000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM message_templates`);

		const retreat = await TestDataFactory.createTestRetreat();
		const user = await TestDataFactory.createTestUser();
		const community = await TestDataFactory.createTestCommunity(user.id);

		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, communityId, createdAt, updatedAt)
			 VALUES (?, 'Mensaje General', 'GENERAL', 'retreat',
			         '<p>Hola <strong>{participant.nickname}</strong>.</p><p>{custom_message}</p><p>Un abrazo.</p>',
			         ?, NULL, datetime('now'), datetime('now'))`,
			[RETREAT_TPL, retreat.id],
		);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, communityId, createdAt, updatedAt)
			 VALUES (?, 'Mensaje General', 'GENERAL', 'community',
			         'Hola {participant.nickname}\n\n{custom_message}\n\nUn abrazo.',
			         NULL, ?, datetime('now'), datetime('now'))`,
			[COMMUNITY_TPL, community.id],
		);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, communityId, createdAt, updatedAt)
			 VALUES (?, 'Bienvenida servidor', 'SERVER_WELCOME', 'retreat',
			         'Hola {participant.firstName}: {custom_message}',
			         ?, NULL, datetime('now'), datetime('now'))`,
			[SERVER_TPL, retreat.id],
		);
		await ds.query(
			`INSERT INTO message_templates (id, name, type, scope, message, retreatId, communityId, createdAt, updatedAt)
			 VALUES (?, 'Sin hueco', 'GENERAL', 'retreat',
			         'Texto completo, nada que limpiar',
			         ?, NULL, datetime('now'), datetime('now'))`,
			[CLEAN_TPL, retreat.id],
		);
	});

	const runUp = async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.up(qr);
		await qr.release();
	};

	const runDown = async () => {
		const ds = TestDataFactory.getDataSource();
		const qr = ds.createQueryRunner();
		await migration.down(qr);
		await qr.release();
	};

	const messageOf = async (id: string) =>
		(
			await TestDataFactory.getDataSource().query(`SELECT message FROM message_templates WHERE id = ?`, [id])
		)[0].message;

	it('reemplaza el placeholder por la frase neutral en el texto plano y en el HTML, sin filtro de type', async () => {
		await runUp();

		expect(await messageOf(RETREAT_TPL)).toBe(
			`<p>Hola <strong>{participant.nickname}</strong>.</p><p>${PHRASE}</p><p>Un abrazo.</p>`,
		);
		expect(await messageOf(COMMUNITY_TPL)).toBe(
			`Hola {participant.nickname}\n\n${PHRASE}\n\nUn abrazo.`,
		);
		// El incidente fue una SERVER_*: el alcance no puede depender del type.
		expect(await messageOf(SERVER_TPL)).toBe(`Hola {participant.firstName}: ${PHRASE}`);
	});

	it('no toca las plantillas sin placeholder', async () => {
		const before = await messageOf(CLEAN_TPL);
		await runUp();

		expect(await messageOf(CLEAN_TPL)).toBe(before);
	});

	it('down() restaura el placeholder (replace inverso)', async () => {
		await runUp();
		await runDown();

		expect(await messageOf(RETREAT_TPL)).toBe(
			'<p>Hola <strong>{participant.nickname}</strong>.</p><p>{custom_message}</p><p>Un abrazo.</p>',
		);
	});

	it('doble up() converge: la segunda pasada no encuentra nada que reemplazar', async () => {
		await runUp();
		const afterFirst = await messageOf(COMMUNITY_TPL);

		await runUp();

		expect(await messageOf(COMMUNITY_TPL)).toBe(afterFirst);
	});
});
