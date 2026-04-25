// Tests for the badge table enrichment logic.
//
// Background: `tableMesa` on Participant is a VIRTUAL field (not a TypeORM relation).
// `tableId` lives in retreat_participants. To display tables on badges we must:
//   1. Read tableId from retreat_participants
//   2. Fetch the matching TableMesa entity
//   3. Attach it to participant.tableMesa
// Servers who are table leaders/coliders are a special case — their assignment lives
// on the tables entity itself (liderId / colider1Id / colider2Id), not on tableId.

type ParticipantType = 'walker' | 'server' | 'waiting' | 'partial_server';

interface FakeTableMesa {
	id: string;
	name: string;
	retreatId: string;
	liderId?: string | null;
	colider1Id?: string | null;
	colider2Id?: string | null;
}

interface FakeRetreatParticipant {
	participantId: string;
	retreatId: string;
	type: ParticipantType;
	tableId?: string | null;
}

interface FakeParticipant {
	id: string;
	firstName: string;
	lastName: string;
	type?: ParticipantType;
	tableId?: string | null;
	tableMesa?: FakeTableMesa;
}

/**
 * Mirrors the enrichment block in participantService.findAllParticipants().
 * Fetches TableMesa for participants with tableId, and for server-leaders without one.
 */
function enrichParticipantsWithTableMesa(
	participants: FakeParticipant[],
	rps: FakeRetreatParticipant[],
	tables: FakeTableMesa[],
): FakeParticipant[] {
	// Step A: overlay tableId from retreat_participants
	const rpMap = new Map(rps.map((rp) => [rp.participantId, rp]));
	for (const p of participants) {
		const rp = rpMap.get(p.id);
		if (rp) {
			p.type = rp.type;
			p.tableId = rp.tableId ?? null;
		}
	}

	// Step B: fetch TableMesa for participants that have a tableId
	const tableMap = new Map(tables.map((t) => [t.id, t]));
	const withTableId = participants.filter((p) => p.tableId && !p.tableMesa);
	for (const p of withTableId) {
		const table = tableMap.get(p.tableId!);
		if (table) p.tableMesa = table;
	}

	// Step C: enrich servers who are table leaders but have no tableId
	const serversWithoutTable = participants.filter(
		(p) => !p.tableMesa && (p.type === 'server' || p.type === 'partial_server'),
	);
	for (const p of serversWithoutTable) {
		const leaderTable = tables.find(
			(t) => t.liderId === p.id || t.colider1Id === p.id || t.colider2Id === p.id,
		);
		if (leaderTable) p.tableMesa = leaderTable;
	}

	return participants;
}

/**
 * Mirrors the frontend label logic in BadgesView.vue getTableInfo().
 * The bug was: returning `Mesa ${tableMesa.name}` produced "Mesa Mesa 1"
 * because tableMesa.name already contains "Mesa 1".
 */
function getBadgeTableLabel(p: FakeParticipant, noTableLabel = 'Sin mesa asignada'): string {
	if (!p.tableMesa) return noTableLabel;
	return p.tableMesa.name;
}

describe('Badge table enrichment', () => {
	const RETREAT_ID = 'retreat-1';

	const tables: FakeTableMesa[] = [
		{ id: 't-1', name: 'Mesa 1', retreatId: RETREAT_ID, liderId: 's-lider' },
		{ id: 't-2', name: 'Mesa 2', retreatId: RETREAT_ID, colider1Id: 's-colider' },
		{ id: 't-3', name: 'Mesa 3', retreatId: RETREAT_ID },
	];

	describe('walker enrichment', () => {
		test('walker with tableId gets tableMesa attached', () => {
			const participants: FakeParticipant[] = [
				{ id: 'w-1', firstName: 'Ana', lastName: 'García' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 'w-1', retreatId: RETREAT_ID, type: 'walker', tableId: 't-1' },
			];

			enrichParticipantsWithTableMesa(participants, rps, tables);

			expect(participants[0].tableMesa).toBeDefined();
			expect(participants[0].tableMesa!.name).toBe('Mesa 1');
		});

		test('walker WITHOUT tableId gets no tableMesa', () => {
			const participants: FakeParticipant[] = [
				{ id: 'w-2', firstName: 'Pedro', lastName: 'López' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 'w-2', retreatId: RETREAT_ID, type: 'walker', tableId: null },
			];

			enrichParticipantsWithTableMesa(participants, rps, tables);

			expect(participants[0].tableMesa).toBeUndefined();
		});

		test('walker with tableId pointing to non-existent table gets no tableMesa', () => {
			const participants: FakeParticipant[] = [
				{ id: 'w-3', firstName: 'Luis', lastName: 'Martínez' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 'w-3', retreatId: RETREAT_ID, type: 'walker', tableId: 'missing' },
			];

			enrichParticipantsWithTableMesa(participants, rps, tables);

			expect(participants[0].tableMesa).toBeUndefined();
		});
	});

	describe('server-leader enrichment', () => {
		test('server who is liderId gets tableMesa even without tableId', () => {
			const participants: FakeParticipant[] = [
				{ id: 's-lider', firstName: 'Carlos', lastName: 'Ruiz' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 's-lider', retreatId: RETREAT_ID, type: 'server', tableId: null },
			];

			enrichParticipantsWithTableMesa(participants, rps, tables);

			expect(participants[0].tableMesa).toBeDefined();
			expect(participants[0].tableMesa!.name).toBe('Mesa 1');
		});

		test('server who is colider1Id gets tableMesa', () => {
			const participants: FakeParticipant[] = [
				{ id: 's-colider', firstName: 'María', lastName: 'Sánchez' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 's-colider', retreatId: RETREAT_ID, type: 'server', tableId: null },
			];

			enrichParticipantsWithTableMesa(participants, rps, tables);

			expect(participants[0].tableMesa).toBeDefined();
			expect(participants[0].tableMesa!.name).toBe('Mesa 2');
		});

		test('server with NO leader role and NO tableId gets no tableMesa (Daniel Alvarez case)', () => {
			const participants: FakeParticipant[] = [
				{ id: 'daniel', firstName: 'Daniel', lastName: 'Alvarez' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 'daniel', retreatId: RETREAT_ID, type: 'server', tableId: null },
			];

			enrichParticipantsWithTableMesa(participants, rps, tables);

			expect(participants[0].tableMesa).toBeUndefined();
		});

		test('partial_server is also enriched as a leader if applicable', () => {
			const customTables: FakeTableMesa[] = [
				{ id: 't-x', name: 'Mesa 5', retreatId: RETREAT_ID, colider2Id: 'ps-1' },
			];
			const participants: FakeParticipant[] = [
				{ id: 'ps-1', firstName: 'Jorge', lastName: 'Vega' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 'ps-1', retreatId: RETREAT_ID, type: 'partial_server' },
			];

			enrichParticipantsWithTableMesa(participants, rps, customTables);

			expect(participants[0].tableMesa).toBeDefined();
			expect(participants[0].tableMesa!.name).toBe('Mesa 5');
		});
	});

	describe('mixed batch', () => {
		test('walkers, leader-servers, and unassigned participants are handled correctly', () => {
			const participants: FakeParticipant[] = [
				{ id: 'w-1', firstName: 'Ana', lastName: 'García' },
				{ id: 'w-2', firstName: 'Pedro', lastName: 'López' },
				{ id: 's-lider', firstName: 'Carlos', lastName: 'Ruiz' },
				{ id: 'daniel', firstName: 'Daniel', lastName: 'Alvarez' },
			];
			const rps: FakeRetreatParticipant[] = [
				{ participantId: 'w-1', retreatId: RETREAT_ID, type: 'walker', tableId: 't-1' },
				{ participantId: 'w-2', retreatId: RETREAT_ID, type: 'walker', tableId: 't-3' },
				{ participantId: 's-lider', retreatId: RETREAT_ID, type: 'server', tableId: null },
				{ participantId: 'daniel', retreatId: RETREAT_ID, type: 'server', tableId: null },
			];

			enrichParticipantsWithTableMesa(participants, rps, tables);

			expect(participants[0].tableMesa?.name).toBe('Mesa 1'); // walker w/ tableId
			expect(participants[1].tableMesa?.name).toBe('Mesa 3'); // walker w/ tableId
			expect(participants[2].tableMesa?.name).toBe('Mesa 1'); // server-lider
			expect(participants[3].tableMesa).toBeUndefined();      // server w/o assignment
		});
	});
});

describe('Badge table label (UI bug: "Mesa Mesa 1")', () => {
	test('returns the name as-is, NOT prefixed with "Mesa "', () => {
		const p: FakeParticipant = {
			id: 'x',
			firstName: 'A',
			lastName: 'B',
			tableMesa: { id: 't-1', name: 'Mesa 1', retreatId: 'r' },
		};

		expect(getBadgeTableLabel(p)).toBe('Mesa 1');
		expect(getBadgeTableLabel(p)).not.toBe('Mesa Mesa 1');
	});

	test('returns the no-table fallback when tableMesa is undefined', () => {
		const p: FakeParticipant = { id: 'x', firstName: 'A', lastName: 'B' };

		expect(getBadgeTableLabel(p, 'Sin mesa asignada')).toBe('Sin mesa asignada');
	});

	test('table names without "Mesa" prefix display as-is too', () => {
		// Defensive: if the DB ever stores names like "1" instead of "Mesa 1",
		// the label still works — the rendering code is no longer responsible for adding "Mesa".
		const p: FakeParticipant = {
			id: 'x',
			firstName: 'A',
			lastName: 'B',
			tableMesa: { id: 't-7', name: '7', retreatId: 'r' },
		};

		expect(getBadgeTableLabel(p)).toBe('7');
	});
});
