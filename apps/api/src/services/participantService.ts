import { AppDataSource } from '../data-source';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { TableMesa } from '../entities/tableMesa.entity';
import { RetreatBed, BedUsage, BedType } from '../entities/retreatBed.entity';
import { MessageTemplate } from '../entities/messageTemplate.entity';
import { Payment } from '../entities/payment.entity';
import { CreateParticipant, UpdateParticipant } from '@repo/types';
import { rebalanceTablesForRetreat, assignLeaderToTable } from './tableMesaService';
import { EmailService } from './emailService';
import { BedQueryUtils } from '../utils/bedQueryUtils';
import { In, Not, IsNull, ILike, Brackets } from 'typeorm';
import {
	createHistoryEntry,
	autoSetPrimaryRetreat,
	CreateHistoryData,
} from './participantHistoryService';
import { ParticipantHistory } from '../entities/participantHistory.entity';

const participantRepository = AppDataSource.getRepository(Participant);
const tableMesaRepository = AppDataSource.getRepository(TableMesa);
const paymentRepository = AppDataSource.getRepository(Payment);

// ==================== PARTICIPANT LOOKUP FUNCTIONS ====================

/**
 * Find participant by email (searches all retreats)
 * Returns the most recent participant record for this email
 */
export const findParticipantByEmail = async (email: string): Promise<Participant | null> => {
	return await participantRepository.findOne({
		where: { email },
		order: { registrationDate: 'DESC' }, // Most recent first
	});
};

/**
 * Check if a participant exists by email (for server registration flow)
 * Returns existence status and participant details if found
 */
export const checkParticipantExists = async (
	email: string,
): Promise<{ exists: boolean; participant?: Participant; message?: string }> => {
	const existing = await findParticipantByEmail(email);

	if (!existing) {
		return { exists: false };
	}

	return {
		exists: true,
		participant: existing,
		message: `Se encontró un registro existente para ${email} (${existing.firstName} ${existing.lastName})`,
	};
};

// Create BedQueryUtils instance
const bedQueryUtils = new BedQueryUtils();

export const findAllParticipants = async (
	retreatId?: string,
	type?: 'walker' | 'server' | 'waiting' | 'partial_server',
	isCancelled?: boolean,
	relations: string[] = [],
	includePayments: boolean = false,
	tagIds?: string[],
): Promise<Participant[]> => {
	if (!retreatId) {
		throw new Error('retreatId is required');
	}

	// Always include payments, retreat, and tags relations for payment calculations and tag display
	const allRelations = [...new Set([...relations, 'payments', 'retreat', 'tags', 'tags.tag'])];
	if (includePayments) {
		allRelations.push('payments.recordedByUser');
	}

	const queryBuilder = participantRepository.createQueryBuilder('participant');

	// Apply base relations
	allRelations.forEach((relation) => {
		const parts = relation.split('.');
		if (parts.length === 1) {
			if (parts[0] === 'retreatBed') {
				// Scope retreatBed JOIN to the same retreat as the participant
				// to avoid picking up stale beds from other retreats
				queryBuilder.leftJoinAndSelect(
					'participant.retreatBed',
					'retreatBed',
					'retreatBed.retreatId = participant.retreatId',
				);
			} else {
				queryBuilder.leftJoinAndSelect(`participant.${parts[0]}`, parts[0]);
			}
		} else {
			// Handle nested relations like 'tags.tag'
			queryBuilder.leftJoinAndSelect(`${parts[0]}.${parts[1]}`, parts[1]);
		}
	});

	// Apply base filters
	queryBuilder.where('participant.retreatId = :retreatId', { retreatId });

	if (type) {
		queryBuilder.andWhere('participant.type = :type', { type });
	}

	if (typeof isCancelled === 'boolean') {
		queryBuilder.andWhere('participant.isCancelled = :isCancelled', { isCancelled });
	}

	// Apply tag filter if provided
	if (tagIds && tagIds.length > 0) {
		const subQuery = queryBuilder
			.subQuery()
			.select('pt.participantId')
			.from('participant_tags', 'pt')
			.where('pt.tagId IN (:...tagIds)')
			.getQuery();
		queryBuilder.andWhere(`participant.id IN ${subQuery}`);
		queryBuilder.setParameter('tagIds', tagIds);
	}

	const participants = await queryBuilder
		.orderBy('participant.lastName', 'ASC')
		.addOrderBy('participant.firstName', 'ASC')
		.getMany();

	// Enrich servers who are table leaders (lider/colider1/colider2) but have no tableId.
	// Their table assignment lives on the tables entity, not on participant.tableId.
	if (allRelations.includes('tableMesa')) {
		const serversWithoutTable = participants.filter(
			(p) => !p.tableMesa && (p.type === 'server' || p.type === 'partial_server'),
		);
		if (serversWithoutTable.length > 0) {
			const serverIds = serversWithoutTable.map((p) => p.id);
			const leaderTables = await AppDataSource.getRepository(TableMesa)
				.createQueryBuilder('t')
				.where('t.retreatId = :retreatId', { retreatId })
				.andWhere(
					'(t.liderId IN (:...serverIds) OR t.colider1Id IN (:...serverIds) OR t.colider2Id IN (:...serverIds))',
					{ serverIds },
				)
				.getMany();

			// Build a map: participantId → TableMesa
			const leaderTableMap = new Map<string, TableMesa>();
			for (const table of leaderTables) {
				if (table.liderId && serverIds.includes(table.liderId)) {
					leaderTableMap.set(table.liderId, table);
				}
				if (table.colider1Id && serverIds.includes(table.colider1Id)) {
					leaderTableMap.set(table.colider1Id, table);
				}
				if (table.colider2Id && serverIds.includes(table.colider2Id)) {
					leaderTableMap.set(table.colider2Id, table);
				}
			}

			// Attach table info to participants
			for (const participant of serversWithoutTable) {
				const table = leaderTableMap.get(participant.id);
				if (table) {
					participant.tableMesa = table;
				}
			}
		}
	}

	return participants;
};

export const findParticipantById = async (
	id: string,
	includePayments: boolean = false,
): Promise<Participant | null> => {
	const relations = ['retreat', 'tableMesa', 'retreatBed', 'tags', 'tags.tag'];
	if (includePayments) {
		relations.push('payments', 'payments.recordedByUser');
	}

	const participant = await participantRepository.findOne({
		where: { id },
		relations,
	});

	// Enrich server leaders who have no tableId but are lider/colider on a table
	if (
		participant &&
		!participant.tableMesa &&
		(participant.type === 'server' || participant.type === 'partial_server')
	) {
		const leaderTable = await AppDataSource.getRepository(TableMesa)
			.createQueryBuilder('t')
			.where(
				'(t.liderId = :pid OR t.colider1Id = :pid OR t.colider2Id = :pid)',
				{ pid: participant.id },
			)
			.getOne();
		if (leaderTable) {
			participant.tableMesa = leaderTable;
		}
	}

	return participant;
};

// ==================== BED SCORING SYSTEM ====================

const BED_SCORING_CONFIG = {
	ageSigmoidMidpoint: 55,
	ageSigmoidSteepness: 0.15,
	snoringMatchBonus: 25,
	snoringMismatchPenalty: -30,
	floorPenaltyPerLevel: 5,
	walkerYoungPrefs: { litera_arriba: 100, litera_abajo: 80, normal: 60, colchon: 20 } as Record<string, number>,
	walkerOldPrefs: { normal: 100, litera_abajo: 85, colchon: 40, litera_arriba: 5 } as Record<string, number>,
	serverYoungPrefs: { colchon: 100, litera_abajo: 80, litera_arriba: 60, normal: 40 } as Record<string, number>,
	serverOldPrefs: { litera_abajo: 100, normal: 90, colchon: 50, litera_arriba: 30 } as Record<string, number>,
};

/**
 * Sigmoid function returning 0 (young) to 1 (old).
 * Age 20→0.004, 40→0.09, 50→0.33, 55→0.50, 65→0.88, 80→0.99
 */
const computeAgePenaltyFactor = (age: number): number => {
	return 1 / (1 + Math.exp(-BED_SCORING_CONFIG.ageSigmoidSteepness * (age - BED_SCORING_CONFIG.ageSigmoidMidpoint)));
};

/** Map from roomNumber → 'snorer' | 'non-snorer' | 'empty' */
type RoomSnoreStatusMap = Map<string, 'snorer' | 'non-snorer' | 'empty'>;

/**
 * Build a map of room snoring status for the entire retreat in a single query.
 */
const buildRoomSnoreStatusMap = async (
	retreatBedRepository: any,
	retreatId: string,
): Promise<RoomSnoreStatusMap> => {
	const rows = await retreatBedRepository
		.createQueryBuilder('bed')
		.select('bed.roomNumber', 'roomNumber')
		.addSelect('p.snores', 'snores')
		.innerJoin('bed.participant', 'p')
		.where('bed.retreatId = :retreatId', { retreatId })
		.getRawMany();

	const map: RoomSnoreStatusMap = new Map();
	for (const row of rows) {
		const room = row.roomNumber as string;
		const snores = row.snores;
		if (!map.has(room)) {
			map.set(room, snores ? 'snorer' : 'non-snorer');
		} else {
			// If room already has a status and a new occupant disagrees, keep existing
			// (first occupant determines room status)
		}
	}
	return map;
};

/**
 * Incrementally update the snore map after assigning a participant to a bed.
 */
const updateRoomSnoreStatus = (
	map: RoomSnoreStatusMap,
	participant: Participant,
	bed: RetreatBed,
): void => {
	const room = bed.roomNumber;
	if (!map.has(room)) {
		map.set(room, participant.snores ? 'snorer' : 'non-snorer');
	}
};

/**
 * Score a single bed for a participant. Higher is better.
 */
const scoreBedForParticipant = (
	participant: Participant,
	bed: RetreatBed,
	roomSnoreStatus: RoomSnoreStatusMap,
): number => {
	const age = participant.birthDate
		? new Date().getFullYear() - new Date(participant.birthDate).getFullYear()
		: 30;
	const ageFactor = computeAgePenaltyFactor(age);

	// Bed type score: interpolate between young and old preference tables
	const isWalker = participant.type === 'walker';
	const youngPrefs = isWalker ? BED_SCORING_CONFIG.walkerYoungPrefs : BED_SCORING_CONFIG.serverYoungPrefs;
	const oldPrefs = isWalker ? BED_SCORING_CONFIG.walkerOldPrefs : BED_SCORING_CONFIG.serverOldPrefs;
	const youngScore = youngPrefs[bed.type] ?? 50;
	const oldScore = oldPrefs[bed.type] ?? 50;
	const bedTypeScore = youngScore * (1 - ageFactor) + oldScore * ageFactor;

	// Floor score: penalize higher floors more for older participants
	const floorsAboveGround = Math.max(0, (bed.floor ?? 1) - 1);
	const floorScore = -floorsAboveGround * BED_SCORING_CONFIG.floorPenaltyPerLevel * ageFactor;

	// Snoring score
	let snoringScore = 0;
	const roomStatus = roomSnoreStatus.get(bed.roomNumber);
	if (roomStatus && participant.snores !== undefined && participant.snores !== null) {
		const participantIsSnorer = !!participant.snores;
		const roomIsSnorer = roomStatus === 'snorer';
		if (participantIsSnorer === roomIsSnorer) {
			snoringScore = BED_SCORING_CONFIG.snoringMatchBonus;
		} else {
			snoringScore = BED_SCORING_CONFIG.snoringMismatchPenalty;
		}
	}

	return bedTypeScore + floorScore + snoringScore;
};

const assignBedToParticipant = async (
	participant: Participant,
	excludedBedIds: string[] = [],
	entityManager?: any,
	roomSnoreStatusMap?: RoomSnoreStatusMap,
): Promise<string | undefined> => {
	if (participant.isCancelled) return undefined;
	if (!participant.birthDate) return undefined;

	const retreatBedRepository = entityManager
		? entityManager.getRepository(RetreatBed)
		: AppDataSource.getRepository(RetreatBed);

	const bedUsage = participant.type === 'walker' ? 'caminante' : 'servidor';

	// Fetch all available beds in one query
	const availableBeds: RetreatBed[] = await retreatBedRepository
		.createQueryBuilder('bed')
		.where('bed.retreatId = :retreatId', { retreatId: participant.retreatId })
		.andWhere('bed.participantId IS NULL')
		.andWhere('bed.defaultUsage = :bedUsage', { bedUsage })
		.andWhere('bed.id NOT IN (:...excludedBedIds)', {
			excludedBedIds: excludedBedIds.length > 0 ? excludedBedIds : [''],
		})
		.getMany();

	if (availableBeds.length === 0) return undefined;

	// Build snore map if not provided (single-assignment mode)
	const snoreMap = roomSnoreStatusMap ?? await buildRoomSnoreStatusMap(retreatBedRepository, participant.retreatId);

	// Score each bed and pick the highest
	let bestBed: RetreatBed | null = null;
	let bestScore = -Infinity;

	for (const bed of availableBeds) {
		const score = scoreBedForParticipant(participant, bed, snoreMap);
		if (score > bestScore) {
			bestScore = score;
			bestBed = bed;
		}
	}

	return bestBed?.id;
};

const assignBedAndTableToParticipant = async (
	participant: Participant,
	assignedBedIds: Set<string>,
	entityManager: any,
	roomSnoreStatusMap?: RoomSnoreStatusMap,
): Promise<{ bedId?: string; tableId?: string }> => {
	const result: { bedId?: string; tableId?: string } = {};

	// Don't assign anything to cancelled participants
	if (participant.isCancelled) {
		console.warn(
			`🚫 Skipping bed and table assignment for cancelled participant ${participant.email}`,
		);
		return result;
	}

	// Assign bed if applicable
	if (participant.type !== 'waiting' && participant.type !== 'partial_server') {
		const bedId = await assignBedToParticipant(
			participant,
			Array.from(assignedBedIds),
			entityManager,
			roomSnoreStatusMap,
		);
		if (bedId) {
			result.bedId = bedId;
			assignedBedIds.add(bedId);
		}
	}

	// Assign table if walker
	if (participant.type === 'walker') {
		result.tableId = await assignTableToWalker(participant);
	}

	return result;
};

const assignTableToWalker = async (participant: Participant): Promise<string | undefined> => {
	if (participant.type !== 'walker') return undefined;

	const tableRepo = AppDataSource.getRepository(TableMesa);
	const participantRepo = AppDataSource.getRepository(Participant);

	const tables = await tableRepo.find({
		where: { retreatId: participant.retreatId },
		relations: ['walkers'],
	});

	if (tables.length === 0) return undefined;
	tables.sort(() => Math.random() - 0.5);

	let suitableTables = tables;

	if (participant.invitedBy) {
		const walkersInvitedBySamePerson = await participantRepo.find({
			where: {
				retreatId: participant.retreatId,
				invitedBy: ILike(participant.invitedBy),
				id: Not(participant.id),
				tableId: Not(IsNull()),
			},
			select: ['tableId'],
		});
		const tablesToExclude = walkersInvitedBySamePerson.map((p) => p.tableId).filter(Boolean);
		if (tablesToExclude.length > 0) {
			suitableTables = tables.filter((t) => !tablesToExclude.includes(t.id));
		}
	}

	const tablesToChooseFrom = suitableTables.length > 0 ? suitableTables : tables;
	const minWalkers = Math.min(...tablesToChooseFrom.map((t) => t.walkers?.length || 0));
	const leastPopulatedTables = tablesToChooseFrom.filter(
		(t) => (t.walkers?.length || 0) === minWalkers,
	);
	const randomIndex = Math.floor(Math.random() * leastPopulatedTables.length);

	return leastPopulatedTables[randomIndex]?.id;
};

export const createParticipant = async (
	participantData: CreateParticipant,
	assignRelationships = true,
	isImporting = false,
	skipCapacityCheck = false,
): Promise<Participant> => {
	const COLOR_POOL = [
		'#FFADAD',
		'#FFD6A5',
		'#FDFFB6',
		'#CAFFBF',
		'#9BF6FF',
		'#A0C4FF',
		'#BDB2FF',
		'#FFC6FF',
		'#FF6B6B',
		'#4ECDC4',
		'#45B7D1',
		'#96CEB4',
		'#FECA57',
		'#FF9FF3',
		'#54A0FF',
		'#5F27CD',
		'#00D2D3',
		'#FF9F43',
		'#10AC84',
		'#EE5A24',
		'#0984E3',
		'#6C5CE7',
		'#A29BFE',
		'#FD79A8',
		'#E17055',
		'#00B894',
		'#00CEC9',
		'#6C5CE7',
		'#FDCB6E',
		'#E84393',
		'#74B9FF',
		'#A29BFE',
		'#81ECEC',
		'#55A3FF',
		'#FD79A8',
		'#FDCB6E',
		'#6C5CE7',
		'#00CEC9',
		'#FF7675',
		'#74B9FF',
		'#A29BFE',
		'#81ECEC',
		'#55A3FF',
		'#FD79A8',
	];

	return AppDataSource.transaction(async (transactionalEntityManager) => {
		const participantRepository = transactionalEntityManager.getRepository(Participant);
		const retreatRepository = transactionalEntityManager.getRepository(Retreat);

		// PRIMERO: Buscar si existe Participant con este email (sin filtrar por retreatId)
		// This implements the new server registration flow where we reuse existing participants
		const existingParticipantByEmail = await participantRepository.findOne({
			where: { email: participantData.email },
			order: { registrationDate: 'DESC' },
		});

		// SI EXISTE: Actualizar el Participant existente con nueva información del retiro
		if (existingParticipantByEmail) {
			// Check if trying to register for the same retreat they're already in
			if (existingParticipantByEmail.retreatId === participantData.retreatId) {
				throw new Error('A participant with this email already exists in this retreat.');
			}

			// Store old retreat ID for history before updating
			const oldRetreatId = existingParticipantByEmail.retreatId;
			const oldType = existingParticipantByEmail.type;

			// Create history entry for the OLD retreat before updating
			if (existingParticipantByEmail.userId && oldRetreatId) {
				try {
					const oldHistoryData: CreateHistoryData = {
						userId: existingParticipantByEmail.userId,
						participantId: existingParticipantByEmail.id,
						retreatId: oldRetreatId,
						roleInRetreat:
							oldType === 'walker'
								? 'walker'
								: oldType === 'server' || oldType === 'partial_server'
									? 'server'
									: 'server',
						isPrimaryRetreat: false,
					};

					const historyRepo = transactionalEntityManager.getRepository(ParticipantHistory);
					// Check if history already exists for old retreat
					const existingHistory = await historyRepo.findOne({
						where: {
							userId: existingParticipantByEmail.userId,
							retreatId: oldRetreatId,
							participantId: existingParticipantByEmail.id,
						},
					});

					if (!existingHistory) {
						const oldHistory = historyRepo.create(oldHistoryData);
						await historyRepo.save(oldHistory);
					}
				} catch (historyError) {
					console.error('Error creating history for old retreat:', historyError);
				}
			}

			// Clear old bed assignment before moving participant to new retreat
			const retreatBedRepo = transactionalEntityManager.getRepository(RetreatBed);
			await retreatBedRepo
				.createQueryBuilder()
				.update(RetreatBed)
				.set({ participantId: null })
				.where('participantId = :pid', { pid: existingParticipantByEmail.id })
				.andWhere('retreatId = :oldRid', { oldRid: oldRetreatId })
				.execute();

			// Update the existing participant with new retreat information
			Object.assign(existingParticipantByEmail, {
				...participantData,
				retreatId: participantData.retreatId, // Update to new retreat
				type: participantData.type,
				lastUpdatedDate: new Date(),
				// Preserve the original registration date for tracking purposes
				registrationDate: existingParticipantByEmail.registrationDate,
			});

			const updatedParticipant = await participantRepository.save(existingParticipantByEmail);

			// Create ParticipantHistory for the NEW retreat
			if (updatedParticipant.userId && updatedParticipant.retreatId) {
				try {
					const historyData: CreateHistoryData = {
						userId: updatedParticipant.userId,
						participantId: updatedParticipant.id,
						retreatId: updatedParticipant.retreatId,
						roleInRetreat:
							participantData.type === 'walker'
								? 'walker'
								: participantData.type === 'server' || participantData.type === 'partial_server'
									? 'server'
									: 'server',
						isPrimaryRetreat: false,
					};

					const historyRepo = transactionalEntityManager.getRepository(ParticipantHistory);
					// Check if history already exists for new retreat
					const existingHistory = await historyRepo.findOne({
						where: {
							userId: updatedParticipant.userId,
							retreatId: updatedParticipant.retreatId,
							participantId: updatedParticipant.id,
						},
					});

					if (!existingHistory) {
						const history = historyRepo.create(historyData);
						await historyRepo.save(history);
					}

					// Update primary retreat
					await autoSetPrimaryRetreat(updatedParticipant.userId);
				} catch (historyError) {
					console.error('Error creating participant history for new retreat:', historyError);
				}
			}

			console.warn(
				`✅ Successfully updated and reused participant ${updatedParticipant.email} for retreat ${updatedParticipant.retreatId}`,
			);

			return updatedParticipant;
		}

		// SI NO EXISTE: Verificar que no exista en el mismo retiro (validación original)
		const existingInRetreat = await participantRepository.findOne({
			where: { email: participantData.email, retreatId: participantData.retreatId },
		});
		if (existingInRetreat) {
			throw new Error('A participant with this email already exists in this retreat.');
		}

		if (participantData.arrivesOnOwn === true) {
			participantData.pickupLocation = 'Llego por mi cuenta';
		}

		let colorToAssign: string | null = null;

		// Only apply family/friend color assignment to walkers
		if (participantData.type === 'walker') {
			// Build search conditions to find participants in the same group
			const searchConditions: string[] = [];
			const parameters: any = { retreatId: participantData.retreatId };

			// Case 1: Walker invited by another person (invitedBy field)
			if (participantData.invitedBy) {
				const inviterName = participantData.invitedBy.toLowerCase().trim();
				if (inviterName) {
					searchConditions.push('LOWER(participant.invitedBy) = :inviterName');
					parameters.inviterName = inviterName;
				}
			}

			// Case 2: Walker invited by Emaus member (check inviter contact info)
			if (participantData.isInvitedByEmausMember) {
				const inviterEmail = participantData.inviterEmail?.toLowerCase();
				if (inviterEmail) {
					searchConditions.push('LOWER(participant.inviterEmail) = :inviterEmail');
					parameters.inviterEmail = inviterEmail;
				}

				const inviterPhones = [
					participantData.inviterCellPhone,
					participantData.inviterWorkPhone,
					participantData.inviterHomePhone,
				]
					.filter(Boolean)
					.map((phone) => String(phone).replace(/\D/g, '').slice(-8))
					.filter((p) => p.length > 0);

				if (inviterPhones.length > 0) {
					parameters.inviterPhones = inviterPhones;
					searchConditions.push('SUBSTR(participant.inviterCellPhone, -8) IN (:...inviterPhones)');
					searchConditions.push('SUBSTR(participant.inviterWorkPhone, -8) IN (:...inviterPhones)');
					searchConditions.push('SUBSTR(participant.inviterHomePhone, -8) IN (:...inviterPhones)');
				}
			}

			// Case 3: Same lastname (family relationship)
			if (participantData.lastName) {
				const lastName = participantData.lastName.toLowerCase().trim();
				if (lastName) {
					searchConditions.push('LOWER(participant.lastName) = :lastName');
					parameters.lastName = lastName;
				}
			}

			if (searchConditions.length > 0) {
				// Find all existing walkers that match any of the group conditions
				const findAnyWalkerQb = participantRepository
					.createQueryBuilder('participant')
					.where('participant.retreatId = :retreatId')
					.andWhere('participant.type = :type', { type: 'walker' })
					.andWhere(new Brackets((qb) => qb.where(searchConditions.join(' OR '))));

				const existingWalkers = await findAnyWalkerQb.setParameters(parameters).getMany();

				// Only assign color if there are 2 or more walkers in the group (including the new one)
				if (existingWalkers.length >= 1) {
					// This means we have a group: existing walkers + the new walker being created

					// Check if any existing walker already has a color
					const existingWalkerWithColor = existingWalkers.find((w) => w.family_friend_color);

					if (existingWalkerWithColor?.family_friend_color) {
						// Use the same color as existing walker in the group
						colorToAssign = existingWalkerWithColor.family_friend_color;
					} else {
						// Find all used colors in this retreat
						const usedColorsResult = await participantRepository
							.createQueryBuilder('p')
							.select('DISTINCT p.family_friend_color', 'color')
							.where('p.retreatId = :retreatId', { retreatId: participantData.retreatId })
							.andWhere('p.family_friend_color IS NOT NULL')
							.getRawMany();
						const usedColors = usedColorsResult.map((r) => r.color);

						// Get an available color from the pool
						const availableColor = COLOR_POOL.find((c) => !usedColors.includes(c));
						colorToAssign =
							availableColor || COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];

						if (colorToAssign) {
							// Update all walkers in the group to use the new color
							const updateConditions = searchConditions.map((condition) =>
								condition.replace(/participant\./g, ''),
							);

							const updateQb = participantRepository
								.createQueryBuilder()
								.update(Participant)
								.set({ family_friend_color: colorToAssign })
								.where('retreatId = :retreatId')
								.andWhere('type = :type', { type: 'walker' })
								.andWhere(new Brackets((qb) => qb.where(updateConditions.join(' OR '))));

							const updateResult = await updateQb.setParameters(parameters).execute();
						}
					}
				}
			}
		}

		if (participantData.type === 'walker' || participantData.type === 'server') {
			if (skipCapacityCheck) {
				console.warn(
					`⚠️ SKIPPING CAPACITY CHECK during import for participant ${participantData.email}`,
				);
			} else {
				const retreat = await retreatRepository.findOne({
					where: { id: participantData.retreatId },
				});
				if (retreat) {
					const participantCount = await participantRepository.count({
						where: {
							retreatId: participantData.retreatId,
							type: participantData.type,
							isCancelled: false,
						},
					});
					const limit =
						participantData.type === 'walker' ? retreat.max_walkers : retreat.max_servers;

					console.warn(
						`   - Capacity check: ${participantCount} >= ${limit} = ${participantCount >= limit}`,
					);

					if (limit != null && participantCount >= limit) {
						console.warn(
							`⚠️ CAPACITY REACHED: Changing participant ${participantData.email} from '${participantData.type}' to 'waiting'`,
						);
						console.warn(
							`   - Reason: ${participantCount} ${participantData.type}s already registered (limit: ${limit})`,
						);
						participantData.type = 'waiting';
					} else {
						console.warn(
							`✅ Capacity available: Keeping participant ${participantData.email} as '${participantData.type}'`,
						);
					}
				} else {
					console.warn(
						`❌ WARNING: Could not find retreat ${participantData.retreatId} for capacity check`,
					);
				}
			}
		}

		const maxIdOnRetreat = await participantRepository
			.createQueryBuilder('p')
			.select('MAX(p.id_on_retreat)', 'maxId')
			.where('p.retreatId = :retreatId', { retreatId: participantData.retreatId })
			.getRawOne();
		const id_on_retreat = (maxIdOnRetreat.maxId || 0) + 1;

		const { retreatBed, tableMesa, ...restOfParticipantData } = participantData;

		const newParticipantData = {
			...restOfParticipantData,
			family_friend_color: colorToAssign || undefined,
			id_on_retreat,
			registrationDate: new Date(),
			lastUpdatedDate: new Date(),
		};

		if (!newParticipantData.nickname) {
			newParticipantData.nickname = newParticipantData.firstName;
		}

		const newParticipant = participantRepository.create(newParticipantData);
		let savedParticipant: Participant = await participantRepository.save(newParticipant);

		// Create participant history entry if user is linked
		if (savedParticipant.userId && savedParticipant.retreatId) {
			try {
				const historyData: CreateHistoryData = {
					userId: savedParticipant.userId,
					participantId: savedParticipant.id,
					retreatId: savedParticipant.retreatId,
					roleInRetreat:
						savedParticipant.type === 'walker'
							? 'walker'
							: savedParticipant.type === 'server' || savedParticipant.type === 'partial_server'
								? 'server'
								: 'server', // Default for 'waiting' or other types
					isPrimaryRetreat: false, // Will be auto-set later
				};

				const historyRepository = transactionalEntityManager.getRepository(ParticipantHistory);
				const history = historyRepository.create(historyData);
				await historyRepository.save(history);

				// Auto-set primary retreat for this user
				await autoSetPrimaryRetreat(savedParticipant.userId);

				console.warn(
					`✅ Created participant history for user ${savedParticipant.userId} in retreat ${savedParticipant.retreatId}`,
				);
			} catch (historyError) {
				// Log error but don't fail participant creation
				console.error('Error creating participant history:', historyError);
			}
		}

		if (
			assignRelationships &&
			savedParticipant.type !== 'waiting' &&
			savedParticipant.type !== 'partial_server'
		) {
			// Use the new unified assignment function
			const assignedBedIds = new Set<string>();
			const { bedId, tableId } = await assignBedAndTableToParticipant(
				savedParticipant,
				assignedBedIds,
				transactionalEntityManager,
			);

			if (bedId) {
				// Update the RetreatBed to point to the participant using query builder
				const retreatBedRepository = transactionalEntityManager.getRepository(RetreatBed);
				await retreatBedRepository
					.createQueryBuilder()
					.update(RetreatBed)
					.set({ participantId: savedParticipant.id })
					.where('id = :id', { id: bedId })
					.execute();
			}

			if (bedId || tableId) {
				// Use query builder to ensure individual updates
				const updates: any = {};
				// Note: retreatBedId is no longer stored in Participant entity
				// The relationship is managed through RetreatBed.participantId only
				if (tableId) updates.tableId = tableId;

				if (Object.keys(updates).length > 0) {
					await transactionalEntityManager
						.createQueryBuilder()
						.update(Participant)
						.set(updates)
						.where('id = :id', { id: savedParticipant.id })
						.execute();
				}

				// Refresh the participant to get the updated data
				savedParticipant =
					(await transactionalEntityManager.getRepository(Participant).findOne({
						where: { id: savedParticipant.id },
					})) || savedParticipant;
			}
		}

		// Send welcome email after successful registration (only if not importing or if retreat is public)
		try {
			// Get retreat details for template variables and to check if retreat is public
			const retreat = await transactionalEntityManager.getRepository(Retreat).findOne({
				where: { id: savedParticipant.retreatId },
			});

			// Skip email sending if importing or retreat is not public
			if (isImporting || !retreat || !retreat.isPublic) {
				console.warn(
					`Skipping email sending for imported participant ${savedParticipant.email} - retreat is not public`,
				);
				return savedParticipant;
			}

			const emailService = new EmailService();
			const templateType = savedParticipant.type === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';

			// Find the welcome template for this retreat
			const welcomeTemplate = await transactionalEntityManager
				.getRepository(MessageTemplate)
				.findOne({
					where: {
						retreatId: savedParticipant.retreatId,
						type: templateType,
					},
				});

			if (welcomeTemplate && savedParticipant.email) {
				await emailService.sendEmailWithTemplate(
					savedParticipant.email,
					welcomeTemplate.id,
					savedParticipant.retreatId,
					{
						participant: savedParticipant,
						retreat: retreat,
					},
				);
			}

			// Send notification email to the server who invited the participant
			if (savedParticipant.invitedBy && retreat) {
				// Find the server who invited this participant
				const invitingServer = await transactionalEntityManager.getRepository(Participant).findOne({
					where: {
						retreatId: savedParticipant.retreatId,
						nickname: savedParticipant.invitedBy,
						type: 'server',
					},
				});

				if (invitingServer && invitingServer.email) {
					// Find notification template for servers - use GENERAL type as fallback
					const notificationTemplate = await transactionalEntityManager
						.getRepository(MessageTemplate)
						.findOne({
							where: {
								retreatId: savedParticipant.retreatId,
								type: 'GENERAL',
							},
						});

					if (notificationTemplate) {
						await emailService.sendEmailWithTemplate(
							invitingServer.email,
							notificationTemplate.id,
							savedParticipant.retreatId,
							{
								participant: savedParticipant,
								retreat: retreat,
								invitingServer: invitingServer,
							},
						);
						console.warn(
							`Notification email sent to server ${invitingServer.nickname} for new participant ${savedParticipant.firstName} ${savedParticipant.lastName}`,
						);
					} else {
						// If no template exists, send a simple notification
						await emailService.sendParticipantEmail({
							to: invitingServer.email,
							subject: `Nuevo participante invitado: ${savedParticipant.firstName} ${savedParticipant.lastName}`,
							participant: savedParticipant,
							retreat: retreat,
							messageContent: `
								<h2>¡Hola ${invitingServer.firstName}!</h2>
								<p>Te informamos que <strong>${savedParticipant.firstName} ${savedParticipant.lastName}</strong> se ha registrado exitosamente en el retiro.</p>
								<p><strong>Detalles del participante:</strong></p>
								<ul>
									<li>Nombre: ${savedParticipant.firstName} ${savedParticipant.lastName}</li>
									<li>Tipo: ${savedParticipant.type === 'walker' ? 'Caminante' : 'Servidor'}</li>
									<li>Email: ${savedParticipant.email || 'No proporcionado'}</li>
									<li>Teléfono: ${savedParticipant.cellPhone || 'No proporcionado'}</li>
								</ul>
								<p>Gracias por invitar a nuevos participantes al retiro.</p>
							`,
						});
						console.warn(
							`Simple notification email sent to server ${invitingServer.nickname} for new participant ${savedParticipant.firstName} ${savedParticipant.lastName}`,
						);
					}
				} else {
					console.warn(
						`Could not find server with nickname '${savedParticipant.invitedBy}' to send notification`,
					);
				}
			}
		} catch (emailError) {
			console.error('Error sending welcome/notification emails:', emailError);
			// Don't throw - registration succeeded even if email fails
		}

		return savedParticipant;
	});
};

export const updateParticipant = async (
	id: string,
	participantData: UpdateParticipant,
	skipRebalance: boolean = false,
): Promise<Participant | null> => {
	const participant = await participantRepository.findOneBy({ id });
	if (!participant) {
		return null;
	}

	const wasCancelled = participant.isCancelled;
	participantData.lastUpdatedDate = new Date();
	participantRepository.merge(participant, participantData as any);

	// If participant is being marked as cancelled, clear their assignments atomically
	if (participantData.isCancelled === true && !wasCancelled) {
		participant.tableId = undefined;

		// Also clear the participant assignment in the RetreatBed table
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
		await retreatBedRepository
			.createQueryBuilder()
			.update(RetreatBed)
			.set({ participantId: null })
			.where('participantId = :id', { id: participant.id })
			.execute();
	}

	const updatedParticipant = await participantRepository.save(participant);

	/*if (updatedParticipant.type === 'walker' && wasCancelled !== updatedParticipant.isCancelled && !skipRebalance) {
		await rebalanceTablesForRetreat(updatedParticipant.retreatId);
	} else if (updatedParticipant.type === 'walker' && wasCancelled !== updatedParticipant.isCancelled && skipRebalance) {
	}*/

	return updatedParticipant;
};

export const deleteParticipant = async (
	id: string,
	skipRebalance: boolean = false,
): Promise<void> => {
	const participant = await participantRepository.findOneBy({ id });
	if (participant) {
		await participantRepository.update(id, { isCancelled: true, tableId: undefined });
		/*if (participant.type === 'walker' && !skipRebalance) {
			await rebalanceTablesForRetreat(participant.retreatId);
		} else if (participant.type === 'walker' && skipRebalance) {
		}*/
	}
};

const mapToEnglishKeys = (participant: any): Partial<CreateParticipant> => {
	// Excel cells may be numbers, dates, or strings - safely coerce to trimmed string
	const str = (val: any): string | undefined =>
		val != null ? String(val).trim() : undefined;

	const userType = str(participant.tipousuario);
	let mappedType: string;

	if (userType === '3') {
		mappedType = 'walker';
	} else if (userType === '4') {
		mappedType = 'waiting';
	} else if (userType === '5') {
		mappedType = 'partial_server';
	} else {
		mappedType = 'server'; // Default for '0', '1', '2', or any other value
	}

	return {
		id_on_retreat: str(participant.id),
		type: mappedType,
		firstName: str(participant.nombre) || '',
		lastName: str(participant.apellidos),
		nickname: str(participant.apodo),
		birthDate: new Date(
			Number(participant.anio) || 0,
			(Number(participant.mes) || 1) - 1,
			Number(participant.dia) || 1,
		),
		maritalStatus: str(participant.estadocivil),
		street: str(participant.dircalle),
		houseNumber: str(participant.dirnumero),
		postalCode: str(participant.dircp),
		neighborhood: str(participant.dircolonia),
		city: str(participant.dirmunicipio),
		state: str(participant.direstado),
		country: str(participant.dirpais),
		parish: str(participant.parroquia),
		homePhone: str(participant.telcasa),
		workPhone: str(participant.teltrabajo),
		cellPhone: str(participant.telcelular),
		email: str(participant.email) || '',
		occupation: str(participant.ocupacion),
		snores: str(participant.ronca) === 'S',
		hasMedication: str(participant.medicinaespecial) === 'S',
		medicationDetails: str(participant.medicinacual),
		medicationSchedule: str(participant.medicinahora),
		hasDietaryRestrictions: str(participant.alimentosrestringidos) === 'S',
		dietaryRestrictionsDetails: str(participant.alimentoscual),
		sacraments: ['baptism', 'communion', 'confirmation', 'marriage'].filter(
			(s) => str(participant[`sacramento${s}`]) === 'S',
		) as any,
		emergencyContact1Name: str(participant.emerg1nombre),
		emergencyContact1Relation: str(participant.emerg1relacion),
		emergencyContact1HomePhone: str(participant.emerg1telcasa),
		emergencyContact1WorkPhone: str(participant.emerg1teltrabajo),
		emergencyContact1CellPhone: str(participant.emerg1telcelular),
		emergencyContact1Email: str(participant.emerg1email),
		emergencyContact2Name: str(participant.emerg2nombre),
		emergencyContact2Relation: str(participant.emerg2relacion),
		emergencyContact2HomePhone: str(participant.emerg2telcasa),
		emergencyContact2WorkPhone: str(participant.emerg2teltrabajo),
		emergencyContact2CellPhone: str(participant.emerg2telcelular),
		emergencyContact2Email: str(participant.emerg2email),
		tshirtSize: (() => {
			const size = str(participant.camiseta)?.toUpperCase();
			const validSizes = ['S', 'M', 'G', 'X', '2'];
			return validSizes.includes(size!) ? size : null;
		})(),
		invitedBy: str(participant.invitadopor),
		isInvitedByEmausMember: str(participant.invitadaporemaus) === 'S' ? true : undefined,
		inviterHomePhone: str(participant.invtelcasa),
		inviterWorkPhone: str(participant.invteltrabajo),
		inviterCellPhone: str(participant.invtelcelular),
		inviterEmail: str(participant.invemail),
		pickupLocation: str(participant.puntoencuentro),
		isScholarship: str(participant.becado) === 'S',
		palancasCoordinator: str(participant.palancasencargado),
		palancasRequested: str(participant.palancaspedidas) === 'S',
		palancasReceived: str(participant.palancas),
		palancasNotes: str(participant.notaspalancas),
		requestsSingleRoom: str(participant.habitacionindividual) === 'S',
		isCancelled: str(participant.cancelado) === 'S',
		notes: str(participant.notas),
	};
};

// Helper function to extract Excel-specific fields for table and bed assignments
const extractExcelAssignments = (
	participant: any,
): {
	tableName?: string;
	roomNumber?: string;
	tipousuario?: string;
	leadershipRole?: 'lider' | 'colider1' | 'colider2' | null;
} => {
	const tipousuario = participant.tipousuario?.toString().trim();
	let leadershipRole: 'lider' | 'colider1' | 'colider2' | null = null;

	// Determine leadership role based on tipousuario
	if (tipousuario === '1') {
		leadershipRole = 'lider'; // Primero de Mesa
	} else if (tipousuario === '2') {
		leadershipRole = 'colider1'; // Segundo de Mesa (will be assigned to colider1 or colider2 based on availability)
	}
	// tipousuario = '0' (Servidor sin mesa) and others get no leadership role

	return {
		tableName: participant.mesa?.toString().trim(),
		roomNumber: participant.habitacion?.toString().trim(),
		tipousuario,
		leadershipRole,
	};
};

// Helper function to find available colider slot in a table
const findAvailableColiderSlot = async (
	tableId: string,
	assignedLeadershipIds?: Set<string>,
): Promise<'colider1' | 'colider2' | null> => {
	try {
		const table = await tableMesaRepository.findOne({
			where: { id: tableId },
			select: ['colider1Id', 'colider2Id', 'name'],
		});

		if (!table) {
			console.warn(`⚠️ Table with ID "${tableId}" not found when checking for colider slots`);
			return null;
		}

		console.warn(
			`🔍 Checking colider slots in table "${table.name}" (ID: ${tableId}): colider1Id=${table.colider1Id}, colider2Id=${table.colider2Id}`,
		);

		// Check for available slots in order: colider1 first, then colider2
		if (!table.colider1Id) {
			return 'colider1';
		}
		if (!table.colider2Id) {
			return 'colider2';
		}

		// Additional check: if we have a tracking set, verify the same person isn't assigned to both slots
		if (assignedLeadershipIds && table.colider1Id && table.colider2Id) {
			if (table.colider1Id === table.colider2Id) {
				console.warn(
					`⚠️ Same participant assigned to both colider1 and colider2 in table "${table.name}": ${table.colider1Id}`,
				);
				console.warn(
					`🔧 Rejecting table "${table.name}" due to duplicate assignment - both slots have same participant`,
				);
				return null; // Reject this table entirely as it has duplicate assignments
			}
		}

		console.warn(
			`⚠️ No available colider slots in table "${table.name}" - both colider1 and colider2 are occupied`,
		);
		return null; // No available slots
	} catch (error) {
		console.error(`Error finding available colider slot in table "${tableId}":`, error);
		return null;
	}
};

// New function to create multiple tables in a single transaction
const createTablesInBatch = async (retreatId: string, tableNames: string[]): Promise<number> => {
	let tablesActuallyCreated = 0;
	try {
		await AppDataSource.transaction(async (transactionalEntityManager) => {
			const transactionalTableRepository = transactionalEntityManager.getRepository(TableMesa);

			for (const tableName of tableNames) {
				// Check if table already exists
				const existingTable = await transactionalTableRepository.findOne({
					where: { name: tableName, retreatId },
					select: ['id', 'name'],
				});

				if (!existingTable) {
					const newTable = transactionalTableRepository.create({
						name: tableName,
						retreatId,
					});
					await transactionalTableRepository.save(newTable);
					tablesActuallyCreated++;
				}
			}
		});
		return tablesActuallyCreated;
	} catch (error: any) {
		console.error(`[Import] Batch table creation failed: ${error.message}`);
		throw error;
	}
};

// Helper function to check if participant is already a leader in any table
const checkExistingLeadership = async (
	participantId: string,
): Promise<{
	isLeader: boolean;
	role?: 'lider' | 'colider1' | 'colider2';
	tableName?: string;
	tableId?: string;
}> => {
	try {
		// Check all three leadership roles
		const leaderTable = await tableMesaRepository.findOne({
			where: { liderId: participantId },
			select: ['id', 'name'],
			relations: ['lider'],
		});

		if (leaderTable) {
			return {
				isLeader: true,
				role: 'lider',
				tableName: leaderTable.name,
				tableId: leaderTable.id,
			};
		}

		const colider1Table = await tableMesaRepository.findOne({
			where: { colider1Id: participantId },
			select: ['id', 'name'],
		});

		if (colider1Table) {
			return {
				isLeader: true,
				role: 'colider1',
				tableName: colider1Table.name,
				tableId: colider1Table.id,
			};
		}

		const colider2Table = await tableMesaRepository.findOne({
			where: { colider2Id: participantId },
			select: ['id', 'name'],
		});

		if (colider2Table) {
			return {
				isLeader: true,
				role: 'colider2',
				tableName: colider2Table.name,
				tableId: colider2Table.id,
			};
		}

		return { isLeader: false };
	} catch (error) {
		console.error(`Error checking existing leadership for participant ${participantId}:`, error);
		return { isLeader: false };
	}
};

// Helper function to get the next bed number in a room
const getNextBedNumber = async (retreatId: string, roomNumber: string): Promise<string> => {
	try {
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

		// Find existing beds in this room for this retreat
		const existingBeds = await retreatBedRepository.find({
			where: {
				retreatId,
				roomNumber: roomNumber.toString(),
			},
			select: ['bedNumber'],
			order: { bedNumber: 'ASC' },
		});

		if (existingBeds.length === 0) {
			return '1'; // First bed in the room
		}

		// Extract numeric values from bed numbers and find the highest
		const bedNumbers = existingBeds.map((bed) => {
			const num = parseInt(bed.bedNumber);
			return isNaN(num) ? 0 : num;
		});

		const maxBedNumber = Math.max(...bedNumbers);
		return String(maxBedNumber + 1);
	} catch (error) {
		console.error(`Error getting next bed number for room "${roomNumber}":`, error);
		return '1'; // Default to first bed if there's an error
	}
};

// Helper function to create a new RetreatBed for a room
const createRetreatBedForRoom = async (
	retreatId: string,
	roomNumber: string,
	participantType: 'walker' | 'server',
): Promise<{ bedId: string; wasCreated: boolean } | undefined> => {
	try {
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

		// Get the next bed number for this room
		const bedNumber = await getNextBedNumber(retreatId, roomNumber);

		console.warn(
			`🔍 Checking if bed ${bedNumber} already exists in room "${roomNumber}" for ${participantType}`,
		);

		// Check if a bed with this room number and bed number already exists
		const existingBed = await retreatBedRepository.findOne({
			where: {
				retreatId,
				roomNumber: roomNumber.toString(),
				bedNumber,
			},
			select: ['id', 'participantId', 'defaultUsage'],
		});

		if (existingBed) {
			console.warn(
				`📋 Bed ${bedNumber} already exists in room "${roomNumber}" (ID: ${existingBed.id})`,
			);
			console.warn(
				`   - Current participant assignment: ${existingBed.participantId || 'unassigned'}`,
			);

			// If the bed is unassigned or matches the required usage, return it
			if (
				!existingBed.participantId &&
				existingBed.defaultUsage ===
					(participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR)
			) {
				console.warn(
					`✅ Using existing unassigned bed ${bedNumber} in room "${roomNumber}" for ${participantType}`,
				);
				return { bedId: existingBed.id, wasCreated: false };
			} else if (existingBed.participantId) {
				console.warn(
					`⚠️ Bed ${bedNumber} in room "${roomNumber}" is already assigned to participant ${existingBed.participantId}`,
				);
				// Try to find the next available bed number
				const nextBedNumber = (parseInt(bedNumber) + 1).toString();

				// Check if next bed number exists
				const nextExistingBed = await retreatBedRepository.findOne({
					where: {
						retreatId,
						roomNumber: roomNumber.toString(),
						bedNumber: nextBedNumber,
					},
					select: ['id', 'participantId'],
				});

				if (!nextExistingBed) {
					const newBedId = await createNewBed(
						retreatBedRepository,
						retreatId,
						roomNumber,
						nextBedNumber,
						participantType,
					);
					return newBedId ? { bedId: newBedId, wasCreated: true } : undefined;
				} else {
					console.warn(
						`⚠️ Next bed ${nextBedNumber} also exists, cannot create bed in room "${roomNumber}"`,
					);
					return undefined;
				}
			} else {
				console.warn(
					`⚠️ Existing bed ${bedNumber} has different usage (${existingBed.defaultUsage}) than required (${participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR})`,
				);
				return undefined;
			}
		}

		// If no existing bed found, create a new one
		const newBedId = await createNewBed(
			retreatBedRepository,
			retreatId,
			roomNumber,
			bedNumber,
			participantType,
		);
		return newBedId ? { bedId: newBedId, wasCreated: true } : undefined;
	} catch (error: any) {
		console.error(`❌ Failed to create RetreatBed for room "${roomNumber}":`, error.message);
		return undefined;
	}
};

// Helper function to actually create a new bed
const createNewBed = async (
	retreatBedRepository: any,
	retreatId: string,
	roomNumber: string,
	bedNumber: string,
	participantType: 'walker' | 'server',
): Promise<string> => {
	try {
		// Determine bed usage based on participant type
		const bedUsage = participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR;

		// Create new RetreatBed with sensible defaults
		const newBed = retreatBedRepository.create({
			roomNumber: roomNumber.toString(),
			bedNumber,
			floor: 1, // Default to ground floor
			type: BedType.NORMAL, // Use enum value
			defaultUsage: bedUsage,
			retreatId,
		});

		const savedBed = await retreatBedRepository.save(newBed);
		const savedBedArray = Array.isArray(savedBed) ? savedBed : [savedBed];
		console.warn(
			`🛏️ Created new RetreatBed ${savedBedArray[0].id} in room "${roomNumber}" (bed ${bedNumber}) for ${participantType}`,
		);

		return savedBedArray[0].id;
	} catch (error: any) {
		console.error(`❌ Failed to create new RetreatBed:`, error.message);
		throw error; // Re-throw to indicate failure
	}
};

// Helper function to find available bed by room number during import
const findAvailableBedByRoom = async (
	retreatId: string,
	roomNumber: string,
	participantType: 'walker' | 'server',
	assignedBedIds?: Set<string>,
): Promise<{ bedId: string; wasCreated: boolean } | undefined> => {
	if (!roomNumber) return undefined;

	try {
		const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

		// Determine bed usage based on participant type
		const bedUsage = participantType === 'walker' ? BedUsage.CAMINANTE : BedUsage.SERVIDOR;

		// Find first available bed in the specified room
		let whereCondition: any = {
			retreatId,
			roomNumber: roomNumber.toString(), // Convert to string to handle numeric Excel values
			participantId: IsNull(), // Must be unassigned
			defaultUsage: bedUsage, // Must match participant type
		};

		// If we have a tracking set of assigned bed IDs, exclude those beds
		if (assignedBedIds && assignedBedIds.size > 0) {
			whereCondition.id = Not(In(Array.from(assignedBedIds)));
		}

		const availableBed = await retreatBedRepository.findOne({
			where: whereCondition,
			select: ['id'],
			order: {
				bedNumber: 'ASC', // Get the first bed in the room
			},
		});

		// If bed found, return its ID
		if (availableBed) {
			return { bedId: availableBed.id, wasCreated: false };
		}

		// No available bed found, try to create one
		console.warn(
			`🔍 No available bed found in room "${roomNumber}" for ${participantType}. Attempting to create new bed...`,
		);
		const bedResult = await createRetreatBedForRoom(retreatId, roomNumber, participantType);

		if (bedResult) {
			if (bedResult.wasCreated) {
				console.warn(
					`✅ Created and assigned new bed in room "${roomNumber}" for ${participantType}`,
				);
			}
			return bedResult;
		} else {
			console.warn(
				`⚠️ Failed to create or find bed in room "${roomNumber}" for ${participantType}`,
			);
			return undefined;
		}
	} catch (error) {
		console.error(`Error finding available bed in room "${roomNumber}":`, error);
		return undefined;
	}
};

// Helper function to create payment record during import
const createPaymentFromImport = async (
	participantId: string,
	retreatId: string,
	participantRawData: any,
	user: any,
): Promise<{ paymentCreated: boolean }> => {
	const paymentAmount = participantRawData.montopago?.trim();
	const paymentDate = participantRawData.fechapago?.trim();

	if (!paymentAmount || !paymentDate) {
		// No payment data in import, skip payment creation
		return { paymentCreated: false };
	}

	try {
		// Validate user is provided
		if (!user || !user.id) {
			console.error('❌ No user provided for import - cannot create payment records');
			return { paymentCreated: false };
		}

		const amount = parseFloat(paymentAmount);
		if (isNaN(amount) || amount <= 0) {
			return { paymentCreated: false }; // Skip invalid amounts
		}

		// Check if payment already exists for this participant
		const existingPayments = await paymentRepository.find({
			where: { participantId },
			relations: ['recordedByUser'],
		});

		const totalExistingPayments = existingPayments.reduce(
			(sum, payment) => sum + Number(payment.amount),
			0,
		);
		let paymentCreated = false;

		// Handle payment scenarios based on existing payments
		if (existingPayments.length === 0) {
			// No existing payments - create new payment
			const payment = paymentRepository.create({
				participantId,
				retreatId,
				amount,
				paymentDate: new Date(paymentDate),
				paymentMethod: 'other', // Default for imports
				referenceNumber: 'IMPORT',
				notes: 'Imported from Excel/CSV file',
				recordedBy: user.id,
			});

			await paymentRepository.save(payment);
			paymentCreated = true;
		} else if (totalExistingPayments < amount) {
			// Existing payments sum less than imported amount - create adjustment payment
			const adjustmentAmount = amount - totalExistingPayments;
			const payment = paymentRepository.create({
				participantId,
				retreatId,
				amount: adjustmentAmount,
				paymentDate: new Date(paymentDate),
				paymentMethod: 'other',
				referenceNumber: 'IMPORT_ADJUSTMENT',
				notes: `Import adjustment - bringing total to $${amount} (existing: $${totalExistingPayments})`,
				recordedBy: user.id,
			});

			await paymentRepository.save(payment);
			console.warn(
				`✅ Created adjustment payment for participant ${participantId}: +$${adjustmentAmount} (total: $${amount})`,
			);
			paymentCreated = true;
		} else if (totalExistingPayments > amount) {
			// Existing payments sum exceeds imported amount - create refund/adjustment
			const refundAmount = totalExistingPayments - amount;
			const payment = paymentRepository.create({
				participantId,
				retreatId,
				amount: -Math.abs(refundAmount), // Negative amount for refund
				paymentDate: new Date(paymentDate),
				paymentMethod: 'other',
				referenceNumber: 'IMPORT_REFUND',
				notes: `Import adjustment - bringing total to $${amount} (excess: $${totalExistingPayments})`,
				recordedBy: user.id,
			});

			await paymentRepository.save(payment);
			console.warn(
				`⚠️ Created refund adjustment for participant ${participantId}: -$${Math.abs(refundAmount)} (total: $${amount})`,
			);
			paymentCreated = true;
		} else {
			// Total matches exactly - no action needed
			console.warn(
				`ℹ️ Payment amounts match for participant ${participantId}: $${amount} (no adjustment needed)`,
			);
		}

		return { paymentCreated };
	} catch (error: any) {
		console.error(
			`❌ Failed to create payment adjustment for participant ${participantId}: ${error.message}`,
		);
		// Don't throw error - continue with participant creation even if payment fails
		return { paymentCreated: false };
	}
};

export const convertWalkerToServer = async (participantId: string): Promise<Participant> => {
	const participant = await participantRepository.findOne({
		where: { id: participantId },
		relations: ['retreat'],
	});

	if (!participant) {
		throw new Error('Participant not found');
	}

	if (participant.type === 'server') {
		throw new Error('Participant is already a server');
	}

	// Update type to server
	participant.type = 'server';
	participant.lastUpdatedDate = new Date();

	const updated = await participantRepository.save(participant);

	// Create activity if user is linked
	if (participant.userId) {
		const { UserActivity } = await import('../entities/userActivity.entity');
		const activityRepository = AppDataSource.getRepository(UserActivity);
		await activityRepository.save({
			userId: participant.userId,
			activityType: 'became_server',
			description: 'Se convirtió en servidor',
			metadata: { participantId, retreatId: participant.retreatId },
		});
	}

	return updated;
};

export const linkUserToParticipant = async (
	participantId: string,
	userId: string,
): Promise<Participant> => {
	const participant = await participantRepository.findOne({
		where: { id: participantId },
	});

	if (!participant) {
		throw new Error('Participant not found');
	}

	const { User } = await import('../entities/user.entity');
	const userRepository = AppDataSource.getRepository(User);
	const user = await userRepository.findOne({
		where: { id: userId },
	});

	if (!user) {
		throw new Error('User not found');
	}

	// Update both sides
	participant.userId = userId;
	user.participantId = participantId;

	await participantRepository.save(participant);
	await userRepository.save(user);

	// Create participant history entry
	if (participant.retreatId) {
		try {
			const historyData: CreateHistoryData = {
				userId,
				participantId,
				retreatId: participant.retreatId,
				roleInRetreat:
					participant.type === 'walker'
						? 'walker'
						: participant.type === 'server' || participant.type === 'partial_server'
							? 'server'
							: 'server',
				isPrimaryRetreat: false,
			};

			await createHistoryEntry(historyData);

			// Auto-set primary retreat for this user
			await autoSetPrimaryRetreat(userId);

			console.warn(
				`✅ Created participant history for user ${userId} when linking to participant ${participantId}`,
			);
		} catch (historyError) {
			// Log error but don't fail linking
			console.error('Error creating participant history during link:', historyError);
		}
	}

	// Create activity if the participant is a server
	if (participant.type === 'server') {
		const { UserActivity } = await import('../entities/userActivity.entity');
		const activityRepository = AppDataSource.getRepository(UserActivity);
		await activityRepository.save({
			userId,
			activityType: 'became_server',
			description: 'Se vinculó como servidor',
			metadata: { participantId, retreatId: participant.retreatId },
		});
	}

	return participant;
};

export const unlinkUserFromParticipant = async (participantId: string): Promise<void> => {
	const participant = await participantRepository.findOne({
		where: { id: participantId },
	});

	if (!participant) {
		throw new Error('Participant not found');
	}

	if (!participant.userId) {
		throw new Error('Participant not linked to any user');
	}

	const { User } = await import('../entities/user.entity');
	const userRepository = AppDataSource.getRepository(User);
	const user = await userRepository.findOne({
		where: { id: participant.userId },
	});

	if (user) {
		user.participantId = null;
		await userRepository.save(user);
	}

	participant.userId = null;
	await participantRepository.save(participant);
};

export const autoAssignBedsForRetreat = async (
	retreatId: string,
): Promise<{ assigned: number; skipped: number }> => {
	const retreatBedRepository = AppDataSource.getRepository(RetreatBed);

	// Get all participants that are eligible for bed assignment and don't already have one
	const assignedParticipantIds = await retreatBedRepository
		.createQueryBuilder('bed')
		.select('bed.participantId')
		.where('bed.retreatId = :retreatId', { retreatId })
		.andWhere('bed.participantId IS NOT NULL')
		.getRawMany()
		.then((rows: any[]) => rows.map((r) => r.bed_participantId as string));

	const participants = await participantRepository.find({
		where: {
			retreatId,
			isCancelled: false,
		},
	});

	const eligible = participants.filter(
		(p) =>
			p.type !== 'waiting' &&
			p.type !== 'partial_server' &&
			p.birthDate &&
			!assignedParticipantIds.includes(p.id),
	);

	// Sort: oldest first so they get bottom bunks/normal beds first,
	// then young walkers fill remaining top bunks (which they prefer anyway)
	const currentYear = new Date().getFullYear();
	eligible.sort((a, b) => {
		const ageA = currentYear - new Date(a.birthDate).getFullYear();
		const ageB = currentYear - new Date(b.birthDate).getFullYear();

		// Primary: oldest first (greedy: let those with strongest preference pick first)
		if (ageA !== ageB) return ageB - ageA;

		// Secondary: group snorers together
		const snoreA = a.snores ? 1 : 0;
		const snoreB = b.snores ? 1 : 0;
		if (snoreA !== snoreB) return snoreA - snoreB;

		// Tertiary: stable tie-break by lastName
		return (a.lastName || '').localeCompare(b.lastName || '');
	});

	// Build snore map once and update incrementally
	const snoreMap = await buildRoomSnoreStatusMap(retreatBedRepository, retreatId);

	const assignedBedIds: string[] = [];
	let assigned = 0;
	let skipped = 0;

	for (const participant of eligible) {
		const bedId = await assignBedToParticipant(participant, assignedBedIds, undefined, snoreMap);
		if (bedId) {
			await retreatBedRepository.update(bedId, { participantId: participant.id });
			assignedBedIds.push(bedId);
			assigned++;

			// Update snore map incrementally
			const assignedBed = await retreatBedRepository.findOne({ where: { id: bedId } });
			if (assignedBed) {
				updateRoomSnoreStatus(snoreMap, participant, assignedBed);
			}
		} else {
			skipped++;
		}
	}

	return { assigned, skipped };
};

export const importParticipants = async (retreatId: string, participantsData: any[], user: any) => {
	let importedCount = 0;
	let updatedCount = 0;
	let skippedCount = 0;
	let tablesCreated = 0;
	let bedsCreated = 0;
	let paymentsCreated = 0;
	const processedParticipantIds: string[] = [];

	// Sort participants so cancelled ones are processed first
	// This ensures cancelled participants don't interfere with active participant assignments
	const sortedParticipantsData = participantsData.sort((a, b) => {
		const aCancelled = String(a.cancelado ?? '').trim() === 'S';
		const bCancelled = String(b.cancelado ?? '').trim() === 'S';

		if (aCancelled && !bCancelled) return -1; // a is cancelled, b is not - a comes first
		if (!aCancelled && bCancelled) return 1; // b is cancelled, a is not - b comes first
		return 0; // both are the same (both cancelled or both not cancelled)
	});

	console.log(
		`[Import] Starting for retreat ${retreatId} with ${sortedParticipantsData.length} participants`,
	);
	const initialTableCount = await tableMesaRepository.count({ where: { retreatId } });

	// First pass: Identify all tables that need to be created
	const tablesToCreate = new Set<string>();
	for (const participantRawData of participantsData) {
		const excelAssignments = extractExcelAssignments(participantRawData);
		if (excelAssignments.tableName) {
			tablesToCreate.add(excelAssignments.tableName.toString());
		}
	}

	// Create all needed tables in a single transaction
	if (tablesToCreate.size > 0) {
		const actualTablesCreated = await createTablesInBatch(retreatId, Array.from(tablesToCreate));
		tablesCreated = actualTablesCreated;
	}

	// Initialize tracking to prevent duplicate assignments during import
	const assignedBedIds = new Set<string>();
	const bedAssignmentQueue: Array<{
		participant: any;
		bedNumber: string;
		roomNumber: string;
		participantType: 'walker' | 'server';
	}> = [];

	// Leadership role tracking to prevent same person from being assigned to multiple roles
	const assignedLeadershipIds = new Set<string>();
	const leadershipAssignmentQueue: Array<{
		participant: any;
		tableName: string;
		leadershipRole: 'lider' | 'colider1' | 'colider2' | null;
		participantEmail: string;
	}> = [];

	// Second pass: Process participants and collect bed assignments
	const skippedDetails: Array<{ row: number; reason: string; name?: string }> = [];

	for (let idx = 0; idx < sortedParticipantsData.length; idx++) {
		const participantRawData = sortedParticipantsData[idx];
		const mappedData = mapToEnglishKeys(participantRawData);
		const excelAssignments = extractExcelAssignments(participantRawData);

		if (!mappedData.email) {
			const name = `${String(participantRawData.nombre ?? '').trim()} ${String(participantRawData.apellidos ?? '').trim()}`.trim();
			skippedDetails.push({ row: idx + 2, reason: 'missing email', name: name || undefined });
			skippedCount++;
			continue;
		}

		let participant: Participant;
		try {
			const existingParticipant = await participantRepository.findOne({
				where: { email: mappedData.email, retreatId },
			});

			if (existingParticipant) {
				const { type, ...updateData } = mappedData;

				const updatedParticipant = await updateParticipant(
					existingParticipant.id,
					updateData as UpdateParticipant,
					true,
				); // skipRebalance = true during import
				updatedCount++;
				processedParticipantIds.push(existingParticipant.id);
				participant = existingParticipant;

				// Create payment record if payment data exists in import
				const paymentResult = await createPaymentFromImport(
					existingParticipant.id,
					retreatId,
					participantRawData,
					user,
				);
				if (paymentResult.paymentCreated) {
					paymentsCreated++;
				}
			} else {
				const newParticipant = await createParticipant(
					{ ...mappedData, retreatId } as CreateParticipant,
					false,
					true, // isImporting = true
					true, // skipCapacityCheck = true during import
				);
				importedCount++;
				processedParticipantIds.push(newParticipant.id);
				participant = newParticipant;

				// Create payment record if payment data exists in import
				const paymentResult = await createPaymentFromImport(
					newParticipant.id,
					retreatId,
					participantRawData,
					user,
				);
				if (paymentResult.paymentCreated) {
					paymentsCreated++;
				}
			}

			// Handle table assignment from Excel 'mesa' field (tables are pre-created in batch)
			if (excelAssignments.tableName && participant.type === 'walker') {
				// Tables are pre-created, just find the existing one
				const existingTable = await tableMesaRepository.findOne({
					where: { name: excelAssignments.tableName.toString(), retreatId },
					select: ['id', 'name'],
				});

				if (existingTable) {
					await participantRepository.update(participant.id, { tableId: existingTable.id });
				} else {
					console.error(
						`[Import] Pre-created table "${excelAssignments.tableName}" not found`,
					);
				}
			}

			// Handle bed assignment from Excel 'habitacion' field - collect for batch processing
			if (
				excelAssignments.roomNumber &&
				participant.type !== 'waiting' &&
				participant.type !== 'partial_server'
			) {
				bedAssignmentQueue.push({
					participant: participant,
					bedNumber: '', // Will be determined by findAvailableBedByRoom
					roomNumber: excelAssignments.roomNumber,
					participantType: participant.type,
				});
			}

			// Handle leadership role assignment from Excel 'tipousuario' field - collect for batch processing
			if (excelAssignments.leadershipRole && participant.type === 'server') {
				// Only assign leadership if the participant also has a table assignment
				if (excelAssignments.tableName) {
					leadershipAssignmentQueue.push({
						participant: participant,
						tableName: excelAssignments.tableName,
						leadershipRole: excelAssignments.leadershipRole,
						participantEmail: participant.email,
					});
				}
			}
		} catch (error: any) {
			console.error(`[Import] Failed participant ${mappedData.email}: ${error.message}`);
			skippedDetails.push({ row: idx + 2, reason: `error: ${error.message}`, name: mappedData.email });
			skippedCount++;
		}
	}

	// Process leadership assignments in batch to prevent duplicate role assignments
	for (const leadershipAssignment of leadershipAssignmentQueue) {
		const { participant, tableName, leadershipRole, participantEmail } = leadershipAssignment;

		// Fresh participant lookup to ensure we have the latest cancellation status
		const freshParticipant = await participantRepository.findOne({
			where: { id: participant.id },
			select: ['id', 'type', 'isCancelled', 'email', 'firstName', 'lastName'],
		});

		if (!freshParticipant || freshParticipant.isCancelled || freshParticipant.type !== 'server') {
			continue;
		}

		// Check if this participant is already assigned to a leadership role in this batch
		if (assignedLeadershipIds.has(participant.id)) {
			continue;
		}

		// Check database for existing leadership assignments (from previous imports)
		const existingLeadership = await checkExistingLeadership(participant.id);

		// Find the pre-created table
		const existingTable = await tableMesaRepository.findOne({
			where: { name: tableName.toString(), retreatId },
			select: ['id', 'name'],
		});

		if (existingTable) {
			// For colider1 role, find available slot (colider1 or colider2)
			let finalRole = leadershipRole;
			if (leadershipRole === 'colider1') {
				const availableSlot = await findAvailableColiderSlot(
					existingTable.id,
					assignedLeadershipIds,
				);
				if (!availableSlot) {
					continue;
				}
				finalRole = availableSlot;
			}

			// Double-check: make sure this participant isn't already assigned to this table in any capacity
			const currentTableState = await tableMesaRepository.findOne({
				where: { id: existingTable.id },
				select: ['liderId', 'colider1Id', 'colider2Id'],
			});

			if (currentTableState) {
				const currentAssignments = [
					currentTableState.liderId,
					currentTableState.colider1Id,
					currentTableState.colider2Id,
				];
				if (currentAssignments.includes(participant.id)) {
					continue;
				}
			}

			// Mark this participant as assigned to prevent multiple assignments in the same batch
			assignedLeadershipIds.add(participant.id);

			// Assign leadership role using existing function (which handles removing from other tables)
			if (finalRole) {
				await assignLeaderToTable(existingTable.id, participant.id, finalRole);
			} else {
				continue;
			}

			// Verify the assignment didn't create duplicates
			const verificationTableState = await tableMesaRepository.findOne({
				where: { id: existingTable.id },
				select: ['liderId', 'colider1Id', 'colider2Id'],
			});

			if (verificationTableState) {
				const assignments = [
					verificationTableState.liderId,
					verificationTableState.colider1Id,
					verificationTableState.colider2Id,
				];
				const uniqueAssignments = assignments.filter((id) => id !== null);

				// Check for and fix duplicates
				if (uniqueAssignments.length !== new Set(uniqueAssignments).size) {
					console.error(`[Import] Duplicate assignment in table "${tableName}"`);
					const duplicates = uniqueAssignments.filter(
						(id, index) => uniqueAssignments.indexOf(id) !== index,
					);
					for (const duplicateId of duplicates) {
						if (verificationTableState.colider1Id === duplicateId) {
							await tableMesaRepository.update(existingTable.id, { colider1Id: undefined });
						} else if (verificationTableState.colider2Id === duplicateId) {
							await tableMesaRepository.update(existingTable.id, { colider2Id: undefined });
						}
					}
				}
			}
		} else {
			console.error(`[Import] Pre-created table "${tableName}" not found for leadership`);
		}
	}

	// Assign beds and tables using the new redesigned system
	try {
		await AppDataSource.transaction(async (transactionalEntityManager) => {
			const transactionalParticipantRepository =
				transactionalEntityManager.getRepository(Participant);
			const transactionalBedRepository = transactionalEntityManager.getRepository(RetreatBed);

			// Get all participants to process to check for existing Excel assignments
			const participantsToProcess = await transactionalParticipantRepository.find({
				where: { id: In(processedParticipantIds) },
			});

			// Sort: oldest first so they get bottom bunks/normal beds first,
			// then young walkers fill remaining top bunks (which they prefer anyway)
			const currentYear = new Date().getFullYear();
			participantsToProcess.sort((a, b) => {
				const ageA = a.birthDate ? currentYear - new Date(a.birthDate).getFullYear() : 999;
				const ageB = b.birthDate ? currentYear - new Date(b.birthDate).getFullYear() : 999;

				// Primary: oldest first (greedy: let those with strongest preference pick first)
				if (ageA !== ageB) return ageB - ageA;

				// Secondary: group snorers together
				const snoreA = a.snores ? 1 : 0;
				const snoreB = b.snores ? 1 : 0;
				if (snoreA !== snoreB) return snoreA - snoreB;

				// Tertiary: stable tie-break by lastName
				return (a.lastName || '').localeCompare(b.lastName || '');
			});

			// Note: We no longer clear bed assignments here since they are now handled atomically
			// within the transaction along with all other assignments to ensure consistency

			// Track assigned beds to prevent duplicate assignments
			const assignedBedIds = new Set<string>();

			// Build snore map once for scoring-based bed assignment
			const importSnoreMap = await buildRoomSnoreStatusMap(transactionalBedRepository, retreatId);

			// First, process Excel bed assignments within the transaction to ensure consistency
			for (const bedAssignment of bedAssignmentQueue) {
				const { participant, roomNumber, participantType } = bedAssignment;

				// Refresh participant data to get the latest cancellation status (handles duplicate rows in Excel)
				const freshParticipant = await transactionalParticipantRepository.findOne({
					where: { id: participant.id },
					select: ['id', 'type', 'isCancelled', 'email', 'firstName', 'lastName'],
				});

				if (!freshParticipant || freshParticipant.isCancelled) {
					continue;
				}

				// Use the fresh participant data for all subsequent operations
				const participantForAssignment = freshParticipant;

				// Check if this participant already has a bed assigned
				const hasExistingBedAssignment = await bedQueryUtils.participantHasBedAssignment(
					participantForAssignment.id,
				);
				if (hasExistingBedAssignment) {
					const existingBed = await bedQueryUtils.getParticipantBedAssignment(
						participantForAssignment.id,
					);
					if (existingBed) {
						assignedBedIds.add(existingBed.id);
					}
					continue;
				}

				// Find or create a bed that hasn't been assigned yet in this batch
				const bedResult = await findAvailableBedByRoom(
					retreatId,
					roomNumber,
					participantType,
					assignedBedIds,
				);

				if (bedResult) {
					const { bedId, wasCreated } = bedResult;

					// Mark this bed as assigned to prevent other participants from getting it
					assignedBedIds.add(bedId);

					// Update the bed to point to the participant within the transaction
					await transactionalBedRepository
						.createQueryBuilder()
						.update(RetreatBed)
						.set({ participantId: participantForAssignment.id })
						.where('id = :id', { id: bedId })
						.execute();

					// Track bed creation
					if (wasCreated) {
						bedsCreated++;
					}
				}
			}

			// Process participants one by one with atomic bed assignment for any remaining unassigned participants
			for (const participant of participantsToProcess) {
				// Skip cancelled participants entirely
				if (participant.isCancelled) {
					continue;
				}

				if (participant.type !== 'waiting' && participant.type !== 'partial_server') {
					// Check if participant already has bed assignment (from previous import or database)
					const hasExistingBedAssignment = await bedQueryUtils.participantHasBedAssignment(
						participant.id,
					);
					const hasExistingTableAssignment = !!participant.tableId;

					if (hasExistingTableAssignment || hasExistingBedAssignment) {
						// Track existing bed assignments to prevent conflicts
						if (hasExistingBedAssignment) {
							const existingBed = await bedQueryUtils.getParticipantBedAssignment(participant.id);
							if (existingBed) {
								assignedBedIds.add(existingBed.id);
							}
						}
						continue;
					}

					// Use the new unified assignment function
					const { bedId, tableId } = await assignBedAndTableToParticipant(
						participant,
						assignedBedIds,
						transactionalEntityManager,
						importSnoreMap,
					);

					// Handle bed assignment
					if (bedId) {
						await transactionalBedRepository
							.createQueryBuilder()
							.update(RetreatBed)
							.set({ participantId: participant.id })
							.where('id = :id', { id: bedId })
							.execute();

						// Update snore map incrementally
						const assignedBed = await transactionalBedRepository.findOne({ where: { id: bedId } });
						if (assignedBed) {
							updateRoomSnoreStatus(importSnoreMap, participant, assignedBed);
						}
					}

					// Handle table assignment
					if (tableId) {
						await transactionalParticipantRepository
							.createQueryBuilder()
							.update(Participant)
							.set({ tableId })
							.where('id = :id', { id: participant.id })
							.execute();
					}
				}
			}
		});
	} catch (error: any) {
		console.error(`[Import] Transaction failed: ${error.message}`);
		throw error;
	}

	// Final verification: Check all tables that should exist based on our tracking
	const finalTableCount = await tableMesaRepository.count({ where: { retreatId } });
	const expectedTableCount = initialTableCount + tablesCreated;

	if (finalTableCount !== expectedTableCount) {
		console.error(
			`[Import] Table count mismatch: expected ${expectedTableCount}, found ${finalTableCount}`,
		);
	}

	console.log(
		`[Import] Completed: imported=${importedCount}, updated=${updatedCount}, skipped=${skippedCount}, tables=${tablesCreated}, beds=${bedsCreated}, payments=${paymentsCreated}`,
	);

	if (skippedDetails.length > 0) {
		console.log(`[Import] Skipped participants details:`);
		for (const detail of skippedDetails) {
			console.log(`  Row ${detail.row}: ${detail.reason}${detail.name ? ` (${detail.name})` : ''}`);
		}
	}

	return {
		importedCount,
		updatedCount,
		skippedCount,
		skippedDetails,
		tablesCreated,
		bedsCreated,
		paymentsCreated,
	};
};
