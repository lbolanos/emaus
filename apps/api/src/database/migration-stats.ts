/**
 * Estadísticas de migraciones para `showMigrations()`.
 *
 * Vive en su propio módulo, sin dependencias, por la misma razón práctica que
 * `transaction-policy.ts`: `base-migration-manager.ts` usa `import.meta.url`
 * (es ESM), así que Jest no puede importarlo y su lógica no tiene test. Aquí sí.
 */

/** Lo único que hace falta para comparar una migración del fs con una de la tabla. */
export interface NamedMigration {
	name: string;
	timestamp: string;
}

export interface MigrationCountStats {
	total: number;
	executed: number;
	pending: number;
}

/**
 * Cuenta pendientes por NOMBRE, no por resta de cardinalidades.
 *
 * El cálculo anterior (`all.length - executed.length`) se descomponía con una
 * migración registrada en la tabla cuyo archivo ya no existe en el código
 * (revert, o una DB de dev copiada de otra rama): la fantasma compensaba la
 * cuenta y enmascaraba migraciones NUEVAS como ejecutadas. Así pasó en el
 * worktree de secuencias (2026-09-12): la DB copiada traía registrada una
 * migración del master que el branch no tenía, 120 archivos vs 120 filas →
 * "todo al día" → la migración nueva jamás corría y el API levantaba con
 * `no such column`.
 *
 * `executed` cuenta sólo archivos que están registrados, para mantener
 * `total = executed + pending` (las registradas-sin-archivo no aparecen en
 * ningún contador: son fantasmas, no estado).
 */
export function computeMigrationStats(
	all: NamedMigration[],
	executed: NamedMigration[],
): MigrationCountStats {
	const executedNames = new Set(executed.map((m) => m.name));
	const pending = all.filter((m) => !executedNames.has(m.name)).length;
	return {
		total: all.length,
		executed: all.length - pending,
		pending,
	};
}
