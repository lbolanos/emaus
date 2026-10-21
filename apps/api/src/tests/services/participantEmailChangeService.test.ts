/**
 * Tests for changeParticipantEmail — PATCH /participants/:id/email
 * (specs/participant-email-change, D1-D7).
 *
 * Covers:
 *  - 404 when the ficha does not exist.
 *  - No-op (case-insensitive same address): nothing saved, linked or audited.
 *  - D3 collisions: 409 EMAIL_OWNED_BY_OTHER (inside/outside the retreat, with
 *    the pedagogical message naming the owner), 409 EMAIL_OWNED_BY_SAME_PERSON
 *    (suggests the merge flow), spouse exception (same retreat + different
 *    gender passes with spouseShareRetreats).
 *  - D4 user link: only when the ficha has no link; userWithOldEmail advisory.
 *  - D5 overlays equal to the old email are cleared.
 *  - D6 queue regeneration only for active retreats (isRetreatClosed gate).
 *  - Unique-index race at save → 409 EMAIL_UNIQUE_VIOLATION, no side effects.
 *  - Audit: hashes only, never the plaintext email.
 *
 * Database-independent: mocks the repos/query builders by entity name.
 */

const mockParticipantFindOneBy = jest.fn();
const mockParticipantSave = jest.fn();
const mockParticipantGetMany = jest.fn();
const mockRpFind = jest.fn();
const mockSmFind = jest.fn();
const mockUserGetOne = jest.fn();
const mockUserExecute = jest.fn();
const mockMemberFind = jest.fn();
const mockMemberUpdate = jest.fn();
const mockRetreatFind = jest.fn();
const mockIsRetreatClosed = jest.fn();
const mockRegenerate = jest.fn();
const mockAuditLog = jest.fn();

jest.mock('../../data-source', () => ({
	AppDataSource: {
		// participantService resolves every repo lazily inside the function;
		// dispatch by entity name (same pattern as participantQuickPhonesService).
		getRepository: jest.fn((entity: { name?: string }) => {
			switch (entity?.name) {
				case 'Participant':
					return {
						findOneBy: mockParticipantFindOneBy,
						save: mockParticipantSave,
						createQueryBuilder: () => {
							const qb: Record<string, jest.Mock> = {};
							qb.where = jest.fn(() => qb);
							qb.andWhere = jest.fn(() => qb);
							qb.getMany = mockParticipantGetMany;
							return qb;
						},
					};
				case 'RetreatParticipant':
					return { find: mockRpFind };
				case 'ScheduledMessage':
					return { find: mockSmFind };
				case 'User':
					return {
						// getOne decides by the :email param captured at where().
						createQueryBuilder: () => {
							const qb: Record<string, jest.Mock> = {};
							let lastParams: any;
							qb.where = jest.fn((_sql: string, params?: any) => {
								lastParams = params;
								return qb;
							});
							qb.update = jest.fn(() => qb);
							qb.set = jest.fn(() => qb);
							qb.getOne = jest.fn(async () => {
								if (!lastParams?.email) return null;
								return mockUserGetOne(lastParams.email);
							});
							qb.execute = mockUserExecute;
							return qb;
						},
					};
				case 'CommunityMember':
					return { find: mockMemberFind, update: mockMemberUpdate };
				case 'Retreat':
					return { find: mockRetreatFind };
				default:
					return {};
			}
		}),
	},
}));

jest.mock('../../services/domainAuditService', () => {
	const actual = jest.requireActual('../../services/domainAuditService');
	return {
		...actual,
		domainAuditService: { log: mockAuditLog, logUpdate: jest.fn() },
	};
});

jest.mock('../../services/messageSequenceService', () => {
	const actual = jest.requireActual('../../services/messageSequenceService');
	return {
		...actual,
		messageSequenceService: {
			isRetreatClosed: mockIsRetreatClosed,
			regenerateQueuedForRetreat: mockRegenerate,
		},
	};
});

import {
	changeParticipantEmail,
	ParticipantEmailChangeError,
} from '../../services/participantService';

const PARTICIPANT_ID = '00000000-0000-0000-0000-000000000002';
const OTHER_ID = '00000000-0000-0000-0000-000000000003';
const USER_ID = '00000000-0000-0000-0000-000000000004';
const RETREAT_A = '00000000-0000-0000-0000-00000000000a';
const RETREAT_B = '00000000-0000-0000-0000-00000000000b';

const OLD_EMAIL = 'old.personal@mail.test';
const NEW_EMAIL = 'juan.perez@mail.test';

const makeParticipant = (overrides: Record<string, unknown> = {}) => ({
	id: PARTICIPANT_ID,
	firstName: 'Juan',
	lastName: 'Pérez',
	gender: 'M' as const,
	email: OLD_EMAIL,
	userId: null,
	retreatId: RETREAT_A,
	lastUpdatedDate: new Date('2026-01-01'),
	...overrides,
});

const makeOther = (overrides: Record<string, unknown> = {}) => ({
	id: OTHER_ID,
	firstName: 'María',
	lastName: 'López',
	gender: 'F' as const,
	email: NEW_EMAIL,
	...overrides,
});

const noCollisions = () => {
	mockParticipantGetMany.mockResolvedValue([]);
};

const noParticipations = () => {
	mockRpFind.mockResolvedValue([]);
};

describe('changeParticipantEmail — service', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockParticipantFindOneBy.mockResolvedValue(makeParticipant());
		mockParticipantSave.mockImplementation(async (p: any) => p);
		mockUserGetOne.mockResolvedValue(null);
		mockMemberFind.mockResolvedValue([]);
		mockMemberUpdate.mockResolvedValue({ affected: 0 });
		mockRetreatFind.mockResolvedValue([]);
		mockSmFind.mockResolvedValue([]);
		mockIsRetreatClosed.mockReturnValue(false);
		mockRegenerate.mockResolvedValue({ regenerated: 0, skipped: 0 });
		mockUserExecute.mockResolvedValue({ affected: 0 });
		noCollisions();
		noParticipations();
	});

	it('404 when the participant does not exist', async () => {
		mockParticipantFindOneBy.mockResolvedValue(null);

		await expect(
			changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL),
		).rejects.toMatchObject({ status: 404 });
		expect(mockParticipantSave).not.toHaveBeenCalled();
	});

	it('no-op on the same address (case-insensitive): nothing saved or audited', async () => {
		const result = await changeParticipantEmail(
			PARTICIPANT_ID,
			'  OLD.Personal@Mail.test ',
		);

		expect(result.changed).toBe(false);
		expect(mockParticipantSave).not.toHaveBeenCalled();
		expect(mockAuditLog).not.toHaveBeenCalled();
		expect(mockRegenerate).not.toHaveBeenCalled();
	});

	it('happy path: trims the address, saves, audits with hashes only', async () => {
		const result = await changeParticipantEmail(
			PARTICIPANT_ID,
			`  ${NEW_EMAIL} `,
			RETREAT_A,
		);

		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.email).toBe(NEW_EMAIL);
		expect(result.changed).toBe(true);
		expect(result.participant).toEqual({ id: PARTICIPANT_ID, email: NEW_EMAIL });

		expect(mockAuditLog).toHaveBeenCalledTimes(1);
		const event = mockAuditLog.mock.calls[0][0];
		expect(event.action).toBe('participant.email_change');
		expect(event.resourceId).toBe(PARTICIPANT_ID);
		expect(event.retreatId).toBe(RETREAT_A);
		expect(event.metadata.oldEmailHash).toMatch(/^[0-9a-f]{12}$/);
		expect(event.metadata.newEmailHash).toMatch(/^[0-9a-f]{12}$/);
		// PII: the plaintext email never enters the audit event.
		expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain(NEW_EMAIL);
		expect(JSON.stringify(mockAuditLog.mock.calls)).not.toContain(OLD_EMAIL);
	});

	it('D3: 409 EMAIL_OWNED_BY_OTHER names the owner (outside this retreat)', async () => {
		mockParticipantGetMany.mockResolvedValue([makeOther()]);

		const err = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL).catch(
			(e) => e,
		);
		expect(err).toMatchObject({ code: 'EMAIL_OWNED_BY_OTHER', status: 409 });
		expect(err.message).toContain('María López');
		// Where the ficha lives: no shared retreat → outside.
		expect(err.message).toContain('registrado fuera de este retiro');
		expect(mockParticipantSave).not.toHaveBeenCalled();
	});

	it('D3: 409 EMAIL_OWNED_BY_OTHER scoped in-retreat (context retreat, same gender)', async () => {
		mockParticipantGetMany.mockResolvedValue([makeOther({ gender: 'M' })]);
		// First rpFind call = the participant's own participations; second =
		// the other fichas' (loaded only on collision).
		mockRpFind
			.mockResolvedValueOnce([{ participantId: PARTICIPANT_ID, retreatId: RETREAT_A }])
			.mockResolvedValueOnce([{ participantId: OTHER_ID, retreatId: RETREAT_A }]);

		const msg = await runAndCaptureMessage(PARTICIPANT_ID, NEW_EMAIL, RETREAT_A);
		expect(msg).toContain('inscrito en este retiro');
		expect(mockParticipantSave).not.toHaveBeenCalled();
	});

	it('D3: "este retiro" is the context retreat, not any shared retreat', async () => {
		// The two fichas share only RETREAT_B, but the admin corrects from
		// RETREAT_A → the owner must read as outside THIS retreat.
		mockParticipantGetMany.mockResolvedValue([makeOther({ gender: 'M' })]);
		mockRpFind
			.mockResolvedValueOnce([
				{ participantId: PARTICIPANT_ID, retreatId: RETREAT_A },
				{ participantId: PARTICIPANT_ID, retreatId: RETREAT_B },
			])
			.mockResolvedValueOnce([{ participantId: OTHER_ID, retreatId: RETREAT_B }]);

		const msg = await runAndCaptureMessage(PARTICIPANT_ID, NEW_EMAIL, RETREAT_A);
		expect(msg).toContain('registrado fuera de este retiro');
		expect(msg).not.toContain('inscrito en este retiro');
		expect(mockParticipantSave).not.toHaveBeenCalled();
	});

	it('D3: 409 EMAIL_OWNED_BY_SAME_PERSON suggests the merge flow', async () => {
		mockParticipantGetMany.mockResolvedValue([
			makeOther({ firstName: 'Juan', lastName: 'Pérez' }),
		]);

		await expect(
			changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL),
		).rejects.toMatchObject({
			code: 'EMAIL_OWNED_BY_SAME_PERSON',
			status: 409,
		});
		expect(mockParticipantSave).not.toHaveBeenCalled();
	});

	it('D3: spouse exception — same retreat, different gender passes with a warning', async () => {
		mockParticipantGetMany.mockResolvedValue([makeOther()]);
		mockRpFind
			.mockResolvedValueOnce([{ participantId: PARTICIPANT_ID, retreatId: RETREAT_A }])
			.mockResolvedValueOnce([{ participantId: OTHER_ID, retreatId: RETREAT_A }]);
		mockRetreatFind.mockResolvedValue([{ id: RETREAT_A, endDate: new Date() }]);

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(result.changed).toBe(true);
		expect(result.effects.spouseShareRetreats).toEqual([RETREAT_A]);
		expect(mockParticipantSave).toHaveBeenCalledTimes(1);
	});

	it('D3: spouse share retreats are deduped (two opposite-gender fichas, one retreat)', async () => {
		// A family address shared by two F fichas in RETREAT_A: the effect must
		// name the retreat once, not once per sharing ficha.
		const OTHER_ID_2 = '00000000-0000-0000-0000-000000000005';
		mockParticipantGetMany.mockResolvedValue([
			makeOther(),
			makeOther({ id: OTHER_ID_2, firstName: 'Ana' }),
		]);
		mockRpFind
			.mockResolvedValueOnce([{ participantId: PARTICIPANT_ID, retreatId: RETREAT_A }])
			.mockResolvedValueOnce([
				{ participantId: OTHER_ID, retreatId: RETREAT_A },
				{ participantId: OTHER_ID_2, retreatId: RETREAT_A },
			]);
		mockRetreatFind.mockResolvedValue([{ id: RETREAT_A, endDate: new Date() }]);

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(result.effects.spouseShareRetreats).toEqual([RETREAT_A]);
	});

	it('D4: links the matching user only when the ficha has no link', async () => {
		mockUserGetOne.mockImplementation(async (email: string) =>
			email === NEW_EMAIL.toLowerCase() ? { id: USER_ID } : null,
		);

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(result.effects.userLinked).toBe(true);
		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.userId).toBe(USER_ID);
		// Reciprocal link, same criterion as the alta.
		expect(mockUserExecute).toHaveBeenCalledTimes(1);
	});

	it('D4: does not touch the link when the ficha already has one', async () => {
		mockParticipantFindOneBy.mockResolvedValue(
			makeParticipant({ userId: USER_ID }),
		);
		mockUserGetOne.mockResolvedValue({ id: 'otro-user' });

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(result.effects.userLinked).toBe(false);
		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.userId).toBe(USER_ID);
		expect(mockUserExecute).not.toHaveBeenCalled();
	});

	it('D4: flags an account still carrying the old email', async () => {
		mockUserGetOne.mockImplementation(async (email: string) =>
			email === OLD_EMAIL.toLowerCase() ? { id: USER_ID } : null,
		);

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(result.effects.userLinked).toBe(false);
		expect(result.effects.userWithOldEmail).toBe(true);
		expect(mockAuditLog.mock.calls[0][0].metadata.userWithOldEmail).toBe(true);
	});

	it('D5: clears only the overlays equal to the old email', async () => {
		mockMemberFind.mockResolvedValue([
			{ id: 'member-1', email: OLD_EMAIL },
			{ id: 'member-2', email: 'otra.cosa@mail.test' },
			{ id: 'member-3', email: null },
		]);

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(mockMemberUpdate).toHaveBeenCalledWith(['member-1'], { email: null });
		expect(result.effects.overlaysCleared).toBe(1);
	});

	it('D6: regenerates the queue only for active retreats', async () => {
		mockRpFind.mockResolvedValueOnce([
			{ participantId: PARTICIPANT_ID, retreatId: RETREAT_A },
			{ participantId: PARTICIPANT_ID, retreatId: RETREAT_B },
		]);
		mockRetreatFind.mockResolvedValue([
			{ id: RETREAT_A, endDate: new Date() },
			{ id: RETREAT_B, endDate: new Date('2020-01-01') },
		]);
		mockIsRetreatClosed.mockImplementation(
			(retreat: { id: string }) => retreat.id === RETREAT_B,
		);
		mockRegenerate.mockResolvedValue({ regenerated: 3, skipped: 1 });

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(mockRegenerate).toHaveBeenCalledTimes(1);
		expect(mockRegenerate).toHaveBeenCalledWith(RETREAT_A);
		expect(result.effects.queueRegenerated).toEqual([
			{ retreatId: RETREAT_A, regenerated: 3, skipped: 1 },
		]);
	});

	it('D6: regenerates a CLOSED retreat when the participant still has undispatched rows', async () => {
		// days_after_retreat sequences keep dispatching AFTER_RETREAT_GRACE_DAYS
		// past the end; WhatsApp rows sit in the tray as `queued`. Those frozen
		// rows must be re-resolved even though isRetreatClosed says closed.
		mockRpFind.mockResolvedValueOnce([
			{ participantId: PARTICIPANT_ID, retreatId: RETREAT_A },
		]);
		mockSmFind.mockResolvedValue([{ retreatId: RETREAT_B }]);
		mockRetreatFind.mockResolvedValue([
			{ id: RETREAT_A, endDate: new Date() },
			{ id: RETREAT_B, endDate: new Date('2020-01-01') },
		]);
		mockIsRetreatClosed.mockImplementation(
			(retreat: { id: string }) => retreat.id === RETREAT_B,
		);
		mockRegenerate.mockResolvedValue({ regenerated: 2, skipped: 0 });

		const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);

		expect(mockRegenerate).toHaveBeenCalledTimes(2);
		expect(mockRegenerate).toHaveBeenCalledWith(RETREAT_A);
		expect(mockRegenerate).toHaveBeenCalledWith(RETREAT_B);
		expect(result.effects.queueRegenerated).toEqual([
			{ retreatId: RETREAT_A, regenerated: 2, skipped: 0 },
			{ retreatId: RETREAT_B, regenerated: 2, skipped: 0 },
		]);
	});

	it('D6: a failing regeneration does not fail the request', async () => {
		mockRpFind.mockResolvedValueOnce([
			{ participantId: PARTICIPANT_ID, retreatId: RETREAT_A },
		]);
		mockRetreatFind.mockResolvedValue([{ id: RETREAT_A, endDate: new Date() }]);
		mockRegenerate.mockRejectedValue(new Error('boom'));
		const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

		try {
			const result = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL);
			expect(result.changed).toBe(true);
			expect(result.effects.queueRegenerated).toEqual([]);
		} finally {
			errorSpy.mockRestore();
		}
	});

	it('unique-index race at save → 409 EMAIL_UNIQUE_VIOLATION without side effects', async () => {
		mockParticipantSave.mockRejectedValue(
			new Error(
				'UNIQUE constraint failed: participants.email, participants.retreatId',
			),
		);
		mockMemberFind.mockResolvedValue([{ id: 'member-1', email: OLD_EMAIL }]);

		await expect(
			changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL),
		).rejects.toMatchObject({
			code: 'EMAIL_UNIQUE_VIOLATION',
			status: 409,
		});
		// Nothing after the failed save ran.
		expect(mockMemberUpdate).not.toHaveBeenCalled();
		expect(mockRegenerate).not.toHaveBeenCalled();
		expect(mockAuditLog).not.toHaveBeenCalled();
	});

	it('rejects with a typed error instance (controller maps code + status)', async () => {
		mockParticipantGetMany.mockResolvedValue([makeOther()]);

		const err = await changeParticipantEmail(PARTICIPANT_ID, NEW_EMAIL).catch(
			(e) => e,
		);
		expect(err).toBeInstanceOf(ParticipantEmailChangeError);
	});
});

/** Runs a rejected call and returns the message (for message-shape asserts). */
async function runAndCaptureMessage(
	id: string,
	email: string,
	contextRetreatId?: string,
): Promise<string> {
	try {
		await changeParticipantEmail(id, email, contextRetreatId);
		return '';
	} catch (e) {
		return (e as Error).message;
	}
}
