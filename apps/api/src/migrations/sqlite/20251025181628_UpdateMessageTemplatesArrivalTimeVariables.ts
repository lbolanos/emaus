import { MigrationInterface, QueryRunner } from 'typeorm';

export class UpdateMessageTemplatesArrivalTimeVariables20251025181628
	implements MigrationInterface
{
	public async up(queryRunner: QueryRunner): Promise<void> {
		console.log('🔄 Updating message templates to use new arrival time variables...');

		try {
			// Update retreat-specific message templates
			const retreatTemplateUpdates = await queryRunner.query(`
                SELECT id, message FROM message_templates
                WHERE message LIKE '%{participant.hora_llegada}%'
            `);

			console.log(`📊 Found ${retreatTemplateUpdates.length} retreat-specific templates to update`);

			for (const template of retreatTemplateUpdates) {
				let updatedMessage = template.message;

				// Replace old variable with appropriate new variables based on template type
				// We need to check the template type to determine which variable to use
				const templateTypeResult = await queryRunner.query(
					`
                    SELECT type FROM message_templates WHERE id = ?
                `,
					[template.id],
				);

				const templateType = templateTypeResult[0]?.type;

				if (templateType) {
					if (templateType.includes('WALKER') || templateType.includes('CAMINANTE')) {
						// For walker-specific templates, use walker arrival time
						updatedMessage = updatedMessage.replace(
							/\{participant\.hora_llegada\}/g,
							'{retreat.walkerArrivalTime}',
						);
					} else if (templateType.includes('SERVER') || templateType.includes('SERVIDOR')) {
						// For server-specific templates, use server arrival time
						updatedMessage = updatedMessage.replace(
							/\{participant\.hora_llegada\}/g,
							'{retreat.serverArrivalTimeFriday}',
						);
					} else {
						// For general templates, provide both options with context
						updatedMessage = updatedMessage.replace(
							/\{participant\.hora_llegada\}/g,
							'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)',
						);
					}
				}

				// Update the template
				await queryRunner.query(
					`
                    UPDATE message_templates
                    SET message = ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `,
					[updatedMessage, template.id],
				);

				console.log(`  ✅ Updated retreat template: ${template.id}`);
			}

			// Update global message templates
			const globalTemplateUpdates = await queryRunner.query(`
                SELECT id, message FROM global_message_templates
                WHERE message LIKE '%{participant.hora_llegada}%'
            `);

			console.log(`📊 Found ${globalTemplateUpdates.length} global templates to update`);

			for (const template of globalTemplateUpdates) {
				let updatedMessage = template.message;

				// For global templates, provide both options with context
				updatedMessage = updatedMessage.replace(
					/\{participant\.hora_llegada\}/g,
					'{retreat.walkerArrivalTime} (caminantes) / {retreat.serverArrivalTimeFriday} (servidores)',
				);

				// Update the template
				await queryRunner.query(
					`
                    UPDATE global_message_templates
                    SET message = ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `,
					[updatedMessage, template.id],
				);

				console.log(`  ✅ Updated global template: ${template.id}`);
			}

			// Create a helpful log of what was changed
			const totalUpdates = retreatTemplateUpdates.length + globalTemplateUpdates.length;
			console.log(
				`🎉 Successfully updated ${totalUpdates} message templates to use new arrival time variables`,
			);

			// Add a comment about the migration purpose
			console.log(`📝 Migration summary:`);
			console.log(`   • Walker templates now use: {retreat.walkerArrivalTime}`);
			console.log(`   • Server templates now use: {retreat.serverArrivalTimeFriday}`);
			console.log(`   • General templates show both with context`);
			console.log(`   • Old {participant.hora_llegada} variable is no longer used`);
		} catch (error: any) {
			console.error('❌ Error updating message templates:', error?.message || error);
			throw error;
		}
	}

	public async down(queryRunner: QueryRunner): Promise<void> {
		console.log('⏪ Rolling back message template variable updates...');

		try {
			// For rollback, we need to revert the changes
			// This is more complex since we need to know the original template type context

			// Update retreat-specific message templates - revert to old variable
			const retreatTemplateUpdates = await queryRunner.query(`
                SELECT id, message FROM message_templates
                WHERE message LIKE '%{retreat.walkerArrivalTime}%'
                   OR message LIKE '%{retreat.serverArrivalTimeFriday}%'
            `);

			console.log(
				`📊 Found ${retreatTemplateUpdates.length} retreat-specific templates to rollback`,
			);

			for (const template of retreatTemplateUpdates) {
				let updatedMessage = template.message;

				// Replace new variables back to old variable
				updatedMessage = updatedMessage.replace(
					/\{retreat\.walkerArrivalTime\}\s*\(caminantes\)\s*\/\s*\{retreat\.serverArrivalTimeFriday\}\s*\(servidores\)/g,
					'{participant.hora_llegada}',
				);
				updatedMessage = updatedMessage.replace(
					/\{retreat\.walkerArrivalTime\}/g,
					'{participant.hora_llegada}',
				);
				updatedMessage = updatedMessage.replace(
					/\{retreat\.serverArrivalTimeFriday\}/g,
					'{participant.hora_llegada}',
				);

				await queryRunner.query(
					`
                    UPDATE message_templates
                    SET message = ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `,
					[updatedMessage, template.id],
				);

				console.log(`  ✅ Rolled back retreat template: ${template.id}`);
			}

			// Update global message templates - revert to old variable
			const globalTemplateUpdates = await queryRunner.query(`
                SELECT id, message FROM global_message_templates
                WHERE message LIKE '%{retreat.walkerArrivalTime}%'
                   OR message LIKE '%{retreat.serverArrivalTimeFriday}%'
            `);

			console.log(`📊 Found ${globalTemplateUpdates.length} global templates to rollback`);

			for (const template of globalTemplateUpdates) {
				let updatedMessage = template.message;

				// Replace new variables back to old variable
				updatedMessage = updatedMessage.replace(
					/\{retreat\.walkerArrivalTime\}\s*\(caminantes\)\s*\/\s*\{retreat\.serverArrivalTimeFriday\}\s*\(servidores\)/g,
					'{participant.hora_llegada}',
				);
				updatedMessage = updatedMessage.replace(
					/\{retreat\.walkerArrivalTime\}/g,
					'{participant.hora_llegada}',
				);
				updatedMessage = updatedMessage.replace(
					/\{retreat\.serverArrivalTimeFriday\}/g,
					'{participant.hora_llegada}',
				);

				await queryRunner.query(
					`
                    UPDATE global_message_templates
                    SET message = ?, updatedAt = CURRENT_TIMESTAMP
                    WHERE id = ?
                `,
					[updatedMessage, template.id],
				);

				console.log(`  ✅ Rolled back global template: ${template.id}`);
			}

			const totalUpdates = retreatTemplateUpdates.length + globalTemplateUpdates.length;
			console.log(
				`✅ Successfully rolled back ${totalUpdates} message templates to use {participant.hora_llegada}`,
			);
		} catch (error: any) {
			console.error('❌ Error rolling back message template updates:', error?.message || error);
			throw error;
		}
	}
}
