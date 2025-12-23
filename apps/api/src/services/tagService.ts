import { AppDataSource } from '../data-source';
import { Tag } from '../entities/tag.entity';
import { ParticipantTag } from '../entities/participantTag.entity';
import { Participant } from '../entities/participant.entity';
import { v4 as uuidv4 } from 'uuid';

const tagRepository = AppDataSource.getRepository(Tag);
const participantTagRepository = AppDataSource.getRepository(ParticipantTag);
const participantRepository = AppDataSource.getRepository(Participant);

/**
 * Get all tags
 */
export const getAllTags = async () => {
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
export const createTag = async (tagData: { name: string; color?: string; description?: string }) => {
	const existingTag = await tagRepository.findOneBy({ name: tagData.name });
	if (existingTag) {
		throw new Error('Tag with this name already exists');
	}

	const tag = tagRepository.create({
		...tagData,
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
) => {
	const tag = await tagRepository.findOneBy({ id: tagId });
	if (!tag) throw new Error('Tag not found');

	// Check if name is being changed and if new name already exists
	if (tagData.name && tagData.name !== tag.name) {
		const existingTag = await tagRepository.findOneBy({ name: tagData.name });
		if (existingTag) {
			throw new Error('Tag with this name already exists');
		}
	}

	tagRepository.merge(tag, tagData);
	return tagRepository.save(tag);
};

/**
 * Delete tag
 */
export const deleteTag = async (tagId: string) => {
	const result = await tagRepository.delete(tagId);
	if (result.affected === 0) {
		throw new Error('Tag not found');
	}
};

/**
 * Check for tag conflicts between leaders and walkers at a table
 * Returns list of conflicting tag names
 */
export const checkTableTagConflict = async (
	leaderIds: string[],
	walkerIds: string[],
): Promise<{ hasConflict: boolean; conflicts: string[] }> => {
	if (leaderIds.length === 0 || walkerIds.length === 0) {
		return { hasConflict: false, conflicts: [] };
	}

	// Get tags for all leaders
	const leaderTags = await participantTagRepository
		.createQueryBuilder('pt')
		.leftJoinAndSelect('pt.tag', 'tag')
		.where('pt.participantId IN (:...leaderIds)', { leaderIds })
		.getMany();

	// Get tags for all walkers
	const walkerTags = await participantTagRepository
		.createQueryBuilder('pt')
		.leftJoinAndSelect('pt.tag', 'tag')
		.where('pt.participantId IN (:...walkerIds)', { walkerIds })
		.getMany();

	// Extract tag IDs
	const leaderTagIds = new Set(leaderTags.map((pt) => pt.tagId));
	const walkerTagIds = new Set(walkerTags.map((pt) => pt.tagId));

	// Find intersections
	const conflicts: string[] = [];
	for (const tagId of walkerTagIds) {
		if (leaderTagIds.has(tagId)) {
			const tag = leaderTags.find((pt) => pt.tagId === tagId)?.tag;
			if (tag) {
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
