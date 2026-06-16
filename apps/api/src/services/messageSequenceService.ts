import cron from 'node-cron';
import { In, LessThanOrEqual } from 'typeorm';
import { AppDataSource } from '../data-source';
import { MessageSequence } from '../entities/messageSequence.entity';
import { SequenceStep } from '../entities/sequenceStep.entity';
import { ScheduledMessage } from '../entities/scheduledMessage.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { Responsability } from '../entities/responsability.entity';
import { Retreat } from '../entities/retreat.entity';
import type { MessageRecipientTarget, MessageChannel } from '../entities/sequenceStep.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';
import { ParticipantFollowUp } from '../entities/participantFollowUp.entity';
import { EmailService } from './emailService';
import { makeDateInTimezone } from '../utils/date.transformer';
import { replaceAllVariables, convertHtmlToEmail, type TableData } from '@repo/utils';
import { getMessageTemplateAudience } from '@repo/types';
import { savedSegmentService } from './savedSegmentService';

const DEFAULT_TZ = process.env.APP_TIMEZONE || 'America/Mexico_City';
/** Máximo de reintentos de envío de email ante fallo (SMTP transitorio). */
const MAX_ATTEMPTS = 3;

/** Paso recibido al crear/editar; `id` presente ⇒ paso existente (se conserva). */
type StepSyncInput = {
	id?: string;
	stepOrder?: number;
	offsetDays?: number;
	sendHour?: number;
	templateType: string;
	channel: MessageChannel;
	recipientTarget?: MessageRecipientTarget;
	recipientResponsibility?: string | null;
	condition?: Record<string, unknown> | null;
};

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
		} else if (seq.audience === 'table_leaders') {
			participants = await this.getTableLeaders(seq.retreatId);
		} else if (seq.audience === 'responsables') {
			participants = await this.getResponsibleParticipants(seq.retreatId);
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
		// Opt-out: nunca enrolar a quien está en la lista de no-contacto.
		participants = participants.filter((p) => !p.doNotContact);
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
						recipientTarget: step.recipientTarget ?? "participant",
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
	/**
	 * Resuelve el destinatario de un envío. Para `participant`/`emergencyContact*`
	 * usa los datos del propio participante. Para `inviter`/`responsibility` busca
	 * a OTRA persona del retiro (el servidor invitador o el titular de una
	 * responsabilidad) y devuelve SU contacto, dejando las variables
	 * `{participant.*}` apuntando al participante enrolado (contactKey undefined).
	 */
	private async resolveRecipient(
		participant: Participant,
		target: MessageRecipientTarget,
		retreatId: string,
		recipientResponsibility?: string | null,
	): Promise<{ email?: string | null; phone?: string | null; name: string; contactKey?: string }> {
		if (target === 'emergencyContact1') {
			return {
				email: participant.emergencyContact1Email,
				phone: participant.emergencyContact1CellPhone,
				name: participant.emergencyContact1Name || '',
				contactKey: 'emergencyContact1',
			};
		}
		if (target === 'emergencyContact2') {
			return {
				email: participant.emergencyContact2Email,
				phone: participant.emergencyContact2CellPhone,
				name: participant.emergencyContact2Name || '',
				contactKey: 'emergencyContact2',
			};
		}
		if (target === 'inviter') {
			// El contacto del invitador vive en el propio participante.
			const email = participant.inviterEmail || null;
			let phone =
				participant.inviterCellPhone ||
				participant.inviterHomePhone ||
				participant.inviterWorkPhone ||
				null;
			// Si no hay teléfono pero sí email, ubicar al servidor por ese email.
			if (!phone && email) {
				const byEmail = await AppDataSource.getRepository(Participant).findOne({ where: { email } });
				phone = byEmail?.cellPhone || null;
			}
			return {
				email,
				phone,
				name: participant.invitedBy || '', // nickname del invitador
				contactKey: 'inviter', // {participant.recipientName}/{participant.inviter*} → invitador
			};
		}
		if (target === 'tableLeader') {
			const leader = await this.getParticipantTableLeader(participant.id, retreatId);
			return {
				email: leader?.email,
				phone: this.pickPhone(leader),
				name: leader ? `${leader.firstName || ''} ${leader.lastName || ''}`.trim() : '',
				contactKey: undefined,
			};
		}
		if (target === 'responsibility') {
			const holder = recipientResponsibility
				? await this.getResponsibilityHolder(retreatId, recipientResponsibility)
				: null;
			return {
				email: holder?.email,
				phone: this.pickPhone(holder),
				name: holder ? `${holder.firstName || ''} ${holder.lastName || ''}`.trim() : '',
				contactKey: undefined,
			};
		}
		return {
			email: participant.email,
			phone: this.pickPhone(participant),
			name: `${participant.firstName || ''} ${participant.lastName || ''}`.trim(),
			contactKey: undefined,
		};
	}

	/** Teléfono de un participante con fallback celular → casa → trabajo. */
	private pickPhone(p?: Participant | null): string | null {
		return p?.cellPhone || p?.homePhone || p?.workPhone || null;
	}

	/** Motivo legible cuando el destinatario indirecto no existe para el participante. */
	private missingRecipientReason(target: MessageRecipientTarget): string {
		switch (target) {
			case 'inviter':
				return 'el caminante no registró invitador';
			case 'tableLeader':
				return 'sin líder/colíder de mesa asignado';
			case 'responsibility':
				return 'sin titular para la responsabilidad';
			case 'emergencyContact1':
				return 'sin contacto de emergencia 1';
			case 'emergencyContact2':
				return 'sin contacto de emergencia 2';
			default:
				return 'destinatario no disponible';
		}
	}

	/** Líder (o colíder) de la mesa a la que está asignado el participante enrolado. */
	private async getParticipantTableLeader(
		participantId: string,
		retreatId: string,
	): Promise<Participant | null> {
		const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId, retreatId },
		});
		if (!rp?.tableId) return null;
		const table = await AppDataSource.getRepository(TableMesa).findOne({ where: { id: rp.tableId } });
		const leaderId = table?.liderId || table?.colider1Id || table?.colider2Id;
		if (!leaderId) return null;
		return AppDataSource.getRepository(Participant).findOne({ where: { id: leaderId } });
	}

	/**
	 * Arma el contexto `table.*` para un líder/colíder: su mesa + roster de
	 * caminantes (con teléfonos y contactos de emergencia), para resolver las
	 * variables del briefing (`{table.name}`, `{table.walkersRoster}`, etc.).
	 * Devuelve null si el participante no lidera ninguna mesa.
	 */
	private async buildTableData(leaderId: string, retreatId: string): Promise<TableData | null> {
		const table = await AppDataSource.getRepository(TableMesa).findOne({
			where: [
				{ retreatId, liderId: leaderId },
				{ retreatId, colider1Id: leaderId },
				{ retreatId, colider2Id: leaderId },
			],
		});
		if (!table) return null;
		const pRepo = AppDataSource.getRepository(Participant);
		const nameOf = async (id?: string | null): Promise<string> => {
			if (!id) return '';
			const p = await pRepo.findOne({ where: { id } });
			return p ? `${p.firstName || ''} ${p.lastName || ''}`.trim() : '';
		};
		const rps = await AppDataSource.getRepository(RetreatParticipant).find({
			where: { retreatId, tableId: table.id },
		});
		const walkerIds = rps
			.filter((rp) => (rp.type || '') === 'walker')
			.map((rp) => rp.participantId);
		const walkerParts = walkerIds.length ? await pRepo.findBy({ id: In(walkerIds) }) : [];
		const walkers = walkerParts.map((p) => ({
			firstName: p.firstName,
			lastName: p.lastName,
			nickname: p.nickname,
			cellPhone: p.cellPhone,
			homePhone: p.homePhone,
			workPhone: p.workPhone,
			emergencyContact1Name: p.emergencyContact1Name,
			emergencyContact1Relation: p.emergencyContact1Relation,
			emergencyContact1CellPhone: p.emergencyContact1CellPhone,
			emergencyContact1HomePhone: p.emergencyContact1HomePhone,
			emergencyContact1WorkPhone: p.emergencyContact1WorkPhone,
			emergencyContact2Name: p.emergencyContact2Name,
			emergencyContact2Relation: p.emergencyContact2Relation,
			emergencyContact2CellPhone: p.emergencyContact2CellPhone,
			emergencyContact2HomePhone: p.emergencyContact2HomePhone,
			emergencyContact2WorkPhone: p.emergencyContact2WorkPhone,
		}));
		return {
			name: table.name,
			liderName: await nameOf(table.liderId),
			colider1Name: await nameOf(table.colider1Id),
			colider2Name: await nameOf(table.colider2Id),
			walkers,
		};
	}

	/**
	 * Resuelve el contenido de una plantilla reemplazando variables. Si la
	 * plantilla usa `{table.*}` (p. ej. el briefing de mesa), arma ese contexto
	 * para el participante (líder).
	 */
	private async resolveContent(
		message: string,
		participant: Participant,
		retreat: Retreat,
		contactKey: string | undefined,
		retreatId: string,
		escapeHtmlValues = false,
	): Promise<string> {
		const tableData = message.includes('{table.')
			? await this.buildTableData(participant.id, retreatId)
			: null;
		return replaceAllVariables(
			message,
			participant as any,
			retreat as any,
			contactKey,
			null,
			tableData,
			escapeHtmlValues,
		);
	}

	/** Titular (asignado) de una responsabilidad del retiro, por nombre. */
	private async getResponsibilityHolder(
		retreatId: string,
		name: string,
	): Promise<Participant | null> {
		const resp = await AppDataSource.getRepository(Responsability).findOne({
			where: { retreatId, name },
			relations: ['participant'],
			order: { priority: 'ASC' },
		});
		return resp?.participant ?? null;
	}

	/** Participantes que tienen asignada alguna responsabilidad del retiro (distintos). */
	private async getResponsibleParticipants(retreatId: string): Promise<Participant[]> {
		const resps = await AppDataSource.getRepository(Responsability).find({
			where: { retreatId },
			relations: ['participant'],
		});
		const byId = new Map<string, Participant>();
		for (const r of resps) {
			if (r.participant) byId.set(r.participant.id, r.participant);
		}
		return [...byId.values()];
	}

	/** Servidores asignados como líder/colíder de alguna mesa del retiro. */
	private async getTableLeaders(retreatId: string): Promise<Participant[]> {
		const tables = await AppDataSource.getRepository(TableMesa).find({ where: { retreatId } });
		const ids = new Set<string>();
		for (const t of tables) {
			if (t.liderId) ids.add(t.liderId);
			if (t.colider1Id) ids.add(t.colider1Id);
			if (t.colider2Id) ids.add(t.colider2Id);
		}
		if (!ids.size) return [];
		return AppDataSource.getRepository(Participant).find({ where: { id: In([...ids]) } });
	}

	/**
	 * Procesa los mensajes vencidos (status pending, scheduledFor <= now).
	 * EMAIL: envía y registra. WHATSAPP: encola para despacho asistido.
	 * El destinatario puede ser el participante o un contacto de emergencia.
	 * @returns número de mensajes procesados (enviados o encolados).
	 */
	/**
	 * Procesa los mensajes vencidos de secuencias ACTIVAS (status pending, o failed
	 * con reintentos disponibles, y scheduledFor <= now).
	 *  - Salta participantes cancelados (status cancelled).
	 *  - EMAIL: envía y registra; ante fallo SMTP reintenta hasta MAX_ATTEMPTS.
	 *  - WHATSAPP: encola (con snapshot del mensaje resuelto) para despacho asistido.
	 * @returns número de mensajes procesados (enviados o encolados).
	 */
	public async processDue(
		now: Date = new Date(),
		limit = Number(process.env.SEQUENCE_PROCESS_LIMIT) || 200,
		retreatId?: string,
	): Promise<number> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		// Solo de secuencias activas; pendientes o fallidos con reintentos restantes.
		const dueQb = repo
			.createQueryBuilder('sm')
			.leftJoinAndSelect('sm.participant', 'participant')
			.leftJoinAndSelect('sm.retreat', 'retreat')
			.leftJoinAndSelect('retreat.house', 'house')
			.leftJoinAndSelect('sm.step', 'step')
			.innerJoinAndSelect('sm.sequence', 'seq')
			.where('sm.scheduledFor <= :now', { now })
			.andWhere('seq.isActive = :active', { active: true })
			.andWhere("(sm.status = 'pending' OR (sm.status = 'failed' AND sm.attempts < :max))", {
				max: MAX_ATTEMPTS,
			});
		// Scope opcional por retiro: el disparo manual (runNow) solo debe procesar su
		// propio retiro; el cron horario lo llama sin filtro (global del sistema).
		if (retreatId) {
			dueQb.andWhere('sm.retreatId = :retreatId', { retreatId });
		}
		const due = await dueQb.orderBy('sm.scheduledFor', 'ASC').take(limit).getMany();

		// Tope diario por participante (0 = desactivado). Cuenta los ya enviados/encolados
		// hoy para no exceder el límite; los excedentes se posponen (quedan pending).
		const maxPerDay = Number(process.env.SEQUENCE_MAX_PER_PARTICIPANT_PER_DAY) || 0;
		const sentToday = new Map<string, number>();
		if (maxPerDay > 0) {
			const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
			const rows = await repo
				.createQueryBuilder('sm')
				.select('sm.participantId', 'pid')
				.addSelect('COUNT(*)', 'c')
				.where("sm.status IN ('sent','queued')")
				.andWhere('sm.updatedAt >= :start', { start: startOfDay })
				.groupBy('sm.participantId')
				.getRawMany();
			for (const r of rows) sentToday.set(r.pid, Number(r.c));
		}
		// Cache de evaluación de condiciones por (retiro + filtros) dentro de la corrida.
		const conditionCache = new Map<string, Set<string>>();

		let processed = 0;
		for (const sm of due) {
			// Claim atómico: marca la fila como 'processing' solo si sigue en el estado
			// con que la leímos. Si otra corrida concurrente (cron, runNow, o el
			// fire-and-forget del alta) ya la tomó, affected=0 → la saltamos. Evita el
			// doble envío del mismo mensaje a un participante.
			const claim = await repo.update(
				{ id: sm.id, status: sm.status },
				{ status: 'processing' },
			);
			if (!claim.affected) continue;

			const participant = sm.participant;
			const retreat = sm.retreat;
			if (!participant || !retreat) {
				sm.status = 'skipped';
				sm.error = 'participante o retiro no encontrado';
				await repo.save(sm);
				continue;
			}

			// Opt-out: lista de no-contacto.
			if (participant.doNotContact) {
				sm.status = 'skipped';
				sm.error = 'participante en lista de no-contacto';
				await repo.save(sm);
				continue;
			}

			// No enviar a participantes cancelados del retiro.
			const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
				where: { participantId: participant.id, retreatId: sm.retreatId },
			});
			if (rp?.isCancelled) {
				sm.status = 'cancelled';
				sm.error = 'participante cancelado';
				await repo.save(sm);
				continue;
			}

			// Ventana de gracia: no enviar un paso vencido hace más de N días.
			const seq = sm.sequence;
			if (seq?.maxOverdueDays != null) {
				const overdueDays = (now.getTime() - new Date(sm.scheduledFor).getTime()) / 86400000;
				if (overdueDays > seq.maxOverdueDays) {
					sm.status = 'skipped';
					sm.error = `vencido hace más de ${seq.maxOverdueDays} día(s)`;
					await repo.save(sm);
					continue;
				}
			}

			// Parar al responder: declinó → no enviar; confirmó → parar si la secuencia lo pide.
			// Freno global: si el coordinador marcó "declinó" en el seguimiento, no
			// se le envía nada. (Parar al CONFIRMAR no es un freno global: se modela
			// como condición de paso `attendanceFilter='pending'` sobre la
			// confirmación de asistencia real — ver resolveRecipient/condición.)
			const followUp = await AppDataSource.getRepository(ParticipantFollowUp).findOne({
				where: { participantId: participant.id, retreatId: sm.retreatId },
			});
			if (followUp?.status === 'declined') {
				sm.status = 'skipped';
				sm.error = 'participante declinó (seguimiento)';
				await repo.save(sm);
				continue;
			}

			// Condición del paso: el participante debe cumplir los filtros.
			const condition = sm.step?.condition;
			if (condition && Object.keys(condition).length > 0) {
				const key = `${sm.retreatId}:${JSON.stringify(condition)}`;
				let allowed = conditionCache.get(key);
				if (!allowed) {
					const matches = await savedSegmentService.evaluateFilters(sm.retreatId, condition as any);
					allowed = new Set(matches.map((p) => p.id));
					conditionCache.set(key, allowed);
				}
				if (!allowed.has(participant.id)) {
					sm.status = 'skipped';
					sm.error = 'no cumple la condición del paso';
					await repo.save(sm);
					continue;
				}
			}

			// Tope diario por participante: posponer (no marcar) si ya alcanzó el límite.
			if (maxPerDay > 0 && (sentToday.get(participant.id) ?? 0) >= maxPerDay) {
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

			const target = (sm.recipientTarget || 'participant') as MessageRecipientTarget;
			const recipient = await this.resolveRecipient(
				participant,
				target,
				sm.retreatId,
				sm.step?.recipientResponsibility,
			);
			// Si el destinatario indirecto (invitador/líder/responsable) NO EXISTE
			// (sin nombre ni contacto), no es un error a corregir: el caminante
			// simplemente no tiene ese vínculo. Se cancela en silencio (fuera de la
			// lista de "Problemas"), con motivo claro para auditoría.
			if (
				target !== 'participant' &&
				!recipient.name &&
				!recipient.phone &&
				!recipient.email
			) {
				sm.status = 'cancelled';
				sm.error = this.missingRecipientReason(target);
				await repo.save(sm);
				continue;
			}
			const content = await this.resolveContent(
				template.message,
				participant,
				retreat,
				recipient.contactKey,
				sm.retreatId,
			);

			if (sm.channel === 'whatsapp') {
				if (!recipient.phone) {
					sm.status = 'skipped';
					sm.error = 'destinatario sin teléfono';
					await repo.save(sm);
					continue;
				}
				// Snapshot del envío para la bandeja (no recalcula variables al despachar).
				sm.status = 'queued';
				sm.resolvedContent = content;
				sm.resolvedContact = recipient.phone;
				sm.recipientName = recipient.name;
				await repo.save(sm);
				sentToday.set(participant.id, (sentToday.get(participant.id) ?? 0) + 1);
				processed++;
				continue;
			}

			// EMAIL desatendido.
			if (!recipient.email) {
				sm.status = 'skipped';
				sm.error = 'destinatario sin email';
				await repo.save(sm);
				continue;
			}
			const subject = template.name || 'Mensaje';
			// HTML del email: re-resuelve escapando los valores de las variables
			// (anti-inyección de HTML vía datos del participante). El `text` plano usa
			// el `content` sin escapar para no mostrar entidades (&amp;) al destinatario.
			const htmlContent = await this.resolveContent(
				template.message,
				participant,
				retreat,
				recipient.contactKey,
				sm.retreatId,
				true,
			);
			const html = convertHtmlToEmail(htmlContent, { format: 'enhanced' });
			const text = content.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
			try {
				const ok = await this.emailService.sendEmail({ to: recipient.email, subject, html, text });
				if (!ok) {
					sm.attempts += 1;
					sm.status = 'failed';
					sm.error = 'envío SMTP falló';
					await repo.save(sm);
					continue;
				}
				sm.status = 'sent';
				sm.sentAt = now;
				sm.resolvedContent = html;
				sm.resolvedContact = recipient.email;
				sm.recipientName = recipient.name;
				await repo.save(sm);
				await this.recordCommunication(sm, template, recipient, html, subject);
				sentToday.set(participant.id, (sentToday.get(participant.id) ?? 0) + 1);
				processed++;
			} catch (err) {
				sm.attempts += 1;
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
		recipient: { email?: string | null; name: string; contactKey?: string },
		html: string,
		subject: string,
	): Promise<void> {
		try {
			const repo = AppDataSource.getRepository(ParticipantCommunication);
			const contactKey = recipient.contactKey ? `${recipient.contactKey}:email` : 'participant:email';
			await repo.save(
				repo.create({
					participantId: sm.participantId,
					scope: 'retreat',
					retreatId: sm.retreatId,
					messageType: 'email',
					recipientContact: recipient.email || '',
					recipientContactKey: contactKey,
					recipientName: recipient.name || null,
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
		maxOverdueDays?: number | null;
		createdBy?: string | null;
		steps?: StepSyncInput[];
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
				maxOverdueDays: input.maxOverdueDays ?? null,
				createdBy: input.createdBy ?? null,
			}),
		);
		await this.syncSteps(seq.id, input.steps ?? []);
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
			maxOverdueDays?: number | null;
			steps?: StepSyncInput[];
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
		if (input.maxOverdueDays !== undefined) seq.maxOverdueDays = input.maxOverdueDays;
		await seqRepo.save(seq);
		if (input.steps !== undefined) {
			await this.syncSteps(id, input.steps);
		}
		return this.findById(id);
	}

	/**
	 * Sincroniza los pasos de una secuencia preservando la identidad de los
	 * existentes (los que llegan con `id`): así NO cambia el `stepId` y la
	 * idempotencia (stepId, participantId) se mantiene — editar no re-envía a
	 * quien ya recibió. Los pasos quitados se borran (cascade cancela sus
	 * scheduled_messages pendientes).
	 */
	private async syncSteps(sequenceId: string, steps: StepSyncInput[]): Promise<void> {
		const stepRepo = AppDataSource.getRepository(SequenceStep);
		const existing = await stepRepo.find({ where: { sequenceId } });
		const keep = new Set<string>();
		for (let i = 0; i < steps.length; i++) {
			const s = steps[i];
			const data = {
				stepOrder: s.stepOrder ?? i,
				offsetDays: s.offsetDays ?? 0,
				sendHour: s.sendHour ?? 9,
				templateType: s.templateType,
				channel: s.channel,
				recipientTarget: s.recipientTarget ?? 'participant',
				recipientResponsibility: s.recipientResponsibility ?? null,
				condition: (s.condition ?? null) as any,
			};
			const current = s.id ? existing.find((e) => e.id === s.id) : undefined;
			if (current) {
				keep.add(current.id);
				await stepRepo.update(current.id, data);
			} else {
				const created = await stepRepo.save(stepRepo.create({ sequenceId, ...data }));
				keep.add(created.id);
			}
		}
		const remove = existing.filter((e) => !keep.has(e.id));
		if (remove.length) await stepRepo.remove(remove);
	}

	async deleteSequence(id: string): Promise<boolean> {
		const result = await AppDataSource.getRepository(MessageSequence).delete(id);
		return (result.affected ?? 0) > 0;
	}

	/**
	 * Bandeja de pendientes de WhatsApp (status queued) de un retiro. Cada ítem se
	 * enriquece con `followUpStatus` (estado de seguimiento del participante) para
	 * dar contexto al coordinador antes de enviar.
	 */
	async listQueued(
		retreatId: string,
	): Promise<Array<ScheduledMessage & { followUpStatus?: string | null }>> {
		const items = await AppDataSource.getRepository(ScheduledMessage).find({
			where: { retreatId, status: 'queued', channel: 'whatsapp' },
			relations: ['participant', 'step'],
			order: { scheduledFor: 'ASC' },
		});
		if (!items.length) return items;
		const followUps = await AppDataSource.getRepository(ParticipantFollowUp).find({
			where: { retreatId },
		});
		const statusByParticipant = new Map(followUps.map((f) => [f.participantId, f.status]));
		return items.map((it) =>
			Object.assign(it, { followUpStatus: statusByParticipant.get(it.participantId) ?? null }),
		);
	}

	/**
	 * Detalle del participante de un pendiente de la bandeja, para que el
	 * coordinador decida si enviar u omitir con todo el contexto a la vista:
	 * notas, cartas/palancas recibidas, estado de seguimiento (+ nota) y las
	 * últimas comunicaciones que se le enviaron. Las notas/palancas se toman de
	 * `retreat_participants` (fuente per-retiro), con fallback al participante.
	 */
	async getQueueItemDetail(id: string): Promise<{
		message: {
			id: string;
			templateType: string;
			recipientTarget: string;
			recipientName: string | null;
			resolvedContent: string | null;
			scheduledFor: Date;
			status: string;
			retreatId: string;
		};
		participant: {
			id: string;
			firstName: string;
			lastName: string;
			notes: string | null;
			doNotContact: boolean;
		};
		palancas: {
			requested: boolean | null;
			received: string | null;
			notes: string | null;
			coordinator: string | null;
		};
		followUp: { status: string; note: string | null } | null;
		communications: Array<{
			id: string;
			messageType: string;
			templateName: string | null;
			subject: string | null;
			recipientName: string | null;
			sentAt: Date;
		}>;
	} | null> {
		const sm = await AppDataSource.getRepository(ScheduledMessage).findOne({
			where: { id },
			relations: ['participant', 'retreat', 'step'],
		});
		if (!sm || !sm.participant) return null;
		const p = sm.participant;

		// Vista previa: usa el snapshot si existe; si no (pendientes encolados antes
		// de tener snapshot), la resuelve al vuelo desde la plantilla del retiro.
		let preview = sm.resolvedContent ?? null;
		if (!preview && sm.retreat) {
			const template = await AppDataSource.getRepository(MessageTemplate).findOne({
				where: { retreatId: sm.retreatId, type: sm.templateType as any },
			});
			if (template) {
				const recipient = await this.resolveRecipient(
					p,
					(sm.recipientTarget || 'participant') as MessageRecipientTarget,
					sm.retreatId,
					sm.step?.recipientResponsibility,
				);
				preview = replaceAllVariables(
					template.message,
					p as any,
					sm.retreat as any,
					recipient.contactKey,
				);
			}
		}

		const rp = await AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId: p.id, retreatId: sm.retreatId },
		});
		const followUp = await AppDataSource.getRepository(ParticipantFollowUp).findOne({
			where: { participantId: p.id, retreatId: sm.retreatId },
		});
		const comms = await AppDataSource.getRepository(ParticipantCommunication).find({
			where: { participantId: p.id, retreatId: sm.retreatId },
			order: { sentAt: 'DESC' },
			take: 10,
		});

		return {
			message: {
				id: sm.id,
				templateType: sm.templateType,
				recipientTarget: sm.recipientTarget || 'participant',
				recipientName: sm.recipientName ?? null,
				resolvedContent: preview,
				scheduledFor: sm.scheduledFor,
				status: sm.status,
				retreatId: sm.retreatId,
			},
			participant: {
				id: p.id,
				firstName: p.firstName,
				lastName: p.lastName,
				notes: rp?.notes ?? p.notes ?? null,
				doNotContact: !!p.doNotContact,
			},
			palancas: {
				requested: rp?.palancasRequested ?? null,
				received: rp?.palancasReceived ?? null,
				notes: rp?.palancasNotes ?? null,
				coordinator: rp?.palancasCoordinator ?? null,
			},
			followUp: followUp ? { status: followUp.status, note: followUp.note ?? null } : null,
			communications: comms.map((c) => ({
				id: c.id,
				messageType: c.messageType,
				templateName: c.templateName ?? null,
				subject: c.subject ?? null,
				recipientName: c.recipientName ?? null,
				sentAt: c.sentAt,
			})),
		};
	}

	/** Marca un pendiente de WhatsApp como despachado (el coordinador YA lo envió). */
	async markDispatched(id: string, userId?: string | null): Promise<ScheduledMessage | null> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await repo.findOne({ where: { id } });
		if (!sm) return null;
		sm.status = 'sent';
		sm.sentAt = new Date();
		sm.dispatchedBy = userId ?? null;
		return repo.save(sm);
	}

	/**
	 * Registra que el coordinador ABRIÓ el deep-link (≠ enviado). No cambia el
	 * status: el pendiente sigue en la bandeja hasta confirmarse el envío real.
	 */
	async markOpened(id: string): Promise<ScheduledMessage | null> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await repo.findOne({ where: { id } });
		if (!sm) return null;
		sm.openedAt = new Date();
		return repo.save(sm);
	}

	/** Asigna (o reasigna) el pendiente a un coordinador responsable de enviarlo. */
	/** Carga un mensaje programado sin mutarlo (para validar acceso antes de actuar). */
	async getScheduledById(id: string): Promise<ScheduledMessage | null> {
		return AppDataSource.getRepository(ScheduledMessage).findOne({ where: { id } });
	}

	async assign(id: string, userId: string | null): Promise<ScheduledMessage | null> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await repo.findOne({ where: { id } });
		if (!sm) return null;
		sm.assignedTo = userId;
		return repo.save(sm);
	}

	/** Omite un pendiente (no se enviará): el coordinador decidió saltarlo. */
	async markSkipped(id: string, userId?: string | null): Promise<ScheduledMessage | null> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await repo.findOne({ where: { id } });
		if (!sm) return null;
		sm.status = 'skipped';
		sm.error = 'omitido manualmente';
		sm.dispatchedBy = userId ?? null;
		return repo.save(sm);
	}

	/**
	 * Re-encola un mensaje (típicamente uno `failed`) para que vuelva a intentarse:
	 * resetea los reintentos y lo marca `pending` con vencimiento ahora. El próximo
	 * ciclo del cron (o "Procesar ahora") lo procesará. Útil tras corregir el dato
	 * que lo hizo fallar (email/teléfono faltante, SMTP, etc.).
	 */
	async retryScheduled(id: string, userId?: string | null): Promise<ScheduledMessage | null> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await repo.findOne({ where: { id } });
		if (!sm) return null;
		sm.status = 'pending';
		sm.attempts = 0;
		sm.error = null;
		sm.scheduledFor = new Date();
		sm.dispatchedBy = userId ?? null;
		return repo.save(sm);
	}

	/**
	 * Descarta un mensaje con problema: lo saca de la lista de problemas
	 * (estado `cancelled`) sin enviarlo y sin que el cron lo reintente ni reaparezca.
	 * Deja registro para auditoría.
	 */
	async discardScheduled(id: string, userId?: string | null): Promise<ScheduledMessage | null> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const sm = await repo.findOne({ where: { id } });
		if (!sm) return null;
		sm.status = 'cancelled';
		sm.error = 'descartado por el coordinador';
		sm.dispatchedBy = userId ?? null;
		return repo.save(sm);
	}

	/**
	 * Acción masiva sobre los mensajes con problema (failed/skipped) de un retiro:
	 *  - 'retry'   → los re-encola (pending, attempts=0, vencimiento ahora).
	 *  - 'discard' → los descarta (cancelled): salen de la lista y no reaparecen.
	 * Un solo UPDATE (eficiente para cientos de filas). Devuelve cuántos afectó.
	 */
	async bulkResolveIssues(retreatId: string, action: 'retry' | 'discard'): Promise<number> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const affected = await repo
			.createQueryBuilder('sm')
			.where('sm.retreatId = :retreatId', { retreatId })
			.andWhere("sm.status IN ('failed','skipped')")
			.getCount();
		if (affected === 0) return 0;
		const set =
			action === 'retry'
				? `status = 'pending', attempts = 0, error = NULL, scheduledFor = datetime('now')`
				: `status = 'cancelled', error = 'descartado (masivo)'`;
		await repo.query(
			`UPDATE scheduled_messages SET ${set}
			 WHERE retreatId = ? AND status IN ('failed', 'skipped')`,
			[retreatId],
		);
		return affected;
	}

	/**
	 * Re-resuelve el contenido de los mensajes de WhatsApp ya `queued` de un retiro
	 * contra la plantilla VIGENTE (snapshot `resolvedContent`/`resolvedContact`/
	 * `recipientName`). Útil tras editar una plantilla: la bandeja muestra el
	 * snapshot congelado al encolar, así que esto lo "renueva" sin cambiar su
	 * programación ni re-enrolar. Devuelve cuántos se regeneraron.
	 */
	async regenerateQueuedForRetreat(retreatId: string): Promise<number> {
		const repo = AppDataSource.getRepository(ScheduledMessage);
		const queued = await repo
			.createQueryBuilder('sm')
			.leftJoinAndSelect('sm.participant', 'participant')
			.leftJoinAndSelect('sm.retreat', 'retreat')
			.leftJoinAndSelect('sm.step', 'step')
			.where('sm.retreatId = :retreatId', { retreatId })
			.andWhere("sm.status = 'queued'")
			.andWhere("sm.channel = 'whatsapp'")
			.getMany();

		let regenerated = 0;
		for (const sm of queued) {
			const participant = sm.participant;
			const retreat = sm.retreat;
			if (!participant || !retreat) continue;
			const template = await AppDataSource.getRepository(MessageTemplate).findOne({
				where: { retreatId, type: sm.templateType as any },
			});
			if (!template) continue;
			const target = (sm.recipientTarget || 'participant') as MessageRecipientTarget;
			const recipient = await this.resolveRecipient(
				participant,
				target,
				retreatId,
				sm.step?.recipientResponsibility,
			);
			if (!recipient.phone) continue;
			sm.resolvedContent = await this.resolveContent(
				template.message,
				participant,
				retreat,
				recipient.contactKey,
				retreatId,
			);
			sm.resolvedContact = recipient.phone;
			sm.recipientName = recipient.name;
			await repo.save(sm);
			regenerated++;
		}
		return regenerated;
	}

	/**
	 * Observabilidad: conteo de mensajes por secuencia y estado
	 * (sent/queued/skipped/failed/cancelled/pending) para el retiro.
	 * → { [sequenceId]: { [status]: count } }
	 */
	async getStatsByRetreat(retreatId: string): Promise<Record<string, Record<string, number>>> {
		const rows = await AppDataSource.getRepository(ScheduledMessage)
			.createQueryBuilder('sm')
			.select('sm.sequenceId', 'sequenceId')
			.addSelect('sm.status', 'status')
			.addSelect('COUNT(*)', 'count')
			.where('sm.retreatId = :retreatId', { retreatId })
			.groupBy('sm.sequenceId')
			.addGroupBy('sm.status')
			.getRawMany();
		const out: Record<string, Record<string, number>> = {};
		for (const r of rows) {
			(out[r.sequenceId] ||= {})[r.status] = Number(r.count);
		}
		return out;
	}

	/**
	 * Mensajes con problema (omitidos o fallidos) del retiro, con el participante
	 * y el motivo (`error`), para que el coordinador sepa qué no salió y por qué.
	 */
	async getIssuesByRetreat(retreatId: string, limit = 100): Promise<ScheduledMessage[]> {
		return AppDataSource.getRepository(ScheduledMessage).find({
			where: [
				{ retreatId, status: 'skipped' },
				{ retreatId, status: 'failed' },
			],
			relations: ['participant'],
			order: { updatedAt: 'DESC' },
			take: limit,
		});
	}

	/**
	 * Enrola + procesa AHORA las secuencias activas de un retiro. Se usa tras dar
	 * de alta a un participante para que los pasos `participant_created` offset-0
	 * (bienvenida, privacidad, aviso al palanquero) salgan al momento, sin esperar
	 * al cron horario.
	 */
	async runForRetreat(retreatId: string): Promise<{ enrolled: number; processed: number }> {
		const sequences = await this.findByRetreat(retreatId);
		let enrolled = 0;
		for (const seq of sequences) {
			if (seq.isActive) enrolled += await this.enrollSequence(seq);
		}
		// Scopeado a este retiro: el alta de un participante no debe disparar envíos
		// de otros retiros.
		const processed = await this.processDue(new Date(), undefined, retreatId);
		return { enrolled, processed };
	}

	/**
	 * Siembra las secuencias de "registro" de un retiro (las que reemplazan los
	 * envíos automáticos del alta). Idempotente por nombre. Respeta los flags del
	 * retiro: `notifyParticipant`/`notifyInviter` (false ⇒ se crean inactivas).
	 */
	async createDefaultMessageSequencesForRetreat(retreat: {
		id: string;
		notifyParticipant?: boolean | null;
		notifyInviter?: boolean | null;
		notifyPalanqueros?: number[] | null;
	}): Promise<void> {
		const notifyParticipant = retreat.notifyParticipant !== false;
		const notifyInviter = retreat.notifyInviter !== false;
		const palanqueroActive = (retreat.notifyPalanqueros?.length ?? 0) > 0;
		const defs: Array<{
			name: string;
			audience: MessageSequence['audience'];
			isActive: boolean;
			steps: StepSyncInput[];
		}> = [
			{
				name: 'Bienvenida al caminante',
				audience: 'walker',
				isActive: notifyParticipant,
				steps: [
					{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'WALKER_WELCOME', channel: 'email' },
				],
			},
			{
				name: 'Bienvenida al servidor',
				audience: 'server',
				isActive: notifyParticipant,
				steps: [
					{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'SERVER_WELCOME', channel: 'email' },
				],
			},
			{
				name: 'Aviso de privacidad',
				audience: 'all',
				isActive: notifyParticipant,
				steps: [
					{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'PRIVACY_DATA_DELETE', channel: 'email' },
				],
			},
			{
				// Aviso al INVITADOR personal del caminante (servidor en invitedBy).
				name: 'Aviso al invitador (nuevo caminante)',
				audience: 'walker',
				isActive: notifyInviter,
				steps: [
					{ stepOrder: 0, offsetDays: 0, sendHour: 9, templateType: 'GENERAL', channel: 'email', recipientTarget: 'inviter' },
				],
			},
			{
				// Aviso a los PALANQUEROS (responsabilidad "Palanquero 1/2/3"): un paso
				// por palanquero; el que no tenga titular se omite al procesar.
				name: 'Aviso al palanquero (nuevo caminante)',
				audience: 'walker',
				isActive: palanqueroActive,
				steps: [1, 2, 3].map((n, i) => ({
					stepOrder: i,
					offsetDays: 0,
					sendHour: 9,
					templateType: 'PALANQUERO_NEW_WALKER',
					channel: 'email' as const,
					recipientTarget: 'responsibility' as const,
					recipientResponsibility: `Palanquero ${n}`,
				})),
			},
		];

		const existing = await AppDataSource.getRepository(MessageSequence).find({
			where: { retreatId: retreat.id },
			select: ['name'],
		});
		const have = new Set(existing.map((e) => e.name));
		for (const d of defs) {
			if (have.has(d.name)) continue;
			await this.createSequence({
				name: d.name,
				retreatId: retreat.id,
				trigger: 'participant_created',
				audience: d.audience,
				isActive: d.isActive,
				steps: d.steps,
			});
		}
	}
}

export const messageSequenceService = MessageSequenceService.getInstance();
