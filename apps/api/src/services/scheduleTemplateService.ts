import { AppDataSource } from '../data-source';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '../entities/scheduleTemplateSet.entity';
import { responsabilityAttachmentService } from './responsabilityAttachmentService';
import { domainAuditService } from './domainAuditService';

export class ScheduleTemplateService {
	private repo = AppDataSource.getRepository(ScheduleTemplate);
	private setRepo = AppDataSource.getRepository(ScheduleTemplateSet);

	// Campos con diff completo; las notas libres (description, musicTrackUrl,
	// palanquitaNotes, planBNotes) van como metadata de tamaños, no al diff.
	private static readonly ITEM_FIELDS = [
		'name',
		'templateSetId',
		'type',
		'defaultDay',
		'defaultOrder',
		'defaultStartTime',
		'defaultDurationMinutes',
		'requiresResponsable',
		'responsabilityName',
		'locationHint',
		'isActive',
	];

	async list(templateSetId?: string): Promise<ScheduleTemplate[]> {
		const where: any = { isActive: true };
		if (templateSetId) where.templateSetId = templateSetId;
		return this.repo.find({
			where,
			order: { defaultDay: 'ASC', defaultOrder: 'ASC', defaultStartTime: 'ASC' },
		});
	}

	async listAll(templateSetId?: string): Promise<ScheduleTemplate[]> {
		const where: any = {};
		if (templateSetId) where.templateSetId = templateSetId;
		const items = await this.repo.find({
			where,
			order: { defaultDay: 'ASC', defaultOrder: 'ASC', defaultStartTime: 'ASC' },
		});
		// Adjunta `attachments` por nombre canónico de responsabilidad.
		const names = items
			.map((i) => i.responsabilityName)
			.filter((n): n is string => !!n && n.trim().length > 0);
		if (names.length) {
			const byName = await responsabilityAttachmentService.listForNames(names);
			items.forEach((i) => {
				const n = i.responsabilityName?.trim();
				(i as any).attachments = n ? (byName.get(n) ?? []) : [];
			});
		} else {
			items.forEach((i) => {
				(i as any).attachments = [];
			});
		}
		return items;
	}

	// --- Sets ---

	async listSets(): Promise<ScheduleTemplateSet[]> {
		return this.setRepo.find({ order: { isDefault: 'DESC', name: 'ASC' } });
	}

	async getSet(id: string): Promise<ScheduleTemplateSet | null> {
		return this.setRepo.findOne({ where: { id } });
	}

	async createSet(data: Partial<ScheduleTemplateSet>): Promise<ScheduleTemplateSet> {
		const s = this.setRepo.create(data);
		const saved = await this.setRepo.save(s);
		void domainAuditService.logCreate('schedule_template_set', saved.id, saved, {
			fields: ['name', 'sourceTag', 'isActive', 'isDefault'],
		});
		return saved;
	}

	async updateSet(id: string, data: Partial<ScheduleTemplateSet>): Promise<ScheduleTemplateSet | null> {
		const before = await this.getSet(id);
		if (!before) return null;
		await this.setRepo.update(id, data);
		const after = await this.getSet(id);
		void domainAuditService.logUpdate('schedule_template_set', id, before, after, {
			fields: ['name', 'sourceTag', 'isActive', 'isDefault'],
		});
		return after;
	}

	async deleteSet(id: string): Promise<boolean> {
		const before = await this.getSet(id);
		// Contar antes del delete: el cascade borra los ítems junto con el set.
		const cascadeItems = await this.repo.count({ where: { templateSetId: id } });
		const r = await this.setRepo.delete(id);
		if ((r.affected ?? 0) > 0 && before) {
			void domainAuditService.logDelete('schedule_template_set', id, before, {
				fields: ['name', 'sourceTag', 'isActive', 'isDefault'],
				metadata: { cascadeItems },
			});
		}
		return (r.affected ?? 0) > 0;
	}

	// --- Items ---

	async get(id: string): Promise<ScheduleTemplate | null> {
		return this.repo.findOne({ where: { id } });
	}

	async create(data: Partial<ScheduleTemplate>): Promise<ScheduleTemplate> {
		const entity = this.repo.create(data);
		const saved = await this.repo.save(entity);
		void domainAuditService.logCreate('schedule_template', saved.id, saved, {
			fields: ScheduleTemplateService.ITEM_FIELDS,
			metadata: notesMetadata(saved),
		});
		return saved;
	}

	async update(id: string, data: Partial<ScheduleTemplate>): Promise<ScheduleTemplate | null> {
		const before = await this.get(id);
		if (!before) return null;
		await this.repo.update(id, data);
		const after = await this.get(id);
		void domainAuditService.logUpdate('schedule_template', id, before, after, {
			fields: ScheduleTemplateService.ITEM_FIELDS,
			metadata: notesMetadata(after, before),
		});
		return after;
	}

	async delete(id: string): Promise<boolean> {
		const before = await this.get(id);
		const r = await this.repo.delete(id);
		if ((r.affected ?? 0) > 0 && before) {
			void domainAuditService.logDelete('schedule_template', id, before, {
				fields: ScheduleTemplateService.ITEM_FIELDS,
				metadata: notesMetadata(before),
			});
		}
		return (r.affected ?? 0) > 0;
	}
}

/** Tamaños de las notas libres: avisan si cambiaron sin volcar el texto al diff. */
function notesMetadata(item?: ScheduleTemplate | null, prev?: ScheduleTemplate | null) {
	if (!item) return undefined;
	const size = (s: string | null | undefined) => (s ? s.length : 0);
	const meta: Record<string, number> = {};
	for (const key of ['description', 'musicTrackUrl', 'palanquitaNotes', 'planBNotes'] as const) {
		const now = size(item[key]);
		const was = prev ? size(prev[key]) : 0;
		if (prev ? now !== was : now > 0) meta[`${key}Chars`] = now;
	}
	return Object.keys(meta).length ? meta : undefined;
}

export const scheduleTemplateService = new ScheduleTemplateService();
