// Mock del EmailService antes de importar el service.
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
import { MessageSequence } from '@/entities/messageSequence.entity';
import { Responsability } from '@/entities/responsability.entity';

describe('MessageSequence — destinatarios invitador/responsabilidad + seed', () => {
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

	async function createTemplate(retreatId: string, type: string, message: string) {
		const repo = AppDataSource.getRepository(MessageTemplate);
		return repo.save(repo.create({ name: type, type: type as any, message, retreatId, scope: 'retreat' }));
	}

	it('destinatario inviter: usa los campos del invitador del propio participante', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		// Caminante con datos del invitador en sus propios campos.
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker', cellPhone: '5512345678',
			invitedBy: 'Pala Quero', inviterEmail: 'pala@example.com', inviterCellPhone: '5599999999',
		} as any);
		await createTemplate(retreat.id, 'GENERAL', 'Nuevo caminante {participant.firstName} (invitó {participant.recipientName})');
		const seq = await svc.createSequence({
			name: 'Aviso invitador', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
			steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp', recipientTarget: 'inviter' } as any],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(repo.create({
			sequenceId: seq.id, stepId: seq.steps![0].id, participantId: walker.id, retreatId: retreat.id,
			channel: 'whatsapp', templateType: 'GENERAL', recipientTarget: 'inviter',
			scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
		}));
		await svc.processDue();
		const sm = await repo.findOne({ where: { participantId: walker.id } });
		expect(sm?.status).toBe('queued');
		expect(sm?.resolvedContact).toBe('5599999999'); // inviterCellPhone del participante
		expect(sm?.recipientName).toBe('Pala Quero'); // = invitedBy
		// contactKey='inviter' → {participant.recipientName} resuelve al invitador.
		expect(sm?.resolvedContent).toContain('invitó Pala Quero');
	});

	it('destinatario inviter: si falta teléfono, lo busca por el email del invitador', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		// Servidor cuyo email coincide con el inviterEmail del caminante.
		await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server', email: 'inv@example.com', cellPhone: '5588888888',
		} as any);
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker', cellPhone: '5512345678',
			invitedBy: 'Inv', inviterEmail: 'inv@example.com', // sin inviterCellPhone
		} as any);
		await createTemplate(retreat.id, 'GENERAL', 'Nuevo {participant.firstName}');
		const seq = await svc.createSequence({
			name: 'Aviso invitador 2', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
			steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp', recipientTarget: 'inviter' } as any],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(repo.create({
			sequenceId: seq.id, stepId: seq.steps![0].id, participantId: walker.id, retreatId: retreat.id,
			channel: 'whatsapp', templateType: 'GENERAL', recipientTarget: 'inviter',
			scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
		}));
		await svc.processDue();
		const sm = await repo.findOne({ where: { participantId: walker.id } });
		expect(sm?.resolvedContact).toBe('5588888888'); // teléfono del servidor hallado por email
	});

	it('destinatario participante: cae a teléfono de casa si no hay celular', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker', cellPhone: '', homePhone: '5511112222',
		} as any);
		await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');
		const seq = await svc.createSequence({
			name: 'Bienvenida', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
			steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp', recipientTarget: 'participant' } as any],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(repo.create({
			sequenceId: seq.id, stepId: seq.steps![0].id, participantId: walker.id, retreatId: retreat.id,
			channel: 'whatsapp', templateType: 'WALKER_WELCOME', recipientTarget: 'participant',
			scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
		}));
		await svc.processDue();
		const sm = await repo.findOne({ where: { participantId: walker.id } });
		expect(sm?.status).toBe('queued');
		expect(sm?.resolvedContact).toBe('5511112222'); // homePhone (fallback celular→casa→trabajo)
	});

	it('briefing de mesa: resuelve {table.*} con el roster de la mesa del líder', async () => {
		const { TableMesa } = await import('@/entities/tableMesa.entity');
		const { RetreatParticipant } = await import('@/entities/retreatParticipant.entity');
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const leader = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server', firstName: 'Oscar', lastName: 'Lara', cellPhone: '5566666666',
		} as any);
		const tableRepo = AppDataSource.getRepository(TableMesa);
		const table = await tableRepo.save(
			tableRepo.create({ name: 'Mesa 5', retreatId: retreat.id, liderId: leader.id } as any),
		);
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker', firstName: 'Ana', lastName: 'Gómez', cellPhone: '5500000001',
		} as any);
		const rpRepo = AppDataSource.getRepository(RetreatParticipant);
		const rpW = await rpRepo.findOne({ where: { participantId: walker.id, retreatId: retreat.id } });
		await rpRepo.update(rpW!.id, { tableId: (table as any).id } as any);
		await createTemplate(
			retreat.id,
			'TABLE_LEADER_BRIEFING',
			'Mesa {table.name} ({table.walkersCount}): {table.walkersRoster}',
		);
		const seq = await svc.createSequence({
			name: 'Briefing', retreatId: retreat.id, trigger: 'days_before_retreat', audience: 'table_leaders',
			steps: [{ stepOrder: 0, offsetDays: 1, sendHour: 9, templateType: 'TABLE_LEADER_BRIEFING', channel: 'whatsapp', recipientTarget: 'participant' } as any],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(repo.create({
			sequenceId: seq.id, stepId: seq.steps![0].id, participantId: leader.id, retreatId: retreat.id,
			channel: 'whatsapp', templateType: 'TABLE_LEADER_BRIEFING', recipientTarget: 'participant',
			scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
		}));
		await svc.processDue();
		const sm = await repo.findOne({ where: { participantId: leader.id } });
		expect(sm?.status).toBe('queued');
		expect(sm?.resolvedContent).toContain('Mesa 5');
		expect(sm?.resolvedContent).toContain('Ana'); // roster del caminante de la mesa
	});

	it('destinatario tableLeader: resuelve al líder de la mesa del participante', async () => {
		const { TableMesa } = await import('@/entities/tableMesa.entity');
		const { RetreatParticipant } = await import('@/entities/retreatParticipant.entity');
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const leader = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server', firstName: 'Lider', lastName: 'Mesa', cellPhone: '5566666666',
		} as any);
		const tableRepo = AppDataSource.getRepository(TableMesa);
		const table = await tableRepo.save(tableRepo.create({ name: 'Mesa 1', retreatId: retreat.id, liderId: leader.id } as any));
		const walker = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', cellPhone: '5512345678' } as any);
		// Asignar el caminante a la mesa.
		const rpRepo = AppDataSource.getRepository(RetreatParticipant);
		const rp = await rpRepo.findOne({ where: { participantId: walker.id, retreatId: retreat.id } });
		await rpRepo.update(rp!.id, { tableId: (table as any).id } as any);
		await createTemplate(retreat.id, 'GENERAL', 'Aviso al líder sobre {participant.firstName}');
		const seq = await svc.createSequence({
			name: 'Aviso líder', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
			steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp', recipientTarget: 'tableLeader' } as any],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(repo.create({
			sequenceId: seq.id, stepId: seq.steps![0].id, participantId: walker.id, retreatId: retreat.id,
			channel: 'whatsapp', templateType: 'GENERAL', recipientTarget: 'tableLeader',
			scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
		}));
		await svc.processDue();
		const sm = await repo.findOne({ where: { participantId: walker.id } });
		expect(sm?.status).toBe('queued');
		expect(sm?.resolvedContact).toBe('5566666666'); // teléfono del líder de la mesa
	});

	it('destinatario responsibility: resuelve al titular de la responsabilidad', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		const holder = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'server', firstName: 'Coord', lastName: 'Palancas',
			email: 'coord@example.com', cellPhone: '5577777777',
		} as any);
		const respRepo = AppDataSource.getRepository(Responsability);
		await respRepo.save(respRepo.create({
			name: 'Coordinador de Palancas', retreatId: retreat.id, participantId: holder.id,
		} as any));
		const walker = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker', cellPhone: '5512345678',
		} as any);
		await createTemplate(retreat.id, 'GENERAL', 'Se registró {participant.firstName}');
		const seq = await svc.createSequence({
			name: 'Aviso coord', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
			steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp', recipientTarget: 'responsibility', recipientResponsibility: 'Coordinador de Palancas' } as any],
		});
		const repo = AppDataSource.getRepository(ScheduledMessage);
		await repo.save(repo.create({
			sequenceId: seq.id, stepId: seq.steps![0].id, participantId: walker.id, retreatId: retreat.id,
			channel: 'whatsapp', templateType: 'GENERAL', recipientTarget: 'responsibility',
			scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
		}));
		await svc.processDue();
		const sm = await repo.findOne({ where: { participantId: walker.id } });
		expect(sm?.status).toBe('queued');
		expect(sm?.resolvedContact).toBe('5577777777'); // teléfono del titular
		expect(sm?.recipientName).toContain('Coord');
	});

	it('createDefaultMessageSequencesForRetreat: siembra las secuencias de registro', async () => {
		const retreat = await TestDataFactory.createTestRetreat({});
		await svc.createDefaultMessageSequencesForRetreat({ id: retreat.id, notifyPalanqueros: [1, 2] });
		const seqs = await AppDataSource.getRepository(MessageSequence).find({
			where: { retreatId: retreat.id },
			relations: ['steps'],
		});
		// 5: bienvenida caminante/servidor, privacidad, invitador, palanquero.
		expect(seqs).toHaveLength(5);
		expect(seqs.every((s) => s.trigger === 'participant_created')).toBe(true);
		// Invitador: paso con destinatario inviter.
		const inviter = seqs.find((s) => s.name === 'Aviso al invitador (nuevo caminante)');
		expect(inviter?.steps?.[0]?.recipientTarget).toBe('inviter');
		// Palanquero: destinatario responsibility, 3 pasos (Palanquero 1/2/3), activa.
		const pal = seqs.find((s) => s.name === 'Aviso al palanquero (nuevo caminante)');
		expect(pal?.isActive).toBe(true);
		expect(pal?.steps).toHaveLength(3);
		expect(pal?.steps?.every((st) => st.recipientTarget === 'responsibility')).toBe(true);
		expect(pal?.steps?.map((st) => st.recipientResponsibility).sort()).toEqual([
			'Palanquero 1', 'Palanquero 2', 'Palanquero 3',
		]);
		expect(pal?.steps?.every((st) => st.templateType === 'PALANQUERO_NEW_WALKER')).toBe(true);
		// Idempotente: re-ejecutar no duplica.
		await svc.createDefaultMessageSequencesForRetreat({ id: retreat.id, notifyPalanqueros: [1, 2] });
		const again = await AppDataSource.getRepository(MessageSequence).count({ where: { retreatId: retreat.id } });
		expect(again).toBe(5);
	});

	it('createDefaultMessageSequencesForRetreat: sin notifyPalanqueros ⇒ palanquero inactivo', async () => {
		const retreat = await TestDataFactory.createTestRetreat({});
		await svc.createDefaultMessageSequencesForRetreat({ id: retreat.id });
		const pal = await AppDataSource.getRepository(MessageSequence).findOne({
			where: { retreatId: retreat.id, name: 'Aviso al palanquero (nuevo caminante)' },
		});
		expect(pal?.isActive).toBe(false);
	});

	it('createDefaultMessageSequencesForRetreat: notifyParticipant=false ⇒ bienvenida inactiva', async () => {
		const retreat = await TestDataFactory.createTestRetreat({});
		await svc.createDefaultMessageSequencesForRetreat({ id: retreat.id, notifyParticipant: false });
		const welcome = await AppDataSource.getRepository(MessageSequence).findOne({
			where: { retreatId: retreat.id, name: 'Bienvenida al caminante' },
		});
		expect(welcome?.isActive).toBe(false);
	});

	it('runForRetreat: enrola y procesa los pasos offset-0 al momento', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
		// registrationDate hace 2 días → el paso offset-0 (ese día a las 9:00) queda en
		// el pasado SIEMPRE, sin depender de la hora a la que corra el test.
		await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
			email: 'w@example.com',
			registrationDate: new Date(Date.now() - 2 * 24 * 3600_000),
		} as any);
		await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');
		await svc.createSequence({
			name: 'Bienvenida', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
			isActive: true,
			steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
		});
		const res = await svc.runForRetreat(retreat.id);
		expect(res.enrolled).toBeGreaterThanOrEqual(1);
		const sm = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { retreatId: retreat.id },
		});
		expect(sm?.status).toBe('sent');
	});
});
