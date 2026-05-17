import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * G6 del community membership journey (versión inicial): inserta plantillas
 * globales (communityId=null, scope='community') para los emails que hoy viven
 * inline en `communityService.ts`. El service puede migrarse progresivamente
 * a leer estas plantillas con `replaceAllVariables` como fallback al HTML inline.
 *
 * Plantillas:
 *  - COMMUNITY_MEETING_INVITATION — email a miembros activos cuando hay reunión
 *  - COMMUNITY_MEMBER_APPROVED   — email al solicitante al ser aprobado
 *  - COMMUNITY_JOIN_REQUEST_ADMIN — email a admins cuando alguien solicita unirse
 *  - COMMUNITY_LINK_REQUEST_CONFIRM — email al contactEmail cuando alguien hace
 *    auto-link (Vuln 2 fix)
 *
 * Idempotente: skip si ya existen (por type + scope + communityId IS NULL).
 */
export class SeedCommunityMessageTemplates20260516100000 implements MigrationInterface {
	name = 'SeedCommunityMessageTemplates';
	timestamp = '20260516100000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const templates = [
			{
				type: 'COMMUNITY_MEETING_INVITATION',
				name: 'Invitación a reunión de comunidad',
				message:
					'Hola {{firstName}},\n\nHay una nueva reunión programada en {{communityName}}: {{meetingTitle}} el {{meetingDate}}.\n\nConfirma tu asistencia: {{attendanceLink}}\n\nRetiros Emaús',
			},
			{
				type: 'COMMUNITY_MEMBER_APPROVED',
				name: 'Bienvenida al ser aprobado',
				message:
					'¡Bienvenido a {{communityName}}, {{firstName}}!\n\nLos coordinadores aprobaron tu solicitud. Ya formas parte de la comunidad. Te enviaremos avisos cuando haya reuniones próximas.\n\nRetiros Emaús',
			},
			{
				type: 'COMMUNITY_JOIN_REQUEST_ADMIN',
				name: 'Solicitud de unión a admins',
				message:
					'Nueva solicitud de unión a {{communityName}}\n\nNombre: {{requesterName}}\nEmail: {{requesterEmail}}\nTeléfono: {{requesterPhone}}\n\nEl nuevo miembro fue agregado con estado pendiente de verificación.',
			},
			{
				type: 'COMMUNITY_LINK_REQUEST_CONFIRM',
				name: 'Confirmar acceso a comunidad',
				message:
					'Alguien creó una cuenta usando el correo {{userEmail}} — el mismo registrado como contacto de {{communityName}}. Si fuiste tú, acepta el acceso: {{acceptUrl}}. Si no, ignora este correo.',
			},
		];

		for (const tpl of templates) {
			const existing = await queryRunner.query(
				`SELECT id FROM message_templates WHERE type = ? AND scope = 'community' AND communityId IS NULL`,
				[tpl.type],
			);
			if (existing.length > 0) {
				console.log(`Template ${tpl.type} already exists, skipping`);
				continue;
			}
			const { randomUUID } = await import('crypto');
			await queryRunner.query(
				`INSERT INTO message_templates (id, name, type, scope, message, retreatId, communityId, createdAt, updatedAt)
				 VALUES (?, ?, ?, 'community', ?, NULL, NULL, datetime('now'), datetime('now'))`,
				[randomUUID(), tpl.name, tpl.type, tpl.message],
			);
			console.log(`Seeded template: ${tpl.type}`);
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		await queryRunner.query(
			`DELETE FROM message_templates WHERE type IN (
				'COMMUNITY_MEETING_INVITATION',
				'COMMUNITY_MEMBER_APPROVED',
				'COMMUNITY_JOIN_REQUEST_ADMIN',
				'COMMUNITY_LINK_REQUEST_CONFIRM'
			) AND scope = 'community' AND communityId IS NULL`,
		);
	}
}
