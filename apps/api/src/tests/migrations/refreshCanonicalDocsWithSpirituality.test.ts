/**
 * Functional test para RefreshCanonicalDocsWithSpirituality20260908120000.
 *
 * La migración lleva el bloque de sentido a las copias ya sembradas en la base
 * (attachments, descripciones por retiro e instrucciones de equipo) SOLO cuando nadie
 * las editó. Lo que se verifica aquí es justamente esa frontera: se refresca la copia
 * canónica intacta y se respeta la que un coordinador tocó.
 *
 * El "texto viejo" de cada fixture se reconstruye quitando el bloque al texto actual —
 * el mismo truco que valida `responsibilityDocsSpirituality.simple.test.ts`: si eso
 * reprodujera algo distinto del original, sus hashes no estarían en canonicalDocHashes.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { responsibilityDocumentation } from '@/data/charlaDocumentation';
import { SERVICE_TEAM_INSTRUCTIONS } from '@/data/serviceTeamInstructions';

const FIRST_HEADING = '### Objetivo';
const LAST_HEADING = '### El regalo de servir aquí';

const withoutBlock = (content: string) => {
	const start = content.indexOf(FIRST_HEADING);
	if (start === -1) return content;
	const after = content.indexOf('\n\n', content.indexOf(LAST_HEADING));
	return content.slice(0, start) + content.slice(after === -1 ? content.length : after + 2);
};

const NEW_TESORERO = responsibilityDocumentation['Tesorero'];
const OLD_TESORERO = withoutBlock(NEW_TESORERO);
const NEW_COCINA = SERVICE_TEAM_INSTRUCTIONS['Cocina / Comedor'];
const OLD_COCINA = withoutBlock(NEW_COCINA);

describe('RefreshCanonicalDocsWithSpirituality20260908120000', () => {
	let migration: any;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import(
			'@/migrations/sqlite/20260908120000_RefreshCanonicalDocsWithSpirituality'
		);
		migration = new mod.RefreshCanonicalDocsWithSpirituality20260908120000();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	let seq = 0;

	beforeEach(async () => {
		await clearTestData();
		// Los attachments son globales (no cuelgan de un retiro), así que clearTestData
		// no los alcanza y se acumularían entre casos.
		const ds = TestDataFactory.getDataSource();
		await ds.query(`DELETE FROM "responsability_attachment_history"`);
		await ds.query(`DELETE FROM "responsability_attachment"`);
		seq = 0;
	});

	const nextId = (prefix: string) => `${prefix}-${++seq}`;

	const run = async (direction: 'up' | 'down' = 'up') => {
		const qr = TestDataFactory.getDataSource().createQueryRunner();
		await migration[direction](qr);
		await qr.release();
	};

	const insertAttachment = async (name: string, content: string) => {
		const ds = TestDataFactory.getDataSource();
		const id = nextId('att');
		await ds.query(
			`INSERT INTO "responsability_attachment"
			   ("id", "responsabilityName", "kind", "fileName", "mimeType", "sizeBytes", "storageUrl",
			    "content", "description", "sortOrder", "createdAt", "updatedAt")
			 VALUES (?, ?, 'markdown', ?, 'text/markdown', ?, 'data:text/markdown;base64,vieja',
			         ?, 'Guion canónico', 10, datetime('now'), datetime('now'))`,
			[id, name, `Guion ${name}.md`, Buffer.byteLength(content, 'utf-8'), content],
		);
		return id;
	};

	const attachment = async (id: string) => {
		const [row] = await TestDataFactory.getDataSource().query(
			`SELECT "content", "sizeBytes", "storageUrl" FROM "responsability_attachment" WHERE "id" = ?`,
			[id],
		);
		return row;
	};

	const insertResponsibility = async (retreatId: string, name: string, description: string | null) => {
		const ds = TestDataFactory.getDataSource();
		const id = nextId('resp');
		await ds.query(
			`INSERT INTO "retreat_responsibilities"
			   ("id", "name", "description", "responsabilityType", "isLeadership", "priority",
			    "isActive", "retreatId", "createdAt", "updatedAt")
			 VALUES (?, ?, ?, 'otro', 0, 0, 1, ?, datetime('now'), datetime('now'))`,
			[id, name, description, retreatId],
		);
		return id;
	};

	const descriptionOf = async (id: string) => {
		const [row] = await TestDataFactory.getDataSource().query(
			`SELECT "description" FROM "retreat_responsibilities" WHERE "id" = ?`,
			[id],
		);
		return row.description as string | null;
	};

	const insertTeam = async (retreatId: string, name: string, instructions: string) => {
		const ds = TestDataFactory.getDataSource();
		const id = nextId('team');
		await ds.query(
			`INSERT INTO "service_teams"
			   ("id", "name", "teamType", "description", "instructions", "retreatId", "priority", "isActive")
			 VALUES (?, ?, 'cocina', 'Equipo', ?, ?, 1, 1)`,
			[id, name, instructions, retreatId],
		);
		return id;
	};

	const instructionsOf = async (id: string) => {
		const [row] = await TestDataFactory.getDataSource().query(
			`SELECT "instructions" FROM "service_teams" WHERE "id" = ?`,
			[id],
		);
		return row.instructions as string | null;
	};

	const historyCount = async (attachmentId: string) => {
		const [row] = await TestDataFactory.getDataSource().query(
			`SELECT COUNT(*) AS n FROM "responsability_attachment_history" WHERE "attachmentId" = ?`,
			[attachmentId],
		);
		return Number(row.n);
	};

	describe('attachments markdown', () => {
		it('refresca la copia canónica intacta y deja coherentes sizeBytes y storageUrl', async () => {
			const id = await insertAttachment('Tesorero', OLD_TESORERO);

			await run();

			const row = await attachment(id);
			expect(row.content).toBe(NEW_TESORERO);
			expect(row.sizeBytes).toBe(Buffer.byteLength(NEW_TESORERO, 'utf-8'));
			const decoded = Buffer.from(row.storageUrl.split('base64,')[1], 'base64').toString('utf-8');
			expect(decoded).toBe(NEW_TESORERO);
		});

		it('guarda la versión previa en el historial, restaurable desde el diálogo', async () => {
			const id = await insertAttachment('Tesorero', OLD_TESORERO);

			await run();

			const [entry] = await TestDataFactory.getDataSource().query(
				`SELECT "title", "content", "savedById" FROM "responsability_attachment_history" WHERE "attachmentId" = ?`,
				[id],
			);
			expect(entry.content).toBe(OLD_TESORERO);
			expect(entry.title).toBe('Guion Tesorero');
			expect(entry.savedById).toBeNull();
		});

		it('NO toca el documento que un coordinador editó', async () => {
			const edited = `${OLD_TESORERO}\n\n## Nota de la comunidad\nEste año la caja la lleva la parroquia.`;
			const id = await insertAttachment('Tesorero', edited);

			await run();

			expect((await attachment(id)).content).toBe(edited);
			expect(await historyCount(id)).toBe(0);
		});

		it('ignora nombres que no están en el catálogo canónico', async () => {
			const id = await insertAttachment('Comité de bienvenida inventado', 'texto propio del retiro');

			await run();

			expect((await attachment(id)).content).toBe('texto propio del retiro');
		});

		it('correr la migración dos veces no cambia nada ni duplica el historial', async () => {
			const id = await insertAttachment('Tesorero', OLD_TESORERO);

			await run();
			await run();

			expect((await attachment(id)).content).toBe(NEW_TESORERO);
			expect(await historyCount(id)).toBe(1);
		});
	});

	describe('descripción de la responsabilidad en cada retiro', () => {
		it('refresca la descripción canónica intacta', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const id = await insertResponsibility(retreat.id, 'Tesorero', OLD_TESORERO);

			await run();

			expect(await descriptionOf(id)).toBe(NEW_TESORERO);
		});

		it('rellena la descripción vacía o de relleno de los retiros viejos', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const emptyOne = await insertResponsibility(retreat.id, 'Tesorero', null);
			const leftoverOne = await insertResponsibility(retreat.id, 'Campanero', 'A-2-1');

			await run();

			expect(await descriptionOf(emptyOne)).toBe(NEW_TESORERO);
			expect(await descriptionOf(leftoverOne)).toBe(responsibilityDocumentation['Campanero']);
		});

		it('crea la documentación de Despedida, que nunca tuvo una', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const id = await insertResponsibility(retreat.id, 'Despedida', null);

			await run();

			const description = await descriptionOf(id);
			expect(description).toBe(responsibilityDocumentation['Despedida']);
			expect(description).toContain(LAST_HEADING);
		});

		it('NO toca una nota corta escrita por el coordinador', async () => {
			// El caso que la heurística de longitud destruía: una nota propia de menos de 50
			// caracteres se parecía a un resto del sistema y se sobrescribía sin mirar el hash.
			const retreat = await TestDataFactory.createTestRetreat();
			const note = 'La lleva Juan este año.';
			expect(note.length).toBeLessThan(50);
			const id = await insertResponsibility(retreat.id, 'Tesorero', note);

			await run();

			expect(await descriptionOf(id)).toBe(note);
		});

		it('NO toca la descripción que alguien reescribió para su retiro', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const own = 'Nuestro tesorero además cobra las cuotas de la comunidad. Ver acuerdo de la asamblea.';
			const id = await insertResponsibility(retreat.id, 'Tesorero', own);

			await run();

			expect(await descriptionOf(id)).toBe(own);
		});
	});

	describe('instrucciones de equipo de servicio', () => {
		it('refresca las instrucciones canónicas intactas', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const id = await insertTeam(retreat.id, 'Cocina / Comedor', OLD_COCINA);

			await run();

			expect(await instructionsOf(id)).toBe(NEW_COCINA);
		});

		it('NO toca las instrucciones que el equipo adaptó', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const own = `${OLD_COCINA}\n\n### Nuestra casa\nLa cocina cierra a las 22:00.`;
			const id = await insertTeam(retreat.id, 'Cocina / Comedor', own);

			await run();

			expect(await instructionsOf(id)).toBe(own);
		});
	});

	describe('down()', () => {
		it('devuelve el attachment a su versión previa y limpia el historial que creó', async () => {
			const id = await insertAttachment('Tesorero', OLD_TESORERO);
			await run();

			await run('down');

			const row = await attachment(id);
			expect(row.content).toBe(OLD_TESORERO);
			expect(row.sizeBytes).toBe(Buffer.byteLength(OLD_TESORERO, 'utf-8'));
			expect(await historyCount(id)).toBe(0);
		});

		it('no toca un documento que la migración nunca escribió', async () => {
			const edited = `${OLD_TESORERO}\n\n## Nota\nAdaptado.`;
			const id = await insertAttachment('Tesorero', edited);

			await run('down');

			expect((await attachment(id)).content).toBe(edited);
		});
	});
});
