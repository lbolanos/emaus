/**
 * Tests for public self-service data deletion (LFPDPPP/GDPR).
 *
 * Business rules validated:
 * - `findParticipantByDeleteToken` only returns active (not-yet-anonymized) participants.
 * - `anonymizeParticipantByToken` overwrites PII, invalidates the token, and
 *   stamps `dataDeletedAt`. The fila is preserved so FK to pagos / asignaciones
 *   no rompe.
 * - Calling the anonymize function twice with the same token is a no-op on
 *   the second call (returns false).
 * - Token format validation rejects malformed tokens.
 */

// ---- Mock AppDataSource ---------------------------------------------------

const mockFindOne = jest.fn();
const mockSave = jest.fn();
const mockRepo = { findOne: mockFindOne, save: mockSave };
const mockTransaction = jest.fn(async (cb: any) =>
	cb({ getRepository: () => mockRepo }),
);

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: () => mockRepo,
		transaction: mockTransaction,
	},
}));

// Import AFTER the mock is registered.
import {
	findParticipantByDeleteToken,
	anonymizeParticipantByToken,
} from '../../services/participantService';

// ---- Helpers --------------------------------------------------------------

const makeParticipant = (overrides: Partial<any> = {}) => ({
	id: 'p-1',
	firstName: 'Juan',
	lastName: 'Pérez',
	nickname: 'Juancho',
	email: 'juan@example.com',
	cellPhone: '555-1234',
	homePhone: '555-1111',
	workPhone: '555-2222',
	street: 'Calle 1',
	houseNumber: '10',
	postalCode: '01000',
	neighborhood: 'Centro',
	city: 'CDMX',
	state: 'CDMX',
	parish: 'San José',
	occupation: 'Ingeniero',
	medicationDetails: 'Aspirina',
	medicationSchedule: 'diario',
	dietaryRestrictionsDetails: null,
	disabilitySupport: null,
	emergencyContact1Name: 'María',
	emergencyContact1Relation: 'Esposa',
	emergencyContact1HomePhone: null,
	emergencyContact1WorkPhone: null,
	emergencyContact1CellPhone: '555-3333',
	emergencyContact1Email: 'maria@example.com',
	emergencyContact2Name: null,
	emergencyContact2Relation: null,
	emergencyContact2HomePhone: null,
	emergencyContact2WorkPhone: null,
	emergencyContact2CellPhone: null,
	emergencyContact2Email: null,
	invitedBy: null,
	inviterHomePhone: null,
	inviterWorkPhone: null,
	inviterCellPhone: null,
	inviterEmail: null,
	notes: null,
	palancasNotes: null,
	palancasReceived: null,
	dataDeleteToken: 'a'.repeat(48),
	dataDeletedAt: null,
	retreat: { parish: 'Retiro #42' },
	...overrides,
});

beforeEach(() => {
	mockFindOne.mockReset();
	mockSave.mockReset();
	mockTransaction.mockClear();
});

describe('findParticipantByDeleteToken', () => {
	it('returns participant info when token is valid and not yet deleted', async () => {
		mockFindOne.mockResolvedValue(makeParticipant());
		const info = await findParticipantByDeleteToken('a'.repeat(48));
		expect(info).toEqual({
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'juan@example.com',
			retreatName: 'Retiro #42',
		});
	});

	it('returns null when token does not match any participant', async () => {
		mockFindOne.mockResolvedValue(null);
		const info = await findParticipantByDeleteToken('b'.repeat(48));
		expect(info).toBeNull();
	});

	it('returns null for already-anonymized participants (idempotency)', async () => {
		mockFindOne.mockResolvedValue(
			makeParticipant({ dataDeletedAt: new Date() }),
		);
		const info = await findParticipantByDeleteToken('a'.repeat(48));
		expect(info).toBeNull();
	});
});

describe('anonymizeParticipantByToken', () => {
	it('overwrites PII, clears token, and stamps dataDeletedAt', async () => {
		const participant = makeParticipant();
		mockFindOne.mockResolvedValue(participant);
		mockSave.mockImplementation(async (p: any) => p);

		const ok = await anonymizeParticipantByToken('a'.repeat(48));

		expect(ok).toBe(true);
		expect(mockSave).toHaveBeenCalledTimes(1);
		const saved = mockSave.mock.calls[0][0];

		// PII wiped
		expect(saved.firstName).toBe('(eliminado)');
		expect(saved.lastName).toBe('');
		expect(saved.nickname).toBe('');
		expect(saved.email).toBe(`deleted-${participant.id}@local`);
		expect(saved.cellPhone).toBe('');
		expect(saved.street).toBe('');
		expect(saved.emergencyContact1Name).toBe('');
		expect(saved.emergencyContact1CellPhone).toBe('');
		expect(saved.emergencyContact1Email).toBeNull();
		expect(saved.medicationDetails).toBeNull();
		expect(saved.notes).toBeNull();

		// Identity and audit preserved
		expect(saved.id).toBe('p-1');
		expect(saved.dataDeleteToken).toBeNull();
		expect(saved.dataDeletedAt).toBeInstanceOf(Date);
		expect(saved.lastUpdatedDate).toBeInstanceOf(Date);
	});

	it('returns false when token does not match any participant', async () => {
		mockFindOne.mockResolvedValue(null);
		const ok = await anonymizeParticipantByToken('z'.repeat(48));
		expect(ok).toBe(false);
		expect(mockSave).not.toHaveBeenCalled();
	});

	it('is idempotent — second call on already-anonymized returns false', async () => {
		mockFindOne.mockResolvedValue(
			makeParticipant({ dataDeletedAt: new Date() }),
		);
		const ok = await anonymizeParticipantByToken('a'.repeat(48));
		expect(ok).toBe(false);
		expect(mockSave).not.toHaveBeenCalled();
	});
});

describe('Token format', () => {
	// Mirror the regex used in the controller: 48 lowercase-hex chars
	const isValid = (t: string) => /^[a-f0-9]{48}$/i.test(t);

	it('accepts 48-char lowercase hex tokens', () => {
		expect(isValid('a'.repeat(48))).toBe(true);
		expect(isValid('0123456789abcdef'.repeat(3))).toBe(true);
	});

	it('rejects tokens of wrong length', () => {
		expect(isValid('a'.repeat(47))).toBe(false);
		expect(isValid('a'.repeat(49))).toBe(false);
		expect(isValid('')).toBe(false);
	});

	it('rejects non-hex characters', () => {
		expect(isValid('z'.repeat(48))).toBe(false);
		expect(isValid('../../../etc/passwd')).toBe(false);
		expect(isValid('a'.repeat(47) + ' ')).toBe(false);
	});
});
