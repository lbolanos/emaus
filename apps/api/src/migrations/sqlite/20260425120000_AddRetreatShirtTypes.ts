import { MigrationInterface, QueryRunner } from 'typeorm';
import { randomUUID } from 'crypto';

export class AddRetreatShirtTypes20260425120000 implements MigrationInterface {
	name = 'AddRetreatShirtTypes20260425120000';
	timestamp = '20260425120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`
			CREATE TABLE "retreat_shirt_type" (
				"id" varchar PRIMARY KEY NOT NULL,
				"retreatId" varchar NOT NULL,
				"name" varchar NOT NULL,
				"color" varchar,
				"requiredForWalkers" boolean NOT NULL DEFAULT 0,
				"optionalForServers" boolean NOT NULL DEFAULT 1,
				"sortOrder" integer NOT NULL DEFAULT 0,
				"availableSizes" text,
				"createdAt" datetime NOT NULL DEFAULT (datetime('now')),
				"updatedAt" datetime NOT NULL DEFAULT (datetime('now')),
				CONSTRAINT "FK_retreat_shirt_type_retreat" FOREIGN KEY ("retreatId") REFERENCES "retreat" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_retreat_shirt_type_retreat" ON "retreat_shirt_type" ("retreatId")`,
		);

		await queryRunner.query(`
			CREATE TABLE "participant_shirt_size" (
				"id" varchar PRIMARY KEY NOT NULL,
				"participantId" varchar NOT NULL,
				"shirtTypeId" varchar NOT NULL,
				"size" varchar NOT NULL,
				CONSTRAINT "FK_psize_participant" FOREIGN KEY ("participantId") REFERENCES "participants" ("id") ON DELETE CASCADE,
				CONSTRAINT "FK_psize_shirtType" FOREIGN KEY ("shirtTypeId") REFERENCES "retreat_shirt_type" ("id") ON DELETE CASCADE
			)
		`);
		await queryRunner.query(
			`CREATE INDEX "IDX_psize_participant" ON "participant_shirt_size" ("participantId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "IDX_psize_shirtType" ON "participant_shirt_size" ("shirtTypeId")`,
		);
		await queryRunner.query(
			`CREATE UNIQUE INDEX "UQ_psize_participant_shirtType" ON "participant_shirt_size" ("participantId", "shirtTypeId")`,
		);

		// ── Permissions ─────────────────────────────────────────────
		// Granular shirtType permissions, assigned to retreat roles per scope.
		await queryRunner.query(`
			INSERT OR IGNORE INTO "permissions" ("resource", "operation", "description") VALUES
			('shirtType', 'read', 'Read/list shirt types of a retreat'),
			('shirtType', 'manage', 'Create, update, delete shirt types of a retreat')
		`);

		const shirtPerms: { id: number; operation: string }[] = await queryRunner.query(
			`SELECT id, operation FROM "permissions" WHERE resource = 'shirtType'`,
		);
		const readPermId = shirtPerms.find((p) => p.operation === 'read')?.id;
		const managePermId = shirtPerms.find((p) => p.operation === 'manage')?.id;

		const allRoles: { id: number; name: string }[] = await queryRunner.query(
			`SELECT id, name FROM "roles"`,
		);
		const roleId = (name: string) => allRoles.find((r) => r.name === name)?.id;

		const assign = async (rId: number | undefined, pId: number | undefined) => {
			if (!rId || !pId) return;
			await queryRunner.query(
				`INSERT OR IGNORE INTO "role_permissions" ("roleId", "permissionId") VALUES (?, ?)`,
				[rId, pId],
			);
		};

		// shirtType:read → everyone with retreat read access (incl. read-only roles).
		for (const r of [
			'superadmin',
			'admin',
			'treasurer',
			'logistics',
			'communications',
			'regular_server',
		]) {
			await assign(roleId(r), readPermId);
		}

		// shirtType:manage → only roles that own retreat configuration:
		// superadmin (global), admin (full retreat), logistics (inventory/playeras scope).
		// Treasurer and communications are intentionally excluded — out of their scope.
		for (const r of ['superadmin', 'admin', 'logistics']) {
			await assign(roleId(r), managePermId);
		}

		// Mexican defaults: same set seeded for every existing retreat AND used as fallback
		// for new ones (see seedDefaultShirtTypes in shirtTypeService.ts).
		const mexicanSizesJson = JSON.stringify(['S', 'M', 'G', 'X', '2']);

		// Seed defaults per retreat + migrate legacy participants.tshirtSize/needs* columns.
		const retreats: { id: string }[] = await queryRunner.query(`SELECT id FROM "retreat"`);

		for (const r of retreats) {
			const whiteId = randomUUID();
			const whiteEmausId = randomUUID();
			const blueId = randomUUID();
			const jacketId = randomUUID();

			// Default Mexican style: blanca con rosa, blanca Emaus, azul, chamarra.
			await queryRunner.query(
				`INSERT INTO "retreat_shirt_type" ("id","retreatId","name","color","requiredForWalkers","optionalForServers","sortOrder","availableSizes") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[whiteId, r.id, 'Blanca con rosa', 'white', 0, 1, 1, mexicanSizesJson],
			);
			await queryRunner.query(
				`INSERT INTO "retreat_shirt_type" ("id","retreatId","name","color","requiredForWalkers","optionalForServers","sortOrder","availableSizes") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[whiteEmausId, r.id, 'Blanca Emaus', 'white', 0, 1, 2, mexicanSizesJson],
			);
			await queryRunner.query(
				`INSERT INTO "retreat_shirt_type" ("id","retreatId","name","color","requiredForWalkers","optionalForServers","sortOrder","availableSizes") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[blueId, r.id, 'Azul', 'blue', 0, 1, 3, mexicanSizesJson],
			);
			await queryRunner.query(
				`INSERT INTO "retreat_shirt_type" ("id","retreatId","name","color","requiredForWalkers","optionalForServers","sortOrder","availableSizes") VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
				[jacketId, r.id, 'Chamarra', null, 0, 1, 4, mexicanSizesJson],
			);

			// Migrate participant data: needsWhiteShirt → "Blanca con rosa" (asume estilo MX)
			const parts: {
				id: string;
				needsWhiteShirt: string | null;
				needsBlueShirt: string | null;
				needsJacket: string | null;
			}[] = await queryRunner.query(
				`SELECT id, needsWhiteShirt, needsBlueShirt, needsJacket FROM "participants" WHERE retreatId = ?`,
				[r.id],
			);

			for (const p of parts) {
				const insert = async (shirtTypeId: string, size: string | null) => {
					if (!size || size === 'null') return;
					await queryRunner.query(
						`INSERT INTO "participant_shirt_size" ("id","participantId","shirtTypeId","size") VALUES (?, ?, ?, ?)`,
						[randomUUID(), p.id, shirtTypeId, size],
					);
				};
				await insert(whiteId, p.needsWhiteShirt);
				await insert(blueId, p.needsBlueShirt);
				await insert(jacketId, p.needsJacket);
			}
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM "role_permissions" WHERE "permissionId" IN (SELECT id FROM "permissions" WHERE resource = 'shirtType')`,
		);
		await queryRunner.query(`DELETE FROM "permissions" WHERE resource = 'shirtType'`);
		await queryRunner.query(`DROP INDEX IF EXISTS "UQ_psize_participant_shirtType"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_psize_shirtType"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_psize_participant"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "participant_shirt_size"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "IDX_retreat_shirt_type_retreat"`);
		await queryRunner.query(`DROP TABLE IF EXISTS "retreat_shirt_type"`);
	}
}
