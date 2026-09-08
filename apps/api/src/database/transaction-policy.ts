/**
 * Decide si una migración corre envuelta en una transacción.
 *
 * Vive en su propio módulo, sin dependencias, por una razón práctica:
 * `base-migration-manager.ts` usa `import.meta.url` (es ESM), así que Jest no
 * puede importarlo y su lógica nunca tuvo un test. Aquí sí.
 */

/** Lo único que nos interesa de la clase de migración. */
export interface TransactionAware {
	transaction?: boolean;
}

/**
 * El llamador manda (`--transaction` del CLI, o el `transaction: true` que pasa
 * `migration-verifier.ts` al arrancar el API), PERO una migración puede
 * declarar `transaction = false` para quedarse fuera, y eso NO es estilo: es lo
 * único que hace funcionar el patrón recreate-table en SQLite.
 *
 * Dentro de una transacción multi-sentencia SQLite **ignora en silencio**
 * `PRAGMA foreign_keys = OFF` (https://sqlite.org/foreignkeys.html#fk_enable):
 * no da error, simplemente no surte efecto. Con las FKs activas, el
 * `DROP TABLE padre` del patrón cascadea a las hijas y se lleva sus filas sin
 * avisar. Así se perdieron 66 `community_member` y 8 `community_meeting` el
 * 2026-05-07.
 *
 * El runner leía sólo el flag del llamador, así que las 26 migraciones que
 * declaran `transaction = false` —y el guard `sqliteSafePattern.simple.test.ts`
 * que lo exige— daban una protección que en runtime no existía por el camino
 * del arranque del API. Ese camino es el normal en dev: `MIGRATIONS_AUTO_RUN`
 * está en `true` y nodemon reinicia con cada archivo que se guarda.
 */
export const shouldUseTransaction = (
	migrationClass: TransactionAware | null | undefined,
	callerWants: boolean | undefined,
): boolean => {
	if (!callerWants) return false;
	return migrationClass?.transaction !== false;
};
