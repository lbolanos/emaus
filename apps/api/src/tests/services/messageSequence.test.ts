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
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { Payment } from '@/entities/payment.entity';
import { SequenceStep } from '@/entities/sequenceStep.entity';
import { formatCurrency } from '@repo/utils';

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

	describe('isRetreatClosed (TZ-aware)', () => {
		// endDate '2026-06-05' en CDMX (UTC-6) → cierre = medianoche CDMX del 06-jun
		// = 2026-06-06T06:00:00Z. El retiro vive todo el día 5 en hora local.
		const retreat = { endDate: new Date('2026-06-05T00:00:00.000Z'), timezone: 'America/Mexico_City' } as any;

		it('aún ABIERTO a las 23:00 CDMX del último día (05:00Z del día siguiente)', () => {
			// Punto que la versión cruda (epoch + 86.4M ms) cerraba 6 h antes.
			const now = new Date('2026-06-06T05:00:00.000Z'); // 23:00 CDMX del 05-jun
			expect(svc.isRetreatClosed(retreat, 'participant_created', now)).toBe(false);
		});

		it('CERRADO pasada la medianoche CDMX (07:00Z = 01:00 CDMX del 06-jun)', () => {
			const now = new Date('2026-06-06T07:00:00.000Z');
			expect(svc.isRetreatClosed(retreat, 'participant_created', now)).toBe(true);
		});

		it('days_after_retreat sigue abierto dentro de la ventana de gracia', () => {
			const now = new Date('2026-06-20T12:00:00.000Z'); // 15 días después del fin
			expect(svc.isRetreatClosed(retreat, 'days_after_retreat', now)).toBe(false);
			expect(svc.isRetreatClosed(retreat, 'participant_created', now)).toBe(true);
		});

		it('sin endDate no se puede afirmar cerrado', () => {
			expect(svc.isRetreatClosed({ timezone: 'America/Mexico_City' } as any, 'participant_created', new Date())).toBe(false);
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

		it('anti-backfill: no enrola un retiro ya terminado (trigger previo/al alta)', async () => {
			// Retiro que terminó hace meses (caso del incidente: bienvenida retroactiva).
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() - 200 * 86400000),
				endDate: new Date(Date.now() - 197 * 86400000),
				timezone: 'America/Mexico_City',
			});
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'viejo@example.com',
			} as any);

			const seq = await svc.createSequence({
				name: 'Bienvenida (retiro viejo)',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});

			const created = await svc.enrollSequence(seq);
			expect(created).toBe(0); // no se materializa nada para un retiro cerrado

			const total = await AppDataSource.getRepository(ScheduledMessage).count({
				where: { sequenceId: seq.id },
			});
			expect(total).toBe(0);
		});

		it('catch-up legítimo: SÍ enrola un retiro aún futuro aunque el paso ya venció', async () => {
			// Registro tardío: retiro en 3 días (futuro), paso "10 días antes" ya pasó.
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() + 3 * 86400000),
				endDate: new Date(Date.now() + 5 * 86400000),
				timezone: 'America/Mexico_City',
			});
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'tardio2@example.com',
			} as any);

			const seq = await svc.createSequence({
				name: 'Recordatorio 10 días antes',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 10, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});

			const created = await svc.enrollSequence(seq);
			expect(created).toBe(1); // el retiro no ha cerrado → se enrola normal
		});
	});

	describe('#1: birthday dispara una vez por año (occurrenceYear)', () => {
		it('el envío del cumpleaños pasado no bloquea el del año siguiente', async () => {
			// Sin endDate → isRetreatClosed false: la secuencia de cumpleaños
			// sigue viva pase lo que pase con las fechas del retiro.
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-12-01T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'cumple-anual@example.com',
				// 20 de mayo: el cumpleaños de este año ya pasó → el motor agenda
				// la próxima ocurrencia (año siguiente) desde hoy.
				birthDate: new Date('1990-05-20T00:00:00.000Z'),
			} as any);

			const seq = await svc.createSequence({
				name: 'Felicitación de cumpleaños',
				retreatId: retreat.id,
				trigger: 'birthday',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'email' } as any],
			});
			const step = seq.steps![0];

			// El envío del cumpleaños de ESTE año (2026) ya existe y salió: con la
			// UQ vieja (stepId, participantId) el motor jamás volvería a enrolar
			// este paso — era el bug #1.
			const smRepo = AppDataSource.getRepository(ScheduledMessage);
			const past = await smRepo.save(
				smRepo.create({
					sequenceId: seq.id,
					stepId: step.id,
					participantId: participant.id,
					retreatId: retreat.id,
					channel: 'email',
					templateType: 'GENERAL',
					recipientTarget: 'participant',
					scheduledFor: new Date('2026-05-20T15:00:00.000Z'),
					occurrenceYear: 2026,
					status: 'sent',
					sentAt: new Date('2026-05-20T15:05:00.000Z'),
				}),
			);

			const created = await svc.enrollSequence(seq);
			expect(created).toBe(1); // el año siguiente SÍ se agenda

			const rows = await smRepo.find({ where: { sequenceId: seq.id } });
			expect(rows).toHaveLength(2);
			expect(rows.map((r) => r.occurrenceYear).sort()).toEqual([2026, 2027]);

			const next = rows.find((r) => r.id !== past.id)!;
			expect(next.status).toBe('pending');
			expect(next.occurrenceYear).toBe(2027);
			// 20 may 2027 09:00 CDMX (UTC-6) = 15:00 UTC.
			expect(new Date(next.scheduledFor).toISOString()).toBe('2027-05-20T15:00:00.000Z');

			// La fila histórica no se toca, y el re-enrol es idempotente dentro
			// del mismo año.
			const pastAfter = await smRepo.findOne({ where: { id: past.id } });
			expect(pastAfter!.status).toBe('sent');
			expect(pastAfter!.occurrenceYear).toBe(2026);
			expect(await svc.enrollSequence(seq)).toBe(0);
		});

		it('los triggers no-birthday siguen siendo una sola vez en la vida (occurrenceYear 0)', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-12-01T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'vida-unica@example.com',
			} as any);

			const seq = await svc.createSequence({
				name: 'Bienvenida única',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});

			expect(await svc.enrollSequence(seq)).toBe(1);
			const rows = await AppDataSource.getRepository(ScheduledMessage).find({
				where: { sequenceId: seq.id },
			});
			expect(rows).toHaveLength(1);
			// La parte de año de la clave queda neutralizada para los no-birthday.
			expect(rows[0].occurrenceYear).toBe(0);
			expect(await svc.enrollSequence(seq)).toBe(0);
		});
	});

	describe('#7: syncSteps con diff real', () => {
		afterEach(() => {
			// clearAllMocks (el beforeEach global) NO restaura spies.
			jest.restoreAllMocks();
		});

		it('un save con pasos idénticos no escribe ningún UPDATE; el cambio puntual escribe uno', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-12-01T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			const seq = await svc.createSequence({
				name: 'Diff de pasos',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 5, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			const step = seq.steps![0];

			const stepRepo = AppDataSource.getRepository(SequenceStep);
			const updateSpy = jest.spyOn(stepRepo, 'update');

			// El editor reenvía el paso tal como lo leyó → nada que escribir.
			await svc.updateSequence(seq.id, {
				steps: [{
					id: step.id, stepOrder: 0, offsetDays: 5, sendHour: 9,
					templateType: 'WALKER_WELCOME', channel: 'email', recipientTarget: 'participant',
				} as any],
			});
			expect(updateSpy).not.toHaveBeenCalled();

			// Un campo cambiado → exactamente un UPDATE con el valor nuevo.
			await svc.updateSequence(seq.id, {
				steps: [{
					id: step.id, stepOrder: 0, offsetDays: 6, sendHour: 9,
					templateType: 'WALKER_WELCOME', channel: 'email', recipientTarget: 'participant',
				} as any],
			});
			expect(updateSpy).toHaveBeenCalledTimes(1);
			const after = await stepRepo.findOne({ where: { id: step.id } });
			expect(after!.offsetDays).toBe(6);
		});

		it('condition con las claves en otro orden cuenta como sin cambios (comparación semántica)', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-12-01T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			const seq = await svc.createSequence({
				name: 'Diff de condición',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{
					stepOrder: 0, offsetDays: 5, sendHour: 9,
					templateType: 'WALKER_WELCOME', channel: 'email',
					condition: { attendanceFilter: 'pending', minPayments: 1 },
				} as any],
			});
			const step = seq.steps![0];

			const updateSpy = jest.spyOn(AppDataSource.getRepository(SequenceStep), 'update');
			await svc.updateSequence(seq.id, {
				steps: [{
					id: step.id, stepOrder: 0, offsetDays: 5, sendHour: 9,
					templateType: 'WALKER_WELCOME', channel: 'email',
					// Mismos pares clave/valor, otro orden de inserción.
					condition: { minPayments: 1, attendanceFilter: 'pending' },
				} as any],
			});
			expect(updateSpy).not.toHaveBeenCalled();
		});
	});

	describe('#6: batching de processDue', () => {
		afterEach(() => {
			jest.restoreAllMocks();
		});

		it('la plantilla no se busca por mensaje: cero findOne tras procesar N vencidos', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-12-01T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', email: 'batch1@example.com',
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', email: 'batch2@example.com',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Bienvenida');

			const seq = await svc.createSequence({
				name: 'Bienvenida batch',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 0, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			expect(await svc.enrollSequence(seq)).toBe(2);

			const templateFindOne = jest.spyOn(AppDataSource.getRepository(MessageTemplate), 'findOne');
			const processed = await svc.processDue(new Date());
			expect(processed).toBe(2);
			// La plantilla vino del batch por corrida: ningún findOne por mensaje.
			expect(templateFindOne).not.toHaveBeenCalled();
			const sent = await AppDataSource.getRepository(ScheduledMessage).count({
				where: { sequenceId: seq.id, status: 'sent' as const },
			});
			expect(sent).toBe(2);
		});

		it('email: {community.*} se consulta UNA vez aunque el mensaje se renderiza dos veces', async () => {
			const user = await TestDataFactory.createTestUser();
			const community = await TestDataFactory.createTestCommunity(user.id);
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date('2026-12-01T00:00:00.000Z'),
				timezone: 'America/Mexico_City',
			});
			await AppDataSource.getRepository(Retreat).update(retreat.id, { communityId: community.id });
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', email: 'community-once@example.com',
			} as any);
			await createTemplate(retreat.id, 'GENERAL', `Saludos de {community.name}`);

			const seq = await svc.createSequence({
				name: 'Con comunidad',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 0, templateType: 'GENERAL', channel: 'email' } as any],
			});
			expect(await svc.enrollSequence(seq)).toBe(1);

			const communityFindOne = jest.spyOn(AppDataSource.getRepository(Community), 'findOne');
			const processed = await svc.processDue(new Date());
			expect(processed).toBe(1);
			// Texto y HTML comparten el contexto resuelto: una sola consulta.
			expect(communityFindOne).toHaveBeenCalledTimes(1);

			const sm = await AppDataSource.getRepository(ScheduledMessage).findOne({
				where: { sequenceId: seq.id },
			});
			expect(sm!.status).toBe('sent');
			expect(sm!.resolvedContent).toContain(community.name);
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

		it('anti-backfill (red de seguridad): NO envía un pending de retiro ya terminado', async () => {
			// Simula el incidente: filas pending materializadas de un retiro que ya
			// terminó. El procesador debe saltarlas (skipped), nunca enviarlas.
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() - 200 * 86400000),
				endDate: new Date(Date.now() - 197 * 86400000),
				timezone: 'America/Mexico_City',
			});
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'viejo2@example.com',
				firstName: 'Viejo',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola {participant.firstName}');

			const seq = await svc.createSequence({
				name: 'Bienvenida (retiro viejo)',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
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
					templateType: 'WALKER_WELCOME',
					recipientTarget: 'participant',
					scheduledFor: new Date(Date.now() - 197 * 86400000),
					status: 'pending',
				}),
			);

			const processed = await svc.processDue();
			expect(processed).toBe(0); // no se procesa/envía

			const sm = await smRepo.findOne({ where: { participantId: participant.id } });
			expect(sm?.status).toBe('skipped');
			expect(sm?.error).toContain('retiro finalizado');

			const comms = await AppDataSource.getRepository(ParticipantCommunication).count({
				where: { participantId: participant.id },
			});
			expect(comms).toBe(0); // no se registró ningún envío
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

	describe('audiencia community_roster', () => {
		// La convocatoria a servir va al padrón de la comunidad, no a
		// `retreat_participants`: precisamente son los que aún NO se han inscrito.
		// Y va por WhatsApp, que en este sistema NUNCA se envía solo — se encola.
		const linkedRetreatWithRoster = async () => {
			const user = await TestDataFactory.createTestUser();
			const community = await TestDataFactory.createTestCommunity(user.id);
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
			});
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId: community.id,
			});
			return { community, retreat };
		};

		const addRosterMember = async (
			communityId: string,
			retreatId: string,
			overrides: Record<string, unknown> = {},
			state = 'active_member',
		) => {
			const participant = await TestDataFactory.createTestParticipant(retreatId, overrides as any);
			await TestDataFactory.createTestCommunityMember(communityId, participant.id, {
				state: state as never,
			});
			return participant;
		};

		const convocationSeq = async (retreatId: string) =>
			svc.createSequence({
				name: 'Convocatoria de servidores',
				retreatId,
				trigger: 'days_before_retreat',
				audience: 'community_roster',
				steps: [
					{
						stepOrder: 0,
						offsetDays: 45,
						sendHour: 10,
						templateType: 'GENERAL',
						channel: 'whatsapp',
					} as any,
				],
			});

		it('enrola al padrón de la comunidad vinculada', async () => {
			const { community, retreat } = await linkedRetreatWithRoster();
			await addRosterMember(community.id, retreat.id, { cellPhone: '5511111111' });
			await addRosterMember(community.id, retreat.id, { cellPhone: '5522222222' });

			const seq = await convocationSeq(retreat.id);
			const created = await svc.enrollSequence(seq);

			expect(created).toBe(2);
		});

		it('un retiro sin comunidad vinculada no enrola a nadie', async () => {
			const user = await TestDataFactory.createTestUser();
			const community = await TestDataFactory.createTestCommunity(user.id);
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
			});
			// El padrón existe, pero el retiro NO apunta a la comunidad.
			await addRosterMember(community.id, retreat.id, { cellPhone: '5511111111' });

			const seq = await convocationSeq(retreat.id);

			expect(await svc.enrollSequence(seq)).toBe(0);
		});

		it('excluye los estados de canal roto y no-contactar', async () => {
			const { community, retreat } = await linkedRetreatWithRoster();
			await addRosterMember(community.id, retreat.id, { cellPhone: '5511111111' });
			for (const state of ['wrong_contact_info', 'paused', 'do_not_contact']) {
				await addRosterMember(community.id, retreat.id, { cellPhone: '5599999999' }, state);
			}

			const seq = await convocationSeq(retreat.id);

			expect(await svc.enrollSequence(seq)).toBe(1);
		});

		it('incluye a un miembro que aún NO está inscrito en el retiro', async () => {
			// El punto de la feature: la audiencia no puede depender de
			// `retreat_participants`, porque a quien hay que convocar es justo a
			// quien no aparece ahí.
			const { community, retreat } = await linkedRetreatWithRoster();
			const otherRetreat = await TestDataFactory.createTestRetreat();
			const participant = await TestDataFactory.createTestParticipant(otherRetreat.id, {
				cellPhone: '5533333333',
			} as any);
			await TestDataFactory.createTestCommunityMember(community.id, participant.id);

			const seq = await convocationSeq(retreat.id);
			await svc.enrollSequence(seq);

			const scheduled = await AppDataSource.getRepository(ScheduledMessage).find({
				where: { sequenceId: seq.id },
			});
			expect(scheduled.map((m) => m.participantId)).toContain(participant.id);
		});

		it('WhatsApp encola, no envía: el mensaje queda en la bandeja', async () => {
			const { community, retreat } = await linkedRetreatWithRoster();
			await addRosterMember(community.id, retreat.id, { cellPhone: '5511111111' });
			// Sin plantilla del tipo en el retiro, `processDue` marca `skipped` — el
			// fallo silencioso que ya documenta el CRM. Por eso la migración siembra
			// SERVER_CONVOCATION en cada retiro.
			await createTemplate(retreat.id, 'GENERAL', 'Hola {participant.firstName}, ¿sirves?');
			(globalThis as any).__sentEmails = [];

			const seq = await convocationSeq(retreat.id);
			await svc.enrollSequence(seq);
			// No se mueve el reloj: con `offsetDays: 45` sobre un retiro que empieza
			// "hoy", el mensaje ya vence. Adelantar `now` un año dispararía el guard
			// anti-backfill (`isRetreatClosed`) y el mensaje saldría `skipped` — que
			// es precisamente lo que ese guard debe hacer.
			await svc.processDue();

			const scheduled = await AppDataSource.getRepository(ScheduledMessage).find({
				where: { sequenceId: seq.id },
			});
			expect(scheduled).toHaveLength(1);
			expect(scheduled[0].status).toBe('queued');
			expect(scheduled[0].channel).toBe('whatsapp');
			expect(((globalThis as any).__sentEmails as any[]).length).toBe(0);
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
			const { items, total } = await svc.getIssuesByRetreat(retreat.id);
			expect(items).toHaveLength(1);
			expect(total).toBe(1);
			expect(items[0].error).toBe('sin plantilla');
		});

		it('issues: total real sin cap + paginación offset/limit (cargar más)', async () => {
			const retreat = await TestDataFactory.createTestRetreat({ timezone: 'America/Mexico_City' });
			const p1 = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', email: 'a@example.com' } as any);
			const p2 = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', email: 'b@example.com' } as any);
			const p3 = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker', email: 'c@example.com' } as any);
			const seq = await svc.createSequence({
				name: 'S', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const rows: ScheduledMessage[] = [];
			for (const p of [p1, p2, p3]) {
				rows.push(await repo.save(repo.create({
					sequenceId: seq.id, stepId: seq.steps![0].id, participantId: p.id,
					retreatId: retreat.id, channel: 'email', templateType: 'WALKER_WELCOME',
					recipientTarget: 'participant', scheduledFor: new Date(), status: 'skipped',
				})));
			}
			// updatedAt escalonado y EXPLÍCITO: repo.update no pisa @UpdateDateColumn
			// (TypeORM 0.3.27), así que el orden updatedAt DESC queda determinista.
			await repo.update(rows[0].id, { updatedAt: new Date('2026-01-01T00:00:01Z') } as any);
			await repo.update(rows[1].id, { updatedAt: new Date('2026-01-01T00:00:02Z') } as any);
			await repo.update(rows[2].id, { updatedAt: new Date('2026-01-01T00:00:03Z') } as any);

			// Primera página capada: items recortados pero total = 3 (contador honesto).
			const page1 = await svc.getIssuesByRetreat(retreat.id, { limit: 2 });
			expect(page1.total).toBe(3);
			expect(page1.items).toHaveLength(2);
			expect(page1.items[0].participantId).toBe(p3.id); // más reciente primero
			expect(page1.items[1].participantId).toBe(p2.id);

			// "Cargar más": la segunda página trae el resto.
			const page2 = await svc.getIssuesByRetreat(retreat.id, { limit: 2, offset: 2 });
			expect(page2.total).toBe(3);
			expect(page2.items).toHaveLength(1);
			expect(page2.items[0].participantId).toBe(p1.id);
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
			const { sm, repo } = await seedDue({ channel: 'whatsapp' });
			// El despacho manual sólo aplica a pendientes YA encolados (M2: queued→sent).
			await repo.update(sm.id, { status: 'queued' } as any);
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
			const { items } = await svc.getIssuesByRetreat(retreat.id);
			expect(items.some((i) => i.id === sm.id)).toBe(false);
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
			const { items, total } = await svc.getIssuesByRetreat(retreat.id);
			expect(items).toHaveLength(0); // ya no quedan failed/skipped
			expect(total).toBe(0);
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
			const { items } = await svc.getIssuesByRetreat(retreat.id);
			expect(items.some((i) => i.id === sm.id)).toBe(false);
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

			const res = await svc.regenerateQueuedForRetreat(retreat.id);
			expect(res.regenerated).toBe(1);
			expect(res.skipped).toBe(0);
			queued = await repo.findOne({ where: { id: sm.id } });
			expect(queued?.status).toBe('queued'); // no cambia su programación
			expect(queued?.resolvedContent).toContain('NUEVO contenido');
		});
	});

	describe('M1: fixes de correctitud del motor', () => {
		// NOTA de aislamiento: clearTestData() NO limpia las tablas de secuencias,
		// así que filas de tests anteriores sobreviven con participantId huérfano
		// (el participant sí se borra). Esas filas se saltan ANTES de llegar a
		// resolveRecipient, así que no interfieren con los asserts de acá — pero
		// nunca asserts el valor de retorno de processDue() (contaría sobrantes).
		async function seedDueWithTemplate(
			message: string,
			opts: {
				channel?: 'email' | 'whatsapp';
				retreatOverrides?: Record<string, unknown>;
				steps?: Array<Record<string, unknown>>;
			} = {},
		) {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
				...(opts.retreatOverrides || {}),
			} as any);
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', email: 'm1@example.com', cellPhone: '5512345678',
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', message);
			const seq = await svc.createSequence({
				name: 'M1', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: (opts.steps as any) || [{
					stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME',
					channel: opts.channel || 'email',
				}],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const rows = seq.steps!.map((step) =>
				repo.create({
					sequenceId: seq.id, stepId: step.id, participantId: participant.id, retreatId: retreat.id,
					channel: step.channel, templateType: step.templateType, recipientTarget: 'participant',
					scheduledFor: new Date(Date.now() - 3600_000), status: 'pending',
				}),
			);
			const saved = await repo.save(rows);
			return { retreat, participant, seq, repo, sm: saved[0], all: saved };
		}

		it('maxPerDay: el mensaje excedente vuelve a pending, no queda atascado en processing', async () => {
			const { participant, repo } = await seedDueWithTemplate('Hola {participant.firstName}', {
				steps: [
					{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' },
					{ stepOrder: 1, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' },
				],
			});
			process.env.SEQUENCE_MAX_PER_PARTICIPANT_PER_DAY = '1';
			try {
				await svc.processDue();
			} finally {
				delete process.env.SEQUENCE_MAX_PER_PARTICIPANT_PER_DAY;
			}
			const statuses = (await repo.find({ where: { participantId: participant.id } }))
				.map((r) => r.status)
				.sort();
			expect(statuses).toEqual(['pending', 'sent']);
		});

		it('excepción inesperada post-claim: la fila queda failed con attempts=1 y motivo', async () => {
			const { participant, sm, repo } = await seedDueWithTemplate('Hola {participant.firstName}');
			const svcAny = svc as any;
			const original = svcAny.resolveRecipient.bind(svcAny);
			const spy = jest
				.spyOn(svcAny, 'resolveRecipient')
				.mockImplementation(async (...args: any[]) => {
					if (args[0]?.id === participant.id) throw new Error('boom DB');
					return original(...args);
				});
			try {
				await svc.processDue();
			} finally {
				spy.mockRestore();
			}
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('failed');
			expect(after?.attempts).toBe(1);
			expect(after?.error).toContain('boom DB');
		});

		it('reaper: una fila processing con updatedAt vieja vuelve al ciclo y se envía', async () => {
			const { sm, repo } = await seedDueWithTemplate('Hola {participant.firstName}');
			// updatedAt va EXPLÍCITO: repo.update() NO pisa @UpdateDateColumn solo
			// (verificado con TypeORM 0.3.27) — sin esto la fila no luciría "vieja".
			await repo.update(sm.id, {
				status: 'processing',
				updatedAt: new Date(Date.now() - 3600_000),
			} as any);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('sent');
		});

		it('reaper: no roba un claim fresco (processing reciente se queda processing)', async () => {
			const { sm, repo } = await seedDueWithTemplate('Hola {participant.firstName}');
			await repo.update(sm.id, { status: 'processing', updatedAt: new Date() } as any);
			const reaped = await svc.reapStaleProcessing();
			expect(reaped).toBe(0);
			expect((await repo.findOne({ where: { id: sm.id } }))?.status).toBe('processing');
		});

		it('{community.*} sin comunidad vinculada: skipped con motivo (antes salía "Emaús Demo")', async () => {
			const { sm, repo } = await seedDueWithTemplate(
				'Te espera {community.name} ({community.parish})',
				{ channel: 'whatsapp' },
			);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toContain('sin comunidad vinculada');
			expect(after?.resolvedContent ?? '').not.toContain('Emaús Demo');
		});

		it('{community.*} con comunidad vinculada: resuelve el nombre real, no el mock', async () => {
			const { retreat, sm, repo } = await seedDueWithTemplate(
				'Te espera {community.name} ({community.parish})',
				{ channel: 'whatsapp' },
			);
			const user = await TestDataFactory.createTestUser();
			const community = await TestDataFactory.createTestCommunity(user.id, {
				name: 'Emaús del Valle',
				parish: 'El Señor del Buen Despacho',
			});
			await AppDataSource.getRepository(Retreat).update(retreat.id, {
				communityId: community.id,
			} as any);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('queued');
			expect(after?.resolvedContent).toContain('Emaús del Valle');
			expect(after?.resolvedContent).toContain('El Señor del Buen Despacho');
			expect(after?.resolvedContent).not.toContain('Emaús Demo');
		});

		it('{table.*} a quien no lidera mesa: skipped con motivo accionable', async () => {
			const { sm, repo } = await seedDueWithTemplate(
				'Mesa {table.name}: {table.walkersRoster}',
				{ channel: 'whatsapp' },
			);
			await svc.processDue();
			const after = await repo.findOne({ where: { id: sm.id } });
			expect(after?.status).toBe('skipped');
			expect(after?.error).toContain('sin mesa asignada');
		});

		it('regenerate: hidrata {participant.paymentRemaining} y reporta los saltados', async () => {
			// Caminante con cuota $2,500 y $1,000 pagados → saldo real $1,500.
			// Sin hidratación el getter resolvía contra el join "pelado" y el
			// snapshot se "renovaba" a $0.00 (pariente del bug aac190fe).
			const { retreat, participant, sm, repo } = await seedDueWithTemplate(
				'Tu saldo: {participant.paymentRemaining}',
				{ channel: 'whatsapp', retreatOverrides: { cost: '$2,500' } },
			);
			const payRepo = AppDataSource.getRepository(Payment);
			await payRepo.save(payRepo.create({
				participantId: participant.id,
				retreatId: retreat.id,
				amount: 1000 as any,
				paymentDate: new Date(),
				paymentMethod: 'cash',
			}));
			await repo.update(sm.id, {
				status: 'queued', resolvedContent: 'VIEJO saldo', resolvedContact: '5512345678',
				recipientName: 'Test',
			} as any);

			// Segunda fila queued cuyo template exige contexto que no existe
			// ({community.*} sin comunidad) → debe saltarse y conservar su snapshot.
			await createTemplate(retreat.id, 'GENERAL', 'Comunidad {community.name}');
			const seq2 = await svc.createSequence({
				name: 'M1b', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp' } as any],
			});
			const sm2 = await repo.save(repo.create({
				sequenceId: seq2.id, stepId: seq2.steps![0].id, participantId: participant.id,
				retreatId: retreat.id, channel: 'whatsapp', templateType: 'GENERAL',
				recipientTarget: 'participant', scheduledFor: new Date(Date.now() - 3600_000),
				status: 'queued', resolvedContent: 'VIEJO comunidad', resolvedContact: '5512345678',
				recipientName: 'Test',
			}));

			const res = await svc.regenerateQueuedForRetreat(retreat.id);
			expect(res).toEqual({ regenerated: 1, skipped: 1 });

			const after1 = await repo.findOne({ where: { id: sm.id } });
			expect(after1?.resolvedContent).toContain(formatCurrency(1500));
			expect(after1?.resolvedContent).not.toContain('$0.00');
			const after2 = await repo.findOne({ where: { id: sm2.id } });
			expect(after2?.resolvedContent).toBe('VIEJO comunidad');
		});
	});

	describe('M2: transiciones de estado y bulk honesto', () => {
		async function seedManual(status: string, overrides: Record<string, unknown> = {}) {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
			} as any);
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', email: 'm2@example.com', cellPhone: '5512345678',
			} as any);
			const seq = await svc.createSequence({
				name: 'M2', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const sm = await repo.save(repo.create({
				sequenceId: seq.id, stepId: seq.steps![0].id, participantId: participant.id,
				retreatId: retreat.id, channel: 'whatsapp', templateType: 'WALKER_WELCOME',
				recipientTarget: 'participant', scheduledFor: new Date(), status: status as any,
				...overrides,
			}));
			return { retreat, participant, seq, repo, sm };
		}

		it('dispatch: solo desde queued — desde sent/pending lanza y no toca la fila', async () => {
			const sent = await seedManual('sent', { dispatchedBy: 'user-a', sentAt: new Date() });
			await expect(svc.markDispatched(sent.sm.id, 'user-b')).rejects.toThrow('Transición inválida');
			let row = await sent.repo.findOne({ where: { id: sent.sm.id } });
			expect(row?.status).toBe('sent');
			expect(row?.dispatchedBy).toBe('user-a'); // no pisa la marca del primero

			const pending = await seedManual('pending');
			await expect(svc.markDispatched(pending.sm.id)).rejects.toThrow('Transición inválida');
			row = await pending.repo.findOne({ where: { id: pending.sm.id } });
			expect(row?.status).toBe('pending');
		});

		it('carrera de dispatch: dos llamadas seguidas — la segunda lanza (update condicional)', async () => {
			const { sm, repo } = await seedManual('queued');
			const first = await svc.markDispatched(sm.id, 'coord-1');
			expect(first?.status).toBe('sent');
			// El segundo coordinador (bandeja desactualizada) ya no puede pisarla.
			await expect(svc.markDispatched(sm.id, 'coord-2')).rejects.toThrow('Transición inválida');
			const row = await repo.findOne({ where: { id: sm.id } });
			expect(row?.dispatchedBy).toBe('coord-1');
		});

		it('skip: solo desde queued — desde cancelled lanza', async () => {
			const { sm, repo } = await seedManual('cancelled');
			await expect(svc.markSkipped(sm.id)).rejects.toThrow('Transición inválida');
			expect((await repo.findOne({ where: { id: sm.id } }))?.status).toBe('cancelled');
		});

		it('retry: solo desde failed|skipped — desde queued lanza, desde skipped re-encola', async () => {
			const queued = await seedManual('queued');
			await expect(svc.retryScheduled(queued.sm.id)).rejects.toThrow('Transición inválida');

			const skipped = await seedManual('skipped', { attempts: 2, error: 'sin plantilla' });
			const updated = await svc.retryScheduled(skipped.sm.id, 'user-1');
			expect(updated?.status).toBe('pending');
			expect(updated?.attempts).toBe(0);
			expect(updated?.error).toBeNull();
		});

		it('discard: nunca desde sent — desde pending SÍ cancela', async () => {
			const sent = await seedManual('sent');
			await expect(svc.discardScheduled(sent.sm.id)).rejects.toThrow('Transición inválida');

			const pending = await seedManual('pending');
			const updated = await svc.discardScheduled(pending.sm.id, 'user-2');
			expect(updated?.status).toBe('cancelled');
		});

		it('assign: solo sobre queued — desde sent lanza', async () => {
			const sent = await seedManual('sent');
			await expect(svc.assign(sent.sm.id, 'user-x')).rejects.toThrow('Transición inválida');
			expect((await sent.repo.findOne({ where: { id: sent.sm.id } }))?.assignedTo).toBeFalsy();
		});

		it('dispatch sobre id inexistente devuelve null (404, no 409)', async () => {
			expect(await svc.markDispatched('00000000-0000-0000-0000-000000000000')).toBeNull();
		});

		it('bulk con ids: afecta solo esos ids y affected coincide con lo tocado', async () => {
			const { retreat, seq, repo } = await seedManual('failed', { attempts: 3 });
			// Dos problemas más en el MISMO retiro/paso (participantes distintos).
			const extraIds: string[] = [];
			for (let i = 0; i < 2; i++) {
				const p = await TestDataFactory.createTestParticipant(retreat.id, {
					type: 'walker', email: `extra${i}@example.com`,
				} as any);
				const row = await repo.save(repo.create({
					sequenceId: seq.id, stepId: seq.steps![0].id, participantId: p.id,
					retreatId: retreat.id, channel: 'whatsapp', templateType: 'WALKER_WELCOME',
					recipientTarget: 'participant', scheduledFor: new Date(), status: 'failed',
				}));
				extraIds.push(row.id);
			}

			const affected = await svc.bulkResolveIssues(retreat.id, 'discard', extraIds);
			expect(affected).toBe(2); // sólo los ids, no los 3 problemas del retiro
			const remaining = await repo.find({
				where: { retreatId: retreat.id, status: 'failed' as any },
			});
			expect(remaining).toHaveLength(1); // el primero sigue failed
			const cancelled = await repo.find({
				where: { retreatId: retreat.id, status: 'cancelled' as any },
			});
			expect(cancelled).toHaveLength(2);
		});

		it('bulk sin ids (retry): resetea attempts/error, programa para ahora, y affected es real', async () => {
			const { retreat, sm, repo } = await seedManual('failed', {
				attempts: 3, error: 'envío SMTP falló', scheduledFor: new Date(Date.now() - 5 * 86400000),
			});
			const affected = await svc.bulkResolveIssues(retreat.id, 'retry');
			expect(affected).toBe(1);
			const row = await repo.findOne({ where: { id: sm.id } });
			expect(row?.status).toBe('pending');
			expect(row?.attempts).toBe(0);
			expect(row?.error).toBeNull();
			// scheduledFor ≈ ahora (datetime('now') crudo dejaba la fecha en UTC sin
			// transformar; new Date() pasa por el DateTimeTransformer).
			expect(Math.abs(row!.scheduledFor.getTime() - Date.now())).toBeLessThan(60_000);
			// Ya no hay problemas en el retiro → affected real (no el count de antes).
			expect(await svc.bulkResolveIssues(retreat.id, 'discard')).toBe(0);
		});
	});

	describe('M3: visibilidad del tiempo (listScheduled + schedulePreview)', () => {
		/**
		 * Siembra un retiro CDMX con una secuencia de 1 paso y `n` filas de
		 * scheduled_messages (una por participante) con las fechas dadas.
		 */
		async function seedList(rows: Array<{
			status: string; scheduledFor: Date; firstName: string;
		}>) {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
			} as any);
			const seq = await svc.createSequence({
				name: 'M3', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 5, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const created: ScheduledMessage[] = [];
			for (const r of rows) {
				const p = await TestDataFactory.createTestParticipant(retreat.id, {
					type: 'walker', firstName: r.firstName, lastName: 'M3',
					email: `${r.firstName.toLowerCase()}-m3@example.com`,
				} as any);
				created.push(await repo.save(repo.create({
					sequenceId: seq.id, stepId: seq.steps![0].id, participantId: p.id,
					retreatId: retreat.id, channel: 'whatsapp', templateType: 'WALKER_WELCOME',
					recipientTarget: 'participant', scheduledFor: r.scheduledFor,
					status: r.status as any,
				})));
			}
			return { retreat, seq, repo, created };
		}

		it('listScheduled: default pending only, DTO sin PII, timezone del servidor', async () => {
			const { retreat, seq, created } = await seedList([
				{ status: 'pending', scheduledFor: new Date('2026-09-25T15:00:00Z'), firstName: 'Ana' },
				{ status: 'queued', scheduledFor: new Date('2026-09-20T15:00:00Z'), firstName: 'Beto' },
			]);
			const res = await svc.listScheduled(retreat.id);
			expect(res.total).toBe(1);
			expect(res.items).toHaveLength(1);
			const item = res.items[0];
			expect(item.id).toBe(created[0].id);
			expect(item.participantName).toBe('Ana M3');
			expect(item.sequenceId).toBe(seq.id);
			expect(item.stepOrder).toBe(0);
			expect(item.offsetDays).toBe(5);
			expect(item.sendHour).toBe(9);
			expect(item.scheduledFor).toEqual(new Date('2026-09-25T15:00:00Z'));
			// La TZ la resuelve el servidor desde el retiro — el cliente nunca la infiere.
			expect(res.timezone).toBe('America/Mexico_City');
			// El DTO no arrastra la entity del participante (PII) a la lista.
			expect((item as any).participant).toBeUndefined();
			expect((item as any).resolvedContact).toBeUndefined();
		});

		it('listScheduled: filtra por statuses, secuencia y search (LIKE sobre nombre)', async () => {
			const { retreat } = await seedList([
				{ status: 'pending', scheduledFor: new Date('2026-09-25T15:00:00Z'), firstName: 'Ana' },
				{ status: 'queued', scheduledFor: new Date('2026-09-20T15:00:00Z'), firstName: 'Beto' },
				{ status: 'pending', scheduledFor: new Date('2026-10-09T15:00:00Z'), firstName: 'Ximena' },
			]);
			const queued = await svc.listScheduled(retreat.id, { statuses: ['queued'] });
			expect(queued.total).toBe(1);
			expect(queued.items[0].participantName).toBe('Beto M3');

			// Sin la secuencia de la siembra no hay nada (aisla de corridas previas).
			const otherSeq = await svc.listScheduled(retreat.id, {
				sequenceId: '00000000-0000-0000-0000-000000000000',
			});
			expect(otherSeq.total).toBe(0);

			const byName = await svc.listScheduled(retreat.id, { search: 'xim' });
			expect(byName.total).toBe(1);
			expect(byName.items[0].participantName).toBe('Ximena M3');
		});

		it('listScheduled: paginación y orden por scheduledFor ASC', async () => {
			const { retreat } = await seedList([
				{ status: 'pending', scheduledFor: new Date('2026-10-09T15:00:00Z'), firstName: 'C' },
				{ status: 'pending', scheduledFor: new Date('2026-09-25T15:00:00Z'), firstName: 'A' },
				{ status: 'pending', scheduledFor: new Date('2026-10-01T15:00:00Z'), firstName: 'B' },
			]);
			const page1 = await svc.listScheduled(retreat.id, { page: 1, limit: 2 });
			expect(page1.total).toBe(3);
			expect(page1.totalPages).toBe(2);
			expect(page1.items.map((i) => i.participantName)).toEqual(['A M3', 'B M3']);
			const page2 = await svc.listScheduled(retreat.id, { page: 2, limit: 2 });
			expect(page2.items.map((i) => i.participantName)).toEqual(['C M3']);
		});

		it('schedulePreview: loopéa computeScheduledFor — 9:00 CDMX = 15:00 UTC exacto', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
			} as any);
			// 12:00 UTC = 06:00 CDMX del MISMO día → base calendario 2026-09-10.
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				registrationDate: new Date('2026-09-10T12:00:00Z'),
			} as any);
			const res = await svc.schedulePreview({
				retreatId: retreat.id,
				participantId: participant.id,
				trigger: 'participant_created',
				steps: [
					{ offsetDays: 0, sendHour: 9 },  // alta +0 → 10-sep 9:00 CDMX
					{ offsetDays: 2, sendHour: 20 }, // alta +2 → 12-sep 20:00 CDMX
				],
			});
			expect(res).not.toBeNull();
			expect(res!.timezone).toBe('America/Mexico_City');
			// El servicio devuelve Dates (el DTO over-the-wire las serializa a ISO).
			expect((res!.dates[0] as Date).toISOString()).toBe('2026-09-10T15:00:00.000Z');
			expect((res!.dates[1] as Date).toISOString()).toBe('2026-09-13T02:00:00.000Z'); // 20:00 CDMX (UTC-6)
		});

		it('schedulePreview: null por paso cuando falta el dato del disparador; null si no existe el participante', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
			} as any);
			// registrationDate es CreateDateColumn (siempre existe); el caso `null`
			// real es birthday con el centinela 1900 (miembros importados sin fecha).
			const participant = await TestDataFactory.createTestParticipant(retreat.id, {
				birthDate: new Date('1900-01-01'),
			} as any);
			const res = await svc.schedulePreview({
				retreatId: retreat.id,
				participantId: participant.id,
				trigger: 'birthday',
				steps: [{ offsetDays: 0, sendHour: 9 }],
			});
			expect(res).not.toBeNull();
			expect(res!.dates).toEqual([null]);

			expect(await svc.schedulePreview({
				retreatId: retreat.id,
				participantId: '00000000-0000-0000-0000-000000000000',
				trigger: 'participant_created',
				steps: [{ offsetDays: 0, sendHour: 9 }],
			})).toBeNull();
		});
	});

	describe('M4: reprogramar y encolar ya (rescheduleStep)', () => {
		/** Retiro CDMX + secuencia de 1 paso (sendHour 9) + filas por estado. */
		async function seedReschedule(rows: Array<{
			status: string; scheduledFor: Date; firstName: string;
		}>) {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
			} as any);
			const seq = await svc.createSequence({
				name: 'M4', retreatId: retreat.id, trigger: 'participant_created', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 5, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const created: ScheduledMessage[] = [];
			for (const r of rows) {
				const p = await TestDataFactory.createTestParticipant(retreat.id, {
					type: 'walker', firstName: r.firstName, lastName: 'M4',
					email: `${r.firstName.toLowerCase()}-m4@example.com`,
				} as any);
				created.push(await repo.save(repo.create({
					sequenceId: seq.id, stepId: seq.steps![0].id, participantId: p.id,
					retreatId: retreat.id, channel: 'whatsapp', templateType: 'WALKER_WELCOME',
					recipientTarget: 'participant', scheduledFor: r.scheduledFor,
					status: r.status as any,
				})));
			}
			return { retreat, seq, repo, created };
		}

		it('mueve SOLO los pending del paso a la fecha "de pared" en la TZ del retiro', async () => {
			const { seq, repo, created } = await seedReschedule([
				{ status: 'pending', scheduledFor: new Date('2026-09-25T15:00:00Z'), firstName: 'Ana' },
				{ status: 'pending', scheduledFor: new Date('2026-09-26T15:00:00Z'), firstName: 'Beto' },
				{ status: 'queued', scheduledFor: new Date('2026-09-20T15:00:00Z'), firstName: 'Caro' },
				{ status: 'sent', scheduledFor: new Date('2026-09-01T15:00:00Z'), firstName: 'Dani' },
			]);
			const step = await svc.findStepWithSequence(seq.steps![0].id);
			expect(step?.sequence?.retreatId).toBe(seq.retreatId); // relations para el controller

			const { affected, scheduledFor } = await svc.rescheduleStep(step!, {
				date: '2026-09-30', hour: 9,
			});
			expect(affected).toBe(2);
			// 9:00 CDMX (UTC-6, sin DST) → 15:00 UTC exacto.
			expect(scheduledFor.toISOString()).toBe('2026-09-30T15:00:00.000Z');

			const reload = async (i: number) =>
				(await repo.findOneByOrFail({ id: created[i].id })).scheduledFor;
			expect((await reload(0)).toISOString()).toBe('2026-09-30T15:00:00.000Z');
			expect((await reload(1)).toISOString()).toBe('2026-09-30T15:00:00.000Z');
			// Lo queued (ya en bandeja) y lo sent (historial) quedan intactos.
			expect((await reload(2)).toISOString()).toBe('2026-09-20T15:00:00.000Z');
			expect((await reload(3)).toISOString()).toBe('2026-09-01T15:00:00.000Z');
		});

		it('hour sin valor conserva el sendHour del paso', async () => {
			const { seq } = await seedReschedule([
				{ status: 'pending', scheduledFor: new Date('2026-09-25T15:00:00Z'), firstName: 'Ana' },
			]);
			const step = await svc.findStepWithSequence(seq.steps![0].id);
			const { affected, scheduledFor } = await svc.rescheduleStep(step!, { date: '2026-10-01' });
			expect(affected).toBe(1);
			expect(scheduledFor.toISOString()).toBe('2026-10-01T15:00:00.000Z'); // sendHour 9
		});

		it('immediate programa ≈ ahora (encolar ya: el controller encadena el run)', async () => {
			const { seq } = await seedReschedule([
				{ status: 'pending', scheduledFor: new Date('2026-10-09T15:00:00Z'), firstName: 'Ana' },
			]);
			const step = await svc.findStepWithSequence(seq.steps![0].id);
			const before = Date.now();
			const { affected, scheduledFor } = await svc.rescheduleStep(step!, { immediate: true });
			const after = Date.now();
			expect(affected).toBe(1);
			expect(scheduledFor.getTime()).toBeGreaterThanOrEqual(before);
			expect(scheduledFor.getTime()).toBeLessThanOrEqual(after);
		});

		it('paso sin pendientes → affected 0; paso inexistente → null', async () => {
			const { seq } = await seedReschedule([
				{ status: 'sent', scheduledFor: new Date('2026-09-01T15:00:00Z'), firstName: 'Ana' },
			]);
			const step = await svc.findStepWithSequence(seq.steps![0].id);
			const { affected } = await svc.rescheduleStep(step!, { date: '2026-10-01', hour: 9 });
			expect(affected).toBe(0);
			expect(await svc.findStepWithSequence('00000000-0000-0000-0000-000000000000')).toBeNull();
		});
	});

	describe('M5-B4: archivado de pasos', () => {
		/**
		 * Retiro CDMX con fechas fijas (abierto: sin anti-backfill) + secuencia
		 * de 2 pasos + 2 caminantes enrolados. Estados sembrados a mano para
		 * probar qué sobrevive al archivar el paso 1.
		 */
		async function seedArchive() {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
				// Mediodía UTC: el día calendario sobrevive el shift del
				// DateTimeTransformer al persistir (misma razón que el 12:00Z de M3).
				startDate: new Date('2026-11-10T12:00:00.000Z'),
				endDate: new Date('2026-11-13T12:00:00.000Z'),
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola');
			await createTemplate(retreat.id, 'PAYMENT_REMINDER', 'Pago');
			const p1 = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', firstName: 'Ana', lastName: 'M5', email: 'ana-m5@example.com',
			} as any);
			const p2 = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', firstName: 'Beto', lastName: 'M5', email: 'beto-m5@example.com',
			} as any);
			const seq = await svc.createSequence({
				name: 'M5', retreatId: retreat.id, trigger: 'days_before_retreat', audience: 'walker',
				steps: [
					{ stepOrder: 0, offsetDays: 5, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any,
					{ stepOrder: 1, offsetDays: 2, sendHour: 9, templateType: 'PAYMENT_REMINDER', channel: 'whatsapp' } as any,
				],
			});
			expect(await svc.enrollSequence(seq)).toBe(4); // 2 pasos × 2 caminantes
			// Estados sembrados a mano para probar qué sobrevive al archivar el
			// paso 1: su fila de p1 queda sent (historial), su fila de p2 queda
			// pending (la que debe cancelarse). El paso 2 conserva pending/queued.
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const rows = await repo.find({ where: { sequenceId: seq.id } });
			const byKey = (stepIdx: number, pid: string) =>
				rows.find((r) => r.stepId === seq.steps![stepIdx].id && r.participantId === pid)!;
			byKey(0, p1.id).status = 'sent';
			byKey(1, p2.id).status = 'queued';
			await repo.save([byKey(0, p1.id), byKey(1, p2.id)]);
			return { retreat, seq, p1, p2, repo };
		}

		it('quitar un paso lo archiva (no lo borra) y cancela SOLO sus pending', async () => {
			const { seq, p1, p2, repo } = await seedArchive();
			const [step1, step2] = seq.steps!;

			const res = await svc.updateSequence(seq.id, {
				// Se conserva el paso 2 por id; el paso 1 desaparece del editor.
				steps: [{ id: step2.id, stepOrder: 0, offsetDays: 2, sendHour: 9, templateType: 'PAYMENT_REMINDER', channel: 'whatsapp' } as any],
			});
			expect(res?.archivedStepCount).toBe(1);
			expect(res?.archivedPendingCount).toBe(1); // el pending del paso archivado
			expect(res?.cancelledPendingCount).toBe(0); // no cambió trigger/audiencia

			// El paso 1 sigue en la DB, archivado (soft, el cascade nunca corre).
			const stepRepo = AppDataSource.getRepository(SequenceStep);
			const archived = await stepRepo.findOneByOrFail({ id: step1.id });
			expect(archived.isArchived).toBe(true);
			// Y findById ya no lo expone: el editor no puede revivirlo.
			const visible = (await svc.findById(seq.id))!.steps!;
			expect(visible.map((s) => s.id)).toEqual([step2.id]);

			// sent (historial) del paso archivado: intacto.
			const sent = await repo.findOneByOrFail({ stepId: step1.id, participantId: p1.id });
			expect(sent.status).toBe('sent');
			// El pending del paso archivado quedó cancelled con motivo accionable.
			const cancelled = await repo.findOneByOrFail({ stepId: step1.id, participantId: p2.id });
			expect(cancelled.status).toBe('cancelled');
			expect(cancelled.error).toBe('paso archivado');
			// El paso VIVO no se toca: su pending sigue pending, su queued queued.
			const alivePending = await repo.findOneByOrFail({ stepId: step2.id, participantId: p1.id });
			expect(alivePending.status).toBe('pending');
			const aliveQueued = await repo.findOneByOrFail({ stepId: step2.id, participantId: p2.id });
			expect(aliveQueued.status).toBe('queued');
		});

		it('los pasos archivados no vuelven a enrolar (nuevo participante)', async () => {
			const { retreat, seq } = await seedArchive();
			const [step1, step2] = seq.steps!;
			await svc.updateSequence(seq.id, {
				steps: [{ id: step2.id, stepOrder: 0, offsetDays: 2, sendHour: 9, templateType: 'PAYMENT_REMINDER', channel: 'whatsapp' } as any],
			});

			// Un caminante nuevo tras el archivado: sólo el paso vivo lo enrola.
			const p3 = await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', firstName: 'Caro', lastName: 'M5', email: 'caro-m5@example.com',
			} as any);
			const reloaded = (await svc.findById(seq.id))!;
			expect(await svc.enrollSequence(reloaded)).toBe(1);
			const rows = await AppDataSource.getRepository(ScheduledMessage).find({
				where: { participantId: p3.id },
			});
			expect(rows).toHaveLength(1);
			expect(rows[0].stepId).toBe(step2.id);
			expect(rows[0].stepId).not.toBe(step1.id);
		});
	});

	describe('M5-B3: cambio de trigger/audiencia re-materializa', () => {
		async function seedRetrigger() {
			const retreat = await TestDataFactory.createTestRetreat({
				timezone: 'America/Mexico_City',
				// Mediodía UTC: el día calendario sobrevive el shift del
				// DateTimeTransformer al persistir (misma razón que el 12:00Z de M3).
				startDate: new Date('2026-11-10T12:00:00.000Z'),
				endDate: new Date('2026-11-13T12:00:00.000Z'),
			} as any);
			await createTemplate(retreat.id, 'WALKER_WELCOME', 'Hola');
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker', firstName: 'Ana', lastName: 'M5', email: 'ana-m5b3@example.com',
			} as any);
			const seq = await svc.createSequence({
				name: 'B3', retreatId: retreat.id, trigger: 'days_before_retreat', audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 5, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'whatsapp' } as any],
			});
			expect(await svc.enrollSequence(seq)).toBe(1);
			// 10-nov − 5 días, 9:00 CDMX = 15:00 UTC.
			const repo = AppDataSource.getRepository(ScheduledMessage);
			const row = await repo.findOneByOrFail({ sequenceId: seq.id });
			expect(row.scheduledFor.toISOString()).toBe('2026-11-05T15:00:00.000Z');
			return { retreat, seq, repo };
		}

		it('cambiar el trigger borra las pending y las recrea con fechas nuevas', async () => {
			const { seq, repo } = await seedRetrigger();

			const res = await svc.updateSequence(seq.id, { trigger: 'days_after_retreat' });
			expect(res?.cancelledPendingCount).toBe(1);
			expect(res?.archivedStepCount).toBe(0);

			// Una sola fila (la vieja se BORRÓ, no canceló: la UQ (stepId,
			// participantId) habría bloqueado el re-enrolamiento) con la fecha
			// del trigger nuevo: 13-nov + 5 días, 9:00 CDMX.
			const rows = await repo.find({ where: { sequenceId: seq.id } });
			expect(rows).toHaveLength(1);
			expect(rows[0].status).toBe('pending');
			expect(rows[0].scheduledFor.toISOString()).toBe('2026-11-18T15:00:00.000Z');
		});

		it('cambiar de solo nombre no toca las filas materializadas', async () => {
			const { seq, repo } = await seedRetrigger();
			const before = await repo.findOneByOrFail({ sequenceId: seq.id });

			const res = await svc.updateSequence(seq.id, { name: 'Otro nombre' });
			expect(res?.cancelledPendingCount).toBe(0);
			expect(res?.archivedStepCount).toBe(0);
			expect(res?.name).toBe('Otro nombre');

			const after = await repo.findOneByOrFail({ sequenceId: seq.id });
			expect(after.id).toBe(before.id);
			expect(after.status).toBe('pending');
			expect(after.scheduledFor.getTime()).toBe(before.scheduledFor.getTime());
		});
	});
});