/**
 * Fase 3 del plan de protección de datos de salud, sobre la DB real de test
 * (no mocks): un retiro terminado hace ≥30 días purga la salud/contactos de
 * emergencia de sus participantes; uno de hace 29 días no se toca; un
 * participante ya purgado o ya anonimizado por ARCO no se reprocesa.
 */

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { Participant } from '@/entities/participant.entity';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { HealthDataRetentionService } from '@/services/healthDataRetentionService';

const daysAgo = (n: number): Date => {
	const d = new Date();
	d.setDate(d.getDate() - n);
	return d;
};

const healthOverrides = {
	hasMedication: true,
	medicationDetails: 'Losartán para la presión',
	medicationSchedule: 'Cada mañana',
	hasDietaryRestrictions: true,
	dietaryRestrictionsDetails: 'Alergia a los mariscos',
	disabilitySupport: 'Silla de ruedas',
	snores: true,
	sacraments: ['baptism', 'communion'],
	sensitiveDataConsentAt: new Date('2026-01-01'),
	emergencyContact1Name: 'Ana Ruiz',
	emergencyContact1Relation: 'Hermana',
	emergencyContact1CellPhone: '5559876543',
	emergencyContact2Name: 'Carlos Ruiz',
};

describe('HealthDataRetentionService — integración contra DB real de test', () => {
	let service: HealthDataRetentionService;

	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		service = new (HealthDataRetentionService as any)();
	});

	it('purga salud/contactos y sella healthDataPurgedAt para un retiro terminado hace 31 días', async () => {
		const retreat = await TestDataFactory.createTestRetreat({
			endDate: daysAgo(31),
		});
		const participant = await TestDataFactory.createTestParticipant(retreat.id, healthOverrides);

		const result = await service.performCleanup({ retentionDays: 30, dryRun: false });

		expect(result.purged).toBe(1);
		expect(result.participantIds).toContain(participant.id);

		const repo = AppDataSource.getRepository(Participant);
		const reloaded = await repo.findOneOrFail({ where: { id: participant.id } });

		expect(reloaded.medicationDetails).toBeNull();
		expect(reloaded.medicationSchedule).toBeNull();
		expect(reloaded.hasMedication).toBe(false);
		expect(reloaded.hasDietaryRestrictions).toBe(false);
		expect(reloaded.disabilitySupport).toBeNull();
		expect(reloaded.snores).toBe(false);
		expect(reloaded.sacraments).toEqual([]);
		expect(reloaded.sensitiveDataConsentAt).toBeNull();
		expect(reloaded.emergencyContact1Name).toBe('');
		expect(reloaded.emergencyContact1CellPhone).toBe('');
		expect(reloaded.emergencyContact2Name).toBeNull();
		expect(reloaded.healthDataPurgedAt).toBeInstanceOf(Date);

		// Identidad e historial de participación NO se tocan.
		expect(reloaded.firstName).toBe(participant.firstName);
		expect(reloaded.email).toBe(participant.email);
		expect(reloaded.retreatId).toBe(retreat.id);

		// Queda constancia en domain_audit_log.
		const auditRepo = AppDataSource.getRepository(DomainAuditLog);
		const auditRows = await auditRepo.find({ where: { resourceId: participant.id } });
		expect(auditRows).toHaveLength(1);
		expect(auditRows[0].action).toBe('participant.health_data_purged');
	});

	it('NO toca un retiro terminado hace solo 29 días', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ endDate: daysAgo(29) });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, healthOverrides);

		const result = await service.performCleanup({ retentionDays: 30, dryRun: false });

		expect(result.participantIds).not.toContain(participant.id);

		const repo = AppDataSource.getRepository(Participant);
		const reloaded = await repo.findOneOrFail({ where: { id: participant.id } });
		expect(reloaded.medicationDetails).toBe('Losartán para la presión');
		expect(reloaded.healthDataPurgedAt).toBeNull();
	});

	it('no reprocesa un participante ya purgado', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ endDate: daysAgo(60) });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			...healthOverrides,
			healthDataPurgedAt: daysAgo(10),
		});

		const result = await service.performCleanup({ retentionDays: 30, dryRun: false });

		expect(result.participantIds).not.toContain(participant.id);
		// Como ya estaba "purgado" en el fixture pero con datos de salud aún
		// presentes (fixture de prueba, no un caso real), confirmamos que el
		// servicio no lo tocó de nuevo: sigue con el dato que tenía.
		const repo = AppDataSource.getRepository(Participant);
		const reloaded = await repo.findOneOrFail({ where: { id: participant.id } });
		expect(reloaded.medicationDetails).toBe('Losartán para la presión');
	});

	it('no reprocesa un participante ya anonimizado por ARCO (dataDeletedAt)', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ endDate: daysAgo(45) });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			...healthOverrides,
			dataDeletedAt: daysAgo(5),
		});

		const result = await service.performCleanup({ retentionDays: 30, dryRun: false });

		expect(result.participantIds).not.toContain(participant.id);
	});

	it('modo dry-run: cuenta el candidato pero no escribe nada en la DB', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ endDate: daysAgo(31) });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, healthOverrides);

		const result = await service.performCleanup({ retentionDays: 30, dryRun: true });

		expect(result.dryRun).toBe(true);
		expect(result.participantIds).toContain(participant.id);

		const repo = AppDataSource.getRepository(Participant);
		const reloaded = await repo.findOneOrFail({ where: { id: participant.id } });
		expect(reloaded.medicationDetails).toBe('Losartán para la presión');
		expect(reloaded.healthDataPurgedAt).toBeNull();
	});
});
