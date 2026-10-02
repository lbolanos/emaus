// Mock del EmailService antes de importar el service (envío desatendido simulado).
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
	})),
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageSequenceService } from '@/services/messageSequenceService';
import { AppDataSource } from '@/data-source';
import { ScheduledMessage } from '@/entities/scheduledMessage.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';

// M4: `{custom_message}` es un hueco de envío manual, no una variable del
// motor. La bandeja de WhatsApp no edita el texto, así que sin este guard una
// secuencia lo despacha LITERAL (2026-10-01: un mensaje real salió así).
// El guard cubre el placeholder crudo Y la frase neutral con la que la
// migración 20261003120000 reemplazó los existentes — sin eso, una plantilla
// migrada pero nunca personalizada saldría con la frase literal.
describe('MessageSequenceService — M4: guard de {custom_message}', () => {
	let svc: MessageSequenceService;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new MessageSequenceService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	const SKIP_ERROR =
		'plantilla con {custom_message} (mensaje manual): edítala antes de usarla en secuencias';
	const NEUTRAL_PHRASE = '«Escribe aquí tu mensaje personalizado»';

	async function createGeneralTemplate(retreatId: string, message: string) {
		const repo = AppDataSource.getRepository(MessageTemplate);
		return repo.save(
			repo.create({ type: 'GENERAL' as any, scope: 'retreat', retreatId, name: 'Mensaje General', message }),
		);
	}

	async function seedRetreatWithWalker() {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'm4@example.com',
			cellPhone: '5512345678',
		} as any);
		return { retreat, participant };
	}

	/** Secuencia de 1 paso GENERAL con su fila scheduled en el estado pedido. */
	async function seedStepWithRow(
		retreatId: string,
		participantId: string,
		row: { status: string; resolvedContent?: string; resolvedContact?: string },
	) {
		const seq = await svc.createSequence({
			name: 'M4',
			retreatId,
			trigger: 'participant_created',
			audience: 'walker',
			steps: [
				{
					stepOrder: 0,
					offsetDays: 0,
					sendHour: 9,
					templateType: 'GENERAL',
					channel: 'whatsapp',
				},
			] as any,
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const step = seq.steps![0];
		const saved = await repo.save(
			repo.create({
				sequenceId: seq.id,
				stepId: step.id,
				participantId,
				retreatId,
				channel: 'whatsapp',
				templateType: 'GENERAL',
				recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: row.status,
				resolvedContent: row.resolvedContent ?? null,
				resolvedContact: row.resolvedContact ?? null,
			}),
		);
		return { seq, step, saved };
	}

	it('processDue salta (skipped) con error accionable cuando la plantilla tiene {custom_message}', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		await createGeneralTemplate(
			retreat.id,
			'Hola {participant.nickname}\n\n{custom_message}\n\nUn abrazo.',
		);
		const { saved } = await seedStepWithRow(retreat.id, participant.id, { status: 'pending' });

		await svc.processDue();

		const after = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id: saved.id },
		});
		// Cae en "Problemas" (descartable/bulk), no en la bandeja de despacho.
		expect(after?.status).toBe('skipped');
		expect(after?.error).toBe(SKIP_ERROR);
		expect(after?.resolvedContent ?? '').not.toContain('{custom_message}');
	});

	it('la frase neutral (plantilla ya migrada) también se salta: no sale literal al caminante', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		await createGeneralTemplate(
			retreat.id,
			`Hola {participant.nickname}\n\n${NEUTRAL_PHRASE}\n\nUn abrazo.`,
		);
		const { saved } = await seedStepWithRow(retreat.id, participant.id, { status: 'pending' });

		await svc.processDue();

		const after = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id: saved.id },
		});
		expect(after?.status).toBe('skipped');
		expect(after?.error).toBe(SKIP_ERROR);
	});

	it('previewStep advierte el hueco en vez de pintar un contenido que no va a salir', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		await createGeneralTemplate(
			retreat.id,
			'Hola {participant.nickname}\n\n{custom_message}\n\nUn abrazo.',
		);

		const preview = await svc.previewStep({
			retreatId: retreat.id,
			participantId: participant.id,
			templateType: 'GENERAL',
			channel: 'whatsapp',
			recipientTarget: 'participant',
		});

		expect(preview?.content).toBe('');
		expect(preview?.warning).toContain('hueco de envío manual');
		expect(preview?.warning).toContain('{custom_message}');
	});

	it('regenerateQueuedForRetreat conserva el snapshot viejo y cuenta skipped', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		await createGeneralTemplate(
			retreat.id,
			'Hola {participant.nickname}\n\n{custom_message}\n\nUn abrazo.',
		);
		const { saved } = await seedStepWithRow(retreat.id, participant.id, {
			status: 'queued',
			resolvedContent: 'SNAPSHOT VIEJO',
			resolvedContact: '5512345678',
		});

		const result = await svc.regenerateQueuedForRetreat(retreat.id);

		// "Renovar" el snapshot con el marcador literal es peor que dejar el
		// viejo: quien corrige, edita la plantilla.
		expect(result).toEqual({ regenerated: 0, skipped: 1 });
		const after = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id: saved.id },
		});
		expect(after?.status).toBe('queued');
		expect(after?.resolvedContent).toBe('SNAPSHOT VIEJO');
	});
});
