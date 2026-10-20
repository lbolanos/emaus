/**
 * GET /participant-communications/retreat/:retreatId/latest-by-template-type
 * (specs/ux-mam-responsabilidades, D3): the "ya enviado" mark of the
 * send-tasks tab. Last send per participant, only of the asked template type,
 * only for callers with access to the retreat.
 */
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { createMockRequest, createMockResponse } from '../test-utils/authTestUtils';
import { User } from '@/entities/user.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { ParticipantCommunication } from '@/entities/participantCommunication.entity';

describe('ParticipantCommunicationController.getLatestByTemplateType', () => {
	let controller: any;
	let owner: User;
	let outsider: User;
	let retreat: any;
	let p1: any;
	let p2: any;
	let briefing: MessageTemplate;
	let welcome: MessageTemplate;

	beforeAll(async () => {
		await setupTestDatabase();
		const mod = await import('@/controllers/participantCommunicationController');
		controller = new mod.ParticipantCommunicationController();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	const send = (participantId: string, template: MessageTemplate, sentAt: string, messageType = 'whatsapp') =>
		TestDataFactory.getDataSource()
			.getRepository(ParticipantCommunication)
			.save({
				participantId,
				retreatId: retreat.id,
				scope: 'retreat',
				messageType,
				recipientContact: '+520000000000',
				messageContent: 'contenido que no debe viajar',
				templateId: template.id,
				templateName: template.name,
				sentAt: new Date(sentAt),
			} as any);

	beforeEach(async () => {
		await clearTestData();
		owner = await TestDataFactory.createTestUser();
		outsider = await TestDataFactory.createTestUser();
		retreat = await TestDataFactory.createTestRetreat();
		p1 = await TestDataFactory.createTestParticipant(retreat.id);
		p2 = await TestDataFactory.createTestParticipant(retreat.id);

		const { UserRetreat } = await import('@/entities/userRetreat.entity');
		const role = await TestDataFactory.createTestRole({ name: `coordinator-${Date.now()}` });
		await TestDataFactory.getDataSource()
			.getRepository(UserRetreat)
			.save({ userId: owner.id, retreatId: retreat.id, roleId: role.id });

		const templates = TestDataFactory.getDataSource().getRepository(MessageTemplate);
		briefing = await templates.save(
			templates.create({ retreatId: retreat.id, name: 'Tareas del Servidor', type: 'SERVER_ASSIGNMENTS_BRIEFING', message: 'x' }),
		);
		welcome = await templates.save(
			templates.create({ retreatId: retreat.id, name: 'Bienvenida', type: 'SERVER_WELCOME', message: 'x' }),
		);
	});

	const call = async (user: User, type: unknown) => {
		const req = createMockRequest(user, {}, { retreatId: retreat.id });
		(req as any).query = { type };
		const res = createMockResponse();
		await controller.getLatestByTemplateType(req, res);
		return res;
	};

	it('returns the latest send per participant, only of the asked type', async () => {
		await send(p1.id, briefing, '2026-10-10T15:00:00Z', 'email');
		await send(p1.id, briefing, '2026-10-12T15:00:00Z', 'whatsapp');
		await send(p2.id, welcome, '2026-10-13T15:00:00Z');

		const res = await call(owner, 'SERVER_ASSIGNMENTS_BRIEFING');

		const body = (res.json as jest.Mock).mock.calls[0][0];
		expect(Object.keys(body)).toEqual([p1.id]);
		expect(body[p1.id].messageType).toBe('whatsapp');
		expect(new Date(body[p1.id].sentAt).toISOString()).toBe('2026-10-12T15:00:00.000Z');
		expect(JSON.stringify(body)).not.toContain('contenido que no debe viajar');
	});

	it('400 with an unknown template type', async () => {
		const res = await call(owner, 'NOT_A_TYPE');
		expect(res.status).toHaveBeenCalledWith(400);
	});

	it('403 without access to the retreat', async () => {
		await send(p1.id, briefing, '2026-10-12T15:00:00Z');
		const res = await call(outsider, 'SERVER_ASSIGNMENTS_BRIEFING');
		expect(res.status).toHaveBeenCalledWith(403);
		expect(res.json).not.toHaveBeenCalledWith(expect.objectContaining({ [p1.id]: expect.anything() }));
	});
});
