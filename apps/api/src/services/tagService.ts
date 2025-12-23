import { AppDataSource } from '../data-source';
import { Tag } from '../entities/tag.entity';
import { ParticipantTag } from '../entities/participantTag.entity';
import { Participant } from '../entities/participant.entity';
import { v4 as uuidv4 } from 'uuid';

const tagRepository = AppDataSource.getRepository(Tag);
const participantTagRepository = AppDataSource.getRepository(ParticipantTag);
const participantRepository = AppDataSource.getRepository(Participant);

/**
 * Get all tags, optionally filtered by retreatId
 */
export const getAllTags = async (retreatId?: string) => {
	if (retreatId) {
		return tagRepository.find({
			where: { retreatId },
			order: { name: 'ASC' },
		});
	}
	return tagRepository.find({ order: { name: 'ASC' } });
};

/**
 * Get tags for a participant
 */
export const getParticipantTags = async (participantId: string) => {
	const participantTags = await participantTagRepository
		.createQueryBuilder('pt')
		.leftJoinAndSelect('pt.tag', 'tag')
		.where('pt.participantId = :participantId', { participantId })
		.getMany();

	return participantTags.map((pt) => pt.tag);
};

/**
 * Assign tag to participant
 */
export const assignTagToParticipant = async (participantId: string, tagId: string) => {
	// Verify participant exists
	const participant = await participantRepository.findOneBy({ id: participantId });
	if (!participant) throw new Error('Participant not found');

	// Verify tag exists
	const tag = await tagRepository.findOneBy({ id: tagId });
	if (!tag) throw new Error('Tag not found');

	// Check if already assigned
	const existing = await participantTagRepository.findOneBy({ participantId, tagId });
	if (existing) return existing;

	const participantTag = participantTagRepository.create({
		id: uuidv4(),
		participantId,
		tagId,
	});

	return participantTagRepository.save(participantTag);
};

/**
 * Remove tag from participant
 */
export const removeTagFromParticipant = async (participantId: string, tagId: string) => {
	const result = await participantTagRepository.delete({ participantId, tagId });
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
) => {
	const existingTag = await tagRepository.findOne({
		where: { name: tagData.name, retreatId },
	});
	if (existingTag) {
		throw new Error('Tag with this name already exists in this retreat');
	}

	const tag = tagRepository.create({
		...tagData,
		retreatId,
		id: uuidv4(),
	});
	return tagRepository.save(tag);
};

/**
 * Update tag
 */
export const updateTag = async (
	tagId: string,
	tagData: { name?: string; color?: string; description?: string },
	retreatId: string,
) => {
	const tag = await tagRepository.findOneBy({ id: tagId });
	if (!tag) throw new Error('Tag not found');

	// Verify tag belongs to the retreat
	if (tag.retreatId !== retreatId) {
		throw new Error('Tag does not belong to this retreat');
	}

	// Check if name is being changed and if new name already exists in this retreat
	if (tagData.name && tagData.name !== tag.name) {
		const existingTag = await tagRepository.findOne({
			where: { name: tagData.name, retreatId },
		});
		if (existingTag) {
			throw new Error('Tag with this name already exists in this retreat');
		}
	}

	tagRepository.merge(tag, tagData);
	return tagRepository.save(tag);
};

/**
 * Delete tag
 */
export const deleteTag = async (tagId: string, retreatId: string) => {
	const tag = await tagRepository.findOneBy({ id: tagId });
	if (!tag) throw new Error('Tag not found');

	// Verify tag belongs to the retreat
	if (tag.retreatId !== retreatId) {
		throw new Error('Tag does not belong to this retreat');
	}

	const result = await tagRepository.delete(tagId);
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
): Promise<{ hasConflict: boolean; conflicts: string[] }> => {
	if (existingParticipantIds.length === 0) {
		return { hasConflict: false, conflicts: [] };
	}

	// Get tags for the new participant
	const newParticipantTags = await participantTagRepository
		.createQueryBuilder('pt')
		.leftJoinAndSelect('pt.tag', 'tag')
		.where('pt.participantId = :newParticipantId', { newParticipantId })
		.getMany();

	if (newParticipantTags.length === 0) {
		return { hasConflict: false, conflicts: [] };
	}

	// Get tags for all existing participants at the table
	const existingParticipantTags = await participantTagRepository
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
export const getTagsByIds = async (tagIds: string[]): Promise<Tag[]> => {
	if (tagIds.length === 0) return [];
	return tagRepository.findByIds(tagIds);
};
