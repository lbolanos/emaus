import { AppDataSource } from '../data-source';
import { RetreatScheduleItem, ScheduleItemStatus } from '../entities/retreatScheduleItem.entity';
import { RetreatScheduleItemResponsable } from '../entities/retreatScheduleItemResponsable.entity';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { responsabilityAttachmentService } from './responsabilityAttachmentService';
import { SantisimoSlot } from '../entities/santisimoSlot.entity';
import { SantisimoSignup } from '../entities/santisimoSignup.entity';
import { Participant } from '../entities/participant.entity';
import { Responsability } from '../entities/responsability.entity';
import { ensureCharlaResponsibilitiesFromTemplateSet } from './responsabilityService';
import {
	emitScheduleItemCompleted,
	emitScheduleItemStarted,
	emitScheduleUpdated,
	emitScheduleDelay,
} from '../realtime';
import { MoreThanOrEqual, In } from 'typeorm';

export class ScheduleNotFoundError extends Error {}

type ResponsablePayload = { participantId: string; role?: string | null };

export class RetreatScheduleService {
	private itemRepo = AppDataSource.getRepository(RetreatScheduleItem);
	private respRepo = AppDataSource.getRepository(RetreatScheduleItemResponsable);
	private templateRepo = AppDataSource.getRepository(ScheduleTemplate);
	private slotRepo = AppDataSource.getRepository(SantisimoSlot);
	private signupRepo = AppDataSource.getRepository(SantisimoSignup);
	private participantRepo = AppDataSource.getRepository(Participant);
	private responsabilityRepo = AppDataSource.getRepository(Responsability);

	/**
	 * Construye un Map<nombre normalizado, responsabilityId> con las
	 * Responsabilidades de un retiro, para hacer match exacto por nombre.
	 */
	private async buildResponsabilityNameIndex(retreatId: string): Promise<Map<string, string>> {
		const resps = await this.responsabilityRepo.find({ where: { retreatId } });
		const map = new Map<string, string>();
		for (const r of resps) {
			map.set(r.name.toLowerCase().trim(), r.id);
		}
		return map;
	}

	/**
	 * Carga attachments para una lista de items por nombre canónico de
	 * Responsabilidad. Los archivos viven globalmente vinculados a
	 * `responsability_attachment.responsabilityName`.
	 */
	private async populateTemplateAttachments<T extends RetreatScheduleItem>(
		items: T[],
	): Promise<T[]> {
		const names = items
			.map((i) => i.responsability?.name)
			.filter((n): n is string => !!n && n.trim().length > 0);
		if (!names.length) {
			items.forEach((i) => {
				(i as any).attachments = [];
			});
			return items;
		}
		const byName = await responsabilityAttachmentService.listForNames(names);
		items.forEach((i) => {
			const n = i.responsability?.name?.trim();
			(i as any).attachments = n ? (byName.get(n) ?? []) : [];
		});
		return items;
	}

	async listForRetreat(retreatId: string): Promise<RetreatScheduleItem[]> {
		const items = await this.itemRepo.find({
			where: { retreatId },
			relations: ['responsability', 'responsables', 'responsables.participant'],
			order: { startTime: 'ASC' },
		});
		return this.populateTemplateAttachments(items);
	}

	async get(id: string): Promise<RetreatScheduleItem | null> {
		const item = await this.itemRepo.findOne({
			where: { id },
			relations: ['responsability', 'responsables', 'responsables.participant'],
		});
		if (!item) return null;
		const [populated] = await this.populateTemplateAttachments([item]);
		return populated;
	}

	async create(
		retreatId: string,
		data: Partial<RetreatScheduleItem> & { responsableParticipantIds?: string[] },
	): Promise<RetreatScheduleItem> {
		const startTime = data.startTime
			? data.startTime instanceof Date
				? data.startTime
				: new Date(data.startTime)
			: undefined;
		const endTimeInput = data.endTime
			? data.endTime instanceof Date
				? data.endTime
				: new Date(data.endTime)
			: undefined;
		const durationMinutes =
			data.durationMinutes ??
			(startTime && endTimeInput
				? Math.max(0, Math.round((endTimeInput.getTime() - startTime.getTime()) / 60000))
				: 15);
		const endTime =
			endTimeInput ??
			(startTime ? new Date(startTime.getTime() + durationMinutes * 60000) : new Date());

		const entity = this.itemRepo.create({
			retreatId,
			scheduleTemplateId: data.scheduleTemplateId ?? null,
			name: data.name!,
			type: data.type ?? 'otro',
			day: data.day ?? 1,
			startTime: startTime!,
			endTime,
			durationMinutes,
			orderInDay: data.orderInDay ?? 0,
			status: data.status ?? 'pending',
			responsabilityId: data.responsabilityId ?? null,
			location: data.location ?? null,
			notes: data.notes ?? null,
			musicTrackUrl: data.musicTrackUrl ?? null,
			palanquitaNotes: data.palanquitaNotes ?? null,
			planBNotes: data.planBNotes ?? null,
			blocksSantisimoAttendance: data.blocksSantisimoAttendance ?? false,
		});
		const saved = await this.itemRepo.save(entity);

		if (data.responsableParticipantIds?.length) {
			await this.setResponsables(saved.id, data.responsableParticipantIds);
		}

		if (saved.blocksSantisimoAttendance) {
			await this.resolveSantisimoConflicts(retreatId);
		}
		return (await this.get(saved.id))!;
	}

	async update(
		id: string,
		data: Partial<RetreatScheduleItem> & { responsableParticipantIds?: string[] },
	): Promise<RetreatScheduleItem | null> {
		const existing = await this.itemRepo.findOne({ where: { id } });
		if (!existing) throw new ScheduleNotFoundError('item not found');

		const update: Partial<RetreatScheduleItem> = {};
		const dateFields = new Set(['startTime', 'endTime', 'actualStartTime', 'actualEndTime']);
		for (const k of [
			'name',
			'type',
			'day',
			'startTime',
			'endTime',
			'durationMinutes',
			'orderInDay',
			'status',
			'responsabilityId',
			'location',
			'notes',
			'musicTrackUrl',
			'palanquitaNotes',
			'planBNotes',
			'blocksSantisimoAttendance',
			'actualStartTime',
			'actualEndTime',
		] as const) {
			if (data[k] !== undefined) {
				const value = (data as any)[k];
				(update as any)[k] = dateFields.has(k) && value && !(value instanceof Date)
					? new Date(value)
					: value;
			}
		}

		// Keep endTime coherent with startTime + durationMinutes if either changes
		if (update.startTime || update.durationMinutes !== undefined) {
			const start = update.startTime ?? existing.startTime;
			const dur = update.durationMinutes ?? existing.durationMinutes;
			if (!update.endTime) {
				const startDate = start instanceof Date ? start : new Date(start);
				update.endTime = new Date(startDate.getTime() + dur * 60000);
			}
		}

		await this.itemRepo.update(id, update);

		if (data.responsableParticipantIds !== undefined) {
			await this.setResponsables(id, data.responsableParticipantIds);
		}

		const after = await this.get(id);
		emitScheduleUpdated({ retreatId: existing.retreatId, itemId: id });

		// If meal/dinamica timing changed, recompute santisimo windows
		if (
			update.blocksSantisimoAttendance !== undefined ||
			update.startTime ||
			update.endTime ||
			update.durationMinutes !== undefined
		) {
			await this.resolveSantisimoConflicts(existing.retreatId);
		}

		return after;
	}

	async delete(id: string): Promise<boolean> {
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) return false;
		const r = await this.itemRepo.delete(id);
		emitScheduleUpdated({ retreatId: item.retreatId, itemId: id });
		if (item.blocksSantisimoAttendance) {
			await this.resolveSantisimoConflicts(item.retreatId);
		}
		return (r.affected ?? 0) > 0;
	}

	async setResponsables(itemId: string, participantIds: string[]): Promise<void> {
		await this.respRepo.delete({ scheduleItemId: itemId });
		if (!participantIds.length) return;
		const rows = participantIds.map((pid) =>
			this.respRepo.create({ scheduleItemId: itemId, participantId: pid }),
		);
		await this.respRepo.save(rows);
	}

	/**
	 * Asigna responsabilidad principal y/o apoyos a múltiples items en bulk.
	 * Cada entrada con responsabilityId definido (incluyendo null para limpiar) actualiza
	 * el item; cada entrada con responsableParticipantIds reemplaza los apoyos del item.
	 * Filtra silenciosamente itemIds que no pertenecen al retiro.
	 */
	async bulkAssignResponsables(
		retreatId: string,
		assignments: Array<{
			itemId: string;
			responsabilityId?: string | null;
			responsableParticipantIds?: string[];
		}>,
	): Promise<{ updated: number; skipped: number }> {
		if (!assignments.length) return { updated: 0, skipped: 0 };

		const itemIds = assignments.map((a) => a.itemId);
		const items = await this.itemRepo.find({ where: { id: In(itemIds), retreatId } });
		const validIds = new Set(items.map((i) => i.id));

		let updated = 0;
		let skipped = 0;

		for (const a of assignments) {
			if (!validIds.has(a.itemId)) {
				skipped++;
				continue;
			}
			if (a.responsabilityId !== undefined) {
				await this.itemRepo.update(a.itemId, {
					responsabilityId: a.responsabilityId,
				});
			}
			if (a.responsableParticipantIds !== undefined) {
				await this.setResponsables(a.itemId, a.responsableParticipantIds);
			}
			emitScheduleUpdated({ retreatId, itemId: a.itemId });
			updated++;
		}

		return { updated, skipped };
	}

	/**
	 * Backfill: para items del retiro que no tienen responsabilityId pero vienen
	 * de un template con responsabilityName, busca la Responsabilidad del retiro
	 * por nombre y vincula. Idempotente.
	 */
	async relinkResponsibilities(
		retreatId: string,
		force = false,
	): Promise<{ linked: number; alreadyLinked: number; noTemplate: number; noMatch: number }> {
		const items = await this.itemRepo.find({ where: { retreatId } });
		const templateIds = Array.from(
			new Set(items.map((i) => i.scheduleTemplateId).filter((x): x is string => !!x)),
		);
		const templates = templateIds.length
			? await this.templateRepo.find({ where: { id: In(templateIds) } })
			: [];
		const templateById = new Map(templates.map((t) => [t.id, t]));
		const respIndex = await this.buildResponsabilityNameIndex(retreatId);

		let linked = 0;
		let alreadyLinked = 0;
		let noTemplate = 0;
		let noMatch = 0;

		for (const item of items) {
			if (item.responsabilityId && !force) {
				alreadyLinked++;
				continue;
			}
			if (!item.scheduleTemplateId) {
				noTemplate++;
				continue;
			}
			const tmpl = templateById.get(item.scheduleTemplateId);
			if (!tmpl?.responsabilityName) {
				noMatch++;
				continue;
			}
			const respId = respIndex.get(tmpl.responsabilityName.toLowerCase().trim());
			if (!respId) {
				noMatch++;
				continue;
			}
			// Skip if already linked to the same responsability (avoid no-op writes)
			if (item.responsabilityId === respId) {
				alreadyLinked++;
				continue;
			}
			await this.itemRepo.update(item.id, { responsabilityId: respId });
			emitScheduleUpdated({ retreatId, itemId: item.id });
			linked++;
		}

		return { linked, alreadyLinked, noTemplate, noMatch };
	}

	/**
	 * Clone the global template into this retreat. baseDate = first day of retreat.
	 * `defaultDay` (1..n) is mapped to baseDate + (day-1); `defaultStartTime` (HH:MM) is applied.
	 */
	async materializeFromTemplate(
		retreatId: string,
		baseDate: Date,
		clearExisting = false,
		templateSetId?: string,
	): Promise<RetreatScheduleItem[]> {
		const where: any = { isActive: true };
		if (templateSetId) where.templateSetId = templateSetId;
		const templates = await this.templateRepo.find({
			where,
			order: { defaultDay: 'ASC', defaultOrder: 'ASC', defaultStartTime: 'ASC' },
		});
		if (!templates.length) return [];

		if (clearExisting) {
			await this.itemRepo.delete({ retreatId });
		}

		// Crea las Responsabilidades de charlas/testimonios del set escogido que
		// aún no existan en el retiro, ANTES de construir el respIndex para que
		// los items recién creados puedan vincularse en este mismo paso.
		await ensureCharlaResponsibilitiesFromTemplateSet(retreatId, templateSetId);

		const respIndex = await this.buildResponsabilityNameIndex(retreatId);

		const created: RetreatScheduleItem[] = [];
		for (const t of templates) {
			const day = t.defaultDay ?? 1;
			const itemDate = new Date(baseDate);
			itemDate.setDate(itemDate.getDate() + (day - 1));
			let [h, m] = [9, 0];
			if (t.defaultStartTime) {
				const parts = t.defaultStartTime.split(':');
				h = parseInt(parts[0] ?? '9', 10);
				m = parseInt(parts[1] ?? '0', 10);
			}
			itemDate.setHours(h, m, 0, 0);
			const duration = t.defaultDurationMinutes ?? 15;
			const endTime = new Date(itemDate.getTime() + duration * 60000);

			const responsabilityId = t.responsabilityName
				? respIndex.get(t.responsabilityName.toLowerCase().trim()) ?? null
				: null;

			const entity = this.itemRepo.create({
				retreatId,
				scheduleTemplateId: t.id,
				name: t.name,
				type: t.type,
				day,
				startTime: itemDate,
				endTime,
				durationMinutes: duration,
				orderInDay: t.defaultOrder,
				status: 'pending',
				responsabilityId,
				musicTrackUrl: t.musicTrackUrl,
				palanquitaNotes: t.palanquitaNotes,
				planBNotes: t.planBNotes,
				blocksSantisimoAttendance: t.blocksSantisimoAttendance,
				location: t.locationHint,
			});
			created.push(await this.itemRepo.save(entity));
		}

		await this.resolveSantisimoConflicts(retreatId);
		return this.listForRetreat(retreatId);
	}

	/**
	 * Inserta SOLO los items del template que el retiro aún no tiene materializados.
	 * Detecta duplicados por `scheduleTemplateId` y por `(day, name)` cuando no hay link.
	 * Útil para propagar nuevos items del template a retiros que ya materializaron.
	 */
	async addMissingTemplateItems(
		retreatId: string,
		baseDate: Date,
		templateSetId?: string,
	): Promise<{ added: number; skipped: number; total: number }> {
		const where: any = { isActive: true };
		if (templateSetId) where.templateSetId = templateSetId;
		const templates = await this.templateRepo.find({
			where,
			order: { defaultDay: 'ASC', defaultOrder: 'ASC', defaultStartTime: 'ASC' },
		});
		if (!templates.length) return { added: 0, skipped: 0, total: 0 };

		const existing = await this.itemRepo.find({ where: { retreatId } });
		const existingTemplateIds = new Set(
			existing.map((e) => e.scheduleTemplateId).filter((x): x is string => !!x),
		);
		const existingByDayName = new Set(existing.map((e) => `${e.day}__${e.name?.trim()}`));

		// Asegura las Responsabilidades de charlas/testimonios del set antes de
		// construir el respIndex (ver nota en materializeFromTemplate).
		await ensureCharlaResponsibilitiesFromTemplateSet(retreatId, templateSetId);

		const respIndex = await this.buildResponsabilityNameIndex(retreatId);

		let added = 0;
		let skipped = 0;
		for (const t of templates) {
			if (existingTemplateIds.has(t.id)) {
				skipped++;
				continue;
			}
			if (existingByDayName.has(`${t.defaultDay ?? 1}__${t.name?.trim()}`)) {
				skipped++;
				continue;
			}
			const day = t.defaultDay ?? 1;
			const itemDate = new Date(baseDate);
			itemDate.setDate(itemDate.getDate() + (day - 1));
			let [h, m] = [9, 0];
			if (t.defaultStartTime) {
				const parts = t.defaultStartTime.split(':');
				h = parseInt(parts[0] ?? '9', 10);
				m = parseInt(parts[1] ?? '0', 10);
			}
			itemDate.setHours(h, m, 0, 0);
			const duration = t.defaultDurationMinutes ?? 15;
			const endTime = new Date(itemDate.getTime() + duration * 60000);
			const responsabilityId = t.responsabilityName
				? respIndex.get(t.responsabilityName.toLowerCase().trim()) ?? null
				: null;

			const entity = this.itemRepo.create({
				retreatId,
				scheduleTemplateId: t.id,
				name: t.name,
				type: t.type,
				day,
				startTime: itemDate,
				endTime,
				durationMinutes: duration,
				orderInDay: t.defaultOrder,
				status: 'pending',
				responsabilityId,
				musicTrackUrl: t.musicTrackUrl,
				palanquitaNotes: t.palanquitaNotes,
				planBNotes: t.planBNotes,
				blocksSantisimoAttendance: t.blocksSantisimoAttendance,
				location: t.locationHint,
			});
			await this.itemRepo.save(entity);
			added++;
		}

		return { added, skipped, total: templates.length };
	}

	async startItem(id: string): Promise<RetreatScheduleItem | null> {
		const now = new Date();
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) throw new ScheduleNotFoundError('item not found');
		await this.itemRepo.update(id, { status: 'active', actualStartTime: now });
		emitScheduleItemStarted({
			retreatId: item.retreatId,
			itemId: id,
			actualStartTime: now.toISOString(),
		});
		return this.get(id);
	}

	async completeItem(id: string): Promise<RetreatScheduleItem | null> {
		const now = new Date();
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) throw new ScheduleNotFoundError('item not found');
		await this.itemRepo.update(id, { status: 'completed', actualEndTime: now });
		emitScheduleItemCompleted({
			retreatId: item.retreatId,
			itemId: id,
			actualEndTime: now.toISOString(),
		});
		return this.get(id);
	}

	/**
	 * Shift this item and (optionally) all later items on the same day by `minutesDelta`.
	 */
	async shiftDownstream(
		id: string,
		minutesDelta: number,
		propagate = true,
	): Promise<RetreatScheduleItem[]> {
		const item = await this.itemRepo.findOne({ where: { id } });
		if (!item) throw new ScheduleNotFoundError('item not found');

		const affected: RetreatScheduleItem[] = [item];
		if (propagate) {
			const later = await this.itemRepo.find({
				where: {
					retreatId: item.retreatId,
					day: item.day,
					startTime: MoreThanOrEqual(item.startTime),
				},
			});
			for (const x of later) {
				if (x.id !== item.id) affected.push(x);
			}
		}

		for (const x of affected) {
			const newStart = new Date(x.startTime.getTime() + minutesDelta * 60000);
			const newEnd = new Date(x.endTime.getTime() + minutesDelta * 60000);
			await this.itemRepo.update(x.id, {
				startTime: newStart,
				endTime: newEnd,
				status: minutesDelta > 0 ? 'delayed' : x.status,
			});
		}

		emitScheduleDelay({ retreatId: item.retreatId, itemId: id, minutesDelta });
		await this.resolveSantisimoConflicts(item.retreatId);
		return this.listForRetreat(item.retreatId);
	}

	/**
	 * Mark santisimo slots that overlap a "blocking" item window (comida/dinamica with
	 * blocksSantisimoAttendance=true) and auto-fill them with angelitos if available.
	 */
	async resolveSantisimoConflicts(
		retreatId: string,
	): Promise<{
		mealSlots: number;
		angelitosAssigned: number;
		unresolvedSlots: string[];
	}> {
		const blockers = await this.itemRepo.find({
			where: { retreatId, blocksSantisimoAttendance: true },
		});
		const slots = await this.slotRepo.find({
			where: { retreatId },
			relations: ['signups'],
		});

		const mealSlotIds: string[] = [];
		for (const slot of slots) {
			const overlaps = blockers.some(
				(b) => b.startTime < slot.endTime && b.endTime > slot.startTime,
			);
			const nextValue = !!overlaps;
			if (slot.mealWindow !== nextValue) {
				await this.slotRepo.update(slot.id, { mealWindow: nextValue });
				slot.mealWindow = nextValue;
			}
			if (nextValue) mealSlotIds.push(slot.id);
		}

		if (!mealSlotIds.length) {
			return { mealSlots: 0, angelitosAssigned: 0, unresolvedSlots: [] };
		}

		const assigned = await this.autoAssignAngelitos(retreatId, mealSlotIds);
		return {
			mealSlots: mealSlotIds.length,
			angelitosAssigned: assigned.assigned,
			unresolvedSlots: assigned.unresolved,
		};
	}

	/**
	 * For meal-window slots, remove signups of servidores-en-mesa (they cannot attend)
	 * and auto-assign available angelitos.
	 *
	 * Definition of "angelito" in this system: a Participant with `type === 'partial_server'`
	 * (this is the canonical field set by admins via the participant edit form, where the
	 * value is rendered in Spanish as "Angelito"). We additionally require they not be
	 * currently seated at any mesa for this retreat (a servidor en mesa can't cover Santísimo
	 * during their own meal).
	 */
	async autoAssignAngelitos(
		retreatId: string,
		slotIds?: string[],
	): Promise<{ assigned: number; unresolved: string[] }> {
		const whereSlot = slotIds?.length
			? { retreatId, id: In(slotIds), mealWindow: true }
			: { retreatId, mealWindow: true };
		const mealSlots = await this.slotRepo.find({
			where: whereSlot,
			relations: ['signups'],
		});

		// Participants currently seated at any mesa for this retreat are ineligible.
		const inTableRows = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.tableId IS NOT NULL')
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const inTableIds = new Set<string>(
			inTableRows.map((r: { participantId: string }) => r.participantId).filter(Boolean),
		);

		// Candidate angelitos: retreat_participants of this retreat with type='partial_server'
		// (the system's canonical "Angelito"). We join to participants for full data.
		const angelitoLinks = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.type = :t', { t: 'partial_server' })
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const angelitoPids = angelitoLinks
			.map((r: { participantId: string }) => r.participantId)
			.filter(Boolean);
		const allP = angelitoPids.length
			? await this.participantRepo
					.createQueryBuilder('p')
					.where('p.id IN (:...ids)', { ids: angelitoPids })
					.getMany()
			: [];

		const pool = allP.filter((p) => !inTableIds.has(p.id));
		if (!pool.length && !mealSlots.length) return { assigned: 0, unresolved: [] };

		let assigned = 0;
		const unresolved: string[] = [];

		for (const slot of mealSlots) {
			const current = slot.signups ?? [];
			// Remove signups of in-table servidores (they can't cover during meal)
			for (const sig of current) {
				if (sig.participantId && inTableIds.has(sig.participantId)) {
					await this.signupRepo.delete(sig.id);
				}
			}

			const refreshed = await this.signupRepo.find({ where: { slotId: slot.id } });
			const need = Math.max(0, slot.capacity - refreshed.length);
			if (need === 0) continue;

			const candidates = pool.filter(
				(p) => !refreshed.some((s) => s.participantId === p.id),
			);

			if (!candidates.length) {
				unresolved.push(slot.id);
				continue;
			}

			for (let i = 0; i < need && i < candidates.length; i++) {
				const p = candidates[i];
				const row = this.signupRepo.create({
					slotId: slot.id,
					participantId: p.id,
					name: `${p.firstName} ${p.lastName}`.trim() || p.nickname,
					phone: p.cellPhone ?? null,
					email: p.email ?? null,
					userId: null,
					cancelToken: null,
					ipAddress: null,
					isAngelito: true,
					autoAssigned: true,
				});
				await this.signupRepo.save(row);
				assigned++;
			}
			if (need > candidates.length) unresolved.push(slot.id);
		}

		return { assigned, unresolved };
	}

	/**
	 * Aggregated dashboard stats for the retreat. Single read-only call covering
	 * agenda progress, current/next item, santisimo coverage and angelito pool.
	 */
	async dashboardStats(retreatId: string) {
		const items = await this.itemRepo.find({
			where: { retreatId },
			relations: ['responsability', 'responsables'],
			order: { startTime: 'ASC' },
		});

		const now = new Date();
		const todayStart = new Date(now);
		todayStart.setHours(0, 0, 0, 0);
		const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);

		const todayItems = items.filter(
			(it) => it.startTime >= todayStart && it.startTime < todayEnd,
		);
		const completedToday = todayItems.filter((it) => it.status === 'completed').length;
		const totalToday = todayItems.length;

		const requiresResponsable = items.filter(
			(it) =>
				it.responsability !== null ||
				(it.responsables && it.responsables.length > 0) ||
				it.scheduleTemplateId,
		).length;
		const missingResponsable = items.filter(
			(it) =>
				!it.responsabilityId &&
				(!it.responsables || it.responsables.length === 0) &&
				(it.type === 'charla' || it.type === 'testimonio' || it.type === 'misa'),
		).length;

		const currentItem = items.find((it) => it.status === 'active') ?? null;
		const nextItem =
			items.find(
				(it) => (it.status === 'pending' || it.status === 'delayed') && it.startTime > now,
			) ?? null;

		// Acumulado de retraso del día: suma de minutos en items 'delayed' o
		// completed con actualEndTime > endTime planeado.
		let delayMinutes = 0;
		for (const it of todayItems) {
			if (it.status === 'completed' && it.actualEndTime) {
				const diff = Math.round((it.actualEndTime.getTime() - it.endTime.getTime()) / 60000);
				if (diff > 0) delayMinutes += diff;
			}
		}

		// Santísimo
		const slots = await this.slotRepo.find({
			where: { retreatId },
			relations: ['signups'],
		});
		const totalSlots = slots.length;
		const coveredSlots = slots.filter((s) => (s.signups?.length ?? 0) >= s.capacity).length;
		const mealWindowSlots = slots.filter((s) => s.mealWindow).length;
		const unresolvedMealSlots = slots.filter(
			(s) => s.mealWindow && (s.signups?.length ?? 0) < s.capacity,
		).length;

		// Angelitos
		const inTableP = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.tableId IS NOT NULL')
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const inTableIds = new Set<string>(
			inTableP.map((r: { participantId: string }) => r.participantId).filter(Boolean),
		);
		const angelitoRows = await this.participantRepo.manager
			.createQueryBuilder()
			.select('rp.participantId', 'participantId')
			.from('retreat_participants', 'rp')
			.where('rp.retreatId = :retreatId', { retreatId })
			.andWhere('rp.type = :t', { t: 'partial_server' })
			.andWhere('rp.participantId IS NOT NULL')
			.getRawMany();
		const angelitoIds = angelitoRows
			.map((r: { participantId: string }) => r.participantId)
			.filter(Boolean);
		const angelitosTotal = angelitoIds.length;
		const angelitosInTable = angelitoIds.filter((id: string) => inTableIds.has(id)).length;
		const angelitosAvailable = angelitosTotal - angelitosInTable;

		return {
			currentItem: currentItem
				? {
						id: currentItem.id,
						name: currentItem.name,
						type: currentItem.type,
						startTime: currentItem.startTime.toISOString(),
						endTime: currentItem.endTime.toISOString(),
						actualStartTime: currentItem.actualStartTime?.toISOString() ?? null,
						durationMinutes: currentItem.durationMinutes,
						responsabilityId: currentItem.responsabilityId ?? null,
						responsabilityName: currentItem.responsability?.name ?? null,
				  }
				: null,
			nextItem: nextItem
				? {
						id: nextItem.id,
						name: nextItem.name,
						type: nextItem.type,
						startTime: nextItem.startTime.toISOString(),
						minutesUntil: Math.round((nextItem.startTime.getTime() - now.getTime()) / 60000),
						responsabilityName: nextItem.responsability?.name ?? null,
				  }
				: null,
			today: {
				completed: completedToday,
				total: totalToday,
			},
			items: {
				total: items.length,
				completed: items.filter((it) => it.status === 'completed').length,
				active: items.filter((it) => it.status === 'active').length,
				pending: items.filter((it) => it.status === 'pending').length,
				delayed: items.filter((it) => it.status === 'delayed').length,
				requiresResponsable,
				missingResponsable,
			},
			delayMinutes,
			santisimo: {
				totalSlots,
				coveredSlots,
				mealWindowSlots,
				unresolvedMealSlots,
			},
			angelitos: {
				total: angelitosTotal,
				available: angelitosAvailable,
				inTable: angelitosInTable,
			},
		};
	}

	/**
	 * Returns items scheduled to start within the next `leadMinutes` window (pending only).
	 * Used by the realtime tick to emit `schedule:upcoming`.
	 */
	async listUpcoming(leadMinutes: number): Promise<
		Array<RetreatScheduleItem & { targetParticipantIds: string[] }>
	> {
		const now = new Date();
		const until = new Date(now.getTime() + leadMinutes * 60000);
		const rows = await this.itemRepo
			.createQueryBuilder('i')
			.leftJoinAndSelect('i.responsables', 'r')
			.where('i.status = :s', { s: 'pending' })
			.andWhere('i.startTime >= :now', { now })
			.andWhere('i.startTime <= :until', { until })
			.getMany();

		return rows.map((r) => ({
			...r,
			targetParticipantIds: (r.responsables ?? []).map((x) => x.participantId),
		}));
	}
}

export const retreatScheduleService = new RetreatScheduleService();
