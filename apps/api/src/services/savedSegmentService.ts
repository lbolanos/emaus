import { AppDataSource } from '../data-source';
import { SavedSegment, SegmentFilters } from '../entities/savedSegment.entity';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';

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

	/**
	 * Evalúa los filtros de un segmento EN VIVO contra los participantes de un
	 * retiro y devuelve los que matchean. La fuente per-retiro de type /
	 * isCancelled / attendance es `retreat_participants`; `paymentStatus` es un
	 * getter computado (depende de payments + retreat.cost), así que se evalúa en
	 * memoria sobre los candidatos cargados con sus relaciones.
	 */
	async evaluateFilters(retreatId: string, filters: SegmentFilters): Promise<Participant[]> {
		const wantCancelled = filters.cancelStatus === 'canceled';
		const rps = await AppDataSource.getRepository(RetreatParticipant).find({
			where: { retreatId, isCancelled: wantCancelled },
			relations: ['participant', 'participant.payments', 'participant.tags'],
		});
		const retreat = await AppDataSource.getRepository(Retreat).findOne({ where: { id: retreatId } });

		let participants = rps
			.filter((rp) => !!rp.participant)
			.map((rp) => {
				const p = rp.participant as Participant;
				// Enriquecer con datos per-retiro para getters/filtros.
				(p as any).type = rp.type;
				(p as any).retreat = retreat;
				(p as any).__attendance = (rp as any).attendanceConfirmation ?? 'pending';
				return p;
			});

		if (filters.participantType) {
			participants = participants.filter((p) => (p as any).type === filters.participantType);
		}
		if (filters.maritalStatus) {
			participants = participants.filter((p) => p.maritalStatus === filters.maritalStatus);
		}
		if (filters.attendanceFilter && filters.attendanceFilter !== 'all') {
			participants = participants.filter((p) => (p as any).__attendance === filters.attendanceFilter);
		}
		if (filters.paymentStatus) {
			participants = participants.filter((p) => p.paymentStatus === filters.paymentStatus);
		}
		if (filters.tagIds?.length) {
			const want = new Set(filters.tagIds);
			participants = participants.filter((p) =>
				(p.tags || []).some((pt: any) => want.has(pt.tagId)),
			);
		}
		if (filters.search?.trim()) {
			const q = filters.search.trim().toLowerCase();
			participants = participants.filter((p) =>
				`${p.firstName ?? ''} ${p.lastName ?? ''} ${p.email ?? ''} ${(p as any).nickname ?? ''}`
					.toLowerCase()
					.includes(q),
			);
		}
		return participants;
	}
}

export const savedSegmentService = new SavedSegmentService();
