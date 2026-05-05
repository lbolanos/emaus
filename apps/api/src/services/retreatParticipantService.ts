import { AppDataSource, DataSource } from '../data-source';
import { RetreatParticipant } from '../entities/retreatParticipant.entity';
import { User } from '../entities/user.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';
import { Not } from 'typeorm';

// Repositories - will be initialized in functions
let retreatParticipantRepository: any;
let userRepository: any;
let participantRepository: any;
let retreatRepository: any;

export const initializeRepositories = (dataSource?: DataSource) => {
	const ds = dataSource || AppDataSource;
	retreatParticipantRepository = ds.getRepository(RetreatParticipant);
	userRepository = ds.getRepository(User);
	participantRepository = ds.getRepository(Participant);
	retreatRepository = ds.getRepository(Retreat);
};

// Initialize with default AppDataSource
initializeRepositories();

// ==================== TYPES ====================

export type RoleInRetreat = 'walker' | 'server' | 'leader' | 'coordinator' | 'charlista';

export interface RetreatSnapshotFields {
	type?: string | null;
	isCancelled?: boolean;
	tableId?: string | null;
	idOnRetreat?: number | null;
	familyFriendColor?: string | null;
	bagMade?: boolean;
	// Scholarship
	isScholarship?: boolean;
	scholarshipAmount?: number | null;
	// Palancas
	palancasCoordinator?: string | null;
	palancasRequested?: boolean | null;
	palancasReceived?: string | null;
	palancasNotes?: string | null;
	// Inviter
	invitedBy?: string | null;
	isInvitedByEmausMember?: boolean | null;
	inviterHomePhone?: string | null;
	inviterWorkPhone?: string | null;
	inviterCellPhone?: string | null;
	inviterEmail?: string | null;
	// Logistics
	pickupLocation?: string | null;
	arrivesOnOwn?: boolean | null;
	requestsSingleRoom?: boolean | null;
	// Per-retreat administrative notes (the rp.notes column already exists)
	notes?: string | null;
}

export interface CreateHistoryData extends RetreatSnapshotFields {
	userId?: string | null;
	participantId?: string | null;
	retreatId: string;
	roleInRetreat: RoleInRetreat;
	isPrimaryRetreat?: boolean;
	notes?: string;
	metadata?: Record<string, any>;
}

export interface UpdateHistoryData extends RetreatSnapshotFields {
	roleInRetreat?: RoleInRetreat;
	isPrimaryRetreat?: boolean;
	notes?: string;
	metadata?: Record<string, any>;
}

// ==================== CRUD OPERATIONS ====================

/**
 * Get complete retreat history for a user
 */
export const getUserRetreatHistory = async (userId: string): Promise<RetreatParticipant[]> => {
	return await retreatParticipantRepository.find({
		where: { userId },
		relations: ['retreat', 'retreat.house', 'participant'],
		order: { createdAt: 'DESC' },
	});
};

/**
 * Get retreat history for a user filtered by role
 */
export const getUserRetreatHistoryByRole = async (
	userId: string,
	role: RoleInRetreat,
): Promise<RetreatParticipant[]> => {
	return await retreatParticipantRepository.find({
		where: { userId, roleInRetreat: role },
		relations: ['retreat', 'retreat.house', 'participant'],
		order: { createdAt: 'DESC' },
	});
};

/**
 * Get a specific history entry by ID
 */
export const getHistoryById = async (id: string): Promise<RetreatParticipant | null> => {
	return await retreatParticipantRepository.findOne({
		where: { id },
		relations: ['retreat', 'retreat.house', 'participant', 'user'],
	});
};

/**
 * Get history for a specific user and retreat
 */
export const getUserHistoryForRetreat = async (
	userId: string,
	retreatId: string,
): Promise<RetreatParticipant | null> => {
	return await retreatParticipantRepository.findOne({
		where: { userId, retreatId },
		relations: ['retreat', 'retreat.house', 'participant'],
	});
};

/**
 * Get all participants (history) for a specific retreat
 */
export const getParticipantsByRetreat = async (
	retreatId: string,
): Promise<RetreatParticipant[]> => {
	return await retreatParticipantRepository.find({
		where: { retreatId },
		relations: ['user', 'user.profile', 'participant', 'retreat'],
		order: { createdAt: 'ASC' },
	});
};

/**
 * Get all history entries for a specific participant
 */
export const getHistoryByParticipantId = async (
	participantId: string,
): Promise<RetreatParticipant[]> => {
	return await retreatParticipantRepository.find({
		where: { participantId },
		relations: ['retreat', 'retreat.house', 'user'],
		order: { createdAt: 'DESC' },
	});
};

/**
 * Create a new history entry
 */
export const createHistoryEntry = async (data: CreateHistoryData): Promise<RetreatParticipant> => {
	// Must have at least one identifier
	if (!data.userId && !data.participantId) {
		throw new Error('Se requiere userId o participantId');
	}

	// Validate user exists (only if userId provided)
	if (data.userId) {
		const user = await userRepository.findOne({ where: { id: data.userId } });
		if (!user) {
			throw new Error('Usuario no encontrado');
		}
	}

	// Validate retreat exists
	const retreat = await retreatRepository.findOne({ where: { id: data.retreatId } });
	if (!retreat) {
		throw new Error('Retiro no encontrado');
	}

	// If participantId is provided, validate it exists
	if (data.participantId) {
		const participant = await participantRepository.findOne({
			where: { id: data.participantId },
		});
		if (!participant) {
			throw new Error('Participante no encontrado');
		}
	}

	// Check for duplicate: use participantId+retreatId if available, else userId+retreatId
	if (data.participantId) {
		const existing = await retreatParticipantRepository.findOne({
			where: { participantId: data.participantId, retreatId: data.retreatId },
		});
		if (existing) {
			throw new Error('El participante ya tiene un historial para este retiro');
		}
	} else if (data.userId) {
		const existing = await retreatParticipantRepository.findOne({
			where: { userId: data.userId, retreatId: data.retreatId },
		});
		if (existing) {
			throw new Error('El usuario ya tiene un historial para este retiro');
		}
	}

	// If isPrimaryRetreat is true, unset other primary retreats for this identity
	if (data.isPrimaryRetreat) {
		if (data.userId) {
			await retreatParticipantRepository.update(
				{ userId: data.userId, isPrimaryRetreat: true },
				{ isPrimaryRetreat: false },
			);
		} else if (data.participantId) {
			await retreatParticipantRepository.update(
				{ participantId: data.participantId, isPrimaryRetreat: true },
				{ isPrimaryRetreat: false },
			);
		}
	}

	const history = retreatParticipantRepository.create(data);
	const saved = await retreatParticipantRepository.save(history);

	// Fetch with relations to return complete data
	return await retreatParticipantRepository.findOne({
		where: { id: saved.id },
		relations: ['retreat', 'retreat.house', 'participant', 'user'],
	});
};

/**
 * Update a history entry
 */
export const updateHistoryEntry = async (
	id: string,
	updates: UpdateHistoryData,
): Promise<RetreatParticipant> => {
	const history = await retreatParticipantRepository.findOne({ where: { id } });

	if (!history) {
		throw new Error('Historial no encontrado');
	}

	// If setting isPrimaryRetreat to true, unset other primary retreats for this user
	if (updates.isPrimaryRetreat === true) {
		await retreatParticipantRepository.update(
			{ userId: history.userId, isPrimaryRetreat: true, id: Not(id) },
			{ isPrimaryRetreat: false },
		);
	}

	// Apply updates
	Object.assign(history, updates);

	const saved = await retreatParticipantRepository.save(history);

	// Fetch with relations to return complete data
	return await retreatParticipantRepository.findOne({
		where: { id: saved.id },
		relations: ['retreat', 'retreat.house', 'participant', 'user'],
	});
};

/**
 * Delete a history entry
 */
export const deleteHistoryEntry = async (id: string): Promise<void> => {
	const history = await retreatParticipantRepository.findOne({ where: { id } });

	if (!history) {
		throw new Error('Historial no encontrado');
	}

	await retreatParticipantRepository.remove(history);
};

/**
 * Mark a retreat as the user's primary retreat
 */
export const markPrimaryRetreat = async (
	userId: string,
	historyId: string,
): Promise<RetreatParticipant> => {
	// First unset all primary retreats for this user
	await retreatParticipantRepository.update(
		{ userId, isPrimaryRetreat: true },
		{ isPrimaryRetreat: false },
	);

	// Set the new primary retreat
	const history = await retreatParticipantRepository.findOne({
		where: { id: historyId, userId },
	});

	if (!history) {
		throw new Error('Historial no encontrado');
	}

	history.isPrimaryRetreat = true;
	const saved = await retreatParticipantRepository.save(history);

	// Fetch with relations to return complete data
	return await retreatParticipantRepository.findOne({
		where: { id: saved.id },
		relations: ['retreat', 'retreat.house', 'participant', 'user'],
	});
};

/**
 * Get the user's primary retreat
 */
export const getPrimaryRetreat = async (userId: string): Promise<RetreatParticipant | null> => {
	return await retreatParticipantRepository.findOne({
		where: { userId, isPrimaryRetreat: true },
		relations: ['retreat', 'retreat.house', 'participant'],
	});
};

/**
 * Auto-determine and set primary retreat for a user based on walker history
 * This should be called when a new history entry is created
 */
export const autoSetPrimaryRetreat = async (userId: string): Promise<void> => {
	// Get all history entries for the user ordered by date
	const historyEntries = await retreatParticipantRepository.find({
		where: { userId },
		relations: ['retreat'],
		order: { createdAt: 'ASC' },
	});

	if (historyEntries.length === 0) {
		return;
	}

	// First, find the first walker retreat (chronologically first)
	const firstWalkerEntry = historyEntries.find((h: RetreatParticipant) => h.roleInRetreat === 'walker');

	if (firstWalkerEntry) {
		// Unset all primary retreats
		await retreatParticipantRepository.update(
			{ userId, isPrimaryRetreat: true },
			{ isPrimaryRetreat: false },
		);
		// Set the first walker retreat as primary
		firstWalkerEntry.isPrimaryRetreat = true;
		await retreatParticipantRepository.save(firstWalkerEntry);
	} else {
		// If no walker retreat exists, set the oldest retreat as primary
		const oldestEntry = historyEntries[0];
		// Unset all primary retreats
		await retreatParticipantRepository.update(
			{ userId, isPrimaryRetreat: true },
			{ isPrimaryRetreat: false },
		);
		// Set the oldest retreat as primary
		oldestEntry.isPrimaryRetreat = true;
		await retreatParticipantRepository.save(oldestEntry);
	}
};

/**
 * Get all users who have participated in a specific retreat with a specific role
 */
export const getParticipantsByRole = async (
	retreatId: string,
	role: RoleInRetreat,
): Promise<RetreatParticipant[]> => {
	return await retreatParticipantRepository.find({
		where: { retreatId, roleInRetreat: role },
		relations: ['user', 'user.profile', 'participant'],
		order: { createdAt: 'ASC' },
	});
};

/**
 * Get charlistas (speakers) for a retreat or globally
 */
export const getCharlistas = async (retreatId?: string): Promise<RetreatParticipant[]> => {
	if (retreatId) {
		return await retreatParticipantRepository.find({
			where: { retreatId, roleInRetreat: 'charlista' },
			relations: ['user', 'user.profile', 'retreat'],
			order: { createdAt: 'ASC' },
		});
	}

	// Get all charlistas globally
	return await retreatParticipantRepository.find({
		where: { roleInRetreat: 'charlista' },
		relations: ['user', 'user.profile', 'retreat', 'retreat.house'],
		order: { createdAt: 'DESC' },
	});
};

/**
 * Sync retreat-specific fields to the retreat_participants row for a participant+retreat pair.
 * Creates no row — only updates if one already exists.
 */
export const syncRetreatFields = async (
	participantId: string,
	retreatId: string,
	fields: RetreatSnapshotFields,
	entityManager?: any,
): Promise<void> => {
	const repo = entityManager
		? entityManager.getRepository(RetreatParticipant)
		: retreatParticipantRepository;
	await repo.update({ participantId, retreatId }, fields);
};

// Backward compatibility alias
export const syncRetreatFieldsToHistory = syncRetreatFields;
