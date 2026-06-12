import { AppDataSource } from '../data-source';
import { SavedSegment, SegmentFilters } from '../entities/savedSegment.entity';

export interface CreateSavedSegmentInput {
	name: string;
	scope: 'retreat' | 'community';
	retreatId?: string | null;
	communityId?: string | null;
	filters: SegmentFilters;
	createdBy?: string | null;
}

export interface UpdateSavedSegmentInput {
	name?: string;
	filters?: SegmentFilters;
}

/**
 * CRUD de segmentos guardados. Los segmentos son combinaciones de filtros con
 * nombre, ligadas a un retiro o a una comunidad.
 */
export class SavedSegmentService {
	private get repo() {
		return AppDataSource.getRepository(SavedSegment);
	}

	async findByRetreat(retreatId: string): Promise<SavedSegment[]> {
		return this.repo.find({ where: { retreatId }, order: { name: 'ASC' } });
	}

	async findByCommunity(communityId: string): Promise<SavedSegment[]> {
		return this.repo.find({ where: { communityId }, order: { name: 'ASC' } });
	}

	async findById(id: string): Promise<SavedSegment | null> {
		return this.repo.findOne({ where: { id } });
	}

	async create(input: CreateSavedSegmentInput): Promise<SavedSegment> {
		const segment = this.repo.create({
			name: input.name,
			scope: input.scope,
			retreatId: input.scope === 'retreat' ? input.retreatId ?? null : null,
			communityId: input.scope === 'community' ? input.communityId ?? null : null,
			filters: input.filters,
			createdBy: input.createdBy ?? null,
		});
		return this.repo.save(segment);
	}

	async update(id: string, input: UpdateSavedSegmentInput): Promise<SavedSegment | null> {
		const segment = await this.findById(id);
		if (!segment) return null;
		if (input.name !== undefined) segment.name = input.name;
		if (input.filters !== undefined) segment.filters = input.filters;
		return this.repo.save(segment);
	}

	async delete(id: string): Promise<boolean> {
		const result = await this.repo.delete(id);
		return (result.affected ?? 0) > 0;
	}
}

export const savedSegmentService = new SavedSegmentService();
