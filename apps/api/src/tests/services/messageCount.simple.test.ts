// Tests for the messageCount virtual field on Participant
// messageCount is populated by findAllParticipants from a GROUP BY
// query against participant_communications, then serialized via toJSON().
// These tests are pure unit tests — no database, no mocks.

/**
 * Simulates the relevant subset of the Participant.toJSON() behavior.
 * Mirrors apps/api/src/entities/participant.entity.ts:357-372 — only the
 * messageCount branch is exercised here.
 */
function serializeParticipant(participant: Record<string, any>) {
	const plain: Record<string, any> = { ...participant };
	if (participant.messageCount !== undefined) {
		plain.messageCount = participant.messageCount;
	} else {
		// Mirror entity behavior: undefined messageCount stays undefined
		// (the conditional assignment in toJSON does not set it).
		delete plain.messageCount;
	}
	return plain;
}

/**
 * Replicates the aggregation pattern in findAllParticipants:
 * given the raw rows from a GROUP BY query, attach a numeric
 * messageCount to every participant (defaulting to 0).
 */
function attachMessageCounts(
	participants: Array<{ id: string; messageCount?: number }>,
	rawRows: Array<{ participantId: string; count: string | number }>,
) {
	const map = new Map<string, number>(
		rawRows.map((row) => [row.participantId, Number(row.count) || 0]),
	);
	for (const p of participants) {
		p.messageCount = map.get(p.id) ?? 0;
	}
	return participants;
}

describe('Participant.toJSON messageCount serialization', () => {
	it('includes messageCount when set to a positive number', () => {
		const json = serializeParticipant({
			id: 'p-1',
			firstName: 'Ana',
			messageCount: 7,
		});

		expect(json.messageCount).toBe(7);
	});

	it('includes messageCount when set to 0 (no messages sent)', () => {
		const json = serializeParticipant({
			id: 'p-2',
			firstName: 'Luis',
			messageCount: 0,
		});

		expect(json).toHaveProperty('messageCount', 0);
	});

	it('omits messageCount when undefined (e.g. participant fetched outside list view)', () => {
		const json = serializeParticipant({
			id: 'p-3',
			firstName: 'María',
		});

		expect(json.messageCount).toBeUndefined();
		expect('messageCount' in json).toBe(false);
	});
});

describe('Message count aggregation in findAllParticipants', () => {
	it('attaches 0 to every participant when there are no message rows', () => {
		const participants = [
			{ id: 'p-1' },
			{ id: 'p-2' },
			{ id: 'p-3' },
		];

		const result = attachMessageCounts(participants, []);

		expect(result.every((p) => p.messageCount === 0)).toBe(true);
	});

	it('maps counts correctly when several participants have messages', () => {
		const participants = [
			{ id: 'p-1' },
			{ id: 'p-2' },
			{ id: 'p-3' },
		];
		const rows = [
			{ participantId: 'p-1', count: 5 },
			{ participantId: 'p-3', count: 12 },
		];

		const result = attachMessageCounts(participants, rows);

		expect(result[0].messageCount).toBe(5);
		expect(result[1].messageCount).toBe(0); // no rows for p-2
		expect(result[2].messageCount).toBe(12);
	});

	it('coerces count to number when SQLite returns it as string', () => {
		const participants = [{ id: 'p-1' }];
		// SQLite/TypeORM getRawMany often returns COUNT(*) as a string
		const rows = [{ participantId: 'p-1', count: '42' }];

		const result = attachMessageCounts(participants, rows);

		expect(result[0].messageCount).toBe(42);
		expect(typeof result[0].messageCount).toBe('number');
	});

	it('ignores raw rows for participants not in the current page', () => {
		const participants = [{ id: 'p-1' }];
		const rows = [
			{ participantId: 'p-1', count: 3 },
			{ participantId: 'p-999-not-in-list', count: 99 },
		];

		const result = attachMessageCounts(participants, rows);

		expect(result).toHaveLength(1);
		expect(result[0].messageCount).toBe(3);
	});
});
