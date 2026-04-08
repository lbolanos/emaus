// Tests for the "resolvedType" pattern used in createParticipant and
// linkUserToParticipant. The fix reads `type` from the retreat_participants
// table (source of truth) instead of relying on the virtual `participant.type`
// property, which can be undefined and default the welcome email template to
// SERVER_WELCOME for walkers (the Miguel Cedeño bug).

type ParticipantType = 'walker' | 'server' | 'waiting' | 'partial_server';

interface FakeParticipant {
	id: string;
	retreatId: string;
	email: string;
	type?: ParticipantType;
}

interface FakeRpRow {
	participantId: string;
	retreatId: string;
	type?: ParticipantType | null;
}

/**
 * Mirrors the fix block added to createParticipant: always look up the type
 * from retreat_participants and overlay it on the participant before making
 * any email-template decisions.
 */
function resolveTypeFromRetreatParticipants(
	participant: FakeParticipant,
	rpRows: FakeRpRow[],
): ParticipantType | undefined {
	let resolved = participant.type;
	if (participant.retreatId) {
		const rp = rpRows.find(
			(r) => r.participantId === participant.id && r.retreatId === participant.retreatId,
		);
		if (rp?.type) {
			resolved = rp.type as ParticipantType;
			participant.type = resolved; // keep the virtual in sync
		}
	}
	return resolved;
}

/** Mirrors the old, buggy selection logic. */
function buggyTemplateSelect(p: FakeParticipant): 'WALKER_WELCOME' | 'SERVER_WELCOME' {
	return p.type === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';
}

/** Mirrors the new selection logic using resolvedType. */
function fixedTemplateSelect(
	p: FakeParticipant,
	rpRows: FakeRpRow[],
): 'WALKER_WELCOME' | 'SERVER_WELCOME' {
	const resolved = resolveTypeFromRetreatParticipants(p, rpRows);
	return resolved === 'walker' ? 'WALKER_WELCOME' : 'SERVER_WELCOME';
}

describe('resolvedType pattern (Miguel Cedeño bug fix)', () => {
	const retreatId = 'r-san-judas';
	const miguel: FakeParticipant = {
		id: 'p-miguel',
		retreatId,
		email: 'miguel@miguelllausas.com',
		type: undefined, // the bug: virtual field is undefined after reload
	};

	test('buggy select sends SERVER_WELCOME to walker when virtual type is undefined', () => {
		const walker: FakeParticipant = { ...miguel, type: undefined };
		expect(buggyTemplateSelect(walker)).toBe('SERVER_WELCOME'); // ← reproduces the bug
	});

	test('fixed select sends WALKER_WELCOME to walker even when virtual type is undefined', () => {
		const walker: FakeParticipant = { ...miguel, type: undefined };
		const rpRows: FakeRpRow[] = [
			{ participantId: walker.id, retreatId: walker.retreatId, type: 'walker' },
		];
		expect(fixedTemplateSelect(walker, rpRows)).toBe('WALKER_WELCOME');
	});

	test('fixed select still sends SERVER_WELCOME to actual servers', () => {
		const server: FakeParticipant = { id: 'p-srv', retreatId, email: 's@x', type: undefined };
		const rpRows: FakeRpRow[] = [
			{ participantId: server.id, retreatId, type: 'server' },
		];
		expect(fixedTemplateSelect(server, rpRows)).toBe('SERVER_WELCOME');
	});

	test('resolveType syncs virtual field back onto participant', () => {
		const walker: FakeParticipant = { ...miguel, type: undefined };
		const rpRows: FakeRpRow[] = [
			{ participantId: walker.id, retreatId: walker.retreatId, type: 'walker' },
		];
		resolveTypeFromRetreatParticipants(walker, rpRows);
		expect(walker.type).toBe('walker'); // mutation happened — needed for Tipo: line in email body
	});

	test('resolveType returns undefined when retreat_participants row missing', () => {
		const walker: FakeParticipant = { ...miguel, type: undefined };
		const resolved = resolveTypeFromRetreatParticipants(walker, []);
		expect(resolved).toBeUndefined();
		// Template selection then defaults to SERVER_WELCOME, which is acceptable
		// because the participant isn't actually in the retreat.
	});

	test('resolveType prefers DB value over stale virtual field', () => {
		// Simulates a case where savedParticipant.type was set to 'walker' but
		// capacity check (or admin edit) flipped it to 'waiting' in retreat_participants.
		const p: FakeParticipant = { id: 'p-x', retreatId, email: 'x@x', type: 'walker' };
		const rpRows: FakeRpRow[] = [
			{ participantId: p.id, retreatId, type: 'waiting' },
		];
		const resolved = resolveTypeFromRetreatParticipants(p, rpRows);
		expect(resolved).toBe('waiting');
		expect(p.type).toBe('waiting');
	});

	test('palanquero notification only fires for walkers (fix uses resolvedType)', () => {
		const walker: FakeParticipant = { ...miguel, type: undefined };
		const rpRows: FakeRpRow[] = [
			{ participantId: walker.id, retreatId: walker.retreatId, type: 'walker' },
		];
		const resolved = resolveTypeFromRetreatParticipants(walker, rpRows);
		const shouldNotifyPalanqueros = resolved === 'walker';
		expect(shouldNotifyPalanqueros).toBe(true);
	});

	test('palanquero notification does NOT fire for servers', () => {
		const server: FakeParticipant = { id: 'p-srv', retreatId, email: 's@x', type: undefined };
		const rpRows: FakeRpRow[] = [
			{ participantId: server.id, retreatId, type: 'server' },
		];
		const resolved = resolveTypeFromRetreatParticipants(server, rpRows);
		const shouldNotifyPalanqueros = resolved === 'walker';
		expect(shouldNotifyPalanqueros).toBe(false);
	});

	test('subject line uses resolved type — "Bienvenida Caminante" for walkers', () => {
		const walker: FakeParticipant = { ...miguel, type: undefined };
		const rpRows: FakeRpRow[] = [
			{ participantId: walker.id, retreatId: walker.retreatId, type: 'walker' },
		];
		const resolved = resolveTypeFromRetreatParticipants(walker, rpRows);
		const subject = `Bienvenida ${resolved === 'walker' ? 'Caminante' : 'Servidor'}`;
		expect(subject).toBe('Bienvenida Caminante');
	});

	test('linkUserToParticipant roleInRetreat derives "walker" from retreat_participants', () => {
		// Mirrors the fix in linkUserToParticipant: overlay type before reading it
		// for the roleInRetreat ternary.
		const p: FakeParticipant = { id: 'p-link', retreatId, email: 'l@x', type: undefined };
		const rpRows: FakeRpRow[] = [
			{ participantId: p.id, retreatId, type: 'walker' },
		];
		resolveTypeFromRetreatParticipants(p, rpRows);

		const roleInRetreat =
			p.type === 'walker'
				? 'walker'
				: p.type === 'server' || p.type === 'partial_server'
					? 'server'
					: 'server';
		expect(roleInRetreat).toBe('walker');
	});
});
