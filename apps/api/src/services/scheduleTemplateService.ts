import { AppDataSource } from '../data-source';
import { ScheduleTemplate } from '../entities/scheduleTemplate.entity';
import { ScheduleTemplateSet } from '../entities/scheduleTemplateSet.entity';
import { responsabilityAttachmentService } from './responsabilityAttachmentService';

export class ScheduleTemplateService {
	private repo = AppDataSource.getRepository(ScheduleTemplate);
	private setRepo = AppDataSource.getRepository(ScheduleTemplateSet);

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
		return this.setRepo.save(s);
	}

	async updateSet(id: string, data: Partial<ScheduleTemplateSet>): Promise<ScheduleTemplateSet | null> {
		await this.setRepo.update(id, data);
		return this.getSet(id);
	}

	async deleteSet(id: string): Promise<boolean> {
		const r = await this.setRepo.delete(id);
		return (r.affected ?? 0) > 0;
	}

	async get(id: string): Promise<ScheduleTemplate | null> {
		return this.repo.findOne({ where: { id } });
	}

	async create(data: Partial<ScheduleTemplate>): Promise<ScheduleTemplate> {
		const entity = this.repo.create(data);
		return this.repo.save(entity);
	}

	async update(id: string, data: Partial<ScheduleTemplate>): Promise<ScheduleTemplate | null> {
		await this.repo.update(id, data);
		return this.get(id);
	}

	async delete(id: string): Promise<boolean> {
		const r = await this.repo.delete(id);
		return (r.affected ?? 0) > 0;
	}
}

export const scheduleTemplateService = new ScheduleTemplateService();
