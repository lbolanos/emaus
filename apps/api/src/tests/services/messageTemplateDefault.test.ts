// Mock del EmailService antes de importar el service (envío desatendido simulado).
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
	})),
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageSequenceService } from '@/services/messageSequenceService';
import { MessageTemplateService, findDefaultTemplateForType } from '@/services/messageTemplateService';
import { AppDataSource } from '@/data-source';
import { ScheduledMessage } from '@/entities/scheduledMessage.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import { SequenceStep } from '@/entities/sequenceStep.entity';
import { MessageTemplateDefaultAndPinSteps20261004120000 } from '@/migrations/sqlite/20261004120000_MessageTemplateDefaultAndPinSteps';

/**
 * M6 — "predeterminada" per template type. Wherever the system picks a
 * template by type (unpinned steps, the seed, quick-send buttons) it takes the
 * retreat's default of that type, else the oldest. Seeded steps are born
 * pinned, and the migration pins the ones that were left unpinned.
 */
describe('M6 — default template per type', () => {
	let seqSvc: MessageSequenceService;
	let tplSvc: MessageTemplateService;

	beforeAll(async () => {
		await setupTestDatabase();
		seqSvc = new MessageSequenceService();
		tplSvc = new MessageTemplateService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	// Explicit createdAt: "oldest" must be unambiguous.
	const OLD = new Date('2026-01-01T10:00:00.000Z');
	const NEW = new Date('2026-01-05T10:00:00.000Z');
	const repo = () => AppDataSource.getRepository(MessageTemplate);

	async function tpl(
		retreatId: string,
		opts: { name: string; type?: string; createdAt?: Date; isDefault?: boolean; message?: string },
	) {
		return repo().save(
			repo().create({
				scope: 'retreat',
				retreatId,
				type: (opts.type ?? 'WALKER_WELCOME') as any,
				message: opts.message ?? `${opts.name} {participant.firstName}`,
				name: opts.name,
				createdAt: opts.createdAt ?? OLD,
				isDefault: opts.isDefault ?? false,
			}),
		);
	}
	const isDefault = async (id: string) => (await repo().findOneBy({ id }))!.isDefault;

	it('setting a default clears it only from the same type in the same retreat', async () => {
		const a = await TestDataFactory.createTestRetreat();
		const b = await TestDataFactory.createTestRetreat();
		const one = await tpl(a.id, { name: 'One' });
		const two = await tpl(a.id, { name: 'Two', createdAt: NEW });
		const otherType = await tpl(a.id, { name: 'Server', type: 'SERVER_WELCOME', isDefault: true });
		const otherRetreat = await tpl(b.id, { name: 'B', isDefault: true });

		await tplSvc.update(one.id, { isDefault: true });
		await tplSvc.update(two.id, { isDefault: true });
		expect(await isDefault(two.id)).toBe(true);
		expect(await isDefault(one.id)).toBe(false);
		expect(await isDefault(otherType.id)).toBe(true);
		expect(await isDefault(otherRetreat.id)).toBe(true);

		// Creating a new one as default takes the flag over too.
		const three = await tplSvc.createForRetreat(a.id, {
			name: 'Three',
			type: 'WALKER_WELCOME',
			message: 'Three',
			isDefault: true,
		} as any);
		expect(await isDefault(three.id)).toBe(true);
		expect(await isDefault(two.id)).toBe(false);
	});

	it('the default wins over the oldest; without a default, the oldest', async () => {
		const r = await TestDataFactory.createTestRetreat();
		const oldest = await tpl(r.id, { name: 'Oldest' });
		const newer = await tpl(r.id, { name: 'Newer', createdAt: NEW });

		expect((await findDefaultTemplateForType(r.id, 'WALKER_WELCOME'))!.id).toBe(oldest.id);
		await tplSvc.update(newer.id, { isDefault: true });
		expect((await findDefaultTemplateForType(r.id, 'WALKER_WELCOME'))!.id).toBe(newer.id);
	});

	it('an unpinned step sends the default, not the oldest', async () => {
		const r = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const participant = await TestDataFactory.createTestParticipant(r.id, {
			type: 'walker',
			email: 'm6@example.com',
			cellPhone: '5512345678',
		} as any);
		await tpl(r.id, { name: 'Vieja', message: 'VIEJA {participant.firstName}' });
		await tpl(r.id, { name: 'Nueva', createdAt: NEW, isDefault: true, message: 'NUEVA {participant.firstName}' });
		const seq = await seqSvc.createSequence({
			name: 'M6',
			retreatId: r.id,
			trigger: 'participant_created',
			audience: 'walker',
			steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp', templateId: null }] as any,
		});
		const smRepo = AppDataSource.getRepository(ScheduledMessage);
		const row = await smRepo.save(
			smRepo.create({
				sequenceId: seq.id,
				stepId: seq.steps![0].id,
				participantId: participant.id,
				retreatId: r.id,
				channel: 'whatsapp',
				templateType: 'WALKER_WELCOME',
				recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);

		await seqSvc.processDue();

		const after = await smRepo.findOneBy({ id: row.id });
		expect(after?.status).toBe('queued');
		expect(after?.resolvedContent).toContain('NUEVA');
	});

	it('the seeded sequences are born pinned to the default of each type', async () => {
		const r = await TestDataFactory.createTestRetreat();
		await tpl(r.id, { name: 'Bienvenida vieja' });
		const chosen = await tpl(r.id, { name: 'Bienvenida elegida', createdAt: NEW, isDefault: true });

		await seqSvc.createDefaultMessageSequencesForRetreat({ id: r.id });

		const steps = await AppDataSource.getRepository(SequenceStep)
			.createQueryBuilder('st')
			.innerJoin('st.sequence', 'seq')
			.where('seq.retreatId = :rid', { rid: r.id })
			.getMany();
		const welcome = steps.find((s) => s.templateType === 'WALKER_WELCOME')!;
		expect(welcome.templateId).toBe(chosen.id);
		// A type the retreat has no template for stays unpinned (nothing to pin).
		expect(steps.find((s) => s.templateType === 'PRIVACY_DATA_DELETE')!.templateId ?? null).toBeNull();
	});

	it('the migration pins live unpinned steps to the default (else the oldest), idempotently', async () => {
		const r = await TestDataFactory.createTestRetreat();
		const oldWelcome = await tpl(r.id, { name: 'Old welcome' });
		const defaultWelcome = await tpl(r.id, { name: 'Default welcome', createdAt: NEW, isDefault: true });
		const onlyServer = await tpl(r.id, { name: 'Server', type: 'SERVER_WELCOME' });
		const seq = await seqSvc.createSequence({
			name: 'Unpinned',
			retreatId: r.id,
			trigger: 'participant_created',
			audience: 'all',
			steps: [
				{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp', templateId: null },
				{ stepOrder: 1, offsetDays: 0, sendHour: 9, templateType: 'SERVER_WELCOME', channel: 'whatsapp', templateId: null },
				{ stepOrder: 2, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp', templateId: oldWelcome.id },
			] as any,
		});

		const qr = AppDataSource.createQueryRunner();
		try {
			const migration = new MessageTemplateDefaultAndPinSteps20261004120000();
			await migration.up(qr);
			await migration.up(qr); // re-run after a half-applied start: no error
		} finally {
			await qr.release();
		}

		const byOrder = new Map(
			(await AppDataSource.getRepository(SequenceStep).findBy({ sequenceId: seq.id })).map((s) => [s.stepOrder, s]),
		);
		expect(byOrder.get(0)!.templateId).toBe(defaultWelcome.id);
		expect(byOrder.get(1)!.templateId).toBe(onlyServer.id);
		// An already pinned step keeps its own choice.
		expect(byOrder.get(2)!.templateId).toBe(oldWelcome.id);
	});
});
