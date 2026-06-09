import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { AppDataSource } from '@/data-source';
import { DomainAuditLog } from '@/entities/domainAuditLog.entity';
import { Retreat } from '@/entities/retreat.entity';
import { Participant } from '@/entities/participant.entity';
import { auditContext } from '@/utils/auditContext';

// participantService crea un repo a nivel de módulo (`AppDataSource.getRepository`).
// Hay que importarlo DESPUÉS de setupTestDatabase() (import dinámico en beforeAll) para
// que ese repo use el data source de test ya monkey-patcheado.
let setParticipantCheckIn: typeof import('@/services/participantService')['setParticipantCheckIn'];
let deleteParticipant: typeof import('@/services/participantService')['deleteParticipant'];

// Silenciar EmailService y el websocket de recepción para aislar la auditoría.
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(false),
	})),
}));
jest.mock('@/realtime', () => ({
	emitReceptionCheckin: jest.fn(),
}));

describe('Domain audit — instrumentación de participantes', () => {
	let retreat: Retreat;
	let participant: Participant;

	beforeAll(async () => {
		await setupTestDatabase();
		const svc = await import('@/services/participantService');
		setParticipantCheckIn = svc.setParticipantCheckIn;
		deleteParticipant = svc.deleteParticipant;
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		retreat = await TestDataFactory.createTestRetreat();
		participant = await TestDataFactory.createTestParticipant(retreat.id, { type: 'walker' });
	});

	const logs = () => AppDataSource.getRepository(DomainAuditLog).find();
	async function waitForLogs(
		predicate: (rows: DomainAuditLog[]) => boolean,
		tries = 60,
		delayMs = 5,
	): Promise<DomainAuditLog[]> {
		let rows = await logs();
		for (let i = 0; i < tries && !predicate(rows); i++) {
			await new Promise((r) => setTimeout(r, delayMs));
			rows = await logs();
		}
		return rows;
	}

	it('setParticipantCheckIn registra participant.checkin con el old/new', async () => {
		await auditContext.run({ userId: 'recep-1', ip: '10.0.0.9' }, async () => {
			await setParticipantCheckIn(participant.id, retreat.id, true);
		});

		const rows = (await waitForLogs((r) => r.some((x) => x.action === 'participant.checkin'))).filter(
			(r) => r.action === 'participant.checkin',
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].resourceId).toBe(participant.id);
		expect(rows[0].retreatId).toBe(retreat.id);
		expect(rows[0].actorUserId).toBe('recep-1');
		expect(JSON.parse(rows[0].oldValues!)).toEqual({ checkedIn: false });
		expect(JSON.parse(rows[0].newValues!)).toEqual({ checkedIn: true });
	});

	it('deleteParticipant (soft) registra participant.delete con metadata softDelete', async () => {
		await auditContext.run({ userId: 'admin-1' }, async () => {
			await deleteParticipant(participant.id);
		});

		const rows = (await waitForLogs((r) => r.some((x) => x.action === 'participant.delete'))).filter(
			(r) => r.action === 'participant.delete',
		);
		expect(rows).toHaveLength(1);
		expect(rows[0].resourceId).toBe(participant.id);
		expect(rows[0].actorUserId).toBe('admin-1');
		expect(JSON.parse(rows[0].metadata!)).toMatchObject({ softDelete: true });
		// Nunca debe registrar campos secretos.
		const old = JSON.parse(rows[0].oldValues ?? '{}');
		expect(old.password).toBeUndefined();
	});
});
