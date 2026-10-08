/**
 * Tests for the updateParticipantPhones service — PATCH /participants/:id/phones
 * (quick phone edit for Palancas, 2026-10-07).
 *
 * Covers:
 *  - Canonicalization to the national number (+52 / 044 / separators) before persisting.
 *  - '' in emergencyContact2CellPhone persists null (clear).
 *  - Absent fields are untouched.
 *  - 404 when the participant is not in the retreat (per-retreat scope).
 *  - logUpdate audit with the 3-field allowlist and the retreatId.
 *
 * Database-independent: mocks the repo/query builder.
 */

const mockRpFindOne = jest.fn();
const mockParticipantFindOneBy = jest.fn();
const mockParticipantSave = jest.fn();
const mockLogUpdate = jest.fn();

jest.mock('../../data-source', () => ({
	AppDataSource: {
		// participantService creates participantRepository at module load via
		// getRepository(Participant); updateParticipantPhones asks for the
		// RetreatParticipant one inside the function. Dispatch by entity.
		getRepository: jest.fn((entity: { name?: string }) =>
			entity?.name === 'RetreatParticipant'
				? { findOne: mockRpFindOne }
				: { findOneBy: mockParticipantFindOneBy, save: mockParticipantSave },
		),
	},
}));

jest.mock('../../services/domainAuditService', () => {
	const actual = jest.requireActual('../../services/domainAuditService');
	return {
		...actual,
		domainAuditService: { logUpdate: mockLogUpdate, log: jest.fn() },
	};
});

import { updateParticipantPhones } from '../../services/participantService';

const RETREAT_ID = '00000000-0000-0000-0000-000000000001';
const PARTICIPANT_ID = '00000000-0000-0000-0000-000000000002';

const makeParticipant = () => ({
	id: PARTICIPANT_ID,
	cellPhone: '5500000000',
	emergencyContact1CellPhone: '5511111111',
	emergencyContact2CellPhone: undefined,
});

describe('updateParticipantPhones — service', () => {
	beforeEach(() => {
		jest.clearAllMocks();
		mockRpFindOne.mockResolvedValue({ id: 'rp-1', participantId: PARTICIPANT_ID, retreatId: RETREAT_ID });
		mockParticipantFindOneBy.mockResolvedValue(makeParticipant());
		mockParticipantSave.mockImplementation(async (p) => p);
	});

	it('canonicalizes +52 to the national number before persisting and answers narrow', async () => {
		const result = await updateParticipantPhones(
			PARTICIPANT_ID,
			RETREAT_ID,
			{ cellPhone: '+52 55 1234 5678' },
			'México',
		);

		expect(mockParticipantSave).toHaveBeenCalledTimes(1);
		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.cellPhone).toBe('5512345678');
		expect(result).toEqual({
			id: PARTICIPANT_ID,
			cellPhone: '5512345678',
			emergencyContact1CellPhone: '5511111111',
			emergencyContact2CellPhone: null,
		});
	});

	it('canonicalizes the legacy trunk prefix 044 (MX)', async () => {
		await updateParticipantPhones(
			PARTICIPANT_ID,
			RETREAT_ID,
			{ emergencyContact1CellPhone: '044 55 9876 5432' },
			'México',
		);

		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.emergencyContact1CellPhone).toBe('5598765432');
	});

	it("'' in emergencyContact2CellPhone persists null (clear)", async () => {
		mockParticipantFindOneBy.mockResolvedValue({
			...makeParticipant(),
			emergencyContact2CellPhone: '5522222222',
		});

		await updateParticipantPhones(
			PARTICIPANT_ID,
			RETREAT_ID,
			{ emergencyContact2CellPhone: '' },
			'México',
		);

		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.emergencyContact2CellPhone).toBeNull();
	});

	it('leaves payload fields that are absent untouched', async () => {
		await updateParticipantPhones(
			PARTICIPANT_ID,
			RETREAT_ID,
			{ cellPhone: '5512345678' },
			'México',
		);

		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.emergencyContact1CellPhone).toBe('5511111111');
		expect(saved.emergencyContact2CellPhone).toBeUndefined();
	});

	it('404 when the participant is not enrolled in the retreat', async () => {
		mockRpFindOne.mockResolvedValue(null);

		await expect(
			updateParticipantPhones(PARTICIPANT_ID, RETREAT_ID, { cellPhone: '5512345678' }, 'México'),
		).rejects.toMatchObject({ status: 404 });
		expect(mockParticipantSave).not.toHaveBeenCalled();
	});

	it('audits the diff with the 3-phone allowlist and the retreatId', async () => {
		await updateParticipantPhones(
			PARTICIPANT_ID,
			RETREAT_ID,
			{ cellPhone: '5512345678' },
			'México',
		);

		expect(mockLogUpdate).toHaveBeenCalledTimes(1);
		const [resourceType, resourceId, oldValues, newValues, opts] = mockLogUpdate.mock.calls[0];
		expect(resourceType).toBe('participant');
		expect(resourceId).toBe(PARTICIPANT_ID);
		expect(oldValues.cellPhone).toBe('5500000000');
		expect(newValues.cellPhone).toBe('5512345678');
		expect(opts).toMatchObject({
			retreatId: RETREAT_ID,
			fields: ['cellPhone', 'emergencyContact1CellPhone', 'emergencyContact2CellPhone'],
		});
	});
});
