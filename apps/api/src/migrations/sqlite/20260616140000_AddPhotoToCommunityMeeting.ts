import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPhotoToCommunityMeeting20260616140000 implements MigrationInterface {
	name = 'AddPhotoToCommunityMeeting20260616140000';
	timestamp = '20260616140000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		// Foto única (banner/portada) por reunión de comunidad.
		// `photoUrl` guarda la URL pública de S3 (o el data-URI en modo base64);
		// `photoS3Key` guarda el object key para poder borrar el objeto individual.
		await queryRunner.query(`ALTER TABLE "community_meeting" ADD COLUMN "photoUrl" varchar NULL`);
		await queryRunner.query(`ALTER TABLE "community_meeting" ADD COLUMN "photoS3Key" varchar NULL`);
		console.log('Added photoUrl and photoS3Key columns to community_meeting');
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// No-op intencional. SQLite no soporta DROP COLUMN directo y recrear
		// `community_meeting` cascadearía sus FKs entrantes (community_attendance,
		// instancias self-referenciales) — riesgo de pérdida de data. Las columnas
		// son nullable y no afectan a consumidores existentes; se dejan en su lugar.
		console.log('Down no-op: photoUrl/photoS3Key columns left in place on community_meeting');
	}
}
