/**
 * Fase 3 del plan de protección de datos de salud: purga automática de
 * medicación/dieta/discapacidad/contactos de emergencia 30 días después de
 * que termina el retiro. Antes de esto no existía ningún mecanismo de
 * retención — los datos se conservaban indefinidamente salvo borrado ARCO
 * explícito.
 *
 * Cubre: selección por corte de 30 días, exclusión de ya-purgados y de
 * ya-anonimizados por ARCO, el modo dry-run (default salvo
 * HEALTH_DATA_RETENTION_ENABLED=true), y que un fallo en una fila no
 * bloquea las demás.
 *
 * Database-independent: mockea el repo/query builder.
 */

const mockGetMany = jest.fn();
const mockSave = jest.fn();
const mockWhere = jest.fn();
const mockAndWhere = jest.fn();
const mockInnerJoin = jest.fn();

function buildQb() {
	const qb: any = {
		innerJoin: mockInnerJoin.mockReturnThis(),
		where: mockWhere.mockReturnThis(),
		andWhere: mockAndWhere.mockReturnThis(),
		getMany: mockGetMany,
	};
	return qb;
}

jest.mock('../../data-source', () => ({
	AppDataSource: {
		getRepository: jest.fn(() => ({
			createQueryBuilder: () => buildQb(),
			save: mockSave,
		})),
	},
}));

const mockDomainAuditLog = jest.fn();
jest.mock('../../services/domainAuditService', () => ({
	domainAuditService: { log: mockDomainAuditLog },
	DomainAuditAction: { PARTICIPANT_HEALTH_DATA_PURGED: 'participant.health_data_purged' },
}));

import { HealthDataRetentionService } from '../../services/healthDataRetentionService';

const makeCandidate = (id: string) => ({
	id,
	retreatId: 'retreat-1',
	medicationDetails: 'Losartán',
	medicationSchedule: 'diario',
	hasMedication: true,
	dietaryRestrictionsDetails: null,
	hasDietaryRestrictions: false,
	disabilitySupport: null,
	snores: true,
	sacraments: ['baptism'],
	sensitiveDataConsentAt: new Date('2026-01-01'),
	emergencyContact1Name: 'Ana Ruiz',
	emergencyContact1Relation: 'Hermana',
	emergencyContact1CellPhone: '5551234567',
	emergencyContact1HomePhone: null,
	emergencyContact1WorkPhone: null,
	emergencyContact1Email: null,
	emergencyContact2Name: null,
	emergencyContact2Relation: null,
	emergencyContact2HomePhone: null,
	emergencyContact2WorkPhone: null,
	emergencyContact2CellPhone: null,
	emergencyContact2Email: null,
	notes: 'Nota operativa sin relación con salud',
	dataDeletedAt: null,
	healthDataPurgedAt: null,
});

describe('HealthDataRetentionService.performCleanup', () => {
	let originalEnv: string | undefined;

	beforeEach(() => {
		jest.clearAllMocks();
		mockSave.mockImplementation(async (p: any) => p);
		originalEnv = process.env.HEALTH_DATA_RETENTION_ENABLED;
	});

	afterEach(() => {
		if (originalEnv === undefined) delete process.env.HEALTH_DATA_RETENTION_ENABLED;
		else process.env.HEALTH_DATA_RETENTION_ENABLED = originalEnv;
	});

	it('dry-run por default: cuenta y audita, pero NO escribe ni anula campos', async () => {
		delete process.env.HEALTH_DATA_RETENTION_ENABLED;
		const candidate = makeCandidate('p-1');
		mockGetMany.mockResolvedValue([candidate]);

		const service = new (HealthDataRetentionService as any)();
		const result = await service.performCleanup();

		expect(result).toEqual({
			scanned: 1,
			purged: 1,
			dryRun: true,
			participantIds: ['p-1'],
		});
		expect(mockSave).not.toHaveBeenCalled();
		// El objeto original queda intacto — dry-run no muta nada.
		expect(candidate.medicationDetails).toBe('Losartán');
		expect(mockDomainAuditLog).toHaveBeenCalledWith(
			expect.objectContaining({
				action: 'participant.health_data_purged',
				resourceId: 'p-1',
				metadata: expect.objectContaining({ dryRun: true }),
			}),
		);
	});

	it('con HEALTH_DATA_RETENTION_ENABLED=true anula salud y contactos, y sella healthDataPurgedAt', async () => {
		process.env.HEALTH_DATA_RETENTION_ENABLED = 'true';
		const candidate = makeCandidate('p-2');
		mockGetMany.mockResolvedValue([candidate]);

		const service = new (HealthDataRetentionService as any)();
		const result = await service.performCleanup();

		expect(result.purged).toBe(1);
		expect(mockSave).toHaveBeenCalledTimes(1);
		const saved = mockSave.mock.calls[0][0];

		expect(saved.medicationDetails).toBeNull();
		expect(saved.medicationSchedule).toBeNull();
		expect(saved.hasMedication).toBe(false);
		expect(saved.hasDietaryRestrictions).toBe(false);
		expect(saved.disabilitySupport).toBeNull();
		expect(saved.snores).toBe(false);
		expect(saved.sacraments).toEqual([]);
		expect(saved.sensitiveDataConsentAt).toBeNull();
		expect(saved.emergencyContact1Name).toBe('');
		expect(saved.emergencyContact1CellPhone).toBe('');
		expect(saved.emergencyContact2Name).toBeNull();
		expect(saved.healthDataPurgedAt).toBeInstanceOf(Date);

		// notes e historial de participación NO se tocan.
		expect(saved.notes).toBe('Nota operativa sin relación con salud');
		expect(saved.id).toBe('p-2');
		expect(saved.retreatId).toBe('retreat-1');
	});

	it('un dryRun explícito gana sobre HEALTH_DATA_RETENTION_ENABLED=true', async () => {
		process.env.HEALTH_DATA_RETENTION_ENABLED = 'true';
		mockGetMany.mockResolvedValue([makeCandidate('p-3')]);

		const service = new (HealthDataRetentionService as any)();
		const result = await service.performCleanup({ dryRun: true });

		expect(result.dryRun).toBe(true);
		expect(mockSave).not.toHaveBeenCalled();
	});

	it('pasa el cutoff correcto (hoy - retentionDays) al query builder', async () => {
		process.env.HEALTH_DATA_RETENTION_ENABLED = 'true';
		mockGetMany.mockResolvedValue([]);

		const service = new (HealthDataRetentionService as any)();
		await service.performCleanup({ retentionDays: 30 });

		// Aritmética civil anclada a APP_TIMEZONE (skill timezone-handling, Regla
		// N°5) — NO `new Date().toISOString().slice(0,10)` directo: ese usa el día
		// calendario en UTC del proceso, que pasadas las ~18:00 en CDMX (UTC-6) ya
		// cruzó a "mañana" y desalinea el corte respecto a `retreat.endDate`
		// (columna date-only, sin hora). Mismo algoritmo que el servicio — el test
		// que de verdad detecta un regreso a la versión ingenua es el de
		// integración (healthDataRetention.integration.test.ts), que compara
		// contra un `endDate` guardado de verdad en SQLite.
		const tz = process.env.APP_TIMEZONE || 'America/Mexico_City';
		const parts = new Intl.DateTimeFormat('en-CA', {
			timeZone: tz,
			year: 'numeric',
			month: '2-digit',
			day: '2-digit',
		}).formatToParts(new Date());
		const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
		const expectedCutoff = new Date(Date.UTC(get('year'), get('month') - 1, get('day')));
		expectedCutoff.setUTCDate(expectedCutoff.getUTCDate() - 30);
		const expectedYmd = expectedCutoff.toISOString().slice(0, 10);

		expect(mockWhere).toHaveBeenCalledWith('r.endDate <= :cutoff', { cutoff: expectedYmd });
		expect(mockAndWhere).toHaveBeenCalledWith('p.healthDataPurgedAt IS NULL');
		expect(mockAndWhere).toHaveBeenCalledWith('p.dataDeletedAt IS NULL');
	});

	it('sin candidatos no escribe ni audita nada', async () => {
		process.env.HEALTH_DATA_RETENTION_ENABLED = 'true';
		mockGetMany.mockResolvedValue([]);

		const service = new (HealthDataRetentionService as any)();
		const result = await service.performCleanup();

		expect(result).toEqual({ scanned: 0, purged: 0, dryRun: false, participantIds: [] });
		expect(mockSave).not.toHaveBeenCalled();
		expect(mockDomainAuditLog).not.toHaveBeenCalled();
	});

	it('un fallo al guardar una fila no bloquea las demás', async () => {
		process.env.HEALTH_DATA_RETENTION_ENABLED = 'true';
		mockGetMany.mockResolvedValue([makeCandidate('p-fail'), makeCandidate('p-ok')]);
		mockSave
			.mockRejectedValueOnce(new Error('DB down'))
			.mockImplementationOnce(async (p: any) => p);
		jest.spyOn(console, 'error').mockImplementation(() => {});

		const service = new (HealthDataRetentionService as any)();
		const result = await service.performCleanup();

		expect(result.scanned).toBe(2);
		expect(result.purged).toBe(1);
		expect(result.participantIds).toEqual(['p-ok']);
	});
});
