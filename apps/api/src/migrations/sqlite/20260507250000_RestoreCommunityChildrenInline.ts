import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Restaura las filas de community_admin / community_member / community_meeting
 * que se perdieron cuando AddPublicRegistrationToCommunity20260507120000
 * recreó la tabla `community` dentro de la transacción que TypeORM abre por
 * defecto. SQLite ignora `PRAGMA foreign_keys = OFF` cuando se está en
 * una transacción multi-sentencia, así que el `DROP TABLE community`
 * cascadeó a las hijas y borró 2 admins + 66 members + 8 meetings sin
 * error visible.
 *
 * Esta migration tiene los datos embebidos como bind parameters (extraídos
 * del backup local del 2026-05-07) y es idempotente. Cada INSERT usa
 * `OR IGNORE`, que en SQLite silencia tanto UNIQUE como violaciones de
 * FK: las filas cuyos parents (community, participants, users) no existen
 * en el destino se descartan en el momento, sin dejar huérfanos.
 *
 * No requiere `transaction = false` ni `PRAGMA foreign_keys = OFF` porque
 * los INSERT OR IGNORE se llevan toda la lógica defensiva.
 *
 * Si las communities objetivo no existen en este entorno (e.g. una BD
 * recién instalada sin las communities Buen despacho/Tlalpan), la
 * migration sale temprano sin tocar nada.
 */
export class RestoreCommunityChildrenInline20260507250000 implements MigrationInterface {
	name = 'RestoreCommunityChildrenInline20260507250000';
	timestamp = '20260507250000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const targetCommunities = [
			'f1060047-5305-4f75-89c4-a649e449975e', // Buen despacho
			'f259d9b2-3b6f-4057-849b-3c9d381e28e3', // Tlalpan
		];
		const present = await queryRunner.query(
			`SELECT id FROM community WHERE id IN ('${targetCommunities.join("','")}')`,
		);
		if (present.length === 0) {
			console.log(
				'[RestoreCommunityChildrenInline] Las communities objetivo no existen en este entorno. Skipping.',
			);
			return;
		}

		// Cada INSERT usa `OR IGNORE`, que en SQLite silencia tanto UNIQUE
		// como FK constraint violations: filas cuyos parents (community,
		// participants, users, message_templates) NO existen en el destino
		// se descartan en el momento, sin necesidad de PRAGMA foreign_keys
		// = OFF. Eso, a su vez, hace innecesario `transaction = false`.

		// === 2 community_admin ===
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_admin (id, communityId, userId, role, invitedBy, invitedAt, acceptedAt, status, invitationToken, invitationExpiresAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
			["077392c7-8696-b285-1b11-abf60691a094","f259d9b2-3b6f-4057-849b-3c9d381e28e3","2e04e70a-b2bb-4824-a118-9005d77f9ff2","owner",null,"2026-05-07 22:54:33","2026-05-07 22:54:33","active",null,null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_admin (id, communityId, userId, role, invitedBy, invitedAt, acceptedAt, status, invitationToken, invitationExpiresAt) VALUES (?,?,?,?,?,?,?,?,?,?)`,
			["5dc6a1af-1b07-60b7-7179-967dd2285536","f1060047-5305-4f75-89c4-a649e449975e","2e04e70a-b2bb-4824-a118-9005d77f9ff2","owner",null,"2026-05-07 22:54:33","2026-05-07 22:54:33","active",null,null],
		);

		// === 66 community_member ===
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["01cdd0a4-0902-47b5-b719-bccb0224cf15","f1060047-5305-4f75-89c4-a649e449975e","c6894ee9-eab4-44ba-9c81-ebe3e80bd784","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["03659f88-7293-411c-ae06-38d70627831e","f1060047-5305-4f75-89c4-a649e449975e","c902d15f-1f77-4399-8462-d390a00c71c2","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["0382b598-4f6b-4f9f-9912-9b178531c029","f1060047-5305-4f75-89c4-a649e449975e","a198e42b-1521-4621-a8de-b112d7bfab7c","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["0d00072a-643c-4f3a-9207-d7bdba8e5cc9","f1060047-5305-4f75-89c4-a649e449975e","07201b07-286b-4a1f-ab2c-7251e7cfa325","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["12cf7d51-e458-451a-b8c4-9346776fcd59","f1060047-5305-4f75-89c4-a649e449975e","9e6dd0c1-43ea-4256-a1e6-17e3d63cb65b","active_member","2026-01-13 04:48:31","2026-01-13 04:48:31",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["15921851-fc0a-4441-983e-de0e21cd4e4c","f1060047-5305-4f75-89c4-a649e449975e","b7247d05-68c0-4387-a70b-70942adc0db8","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["1d065370-b0df-43e2-ad66-cfd5dd7fd745","f1060047-5305-4f75-89c4-a649e449975e","5b0fdf58-99ab-45a0-9b83-36049eb53355","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["21076a71-82b6-426b-974a-0f830caf0acd","f1060047-5305-4f75-89c4-a649e449975e","f2c71b0d-3e8f-4cca-9ba7-a2675e0c8fdf","active_member","2026-01-13 04:48:31","2026-01-13 04:48:31",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["222e530a-1fd3-407f-b9bc-c466b431b312","f1060047-5305-4f75-89c4-a649e449975e","6f7e2812-e22c-4ab8-97da-30542eff84bb","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["2274b69a-74d1-49e2-95b5-bc671fb53f3a","f1060047-5305-4f75-89c4-a649e449975e","85f486b9-f516-47fc-8286-0c3a5cbe9fc3","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["2b828418-a196-47c1-8561-1d5d1157f452","f1060047-5305-4f75-89c4-a649e449975e","f7505915-09e1-4d57-86cd-2b9e4093b364","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["2fd7f567-c8c4-43fc-baa0-690e84223ab1","f1060047-5305-4f75-89c4-a649e449975e","d7a24f6d-3f0f-4bfb-82e0-c6e2ef5ca7f3","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["34ccb170-b39a-4b6f-b24b-f233f9eb969d","f1060047-5305-4f75-89c4-a649e449975e","c087deb5-fc88-47c7-bfe4-9e6e85f9a620","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["3662cb37-000e-46f0-8b69-94c02222e1fa","f1060047-5305-4f75-89c4-a649e449975e","31a67a4b-03d0-45a3-9743-ef6faa6b80a0","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["36c51453-552b-4067-8132-d63d2ebb12b3","f1060047-5305-4f75-89c4-a649e449975e","a2de0f0b-ddce-4c19-9ca4-0cfae10d3451","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["387b7c08-a087-45b3-a14e-dd92477eee32","f1060047-5305-4f75-89c4-a649e449975e","c6e6e7bb-93a8-40e2-945c-4b7c0d5283fb","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["4169896b-0d25-4076-a836-3e92c4f1e006","f1060047-5305-4f75-89c4-a649e449975e","dcadb0c3-4aee-4422-b22f-36f770a72740","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["42c4b23b-88e1-44ad-8765-47ac9b526bd4","f1060047-5305-4f75-89c4-a649e449975e","8a31ed3a-4dd0-454b-83d8-3ab1252f52e4","active_member","2026-01-13 04:48:31","2026-01-13 04:48:31",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["4c177381-c8d0-4320-965c-b56d20f7bb36","f259d9b2-3b6f-4057-849b-3c9d381e28e3","d0d9bb97-ae61-407a-9e24-1bcbd9db055a","active_member","2026-01-13 04:54:23","2026-01-13 04:54:23",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["4d1bf10e-2ded-4f0a-981c-a6eaeaa96476","f1060047-5305-4f75-89c4-a649e449975e","5a4852f4-7062-4f0a-a9df-b5a59ce0006b","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["59c3f044-c6fb-4967-ae59-7cd611dc2765","f1060047-5305-4f75-89c4-a649e449975e","df0180db-e763-46a6-8093-d4d178536c30","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["5d5dbfa8-7fb4-46e3-beaa-82770c7608f3","f1060047-5305-4f75-89c4-a649e449975e","99460f44-8fd5-41e2-9cd2-c4006fb3d453","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["6317dbe2-37fe-4120-a044-c4b1a9eafdfa","f1060047-5305-4f75-89c4-a649e449975e","70a50a76-f495-49cd-8016-55572060ab1a","active_member","2026-01-13 04:48:31","2026-01-13 04:48:31",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["677cfdfe-ab5b-483c-a628-fb0d3dae214b","f1060047-5305-4f75-89c4-a649e449975e","19aabc32-8bd0-4389-b210-1e8657f5fe7d","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["678d8982-fef7-4a3d-8469-da84f894efc6","f1060047-5305-4f75-89c4-a649e449975e","3fbb277d-070a-4ff3-afca-b529cd01326e","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["686bba71-23b5-4bfc-bc3e-49a0a337b7c1","f1060047-5305-4f75-89c4-a649e449975e","d1ef3ddc-b4b3-4f34-b2ee-6a3283efeec9","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["6aa9067e-7e51-4113-af14-e8d7a84e1601","f1060047-5305-4f75-89c4-a649e449975e","fc0a888c-d1e3-405c-9b52-ca3c06432ee0","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["6ab9f8b5-8799-4525-a99e-44e8cc1ac9c1","f1060047-5305-4f75-89c4-a649e449975e","e7ed4652-5670-4133-8df4-771ca513e532","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["6ea77b77-019f-407d-8083-7d91f414d129","f1060047-5305-4f75-89c4-a649e449975e","caae3aa2-369b-4244-81bd-ac67023ce55f","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["706d408e-4bbc-417e-8311-e773b7599599","f1060047-5305-4f75-89c4-a649e449975e","58e1f40e-bdeb-459d-b65f-d9e3eb5d2800","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["70b6c0e2-4162-430a-98c2-e4e42f497ea4","f1060047-5305-4f75-89c4-a649e449975e","b4e65025-af12-4d55-844a-84926b1b8b65","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["75b61422-df58-40ba-8640-5f43819cd022","f1060047-5305-4f75-89c4-a649e449975e","c6449ce6-5911-4fe1-9784-76d737600396","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["75c92fe7-40c3-4b73-bd09-e859dd08a24f","f1060047-5305-4f75-89c4-a649e449975e","6d9bf161-d2ac-4763-8c29-f33e1d0d0f0e","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["7ebff86b-9c60-45de-9e45-617c66b26d17","f1060047-5305-4f75-89c4-a649e449975e","ccd01bde-f8c2-4b32-9203-7dbbff1e9db5","active_member","2026-01-13 04:48:31","2026-01-13 04:48:31",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["817f3e73-213b-4625-9c01-b84e52059272","f1060047-5305-4f75-89c4-a649e449975e","edebe06f-021c-48df-8df2-24fa9bfdb46f","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["837a19f3-00b1-4c03-83d5-a2e5b5cac0d0","f1060047-5305-4f75-89c4-a649e449975e","acd86d99-87e3-4e72-bb3c-fadd597e175a","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["839784fc-5a93-4ab0-b217-6df0d9dcb21e","f1060047-5305-4f75-89c4-a649e449975e","4bba838d-6881-443b-b6c6-931fdd728c06","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["8779931a-4cfc-40b6-9a90-ded1737011bb","f1060047-5305-4f75-89c4-a649e449975e","2eebbcce-6657-4c59-8480-a509c0e96f09","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["8cdc9809-554d-4002-b119-b7c7e9af921c","f259d9b2-3b6f-4057-849b-3c9d381e28e3","1b8513d8-ce23-4cbe-87bd-7eda05363168","active_member","2026-01-13 04:54:23","2026-01-13 04:54:23",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["905232df-b314-4bd3-b608-a066a6bff0cf","f1060047-5305-4f75-89c4-a649e449975e","eea932ff-a1ac-4f68-881d-6a0e10d3bd3c","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["97c8b1a7-860c-48bd-8e99-e3246612e3ff","f1060047-5305-4f75-89c4-a649e449975e","fa8ab102-02ae-4381-8ebd-1a3e532eee64","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["97cca68a-98fe-4453-a5bf-99f0c47ec05e","f1060047-5305-4f75-89c4-a649e449975e","8e0e5db8-a574-4910-9244-0cadc9643862","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["9a47022c-7df3-43a1-a2c0-48ac28483689","f1060047-5305-4f75-89c4-a649e449975e","e6448229-b723-423c-b8c5-026b8011e4fd","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["9b1671b7-956f-48a1-bd7d-d908dac53232","f1060047-5305-4f75-89c4-a649e449975e","45a07c84-aaae-4034-a1e4-9a25ccd708eb","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["a0c1fba7-4317-4400-b86c-37af06f600b2","f1060047-5305-4f75-89c4-a649e449975e","37cb6f12-fd06-4dac-8b6d-fc46b8831aa7","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["a37d96cf-33fb-4a4f-9dc6-279e598512a5","f1060047-5305-4f75-89c4-a649e449975e","05bcd7b8-fb68-4ed8-b348-7f2810ff7d55","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["a3e5f33e-9c36-4ffa-b00a-5b5809f81263","f1060047-5305-4f75-89c4-a649e449975e","7756f2b4-2037-40f1-850a-5b8ce6527bb7","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["a584e7a4-219f-439b-9641-3435add6b1ab","f1060047-5305-4f75-89c4-a649e449975e","ea9ab9cf-ad8a-4f17-964c-1385552e6d1c","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["a8db826d-3a33-4a94-a12b-77e4d3c88449","f1060047-5305-4f75-89c4-a649e449975e","4a4c76b9-73a1-408a-867a-564ecf585d59","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["a989b745-b512-433a-b055-aee4e23b7a57","f1060047-5305-4f75-89c4-a649e449975e","b8320a20-9ba2-47a7-89a1-dff85c38eaac","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["abdeeb0f-dae2-4cec-b1ce-88a4097070d3","f259d9b2-3b6f-4057-849b-3c9d381e28e3","2655f634-671b-4be4-ad13-217783f491e7","active_member","2026-01-13 04:54:23","2026-01-13 04:54:23",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["b17b0949-9fc8-4cd6-82fd-08f164d677d6","f1060047-5305-4f75-89c4-a649e449975e","20be7774-a17b-4df4-9f44-63fb14119f49","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["b5871098-ea03-441b-9084-0ca831ace838","f1060047-5305-4f75-89c4-a649e449975e","68bca866-6830-4110-b520-1b05c6bf24a9","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["bbb4c207-952f-4b53-a2f4-6395e9f5c056","f1060047-5305-4f75-89c4-a649e449975e","43a3f7ae-7fdd-4de0-80b0-7df7de44e19a","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["bd177dde-5cec-4c1d-9967-8e4c51a4c4df","f1060047-5305-4f75-89c4-a649e449975e","a710fa7a-5af1-47b4-909d-cfb189b0628a","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["c4309b7e-0cca-450a-96cc-89199f26829a","f1060047-5305-4f75-89c4-a649e449975e","64d2e2bf-c623-432e-9267-edbb69586d0d","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["ca057310-70da-4691-8e02-76fd8dc10f13","f1060047-5305-4f75-89c4-a649e449975e","146f9dd8-3392-4602-b307-fc9cdfb93a0c","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["cf1b6db7-ea06-4c94-a316-71591456e084","f1060047-5305-4f75-89c4-a649e449975e","7c204568-42e2-48ed-84f4-80081899820e","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["cf6d460f-c523-4f93-b07e-f4ba67866269","f1060047-5305-4f75-89c4-a649e449975e","4122f58f-46d3-489f-a872-3c535aa18368","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["d29daa0a-3625-4e72-ac0c-9bb5de7a5f95","f259d9b2-3b6f-4057-849b-3c9d381e28e3","8e0f8846-9a4e-4aa7-a224-a486ab588cba","active_member","2026-01-13 04:54:23","2026-01-13 04:54:23",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["d50b76a6-51bd-42df-96a8-c7883c0006f1","f1060047-5305-4f75-89c4-a649e449975e","0cbcf7e0-29a9-476e-9377-f205cf90e164","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["dc17d610-c3fb-442b-aec1-e52581afc8d6","f1060047-5305-4f75-89c4-a649e449975e","85d25ccb-73f2-4e28-8a78-aaab8d005bbe","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["dd8971d4-1871-46e1-a259-dc4c81bad03a","f1060047-5305-4f75-89c4-a649e449975e","5e40565b-74b5-46c5-b70f-ca051f1e30c0","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["e136e8c0-18e1-4d8e-8b1f-debd364f1d36","f1060047-5305-4f75-89c4-a649e449975e","031b6e14-a2ab-4cb5-948e-4f8e9fc250b3","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["fabc5092-bd94-4a28-8852-99f486c148b2","f1060047-5305-4f75-89c4-a649e449975e","c277c42e-0547-46da-8afc-01183555b84d","active_member","2026-01-13 04:48:31","2026-01-13 04:48:31",null],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_member (id, communityId, participantId, state, joinedAt, updatedAt, notes) VALUES (?,?,?,?,?,?,?)`,
			["fdd20da7-5f02-4543-a6d8-7ebf4fe0a1a2","f1060047-5305-4f75-89c4-a649e449975e","3d733e64-5fcc-4b6a-a02f-564e19037d2d","active_member","2026-01-13 04:46:39","2026-01-13 04:46:39",null],
		);

		// === 8 community_meeting ===
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["56dd9bdc-3d79-4bbf-8412-5955daa07e93","f1060047-5305-4f75-89c4-a649e449975e","Del Valle",null,"2026-02-28 01:45:00.000",null,60,0,"weekly",2,"thursday",null,null,1,null,null,"2026-02-24 18:11:33","La Santa Misa está programada a las 19:00 horas y la reunión tendrá lugar en las oficinas del dispensario al terminar.\nPara los nuevos servidores traer su mantelito."],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["5a9bd1a8-4b2b-4c20-b26b-62d84aa781ae","f1060047-5305-4f75-89c4-a649e449975e","Buen Despacho",null,"2026-01-16 02:00:00.000",null,90,0,"weekly",2,"thursday",null,null,1,null,null,"2026-01-13 05:14:42","La Santa Misa está programada a las 19:00 horas y la reunión tendrá lugar en las oficinas del dispensario al terminar."],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["5d7a8b4d-06e4-49dd-9a2f-0c72219177d8","f1060047-5305-4f75-89c4-a649e449975e","Buen Despacho",null,"2026-01-30 02:00:00.000",null,90,0,"weekly",2,"thursday",null,"5a9bd1a8-4b2b-4c20-b26b-62d84aa781ae",1,"2026-01-29",null,"2026-01-27 18:01:19","La Santa Misa está programada a las 19:00 horas y la reunión tendrá lugar en las oficinas del dispensario al terminar."],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["af54b677-4d2b-41cd-ba86-e49b6a41b0b2","f1060047-5305-4f75-89c4-a649e449975e","Del Valle",null,"2026-03-27 01:45:00.000",null,60,0,"weekly",2,"thursday",null,"f873192f-d8a9-42f6-ab55-f8b228dd3efd",1,"2026-03-26",null,"2026-03-24 16:46:14","La Santa Misa está programada a las 19:00 horas y la reunión tendrá lugar en las oficinas del dispensario al terminar."],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["cf5d8766-214e-4a7e-9f43-b2bf6ebff3d3","f1060047-5305-4f75-89c4-a649e449975e","Buen Despacho",null,"2026-02-13 02:00:00.000",null,90,0,"weekly",2,"thursday",null,"5d7a8b4d-06e4-49dd-9a2f-0c72219177d8",1,"2026-02-12",null,"2026-02-11 18:01:25","La Santa Misa está programada a las 19:00 horas y la reunión tendrá lugar en las oficinas del dispensario al terminar."],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["d5760463-ea59-4c16-b0a3-8c6fb9a670e7","f259d9b2-3b6f-4057-849b-3c9d381e28e3","Tlalpan",null,"2026-01-21 02:00:00.000",null,90,0,"weekly",2,"tuesday",null,null,1,null,null,"2026-01-13 05:16:32","Tendremos nuestra 3a preparación para el retiro Tlalpan XII\n\nLa Santa Misa está programada a las 19:00 horas y la reunión tendrá lugar en los salones de la parroquia al terminar."],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["f3625cba-c8ec-4b62-99f7-f0a2c2000409","f1060047-5305-4f75-89c4-a649e449975e","Kerigma con el Padre Álvaro","Después de la misa de 7.00 pm","2026-02-10 02:00:00.000",null,90,0,"weekly",1,"monday",null,null,1,null,null,"2026-02-09 19:53:52","{{nombre}}\n{{descripcion}}"],
		);
		await queryRunner.query(
			`INSERT OR IGNORE INTO community_meeting (id, communityId, title, description, startDate, endDate, durationMinutes, isAnnouncement, recurrenceFrequency, recurrenceInterval, recurrenceDayOfWeek, recurrenceDayOfMonth, parentMeetingId, isRecurrenceTemplate, instanceDate, exceptionType, createdAt, flyer_template) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			["f873192f-d8a9-42f6-ab55-f8b228dd3efd","f1060047-5305-4f75-89c4-a649e449975e","Del Valle",null,"2026-03-13 01:45:00.000",null,60,0,"weekly",2,"thursday",null,"56dd9bdc-3d79-4bbf-8412-5955daa07e93",1,"2026-03-12",null,"2026-03-11 00:41:37","La Santa Misa está programada a las 19:00 horas y la reunión tendrá lugar en las oficinas del dispensario al terminar."],
		);

		console.log('[RestoreCommunityChildrenInline] Restore inline completado.');
	}

	public async down(): Promise<void> {
		// Intencionalmente no-op. Revertir un restore borraría data legítima.
		console.log('[RestoreCommunityChildrenInline] down() es no-op por seguridad.');
	}
}
