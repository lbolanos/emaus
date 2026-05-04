/**
 * Pure-logic mirror of the new heuristic added to `resolveSantisimoConflicts`:
 * a santisimo signup whose participant is a responsable (or apoyo) of an
 * overlapping schedule item must be removed (cannot be in two places at once).
 *
 * The actual service uses TypeORM repos; this file extracts the conflict
 * detection so it can be tested without a database.
 */

type Slot = {
	id: string;
	startTime: Date;
	endTime: Date;
	signups: Array<{ id: string; participantId: string | null }>;
};
type Item = {
	id: string;
	startTime: Date;
	endTime: Date;
	responsabilityParticipantId: string | null;
	apoyos: Array<{ participantId: string }>;
};

/**
 * Returns the IDs of signups that conflict with a participant duty in the same
 * time window. Implementation matches `removeResponsableConflicts` in the service.
 */
function detectConflicts(slots: Slot[], items: Item[]): string[] {
	const dutyByParticipant = new Map<string, Array<{ start: Date; end: Date }>>();
	const addDuty = (pid: string | null, start: Date, end: Date) => {
		if (!pid) return;
		const list = dutyByParticipant.get(pid) ?? [];
		list.push({ start, end });
		dutyByParticipant.set(pid, list);
	};
	for (const it of items) {
		addDuty(it.responsabilityParticipantId, it.startTime, it.endTime);
		for (const a of it.apoyos) addDuty(a.participantId, it.startTime, it.endTime);
	}

	const conflictIds: string[] = [];
	for (const slot of slots) {
		for (const sig of slot.signups) {
			if (!sig.participantId) continue;
			const duties = dutyByParticipant.get(sig.participantId);
			if (!duties) continue;
			const conflicts = duties.some(
				(d) => d.start < slot.endTime && d.end > slot.startTime,
			);
			if (conflicts) conflictIds.push(sig.id);
		}
	}
	return conflictIds;
}

const d = (h: number, m = 0) => new Date(2026, 3, 26, h, m);

describe('Santisimo: responsable conflict detection', () => {
	it('flags signup when participant is the main responsable of overlapping item', () => {
		const slots: Slot[] = [
			{
				id: 'slot1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				signups: [{ id: 'sig1', participantId: 'p1' }],
			},
		];
		const items: Item[] = [
			{
				id: 'item1',
				startTime: d(16, 30),
				endTime: d(17, 30),
				responsabilityParticipantId: 'p1',
				apoyos: [],
			},
		];
		expect(detectConflicts(slots, items)).toEqual(['sig1']);
	});

	it('flags signup when participant is an apoyo of overlapping item', () => {
		const slots: Slot[] = [
			{
				id: 'slot1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				signups: [{ id: 'sig1', participantId: 'p2' }],
			},
		];
		const items: Item[] = [
			{
				id: 'item1',
				startTime: d(17, 0),
				endTime: d(18, 0),
				responsabilityParticipantId: 'p_other',
				apoyos: [{ participantId: 'p2' }],
			},
		];
		expect(detectConflicts(slots, items)).toEqual(['sig1']);
	});

	it('does not flag signup when item is in a different time window', () => {
		const slots: Slot[] = [
			{
				id: 'slot1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				signups: [{ id: 'sig1', participantId: 'p1' }],
			},
		];
		const items: Item[] = [
			{
				id: 'item1',
				startTime: d(15, 0),
				endTime: d(16, 0),
				responsabilityParticipantId: 'p1',
				apoyos: [],
			},
		];
		expect(detectConflicts(slots, items)).toEqual([]);
	});

	it('does not flag signups without a participantId (manual signups)', () => {
		const slots: Slot[] = [
			{
				id: 'slot1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				signups: [{ id: 'sig1', participantId: null }],
			},
		];
		const items: Item[] = [
			{
				id: 'item1',
				startTime: d(17, 0),
				endTime: d(18, 0),
				responsabilityParticipantId: 'p1',
				apoyos: [],
			},
		];
		expect(detectConflicts(slots, items)).toEqual([]);
	});

	it('treats touching boundaries as non-overlap', () => {
		// Item ends at 17:00, slot starts at 17:00 — they don't overlap.
		const slots: Slot[] = [
			{
				id: 'slot1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				signups: [{ id: 'sig1', participantId: 'p1' }],
			},
		];
		const items: Item[] = [
			{
				id: 'item1',
				startTime: d(16, 0),
				endTime: d(17, 0),
				responsabilityParticipantId: 'p1',
				apoyos: [],
			},
		];
		expect(detectConflicts(slots, items)).toEqual([]);
	});

	it('flags multiple signups across multiple slots independently', () => {
		const slots: Slot[] = [
			{
				id: 'slot1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				signups: [{ id: 'sigA', participantId: 'p1' }],
			},
			{
				id: 'slot2',
				startTime: d(18, 0),
				endTime: d(18, 30),
				signups: [
					{ id: 'sigB', participantId: 'p2' },
					{ id: 'sigC', participantId: 'p_safe' },
				],
			},
		];
		const items: Item[] = [
			{
				id: 'item1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				responsabilityParticipantId: 'p1',
				apoyos: [],
			},
			{
				id: 'item2',
				startTime: d(18, 0),
				endTime: d(18, 30),
				responsabilityParticipantId: 'p2',
				apoyos: [],
			},
		];
		const conflicts = detectConflicts(slots, items);
		expect(conflicts.sort()).toEqual(['sigA', 'sigB']);
	});

	it('does not double-count when participant has both main and apoyo duty in same item', () => {
		// Edge case: a participant listed as both responsable AND apoyo of the
		// same item shouldn't cause two conflicts to be reported per signup.
		const slots: Slot[] = [
			{
				id: 'slot1',
				startTime: d(17, 0),
				endTime: d(17, 30),
				signups: [{ id: 'sig1', participantId: 'p1' }],
			},
		];
		const items: Item[] = [
			{
				id: 'item1',
				startTime: d(17, 0),
				endTime: d(18, 0),
				responsabilityParticipantId: 'p1',
				apoyos: [{ participantId: 'p1' }],
			},
		];
		expect(detectConflicts(slots, items)).toEqual(['sig1']);
	});
});
