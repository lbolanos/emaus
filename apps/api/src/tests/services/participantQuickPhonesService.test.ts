/**
 * Tests del service updateParticipantPhones — PATCH /participants/:id/phones
 * (edición rápida de teléfonos para Palancas, 2026-10-07).
 *
 * Cubre:
 *  - Canonización a número nacional (+52 / 044 / separadores) antes de persistir.
 *  - '' en emergencyContact2CellPhone persiste null (limpiar).
 *  - Campos ausentes no se tocan.
 *  - 404 si el participante no está en el retiro (scope por retreat).
 *  - Auditoría logUpdate con allowlist de los 3 campos y retreatId.
 *
 * Database-independent: mockea el repo/query builder.
 */

const mockRpFindOne = jest.fn();
const mockParticipantFindOneBy = jest.fn();
const mockParticipantSave = jest.fn();
const mockLogUpdate = jest.fn();

jest.mock('../../data-source', () => ({
	AppDataSource: {
		// participantService crea participantRepository en module load con
		// getRepository(Participant); updateParticipantPhones pide el de
		// RetreatParticipant adentro de la función. Despacho por entidad.
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

	it('canoniza +52 a número nacional antes de persistir y responde angosto', async () => {
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

	it('canoniza el prefijo troncal legado 044 (MX)', async () => {
		await updateParticipantPhones(
			PARTICIPANT_ID,
			RETREAT_ID,
			{ emergencyContact1CellPhone: '044 55 9876 5432' },
			'México',
		);

		const saved = mockParticipantSave.mock.calls[0][0];
		expect(saved.emergencyContact1CellPhone).toBe('5598765432');
	});

	it("'' en emergencyContact2CellPhone persiste null (limpiar)", async () => {
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

	it('los campos ausentes del payload no se tocan', async () => {
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

	it('404 si el participante no está inscrito en el retiro', async () => {
		mockRpFindOne.mockResolvedValue(null);

		await expect(
			updateParticipantPhones(PARTICIPANT_ID, RETREAT_ID, { cellPhone: '5512345678' }, 'México'),
		).rejects.toMatchObject({ status: 404 });
		expect(mockParticipantSave).not.toHaveBeenCalled();
	});

	it('audita el diff con allowlist de los 3 teléfonos y el retreatId', async () => {
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
