import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRoleRequestsTable20250912160000 implements MigrationInterface {
	name = 'CreateRoleRequestsTable';
	timestamp = '20250912160000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Create role_requests table
		await queryRunner.query(`
			CREATE TABLE IF NOT EXISTS "role_requests" (
				"id" UUID PRIMARY KEY DEFAULT gen_random_uuid(),
				"user_id" UUID NOT NULL,
				"retreat_id" UUID NOT NULL,
				"requested_role_id" INTEGER NOT NULL,
				"requested_role" VARCHAR(255) NOT NULL,
				"message" TEXT,
				"status" VARCHAR(20) DEFAULT 'pending' CHECK ("status" IN ('pending', 'approved', 'rejected')),
				"requested_at" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
				"approved_at" TIMESTAMP WITH TIME ZONE,
				"rejected_at" TIMESTAMP WITH TIME ZONE,
				"approved_by" UUID,
				"rejected_by" UUID,
				"rejection_reason" TEXT,
				FOREIGN KEY("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
				FOREIGN KEY("retreat_id") REFERENCES "retreat"("id") ON DELETE CASCADE,
				FOREIGN KEY("requested_role_id") REFERENCES "roles"("id") ON DELETE CASCADE,
				FOREIGN KEY("approved_by") REFERENCES "users"("id") ON DELETE SET NULL,
				FOREIGN KEY("rejected_by") REFERENCES "users"("id") ON DELETE SET NULL,
				UNIQUE("user_id", "retreat_id", "status") -- Only one pending request per user per retreat
			)
		`);

		// Create indexes for better performance
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_user_id" ON "role_requests" ("user_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_retreat_id" ON "role_requests" ("retreat_id")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_status" ON "role_requests" ("status")`,
		);
		await queryRunner.query(
			`CREATE INDEX IF NOT EXISTS "idx_role_requests_requested_at" ON "role_requests" ("requested_at")`,
		);

		console.log('✅ Role requests table created successfully.');
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		// Drop indexes
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_requested_at"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_status"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_retreat_id"`);
		await queryRunner.query(`DROP INDEX IF EXISTS "idx_role_requests_user_id"`);

		// Drop table
		await queryRunner.query(`DROP TABLE IF EXISTS "role_requests"`);

		console.log('✅ Role requests table dropped successfully.');
	}
}
