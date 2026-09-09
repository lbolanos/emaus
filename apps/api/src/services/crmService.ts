import { EntityManager } from 'typeorm';
import { AppDataSource } from '../data-source';
import { ParticipantFollowUp, FollowUpStatus } from '../entities/participantFollowUp.entity';
import { CrmTask } from '../entities/crmTask.entity';
import { Participant } from '../entities/participant.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import {
	ParticipantNote,
	ParticipantNoteMetadata,
} from '../entities/participantNote.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';
import { ScheduledMessage } from '../entities/scheduledMessage.entity';
import { Payment } from '../entities/payment.entity';
import { Retreat } from '../entities/retreat.entity';
import { resolvePalancas, effectiveMinPalancas } from '@repo/utils';
import type { TimelineEvent } from '@repo/types';

/**
 * Pipeline de seguimiento de participantes + tareas/recordatorios del
 * coordinador.
 */
export class CrmService {
	/**
	 * Verifica que un participante esté vinculado al retiro dado. Necesario porque
	 * las rutas CRM validan acceso al `:retreatId` (el padre), pero `participantId`
	 * llega aparte; sin esta comprobación un coordinador podría operar sobre
	 * participantes de otros retiros (IDOR cross-retiro).
	 */
	async participantBelongsToRetreat(participantId: string, retreatId: string): Promise<boolean> {
		if (!participantId || !retreatId) return false;
		const count = await AppDataSource.getRepository(RetreatParticipant).count({
			where: { participantId, retreatId },
		});
		return count > 0;
	}

	// --- Follow-up (pipeline de seguimiento) ---

	async listFollowUps(retreatId: string): Promise<ParticipantFollowUp[]> {
		return AppDataSource.getRepository(ParticipantFollowUp).find({
			where: { retreatId },
			relations: ['participant'],
			order: { updatedAt: 'DESC' },
		});
	}

	/**
	 * Crea o actualiza el estado de seguimiento de un participante (upsert).
	 *
	 * Es el punto ÚNICO de cambio de etapa, así que aquí cuelgan dos efectos:
	 *  1. Registrar el cambio en el hilo (`participant_notes`), que es además
	 *     el único sitio donde queda la FECHA de la confirmación
	 *     (`attendanceConfirmation` no tiene columna de fecha).
	 *  2. Sincronizar `retreat_participants.attendanceConfirmation`, que es lo
	 *     que el motor de secuencias consulta para dejar de insistir.
	 *
	 * Todo en una transacción: si la sincronización falla, la etapa no se mueve
	 * — quedar con la tarjeta en "Confirmó" y la asistencia en "pendiente" es
	 * justo la contradicción que esto viene a evitar.
	 */
	async upsertFollowUp(input: {
		retreatId: string;
		participantId: string;
		status: FollowUpStatus;
		note?: string | null;
		updatedBy?: string | null;
	}): Promise<ParticipantFollowUp> {
		return AppDataSource.transaction(async (manager) => {
			const repo = manager.getRepository(ParticipantFollowUp);
			let row = await repo.findOne({
				where: { retreatId: input.retreatId, participantId: input.participantId },
			});
			const previousStatus = row?.status ?? null;
			if (!row) {
				row = repo.create({
					retreatId: input.retreatId,
					participantId: input.participantId,
				});
			}
			row.status = input.status;
			row.note = input.note ?? null;
			row.updatedBy = input.updatedBy ?? null;
			const saved = await repo.save(row);

			// Guardar el mismo estado dos veces no debe ensuciar el hilo.
			const statusChanged = previousStatus !== input.status;
			if (!statusChanged) return saved;

			const attendanceSynced = await this.syncAttendanceFromFollowUp(
				manager,
				input.participantId,
				input.retreatId,
				input.status,
			);

			await manager.getRepository(ParticipantNote).save(
				manager.getRepository(ParticipantNote).create({
					participantId: input.participantId,
					scope: 'retreat',
					retreatId: input.retreatId,
					kind: 'stage_change',
					body: null,
					metadata: {
						from: previousStatus ?? undefined,
						to: input.status,
						attendanceSynced,
					},
					createdBy: input.updatedBy ?? null,
				}),
			);

			return saved;
		});
	}

	/**
	 * Traduce la etapa del pipeline a la confirmación de asistencia real.
	 *
	 * Sólo avanza: `confirmed`/`declined` escriben, y mover la tarjeta HACIA
	 * ATRÁS (a pending/contacted/no_answer) NO revierte la asistencia. Un
	 * coordinador que reabre el seguimiento de alguien que ya confirmó no está
	 * diciendo "ya no viene", y borrar esa confirmación reactivaría
	 * recordatorios que ya no aplican.
	 *
	 * Devuelve true si escribió algo.
	 */
	private async syncAttendanceFromFollowUp(
		manager: EntityManager,
		participantId: string,
		retreatId: string,
		status: FollowUpStatus,
	): Promise<boolean> {
		const target =
			status === 'confirmed' ? 'confirmed' : status === 'declined' ? 'declined' : null;
		if (!target) return false;

		const repo = manager.getRepository(RetreatParticipant);
		const rp = await repo.findOne({ where: { participantId, retreatId } });
		if (!rp || rp.attendanceConfirmation === target) return false;

		rp.attendanceConfirmation = target;
		await repo.save(rp);
		return true;
	}

	// --- Tareas / recordatorios ---

	async listTasks(retreatId: string, status?: 'open' | 'done'): Promise<CrmTask[]> {
		const where: Record<string, unknown> = { retreatId };
		if (status) where.status = status;
		return AppDataSource.getRepository(CrmTask).find({
			where,
			relations: ['participant', 'assignee'],
			order: { dueDate: 'ASC', createdAt: 'DESC' },
		});
	}

	async createTask(input: {
		retreatId: string;
		participantId?: string | null;
		title: string;
		description?: string | null;
		dueDate?: string | null;
		assignedTo?: string | null;
		createdBy?: string | null;
	}): Promise<CrmTask> {
		const repo = AppDataSource.getRepository(CrmTask);
		const task = repo.create({
			retreatId: input.retreatId,
			participantId: input.participantId ?? null,
			title: input.title,
			description: input.description ?? null,
			dueDate: input.dueDate ? new Date(input.dueDate) : null,
			status: 'open',
			assignedTo: input.assignedTo ?? null,
			createdBy: input.createdBy ?? null,
		});
		return repo.save(task);
	}

	async findTaskById(id: string): Promise<CrmTask | null> {
		return AppDataSource.getRepository(CrmTask).findOne({ where: { id } });
	}

	async updateTask(
		id: string,
		input: {
			title?: string;
			description?: string | null;
			dueDate?: string | null;
			status?: 'open' | 'done';
			assignedTo?: string | null;
		},
	): Promise<CrmTask | null> {
		const repo = AppDataSource.getRepository(CrmTask);
		const task = await repo.findOne({ where: { id } });
		if (!task) return null;
		if (input.title !== undefined) task.title = input.title;
		if (input.description !== undefined) task.description = input.description;
		if (input.dueDate !== undefined) task.dueDate = input.dueDate ? new Date(input.dueDate) : null;
		if (input.assignedTo !== undefined) task.assignedTo = input.assignedTo;
		if (input.status !== undefined) {
			task.status = input.status;
			task.completedAt = input.status === 'done' ? new Date() : null;
		}
		return repo.save(task);
	}

	async deleteTask(id: string): Promise<boolean> {
		const result = await AppDataSource.getRepository(CrmTask).delete(id);
		return (result.affected ?? 0) > 0;
	}

	// --- Hilo de notas ---

	/** Hilo completo (notas + eventos del sistema), lo más reciente primero. */
	async listNotes(participantId: string, retreatId: string): Promise<ParticipantNote[]> {
		return AppDataSource.getRepository(ParticipantNote).find({
			where: { participantId, retreatId, scope: 'retreat' },
			relations: ['author'],
			order: { createdAt: 'DESC' },
		});
	}

	async createNote(input: {
		participantId: string;
		retreatId: string;
		body: string;
		createdBy?: string | null;
	}): Promise<ParticipantNote> {
		const repo = AppDataSource.getRepository(ParticipantNote);
		const saved = await repo.save(
			repo.create({
				participantId: input.participantId,
				scope: 'retreat',
				retreatId: input.retreatId,
				kind: 'note',
				body: input.body,
				createdBy: input.createdBy ?? null,
			}),
		);
		// Releer con el autor para que el cliente pinte el nombre sin otra vuelta.
		return (
			(await repo.findOne({ where: { id: saved.id }, relations: ['author'] })) ?? saved
		);
	}

	async findNoteById(id: string): Promise<ParticipantNote | null> {
		return AppDataSource.getRepository(ParticipantNote).findOne({ where: { id } });
	}

	/**
	 * Edita una nota. Sólo su autor, y nunca una entrada del sistema.
	 * Devuelve null cuando no procede para que el controller responda 403.
	 */
	async updateNote(id: string, body: string, userId: string): Promise<ParticipantNote | null> {
		const repo = AppDataSource.getRepository(ParticipantNote);
		const row = await repo.findOne({ where: { id } });
		if (!row) return null;
		if (row.kind !== 'note') return null;
		if (!row.createdBy || row.createdBy !== userId) return null;
		row.body = body;
		await repo.save(row);
		return repo.findOne({ where: { id }, relations: ['author'] });
	}

	/** Borra una nota. Mismas reglas que `updateNote`. */
	async deleteNote(id: string, userId: string): Promise<boolean> {
		const repo = AppDataSource.getRepository(ParticipantNote);
		const row = await repo.findOne({ where: { id } });
		if (!row) return false;
		if (row.kind !== 'note') return false;
		if (!row.createdBy || row.createdBy !== userId) return false;
		await repo.delete(id);
		return true;
	}

	/**
	 * Deja en el hilo el momento en que un caminante alcanzó el mínimo de cartas
	 * del retiro.
	 *
	 * Sólo escribe al CRUZAR el umbral hacia arriba: pasar de 3 a 4 cartas no
	 * genera otra entrada, y bajar el conteo tampoco. El umbral se lee del retiro
	 * (`minPalancasPerWalker`), así que si alguien lo baja después, un caminante
	 * puede quedar por encima sin tener entrada — es un hito histórico ("cuándo
	 * se cubrió"), no un estado derivado; el estado actual lo da el timeline.
	 *
	 * Idempotente: si ya hay un hito de palancas en el hilo, no agrega otro.
	 */
	async recordPalancaMilestoneIfCrossed(input: {
		participantId: string;
		retreatId: string;
		previousCount: number | null;
		newCount: number | null;
	}): Promise<ParticipantNote | null> {
		const { participantId, retreatId, previousCount, newCount } = input;
		if (newCount === null) return null;

		const retreat = await AppDataSource.getRepository(Retreat).findOne({
			where: { id: retreatId },
			select: ['id', 'minPalancasPerWalker'],
		});
		const threshold = effectiveMinPalancas(retreat?.minPalancasPerWalker);

		const crossed = newCount >= threshold && (previousCount ?? 0) < threshold;
		if (!crossed) return null;

		const repo = AppDataSource.getRepository(ParticipantNote);
		// `metadata` es simple-json, así que el filtro va en memoria: hay pocas
		// entradas de sistema por persona.
		const systemEntries = await repo.find({
			where: { participantId, retreatId, kind: 'stage_change' },
		});
		if (systemEntries.some((n) => n.metadata?.milestone === 'palancas')) {
			return null;
		}

		try {
			return await repo.save(
				repo.create({
					participantId,
					scope: 'retreat',
					retreatId,
					kind: 'stage_change',
					body: null,
					metadata: { milestone: 'palancas', count: newCount, threshold },
					createdBy: null,
				}),
			);
		} catch (err) {
			// El índice único parcial `UQ_participant_notes_palanca_milestone` es
			// quien cierra de verdad la carrera: si otro guardado simultáneo ganó,
			// el hito ya está y no hay nada que hacer. Anotar un hito duplicado no
			// justifica tumbar el guardado del participante.
			if (String((err as Error)?.message ?? '').includes('UNIQUE constraint failed')) {
				return null;
			}
			throw err;
		}
	}

	// --- Timeline unificado ---

	/**
	 * Hilo cronológico de una persona en un retiro, juntando lo que hoy vive
	 * repartido en seis tablas.
	 *
	 * Los mensajes a los familiares ya salen aquí sin esfuerzo: cuando el motor
	 * manda una petición de palanca a la mamá, la fila se guarda con el
	 * `participantId` DEL CAMINANTE y `recipientContactKey = 'emergencyContact1'`.
	 * Por eso cada evento lleva `contactKey`/`contactName`: es lo que permite
	 * responder "¿qué le dijimos a la mamá?".
	 */
	async getParticipantTimeline(participantId: string, retreatId: string): Promise<TimelineEvent[]> {
		const events: TimelineEvent[] = [];

		const [notes, comms, scheduled, tasks, rp, payments, retreat] = await Promise.all([
			AppDataSource.getRepository(ParticipantNote).find({
				where: { participantId, retreatId, scope: 'retreat' },
				relations: ['author'],
			}),
			AppDataSource.getRepository(ParticipantCommunication).find({
				where: { participantId, retreatId },
				relations: ['sender'],
			}),
			AppDataSource.getRepository(ScheduledMessage).find({
				where: { participantId, retreatId },
			}),
			AppDataSource.getRepository(CrmTask).find({
				where: { participantId, retreatId },
				relations: ['assignee'],
			}),
			AppDataSource.getRepository(RetreatParticipant).findOne({
				where: { participantId, retreatId },
			}),
			AppDataSource.getRepository(Payment).find({
				where: { participantId, retreatId },
				relations: ['recordedByUser'],
			}),
			AppDataSource.getRepository(Retreat).findOne({ where: { id: retreatId } }),
		]);

		for (const n of notes) {
			const isStage = n.kind === 'stage_change';
			events.push({
				id: `note-${n.id}`,
				type: isStage ? 'stage_change' : 'note',
				at: n.createdAt,
				title: isStage ? this.describeStageChange(n.metadata) : 'Nota',
				detail: n.body ?? null,
				actorName: n.author?.displayName ?? null,
				meta: isStage ? { ...(n.metadata ?? {}) } : { noteId: n.id, canEdit: true },
			});
		}

		for (const c of comms) {
			events.push({
				id: `comm-${c.id}`,
				type: 'message',
				at: c.sentAt,
				title: c.messageType === 'email' ? 'Correo enviado' : 'WhatsApp enviado',
				detail: c.messageContent ?? null,
				contactKey: c.recipientContactKey ?? 'participant',
				contactName: c.recipientName ?? c.recipientContact ?? null,
				actorName: c.sender?.displayName ?? null,
				meta: {
					messageType: c.messageType,
					templateName: c.templateName ?? null,
					subject: c.subject ?? null,
					recipientContact: c.recipientContact ?? null,
				},
			});
		}

		// Lo que TODAVÍA no ha salido: el coordinador necesita verlo antes de
		// decidir si llama o espera.
		for (const m of scheduled) {
			if (m.status !== 'pending' && m.status !== 'queued') continue;
			events.push({
				id: `sched-${m.id}`,
				type: 'message_scheduled',
				at: m.scheduledFor,
				title:
					m.status === 'queued'
						? 'WhatsApp en la bandeja, por despachar'
						: 'Mensaje programado',
				detail: m.resolvedContent ?? null,
				contactKey: m.recipientTarget ?? 'participant',
				contactName: m.recipientName ?? m.resolvedContact ?? null,
				meta: {
					channel: m.channel,
					templateType: m.templateType,
					status: m.status,
				},
			});
		}

		for (const t of tasks) {
			events.push({
				id: `task-${t.id}`,
				type: 'task',
				at: t.createdAt,
				title: 'Tarea creada',
				detail: t.title,
				actorName: t.assignee?.displayName ?? null,
				meta: { status: t.status, dueDate: t.dueDate ?? null, taskId: t.id },
			});
			if (t.completedAt) {
				events.push({
					id: `task-done-${t.id}`,
					type: 'task',
					at: t.completedAt,
					title: 'Tarea completada',
					detail: t.title,
					meta: { taskId: t.id, done: true },
				});
			}
		}

		for (const pay of payments) {
			// `amount` es decimal: SQLite lo devuelve como string.
			const amount = Number(pay.amount);
			events.push({
				id: `pay-${pay.id}`,
				type: 'payment',
				at: pay.createdAt ?? pay.paymentDate,
				title: 'Pago registrado',
				detail: Number.isFinite(amount) ? `$${amount.toFixed(2)}` : null,
				actorName: pay.recordedByUser?.displayName ?? null,
				meta: {
					amount: Number.isFinite(amount) ? amount : null,
					paymentMethod: pay.paymentMethod,
					paymentDate: pay.paymentDate ?? null,
					referenceNumber: pay.referenceNumber ?? null,
				},
			});
		}

		if (rp) {
			events.push({
				id: `registered-${retreatId}`,
				type: 'registered',
				at: rp.createdAt,
				title: 'Registrado en el retiro',
				detail: rp.type ? `Como ${rp.type}` : null,
			});

			if (rp.checkedInAt) {
				events.push({
					id: `checkin-${retreatId}`,
					type: 'attendance',
					at: rp.checkedInAt,
					title: 'Llegó al retiro (recepción)',
				});
			}

			// `attendanceConfirmation` no tiene fecha propia. En vez de inventar
			// una, se devuelve con `at: null` y el cliente lo pinta como estado
			// actual, fuera de la línea cronológica. El CUÁNDO, si existe, ya
			// viene en la entrada `stage_change` que lo sincronizó.
			if (rp.attendanceConfirmation && rp.attendanceConfirmation !== 'pending') {
				events.push({
					id: `attendance-${retreatId}`,
					type: 'attendance',
					at: null,
					title:
						rp.attendanceConfirmation === 'confirmed'
							? 'Confirmó su asistencia'
							: 'Dijo que no asistirá',
					meta: { attendanceConfirmation: rp.attendanceConfirmation, currentState: true },
				});
			}

			const palancas = resolvePalancas(rp, retreat?.minPalancasPerWalker);
			const hasPalancaData =
				palancas.count !== null ||
				(rp.palancasReceived ?? '') !== '' ||
				(rp.palancasNotes ?? '') !== '';
			if (hasPalancaData) {
				events.push({
					id: `palancas-${retreatId}`,
					type: 'palancas',
					at: null,
					title:
						palancas.count !== null
							? `Cartas recibidas: ${palancas.count} de ${palancas.threshold}`
							: 'Cartas recibidas sin capturar como número',
					detail: rp.palancasNotes ?? null,
					meta: {
						count: palancas.count,
						threshold: palancas.threshold,
						milestone: palancas.milestone,
						raw: rp.palancasReceived ?? null,
						currentState: true,
					},
				});
			}
		}

		// Más reciente primero. Los eventos sin fecha (estado actual) van arriba:
		// son el "ahora", no un punto del pasado.
		return events.sort((a, b) => {
			if (!a.at && !b.at) return 0;
			if (!a.at) return -1;
			if (!b.at) return 1;
			return new Date(b.at).getTime() - new Date(a.at).getTime();
		});
	}

	private describeStageChange(meta?: ParticipantNoteMetadata | null): string {
		if (meta?.milestone === 'palancas') {
			return `Alcanzó ${meta.count ?? '?'} cartas (mínimo ${meta.threshold ?? '?'})`;
		}
		const labels: Record<string, string> = {
			pending: 'Por contactar',
			contacted: 'Contactado',
			confirmed: 'Confirmó',
			no_answer: 'Sin respuesta',
			declined: 'Declinó',
		};
		const to = meta?.to ? (labels[meta.to] ?? meta.to) : '?';
		if (!meta?.from) return `Etapa: ${to}`;
		const from = labels[meta.from] ?? meta.from;
		return `Etapa: ${from} → ${to}`;
	}

	// --- Opt-out / lista de no-contacto ---

	/** Marca/desmarca a un participante como no-contactable (afecta a las secuencias). */
	async setDoNotContact(participantId: string, value: boolean): Promise<Participant | null> {
		const repo = AppDataSource.getRepository(Participant);
		const p = await repo.findOne({ where: { id: participantId } });
		if (!p) return null;
		p.doNotContact = value;
		return repo.save(p);
	}
}

export const crmService = new CrmService();
