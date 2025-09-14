import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRetreatRoleManagement20250912150000 implements MigrationInterface {
	name = 'AddRetreatRoleManagement';
	timestamp = '20250912150000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Add retreat ownership and management fields
		await queryRunner.query(`
			ALTER TABLE "retreat" 
			ADD COLUMN "created_by" UUID,
			ADD COLUMN "is_public" BOOLEAN DEFAULT FALSE,
			ADD COLUMN "role_invitation_enabled" BOOLEAN DEFAULT TRUE
		`);

		// Add retreat role invitation and management fields
		await queryRunner.query(`
			ALTER TABLE "user_retreats" 
			ADD COLUMN "invited_by" UUID,
			ADD COLUMN "invited_at" TIMESTAMP,
			ADD COLUMN "expires_at" TIMESTAMP,
			ADD COLUMN "status" VARCHAR(20) DEFAULT 'active' CHECK ("status" IN ('pending', 'active', 'expired', 'revoked')),
			ADD COLUMN "permissions_override" TEXT,
			ADD COLUMN "updated_at" TIMESTAMP NOT NULL DEFAULT NOW()
		`);

		// Add foreign key constraint for retreat creator
		await queryRunner.query(`
			ALTER TABLE "retreat" 
			ADD CONSTRAINT "fk_retreat_created_by" 
			FOREIGN KEY ("created_by") REFERENCES "users"("id") 
			ON DELETE SET NULL
		`);

		// Add foreign key constraint for invitation sender
		await queryRunner.query(`
			ALTER TABLE "user_retreats" 
			ADD CONSTRAINT "fk_user_retreats_invited_by" 
			FOREIGN KEY ("invited_by") REFERENCES "users"("id") 
			ON DELETE SET NULL
		`);

		// Create indexes for better performance
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_created_by" ON "retreat" ("created_by")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_retreat_is_public" ON "retreat" ("is_public")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_user_retreats_invited_by" ON "user_retreats" ("invited_by")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_user_retreats_status" ON "user_retreats" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_user_retreats_expires_at" ON "user_retreats" ("expires_at")`,
		);

		console.log('✅ Retreat role management schema updated successfully.');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_retreats_expires_at"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_retreats_status"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_user_retreats_invited_by"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_is_public"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_retreat_created_by"`);

		// Drop foreign key constraints
		await queryRunner.query(
			`ALTER TABLE "user_retreats" DROP CONSTRAINT "fk_user_retreats_invited_by"`,
		);
		await queryRunner.query(`ALTER TABLE "retreat" DROP CONSTRAINT "fk_retreat_created_by"`);

		// Drop columns
		await queryRunner.query(`ALTER TABLE "user_retreats" DROP COLUMN "updated_at"`);
		await queryRunner.query(`ALTER TABLE "user_retreats" DROP COLUMN "permissions_override"`);
		await queryRunner.query(`ALTER TABLE "user_retreats" DROP COLUMN "status"`);
		await queryRunner.query(`ALTER TABLE "user_retreats" DROP COLUMN "expires_at"`);
		await queryRunner.query(`ALTER TABLE "user_retreats" DROP COLUMN "invited_at"`);
		await queryRunner.query(`ALTER TABLE "user_retreats" DROP COLUMN "invited_by"`);

		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "role_invitation_enabled"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "is_public"`);
		await queryRunner.query(`ALTER TABLE "retreat" DROP COLUMN "created_by"`);

		console.log('✅ Retreat role management schema reverted successfully.');
	}
}
