// Mock del EmailService antes de importar el service (el constructor lo instancia).
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
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { MessageTemplate } from '@/entities/messageTemplate.entity';
import type { MessageSequence } from '@/entities/messageSequence.entity';

/**
 * M2 — guard anti-retroactivo del enrolamiento (`isRetroactiveAtEnroll` y su
 * uso en el loop de `enrollSequence`).
 *
 * Semántica por trigger (spec R2):
 * - `days_before_retreat`/`days_after_retreat`: ancla = retiro → fecha pasada
 *   al materializar es backfill masivo (incidentes palancas 2026-09-13 y
 *   prendas 2026-10-01). Se suprime; "hoy" sí materializa.
 * - `participant_created`: ancla = alta del participante → catch-up legítimo
 *   de inscripción tardía hasta 2 días; más, suprimido.
 * - `birthday`: nunca retroactivo (computeScheduledFor elige la próxima
 *   ocurrencia).
 *
 * La supresión NO deja filas `skipped`: la UQ (stepId, participantId,
 * occurrenceYear) las volvería permanentes y bloquearía el re-enrol tras
 * corregir el offset.
 */
const TZ = 'America/Mexico_City';

describe('MessageSequenceService — M2 retroactive enroll guard', () => {
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

	describe('isRetroactiveAtEnroll (unitario, TZ-aware)', () => {
		// Jueves 1-oct-2026 12:00 CDMX = 18:00 UTC. Inicio de hoy CDMX =
		// 06:00 UTC; cutoff de participant_created = 29-sep 00:00 CDMX =
		// 29-sep 06:00 UTC.
		const now = new Date('2026-10-01T18:00:00.000Z');

		it('days_before_retreat: ayer 09:00 CDMX → retroactivo', () => {
			expect(svc.isRetroactiveAtEnroll('days_before_retreat', new Date('2026-09-30T15:00:00.000Z'), now, TZ)).toBe(true);
		});

		it('days_before_retreat: HOY 09:00 CDMX (ya transcurrido) → NO retroactivo: hoy materializa', () => {
			expect(svc.isRetroactiveAtEnroll('days_before_retreat', new Date('2026-10-01T15:00:00.000Z'), now, TZ)).toBe(false);
		});

		it('days_before_retreat: mañana → NO retroactivo', () => {
			expect(svc.isRetroactiveAtEnroll('days_before_retreat', new Date('2026-10-02T15:00:00.000Z'), now, TZ)).toBe(false);
		});

		it('days_after_retreat: mismo corte que days_before (ancla = retiro)', () => {
			expect(svc.isRetroactiveAtEnroll('days_after_retreat', new Date('2026-09-30T15:00:00.000Z'), now, TZ)).toBe(true);
			expect(svc.isRetroactiveAtEnroll('days_after_retreat', new Date('2026-10-01T15:00:00.000Z'), now, TZ)).toBe(false);
		});

		it('participant_created: 1 día de rezago → catch-up legítimo (NO retroactivo)', () => {
			expect(svc.isRetroactiveAtEnroll('participant_created', new Date('2026-09-30T15:00:00.000Z'), now, TZ)).toBe(false);
		});

		it('participant_created: 4 días de rezago → retroactivo', () => {
			expect(svc.isRetroactiveAtEnroll('participant_created', new Date('2026-09-27T15:00:00.000Z'), now, TZ)).toBe(true);
		});

		it('participant_created: el corte exacto (hoy − 2 días a medianoche CDMX) materializa', () => {
			// 29-sep 00:00 CDMX = 06:00 UTC exacto: no es "< cutoff".
			expect(svc.isRetroactiveAtEnroll('participant_created', new Date('2026-09-29T06:00:00.000Z'), now, TZ)).toBe(false);
			// Un minuto antes, sí.
			expect(svc.isRetroactiveAtEnroll('participant_created', new Date('2026-09-29T05:59:00.000Z'), now, TZ)).toBe(true);
		});

		it('birthday: nunca retroactivo (computeScheduledFor elige la próxima ocurrencia)', () => {
			expect(svc.isRetroactiveAtEnroll('birthday', new Date('2026-09-30T15:00:00.000Z'), now, TZ)).toBe(false);
		});
	});

	describe('enrollSequence (integración)', () => {
		const countRows = async (sequenceId: string) =>
			AppDataSource.getRepository(ScheduledMessage).count({ where: { sequenceId } });

		it('days_before_retreat con paso vencido: 0 filas, sin skipped (la UQ queda limpia)', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() + 3 * 86400000),
				endDate: new Date(Date.now() + 5 * 86400000),
				timezone: TZ,
			});
			await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);

			const seq = await svc.createSequence({
				name: 'Prendas vencidas',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 20, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp' } as any],
			});

			expect(await svc.enrollSequence(seq)).toBe(0);
			expect(await countRows(seq.id)).toBe(0);
			// En particular, ninguna fila skipped que la UQ volvería permanente.
			expect(
				await AppDataSource.getRepository(ScheduledMessage).count({
					where: { sequenceId: seq.id, status: 'skipped' as any },
				}),
			).toBe(0);
		});

		it('days_before_retreat con paso HOY: materializa (hoy no es retroactivo)', async () => {
			// Retiro mañana, offset 1 → fecha del paso = hoy 09:00 CDMX.
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() + 1 * 86400000),
				endDate: new Date(Date.now() + 3 * 86400000),
				timezone: TZ,
			});
			await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);

			const seq = await svc.createSequence({
				name: 'Última hora',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 1, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp' } as any],
			});

			expect(await svc.enrollSequence(seq)).toBe(1);
		});

		it('days_after_retreat vencido DENTRO de la ventana de gracia: isRetreatClosed no basta, el guard sí', async () => {
			// Retiro que terminó hace 10 días: la gracia de 30 días mantiene el
			// retiro "abierto", pero un paso a +5 días ya pasó → suprimido.
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() - 12 * 86400000),
				endDate: new Date(Date.now() - 10 * 86400000),
				timezone: TZ,
			});
			await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' } as any);

			const seq = await svc.createSequence({
				name: 'Post-retiro tardío',
				retreatId: retreat.id,
				trigger: 'days_after_retreat',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 5, sendHour: 9, templateType: 'GENERAL', channel: 'email' } as any],
			});

			expect(await svc.enrollSequence(seq)).toBe(0);
			expect(await countRows(seq.id)).toBe(0);
		});

		it('participant_created: alta de ayer materializa, alta de hace 5 días se suprime', async () => {
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() + 30 * 86400000),
				timezone: TZ,
			});
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'alta-ayer@example.com',
				registrationDate: new Date(Date.now() - 1 * 86400000),
			} as any);
			await TestDataFactory.createTestParticipant(retreat.id, {
				type: 'walker',
				email: 'alta-vieja@example.com',
				registrationDate: new Date(Date.now() - 5 * 86400000),
			} as any);

			const seq = await svc.createSequence({
				name: 'Bienvenida al alta',
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: 'walker',
				steps: [{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' } as any],
			});

			// Sólo el participante con 1 día de rezago: el de 5 se suprimió.
			expect(await svc.enrollSequence(seq)).toBe(1);
			const rows = await AppDataSource.getRepository(ScheduledMessage).find({
				where: { sequenceId: seq.id },
				relations: ['participant'],
			});
			expect(rows).toHaveLength(1);
			expect((rows[0].participant as Participant).email).toBe('alta-ayer@example.com');
		});
	});

	/**
	 * M5 — the manual "Ejecutar" no longer drops past steps silently: it reports
	 * them (`pastSteps`) and schedules them for now only when the coordinator
	 * confirms them in `sendNowStepIds`. The cron path (`enrollSequence`) is
	 * covered above and keeps suppressing.
	 */
	describe('M5 — runForRetreat with past-dated steps', () => {
		const repo = () => AppDataSource.getRepository(ScheduledMessage);

		async function seedPastStepSequence(opts: { walkers?: number; startInDays?: number } = {}) {
			const startInDays = opts.startInDays ?? 3;
			const retreat = await TestDataFactory.createTestRetreat({
				startDate: new Date(Date.now() + startInDays * 86400000),
				endDate: new Date(Date.now() + (startInDays + 2) * 86400000),
				timezone: TZ,
			});
			const participants: Participant[] = [];
			for (let i = 0; i < (opts.walkers ?? 2); i++) {
				participants.push(
					await TestDataFactory.createTestParticipant(retreat.id, {
						type: 'walker',
						email: `m5-${retreat.id.slice(0, 8)}-${i}@example.com`,
					} as any),
				);
			}
			const templates = AppDataSource.getRepository(MessageTemplate);
			await templates.save(
				templates.create({
					name: 'Aviso',
					type: 'GENERAL' as any,
					message: 'Hola {participant.firstName}',
					retreatId: retreat.id,
					scope: 'retreat',
				}),
			);
			const seq = await svc.createSequence({
				name: 'Último aviso',
				retreatId: retreat.id,
				trigger: 'days_before_retreat',
				audience: 'walker',
				steps: [
					// 20 days before a retreat a few days away: already past.
					{ stepOrder: 0, offsetDays: 20, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp' } as any,
					// 1 day before: still ahead.
					{ stepOrder: 1, offsetDays: 1, sendHour: 9, templateType: 'GENERAL', channel: 'whatsapp' } as any,
				],
			});
			const pastStep = seq.steps!.find((s) => s.stepOrder === 0)!;
			return { retreat, participants, seq, pastStep };
		}

		it('without confirmation: reports the past step with its head-count and schedules nothing for it', async () => {
			const { retreat, seq, pastStep } = await seedPastStepSequence();

			const result = await svc.runForRetreat(retreat.id);

			expect(result.pastSteps).toEqual([
				expect.objectContaining({
					sequenceId: seq.id,
					sequenceName: 'Último aviso',
					stepId: pastStep.id,
					stepOrder: 0,
					channel: 'whatsapp',
					count: 2,
				}),
			]);
			expect(new Date(result.pastSteps[0].scheduledFor).getTime()).toBeLessThan(Date.now());
			const rows = await repo().find({ where: { sequenceId: seq.id } });
			// Only the future step materialized, one row per walker.
			expect(rows.filter((r) => r.stepId === pastStep.id)).toHaveLength(0);
			expect(rows).toHaveLength(2);
		});

		it('with confirmation: schedules the past step for now and queues it in the same run', async () => {
			const { retreat, seq, pastStep } = await seedPastStepSequence();

			const result = await svc.runForRetreat(retreat.id, { sendNowStepIds: [pastStep.id] });

			expect(result.pastSteps).toEqual([]);
			expect(result.processed).toBe(2);
			const rows = await repo().find({ where: { sequenceId: seq.id, stepId: pastStep.id } });
			expect(rows).toHaveLength(2);
			for (const row of rows) {
				expect(row.status).toBe('queued');
				// Due now, not on its original date (~17 days ago).
				expect(new Date(row.scheduledFor).getTime()).toBeGreaterThan(Date.now() - 86400000);
			}
		});

		it('people who already have the past step are neither counted nor duplicated', async () => {
			const { retreat, participants, seq, pastStep } = await seedPastStepSequence();
			await repo().save(
				repo().create({
					sequenceId: seq.id,
					stepId: pastStep.id,
					participantId: participants[0].id,
					retreatId: retreat.id,
					channel: 'whatsapp',
					templateType: 'GENERAL',
					scheduledFor: new Date(Date.now() - 5 * 86400000),
					status: 'sent',
				} as any),
			);

			const report = await svc.runForRetreat(retreat.id);
			expect(report.pastSteps[0].count).toBe(1);

			await svc.runForRetreat(retreat.id, { sendNowStepIds: [pastStep.id] });
			const rows = await repo().find({ where: { stepId: pastStep.id } });
			expect(rows).toHaveLength(2);
			expect(rows.filter((r) => r.participantId === participants[0].id)).toHaveLength(1);
		});

		it('a confirmed step id from another retreat is ignored', async () => {
			const a = await seedPastStepSequence({ walkers: 1 });
			const b = await seedPastStepSequence({ walkers: 1 });

			await svc.runForRetreat(a.retreat.id, { sendNowStepIds: [b.pastStep.id] });

			expect(await repo().count({ where: { stepId: b.pastStep.id } })).toBe(0);
			expect(await repo().count({ where: { stepId: a.pastStep.id } })).toBe(0);
		});

		it('a closed retreat is never caught up, even with confirmation', async () => {
			// Ended 8 days ago: isRetreatClosed wins over the confirmation.
			const { retreat, pastStep } = await seedPastStepSequence({ walkers: 1, startInDays: -10 });

			const result = await svc.runForRetreat(retreat.id, { sendNowStepIds: [pastStep.id] });

			expect(result.pastSteps).toEqual([]);
			expect(await repo().count({ where: { stepId: pastStep.id } })).toBe(0);
		});
	});
});

// Tipos de apoyo para que tsc no reclame los fixtures sin uso en producción.
export type { Retreat, MessageSequence };
