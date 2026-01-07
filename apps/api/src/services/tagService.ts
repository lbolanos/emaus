import { DataSource } from 'typeorm';
import { AppDataSource } from '../data-source';
import { Tag } from '../entities/tag.entity';
import { ParticipantTag } from '../entities/participantTag.entity';
import { Participant } from '../entities/participant.entity';
import { getRepositories } from '../utils/repositoryHelpers';
import { v4 as uuidv4 } from 'uuid';

/**
 * Get all tags, optionally filtered by retreatId
 */
export const getAllTags = async (retreatId?: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	if (retreatId) {
		return repos.tag.find({
			where: { retreatId },
			order: { name: 'ASC' },
		});
	}
	return repos.tag.find({ order: { name: 'ASC' } });
};

/**
 * Get tags for a participant
 */
export const getParticipantTags = async (participantId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	const participantTags = await repos.participantTag
		.createQueryBuilder('pt')
		.leftJoinAndSelect('pt.tag', 'tag')
		.where('pt.participantId = :participantId', { participantId })
		.getMany();

	return participantTags.map((pt) => pt.tag);
};

/**
 * Assign tag to participant
 */
export const assignTagToParticipant = async (
	participantId: string,
	tagId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	// Verify participant exists
	const participant = await repos.participant.findOneBy({ id: participantId });
	if (!participant) throw new Error('Participant not found');

	// Verify tag exists
	const tag = await repos.tag.findOneBy({ id: tagId });
	if (!tag) throw new Error('Tag not found');

	// Check if already assigned
	const existing = await repos.participantTag.findOneBy({ participantId, tagId });
	if (existing) return existing;

	const participantTag = repos.participantTag.create({
		id: uuidv4(),
		participantId,
		tagId,
	});

	return repos.participantTag.save(participantTag);
};

/**
 * Remove tag from participant
 */
export const removeTagFromParticipant = async (
	participantId: string,
	tagId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const result = await repos.participantTag.delete({ participantId, tagId });
	if (result.affected === 0) {
		throw new Error('Tag assignment not found');
	}
};

/**
 * Create new tag
 */
export const createTag = async (
	tagData: { name: string; color?: string; description?: string },
	retreatId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const existingTag = await repos.tag.findOne({
		where: { name: tagData.name, retreatId },
	});
	if (existingTag) {
		throw new Error('Tag with this name already exists in this retreat');
	}

	const tag = repos.tag.create({
		...tagData,
		retreatId,
		id: uuidv4(),
	});
	return repos.tag.save(tag);
};

/**
 * Update tag
 */
export const updateTag = async (
	tagId: string,
	tagData: { name?: string; color?: string; description?: string },
	retreatId: string,
	dataSource?: DataSource,
) => {
	const repos = getRepositories(dataSource);
	const tag = await repos.tag.findOneBy({ id: tagId });
	if (!tag) throw new Error('Tag not found');

	// Verify tag belongs to the retreat
	if (tag.retreatId !== retreatId) {
		throw new Error('Tag does not belong to this retreat');
	}

	// Check if name is being changed and if new name already exists in this retreat
	if (tagData.name && tagData.name !== tag.name) {
		const existingTag = await repos.tag.findOne({
			where: { name: tagData.name, retreatId },
		});
		if (existingTag) {
			throw new Error('Tag with this name already exists in this retreat');
		}
	}

	repos.tag.merge(tag, tagData);
	return repos.tag.save(tag);
};

/**
 * Delete tag
 */
export const deleteTag = async (tagId: string, retreatId: string, dataSource?: DataSource) => {
	const repos = getRepositories(dataSource);
	const tag = await repos.tag.findOneBy({ id: tagId });
	if (!tag) throw new Error('Tag not found');

	// Verify tag belongs to the retreat
	if (tag.retreatId !== retreatId) {
		throw new Error('Tag does not belong to this retreat');
	}

	const result = await repos.tag.delete(tagId);
	if (result.affected === 0) {
		throw new Error('Tag not found');
	}
};

/**
 * Check for tag conflicts between any participants at a table
 * Returns list of conflicting tag names
 */
export const checkTableTagConflict = async (
	existingParticipantIds: string[],
	newParticipantId: string,
	dataSource?: DataSource,
): Promise<{ hasConflict: boolean; conflicts: string[] }> => {
	const repos = getRepositories(dataSource);
	if (existingParticipantIds.length === 0) {
		return { hasConflict: false, conflicts: [] };
	}

	// Get tags for the new participant
	const newParticipantTags = await repos.participantTag
		.createQueryBuilder('pt')
		.leftJoinAndSelect('pt.tag', 'tag')
		.where('pt.participantId = :newParticipantId', { newParticipantId })
		.getMany();

	if (newParticipantTags.length === 0) {
		return { hasConflict: false, conflicts: [] };
	}

	// Get tags for all existing participants at the table
	const existingParticipantTags = await repos.participantTag
		.createQueryBuilder('pt')
		.leftJoinAndSelect('pt.tag', 'tag')
		.where('pt.participantId IN (:...existingParticipantIds)', { existingParticipantIds })
		.getMany();

	// Extract tag IDs for new participant
	const newParticipantTagIds = new Set(newParticipantTags.map((pt) => pt.tagId));

	// Find intersections
	const conflicts: string[] = [];
	for (const existingPt of existingParticipantTags) {
		if (newParticipantTagIds.has(existingPt.tagId)) {
			const tag = existingPt.tag;
			if (tag && !conflicts.includes(tag.name)) {
				conflicts.push(tag.name);
			}
		}
	}

	return {
		hasConflict: conflicts.length > 0,
		conflicts,
	};
};

/**
 * Get tags by IDs
 */
export const getTagsByIds = async (tagIds: string[], dataSource?: DataSource): Promise<Tag[]> => {
	const repos = getRepositories(dataSource);
	if (tagIds.length === 0) return [];
	return repos.tag.findByIds(tagIds);
};
