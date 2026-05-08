---
name: sqlite-migrations
description: MUST be used when creating, modificando o revisando cualquier migration en apps/api/src/migrations/sqlite/. Cubre el patrón seguro de recreate-table (CREATE/COPY/DROP/RENAME), el bug de PRAGMA foreign_keys = OFF dentro de transacciones de TypeORM, plantillas listas, requisitos de testing y receta de recuperación cuando una migration ya borró data. Triggers — "agregar columna", "cambiar nullable", "drop column", "renombrar tabla", "modificar FK", "DROP TABLE", "recreate table", "TypeORM migration", "pnpm --filter api migration:generate".
---

# SQLite Migrations — patrón seguro

## Cuándo usar este skill

Se activa **siempre que** trabajas con un archivo en
`apps/api/src/migrations/sqlite/` o estás generando uno nuevo:

- Agregar / cambiar / eliminar columna en una tabla con FKs entrantes
  (`community`, `retreat`, `participant`, `house`, `users`, etc.).
- Hacer una columna nullable / NOT NULL.
- Cambiar tipo de columna.
- Cambiar / eliminar / añadir un FOREIGN KEY.
- Renombrar tabla.
- Cualquier migration que contenga `DROP TABLE`.

**Si la migration solo hace `INSERT/UPDATE/DELETE` de datos** (backfill,
seed) o `ALTER TABLE ADD COLUMN` puro, este skill no aplica — usa la
plantilla simple.

## Regla N°1 — el bug que ya nos costó 66 + 8 rows

> SQLite ignora silenciosamente `PRAGMA foreign_keys = OFF` cuando se
> ejecuta dentro de una transacción multi-sentencia. TypeORM envuelve
> cada migration en una transacción por defecto. Resultado: tu guardia
> no funciona, y `DROP TABLE parent` cascadea a las hijas.

Cita oficial:

> *"It is not possible to enable or disable foreign key support in the
> middle of a multi-statement transaction (when SQLite is not in
> autocommit mode). Attempting to do so does not return an error; it
> simply has no effect."*
> — https://www.sqlite.org/foreignkeys.html#fk_enable

Incidente real (2026-05-07):
`AddPublicRegistrationToCommunity20260507120000` usó `PRAGMA OFF` +
`DROP TABLE community` y borró 66 `community_member` + 8
`community_meeting` sin error visible. Recuperación solo fue posible
porque existía `database.sqlite.backup-pre-community-public`.

## Árbol de decisión

```
¿Necesitas tocar el esquema de una tabla?
│
├─ ¿Solo agregar una columna nueva?
│   └─ Usa ALTER TABLE ADD COLUMN. SIN recreate, SIN transaction=false.
│
├─ ¿SQLite ≥ 3.35 en este entorno y solo necesitas DROP COLUMN o
│   RENAME COLUMN?
│   └─ Usa ALTER TABLE DROP/RENAME COLUMN nativo. SIN recreate.
│
├─ ¿Cambiar nullable, tipo, default, FK, o renombrar tabla?
│   └─ Patrón recreate-table OBLIGATORIO. Aplica todas las reglas
│      de la sección "Plantilla segura" más abajo.
│
└─ ¿Solo backfill (INSERT/UPDATE/DELETE de data, sin schema)?
    └─ Plantilla simple. Sin precauciones especiales.
```

## Plantilla segura para recreate-table

Cuando recreas una tabla padre con FKs entrantes, usa **esta plantilla
exacta**. Las dos cosas no negociables son `transaction = false` y la
verificación post-migration de los `COUNT(*)` de las hijas.

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Brief de qué cambia el esquema.
 *
 * Tablas hijas que dependen vía FK (ON DELETE CASCADE):
 * - community_member
 * - community_meeting
 * - community_admin
 * - community_attendance
 * - participant_communications (communityId nullable)
 * - message_templates (communityId nullable)
 *
 * Por eso usamos transaction=false + PRAGMA foreign_keys=OFF.
 */
export class FooBar20260507120000 implements MigrationInterface {
	name = 'FooBar20260507120000';
	timestamp = '20260507120000';

	// CRÍTICO: TypeORM no envuelve up()/down() en BEGIN…COMMIT.
	// Sin esto, PRAGMA foreign_keys=OFF es ignorado por SQLite y
	// DROP TABLE cascadea a las hijas, borrando data silenciosamente.
	transaction = false as const;

	public async up(queryRunner: QueryRunner): Promise<void> {
		// 1) Apagar FK enforcement de verdad (fuera de transacción).
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);

		// 2) Crear la tabla nueva con el esquema deseado.
		await queryRunner.query(`
			CREATE TABLE "foo_new" (
				/* columnas nuevas... */
			)
		`);

		// 3) Copiar datos de la tabla vieja a la nueva.
		//    Mapea explícitamente cada columna; nunca uses SELECT *.
		await queryRunner.query(`
			INSERT INTO "foo_new" (/* cols */)
			SELECT /* cols equivalentes */
			FROM "foo"
		`);

		// 4) Borrar la tabla vieja. Con FK=OFF, esto NO cascadea.
		await queryRunner.query(`DROP TABLE "foo"`);

		// 5) Renombrar la nueva al nombre original.
		await queryRunner.query(`ALTER TABLE "foo_new" RENAME TO "foo"`);

		// 6) Recrear índices y triggers que existían antes.
		await queryRunner.query(`CREATE INDEX ...`);

		// 7) Re-encender FK. Las hijas siguen apuntando a "foo" por nombre,
		//    así que las FK siguen siendo válidas tras el rename.
		await queryRunner.query(`PRAGMA foreign_keys = ON`);

		// 8) (Opcional pero recomendado) verificar integridad referencial.
		const orphans = await queryRunner.query(`PRAGMA foreign_key_check`);
		if (orphans && orphans.length > 0) {
			throw new Error(`FK integrity broken after migration: ${JSON.stringify(orphans)}`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`PRAGMA foreign_keys = OFF`);
		// Mismo patrón en reversa.
		// ...
		await queryRunner.query(`PRAGMA foreign_keys = ON`);
	}
}
```

### Checklist por cada recreate-table

Antes de aprobar / commitear:

- [ ] `transaction = false as const` declarado en la clase.
- [ ] `PRAGMA foreign_keys = OFF` antes del `CREATE/INSERT/DROP/RENAME`.
- [ ] `INSERT INTO new SELECT cols FROM old` con columnas explícitas (no `SELECT *`).
- [ ] `PRAGMA foreign_keys = ON` al final.
- [ ] `PRAGMA foreign_key_check` valida que no quedaron huérfanos.
- [ ] Los índices originales se recrean.
- [ ] El `down()` también sigue el patrón.
- [ ] Test seed-and-verify (sección siguiente).
- [ ] Backup manual de `apps/api/database.sqlite` antes de correr en local.

## Test obligatorio: seed-and-verify

Toda migration que recree una tabla con hijas debe venir con un test que
pruebe que los `COUNT(*)` de cada hija sobreviven al `up()`. Sin este
test, el bug es invisible.

Ubicación: `apps/api/src/tests/migrations/<feature>.simple.test.ts`

```ts
import { DataSource } from 'typeorm';
import { FooBar20260507120000 } from '@/migrations/sqlite/20260507120000_FooBar';

describe('FooBar20260507120000 — child tables survive recreate', () => {
	let ds: DataSource;

	beforeEach(async () => {
		ds = new DataSource({
			type: 'sqlite',
			database: ':memory:',
			synchronize: false,
			entities: [/* las entities mínimas necesarias */],
			migrations: [/* todas las anteriores + esta */],
		});
		await ds.initialize();
		await ds.runMigrations();           // estado pre-foo
		// Seed: insertar rows en cada tabla hija con FK a "foo".
		await ds.query(`INSERT INTO foo (id, ...) VALUES ('p1', ...)`);
		await ds.query(`INSERT INTO child_a (id, fooId, ...) VALUES (...)`);
		await ds.query(`INSERT INTO child_b (id, fooId, ...) VALUES (...)`);
	});

	it('preserves child rows through the recreate', async () => {
		const beforeA = (await ds.query(`SELECT COUNT(*) AS c FROM child_a`))[0].c;
		const beforeB = (await ds.query(`SELECT COUNT(*) AS c FROM child_b`))[0].c;

		// Forzar la migration objetivo.
		const m = new FooBar20260507120000();
		await ds.transaction(async (manager) => {
			// no-op — solo para tener un queryRunner
		});
		await m.up(ds.createQueryRunner());

		const afterA = (await ds.query(`SELECT COUNT(*) AS c FROM child_a`))[0].c;
		const afterB = (await ds.query(`SELECT COUNT(*) AS c FROM child_b`))[0].c;

		expect(afterA).toBe(beforeA);
		expect(afterB).toBe(beforeB);
	});
});
```

## Plantilla simple — schema solo añade

Para `ALTER TABLE foo ADD COLUMN bar` o data-only migrations:

```ts
import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBarToFoo20260507120000 implements MigrationInterface {
	name = 'AddBarToFoo20260507120000';
	timestamp = '20260507120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "foo" ADD COLUMN "bar" VARCHAR(100)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// SQLite ≥ 3.35 soporta DROP COLUMN nativamente.
		await queryRunner.query(`ALTER TABLE "foo" DROP COLUMN "bar"`);
	}
}
```

## Comandos del proyecto

```bash
# Generar migration desde diferencias entity↔esquema (revisa siempre el resultado)
pnpm --filter api migration:generate src/migrations/sqlite/<NombreDescriptivo>

# Aplicar migrations pendientes
pnpm --filter api migration:run

# Revertir la última (cuando es reversible — el patrón recreate-table debe serlo)
pnpm --filter api migration:revert

# Backup manual antes de correr en local con datos importantes
cp apps/api/database.sqlite apps/api/database.sqlite.backup-pre-<feature>-$(date +%Y%m%d-%H%M)
```

## Naming convention

- Archivo: `apps/api/src/migrations/sqlite/<YYYYMMDDHHMMSS>_<DescriptiveName>.ts`
- Clase: `<DescriptiveName><YYYYMMDDHHMMSS>` (camelCase)
- `name` y `timestamp` deben coincidir con el archivo y la clase.

## Recuperación cuando una migration ya borró data

Si descubres que una migration recreate-table eliminó rows de tablas
hijas:

```sh
# 1. Confirmar daño comparando con el backup pre-migration.
sqlite3 apps/api/database.sqlite \
  "SELECT 'current' AS db, COUNT(*) FROM community_member;"
sqlite3 apps/api/database.sqlite.backup-pre-<feature> \
  "SELECT 'backup' AS db, COUNT(*) FROM community_member;"

# 2. Snapshot de la BD actual antes de tocar nada.
cp apps/api/database.sqlite \
   apps/api/database.sqlite.backup-pre-restore-$(date +%Y%m%d-%H%M%S)
```

```sql
-- 3. Restaurar idempotentemente desde el backup.
ATTACH DATABASE 'apps/api/database.sqlite.backup-pre-<feature>' AS bak;

-- Verificar que los parents referenciados existen en la BD actual.
SELECT COUNT(*) FROM bak.community_member cm
WHERE cm.participantId NOT IN (SELECT id FROM main.participants);
-- Debe ser 0. Si no, no restaures sin investigar primero.

-- Restore. Skipea filas que ya existen (por id) o que rompen UNIQUE.
INSERT INTO main.community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes)
SELECT id, communityId, participantId, state, joinedAt, updatedAt, notes
FROM bak.community_member
WHERE id NOT IN (SELECT id FROM main.community_member)
  AND NOT EXISTS (
    SELECT 1 FROM main.community_member m
    WHERE m.communityId = bak.community_member.communityId
      AND m.participantId = bak.community_member.participantId
  );

-- Repetir para cada tabla hija afectada (community_meeting, etc.).

DETACH DATABASE bak;
```

```sh
# 4. Reportar el bug en la migration ofensora — proponer fix con
#    transaction=false y test seed-and-verify, no solo el restore.
```

## Anti-patrones a rechazar en review

- ❌ `PRAGMA foreign_keys = OFF` sin `transaction = false`.
- ❌ `DROP TABLE parent` sin patrón recreate completo.
- ❌ `INSERT INTO new SELECT * FROM old` (orden y tipos sin garantía).
- ❌ Recreate sin recrear los índices.
- ❌ Migration que llega sin test seed-and-verify cuando toca tablas con hijas.
- ❌ Migration que se commitea sin haber probado `migration:run` en local.
- ❌ `down()` que no sigue el mismo patrón que `up()`.
