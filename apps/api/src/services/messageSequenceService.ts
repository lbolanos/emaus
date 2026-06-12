import cron from 'node-cron';
import { In, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../data-source';
import { MessageSequence } from '../entities/messageSequence.entity';
import { SequenceStep } from '../entities/sequenceStep.entity';
import { ScheduledMessage } from '../entities/scheduledMessage.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { Retreat } from '../entities/retreat.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';
import { EmailService } from './emailService';
import { makeDateInTimezone } from '../utils/date.transformer';
import { replaceAllVariables, convertHtmlToEmail } from '@repo/utils';
import { getMessageTemplateAudience } from '@repo/types';
import { savedSegmentService } from './savedSegmentService';

const DEFAULT_TZ = process.env.APP_TIMEZONE || 'America/Mexico_City';

/** Componentes calendario UTC de un Date (para fechas almacenadas a medianoche UTC). */
function ymdUtc(date: Date): { y: number; m0: number; d: number } {
	const dt = new Date(date);
	return { y: dt.getUTCFullYear(), m0: dt.getUTCMonth(), d: dt.getUTCDate() };
}

/** Componentes calendario en una timezone (para instantes reales como createdAt). */
function ymdInTz(date: Date, tz: string): { y: number; m0: number; d: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: tz,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
	}).formatToParts(new Date(date));
	const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
	return { y: get('year'), m0: get('month') - 1, d: get('day') };
}

/** Suma `delta` días a un día calendario, devolviendo el nuevo día calendario. */
function addDays(y: number, m0: number, d: number, delta: number): { y: number; m0: number; d: number } {
	const dt = new Date(Date.UTC(y, m0, d) + delta * 86400000);
	return { y: dt.getUTCFullYear(), m0: dt.getUTCMonth(), d: dt.getUTCDate() };
}

/**
 * Motor de secuencias de mensajes (drip CRM).
 *
 * - Enrola participantes elegibles de cada secuencia activa y programa cada paso
 *   (idempotente vía unique (stepId, participantId)).
 * - Procesa los mensajes vencidos: EMAIL se envía solo (desatendido) y se
 *   registra; WHATSAPP pasa a `queued` (bandeja de pendientes) para que el
 *   coordinador lo despache desde su propia cuenta.
 *
 * Reutiliza el patrón de cron de `santisimoReminderService`.
 */
export class MessageSequenceService {
	private static instance: MessageSequenceService;
	private isRunning = false;
	private emailService = new EmailService();

	public static getInstance(): MessageSequenceService {
		if (!MessageSequenceService.instance) {
			MessageSequenceService.instance = new MessageSequenceService();
		}
		return MessageSequenceService.instance;
	}

	public startScheduledTasks(): void {
		if (this.isRunning) {
			console.log('Message sequence service already running');
			return;
		}
		// Cada hora: enrolar nuevos + procesar vencidos.
		cron.schedule('0 * * * *', async () => {
			try {
				const enrolled = await this.enrollAll();
				const processed = await this.processDue();
				console.log(`⏰ Sequences: enrolled ${enrolled}, processed ${processed}`);
			} catch (err) {
				console.error('❌ Error in message sequence service:', err);
			}
		});
		this.isRunning = true;
		console.log('✅ Message sequence service scheduled tasks started');
	}

	private resolveTz(retreat: Retreat | undefined | null): string {
		return retreat?.timezone || (retreat as any)?.house?.timezone || DEFAULT_TZ;
	}

	/**
	 * Calcula el instante UTC en que debe enviarse un paso a un participante,
	 * según el trigger de la secuencia y el desfase del paso.
	 */
	public computeScheduledFor(
		trigger: MessageSequence['trigger'],
		step: Pick<SequenceStep, 'offsetDays' | 'sendHour'>,
		participant: Participant,
		retreat: Retreat,
	): Date | null {
		const tz = this.resolveTz(retreat);
		let base: { y: number; m0: number; d: number };
		let delta = 0;

		switch (trigger) {
			case 'participant_created': {
				if (!participant.registrationDate) return null;
				base = ymdInTz(participant.registrationDate, tz);
				delta = step.offsetDays; // días DESPUÉS del alta
				break;
			}
			case 'days_before_retreat': {
				if (!retreat.startDate) return null;
				base = ymdUtc(retreat.startDate);
				delta = -step.offsetDays; // días ANTES del inicio
				break;
			}
			case 'days_after_retreat': {
				if (!retreat.endDate) return null;
				base = ymdUtc(retreat.endDate);
				delta = step.offsetDays; // días DESPUÉS del fin
				break;
			}
			case 'birthday': {
				if (!participant.birthDate) return null;
				const bd = ymdUtc(participant.birthDate);
				const todayY = ymdInTz(new Date(), tz).y;
				// Próxima ocurrencia del cumpleaños (este año o el siguiente).
				let year = todayY;
				const thisYear = makeDateInTimezone(year, bd.m0, bd.d, step.sendHour, 0, tz);
				if (thisYear.getTime() < Date.now()) year += 1;
				base = { y: year, m0: bd.m0, d: bd.d };
				delta = step.offsetDays;
				break;
			}
			default:
				return null;
		}

		const shifted = addDays(base.y, base.m0, base.d, delta);
		return makeDateInTimezone(shifted.y, shifted.m0, shifted.d, step.sendHour, 0, tz);
	}

	/** Enrola participantes elegibles en todas las secuencias activas. */
	public async enrollAll(): Promise<number> {
		const sequences = await AppDataSource.getRepository(MessageSequence).find({
			where: { isActive: true },
			relations: ['steps'],
		});
		let created = 0;
		for (const seq of sequences) {
			created += await this.enrollSequence(seq);
		}
		return created;
	}

	/** Enrola los participantes elegibles de una secuencia (idempotente). */
	public async enrollSequence(seq: MessageSequence): Promise<number> {
		const steps = seq.steps?.length
			? seq.steps
			: await AppDataSource.getRepository(SequenceStep).find({ where: { sequenceId: seq.id } });
		if (!steps.length) return 0;

		const retreat = await AppDataSource.getRepository(Retreat).findOne({
			where: { id: seq.retreatId },
			relations: ['house'],
		});
		if (!retreat) return 0;

		// Participantes elegibles. Si la secuencia tiene un segmento, se evalúa en
		// vivo (audiencia dinámica). Si no, se usa la audiencia base por type. La
		// fuente per-retiro de type/isCancelled es `retreat_participants`.
		let participants: Participant[];
		if (seq.segmentId) {
			const segment = await savedSegmentService.findById(seq.segmentId);
			participants = segment
				? await savedSegmentService.evaluateFilters(seq.retreatId, segment.filters)
				: [];
		} else {
			const rpWhere: Record<string, unknown> = { retreatId: seq.retreatId, isCancelled: false };
			if (seq.audience === 'walker') rpWhere.type = 'walker';
			else if (seq.audience === 'server') rpWhere.type = In(['server', 'partial_server']);
			const rps = await AppDataSource.getRepository(RetreatParticipant).find({
				where: rpWhere,
				relations: ['participant'],
			});
			participants = rps.map((rp) => rp.participant).filter((p): p is Participant => !!p);
		}
		if (!participants.length) return 0;

		// Set de (stepId:participantId) ya programados → idempotencia.
		const existing = await AppDataSource.getRepository(ScheduledMessage).find({
			where: { sequenceId: seq.id },
			select: ['stepId', 'participantId'],
		});
		const seen = new Set(existing.map((e) => `${e.stepId}:${e.participantId}`));

		const repo = AppDataSource.getRepository(ScheduledMessage);
		const toCreate: ScheduledMessage[] = [];
		for (const participant of participants) {
			for (const step of steps) {
				const key = `${step.id}:${participant.id}`;
				if (seen.has(key)) continue;
				const scheduledFor = this.computeScheduledFor(seq.trigger, step, participant, retreat);
				if (!scheduledFor) continue;
				toCreate.push(
					repo.create({
						sequenceId: seq.id,
						stepId: step.id,
						participantId: participant.id,
						retreatId: seq.retreatId,
						channel: step.channel,
						templateType: step.templateType,
						scheduledFor,
						status: 'pending',
					}),
				);
			}
		}
		if (toCreate.length) await repo.save(toCreate);
		return toCreate.length;
	}

	/**
	 * Procesa los mensajes vencidos (status pending, scheduledFor <= now).
	 * EMAIL: envía y registra. WHATSAPP: encola para despacho asistido.
	 * @returns número de mensajes procesados (enviados o encolados).
	 */
	public async processDue(now: Date = new Date(), limit = 200): Promise<number> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const due = await repo.find({
			where: { status: 'pending', scheduledFor: LessThanOrEqual(now) },
			relations: ['participant', 'retreat', 'retreat.house'],
			take: limit,
			order: { scheduledFor: 'ASC' },
		});

		let processed = 0;
		for (const sm of due) {
			const participant = sm.participant;
			const retreat = sm.retreat;
			if (!participant || !retreat) {
				sm.status = 'skipped';
				sm.error = 'participante o retiro no encontrado';
				await repo.save(sm);
				continue;
			}

			const template = await AppDataSource.getRepository(MessageTemplate).findOne({
				where: { retreatId: sm.retreatId, type: sm.templateType as any },
			});
			if (!template) {
				sm.status = 'skipped';
				sm.error = `sin plantilla ${sm.templateType} en el retiro`;
				await repo.save(sm);
				continue;
			}

			const content = replaceAllVariables(
				template.message,
				participant as any,
				retreat as any,
			);

			if (sm.channel === 'whatsapp') {
				// No se envía solo: queda en la bandeja para despacho asistido.
				sm.status = 'queued';
				await repo.save(sm);
				processed++;
				continue;
			}

			// EMAIL desatendido.
			if (!participant.email) {
				sm.status = 'skipped';
				sm.error = 'participante sin email';
				await repo.save(sm);
				continue;
			}
			const subject = template.name || 'Mensaje';
			const html = convertHtmlToEmail(content, { format: 'enhanced' });
			const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
			try {
				const ok = await this.emailService.sendEmail({
					to: participant.email,
					subject,
					html,
					text,
				});
				if (!ok) {
					sm.status = 'failed';
					sm.error = 'envío SMTP falló';
					await repo.save(sm);
					continue;
				}
				sm.status = 'sent';
				sm.sentAt = now;
				await repo.save(sm);
				await this.recordCommunication(sm, template, participant.email, html, subject);
				processed++;
			} catch (err) {
				sm.status = 'failed';
				sm.error = err instanceof Error ? err.message : 'error desconocido';
				await repo.save(sm);
			}
		}
		return processed;
	}

	/** Registra el envío automático en participant_communications (sentBy = null). */
	private async recordCommunication(
		sm: ScheduledMessage,
		template: MessageTemplate,
		to: string,
		html: string,
		subject: string,
	): Promise<void> {
		try {
			const repo = AppDataSource.getRepository(ParticipantCommunication);
			await repo.save(
				repo.create({
					participantId: sm.participantId,
					scope: 'retreat',
					retreatId: sm.retreatId,
					messageType: 'email',
					recipientContact: to,
					recipientContactKey: 'participant:email',
					audience: getMessageTemplateAudience(template.type),
					messageContent: html,
					templateId: template.id,
					templateName: template.name,
					subject,
					sentBy: null as any, // automático
				} as any),
			);
		} catch (err) {
			console.error('[messageSequenceService] failed to record communication:', err);
		}
	}

	// ---------------------------------------------------------------------
	// Gestión (admin) — usada por el controller / UI de secuencias.
	// ---------------------------------------------------------------------

	async findByRetreat(retreatId: string): Promise<MessageSequence[]> {
		return AppDataSource.getRepository(MessageSequence).find({
			where: { retreatId },
			relations: ['steps'],
			order: { createdAt: 'DESC' },
		});
	}

	async findById(id: string): Promise<MessageSequence | null> {
		return AppDataSource.getRepository(MessageSequence).findOne({
			where: { id },
			relations: ['steps'],
		});
	}

	async createSequence(input: {
		name: string;
		description?: string | null;
		retreatId: string;
		trigger: MessageSequence['trigger'];
		audience?: MessageSequence['audience'];
		segmentId?: string | null;
		isActive?: boolean;
		createdBy?: string | null;
		steps?: Array<Omit<SequenceStep, 'id' | 'sequenceId' | 'sequence' | 'createdAt' | 'updatedAt'>>;
	}): Promise<MessageSequence> {
		const seqRepo = AppDataSource.getRepository(MessageSequence);
		const seq = await seqRepo.save(
			seqRepo.create({
				name: input.name,
				description: input.description ?? null,
				retreatId: input.retreatId,
				trigger: input.trigger,
				audience: input.audience ?? 'all',
				segmentId: input.segmentId ?? null,
				isActive: input.isActive ?? true,
				createdBy: input.createdBy ?? null,
			}),
		);
		await this.replaceSteps(seq.id, input.steps ?? []);
		return (await this.findById(seq.id))!;
	}

	async updateSequence(
		id: string,
		input: {
			name?: string;
			description?: string | null;
			trigger?: MessageSequence['trigger'];
			audience?: MessageSequence['audience'];
			segmentId?: string | null;
			isActive?: boolean;
			steps?: Array<Omit<SequenceStep, 'id' | 'sequenceId' | 'sequence' | 'createdAt' | 'updatedAt'>>;
		},
	): Promise<MessageSequence | null> {
		const seqRepo = AppDataSource.getRepository(MessageSequence);
		const seq = await seqRepo.findOne({ where: { id } });
		if (!seq) return null;
		if (input.name !== undefined) seq.name = input.name;
		if (input.description !== undefined) seq.description = input.description;
		if (input.trigger !== undefined) seq.trigger = input.trigger;
		if (input.audience !== undefined) seq.audience = input.audience;
		if (input.segmentId !== undefined) seq.segmentId = input.segmentId;
		if (input.isActive !== undefined) seq.isActive = input.isActive;
		await seqRepo.save(seq);
		if (input.steps !== undefined) {
			await this.replaceSteps(id, input.steps);
		}
		return this.findById(id);
	}

	private async replaceSteps(
		sequenceId: string,
		steps: Array<Omit<SequenceStep, 'id' | 'sequenceId' | 'sequence' | 'createdAt' | 'updatedAt'>>,
	): Promise<void> {
		const stepRepo = AppDataSource.getRepository(SequenceStep);
		await stepRepo.delete({ sequenceId });
		if (steps.length) {
			await stepRepo.save(
				steps.map((s, i) =>
					stepRepo.create({
						sequenceId,
						stepOrder: s.stepOrder ?? i,
						offsetDays: s.offsetDays ?? 0,
						sendHour: s.sendHour ?? 9,
						templateType: s.templateType,
						channel: s.channel,
					}),
				),
			);
		}
	}

	async deleteSequence(id: string): Promise<boolean> {
		const result = await AppDataSource.getRepository(MessageSequence).delete(id);
		return (result.affected ?? 0) > 0;
	}

	/** Bandeja de pendientes de WhatsApp (status queued) de un retiro. */
	async listQueued(retreatId: string): Promise<ScheduledMessage[]> {
		return AppDataSource.getRepository(ScheduledMessage).find({
			where: { retreatId, status: 'queued', channel: 'whatsapp' },
			relations: ['participant', 'step'],
			order: { scheduledFor: 'ASC' },
		});
	}

	/** Marca un pendiente de WhatsApp como despachado (el coordinador ya lo envió). */
	async markDispatched(id: string): Promise<ScheduledMessage | null> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await repo.findOne({ where: { id } });
		if (!sm) return null;
		sm.status = 'sent';
		sm.sentAt = new Date();
		return repo.save(sm);
	}
}

export const messageSequenceService = MessageSequenceService.getInstance();
