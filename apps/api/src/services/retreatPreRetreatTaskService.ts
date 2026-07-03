import { AppDataSource } from '../data-source';
import { computeDueDate, computeTaskProgress } from '@repo/types';
import { RetreatPreRetreatTask } from '../entities/retreatPreRetreatTask.entity';
import type { PreRetreatTaskStatus } from '../entities/retreatPreRetreatTask.entity';
import { PreRetreatTaskTemplate } from '../entities/preRetreatTaskTemplate.entity';
import { PreRetreatTaskTemplateSet } from '../entities/preRetreatTaskTemplateSet.entity';
import { Retreat } from '../entities/retreat.entity';

export class PreRetreatTaskNotFoundError extends Error {
	constructor(msg = 'Tarea no encontrada') {
		super(msg);
	}
}

/** DTO de lectura: tarea con responsable lite, hijos anidados y progreso. */
export interface PreRetreatTaskDTO {
	id: string;
	retreatId: string;
	templateId?: string | null;
	parentId?: string | null;
	name: string;
	description?: string | null;
	dueOffsetDays?: number | null;
	dueDate?: string | null;
	status: PreRetreatTaskStatus;
	responsibleParticipantId?: string | null;
	responsibleText?: string | null;
	notes?: string | null;
	supportNotes?: string | null;
	sortOrder: number;
	completedAt?: Date | null;
	responsible?: {
		id: string;
		firstName?: string | null;
		lastName?: string | null;
		nickname?: string | null;
	} | null;
	children?: PreRetreatTaskDTO[];
	progress?: { done: number; total: number };
	createdAt?: Date;
	updatedAt?: Date;
}

/** Normaliza retreat.startDate (Date o string SQLite) a 'YYYY-MM-DD...' para computeDueDate. */
function startDateString(value: Date | string | null | undefined): string | null {
	if (!value) return null;
	if (value instanceof Date) return value.toISOString();
	return String(value);
}

const norm = (s: string | null | undefined) => (s ?? '').trim().toLowerCase();

export class RetreatPreRetreatTaskService {
	private get repo() {
		return AppDataSource.getRepository(RetreatPreRetreatTask);
	}
	private get templateRepo() {
		return AppDataSource.getRepository(PreRetreatTaskTemplate);
	}
	private get setRepo() {
		return AppDataSource.getRepository(PreRetreatTaskTemplateSet);
	}
	private get retreatRepo() {
		return AppDataSource.getRepository(Retreat);
	}

	private toDTO(t: RetreatPreRetreatTask): PreRetreatTaskDTO {
		return {
			id: t.id,
			retreatId: t.retreatId,
			templateId: t.templateId ?? null,
			parentId: t.parentId ?? null,
			name: t.name,
			description: t.description ?? null,
			dueOffsetDays: t.dueOffsetDays ?? null,
			dueDate: t.dueDate ?? null,
			status: t.status,
			responsibleParticipantId: t.responsibleParticipantId ?? null,
			responsibleText: t.responsibleText ?? null,
			notes: t.notes ?? null,
			supportNotes: t.supportNotes ?? null,
			sortOrder: t.sortOrder,
			completedAt: t.completedAt ?? null,
			responsible: t.responsible
				? {
						id: t.responsible.id,
						firstName: t.responsible.firstName ?? null,
						lastName: t.responsible.lastName ?? null,
						nickname: t.responsible.nickname ?? null,
					}
				: null,
			createdAt: t.createdAt,
			updatedAt: t.updatedAt,
		};
	}

	/**
	 * Árbol de tareas del retiro: raíces con `children` y `progress`, ordenadas
	 * por dueDate ASC (null al final) y sortOrder como desempate.
	 */
	async listForRetreat(retreatId: string): Promise<PreRetreatTaskDTO[]> {
		const rows = await this.repo.find({
			where: { retreatId },
			relations: ['responsible'],
		});
		const dtos = rows.map((r) => this.toDTO(r));
		const byId = new Map(dtos.map((d) => [d.id, d]));

		const cmp = (a: PreRetreatTaskDTO, b: PreRetreatTaskDTO) => {
			const da = a.dueDate ?? '9999-99-99';
			const db = b.dueDate ?? '9999-99-99';
			if (da !== db) return da < db ? -1 : 1;
			if (a.sortOrder !== b.sortOrder) return a.sortOrder - b.sortOrder;
			return a.name.localeCompare(b.name);
		};

		const roots: PreRetreatTaskDTO[] = [];
		for (const d of dtos) {
			const parent = d.parentId ? byId.get(d.parentId) : undefined;
			if (parent) {
				(parent.children ??= []).push(d);
			} else {
				roots.push(d);
			}
		}
		for (const r of roots) {
			if (r.children) {
				r.children.sort(cmp);
				r.progress = computeTaskProgress(r.children);
			} else {
				r.children = [];
				r.progress = { done: 0, total: 0 };
			}
		}
		roots.sort(cmp);
		return roots;
	}

	async get(id: string): Promise<RetreatPreRetreatTask | null> {
		return this.repo.findOne({ where: { id }, relations: ['responsible'] });
	}

	private async assertValidParent(
		retreatId: string,
		parentId: string,
		childId?: string,
	): Promise<RetreatPreRetreatTask> {
		if (childId && parentId === childId) {
			throw new Error('Una tarea no puede ser su propio padre');
		}
		const parent = await this.repo.findOne({ where: { id: parentId } });
		if (!parent) throw new Error('La tarea padre no existe');
		if (parent.retreatId !== retreatId) {
			throw new Error('La tarea padre pertenece a otro retiro');
		}
		if (parent.parentId) {
			throw new Error('Solo se permiten dos niveles: la tarea padre ya es una sub-tarea');
		}
		return parent;
	}

	async create(
		retreatId: string,
		data: Partial<RetreatPreRetreatTask>,
	): Promise<PreRetreatTaskDTO> {
		if (data.parentId) {
			await this.assertValidParent(retreatId, data.parentId);
		}
		const payload: Partial<RetreatPreRetreatTask> = { ...data, retreatId };
		// Offset sin fecha explícita → derivar dueDate del startDate del retiro.
		if (payload.dueOffsetDays != null && payload.dueDate == null) {
			const retreat = await this.retreatRepo.findOne({ where: { id: retreatId } });
			payload.dueDate = computeDueDate(
				startDateString(retreat?.startDate),
				payload.dueOffsetDays,
			);
		}
		if (payload.status === 'done') payload.completedAt = new Date();
		const saved = await this.repo.save(this.repo.create(payload));
		const full = await this.get(saved.id);
		return this.toDTO(full ?? saved);
	}

	async update(
		id: string,
		data: Partial<RetreatPreRetreatTask>,
	): Promise<PreRetreatTaskDTO | null> {
		const existing = await this.repo.findOne({ where: { id } });
		if (!existing) return null;
		if (data.parentId) {
			const childCount = await this.repo.count({ where: { parentId: id } });
			if (childCount > 0) {
				throw new Error('La tarea tiene sub-tareas; no puede convertirse en sub-tarea');
			}
			await this.assertValidParent(existing.retreatId, data.parentId, id);
		}
		const patch: Partial<RetreatPreRetreatTask> = { ...data };
		// Cambió el offset sin mandar fecha → recalcular contra el retiro.
		if (patch.dueOffsetDays != null && patch.dueDate === undefined) {
			const retreat = await this.retreatRepo.findOne({ where: { id: existing.retreatId } });
			patch.dueDate = computeDueDate(startDateString(retreat?.startDate), patch.dueOffsetDays);
		}
		if (patch.status && patch.status !== existing.status) {
			patch.completedAt = patch.status === 'done' ? new Date() : null;
		}
		await this.repo.update(id, patch);
		const updated = await this.get(id);
		return updated ? this.toDTO(updated) : null;
	}

	async setStatus(id: string, status: PreRetreatTaskStatus): Promise<PreRetreatTaskDTO> {
		const existing = await this.repo.findOne({ where: { id } });
		if (!existing) throw new PreRetreatTaskNotFoundError();
		await this.repo.update(id, {
			status,
			completedAt: status === 'done' ? new Date() : null,
		});
		const updated = await this.get(id);
		return this.toDTO(updated!);
	}

	async remove(id: string): Promise<boolean> {
		const r = await this.repo.delete(id);
		return (r.affected ?? 0) > 0;
	}

	private async resolveTemplateSet(
		templateSetId?: string,
	): Promise<PreRetreatTaskTemplateSet | null> {
		if (templateSetId) return this.setRepo.findOne({ where: { id: templateSetId } });
		return this.setRepo.findOne({ where: { isDefault: true, isActive: true } });
	}

	/**
	 * Clona el template al retiro. Dos pasadas: raíces primero (map templateId →
	 * instanceId), luego hijos con parentId mapeado. El offset efectivo de un
	 * hijo con dueOffsetDays null es el del padre. dueDate = base − offset.
	 */
	async materializeFromTemplate(
		retreatId: string,
		templateSetId?: string,
		clearExisting = false,
		baseDate?: string,
	): Promise<PreRetreatTaskDTO[]> {
		const retreat = await this.retreatRepo.findOne({ where: { id: retreatId } });
		if (!retreat) throw new Error('Retiro no encontrado');
		const set = await this.resolveTemplateSet(templateSetId);
		if (!set) throw new Error('No hay template de tareas pre-retiro disponible');

		const base = baseDate ?? startDateString(retreat.startDate);
		const templates = await this.templateRepo.find({
			where: { templateSetId: set.id, isActive: true },
			order: { defaultOrder: 'ASC' },
		});

		if (clearExisting) {
			await this.repo.delete({ retreatId });
		}

		const roots = templates.filter((t) => !t.parentId);
		const children = templates.filter((t) => t.parentId);
		const rootOffsetById = new Map(roots.map((t) => [t.id, t.dueOffsetDays ?? null]));
		const instanceIdByTemplateId = new Map<string, string>();

		for (const t of roots) {
			const saved = await this.repo.save(
				this.repo.create({
					retreatId,
					templateId: t.id,
					parentId: null,
					name: t.name,
					description: t.description ?? null,
					dueOffsetDays: t.dueOffsetDays ?? null,
					dueDate: t.dueOffsetDays != null ? computeDueDate(base, t.dueOffsetDays) : null,
					supportNotes: t.supportNotes ?? null,
					sortOrder: t.defaultOrder,
					status: 'pending',
				}),
			);
			instanceIdByTemplateId.set(t.id, saved.id);
		}

		for (const t of children) {
			const parentInstanceId = t.parentId
				? instanceIdByTemplateId.get(t.parentId)
				: undefined;
			// Padre inactivo/no materializado → materializar el hijo como raíz suelta
			// sería confuso; lo saltamos.
			if (!parentInstanceId) continue;
			const effectiveOffset = t.dueOffsetDays ?? rootOffsetById.get(t.parentId!) ?? null;
			await this.repo.save(
				this.repo.create({
					retreatId,
					templateId: t.id,
					parentId: parentInstanceId,
					name: t.name,
					description: t.description ?? null,
					dueOffsetDays: t.dueOffsetDays ?? null,
					dueDate: effectiveOffset != null ? computeDueDate(base, effectiveOffset) : null,
					supportNotes: t.supportNotes ?? null,
					sortOrder: t.defaultOrder,
					status: 'pending',
				}),
			);
		}

		return this.listForRetreat(retreatId);
	}

	/**
	 * Agrega solo los items del template que el retiro aún no tiene. Detecta
	 * duplicados por templateId y por clave (nombre del padre, nombre) normalizada
	 * — análogo al (day, name) del Minuto a Minuto.
	 */
	async addMissingTemplateItems(
		retreatId: string,
		templateSetId?: string,
		baseDate?: string,
	): Promise<{ added: number; skipped: number; total: number }> {
		const retreat = await this.retreatRepo.findOne({ where: { id: retreatId } });
		if (!retreat) throw new Error('Retiro no encontrado');
		const set = await this.resolveTemplateSet(templateSetId);
		if (!set) throw new Error('No hay template de tareas pre-retiro disponible');

		const base = baseDate ?? startDateString(retreat.startDate);
		const templates = await this.templateRepo.find({
			where: { templateSetId: set.id, isActive: true },
			order: { defaultOrder: 'ASC' },
		});
		const existing = await this.repo.find({ where: { retreatId } });

		const existingByTemplateId = new Set(
			existing.map((e) => e.templateId).filter((x): x is string => !!x),
		);
		const existingById = new Map(existing.map((e) => [e.id, e]));
		const pairKey = (parentName: string | null | undefined, name: string) =>
			`${norm(parentName)}__${norm(name)}`;
		const existingKeys = new Set(
			existing.map((e) => {
				const parent = e.parentId ? existingById.get(e.parentId) : undefined;
				return pairKey(parent?.name ?? null, e.name);
			}),
		);

		const templateById = new Map(templates.map((t) => [t.id, t]));
		const rootOffsetById = new Map(
			templates.filter((t) => !t.parentId).map((t) => [t.id, t.dueOffsetDays ?? null]),
		);
		// instanceId de la raíz correspondiente a cada template raíz (existente o creada)
		const rootInstanceByTemplateId = new Map<string, string>();
		for (const e of existing) {
			if (e.templateId && !e.parentId) rootInstanceByTemplateId.set(e.templateId, e.id);
		}
		// fallback por nombre para raíces creadas a mano desde el template
		const rootInstanceByName = new Map(
			existing.filter((e) => !e.parentId).map((e) => [norm(e.name), e.id]),
		);

		let added = 0;
		let skipped = 0;

		const isDuplicate = (t: PreRetreatTaskTemplate) => {
			if (existingByTemplateId.has(t.id)) return true;
			const parentName = t.parentId ? (templateById.get(t.parentId)?.name ?? null) : null;
			return existingKeys.has(pairKey(parentName, t.name));
		};

		// Raíces primero para que los hijos nuevos encuentren su ancla.
		for (const t of templates.filter((x) => !x.parentId)) {
			if (isDuplicate(t)) {
				skipped++;
				continue;
			}
			const saved = await this.repo.save(
				this.repo.create({
					retreatId,
					templateId: t.id,
					parentId: null,
					name: t.name,
					description: t.description ?? null,
					dueOffsetDays: t.dueOffsetDays ?? null,
					dueDate: t.dueOffsetDays != null ? computeDueDate(base, t.dueOffsetDays) : null,
					supportNotes: t.supportNotes ?? null,
					sortOrder: t.defaultOrder,
					status: 'pending',
				}),
			);
			rootInstanceByTemplateId.set(t.id, saved.id);
			rootInstanceByName.set(norm(t.name), saved.id);
			added++;
		}

		for (const t of templates.filter((x) => !!x.parentId)) {
			if (isDuplicate(t)) {
				skipped++;
				continue;
			}
			const parentTemplate = templateById.get(t.parentId!);
			const parentInstanceId =
				rootInstanceByTemplateId.get(t.parentId!) ??
				(parentTemplate ? rootInstanceByName.get(norm(parentTemplate.name)) : undefined);
			if (!parentInstanceId) {
				skipped++;
				continue;
			}
			const effectiveOffset = t.dueOffsetDays ?? rootOffsetById.get(t.parentId!) ?? null;
			await this.repo.save(
				this.repo.create({
					retreatId,
					templateId: t.id,
					parentId: parentInstanceId,
					name: t.name,
					description: t.description ?? null,
					dueOffsetDays: t.dueOffsetDays ?? null,
					dueDate: effectiveOffset != null ? computeDueDate(base, effectiveOffset) : null,
					supportNotes: t.supportNotes ?? null,
					sortOrder: t.defaultOrder,
					status: 'pending',
				}),
			);
			added++;
		}

		return { added, skipped, total: templates.length };
	}
}

export const retreatPreRetreatTaskService = new RetreatPreRetreatTaskService();
