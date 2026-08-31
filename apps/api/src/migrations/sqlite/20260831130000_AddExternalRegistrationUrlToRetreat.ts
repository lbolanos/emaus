import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Some parishes run their own walker registration (own form, own payment
 * collection). When a retreat has an external URL, emaus.cc must send walkers
 * there instead of rendering its own registration form, so the flyer QR, the
 * landing CTA and the dashboard link all point to a single source of truth.
 *
 * Servers keep registering through emaus.cc: only the walker link is affected.
 */
export class AddExternalRegistrationUrlToRetreat20260831130000
	implements MigrationInterface
{
	name = 'AddExternalRegistrationUrlToRetreat20260831130000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat" ADD COLUMN "externalRegistrationUrl" varchar`,
		);
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`ALTER TABLE "retreat" DROP COLUMN "externalRegistrationUrl"`,
		);
	}
}
