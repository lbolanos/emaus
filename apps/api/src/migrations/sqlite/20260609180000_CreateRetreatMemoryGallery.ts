import { MigrationInterface, QueryRunner } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

/**
 * Adds support for multiple memory photos and songs per retreat.
 *
 * The legacy single-value columns `retreat.memoryPhotoUrl` /
 * `retreat.musicPlaylistUrl` are KEPT and now act as derived fields mirroring
 * the item marked `isPrimary`. Existing values are backfilled as the primary
 * item of each new child table so no data is lost.
 *
 * Only CREATE TABLE in `up` (no DROP of tables with incoming FKs), so the
 * default TypeORM transaction is fine — `transaction = false` is NOT needed.
 */
export class CreateRetreatMemoryGallery20260609180000 implements MigrationInterface {
	name = 'CreateRetreatMemoryGallery20260609180000';
	// Runs outside a wrapping transaction (project convention for any migration
	// with DROP TABLE). The `down()` drops only these two leaf tables — nothing
	// has an incoming FK to them, so there is no cascade risk.
	transaction = false;

	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log(' Creating retreat_memory_photo table...');
		await queryRunner.query(`
            CREATE TABLE "retreat_memory_photo" (
                "id" varchar PRIMARY KEY NOT NULL,
                "retreatId" varchar NOT NULL,
                "url" varchar NOT NULL,
                "s3Key" varchar,
                "isPrimary" boolean NOT NULL DEFAULT (0),
                "sortOrder" integer NOT NULL DEFAULT (0),
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE CASCADE
            )
        `);

		console.log(' Creating retreat_memory_song table...');
		await queryRunner.query(`
            CREATE TABLE "retreat_memory_song" (
                "id" varchar PRIMARY KEY NOT NULL,
                "retreatId" varchar NOT NULL,
                "url" varchar NOT NULL,
                "title" varchar,
                "isPrimary" boolean NOT NULL DEFAULT (0),
                "sortOrder" integer NOT NULL DEFAULT (0),
                "createdAt" datetime NOT NULL DEFAULT (datetime('now')),
                FOREIGN KEY ("retreatId") REFERENCES "retreat"("id") ON DELETE CASCADE
            )
        `);

		console.log(' Creating indexes...');
		await queryRunner.query(
			`CREATE INDEX "idx_retreat_memory_photo_retreatId" ON "retreat_memory_photo"("retreatId")`,
		);
		await queryRunner.query(
			`CREATE INDEX "idx_retreat_memory_song_retreatId" ON "retreat_memory_song"("retreatId")`,
		);

		console.log(' Backfilling existing memory photos/songs as primary items...');
		const retreats: Array<{
			id: string;
			memoryPhotoUrl: string | null;
			musicPlaylistUrl: string | null;
		}> = await queryRunner.query(
			`SELECT "id", "memoryPhotoUrl", "musicPlaylistUrl" FROM "retreat"
             WHERE ("memoryPhotoUrl" IS NOT NULL AND "memoryPhotoUrl" <> '')
                OR ("musicPlaylistUrl" IS NOT NULL AND "musicPlaylistUrl" <> '')`,
		);

		for (const r of retreats) {
			if (r.memoryPhotoUrl && r.memoryPhotoUrl.trim() !== '') {
				// Derive the legacy S3 key only when the URL points to the old
				// fixed-key object; base64 data URIs have no S3 object.
				const s3Key = r.memoryPhotoUrl.includes('retreat-memories/')
					? `retreat-memories/${r.id}.webp`
					: null;
				await queryRunner.query(
					`INSERT INTO "retreat_memory_photo" ("id", "retreatId", "url", "s3Key", "isPrimary", "sortOrder")
                     VALUES (?, ?, ?, ?, 1, 0)`,
					[uuidv4(), r.id, r.memoryPhotoUrl, s3Key],
				);
			}
			if (r.musicPlaylistUrl && r.musicPlaylistUrl.trim() !== '') {
				await queryRunner.query(
					`INSERT INTO "retreat_memory_song" ("id", "retreatId", "url", "title", "isPrimary", "sortOrder")
                     VALUES (?, ?, ?, NULL, 1, 0)`,
					[uuidv4(), r.id, r.musicPlaylistUrl],
				);
			}
		}
		console.log(`  Backfilled ${retreats.length} retreat(s)`);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_memory_song_retreatId"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_memory_photo_retreatId"`);
		await queryRunner.query(`DROP TABLE "retreat_memory_song"`);
		await queryRunner.query(`DROP TABLE "retreat_memory_photo"`);
	}
}
