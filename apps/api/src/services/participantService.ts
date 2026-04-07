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
import { In, Not, IsNull, ILike, Brackets, EntityManager } from 'typeorm';
import {
	createHistoryEntry,
	autoSetPrimaryRetreat,
	syncRetreatFields,
	CreateHistoryData,
} from './retreatParticipantService';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { User } from '../entities/user.entity';
import { Responsability } from '../entities/responsability.entity';
import { ParticipantCommunication } from '../entities/participantCommunication.entity';

const participantRepository = AppDataSource.getRepository(Participant);
const tableMesaRepository = AppDataSource.getRepository(TableMesa);
const paymentRepository = AppDataSource.getRepository(Payment);

// ==================== HELPERS ====================

const escapeHtml = (str: string | null | undefined): string => {
	if (!str) return '';
	return str
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&#039;');
};

const getNextIdOnRetreat = async (
	retreatId: string,
	entityManager?: EntityManager,
): Promise<number> => {
	const repo = (entityManager ?? AppDataSource).getRepository(RetreatParticipant);
	const result = await repo
		.createQueryBuilder('rp')
		.select('MAX(rp."idOnRetreat")', 'maxId')
		.where('rp."retreatId" = :retreatId', { retreatId })
		.getRawOne();
	return (result?.maxId || 0) + 1;
};

// ==================== PARTICIPANT LOOKUP FUNCTIONS ====================

/**
 * Find participant by email (searches all retreats)
 * Returns the most recent participant record for this email
 */
export const findParticipantByEmail = async (email: string): Promise<Participant | null> => {
	const normalizedEmail = email.toLowerCase().trim();
	return await participantRepository
		.createQueryBuilder('participant')
		.where('LOWER(participant.email) = :email', { email: normalizedEmail })
		.orderBy('participant.registrationDate', 'DESC')
		.getOne();
};

/**
 * Check if a participant exists by email (for server registration flow)
 * Returns existence status and participant details if found
 */
export const checkParticipantExists = async (
	email: string,
): Promise<{ exists: boolean; firstName?: string; lastName?: string; message?: string }> => {
	const existing = await findParticipantByEmail(email);

	if (!existing) {
		return { exists: false };
	}

	return {
		exists: true,
		firstName: existing.firstName,
		lastName: existing.lastName,
		message: `Se encontró un registro existente para ${email} (${existing.firstName} ${existing.lastName})`,
	};
};

/**
 * Dry-run validation for participant registration.
 * Runs all checks (email uniqueness, retreat exists/public, capacity) without any DB writes.
 */
export const validateParticipant = async (
	participantData: CreateParticipant,
): Promise<{ valid: boolean; error?: string; warnings: string[] }> => {
	const warnings: string[] = [];
	const retreatRepository = AppDataSource.getRepository(Retreat);
	const historyRepo = AppDataSource.getRepository(RetreatParticipant);

	// 1. Check retreat exists and is public
	if (!participantData.retreatId) {
		return { valid: false, error: 'retreatId es requerido', warnings };
	}
	const retreat = await retreatRepository.findOne({ where: { id: participantData.retreatId } });
	if (!retreat) {
		return { valid: false, error: 'Retiro no encontrado', warnings };
	}
	if (!retreat.isPublic) {
		return { valid: false, error: 'El retiro no está abierto para registro público', warnings };
	}

	// 2. Check email uniqueness
	const normalizedEmail = participantData.email?.toLowerCase().trim();
	if (normalizedEmail) {
		const existing = await findParticipantByEmail(normalizedEmail);
		if (existing) {
			warnings.push(
				`Ya existe un participante con este correo: ${existing.firstName} ${existing.lastName}. Se actualizará su registro.`,
			);
		}
	}

	// 3. Check retreat capacity
	const type = participantData.type;
	if (type === 'walker' && retreat.max_walkers != null) {
		const walkerCount = await historyRepo.count({
			where: { retreatId: retreat.id, type: 'walker', isCancelled: false },
		});
		if (walkerCount >= retreat.max_walkers) {
			warnings.push(
				`El retiro ha alcanzado su capacidad máxima de caminantes (${retreat.max_walkers}). El participante quedará en lista de espera.`,
			);
		}
	}
	if ((type === 'server' || type === 'partial_server') && retreat.max_servers != null) {
		const serverCount = await historyRepo.count({
			where: [
				{ retreatId: retreat.id, type: 'server', isCancelled: false },
				{ retreatId: retreat.id, type: 'partial_server', isCancelled: false },
			],
		});
		if (serverCount >= retreat.max_servers) {
			warnings.push(
				`El retiro ha alcanzado su capacidad máxima de servidores (${retreat.max_servers}).`,
			);
		}
	}

	return { valid: true, warnings };
};

/**
 * Confirm an existing participant for a retreat without changing their personal data.
 * Creates a RetreatParticipant row and updates their retreatId.
 */
export const confirmExistingParticipant = async (
	email: string,
	retreatId: string,
	type: 'server' | 'partial_server',
): Promise<{ success: true; firstName: string; lastName: string }> => {
	const existing = await findParticipantByEmail(email);
	if (!existing) {
		throw new Error('Participant not found');
	}

	return AppDataSource.transaction(async (transactionalEntityManager) => {
		const participantRepo = transactionalEntityManager.getRepository(Participant);
		const historyRepo = transactionalEntityManager.getRepository(RetreatParticipant);

		const oldRetreatId = existing.retreatId;
		const sameRetreat = oldRetreatId === retreatId;

		// If different retreat, save history for the old retreat first
		if (!sameRetreat && oldRetreatId) {
			const oldRp = await historyRepo.findOne({
				where: { participantId: existing.id, retreatId: oldRetreatId },
			});

			if (!oldRp) {
				try {
					const oldHistoryData: CreateHistoryData = {
						userId: existing.userId || null,
						participantId: existing.id,
						retreatId: oldRetreatId,
						roleInRetreat: 'server',
						isPrimaryRetreat: false,
					};
					const newOldHistory = historyRepo.create(oldHistoryData);
					await historyRepo.save(newOldHistory);
				} catch (historyError) {
					console.error('Error creating history for old retreat:', historyError);
				}
			}
		}

		// Update retreatId only — do NOT overwrite personal data
		existing.retreatId = retreatId;
		existing.lastUpdatedDate = new Date();
		await participantRepo.save(existing);

		// Ensure RetreatParticipant record exists for the new retreat
		const existingRp = await historyRepo.findOne({
			where: { participantId: existing.id, retreatId },
		});

		if (!existingRp) {
			const nextId = await getNextIdOnRetreat(retreatId, transactionalEntityManager);
			const rpData: CreateHistoryData = {
				userId: existing.userId || null,
				participantId: existing.id,
				retreatId,
				roleInRetreat: 'server',
				isPrimaryRetreat: false,
				type,
				isCancelled: false,
				idOnRetreat: nextId,
			};
			const rp = historyRepo.create(rpData);
			await historyRepo.save(rp);
		} else {
			existingRp.type = type;
			existingRp.isCancelled = false;
			existingRp.roleInRetreat = 'server';
			if (existingRp.idOnRetreat == null) {
				existingRp.idOnRetreat = await getNextIdOnRetreat(retreatId, transactionalEntityManager);
			}
			await historyRepo.save(existingRp);
		}

		if (existing.userId) {
			await autoSetPrimaryRetreat(existing.userId);
		}

		console.warn(
			`✅ Confirmed existing participant ${existing.email} for retreat ${retreatId}`,
		);

		return { success: true as const, firstName: existing.firstName, lastName: existing.lastName };
	});
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

	// Join through retreat_participants to find all participants for this retreat,
	// even if their current participant.retreatId has moved to a different retreat
	queryBuilder.innerJoin(
		'retreat_participants',
		'ph',
		'ph."participantId" = participant.id AND ph."retreatId" = :phRetreatId',
		{ phRetreatId: retreatId },
	);

	// Apply base relations (skip tableMesa — no longer a DB relation on Participant)
	allRelations
		.filter((r) => r !== 'tableMesa')
		.forEach((relation) => {
			const parts = relation.split('.');
			if (parts.length === 1) {
				if (parts[0] === 'retreatBed') {
					// Scope retreatBed JOIN to the requested retreat (not participant.retreatId)
					queryBuilder.leftJoinAndSelect(
						'participant.retreatBed',
						'retreatBed',
						'retreatBed.retreatId = :retreatId',
						{ retreatId },
					);
				} else if (parts[0] === 'payments') {
					// Scope payments JOIN to the requested retreat
					queryBuilder.leftJoinAndSelect(
						'participant.payments',
						'payments',
						'payments.retreatId = :paymentsRetreatId',
						{ paymentsRetreatId: retreatId },
					);
				} else {
					queryBuilder.leftJoinAndSelect(`participant.${parts[0]}`, parts[0]);
				}
			} else if (parts[0] === 'tags' && parts[1] === 'tag') {
				// Scope tag join to the current retreat so tags from other retreats are excluded
				queryBuilder.leftJoinAndSelect('tags.tag', 'tag', 'tag.retreatId = :tagRetreatId', {
					tagRetreatId: retreatId,
				});
			} else {
				// Handle nested relations like 'retreat.house'
				queryBuilder.leftJoinAndSelect(`${parts[0]}.${parts[1]}`, parts[1]);
			}
		});

	// Filter by retreat via the history join (already applied in innerJoin)
	// Add a WHERE clause to satisfy TypeORM's query structure
	queryBuilder.where('1 = 1');

	if (type) {
		queryBuilder.andWhere('ph."type" = :type', { type });
	}

	if (typeof isCancelled === 'boolean') {
		queryBuilder.andWhere('ph."isCancelled" = :isCancelled', { isCancelled });
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

	// Overlay retreat-specific fields from retreat_participants
	if (participants.length > 0) {
		const historyRepo = AppDataSource.getRepository(RetreatParticipant);
		const historyRows = await historyRepo.find({
			where: {
				retreatId,
				participantId: In(participants.map((p) => p.id)),
			},
			select: [
				'participantId',
				'type',
				'isCancelled',
				'tableId',
				'idOnRetreat',
				'familyFriendColor',
			],
		});
		const historyMap = new Map(
			historyRows.map((h) => [h.participantId, h]),
		);
		for (const p of participants) {
			const h = historyMap.get(p.id);
			if (h) {
				if (h.type != null) p.type = h.type as any;
				if (h.isCancelled != null) p.isCancelled = h.isCancelled;
				if (h.tableId !== undefined) p.tableId = h.tableId;
				if (h.idOnRetreat != null) p.id_on_retreat = h.idOnRetreat;
				if (h.familyFriendColor !== undefined)
					p.family_friend_color = h.familyFriendColor ?? undefined;
			}
		}

		// Attach message count per participant for this retreat
		const communicationRepo = AppDataSource.getRepository(ParticipantCommunication);
		const messageCounts = await communicationRepo
			.createQueryBuilder('pc')
			.select('pc.participantId', 'participantId')
			.addSelect('COUNT(pc.id)', 'count')
			.where('pc.retreatId = :retreatId', { retreatId })
			.andWhere('pc.participantId IN (:...ids)', { ids: participants.map((p) => p.id) })
			.groupBy('pc.participantId')
			.getRawMany<{ participantId: string; count: string | number }>();
		const messageCountMap = new Map<string, number>(
			messageCounts.map((row) => [row.participantId, Number(row.count) || 0]),
		);
		for (const p of participants) {
			p.messageCount = messageCountMap.get(p.id) ?? 0;
		}
	}

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
	const relations = ['retreat', 'retreatBed', 'tags', 'tags.tag'];
	if (includePayments) {
		relations.push('payments', 'payments.recordedByUser');
	}

	const participant = await participantRepository.findOne({
		where: { id },
		relations,
	});

	if (!participant) return null;

	// Filter tags to only include those belonging to the participant's current retreat
	if (participant.tags && participant.retreatId) {
		participant.tags = participant.tags.filter(
			(pt: any) => pt.tag?.retreatId === participant.retreatId,
		);
	}

	// Overlay retreat-specific fields from retreat_participants
	if (participant.retreatId) {
		const rpRepo = AppDataSource.getRepository(RetreatParticipant);
		const rp = await rpRepo.findOne({
			where: { participantId: participant.id, retreatId: participant.retreatId },
			relations: ['tableMesa'],
		});
		if (rp) {
			if (rp.type != null) participant.type = rp.type as any;
			if (rp.isCancelled != null) participant.isCancelled = rp.isCancelled;
			if (rp.tableId !== undefined) participant.tableId = rp.tableId;
			if (rp.idOnRetreat != null) participant.id_on_retreat = rp.idOnRetreat;
			if (rp.familyFriendColor !== undefined)
				participant.family_friend_color = rp.familyFriendColor ?? undefined;
			if (rp.tableMesa) participant.tableMesa = rp.tableMesa;
		}
	}

	// Enrich server leaders who have no tableId but are lider/colider on a table
	if (
		!participant.tableMesa &&
		(participant.type === 'server' || participant.type === 'partial_server')
	) {
		const leaderTable = await AppDataSource.getRepository(TableMesa)
			.createQueryBuilder('t')
			.where(
				'(t.liderId = :pid OR t.colider1Id = :pid OR t.colider2Id = :pid)',
				{ pid: participant.id },
			)
			.andWhere('t.retreatId = :retreatId', { retreatId: participant.retreatId })
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
		.andWhere('bed.isActive = :isActive', { isActive: true })
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
		// Find other walkers invited by same person who have a table, via retreat_participants join
		const rpRepo = AppDataSource.getRepository(RetreatParticipant);
		const rpWithTable = await rpRepo
			.createQueryBuilder('rp')
			.innerJoin('rp.participant', 'p')
			.where('rp."retreatId" = :retreatId', { retreatId: participant.retreatId })
			.andWhere('LOWER(p."invitedBy") = LOWER(:invitedBy)', { invitedBy: participant.invitedBy })
			.andWhere('rp."participantId" != :pid', { pid: participant.id })
			.andWhere('rp."tableId" IS NOT NULL')
			.select(['rp.tableId'])
			.getMany();
		const tablesToExclude = rpWithTable.map((rp) => rp.tableId).filter(Boolean);
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
		const normalizedEmail = participantData.email?.toLowerCase().trim();
		const existingParticipantByEmail = normalizedEmail
			? await participantRepository
				.createQueryBuilder('participant')
				.where('LOWER(participant.email) = :email', { email: normalizedEmail })
				.orderBy('participant.registrationDate', 'DESC')
				.getOne()
			: null;

		// SI EXISTE: Actualizar el Participant existente con nueva información del retiro
		if (existingParticipantByEmail) {
			const sameRetreat = existingParticipantByEmail.retreatId === participantData.retreatId;

			const historyRepo = transactionalEntityManager.getRepository(RetreatParticipant);

			// If different retreat, save history for the old retreat first
			if (!sameRetreat) {
				const oldRetreatId = existingParticipantByEmail.retreatId;

				// Load old retreat-specific fields from retreat_participants
				let oldRp: RetreatParticipant | null = null;
				if (oldRetreatId) {
					oldRp = await historyRepo.findOne({
						where: { participantId: existingParticipantByEmail.id, retreatId: oldRetreatId },
					});
				}
				const oldType = oldRp?.type;

				// Ensure old retreat has a history entry (create if missing)
				if (oldRetreatId && !oldRp) {
					try {
						const oldHistoryData: CreateHistoryData = {
							userId: existingParticipantByEmail.userId || null,
							participantId: existingParticipantByEmail.id,
							retreatId: oldRetreatId,
							roleInRetreat:
								oldType === 'walker' || oldType === 'waiting'
									? 'walker'
									: oldType === 'server' || oldType === 'partial_server'
										? 'server'
										: 'walker',
							isPrimaryRetreat: false,
						};
						const newOldHistory = historyRepo.create(oldHistoryData);
						await historyRepo.save(newOldHistory);
					} catch (historyError) {
						console.error('Error creating history for old retreat:', historyError);
					}
				}
			}

			// Update the existing participant with new data (personal data + retreat assignment)
			const { type: newType, isCancelled: newCancelled, tableId: newTableId, id_on_retreat: newIdOnRetreat, family_friend_color: newColor, tableMesa: _tm, retreatBed: _rb, ...personalUpdates } = participantData;
			Object.assign(existingParticipantByEmail, {
				...personalUpdates,
				retreatId: participantData.retreatId,
				lastUpdatedDate: new Date(),
				registrationDate: existingParticipantByEmail.registrationDate,
			});

			const updatedParticipant = await participantRepository.save(existingParticipantByEmail);

			// Ensure RetreatParticipant record exists for this retreat
			if (updatedParticipant.retreatId) {
				try {
					const rpHistoryData: CreateHistoryData = {
						userId: updatedParticipant.userId || null,
						participantId: updatedParticipant.id,
						retreatId: updatedParticipant.retreatId,
						roleInRetreat:
							newType === 'walker' || newType === 'waiting'
								? 'walker'
								: newType === 'server' || newType === 'partial_server'
									? 'server'
									: 'walker',
						isPrimaryRetreat: false,
						type: newType,
						isCancelled: newCancelled ?? false,
						tableId: newTableId ?? null,
						idOnRetreat: newIdOnRetreat != null
							? (typeof newIdOnRetreat === 'string' ? parseInt(newIdOnRetreat, 10) || null : newIdOnRetreat)
							: await getNextIdOnRetreat(updatedParticipant.retreatId, transactionalEntityManager),
						familyFriendColor: newColor || null,
					};

					const rpRepo = transactionalEntityManager.getRepository(RetreatParticipant);
					const existingRp = await rpRepo.findOne({
						where: {
							participantId: updatedParticipant.id,
							retreatId: updatedParticipant.retreatId,
						},
					});

					if (!existingRp) {
						const rp = rpRepo.create(rpHistoryData);
						await rpRepo.save(rp);
					} else {
						// Update existing retreat_participant record with latest data
						existingRp.type = newType;
						existingRp.isCancelled = newCancelled ?? false;
						existingRp.roleInRetreat =
							newType === 'walker' || newType === 'waiting'
								? 'walker'
								: newType === 'server' || newType === 'partial_server'
									? 'server'
									: 'walker';
						if (newIdOnRetreat != null) {
							existingRp.idOnRetreat = typeof newIdOnRetreat === 'string'
								? parseInt(newIdOnRetreat, 10) || existingRp.idOnRetreat
								: newIdOnRetreat;
						} else if (existingRp.idOnRetreat == null) {
							existingRp.idOnRetreat = await getNextIdOnRetreat(updatedParticipant.retreatId, transactionalEntityManager);
						}
						if (newColor !== undefined) {
							existingRp.familyFriendColor = newColor || null;
						}
						await rpRepo.save(existingRp);
					}

					if (updatedParticipant.userId) {
						await autoSetPrimaryRetreat(updatedParticipant.userId);
					}
				} catch (historyError) {
					console.error('Error creating retreat participant for new retreat:', historyError);
				}
			}

			// Set virtual fields for API response
			updatedParticipant.type = newType as any;
			updatedParticipant.isCancelled = newCancelled ?? false;

			console.warn(
				`✅ Successfully updated and reused participant ${updatedParticipant.email} for retreat ${updatedParticipant.retreatId}`,
			);

			return updatedParticipant;
		}

		// SI NO EXISTE: Verificar que no exista en el mismo retiro (validación original)
		const existingInRetreat = normalizedEmail
			? await participantRepository
				.createQueryBuilder('participant')
				.where('LOWER(participant.email) = :email AND participant.retreatId = :retreatId', {
					email: normalizedEmail,
					retreatId: participantData.retreatId,
				})
				.getOne()
			: null;
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
				// Join participants with retreat_participants to get type and color
				const rpRepo = transactionalEntityManager.getRepository(RetreatParticipant);
				const findAnyWalkerQb = participantRepository
					.createQueryBuilder('participant')
					.innerJoin(
						'retreat_participants', 'rp',
						'rp."participantId" = participant.id AND rp."retreatId" = :retreatId',
					)
					.addSelect('rp."familyFriendColor"', 'rpColor')
					.where('rp."retreatId" = :retreatId')
					.andWhere('rp."type" = :type', { type: 'walker' })
					.andWhere(new Brackets((qb) => qb.where(searchConditions.join(' OR '))));

				const existingWalkersRaw = await findAnyWalkerQb.setParameters(parameters).getRawAndEntities();
				const existingWalkers = existingWalkersRaw.entities;
				// Overlay familyFriendColor from raw results
				for (let i = 0; i < existingWalkers.length; i++) {
					existingWalkers[i].family_friend_color = existingWalkersRaw.raw[i]?.rpColor ?? undefined;
				}

				// Only assign color if there are 2 or more walkers in the group (including the new one)
				if (existingWalkers.length >= 1) {
					const existingWalkerWithColor = existingWalkers.find((w) => w.family_friend_color);

					if (existingWalkerWithColor?.family_friend_color) {
						colorToAssign = existingWalkerWithColor.family_friend_color;
					} else {
						// Find all used colors in this retreat from retreat_participants
						const usedColorsResult = await rpRepo
							.createQueryBuilder('rp')
							.select('DISTINCT rp."familyFriendColor"', 'color')
							.where('rp."retreatId" = :retreatId', { retreatId: participantData.retreatId })
							.andWhere('rp."familyFriendColor" IS NOT NULL')
							.getRawMany();
						const usedColors = usedColorsResult.map((r: any) => r.color);

						const availableColor = COLOR_POOL.find((c) => !usedColors.includes(c));
						colorToAssign =
							availableColor || COLOR_POOL[Math.floor(Math.random() * COLOR_POOL.length)];

						if (colorToAssign) {
							// Update all walkers in the group to use the new color in retreat_participants
							const walkerIds = existingWalkers.map((w) => w.id);
							if (walkerIds.length > 0) {
								await rpRepo
									.createQueryBuilder()
									.update(RetreatParticipant)
									.set({ familyFriendColor: colorToAssign })
									.where('"retreatId" = :retreatId', { retreatId: participantData.retreatId })
									.andWhere('"participantId" IN (:...walkerIds)', { walkerIds })
									.execute();
							}
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
					const rpRepo = transactionalEntityManager.getRepository(RetreatParticipant);
					const participantCount = await rpRepo.count({
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

		const id_on_retreat = await getNextIdOnRetreat(participantData.retreatId!, transactionalEntityManager);

		const { retreatBed, tableMesa, type, isCancelled, tableId, id_on_retreat: _idOnRetreat, family_friend_color, ...restOfParticipantData } = participantData;

		const newParticipantData = {
			...restOfParticipantData,
			registrationDate: new Date(),
			lastUpdatedDate: new Date(),
		};

		if (!newParticipantData.nickname) {
			newParticipantData.nickname = newParticipantData.firstName;
		}

		// Auto-link to a user account if the participant's email matches one.
		// This ensures `/retreats/attended` and `/history/my-retreats` immediately
		// surface the retreat for the owning user.
		if (!(newParticipantData as any).userId && normalizedEmail) {
			const userRepo = transactionalEntityManager.getRepository(User);
			const matchingUser = await userRepo
				.createQueryBuilder('user')
				.where('LOWER(user.email) = :email', { email: normalizedEmail })
				.getOne();
			if (matchingUser) {
				(newParticipantData as any).userId = matchingUser.id;
			}
		}

		const newParticipant = participantRepository.create(newParticipantData);
		let savedParticipant: Participant = await participantRepository.save(newParticipant);

		// Reciprocal link: if the matched user has no participantId yet, set it.
		if (savedParticipant.userId) {
			const userRepo = transactionalEntityManager.getRepository(User);
			await userRepo
				.createQueryBuilder()
				.update(User)
				.set({ participantId: savedParticipant.id })
				.where('id = :id AND participantId IS NULL', { id: savedParticipant.userId })
				.execute();
		}

		// Set virtual fields for use later in this function
		savedParticipant.type = participantData.type;
		savedParticipant.isCancelled = participantData.isCancelled ?? false;
		savedParticipant.id_on_retreat = id_on_retreat;
		savedParticipant.family_friend_color = colorToAssign || undefined;

		// Create participant history entry for every participant with a retreat
		if (savedParticipant.retreatId) {
			try {
				const historyData: CreateHistoryData = {
					userId: savedParticipant.userId || null,
					participantId: savedParticipant.id,
					retreatId: savedParticipant.retreatId,
					roleInRetreat:
						savedParticipant.type === 'walker' || savedParticipant.type === 'waiting'
							? 'walker'
							: savedParticipant.type === 'server' || savedParticipant.type === 'partial_server'
								? 'server'
								: 'walker',
					isPrimaryRetreat: false, // Will be auto-set later
					type: savedParticipant.type,
					isCancelled: savedParticipant.isCancelled,
					tableId: savedParticipant.tableId,
					idOnRetreat: savedParticipant.id_on_retreat,
					familyFriendColor: savedParticipant.family_friend_color || null,
				};

				const historyRepository = transactionalEntityManager.getRepository(RetreatParticipant);
				const history = historyRepository.create(historyData);
				await historyRepository.save(history);

				// Auto-set primary retreat for this user (only if userId exists)
				if (savedParticipant.userId) {
					await autoSetPrimaryRetreat(savedParticipant.userId);
				}

				console.warn(
					`✅ Created participant history for participant ${savedParticipant.id} in retreat ${savedParticipant.retreatId}`,
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
				// Write tableId to retreat_participants (not participants)
				if (tableId && savedParticipant.retreatId) {
					await transactionalEntityManager
						.getRepository(RetreatParticipant)
						.update(
							{ participantId: savedParticipant.id, retreatId: savedParticipant.retreatId },
							{ tableId },
						);
					savedParticipant.tableId = tableId;
				}

				// Refresh the participant to get the updated data
				// Preserve virtual fields (type, isCancelled, etc.) that aren't DB columns
				const virtualType = savedParticipant.type;
				const virtualIsCancelled = savedParticipant.isCancelled;
				const virtualIdOnRetreat = savedParticipant.id_on_retreat;
				const virtualFamilyColor = savedParticipant.family_friend_color;
				savedParticipant =
					(await transactionalEntityManager.getRepository(Participant).findOne({
						where: { id: savedParticipant.id },
					})) || savedParticipant;
				savedParticipant.type = virtualType;
				savedParticipant.isCancelled = virtualIsCancelled;
				savedParticipant.id_on_retreat = virtualIdOnRetreat;
				savedParticipant.family_friend_color = virtualFamilyColor;
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
			const commRepo = transactionalEntityManager.getRepository(ParticipantCommunication);

			const logCommunication = async (opts: {
				participantId: string;
				retreatId: string;
				recipientContact: string;
				subject: string;
				messageContent: string;
				templateId?: string;
				templateName?: string;
			}) => {
				try {
					await commRepo.save(commRepo.create({
						participantId: opts.participantId,
						scope: 'retreat' as const,
						retreatId: opts.retreatId,
						messageType: 'email' as const,
						recipientContact: opts.recipientContact,
						messageContent: opts.messageContent,
						templateId: opts.templateId,
						templateName: opts.templateName,
						subject: opts.subject,
						sentBy: null as any,
					}));
				} catch (logErr) {
					console.error('Error logging communication:', logErr);
				}
			};

			// Send welcome email to participant (configurable)
			if (retreat.notifyParticipant !== false) {
				const templateType = savedParticipant.type === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';

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
					await logCommunication({
						participantId: savedParticipant.id,
						retreatId: savedParticipant.retreatId,
						recipientContact: savedParticipant.email,
						subject: `Bienvenida ${savedParticipant.type === 'walker' ? 'Caminante' : 'Servidor'}`,
						messageContent: welcomeTemplate.message,
						templateId: welcomeTemplate.id,
						templateName: welcomeTemplate.name,
					});
				}
			}

			// Send notification email to the server who invited the participant (configurable)
			if (retreat.notifyInviter !== false && savedParticipant.invitedBy && retreat) {
				// Find the server who invited this participant
				const invitingServer = await transactionalEntityManager
					.getRepository(Participant)
					.createQueryBuilder('participant')
					.innerJoin(
						'retreat_participants', 'rp',
						'rp."participantId" = participant.id AND rp."retreatId" = :retreatId',
						{ retreatId: savedParticipant.retreatId }
					)
					.where('rp."retreatId" = :retreatId', { retreatId: savedParticipant.retreatId })
					.andWhere('participant.nickname = :nickname', { nickname: savedParticipant.invitedBy })
					.andWhere('rp."type" = :type', { type: 'server' })
					.getOne();

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

					const inviterSubject = `Nuevo participante invitado: ${savedParticipant.firstName} ${savedParticipant.lastName}`;

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
						await logCommunication({
							participantId: savedParticipant.id,
							retreatId: savedParticipant.retreatId,
							recipientContact: invitingServer.email,
							subject: inviterSubject,
							messageContent: notificationTemplate.message,
							templateId: notificationTemplate.id,
							templateName: notificationTemplate.name,
						});
					} else {
						const fallbackContent = `
								<h2>¡Hola ${escapeHtml(invitingServer.firstName)}!</h2>
								<p>Te informamos que <strong>${escapeHtml(savedParticipant.firstName)} ${escapeHtml(savedParticipant.lastName)}</strong> se ha registrado exitosamente en el retiro.</p>
								<p><strong>Detalles del participante:</strong></p>
								<ul>
									<li>Nombre: ${escapeHtml(savedParticipant.firstName)} ${escapeHtml(savedParticipant.lastName)}</li>
									<li>Tipo: ${savedParticipant.type === 'walker' ? 'Caminante' : 'Servidor'}</li>
									<li>Email: ${escapeHtml(savedParticipant.email) || 'No proporcionado'}</li>
									<li>Teléfono: ${escapeHtml(savedParticipant.cellPhone) || 'No proporcionado'}</li>
								</ul>
								<p>Gracias por invitar a nuevos participantes al retiro.</p>
							`;
						await emailService.sendParticipantEmail({
							to: invitingServer.email,
							subject: inviterSubject,
							participant: savedParticipant,
							retreat: retreat,
							messageContent: fallbackContent,
						});
						await logCommunication({
							participantId: savedParticipant.id,
							retreatId: savedParticipant.retreatId,
							recipientContact: invitingServer.email,
							subject: inviterSubject,
							messageContent: fallbackContent,
						});
					}
					console.warn(
						`Notification email sent to server ${invitingServer.nickname} for new participant ${savedParticipant.firstName} ${savedParticipant.lastName}`,
					);
				} else {
					console.warn(
						`Could not find server with nickname '${savedParticipant.invitedBy}' to send notification`,
					);
				}
			}

			// Send notification to configured palanqueros (only for walkers)
			if (savedParticipant.type === 'walker' && retreat.notifyPalanqueros?.length) {
				const palanqueroNames = retreat.notifyPalanqueros.map((n: number) => `Palanquero ${n}`);

				const palanqueroResponsibilities = await transactionalEntityManager
					.getRepository(Responsability)
					.createQueryBuilder('r')
					.leftJoinAndSelect('r.participant', 'participant')
					.where('r.retreatId = :retreatId', { retreatId: retreat.id })
					.andWhere('r.name IN (:...names)', { names: palanqueroNames })
					.andWhere('r.participantId IS NOT NULL')
					.getMany();

				for (const resp of palanqueroResponsibilities) {
					if (!resp.participant?.email) continue;

					const palanqueroTemplate = await transactionalEntityManager
						.getRepository(MessageTemplate)
						.findOne({
							where: {
								retreatId: retreat.id,
								type: 'PALANQUERO_NEW_WALKER',
							},
						});

					const palanqueroSubject = `Nuevo caminante registrado: ${savedParticipant.firstName} ${savedParticipant.lastName}`;

					if (palanqueroTemplate) {
						await emailService.sendEmailWithTemplate(
							resp.participant.email,
							palanqueroTemplate.id,
							retreat.id,
							{
								participant: savedParticipant,
								retreat: retreat,
							},
						);
						await logCommunication({
							participantId: savedParticipant.id,
							retreatId: retreat.id,
							recipientContact: resp.participant.email,
							subject: palanqueroSubject,
							messageContent: palanqueroTemplate.message,
							templateId: palanqueroTemplate.id,
							templateName: palanqueroTemplate.name,
						});
					} else {
						const fallbackContent = `
								<h2>¡Hola ${escapeHtml(resp.participant.firstName)}!</h2>
								<p>Un nuevo caminante se ha registrado en el retiro.</p>
								<p><strong>Detalles del caminante:</strong></p>
								<ul>
									<li>Nombre: ${escapeHtml(savedParticipant.firstName)} ${escapeHtml(savedParticipant.lastName)}</li>
									<li>Email: ${escapeHtml(savedParticipant.email) || 'No proporcionado'}</li>
									<li>Teléfono: ${escapeHtml(savedParticipant.cellPhone) || 'No proporcionado'}</li>
									<li>Invitado por: ${escapeHtml(savedParticipant.invitedBy) || 'No especificado'}</li>
								</ul>
							`;
						await emailService.sendParticipantEmail({
							to: resp.participant.email,
							subject: palanqueroSubject,
							participant: savedParticipant,
							retreat: retreat,
							messageContent: fallbackContent,
						});
						await logCommunication({
							participantId: savedParticipant.id,
							retreatId: retreat.id,
							recipientContact: resp.participant.email,
							subject: palanqueroSubject,
							messageContent: fallbackContent,
						});
					}
					console.warn(
						`Palanquero notification sent to ${resp.participant.email} (${resp.name}) for new walker ${savedParticipant.firstName} ${savedParticipant.lastName}`,
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

	// Separate retreat-specific fields (written to retreat_participants)
	// Also strip relation objects and read-only fields that TypeORM would try to cascade
	const {
		type, isCancelled, tableId, id_on_retreat, family_friend_color, tableMesa,
		retreatBed, tags, payments, responsibilities, retreat, user, participantTags,
		id: _id,
		...personalData
	} = participantData as any;

	// First, overlay current retreat-specific values from retreat_participants
	let currentRp: RetreatParticipant | null = null;
	if (participant.retreatId) {
		const rpRepo = AppDataSource.getRepository(RetreatParticipant);
		currentRp = await rpRepo.findOne({
			where: { participantId: id, retreatId: participant.retreatId },
		});
	}
	const wasCancelled = currentRp?.isCancelled ?? false;

	// Update personal data on participants table
	personalData.lastUpdatedDate = new Date();
	participantRepository.merge(participant, personalData);
	const updatedParticipant = await participantRepository.save(participant);

	// Update retreat-specific fields on retreat_participants
	if (updatedParticipant.retreatId) {
		const rpUpdates: any = {};
		if (type !== undefined) rpUpdates.type = type;
		if (isCancelled !== undefined) rpUpdates.isCancelled = isCancelled;
		if (tableId !== undefined) rpUpdates.tableId = tableId;
		if (id_on_retreat !== undefined) rpUpdates.idOnRetreat = id_on_retreat;
		if (family_friend_color !== undefined) rpUpdates.familyFriendColor = family_friend_color || null;

		// If being cancelled, clear table assignment
		if (isCancelled === true && !wasCancelled) {
			rpUpdates.tableId = null;

			// Also clear the participant assignment in the RetreatBed table (scoped to this retreat)
			const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
			await retreatBedRepository
				.createQueryBuilder()
				.update(RetreatBed)
				.set({ participantId: null })
				.where('participantId = :id', { id: updatedParticipant.id })
				.andWhere('retreatId = :retreatId', { retreatId: updatedParticipant.retreatId })
				.execute();
		}

		if (Object.keys(rpUpdates).length > 0) {
			try {
				await syncRetreatFields(updatedParticipant.id, updatedParticipant.retreatId, rpUpdates);
			} catch (err) {
				console.error('Error syncing retreat fields:', err);
			}
		}

		// Set virtual fields on returned object
		updatedParticipant.type = type !== undefined ? type : currentRp?.type;
		updatedParticipant.isCancelled = isCancelled !== undefined ? isCancelled : currentRp?.isCancelled;
		updatedParticipant.tableId = rpUpdates.tableId !== undefined ? rpUpdates.tableId : (tableId !== undefined ? tableId : currentRp?.tableId);
		updatedParticipant.id_on_retreat = id_on_retreat !== undefined ? id_on_retreat : (currentRp?.idOnRetreat ?? undefined);
		updatedParticipant.family_friend_color = family_friend_color !== undefined ? (family_friend_color ?? undefined) : (currentRp?.familyFriendColor ?? undefined);
	}

	return updatedParticipant;
};

export const deleteParticipant = async (
	id: string,
	skipRebalance: boolean = false,
): Promise<void> => {
	const participant = await participantRepository.findOneBy({ id });
	if (participant && participant.retreatId) {
		// Mark as cancelled in retreat_participants (ground truth)
		try {
			await syncRetreatFields(participant.id, participant.retreatId, {
				isCancelled: true,
				tableId: null,
			});
		} catch (err) {
			console.error('Error syncing delete to retreat_participants:', err);
		}

		// Clear bed assignment
		try {
			const retreatBedRepository = AppDataSource.getRepository(RetreatBed);
			await retreatBedRepository
				.createQueryBuilder()
				.update(RetreatBed)
				.set({ participantId: null })
				.where('participantId = :id', { id: participant.id })
				.andWhere('retreatId = :retreatId', { retreatId: participant.retreatId })
				.execute();
		} catch (err) {
			console.error('Error clearing bed assignment on delete:', err);
		}
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
		id_on_retreat: participant.id != null ? parseInt(String(participant.id).trim(), 10) || undefined : undefined,
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
	retreatId?: string,
): Promise<{
	isLeader: boolean;
	role?: 'lider' | 'colider1' | 'colider2';
	tableName?: string;
	tableId?: string;
}> => {
	try {
		// Check all three leadership roles (scoped to retreat if provided)
		const leaderWhere: any = { liderId: participantId };
		if (retreatId) leaderWhere.retreatId = retreatId;

		const leaderTable = await tableMesaRepository.findOne({
			where: leaderWhere,
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

		const coliderWhere1: any = { colider1Id: participantId };
		if (retreatId) coliderWhere1.retreatId = retreatId;

		const colider1Table = await tableMesaRepository.findOne({
			where: coliderWhere1,
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

		const coliderWhere2: any = { colider2Id: participantId };
		if (retreatId) coliderWhere2.retreatId = retreatId;

		const colider2Table = await tableMesaRepository.findOne({
			where: coliderWhere2,
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

		// Check if payment already exists for this participant in this retreat
		const existingPayments = await paymentRepository.find({
			where: { participantId, retreatId },
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

	// Load current type from retreat_participants
	if (participant.retreatId) {
		const rpRepo = AppDataSource.getRepository(RetreatParticipant);
		const rp = await rpRepo.findOne({
			where: { participantId, retreatId: participant.retreatId },
		});
		if (rp) participant.type = rp.type as any;
	}

	if (participant.type === 'server') {
		throw new Error('Participant is already a server');
	}

	// Update type to server in retreat_participants (ground truth)
	if (participant.retreatId) {
		try {
			await syncRetreatFields(participant.id, participant.retreatId, {
				type: 'server',
			});
		} catch (err) {
			console.error('Error syncing type change to retreat_participants:', err);
		}
	}

	participant.type = 'server';
	participant.lastUpdatedDate = new Date();
	const updated = await participantRepository.save(participant);
	updated.type = 'server'; // Virtual field for response

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

	// Query participants through retreat_participants for retreat-specific fields
	const rpRepo = AppDataSource.getRepository(RetreatParticipant);
	const rpRows = await rpRepo.find({
		where: { retreatId, isCancelled: false },
		relations: ['participant'],
	});

	const participants = rpRows
		.filter((rp) => rp.participant)
		.map((rp) => {
			const p = rp.participant!;
			p.type = rp.type as any;
			p.isCancelled = rp.isCancelled;
			p.tableId = rp.tableId;
			p.id_on_retreat = rp.idOnRetreat ?? undefined;
			p.family_friend_color = rp.familyFriendColor ?? undefined;
			return p;
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
			const importNormalizedEmail = mappedData.email.toLowerCase().trim();
			const existingParticipant = await participantRepository
				.createQueryBuilder('participant')
				.where('LOWER(participant.email) = :email AND participant.retreatId = :retreatId', {
					email: importNormalizedEmail,
					retreatId,
				})
				.getOne();

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
					// Write tableId to retreat_participants (not participants)
					const rpRepo = AppDataSource.getRepository(RetreatParticipant);
					await rpRepo
						.createQueryBuilder()
						.update(RetreatParticipant)
						.set({ tableId: existingTable.id })
						.where('"participantId" = :pid', { pid: participant.id })
						.andWhere('"retreatId" = :rid', { rid: retreatId })
						.execute();
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
			select: ['id', 'email', 'firstName', 'lastName'],
		});
		if (!freshParticipant) continue;

		// Load retreat-specific fields from retreat_participants
		const freshRp = await AppDataSource.getRepository(RetreatParticipant).findOne({
			where: { participantId: freshParticipant.id, retreatId },
		});
		if (!freshRp || freshRp.isCancelled || freshRp.type !== 'server') {
			continue;
		}

		// Check if this participant is already assigned to a leadership role in this batch
		if (assignedLeadershipIds.has(participant.id)) {
			continue;
		}

		// Check database for existing leadership assignments (from previous imports)
		const existingLeadership = await checkExistingLeadership(participant.id, retreatId);

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

			// Get all participants to process, loading virtual fields from retreat_participants
			const rpRepo = transactionalEntityManager.getRepository(RetreatParticipant);
			const rpRows = await rpRepo.find({
				where: { retreatId, participantId: In(processedParticipantIds) },
				relations: ['participant'],
			});
			const participantsToProcess = rpRows
				.filter((rp) => rp.participant)
				.map((rp) => {
					const p = rp.participant!;
					p.type = rp.type as any;
					p.isCancelled = rp.isCancelled;
					p.tableId = rp.tableId;
					p.id_on_retreat = rp.idOnRetreat ?? undefined;
					p.family_friend_color = rp.familyFriendColor ?? undefined;
					return p;
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
					select: ['id', 'email', 'firstName', 'lastName'],
				});
				if (!freshParticipant) continue;

				// Load retreat-specific fields from retreat_participants
				const freshBedRp = await transactionalEntityManager.getRepository(RetreatParticipant).findOne({
					where: { participantId: freshParticipant.id, retreatId },
				});
				if (freshBedRp?.isCancelled) {
					continue;
				}

				// Use the fresh participant data for all subsequent operations
				const participantForAssignment = freshParticipant;

				// Check if this participant already has a bed assigned in this retreat
				const hasExistingBedAssignment = await bedQueryUtils.participantHasBedAssignment(
					participantForAssignment.id,
					retreatId,
				);
				if (hasExistingBedAssignment) {
					const existingBed = await bedQueryUtils.getParticipantBedAssignment(
						participantForAssignment.id,
						retreatId,
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
					// Check if participant already has bed assignment in this retreat
					const hasExistingBedAssignment = await bedQueryUtils.participantHasBedAssignment(
						participant.id,
						retreatId,
					);
					const hasExistingTableAssignment = !!participant.tableId;

					if (hasExistingTableAssignment || hasExistingBedAssignment) {
						// Track existing bed assignments to prevent conflicts
						if (hasExistingBedAssignment) {
							const existingBed = await bedQueryUtils.getParticipantBedAssignment(participant.id, retreatId);
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
