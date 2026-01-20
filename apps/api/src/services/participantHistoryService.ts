import { AppDataSource, DataSource } from '../data-source';
import { ParticipantHistory } from '../entities/participantHistory.entity';
import { User } from '../entities/user.entity';
import { Participant } from '../entities/participant.entity';
import { Retreat } from '../entities/retreat.entity';

// Repositories - will be initialized in functions
let participantHistoryRepository: any;
let userRepository: any;
let participantRepository: any;
let retreatRepository: any;

export const initializeRepositories = (dataSource?: DataSource) => {
	const ds = dataSource || AppDataSource;
	participantHistoryRepository = ds.getRepository(ParticipantHistory);
	userRepository = ds.getRepository(User);
	participantRepository = ds.getRepository(Participant);
	retreatRepository = ds.getRepository(Retreat);
};

// Initialize with default AppDataSource
initializeRepositories();

// ==================== TYPES ====================

export type RoleInRetreat = 'walker' | 'server' | 'leader' | 'coordinator' | 'charlista';

export interface CreateHistoryData {
	userId: string;
	participantId?: string | null;
	retreatId: string;
	roleInRetreat: RoleInRetreat;
	isPrimaryRetreat?: boolean;
	notes?: string;
	metadata?: Record<string, any>;
}

export interface UpdateHistoryData {
	roleInRetreat?: RoleInRetreat;
	isPrimaryRetreat?: boolean;
	notes?: string;
	metadata?: Record<string, any>;
}

// ==================== CRUD OPERATIONS ====================

/**
 * Get complete retreat history for a user
 */
export const getUserRetreatHistory = async (userId: string): Promise<ParticipantHistory[]> => {
	return await participantHistoryRepository.find({
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
): Promise<ParticipantHistory[]> => {
	return await participantHistoryRepository.find({
		where: { userId, roleInRetreat: role },
		relations: ['retreat', 'retreat.house', 'participant'],
		order: { createdAt: 'DESC' },
	});
};

/**
 * Get a specific history entry by ID
 */
export const getHistoryById = async (id: string): Promise<ParticipantHistory | null> => {
	return await participantHistoryRepository.findOne({
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
): Promise<ParticipantHistory | null> => {
	return await participantHistoryRepository.findOne({
		where: { userId, retreatId },
		relations: ['retreat', 'retreat.house', 'participant'],
	});
};

/**
 * Get all participants (history) for a specific retreat
 */
export const getParticipantsByRetreat = async (
	retreatId: string,
): Promise<ParticipantHistory[]> => {
	return await participantHistoryRepository.find({
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
): Promise<ParticipantHistory[]> => {
	return await participantHistoryRepository.find({
		where: { participantId },
		relations: ['retreat', 'retreat.house', 'user'],
		order: { createdAt: 'DESC' },
	});
};

/**
 * Create a new history entry
 */
export const createHistoryEntry = async (data: CreateHistoryData): Promise<ParticipantHistory> => {
	// Validate user exists
	const user = await userRepository.findOne({ where: { id: data.userId } });
	if (!user) {
		throw new Error('Usuario no encontrado');
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

	// Check if history entry already exists for this user and retreat
	const existing = await participantHistoryRepository.findOne({
		where: { userId: data.userId, retreatId: data.retreatId },
	});

	if (existing) {
		throw new Error('El usuario ya tiene un historial para este retiro');
	}

	// If isPrimaryRetreat is true, unset other primary retreats for this user
	if (data.isPrimaryRetreat) {
		await participantHistoryRepository.update(
			{ userId: data.userId, isPrimaryRetreat: true },
			{ isPrimaryRetreat: false },
		);
	}

	const history = participantHistoryRepository.create(data);
	const saved = await participantHistoryRepository.save(history);

	// Fetch with relations to return complete data
	return await participantHistoryRepository.findOne({
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
): Promise<ParticipantHistory> => {
	const history = await participantHistoryRepository.findOne({ where: { id } });

	if (!history) {
		throw new Error('Historial no encontrado');
	}

	// If setting isPrimaryRetreat to true, unset other primary retreats for this user
	if (updates.isPrimaryRetreat === true) {
		await participantHistoryRepository.update(
			{ userId: history.userId, isPrimaryRetreat: true, id: Not(id) },
			{ isPrimaryRetreat: false },
		);
	}

	// Apply updates
	Object.assign(history, updates);

	const saved = await participantHistoryRepository.save(history);

	// Fetch with relations to return complete data
	return await participantHistoryRepository.findOne({
		where: { id: saved.id },
		relations: ['retreat', 'retreat.house', 'participant', 'user'],
	});
};

/**
 * Delete a history entry
 */
export const deleteHistoryEntry = async (id: string): Promise<void> => {
	const history = await participantHistoryRepository.findOne({ where: { id } });

	if (!history) {
		throw new Error('Historial no encontrado');
	}

	await participantHistoryRepository.remove(history);
};

/**
 * Mark a retreat as the user's primary retreat
 */
export const markPrimaryRetreat = async (
	userId: string,
	historyId: string,
): Promise<ParticipantHistory> => {
	// First unset all primary retreats for this user
	await participantHistoryRepository.update(
		{ userId, isPrimaryRetreat: true },
		{ isPrimaryRetreat: false },
	);

	// Set the new primary retreat
	const history = await participantHistoryRepository.findOne({
		where: { id: historyId, userId },
	});

	if (!history) {
		throw new Error('Historial no encontrado');
	}

	history.isPrimaryRetreat = true;
	const saved = await participantHistoryRepository.save(history);

	// Fetch with relations to return complete data
	return await participantHistoryRepository.findOne({
		where: { id: saved.id },
		relations: ['retreat', 'retreat.house', 'participant', 'user'],
	});
};

/**
 * Get the user's primary retreat
 */
export const getPrimaryRetreat = async (userId: string): Promise<ParticipantHistory | null> => {
	return await participantHistoryRepository.findOne({
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
	const historyEntries = await participantHistoryRepository.find({
		where: { userId },
		relations: ['retreat'],
		order: { createdAt: 'ASC' },
	});

	if (historyEntries.length === 0) {
		return;
	}

	// First, find the first walker retreat (chronologically first)
	const firstWalkerEntry = historyEntries.find((h) => h.roleInRetreat === 'walker');

	if (firstWalkerEntry) {
		// Unset all primary retreats
		await participantHistoryRepository.update(
			{ userId, isPrimaryRetreat: true },
			{ isPrimaryRetreat: false },
		);
		// Set the first walker retreat as primary
		firstWalkerEntry.isPrimaryRetreat = true;
		await participantHistoryRepository.save(firstWalkerEntry);
	} else {
		// If no walker retreat exists, set the oldest retreat as primary
		const oldestEntry = historyEntries[0];
		// Unset all primary retreats
		await participantHistoryRepository.update(
			{ userId, isPrimaryRetreat: true },
			{ isPrimaryRetreat: false },
		);
		// Set the oldest retreat as primary
		oldestEntry.isPrimaryRetreat = true;
		await participantHistoryRepository.save(oldestEntry);
	}
};

/**
 * Get all users who have participated in a specific retreat with a specific role
 */
export const getParticipantsByRole = async (
	retreatId: string,
	role: RoleInRetreat,
): Promise<ParticipantHistory[]> => {
	return await participantHistoryRepository.find({
		where: { retreatId, roleInRetreat: role },
		relations: ['user', 'user.profile', 'participant'],
		order: { createdAt: 'ASC' },
	});
};

/**
 * Get charlistas (speakers) for a retreat or globally
 */
export const getCharlistas = async (retreatId?: string): Promise<ParticipantHistory[]> => {
	if (retreatId) {
		return await participantHistoryRepository.find({
			where: { retreatId, roleInRetreat: 'charlista' },
			relations: ['user', 'user.profile', 'retreat'],
			order: { createdAt: 'ASC' },
		});
	}

	// Get all charlistas globally
	return await participantHistoryRepository.find({
		where: { roleInRetreat: 'charlista' },
		relations: ['user', 'user.profile', 'retreat', 'retreat.house'],
		order: { createdAt: 'DESC' },
	});
};

// TypeORM Not operator is imported differently
import { Not } from 'typeorm';
