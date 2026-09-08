/**
 * Guard de la lista de referencias a `Participant`.
 *
 * La fusión de duplicados reapunta lo que esté en `PARTICIPANT_REFERENCES`. Si
 * alguien añade una columna que apunte a un participante y no la registra ahí,
 * la fusión deja esos datos huérfanos **en silencio**: apuntando a una ficha que
 * ya es una lápida.
 *
 * Este test compara la lista contra el esquema real. Cazó su primer caso al
 * escribirla: `service_teams.leaderId` no acaba en "participantId" y un barrido
 * por nombre no la veía.
 */
import { setupTestDatabase, teardownTestDatabase } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { PARTICIPANT_REFERENCES } from '@/services/participantMergeService';

/**
 * Columnas que apuntan a un participante SIN FK declarada. Van a mano porque el
 * esquema no las puede delatar; están aquí para que el test también las exija.
 */
const KNOWN_WITHOUT_FK = [
	'santisimo_signup.participantId',
	'tables.liderId',
	'tables.colider1Id',
	'tables.colider2Id',
	'users.participantId',
	'retreat_participants.spouseParticipantId',
];

describe('PARTICIPANT_REFERENCES', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	const declaredForeignKeys = async (): Promise<string[]> => {
		const ds = TestDataFactory.getDataSource();
		const tables: { name: string }[] = await ds.query(
			`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'`,
		);
		const found: string[] = [];
		for (const { name } of tables) {
			const fks: { table: string; from: string }[] = await ds.query(
				`PRAGMA foreign_key_list("${name}")`,
			);
			for (const fk of fks) {
				if (fk.table === 'participants') found.push(`${name}.${fk.from}`);
			}
		}
		return found;
	};

	it('cubre todas las FK declaradas hacia participants', async () => {
		const registered = new Set(PARTICIPANT_REFERENCES.map((r) => `${r.table}.${r.column}`));
		const missing = (await declaredForeignKeys()).filter((ref) => !registered.has(ref));

		expect(missing).toEqual([]);
	});

	it('cubre las columnas sin FK que apuntan a un participante', () => {
		const registered = new Set(PARTICIPANT_REFERENCES.map((r) => `${r.table}.${r.column}`));
		expect(KNOWN_WITHOUT_FK.filter((ref) => !registered.has(ref))).toEqual([]);
	});

	it('no registra referencias que el esquema no tenga', async () => {
		const ds = TestDataFactory.getDataSource();
		const stale: string[] = [];
		for (const ref of PARTICIPANT_REFERENCES) {
			const cols: { name: string }[] = await ds.query(`PRAGMA table_info("${ref.table}")`);
			if (!cols.some((c) => c.name === ref.column)) stale.push(`${ref.table}.${ref.column}`);
		}
		// Una entrada que ya no existe hace que la fusión reviente a mitad, con
		// parte de los datos movidos.
		expect(stale).toEqual([]);
	});

	it('no tiene entradas duplicadas', () => {
		const keys = PARTICIPANT_REFERENCES.map((r) => `${r.table}.${r.column}`);
		expect(keys).toHaveLength(new Set(keys).size);
	});
});
