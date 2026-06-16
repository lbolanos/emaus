// Captura los emails enviados para inspeccionar el HTML resuelto.
const mockSentEmails: any[] = [];
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async (args: any) => {
			mockSentEmails.push(args);
			return true;
		}),
	})),
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageSequenceService } from '@/services/messageSequenceService';
import { AppDataSource } from '@/data-source';
import { ScheduledMessage } from '@/entities/scheduledMessage.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { SequenceStep } from '@/entities/sequenceStep.entity';
import { MessageSequence } from '@/entities/messageSequence.entity';

/**
 * M1 del security review: los valores de las variables del participante
 * (auto-reportados) NO deben inyectarse como HTML crudo en el email saliente.
 */
describe('MessageSequenceService — escape de HTML en email (anti-inyección)', () => {
	let svc: MessageSequenceService;
	const MALICIOUS = '<img src=x onerror=alert(1)>';

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new MessageSequenceService();
	});
	afterAll(async () => {
		await teardownTestDatabase();
	});
	beforeEach(async () => {
		await clearTestData();
		mockSentEmails.length = 0;
		for (const Entity of [ScheduledMessage, SequenceStep, MessageSequence]) {
			await AppDataSource.getRepository(Entity).createQueryBuilder().delete().execute();
		}
	});

	async function setup(channel: 'email' | 'whatsapp') {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' } as any);
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'dest@example.com',
			cellPhone: '5215555555555',
			firstName: MALICIOUS, // nombre malicioso
		} as any);
		const tplRepo = AppDataSource.getRepository(MessageTemplate);
		await tplRepo.save(
			tplRepo.create({
				name: 'WALKER_WELCOME',
				type: 'WALKER_WELCOME' as any,
				message: 'Hola {participant.firstName}',
				retreatId: retreat.id,
				scope: 'retreat',
			}),
		);
		const seq = await svc.createSequence({
			name: 'S',
			retreatId: retreat.id,
			trigger: 'participant_created',
			audience: 'walker',
			steps: [
				{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel } as any,
			],
		});
		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		await smRepo.save(
			smRepo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: participant.id,
				retreatId: retreat.id,
				channel,
				templateType: 'WALKER_WELCOME',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);
		return { retreat, participant };
	}

	it('email: el nombre malicioso va escapado en el HTML, no como tag crudo', async () => {
		const { retreat } = await setup('email');
		await svc.processDue(new Date(), 200, retreat.id);

		expect(mockSentEmails).toHaveLength(1);
		const { html } = mockSentEmails[0];
		expect(html).not.toContain('<img src=x onerror=alert(1)>');
		expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
	});

	it('whatsapp: NO se escapa (texto plano para el deep-link)', async () => {
		const { retreat, participant } = await setup('whatsapp');
		await svc.processDue(new Date(), 200, retreat.id);

		const sm = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { participantId: participant.id },
		});
		expect(sm?.status).toBe('queued');
		// El contenido conserva el valor crudo (sin entidades &lt;): WhatsApp es texto.
		expect(sm?.resolvedContent).toContain(MALICIOUS);
	});
});
