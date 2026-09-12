/**
 * Tests del conteo de pendientes de `showMigrations()` (vía `migration-stats`,
 * el módulo puro — el manager en sí es ESM y Jest no puede importarlo).
 *
 * Regresión del worktree de secuencias (2026-09-12): la DB de dev copiada del
 * master traía registrada una migración cuyo archivo no existía en el branch;
 * con la resta de cardinalidades (120 archivos - 120 filas = 0 pendientes) el
 * arranque reportaba "todo al día" y la migración nueva jamás corría.
 */

import { computeMigrationStats } from '../migration-stats';
import type { NamedMigration } from '../migration-stats';

const migration = (name: string, timestamp: string): NamedMigration => ({ name, timestamp });

describe('computeMigrationStats — pendientes por nombre, no por cardinalidad', () => {
	it('una migración registrada sin archivo no enmascara las nuevas', () => {
		const fs = [migration('OldMigration', '20260101000000'), migration('NewMigration', '20260912140000')];
		const db = [migration('OldMigration', '20260101000000'), migration('GhostMigration', '20260912120000')];

		// La fantasma compensaba la cuenta: 2 - 2 = 0 pendientes (el bug).
		const stats = computeMigrationStats(fs, db);

		expect(stats.total).toBe(2);
		expect(stats.pending).toBe(1);
		// executed cuenta sólo archivos registrados: total = executed + pending.
		expect(stats.executed).toBe(1);
	});

	it('fs y tabla consistentes reportan cero pendientes', () => {
		const fs = [migration('OldMigration', '20260101000000'), migration('NewMigration', '20260912140000')];
		const db = [migration('OldMigration', '20260101000000'), migration('NewMigration', '20260912140000')];

		const stats = computeMigrationStats(fs, db);

		expect(stats.total).toBe(2);
		expect(stats.executed).toBe(2);
		expect(stats.pending).toBe(0);
	});

	it('nombres repetidos en la tabla no inflan executed ni tapan pending', () => {
		const fs = [migration('A', '20260101000000'), migration('B', '20260201000000')];
		const db = [migration('A', '20260101000000'), migration('A', '20250101000000')];

		const stats = computeMigrationStats(fs, db);

		expect(stats.executed).toBe(1);
		expect(stats.pending).toBe(1);
	});

	it('sin migraciones en la tabla, todo el fs está pendiente', () => {
		const fs = [migration('A', '20260101000000')];

		const stats = computeMigrationStats(fs, []);

		expect(stats).toEqual({ total: 1, executed: 0, pending: 1 });
	});
});
