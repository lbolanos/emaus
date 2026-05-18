import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Adds `communityId` column to `chat_conversations` so the AI chat (Jessy) can
 * persist which community the conversation is bound to — paralelo a `retreatId`.
 *
 * Habilita las tools nuevas del bot que crean miembros de comunidad: necesitan
 * conocer el contexto de comunidad del usuario y, al guardar la conversación,
 * recordarlo para que al reabrir el chat siga apuntando a la misma community.
 *
 * Idempotent: skip if column already exists. ADD COLUMN nullable es seguro;
 * NO requiere recreate-table.
 */
export class AddCommunityIdToChatConversation20260518000000 implements MigrationInterface {
	name = 'AddCommunityIdToChatConversation';
	timestamp = '20260518000000';

	public async up(queryRunner: QueryRunner): Promise<void> {
		const cols: { name: string }[] = await queryRunner.query(
			`SELECT name FROM pragma_table_info('chat_conversations')`,
		);
		const names = new Set(cols.map((c) => c.name));

		if (!names.has('communityId')) {
			await queryRunner.query(
				`ALTER TABLE chat_conversations ADD COLUMN communityId VARCHAR`,
			);
			console.log('✅ Added communityId column to chat_conversations');
		}
	}

	public async down(_queryRunner: QueryRunner): Promise<void> {
		// SQLite < 3.35 cannot DROP COLUMN trivially. La columna es nullable,
		// así que un no-op es seguro.
		console.log(
			'⚠️  AddCommunityIdToChatConversation down() is a no-op (column kept).',
		);
	}
}
