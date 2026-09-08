/**
 * El runner tiene que respetar el `transaction = false` de cada migración.
 *
 * 26 migraciones del repo lo declaran y `sqliteSafePattern.simple.test.ts` lo
 * exige cuando hay un DROP TABLE, pero el runner leía SOLO el flag del llamador.
 * Por el camino del arranque del API —`migration-verifier.ts` pasa
 * `transaction: true`, y en dev eso corre con cada reinicio de nodemon— toda
 * migración recreate-table quedaba envuelta en una transacción, donde SQLite
 * ignora en silencio `PRAGMA foreign_keys = OFF` y el DROP cascadea a las hijas.
 *
 * Tres capas, a propósito:
 *  1. la política, probada de verdad (módulo puro);
 *  2. el peligro, reproducido contra SQLite real — para que el "por qué" no se
 *     pudra en un comentario;
 *  3. el cableado del runner, comprobado sobre el fuente, porque
 *     `base-migration-manager.ts` usa `import.meta.url` y Jest no puede
 *     importarlo. Es la razón de que este código nunca tuviera tests.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { DataSource } from 'typeorm';
import { shouldUseTransaction } from '@/database/transaction-policy';

describe('1. la política de transacción', () => {
	it('el llamador manda: sin su flag, nunca hay transacción', () => {
		expect(shouldUseTransaction({}, false)).toBe(false);
		expect(shouldUseTransaction({}, undefined)).toBe(false);
		expect(shouldUseTransaction({ transaction: true }, false)).toBe(false);
	});

	it('con el flag del llamador, una migración normal va envuelta', () => {
		expect(shouldUseTransaction({}, true)).toBe(true);
		expect(shouldUseTransaction({ transaction: true }, true)).toBe(true);
		expect(shouldUseTransaction(null, true)).toBe(true);
	});

	it('`transaction = false` de la migración gana sobre el flag del llamador', () => {
		expect(shouldUseTransaction({ transaction: false }, true)).toBe(false);
	});
});

describe('2. por qué importa: SQLite ignora el PRAGMA dentro de una transacción', () => {
	let ds: DataSource;
	let dir: string;

	const seed = async () => {
		await ds.query(`PRAGMA foreign_keys = ON`);
		await ds.query(`CREATE TABLE "parent" (id INTEGER PRIMARY KEY, label TEXT)`);
		await ds.query(
			`CREATE TABLE "child" (id INTEGER PRIMARY KEY, parentId INTEGER NOT NULL
			   REFERENCES "parent"(id) ON DELETE CASCADE)`,
		);
		await ds.query(`INSERT INTO "parent" (id, label) VALUES (1, 'uno'), (2, 'dos')`);
		await ds.query(`INSERT INTO "child" (id, parentId) VALUES (10, 1), (11, 1), (12, 2)`);
	};

	/** El patrón recreate-table del skill `sqlite-migrations`. */
	const recreateParent = async () => {
		await ds.query(`PRAGMA foreign_keys = OFF`);
		await ds.query(`CREATE TABLE "parent_new" (id INTEGER PRIMARY KEY, label TEXT, extra TEXT)`);
		await ds.query(`INSERT INTO "parent_new" (id, label) SELECT id, label FROM "parent"`);
		await ds.query(`DROP TABLE "parent"`);
		await ds.query(`ALTER TABLE "parent_new" RENAME TO "parent"`);
		await ds.query(`PRAGMA foreign_keys = ON`);
	};

	const childCount = async (): Promise<number> =>
		Number((await ds.query(`SELECT COUNT(*) AS c FROM "child"`))[0].c);

	beforeEach(async () => {
		dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-tx-'));
		ds = new DataSource({ type: 'sqlite', database: path.join(dir, 'test.sqlite'), synchronize: false });
		await ds.initialize();
		await seed();
	});

	afterEach(async () => {
		if (ds?.isInitialized) await ds.destroy();
		fs.rmSync(dir, { recursive: true, force: true });
	});

	it('FUERA de transacción el PRAGMA funciona y las filas hijas sobreviven', async () => {
		await recreateParent();
		expect(await childCount()).toBe(3);
	});

	it('DENTRO de transacción el PRAGMA se ignora y el DROP se lleva las hijas', async () => {
		await ds.query(`BEGIN TRANSACTION`);
		await recreateParent();
		await ds.query(`COMMIT`);
		// Cero. Sin error, sin warning: es el incidente del 2026-05-07.
		expect(await childCount()).toBe(0);
	});
});

describe('3. el runner usa la política en los dos caminos', () => {
	const source = fs.readFileSync(
		path.join(__dirname, '../../database/base-migration-manager.ts'),
		'utf8',
	);

	/** El cuerpo de un método, desde su firma hasta el siguiente `protected async`. */
	const bodyOf = (signature: string): string => {
		const from = source.indexOf(signature);
		expect(from).toBeGreaterThan(-1);
		const rest = source.slice(from + signature.length);
		const to = rest.indexOf('\tprotected async ');
		return to === -1 ? rest : rest.slice(0, to);
	};

	it.each(['protected async runMigration(', 'protected async revertMigration('])(
		'%s decide con shouldUseTransaction y no con el flag crudo',
		(signature) => {
			const body = bodyOf(signature);
			expect(body).toContain('shouldUseTransaction(migrationClass, options.transaction)');
			// Si esto falla, alguien volvió a decidir con el flag del llamador y las
			// migraciones recreate-table vuelven a correr envueltas. No lo silencies.
			expect(body).not.toMatch(/if \(options\.transaction\) \{/);
		},
	);

	it('la clase se carga ANTES de abrir la transacción (si no, no se puede leer su flag)', () => {
		const body = bodyOf('protected async runMigration(');
		expect(body.indexOf('loadMigration')).toBeLessThan(body.indexOf('beginTransaction'));
	});
});
