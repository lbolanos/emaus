import { AppDataSource } from '../data-source';
import { PreRetreatTaskTemplate } from '../entities/preRetreatTaskTemplate.entity';
import { PreRetreatTaskTemplateSet } from '../entities/preRetreatTaskTemplateSet.entity';

export class PreRetreatTaskTemplateService {
	private get repo() {
		return AppDataSource.getRepository(PreRetreatTaskTemplate);
	}
	private get setRepo() {
		return AppDataSource.getRepository(PreRetreatTaskTemplateSet);
	}

	// --- Sets ---

	async listSets(): Promise<PreRetreatTaskTemplateSet[]> {
		return this.setRepo.find({ order: { isDefault: 'DESC', name: 'ASC' } });
	}

	async getSet(id: string): Promise<PreRetreatTaskTemplateSet | null> {
		return this.setRepo.findOne({ where: { id } });
	}

	async createSet(data: Partial<PreRetreatTaskTemplateSet>): Promise<PreRetreatTaskTemplateSet> {
		return this.setRepo.save(this.setRepo.create(data));
	}

	async updateSet(
		id: string,
		data: Partial<PreRetreatTaskTemplateSet>,
	): Promise<PreRetreatTaskTemplateSet | null> {
		await this.setRepo.update(id, data);
		return this.getSet(id);
	}

	async deleteSet(id: string): Promise<boolean> {
		const r = await this.setRepo.delete(id);
		return (r.affected ?? 0) > 0;
	}

	// --- Items ---

	/** Lista plana (raíces + hijos con parentId); el árbol lo arma el cliente. */
	async listAll(templateSetId?: string): Promise<PreRetreatTaskTemplate[]> {
		const where: Record<string, unknown> = {};
		if (templateSetId) where.templateSetId = templateSetId;
		return this.repo.find({ where, order: { defaultOrder: 'ASC', name: 'ASC' } });
	}

	async get(id: string): Promise<PreRetreatTaskTemplate | null> {
		return this.repo.findOne({ where: { id } });
	}

	/**
	 * Valida la regla de profundidad 2: el padre debe existir, pertenecer al
	 * mismo set y ser raíz (sin padre a su vez).
	 */
	private async assertValidParent(
		parentId: string,
		templateSetId?: string | null,
		childId?: string,
	): Promise<void> {
		if (childId && parentId === childId) {
			throw new Error('Una tarea no puede ser su propio padre');
		}
		const parent = await this.get(parentId);
		if (!parent) throw new Error('La tarea padre no existe');
		if (parent.parentId) {
			throw new Error('Solo se permiten dos niveles: la tarea padre ya es una sub-tarea');
		}
		if (templateSetId && parent.templateSetId && parent.templateSetId !== templateSetId) {
			throw new Error('La tarea padre pertenece a otro template');
		}
	}

	async create(data: Partial<PreRetreatTaskTemplate>): Promise<PreRetreatTaskTemplate> {
		if (data.parentId) {
			await this.assertValidParent(data.parentId, data.templateSetId);
		}
		return this.repo.save(this.repo.create(data));
	}

	async update(
		id: string,
		data: Partial<PreRetreatTaskTemplate>,
	): Promise<PreRetreatTaskTemplate | null> {
		const existing = await this.get(id);
		if (!existing) return null;
		if (data.parentId) {
			// Una raíz con hijos no puede volverse sub-tarea (crearía nivel 3).
			const childCount = await this.repo.count({ where: { parentId: id } });
			if (childCount > 0) {
				throw new Error('La tarea tiene sub-tareas; no puede convertirse en sub-tarea');
			}
			await this.assertValidParent(data.parentId, data.templateSetId ?? existing.templateSetId, id);
		}
		await this.repo.update(id, data);
		return this.get(id);
	}

	async delete(id: string): Promise<boolean> {
		const r = await this.repo.delete(id);
		return (r.affected ?? 0) > 0;
	}
}

export const preRetreatTaskTemplateService = new PreRetreatTaskTemplateService();
