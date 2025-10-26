import { DataSource, Repository, Not, IsNull } from 'typeorm';
import { Participant } from '../entities/participant.entity';
import { RetreatBed } from '../entities/retreatBed.entity';

export class BedQueryUtils {
	private participantRepository: Repository<Participant>;
	private retreatBedRepository: Repository<RetreatBed>;

	constructor(dataSource?: DataSource) {
		const source = dataSource || AppDataSource;
		this.participantRepository = source.getRepository(Participant);
		this.retreatBedRepository = source.getRepository(RetreatBed);
	}

	/**
	 * Find a participant with their assigned bed information
	 */
	async findParticipantWithBed(
		participantId: string,
		includeBedInfo: boolean = true,
	): Promise<Participant | null> {
		const relations = ['retreat', 'tableMesa'];

		if (includeBedInfo) {
			relations.push('retreatBed');
			relations.push('retreatBed.retreat');
		}

		const participant = await this.participantRepository.findOne({
			where: { id: participantId },
			relations,
		});

		return participant;
	}

	/**
	 * Find multiple participants with their bed assignments
	 */
	async findParticipantsWithBeds(
		where: any = {},
		options: {
			includeBedInfo?: boolean;
			includeRelations?: string[];
		} = {},
	): Promise<Participant[]> {
		const { includeBedInfo = true, includeRelations = [] } = options;

		const relations = ['retreat', 'tableMesa', ...includeRelations];

		if (includeBedInfo) {
			relations.push('retreatBed');
			relations.push('retreatBed.retreat');
		}

		const participants = await this.participantRepository.find({
			where,
			relations,
		});

		return participants;
	}

	/**
	 * Get bed assignment information for a participant
	 */
	async getParticipantBedAssignment(participantId: string): Promise<RetreatBed | null> {
		return await this.retreatBedRepository.findOne({
			where: { participantId },
			relations: ['retreat'],
		});
	}

	/**
	 * Check if a participant has a bed assigned
	 */
	async participantHasBedAssignment(participantId: string): Promise<boolean> {
		const count = await this.retreatBedRepository.count({
			where: { participantId },
		});
		return count > 0;
	}

	/**
	 * Get bed location string for a participant
	 */
	async getParticipantBedLocation(participantId: string): Promise<string> {
		const bed = await this.getParticipantBedAssignment(participantId);
		if (!bed) return '';
		return `Room ${bed.roomNumber}, Bed ${bed.bedNumber}`;
	}

	/**
	 * Find participants by bed criteria
	 */
	async findParticipantsByBedCriteria(
		retreatId: string,
		bedCriteria?: {
			roomNumber?: string;
			bedNumber?: string;
			bedType?: string;
			floor?: number;
		},
	): Promise<Participant[]> {
		const bedWhereClause: any = { retreatId };

		if (bedCriteria) {
			if (bedCriteria.roomNumber) bedWhereClause.roomNumber = bedCriteria.roomNumber;
			if (bedCriteria.bedNumber) bedWhereClause.bedNumber = bedCriteria.bedNumber;
			if (bedCriteria.bedType) bedWhereClause.type = bedCriteria.bedType;
			if (bedCriteria.floor) bedWhereClause.floor = bedCriteria.floor;
		}

		const assignedBeds = await this.retreatBedRepository.find({
			where: bedWhereClause,
			relations: ['retreat'],
		});

		if (assignedBeds.length === 0) return [];

		const participantIds = assignedBeds
			.filter((bed) => bed.participantId)
			.map((bed) => bed.participantId!);

		return await this.participantRepository.find({
			where: { id: participantIds as any, isCancelled: false },
			relations: ['retreat', 'tableMesa'],
		});
	}

	/**
	 * Get assignment statistics for a retreat
	 */
	async getRetreatAssignmentStats(retreatId: string): Promise<{
		totalParticipants: number;
		participantsWithBeds: number;
		totalBeds: number;
		assignedBeds: number;
		availableBeds: number;
	}> {
		const [totalParticipants, totalBeds, assignedBeds] = await Promise.all([
			this.participantRepository.count({
				where: { retreatId, isCancelled: false },
			}),
			this.retreatBedRepository.count({
				where: { retreatId },
			}),
			this.retreatBedRepository.count({
				where: { retreatId, participantId: Not(IsNull()) },
			}),
		]);

		const participantsWithBeds = assignedBeds; // Since we have single source of truth
		const availableBeds = totalBeds - assignedBeds;

		return {
			totalParticipants,
			participantsWithBeds,
			totalBeds,
			assignedBeds,
			availableBeds,
		};
	}
}

// Import AppDataSource
import { AppDataSource } from '../data-source';
