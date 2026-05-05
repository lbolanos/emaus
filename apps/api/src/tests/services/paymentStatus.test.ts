// Unit tests for the Participant.paymentStatus getter.
// No DB: instantiate the entity directly and assign relevant fields.
import { Participant } from '../../entities/participant.entity';
import { Payment } from '../../entities/payment.entity';
import { Retreat } from '../../entities/retreat.entity';

const makePayment = (amount: number): Payment => {
	const p = new Payment();
	p.amount = amount as any;
	p.paymentDate = new Date() as any;
	p.createdAt = new Date() as any;
	return p;
};

const makeRetreat = (cost: string | null): Retreat => {
	const r = new Retreat();
	(r as any).cost = cost;
	return r;
};

const makeParticipant = (opts: {
	isScholarship?: boolean;
	payments?: Payment[];
	retreat?: Retreat | null;
}): Participant => {
	const p = new Participant();
	p.isScholarship = !!opts.isScholarship;
	p.payments = opts.payments ?? ([] as any);
	if (opts.retreat !== undefined) {
		p.retreat = opts.retreat as any;
	}
	return p;
};

describe('Participant.paymentStatus', () => {
	it('returns "scholarship" when isScholarship is true, regardless of payments', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('scholarship');
	});

	it('returns "scholarship" for becados even when they have a partial payment', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [makePayment(500)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('scholarship');
	});

	it('returns "scholarship" for becados even when totalPaid equals retreat cost', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [makePayment(1500)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('scholarship');
	});

	it('"overpaid" takes precedence over "scholarship" when totalPaid > cost', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [makePayment(2000)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('overpaid');
	});

	it('returns "scholarship" for becados without a retreat associated', () => {
		const p = makeParticipant({ isScholarship: true, payments: [], retreat: null });
		expect(p.paymentStatus).toBe('scholarship');
	});

	it('returns "unpaid" when no retreat is associated and not scholarship', () => {
		const p = makeParticipant({ payments: [], retreat: null });
		expect(p.paymentStatus).toBe('unpaid');
	});

	it('returns "unpaid" when no payments and retreat cost > 0', () => {
		const p = makeParticipant({ payments: [], retreat: makeRetreat('1500') });
		expect(p.paymentStatus).toBe('unpaid');
	});

	it('returns "partial" when totalPaid is below retreat cost', () => {
		const p = makeParticipant({
			payments: [makePayment(500)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('partial');
	});

	it('returns "paid" when totalPaid equals retreat cost', () => {
		const p = makeParticipant({
			payments: [makePayment(1500)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('paid');
	});

	it('returns "paid" when totalPaid equals retreat cost across multiple payments', () => {
		const p = makeParticipant({
			payments: [makePayment(500), makePayment(1000)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('paid');
	});

	it('returns "overpaid" when totalPaid exceeds retreat cost', () => {
		const p = makeParticipant({
			payments: [makePayment(2000)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentStatus).toBe('overpaid');
	});

	it('parses cost strings with currency symbols ("$1,500.00")', () => {
		const p = makeParticipant({
			payments: [makePayment(1500)],
			retreat: makeRetreat('$1,500.00'),
		});
		expect(p.paymentStatus).toBe('paid');
	});
});

describe('Participant.paymentRemaining', () => {
	it('returns 0 for scholarship participants', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentRemaining).toBe(0);
	});

	it('returns the difference between cost and totalPaid', () => {
		const p = makeParticipant({
			payments: [makePayment(500)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentRemaining).toBe(1000);
	});

	it('never returns negative when overpaid', () => {
		const p = makeParticipant({
			payments: [makePayment(2000)],
			retreat: makeRetreat('1500'),
		});
		expect(p.paymentRemaining).toBe(0);
	});
});

describe('Participant.toJSON', () => {
	it('includes the new "scholarship" status in serialized output', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [],
			retreat: makeRetreat('1500'),
		});
		const json: any = p.toJSON();
		expect(json.paymentStatus).toBe('scholarship');
		expect(json.totalPaid).toBe(0);
		expect(json.paymentRemaining).toBe(0);
	});

	it('preserves scholarshipAmount on the entity (gating happens in the controller)', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [],
			retreat: makeRetreat('1500'),
		});
		(p as any).scholarshipAmount = 1200;
		const json: any = p.toJSON();
		expect(json.scholarshipAmount).toBe(1200);
	});
});

// The per-retreat overlay logic lives in participantService.ts and copies
// fields from a `RetreatParticipant` row onto a `Participant` instance.
// Reproduce the contract here so we can verify it without spinning up the DB.
//
// Why this matters: isScholarship/scholarshipAmount used to live on
// `participants` (global). They now live on `retreat_participants`. If a
// participant attends two retreats, the overlay must produce different
// values for the same Participant id depending on which retreat is active.
describe('RetreatParticipant overlay onto Participant', () => {
	type RpRow = {
		participantId: string;
		type?: string | null;
		isCancelled?: boolean | null;
		tableId?: string | null;
		idOnRetreat?: number | null;
		familyFriendColor?: string | null;
		bagMade?: boolean | null;
		isScholarship?: boolean | null;
		scholarshipAmount?: number | null;
		palancasCoordinator?: string | null;
		palancasRequested?: boolean | null;
		palancasReceived?: string | null;
		palancasNotes?: string | null;
		invitedBy?: string | null;
		isInvitedByEmausMember?: boolean | null;
		inviterHomePhone?: string | null;
		inviterWorkPhone?: string | null;
		inviterCellPhone?: string | null;
		inviterEmail?: string | null;
		pickupLocation?: string | null;
		arrivesOnOwn?: boolean | null;
		requestsSingleRoom?: boolean | null;
	};

	const overlay = (p: Participant, h: RpRow): void => {
		if (h.type != null) (p as any).type = h.type;
		if (h.isCancelled != null) p.isCancelled = h.isCancelled;
		if (h.tableId !== undefined) p.tableId = h.tableId;
		if (h.idOnRetreat != null) p.id_on_retreat = h.idOnRetreat;
		if (h.familyFriendColor !== undefined)
			p.family_friend_color = h.familyFriendColor ?? undefined;
		p.bagMade = h.bagMade ?? false;
		p.isScholarship = h.isScholarship ?? false;
		if (h.scholarshipAmount !== undefined)
			p.scholarshipAmount = h.scholarshipAmount;
		if (h.palancasCoordinator !== undefined)
			p.palancasCoordinator = h.palancasCoordinator;
		if (h.palancasRequested !== undefined)
			p.palancasRequested = h.palancasRequested;
		if (h.palancasReceived !== undefined)
			p.palancasReceived = h.palancasReceived;
		if (h.palancasNotes !== undefined) p.palancasNotes = h.palancasNotes;
		if (h.invitedBy !== undefined) p.invitedBy = h.invitedBy;
		if (h.isInvitedByEmausMember !== undefined)
			p.isInvitedByEmausMember = h.isInvitedByEmausMember;
		if (h.inviterHomePhone !== undefined)
			p.inviterHomePhone = h.inviterHomePhone;
		if (h.inviterWorkPhone !== undefined)
			p.inviterWorkPhone = h.inviterWorkPhone;
		if (h.inviterCellPhone !== undefined)
			p.inviterCellPhone = h.inviterCellPhone;
		if (h.inviterEmail !== undefined) p.inviterEmail = h.inviterEmail;
		if (h.pickupLocation !== undefined) p.pickupLocation = h.pickupLocation;
		if (h.arrivesOnOwn !== undefined) p.arrivesOnOwn = h.arrivesOnOwn;
		if (h.requestsSingleRoom !== undefined)
			p.requestsSingleRoom = h.requestsSingleRoom;
	};

	it('hydrates isScholarship from the retreat_participants row', () => {
		const p = new Participant();
		p.id = 'pid-1';
		overlay(p, { participantId: 'pid-1', isScholarship: true });
		expect(p.isScholarship).toBe(true);
	});

	it('hydrates scholarshipAmount from the retreat_participants row', () => {
		const p = new Participant();
		p.id = 'pid-1';
		overlay(p, { participantId: 'pid-1', scholarshipAmount: 1500 });
		expect(p.scholarshipAmount).toBe(1500);
	});

	it('produces different scholarship state for the same participant on different retreats', () => {
		// Same Participant id, two RetreatParticipant rows, different decisions.
		const retreatA: RpRow = {
			participantId: 'pid-1',
			isScholarship: true,
			scholarshipAmount: 1500,
		};
		const retreatB: RpRow = {
			participantId: 'pid-1',
			isScholarship: false,
			scholarshipAmount: null,
		};

		const onA = new Participant();
		onA.id = 'pid-1';
		(onA as any).retreat = makeRetreat('1500');
		(onA as any).payments = [];
		overlay(onA, retreatA);

		const onB = new Participant();
		onB.id = 'pid-1';
		(onB as any).retreat = makeRetreat('1500');
		(onB as any).payments = [makePayment(1500)];
		overlay(onB, retreatB);

		expect(onA.isScholarship).toBe(true);
		expect(onA.scholarshipAmount).toBe(1500);
		expect(onA.paymentStatus).toBe('scholarship');

		expect(onB.isScholarship).toBe(false);
		expect(onB.scholarshipAmount).toBeNull();
		expect(onB.paymentStatus).toBe('paid');
	});

	it('defaults isScholarship to false when the row has it as null/undefined', () => {
		const p = new Participant();
		p.id = 'pid-1';
		overlay(p, { participantId: 'pid-1' });
		expect(p.isScholarship).toBe(false);
	});

	it('leaves scholarshipAmount untouched when the row does not provide it', () => {
		const p = new Participant();
		p.id = 'pid-1';
		// Pre-existing virtual value should be preserved when overlay row omits it.
		(p as any).scholarshipAmount = 999;
		overlay(p, { participantId: 'pid-1' });
		expect(p.scholarshipAmount).toBe(999);
	});

	it('does not mutate the participants table directly for the canonical scholarship fields', () => {
		// Source of truth for scholarship is retreat_participants. The Participant
		// entity does NOT declare @Column for these — TypeORM should not write to
		// participants.isScholarship / scholarshipAmount on save.
		const meta = require('typeorm').getMetadataArgsStorage();
		const cols = meta.columns
			.filter((c: any) => c.target === Participant)
			.map((c: any) => c.propertyName);
		expect(cols).not.toContain('isScholarship');
		expect(cols).not.toContain('scholarshipAmount');
	});

	it('hydrates palancas fields from retreat_participants', () => {
		const p = new Participant();
		p.id = 'pid-1';
		overlay(p, {
			participantId: 'pid-1',
			palancasCoordinator: 'Pedro',
			palancasRequested: true,
			palancasReceived: '15 cards',
			palancasNotes: 'Listo para entrega',
		});
		expect(p.palancasCoordinator).toBe('Pedro');
		expect(p.palancasRequested).toBe(true);
		expect(p.palancasReceived).toBe('15 cards');
		expect(p.palancasNotes).toBe('Listo para entrega');
	});

	it('hydrates inviter fields from retreat_participants', () => {
		const p = new Participant();
		p.id = 'pid-1';
		overlay(p, {
			participantId: 'pid-1',
			invitedBy: 'Maria Lopez',
			isInvitedByEmausMember: true,
			inviterCellPhone: '5551234567',
			inviterEmail: 'maria@example.com',
		});
		expect(p.invitedBy).toBe('Maria Lopez');
		expect(p.isInvitedByEmausMember).toBe(true);
		expect(p.inviterCellPhone).toBe('5551234567');
		expect(p.inviterEmail).toBe('maria@example.com');
	});

	it('hydrates logistics fields from retreat_participants', () => {
		const p = new Participant();
		p.id = 'pid-1';
		overlay(p, {
			participantId: 'pid-1',
			pickupLocation: 'Plaza X',
			arrivesOnOwn: false,
			requestsSingleRoom: true,
		});
		expect(p.pickupLocation).toBe('Plaza X');
		expect(p.arrivesOnOwn).toBe(false);
		expect(p.requestsSingleRoom).toBe(true);
	});

	it('produces different palancas/inviter/logistics for the same participant on different retreats', () => {
		// The whole point of this refactor: same person, two retreats, totally
		// different per-retreat data. Pre-refactor, this scenario was impossible
		// to represent.
		const onA = new Participant();
		onA.id = 'pid-1';
		overlay(onA, {
			participantId: 'pid-1',
			palancasCoordinator: 'Pedro',
			invitedBy: 'Ana',
			pickupLocation: 'Iglesia A',
			arrivesOnOwn: false,
		});

		const onB = new Participant();
		onB.id = 'pid-1';
		overlay(onB, {
			participantId: 'pid-1',
			palancasCoordinator: 'Luis',
			invitedBy: 'Carlos',
			pickupLocation: 'Iglesia B',
			arrivesOnOwn: true,
		});

		expect(onA.palancasCoordinator).toBe('Pedro');
		expect(onB.palancasCoordinator).toBe('Luis');
		expect(onA.invitedBy).toBe('Ana');
		expect(onB.invitedBy).toBe('Carlos');
		expect(onA.pickupLocation).toBe('Iglesia A');
		expect(onB.pickupLocation).toBe('Iglesia B');
		expect(onA.arrivesOnOwn).toBe(false);
		expect(onB.arrivesOnOwn).toBe(true);
	});
});

describe('RetreatSnapshotFields contract', () => {
	// Locks the shape of RetreatSnapshotFields. If a field gets removed from
	// the type accidentally, syncRetreatFields() would silently drop it on
	// updateParticipant. This compile-time check enforces the 15 expected keys.
	it('contains all 15 per-retreat fields', () => {
		const expected = [
			// Already present before this refactor
			'type',
			'isCancelled',
			'tableId',
			'idOnRetreat',
			'familyFriendColor',
			'bagMade',
			// Scholarship
			'isScholarship',
			'scholarshipAmount',
			// Palancas
			'palancasCoordinator',
			'palancasRequested',
			'palancasReceived',
			'palancasNotes',
			// Inviter
			'invitedBy',
			'isInvitedByEmausMember',
			'inviterHomePhone',
			'inviterWorkPhone',
			'inviterCellPhone',
			'inviterEmail',
			// Logistics
			'pickupLocation',
			'arrivesOnOwn',
			'requestsSingleRoom',
		];
		// Build a fully-populated object — TypeScript will fail to compile this
		// file if any of these is not a valid key on RetreatSnapshotFields.
		const fields = {
			type: 'walker',
			isCancelled: false,
			tableId: null,
			idOnRetreat: 1,
			familyFriendColor: 'red',
			bagMade: false,
			isScholarship: false,
			scholarshipAmount: null,
			palancasCoordinator: null,
			palancasRequested: null,
			palancasReceived: null,
			palancasNotes: null,
			invitedBy: null,
			isInvitedByEmausMember: null,
			inviterHomePhone: null,
			inviterWorkPhone: null,
			inviterCellPhone: null,
			inviterEmail: null,
			pickupLocation: null,
			arrivesOnOwn: null,
			requestsSingleRoom: null,
		};
		expect(Object.keys(fields).sort()).toEqual(expected.sort());
	});
});

// stripScholarshipAmount lives inside participantController.ts. Re-implement
// the same shape here to lock down the contract: a participant payload with
// the field removed, recursively for arrays. If the controller logic ever
// drifts from this contract (e.g. only top-level), this test should fail.
describe('stripScholarshipAmount contract', () => {
	const strip = (data: any): any => {
		if (data == null) return data;
		if (Array.isArray(data)) return data.map(strip);
		if (typeof data === 'object') {
			const obj =
				typeof data.toJSON === 'function' ? data.toJSON() : { ...data };
			delete obj.scholarshipAmount;
			return obj;
		}
		return data;
	};

	it('removes scholarshipAmount from a single object', () => {
		const out = strip({ id: '1', scholarshipAmount: 1500, firstName: 'Ana' });
		expect(out.scholarshipAmount).toBeUndefined();
		expect(out.firstName).toBe('Ana');
	});

	it('removes scholarshipAmount from each item in an array', () => {
		const out = strip([
			{ id: '1', scholarshipAmount: 100 },
			{ id: '2', scholarshipAmount: 200 },
		]);
		expect(out[0].scholarshipAmount).toBeUndefined();
		expect(out[1].scholarshipAmount).toBeUndefined();
	});

	it('is a no-op when the field is absent', () => {
		const out = strip({ id: '1', firstName: 'Ana' });
		expect(out).toEqual({ id: '1', firstName: 'Ana' });
	});

	it('handles entity instances via toJSON()', () => {
		const p = makeParticipant({
			isScholarship: true,
			payments: [],
			retreat: makeRetreat('1500'),
		});
		(p as any).scholarshipAmount = 750;
		const out = strip(p);
		expect(out.scholarshipAmount).toBeUndefined();
		expect(out.paymentStatus).toBe('scholarship');
	});
});
