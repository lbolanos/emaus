import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Constancia del consentimiento expreso para datos personales sensibles.
 *
 * Los datos de salud del participante (medicamentos y horarios, restricciones
 * alimentarias, apoyos por capacidad diferente) son datos sensibles bajo la
 * LFPDPPP art. 9, que exige consentimiento expreso — distinto del genérico que
 * ya se recaba en `acceptedPrivacyNoticeAt` para el aviso de privacidad.
 *
 * Se guarda solo el sello de tiempo: su presencia ES el consentimiento. NULL
 * significa que el participante no declaró datos de salud, o que se registró
 * antes de que existiera la casilla.
 */
export class AddSensitiveDataConsent20260901120000 implements MigrationInterface {
	name = 'AddSensitiveDataConsent20260901120000';
	timestamp = '20260901120000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const cols: Array<{ name: string }> = await queryRunner.query(
			`PRAGMA table_info("participants")`,
		);
		if (!cols.some((c) => c.name === 'sensitiveDataConsentAt')) {
			await queryRunner.query(
				`ALTER TABLE "participants" ADD COLUMN "sensitiveDataConsentAt" datetime NULL`,
			);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(`ALTER TABLE "participants" DROP COLUMN "sensitiveDataConsentAt"`);
	}
}
