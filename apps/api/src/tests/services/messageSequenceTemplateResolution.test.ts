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

// M3: un paso puede fijar una plantilla concreta (templateId) aunque comparta
// tipo con otras del retiro. Esta suite fija la semántica de resolución:
// id del paso gana; id inválido/ajeno cae al fallback por tipo (createdAt ASC).
// Es la regresión del incidente "Ultimo Prendas": una plantilla nueva del mismo
// tipo era inalcanzable porque el motor se quedaba con la primera fila.
describe('MessageSequenceService — M3: resolución de plantilla por templateId', () => {
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

	// createdAt EXPLÍCITO: el fallback determinista necesita dos plantillas del
	// mismo tipo con orden inequívoco (el @CreateDateColumn respeta el valor
	// cuando viene seteado; sin esto ambas nacerían en el mismo ms).
	const OLD = new Date('2026-01-01T10:00:00.000Z');
	const NEW = new Date('2026-01-05T10:00:00.000Z');

	async function createTemplate(
		retreatId: string,
		opts: { name: string; message: string; createdAt: Date },
	) {
		const repo = AppDataSource.getRepository(MessageTemplate);
		return repo.save(
			repo.create({ type: 'WALKER_WELCOME' as any, scope: 'retreat', retreatId, ...opts }),
		);
	}

	async function seedRetreatWithWalker() {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'm3@example.com',
			cellPhone: '5512345678',
		} as any);
		return { retreat, participant };
	}

	/**
	 * Secuencia de N pasos (todos WALKER_WELCOME por whatsapp) con sus filas
	 * scheduled vencidas en pending. Cada paso fija su templateId (o null para
	 * ejercer el fallback por tipo).
	 */
	async function seedSteps(
		retreatId: string,
		participantId: string,
		steps: Array<{ templateId?: string | null }>,
	) {
		const seq = await svc.createSequence({
			name: 'M3',
			retreatId,
			trigger: 'participant_created',
			audience: 'walker',
			steps: steps.map((s, i) => ({
				stepOrder: i,
				offsetDays: 0,
				sendHour: 9,
				templateType: 'WALKER_WELCOME',
				channel: 'whatsapp',
				templateId: s.templateId ?? null,
			})) as any,
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const rows = seq.steps!.map((step) =>
			repo.create({
				sequenceId: seq.id,
				stepId: step.id,
				participantId,
				retreatId,
				channel: 'whatsapp',
				templateType: 'WALKER_WELCOME',
				recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000),
				status: 'pending',
			}),
		);
		const saved = await repo.save(rows);
		return { seq, saved };
	}

	// El escenario del bug: dos plantillas del mismo tipo, la nueva inalcanzable.
	async function seedOldAndNew(retreatId: string) {
		const vieja = await createTemplate(retreatId, {
			name: 'Vieja welcome',
			message: 'VIEJA {participant.firstName}',
			createdAt: OLD,
		});
		const nueva = await createTemplate(retreatId, {
			name: 'Nueva welcome',
			message: 'NUEVA {participant.firstName}',
			createdAt: NEW,
		});
		return { vieja, nueva };
	}

	it('processDue envía la plantilla fijada por id aunque exista una más antigua del mismo tipo', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const { nueva } = await seedOldAndNew(retreat.id);
		const { saved } = await seedSteps(retreat.id, participant.id, [{ templateId: nueva.id }]);

		await svc.processDue();

		const after = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id: saved[0].id },
		});
		expect(after?.status).toBe('queued');
		expect(after?.resolvedContent).toContain('NUEVA');
		expect(after?.resolvedContent ?? '').not.toContain('VIEJA');
	});

	it('templateId de OTRO retiro no aplica: cae al fallback por tipo (la más antigua del propio)', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		await seedOldAndNew(retreat.id);
		// Plantilla del mismo tipo en otro retiro: el id viaja en el paso
		// (p. ej. tras copiar una secuencia), pero no es de este retiro.
		const other = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const foreign = await createTemplate(other.id, {
			name: 'Ajena',
			message: 'AJENA {participant.firstName}',
			createdAt: OLD,
		});
		const { saved } = await seedSteps(retreat.id, participant.id, [{ templateId: foreign.id }]);

		await svc.processDue();

		const after = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id: saved[0].id },
		});
		expect(after?.status).toBe('queued');
		expect(after?.resolvedContent).toContain('VIEJA');
		expect(after?.resolvedContent ?? '').not.toContain('AJENA');
	});

	it('sin templateId y dos del mismo tipo: gana la de createdAt ASC (determinista, mismo criterio del backfill)', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		await seedOldAndNew(retreat.id);
		const { saved } = await seedSteps(retreat.id, participant.id, [{}]);

		await svc.processDue();

		const after = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id: saved[0].id },
		});
		expect(after?.status).toBe('queued');
		expect(after?.resolvedContent).toContain('VIEJA');
	});

	it('batch: dos pasos con templateId distintos reciben CADA uno su plantilla, sin findOne por mensaje', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const { nueva } = await seedOldAndNew(retreat.id);
		const segunda = await createTemplate(retreat.id, {
			name: 'Segunda nueva',
			message: 'DOS {participant.firstName}',
			createdAt: new Date('2026-01-06T10:00:00.000Z'),
		});
		const { saved } = await seedSteps(retreat.id, participant.id, [
			{ templateId: nueva.id },
			{ templateId: segunda.id },
		]);

		// El lote debe resolver TODO en memoria: ninguna consulta puntual de
		// MessageTemplate por mensaje (la que el motor hacía antes de #6/M3).
		const tplRepo = AppDataSource.getRepository(MessageTemplate);
		const findOneSpy = jest.spyOn(tplRepo, 'findOne');
		try {
			await svc.processDue();
		} finally {
			findOneSpy.mockRestore();
		}
		expect(findOneSpy).not.toHaveBeenCalled();

		const repo = AppDataSource.getRepository(ScheduledMessage);
		const after0 = await repo.findOne({ where: { id: saved[0].id } });
		const after1 = await repo.findOne({ where: { id: saved[1].id } });
		expect(after0?.status).toBe('queued');
		expect(after0?.resolvedContent).toContain('NUEVA');
		expect(after1?.status).toBe('queued');
		expect(after1?.resolvedContent).toContain('DOS');
	});

	it('listQueued resuelve templateName: id del paso gana; sin id, la primera por tipo', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const { nueva } = await seedOldAndNew(retreat.id);
		const { saved } = await seedSteps(retreat.id, participant.id, [
			{ templateId: nueva.id },
			{},
		]);
		// La bandeja lista filas ya encoladas con su snapshot de despacho.
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.update(saved[0].id, {
			status: 'queued',
			resolvedContent: 'x',
			resolvedContact: '5512345678',
		} as any);
		await repo.update(saved[1].id, {
			status: 'queued',
			resolvedContent: 'y',
			resolvedContact: '5512345678',
		} as any);

		const items = await svc.listQueued(retreat.id);
		const byId = new Map(items.map((it) => [it.id, it]));
		expect(byId.get(saved[0].id)?.templateName).toBe('Nueva welcome');
		expect(byId.get(saved[1].id)?.templateName).toBe('Vieja welcome');
	});

	it('previewStep usa la plantilla del id cuando llega; sin id (o ajeno), la más antigua del tipo', async () => {
		const { retreat, participant } = await seedRetreatWithWalker();
		const { nueva } = await seedOldAndNew(retreat.id);
		const other = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const foreign = await createTemplate(other.id, {
			name: 'Ajena',
			message: 'AJENA {participant.firstName}',
			createdAt: OLD,
		});
		const base = {
			retreatId: retreat.id,
			participantId: participant.id,
			templateType: 'WALKER_WELCOME',
			channel: 'whatsapp' as const,
			recipientTarget: 'participant' as const,
		};

		const withId = await svc.previewStep({ ...base, templateId: nueva.id });
		expect(withId?.content).toContain('NUEVA');
		expect(withId?.content ?? '').not.toContain('VIEJA');

		const withoutId = await svc.previewStep({ ...base, templateId: null });
		expect(withoutId?.content).toContain('VIEJA');

		const withForeignId = await svc.previewStep({ ...base, templateId: foreign.id });
		expect(withForeignId?.content).toContain('VIEJA');
	});
});
