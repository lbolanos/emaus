// Mock del EmailService antes de importar el service (el constructor lo instancia).
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
	})),
}));

import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { MessageSequenceService } from '@/services/messageSequenceService';

/**
 * M2 — `schedulePreview` devuelve `past: boolean[]` (resuelto server-side con
 * la TZ del retiro) para que el editor marque en ámbar los pasos cuya fecha ya
 * pasó: al activar, el guard de enrolamiento no los programa.
 *
 * `past[i]` sigue a `isRetroactiveAtEnroll(trigger, dates[i], now, tz)`, así
 * que un paso SIN fecha (dates[i] === null) nunca es "pasado".
 */
const TZ = 'America/Mexico_City';

describe('MessageSequenceService — M2 schedulePreview.past', () => {
	let svc: MessageSequenceService;

	beforeAll(async () => {
		await setupTestDatabase();
		svc = new MessageSequenceService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
	});

	it('marca el paso vencido en true y el futuro en false (misma lógica que el guard de enrol)', async () => {
		// Retiro en 30 días: offset 40 vence hace ~10 días; offset 5 cae en +25.
		const retreat = await TestDataFactory.createTestRetreat({
			startDate: new Date(Date.now() + 30 * 86400000),
			timezone: TZ,
		});
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			type: 'walker',
		} as any);

		const res = await svc.schedulePreview({
			retreatId: retreat.id,
			participantId: participant.id,
			trigger: 'days_before_retreat',
			steps: [
				{ offsetDays: 40, sendHour: 9 },
				{ offsetDays: 5, sendHour: 9 },
			],
		});

		expect(res).not.toBeNull();
		expect(res!.dates).toHaveLength(2);
		expect(res!.dates[0]).toBeInstanceOf(Date); // materializa una fecha…
		expect(res!.past).toEqual([true, false]); // …pero ya pasó.
		expect(res!.timezone).toBe(TZ);
	});

	it('paso sin fecha (birthday con centinela 1900) → dates null y past false, nunca ámbar', async () => {
		const retreat = await TestDataFactory.createTestRetreat({
			timezone: TZ,
		});
		// Miembros importados sin fecha real de nacimiento: el centinela hace
		// que computeScheduledFor devuelva null para TODO el paso.
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			birthDate: new Date('1900-01-01T00:00:00.000Z'),
		} as any);

		const res = await svc.schedulePreview({
			retreatId: retreat.id,
			participantId: participant.id,
			trigger: 'birthday',
			steps: [{ offsetDays: 0, sendHour: 9 }],
		});

		expect(res).not.toBeNull();
		expect(res!.dates).toEqual([null]);
		expect(res!.past).toEqual([false]);
	});

	it('participant_created dentro de la ventana de catch-up no se marca aunque el alta sea de ayer', async () => {
		const retreat = await TestDataFactory.createTestRetreat({ timezone: TZ });
		const participant = await TestDataFactory.createTestParticipant(retreat.id, {
			registrationDate: new Date(Date.now() - 1 * 86400000),
		} as any);

		const res = await svc.schedulePreview({
			retreatId: retreat.id,
			participantId: participant.id,
			trigger: 'participant_created',
			steps: [
				{ offsetDays: 0, sendHour: 9 }, // alta + 0 → ayer → catch-up legítimo
				{ offsetDays: 10, sendHour: 9 }, // alta + 10 → futuro
			],
		});

		expect(res).not.toBeNull();
		expect(res!.past).toEqual([false, false]);
	});
});
