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
import { ParticipantCommunication } from '@/entities/participantCommunication.entity';
import { TableMesa } from '@/entities/tableMesa.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { ParticipantFollowUp } from '@/entities/participantFollowUp.entity';
import { Participant } from '@/entities/participant.entity';
import { Retreat } from '@/entities/retreat.entity';

describe('MessageSequenceService', () => {
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

	describe('computeScheduledFor (TZ-aware)', () => {
		it('days_before_retreat: 7 días antes a las 9:00 CDMX → 15:00 UTC', () => {
			const retreat = {
				startDate: new Date('2026-06-10T00:00:00.000Z'),
				endDate: new Date('2026-06-13T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			} as Retreat;
			const when = svc.computeScheduledFor(
				'days_before_retreat',
				{ offsetDays: 7, sendHour: 9 },
				{} as any,
				retreat,
			);
			expect(when?.toISOString()).toBe('2026-06-03T15:00:00.000Z');
		});

		it('days_after_retreat: 30 días después a las 9:00 CDMX', () => {
			const retreat = {
				startDate: new Date('2026-06-10T00:00:00.000Z'),
				endDate: new Date('2026-06-13T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			} as Retreat;
			const when = svc.computeScheduledFor(
				'days_after_retreat',
				{ offsetDays: 30, sendHour: 9 },
				{} as any,
				retreat,
			);
			// 2026-06-13 + 30 = 2026-07-13 09:00 CDMX = 15:00 UTC
			expect(when?.toISOString()).toBe('2026-07-13T15:00:00.000Z');
		});
	});

	describe('enrollSequence', () => {
		it('enrola solo la audiencia indicada y es idempotente', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-09-10T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'w1@example.com',
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'w2@example.com',
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
				email: 's1@example.com',
			} as any);

			const seq = await svc.createSequence({
				name: 'Bienvenida caminantes',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 3, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});

			const created = await svc.enrollSequence(seq);
			expect(created).toBe(2); // solo los 2 walkers

			// Idempotencia: segunda corrida no crea nada nuevo.
			const again = await svc.enrollSequence(seq);
			expect(again).toBe(0);

			const total = await AppDataSource.getRepository(ScheduledMessage).count({
				where: { sequenceId: seq.id },
			});
			expect(total).toBe(2);
		});
	});

	describe('processDue', () => {
		it('email: envía, marca sent y registra la comunicación', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'walker@example.com',
				firstName: 'Juan',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');

			const seq = await svc.createSequence({
				name: 'S',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			const step = seq.steps![0];

			// Insertar un mensaje vencido (scheduledFor en el pasado).
			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'email',
					templateType: 'WALKER_WELCOME',
					scheduledFor: new Date(Date.now() - 3600_000),
					status: 'pending',
				}),
			);

			const processed = await svc.processDue();
			expect(processed).toBe(1);

			const sm = await smRepo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('sent');
			expect(sm?.sentAt).toBeTruthy();

			const comms = await AppDataSource.getRepository(ParticipantCommunication).find({
				where: { participantId: participant.id },
			});
			expect(comms).toHaveLength(1);
			expect(comms[0].messageType).toBe('email');
		});

		// Decisión de diseño: catch-up. Un paso cuya fecha quedó muy en el pasado
		// (p. ej. registro tardío en una secuencia "días antes del retiro") se
		// envía igual, no se omite. Sin ventana de gracia.
		it('catch-up: un mensaje muy vencido (10 días) se envía igual', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'tardio@example.com',
				firstName: 'Tardío',
			} as any);
			await createTemplate(retreat.id, 'PRE_RETREAT_REMINDER', 'Hola {participant.firstName}');

			const seq = await svc.createSequence({
				name: 'Recordatorio 10 días antes',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 10, sendHour: 9, templateType: 'PRE_RETREAT_REMINDER', channel: 'email' } as any],
			});
			const step = seq.steps![0];

			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'email',
					templateType: 'PRE_RETREAT_REMINDER',
					recipientTarget: 'participant',
					scheduledFor: new Date(Date.now() - 10 * 24 * 3600_000), // venció hace 10 días
					status: 'pending',
				}),
			);

			const processed = await svc.processDue();
			expect(processed).toBe(1);
			const sm = await smRepo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('sent'); // se envía, no 'skipped'
		});

		it('whatsapp: encola (queued) sin enviar ni registrar', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'walker2@example.com',
				firstName: 'Ana',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');

			const seq = await svc.createSequence({
				name: 'S-wa',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const step = seq.steps![0];

			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'whatsapp',
					templateType: 'WALKER_WELCOME',
					scheduledFor: new Date(Date.now() - 3600_000),
					status: 'pending',
				}),
			);

			await svc.processDue();

			const sm = await smRepo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('queued');

			const comms = await AppDataSource.getRepository(ParticipantCommunication).count({
				where: { participantId: participant.id },
			});
			expect(comms).toBe(0); // se registra cuando el coordinador lo despacha

			// Aparece en la bandeja de pendientes del retiro.
			const queue = await svc.listQueued(retreat.id);
			expect(queue).toHaveLength(1);
		});
	});

	describe('audiencia table_leaders', () => {
		it('enrola solo a los líderes/colíderes de mesa del retiro', async () => {
			const retreat = await TestDataFactory.createTestRetreat();
			const lider = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
				email: 'lider@example.com',
			} as any);
			// Un servidor que NO es líder de ninguna mesa → no debe enrolarse.
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'server',
				email: 'otro@example.com',
			} as any);

			const tableRepo = AppDataSource.getRepository(TableMesa);
			await tableRepo.save(
				tableRepo.create({ name: 'Mesa 1', retreatId: retreat.id, liderId: lider.id }),
			);

			const seq = await svc.createSequence({
				name: 'Coordinación líderes',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'table_leaders',
				steps: [{ stepOrder: 0, offsetDays: 3, sendHour: 9, templateType: 'GENERAL', channel: 'email' } as any],
			});
			// startDate por defecto es "ahora"; basta con que enrole 1 (el líder).
			const created = await svc.enrollSequence(seq);
			expect(created).toBe(1);

			const scheduled = await AppDataSource.getRepository(ScheduledMessage).find({
				where: { sequenceId: seq.id },
			});
			expect(scheduled).toHaveLength(1);
			expect(scheduled[0].participantId).toBe(lider.id);
		});
	});

	describe('recipientTarget = contacto de emergencia', () => {
		it('email: envía al contacto de emergencia 1 y resuelve su nombre', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				firstName: 'Juan',
				email: 'juan@example.com',
				emergencyContact1Name: 'María Pérez',
				emergencyContact1Email: 'maria@example.com',
				emergencyContact1CellPhone: '5511112222',
			} as any);
			await createTemplate(retreat.id, 'PALANCA_REQUEST', 'Hola {participant.recipientName}');

			const seq = await svc.createSequence({
				name: 'Aviso familia',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [
					{
						stepOrder: 0,
						offsetDays: 0,
						sendHour: 9,
						templateType: 'PALANCA_REQUEST',
						channel: 'email',
						recipientTarget: 'emergencyContact1',
					} as any,
				],
			});
			const step = seq.steps![0];
			expect(step.recipientTarget).toBe('emergencyContact1');

			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'email',
					templateType: 'PALANCA_REQUEST',
					recipientTarget: 'emergencyContact1',
					scheduledFor: new Date(Date.now() - 3600_000),
					status: 'pending',
				}),
			);

			const processed = await svc.processDue();
			expect(processed).toBe(1);

			// La comunicación se registró hacia el contacto de emergencia.
			const comms = await AppDataSource.getRepository(ParticipantCommunication).find({
				where: { participantId: participant.id },
			});
			expect(comms).toHaveLength(1);
			expect(comms[0].recipientContact).toBe('maria@example.com');
			expect(comms[0].recipientContactKey).toBe('emergencyContact1:email');
			expect(comms[0].recipientName).toBe('María Pérez');
			// El cuerpo resolvió {participant.recipientName} al nombre del contacto.
			expect(comms[0].messageContent).toContain('María Pérez');
		});

		it('whatsapp: encola usando el teléfono del contacto de emergencia', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				emergencyContact1Name: 'Ana',
				emergencyContact1CellPhone: '5544332211',
			} as any);
			await createTemplate(retreat.id, 'PALANCA_REQUEST', 'Hola {participant.recipientName}');

			const seq = await svc.createSequence({
				name: 'Aviso familia WA',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [
					{
						stepOrder: 0,
						offsetDays: 0,
						sendHour: 9,
						templateType: 'PALANCA_REQUEST',
						channel: 'whatsapp',
						recipientTarget: 'emergencyContact1',
					} as any,
				],
			});
			const step = seq.steps![0];

			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'whatsapp',
					templateType: 'PALANCA_REQUEST',
					recipientTarget: 'emergencyContact1',
					scheduledFor: new Date(Date.now() - 3600_000),
					status: 'pending',
				}),
			);

			await svc.processDue();
			const sm = await smRepo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('queued');
			// La bandeja trae el contacto de emergencia y el target para despacharlo.
			const queue = await svc.listQueued(retreat.id);
			expect(queue).toHaveLength(1);
			expect(queue[0].recipientTarget).toBe('emergencyContact1');
		});
	});

	describe('robustez', () => {
		async function dueEmail(retreatId: string, seqId: string, stepId: string, participantId: string) {
			const repo = AppDataSource.getRepository(ScheduledMessage);
			return repo.save(
				repo.create({
					sequenceId: seqId,
					stepId,
					participantId,
					retreatId,
					channel: 'email',
					templateType: 'WALKER_WELCOME',
					recipientTarget: 'participant',
					scheduledFor: new Date(Date.now() - 3600_000),
					status: 'pending',
				}),
			);
		}

		it('R1: no envía a un participante cancelado (lo marca cancelled)', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'cancelado@example.com',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			await dueEmail(retreat.id, seq.id, seq.steps![0].id, participant.id);

			// Cancelar al participante en el retiro.
			const rpRepo = AppDataSource.getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId: participant.id, retreatId: retreat.id } });
			rp!.isCancelled = true;
			await rpRepo.save(rp!);

			await svc.processDue();
			const sm = await AppDataSource.getRepository(ScheduledMessage).findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('cancelled');
			const comms = await AppDataSource.getRepository(ParticipantCommunication).count({ where: { participantId: participant.id } });
			expect(comms).toBe(0);
		});

		it('R3: una secuencia desactivada no procesa sus pendientes', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', email: 'p@example.com' } as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola');
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker', isActive: false,
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			await dueEmail(retreat.id, seq.id, seq.steps![0].id, participant.id);
			const processed = await svc.processDue();
			expect(processed).toBe(0);
			const sm = await AppDataSource.getRepository(ScheduledMessage).findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('pending'); // queda pendiente, no se envía
		});

		it('R4: reintenta un fallo SMTP y luego envía', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', email: 'p4@example.com' } as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola');
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			await dueEmail(retreat.id, seq.id, seq.steps![0].id, participant.id);

			const repo = AppDataSource.getRepository(ScheduledMessage);
			// 1ª corrida: el envío falla.
			(svc as any).emailService.sendEmail.mockResolvedValueOnce(false);
			await svc.processDue();
			let sm = await repo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('failed');
			expect(sm?.attempts).toBe(1);

			// 2ª corrida: el mock vuelve a true (default) → se reintenta y envía.
			await svc.processDue();
			sm = await repo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('sent');
		});

		it('R2: editar una secuencia conservando el id del paso no re-enrola', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', email: 'w@example.com' } as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola');
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'days_before_retreat', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 3, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			expect(await svc.enrollSequence(seq)).toBe(1);
			const stepId = seq.steps![0].id;

			// Editar conservando el id del paso (cambia la hora).
			await svc.updateSequence(seq.id, {
				steps: [{ id: stepId, stepOrder: 0, offsetDays: 3, sendHour: 10, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			// El paso mantiene su id → no se duplica el scheduled al re-enrolar.
			const reloaded = (await svc.findById(seq.id))!;
			expect(reloaded.steps![0].id).toBe(stepId);
			expect(await svc.enrollSequence(reloaded)).toBe(0);
			const count = await AppDataSource.getRepository(ScheduledMessage).count({ where: { sequenceId: seq.id } });
			expect(count).toBe(1);
		});

		it('O1: getStatsByRetreat agrupa por secuencia y estado; getIssues trae fallidos/omitidos', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const p1 = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', email: 'a@example.com' } as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			const sm = await dueEmail(retreat.id, seq.id, seq.steps![0].id, p1.id);
			sm.status = 'skipped';
			sm.error = 'sin plantilla';
			await AppDataSource.getRepository(ScheduledMessage).save(sm);

			const stats = await svc.getStatsByRetreat(retreat.id);
			expect(stats[seq.id]?.skipped).toBe(1);
			const issues = await svc.getIssuesByRetreat(retreat.id);
			expect(issues).toHaveLength(1);
			expect(issues[0].error).toBe('sin plantilla');
		});

		it('bandeja: incluye el estado de seguimiento del participante y omitir lo saca', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', cellPhone: '5512345678',
			} as any);
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const sm = await repo.save(repo.create({
				sequenceId: seq.id, stepId: seq.steps![0].id, participantId: participant.id, retreatId: retreat.id,
				channel: 'whatsapp', templateType: 'WALKER_WELCOME', recipientTarget: 'participant',
				scheduledFor: new Date(), status: 'queued',
			}));
			// Registrar un estado de seguimiento para el participante.
			const fuRepo = AppDataSource.getRepository(ParticipantFollowUp);
			await fuRepo.save(fuRepo.create({ retreatId: retreat.id, participantId: participant.id, status: 'contacted' }));

			let queue = await svc.listQueued(retreat.id);
			expect(queue).toHaveLength(1);
			expect((queue[0] as any).followUpStatus).toBe('contacted');

			// Omitir lo saca de la bandeja.
			const skipped = await svc.markSkipped(sm.id);
			expect(skipped?.status).toBe('skipped');
			queue = await svc.listQueued(retreat.id);
			expect(queue).toHaveLength(0);
		});

		it('detalle: trae notas, palancas, seguimiento y comunicaciones del participante', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', firstName: 'Det', cellPhone: '5512345678',
			} as any);
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const sm = await repo.save(repo.create({
				sequenceId: seq.id, stepId: seq.steps![0].id, participantId: participant.id, retreatId: retreat.id,
				channel: 'whatsapp', templateType: 'WALKER_WELCOME', recipientTarget: 'participant',
				scheduledFor: new Date(), status: 'queued', resolvedContent: 'Hola Det', recipientName: 'Det',
			}));
			// Palancas + notas en retreat_participants (fuente per-retiro).
			const rpRepo = AppDataSource.getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId: participant.id, retreatId: retreat.id } });
			await rpRepo.update(rp!.id, {
				notes: 'Nota del retiro', palancasRequested: true, palancasReceived: '3 cartas',
			} as any);
			// Seguimiento.
			const fuRepo = AppDataSource.getRepository(ParticipantFollowUp);
			await fuRepo.save(fuRepo.create({
				retreatId: retreat.id, participantId: participant.id, status: 'confirmed', note: 'Confirmó',
			}));
			// Una comunicación previa.
			const commRepo = AppDataSource.getRepository(ParticipantCommunication);
			await commRepo.save(commRepo.create({
				participantId: participant.id, scope: 'retreat', retreatId: retreat.id,
				messageType: 'whatsapp', recipientContact: '5512345678', messageContent: 'previo',
				templateName: 'Bienvenida',
			} as any));

			const detail = await svc.getQueueItemDetail(sm.id);
			expect(detail).not.toBeNull();
			expect(detail!.participant.notes).toBe('Nota del retiro');
			expect(detail!.palancas.requested).toBe(true);
			expect(detail!.palancas.received).toBe('3 cartas');
			expect(detail!.followUp?.status).toBe('confirmed');
			expect(detail!.followUp?.note).toBe('Confirmó');
			expect(detail!.communications).toHaveLength(1);
			expect(detail!.communications[0].templateName).toBe('Bienvenida');
			expect(detail!.message.resolvedContent).toBe('Hola Det');
		});

		it('detalle: devuelve null si el pendiente no existe', async () => {
			expect(await svc.getQueueItemDetail('00000000-0000-0000-0000-000000000000')).toBeNull();
		});

		it('F1: al encolar WhatsApp guarda el snapshot resuelto (contenido + contacto)', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', firstName: 'Snap', cellPhone: '5512345678',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			await repo.save(repo.create({
				sequenceId: seq.id, stepId: seq.steps![0].id, participantId: participant.id, retreatId: retreat.id,
				channel: 'whatsapp', templateType: 'WALKER_WELCOME', recipientTarget: 'participant',
				scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
			}));
			await svc.processDue();
			const sm = await repo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('queued');
			expect(sm?.resolvedContent).toContain('Snap');
			expect(sm?.resolvedContact).toBe('5512345678');
			expect(sm?.recipientName).toContain('Snap');
		});
	});

	describe('mejoras de targeting/ownership', () => {
		async function seedDue(opts: {
			seq?: Partial<Parameters<MessageSequenceService['createSequence']>[0]>;
			stepCondition?: any;
			channel?: 'email' | 'whatsapp';
			scheduledFor?: Date;
			participantOverrides?: any;
		}) {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', email: 'd@example.com', cellPhone: '5512345678',
				...(opts.participantOverrides || {}),
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{
					stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME',
					channel: opts.channel || 'email', condition: opts.stepCondition,
				} as any],
				...(opts.seq || {}),
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const sm = await repo.save(repo.create({
				sequenceId: seq.id, stepId: seq.steps![0].id, participantId: participant.id, retreatId: retreat.id,
				channel: opts.channel || 'email', templateType: 'WALKER_WELCOME', recipientTarget: 'participant',
				scheduledFor: opts.scheduledFor || new Date(Date.now() - 3600_000), status: 'pending',
			}));
			return { retreat, participant, seq, sm, repo };
		}

		it('opt-out: no envía a un participante en lista de no-contacto', async () => {
			const { participant, sm, repo } = await seedDue({});
			await AppDataSource.getRepository(Participant).update(participant.id, { doNotContact: true } as any);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toContain('no-contacto');
		});

		it('opt-out: enrollSequence excluye a los no-contacto', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const p = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);
			await AppDataSource.getRepository(Participant).update(p.id, { doNotContact: true } as any);
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			const created = await svc.enrollSequence((await svc.findById(seq.id))!);
			expect(created).toBe(0);
		});

		it('ventana de gracia: salta un paso vencido hace más de maxOverdueDays', async () => {
			const { sm, repo } = await seedDue({
				seq: { maxOverdueDays: 5 },
				scheduledFor: new Date(Date.now() - 10 * 86400000), // 10 días vencido
			});
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toContain('vencido');
		});

		it('stop-on-status: no envía si el participante declinó', async () => {
			const { retreat, participant, sm, repo } = await seedDue({});
			const fu = AppDataSource.getRepository(ParticipantFollowUp);
			await fu.save(fu.create({ retreatId: retreat.id, participantId: participant.id, status: 'declined' }));
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toContain('declinó');
		});

		it('parar al confirmar (condición asistencia=pendiente): salta a quien ya confirmó', async () => {
			// El "parar si ya confirmó" se modela como condición de paso sobre la
			// confirmación de asistencia real (attendanceConfirmation), no como flag.
			const { retreat, participant, sm, repo } = await seedDue({
				stepCondition: { attendanceFilter: 'pending' },
			});
			const rpRepo = AppDataSource.getRepository(RetreatParticipant);
			const rp = await rpRepo.findOne({ where: { participantId: participant.id, retreatId: retreat.id } });
			await rpRepo.update(rp!.id, { attendanceConfirmation: 'confirmed' } as any);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toContain('condición');
		});

		it('condición del paso: salta a quien no la cumple', async () => {
			// El participante es walker; la condición exige servidores → no cumple.
			const { sm, repo } = await seedDue({ stepCondition: { participantType: 'server' } });
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toContain('condición');
		});

		it('condición del paso: envía a quien sí la cumple', async () => {
			const { sm, repo } = await seedDue({ stepCondition: { participantType: 'walker' } });
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('sent');
		});

		it('markDispatched registra quién lo despachó (dispatchedBy)', async () => {
			const { sm } = await seedDue({ channel: 'whatsapp' });
			const updated = await svc.markDispatched(sm.id, 'user-123');
			expect(updated?.status).toBe('sent');
			expect(updated?.dispatchedBy).toBe('user-123');
			expect(updated?.sentAt).toBeTruthy();
		});

		it('markOpened registra la apertura sin cambiar el status', async () => {
			const { sm } = await seedDue({ channel: 'whatsapp' });
			// pasa a queued primero
			await AppDataSource.getRepository(ScheduledMessage).update(sm.id, { status: 'queued' } as any);
			const updated = await svc.markOpened(sm.id);
			expect(updated?.openedAt).toBeTruthy();
			expect(updated?.status).toBe('queued');
		});

		it('retryScheduled re-encola un fallido agotado (pending, attempts=0, sin error)', async () => {
			const { sm, repo } = await seedDue({ channel: 'whatsapp' });
			// Simula un fallido con reintentos agotados (el cron ya no lo tocaría).
			await repo.update(sm.id, { status: 'failed', attempts: 3, error: 'destinatario sin teléfono' } as any);

			const updated = await svc.retryScheduled(sm.id, 'user-1');
			expect(updated?.status).toBe('pending');
			expect(updated?.attempts).toBe(0);
			expect(updated?.error).toBeNull();
			expect(updated?.dispatchedBy).toBe('user-1');

			// Vuelve a ser elegible para processDue (status pending).
			const reloaded = await repo.findOne({ where: { id: sm.id } });
			expect(reloaded?.status).toBe('pending');
		});

		it('discardScheduled lo saca de los problemas (cancelled) sin reaparecer', async () => {
			const { retreat, sm, repo } = await seedDue({ channel: 'whatsapp' });
			await repo.update(sm.id, { status: 'failed', attempts: 3, error: 'SMTP' } as any);

			const updated = await svc.discardScheduled(sm.id, 'user-2');
			expect(updated?.status).toBe('cancelled');
			expect(updated?.dispatchedBy).toBe('user-2');

			// getIssuesByRetreat solo trae failed/skipped → ya no aparece.
			const issues = await svc.getIssuesByRetreat(retreat.id);
			expect(issues.some((i) => i.id === sm.id)).toBe(false);
		});

		it('retry/discard sobre id inexistente devuelven null', async () => {
			expect(await svc.retryScheduled('no-existe')).toBeNull();
			expect(await svc.discardScheduled('no-existe')).toBeNull();
		});

		it('bulkResolveIssues: descarta en masa los failed/skipped del retiro', async () => {
			const { retreat, sm, repo } = await seedDue({ channel: 'whatsapp' });
			await repo.update(sm.id, { status: 'failed', attempts: 3 } as any);
			// otro mensaje skipped del mismo retiro (otro participante → no rompe UNIQUE).
			const p2 = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', firstName: 'Otro', cellPhone: '5599999999',
			} as any);
			const sm2 = await repo.save(repo.create({
				sequenceId: sm.sequenceId, stepId: sm.stepId, participantId: p2.id,
				retreatId: retreat.id, channel: 'whatsapp', templateType: 'WALKER_WELCOME',
				recipientTarget: 'participant', scheduledFor: new Date(), status: 'skipped',
			}));

			const n = await svc.bulkResolveIssues(retreat.id, 'discard');
			expect(n).toBe(2);
			const issues = await svc.getIssuesByRetreat(retreat.id);
			expect(issues).toHaveLength(0); // ya no quedan failed/skipped
			expect((await repo.findOne({ where: { id: sm2.id } }))?.status).toBe('cancelled');
		});

		it('destinatario indirecto inexistente (invitador) → cancelado en silencio', async () => {
			const { retreat, sm, repo } = await seedDue({ channel: 'whatsapp' });
			// El participante de seedDue no tiene invitador cargado.
			await repo.update(sm.id, { recipientTarget: 'inviter' } as any);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('cancelled'); // no 'skipped'
			expect(after?.error).toContain('invitador');
			// No aparece en "Problemas" (solo failed/skipped).
			const issues = await svc.getIssuesByRetreat(retreat.id);
			expect(issues.some((i) => i.id === sm.id)).toBe(false);
		});

		it('destinatario con nombre pero sin teléfono → sigue en Problemas (skipped)', async () => {
			const { sm, repo } = await seedDue({
				channel: 'whatsapp',
				participantOverrides: { invitedBy: 'Pedro', inviterEmail: '', cellPhone: '' },
			});
			await repo.update(sm.id, { recipientTarget: 'inviter' } as any);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toBe('destinatario sin teléfono');
		});

		it('bulkResolveIssues: retry re-encola y devuelve 0 si no hay problemas', async () => {
			const { retreat, sm, repo } = await seedDue({ channel: 'whatsapp' });
			await repo.update(sm.id, { status: 'failed', attempts: 3, error: 'x' } as any);
			expect(await svc.bulkResolveIssues(retreat.id, 'retry')).toBe(1);
			expect((await repo.findOne({ where: { id: sm.id } }))?.status).toBe('pending');
			// ya no hay problemas → 0
			expect(await svc.bulkResolveIssues(retreat.id, 'discard')).toBe(0);
		});

		it('regenerateQueuedForRetreat renueva el snapshot con la plantilla vigente', async () => {
			const { retreat, sm, repo } = await seedDue({ channel: 'whatsapp' });
			// Encolar con el texto "viejo".
			await svc.processDue();
			let queued = await repo.findOne({ where: { id: sm.id } });
			expect(queued?.status).toBe('queued');
			expect(queued?.resolvedContent).toContain('Hola');

			// Editar la plantilla del retiro.
			await AppDataSource.getRepository(MessageTemplate).update(
				{ retreatId: retreat.id, type: 'WALKER_WELCOME' as any },
				{ message: 'NUEVO contenido para {participant.firstName}' } as any,
			);

			const n = await svc.regenerateQueuedForRetreat(retreat.id);
			expect(n).toBe(1);
			queued = await repo.findOne({ where: { id: sm.id } });
			expect(queued?.status).toBe('queued'); // no cambia su programación
			expect(queued?.resolvedContent).toContain('NUEVO contenido');
		});
	});
});
