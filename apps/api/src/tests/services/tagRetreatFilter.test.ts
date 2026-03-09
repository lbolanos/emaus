import { DataSource } from 'typeorm';
import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Tag } from '@/entities/tag.entity';
import { ParticipantTag } from '@/entities/participantTag.entity';
import { Participant } from '@/entities/participant.entity';
import { Retreat } from '@/entities/retreat.entity';
import { TableMesa } from '@/entities/tableMesa.entity';
import {
	getParticipantTags,
	checkTableTagConflict,
	assignTagToParticipant,
	createTag,
} from '@/services/tagService';

let ds: DataSource;
let retreatA: Retreat;
let retreatB: Retreat;
let participant: Participant;
let tagA1: Tag; // "familia" in retreat A
let tagA2: Tag; // "amigos" in retreat A
let tagB1: Tag; // "familia" in retreat B (same name, different retreat)

beforeAll(async () => {
	ds = await setupTestDatabase();
});

afterAll(async () => {
	await teardownTestDatabase();
});

beforeEach(async () => {
	await clearTestData();

	// Create two retreats
	retreatA = await TestDataFactory.createTestRetreat({ parish: 'Retreat A' });
	retreatB = await TestDataFactory.createTestRetreat({ parish: 'Retreat B' });

	// Create a participant in retreat A
	participant = await TestDataFactory.createTestParticipant(retreatA.id, {
		email: 'shared@example.com',
		type: 'walker' as any,
	});

	// Create tags scoped to each retreat
	tagA1 = await createTag({ name: 'familia', color: '#FF0000' }, retreatA.id, ds);
	tagA2 = await createTag({ name: 'amigos', color: '#00FF00' }, retreatA.id, ds);
	tagB1 = await createTag({ name: 'familia', color: '#0000FF' }, retreatB.id, ds);

	// Assign tags from BOTH retreats to the same participant
	await assignTagToParticipant(participant.id, tagA1.id, ds);
	await assignTagToParticipant(participant.id, tagA2.id, ds);
	await assignTagToParticipant(participant.id, tagB1.id, ds);
});

describe('getParticipantTags - retreat filtering', () => {
	it('returns all tags when no retreatId is provided', async () => {
		const tags = await getParticipantTags(participant.id, ds);
		expect(tags).toHaveLength(3);
		const tagIds = tags.map((t) => t.id).sort();
		expect(tagIds).toEqual([tagA1.id, tagA2.id, tagB1.id].sort());
	});

	it('returns only retreat A tags when filtered by retreatA', async () => {
		const tags = await getParticipantTags(participant.id, ds, retreatA.id);
		expect(tags).toHaveLength(2);
		const tagIds = tags.map((t) => t.id).sort();
		expect(tagIds).toEqual([tagA1.id, tagA2.id].sort());
	});

	it('returns only retreat B tags when filtered by retreatB', async () => {
		const tags = await getParticipantTags(participant.id, ds, retreatB.id);
		expect(tags).toHaveLength(1);
		expect(tags[0].id).toBe(tagB1.id);
	});

	it('returns empty array when filtered by a retreat with no tags', async () => {
		const retreatC = await TestDataFactory.createTestRetreat({ parish: 'Retreat C' });
		const tags = await getParticipantTags(participant.id, ds, retreatC.id);
		expect(tags).toHaveLength(0);
	});
});

describe('checkTableTagConflict - retreat filtering', () => {
	let participant2: Participant;

	beforeEach(async () => {
		// Create a second participant with the same tagA1 ("familia" in retreat A)
		participant2 = await TestDataFactory.createTestParticipant(retreatA.id, {
			email: 'other@example.com',
			type: 'walker' as any,
		});
		await assignTagToParticipant(participant2.id, tagA1.id, ds);
		// Also give participant2 the retreat B "familia" tag
		await assignTagToParticipant(participant2.id, tagB1.id, ds);
	});

	it('detects conflict when both participants share a tag in the same retreat', async () => {
		const result = await checkTableTagConflict(
			[participant.id],
			participant2.id,
			ds,
			retreatA.id,
		);
		expect(result.hasConflict).toBe(true);
		expect(result.conflicts).toContain('familia');
	});

	it('no conflict when filtering by a retreat where they do not share tags', async () => {
		// participant has tagA1 (retreat A) and tagB1 (retreat B)
		// participant2 has tagA1 (retreat A) and tagB1 (retreat B)
		// They share tagB1, so retreat B DOES have a conflict
		// But if participant only had tagA2 in a hypothetical retreat C, no conflict

		// Create retreat C with its own tag, assign only to participant (not participant2)
		const retreatC = await TestDataFactory.createTestRetreat({ parish: 'Retreat C' });
		const tagC = await createTag({ name: 'unique' }, retreatC.id, ds);
		await assignTagToParticipant(participant.id, tagC.id, ds);

		const result = await checkTableTagConflict(
			[participant.id],
			participant2.id,
			ds,
			retreatC.id,
		);
		expect(result.hasConflict).toBe(false);
		expect(result.conflicts).toHaveLength(0);
	});

	it('no conflict without retreat filter but same-name tags are in different retreats', async () => {
		// Create participant3 who ONLY has the retreat B "familia" tag
		const participant3 = await TestDataFactory.createTestParticipant(retreatA.id, {
			email: 'third@example.com',
			type: 'walker' as any,
		});
		await assignTagToParticipant(participant3.id, tagB1.id, ds);

		// Without retreat filter: participant has tagA1, tagA2, tagB1; participant3 has tagB1
		// They share tagB1 → conflict
		const resultNoFilter = await checkTableTagConflict(
			[participant.id],
			participant3.id,
			ds,
		);
		expect(resultNoFilter.hasConflict).toBe(true);

		// With retreat A filter: participant has tagA1, tagA2; participant3 has nothing in retreat A
		// No conflict
		const resultRetreatA = await checkTableTagConflict(
			[participant.id],
			participant3.id,
			ds,
			retreatA.id,
		);
		expect(resultRetreatA.hasConflict).toBe(false);
	});

	it('returns no conflict when existing participants list is empty', async () => {
		const result = await checkTableTagConflict([], participant.id, ds, retreatA.id);
		expect(result.hasConflict).toBe(false);
		expect(result.conflicts).toHaveLength(0);
	});

	it('returns no conflict when new participant has no tags in the filtered retreat', async () => {
		const participant3 = await TestDataFactory.createTestParticipant(retreatA.id, {
			email: 'noTags@example.com',
			type: 'walker' as any,
		});
		// participant3 has no tags at all
		const result = await checkTableTagConflict(
			[participant.id],
			participant3.id,
			ds,
			retreatA.id,
		);
		expect(result.hasConflict).toBe(false);
	});
});
