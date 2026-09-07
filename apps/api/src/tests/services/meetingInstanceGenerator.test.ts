import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { MeetingInstanceGeneratorService } from '@/services/meetingInstanceGeneratorService';
import { AppDataSource } from '@/data-source';
import { CommunityMeeting } from '@/entities/communityMeeting.entity';

// Mock EmailService — el generator dispara notifyMembersOfMeeting fire-and-forget.
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async (data: any) => {
			(globalThis as any).__sentEmails ||= [];
			(globalThis as any).__sentEmails.push(data);
			return true;
		}),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

describe('MeetingInstanceGeneratorService', () => {
	let testUser: User;
	let testCommunity: Community;
	let testRetreat: Retreat;
	let service: CommunityService;
	let generator: MeetingInstanceGeneratorService;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new CommunityService();
		generator = MeetingInstanceGeneratorService.getInstance();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		testUser = await TestDataFactory.createTestUser();
		testCommunity = await TestDataFactory.createTestCommunity(testUser.id);
		testRetreat = await TestDataFactory.createTestRetreat();
		(globalThis as any).__sentEmails = [];
	});

	const daysFromNow = (n: number) => {
		const d = new Date();
		d.setDate(d.getDate() + n);
		return d;
	};

	it('generates upcoming instances for an active weekly template within lookahead', async () => {
		// Template empieza en 7 días. Lookahead default = 14 → debe generar 1 instancia
		// adicional (+14d) y NO la siguiente (+21d).
		const template = await service.createMeeting(testCommunity.id, {
			title: 'Auto Weekly',
			startDate: daysFromNow(7),
			durationMinutes: 60,
			recurrenceFrequency: 'weekly',
		});

		const result = await generator.performGeneration();

		expect(result.errors).toBe(0);
		// Al menos 1 generada (la +14d). Dependiendo de cómo cae el dayOfWeek
		// computado, puede generar 0 o 1; toleramos el bool.
		const instances = await AppDataSource.getRepository(CommunityMeeting).find({
			where: { parentMeetingId: template.id },
		});
		expect(instances.length).toBeGreaterThanOrEqual(1);
		// Ninguna debe estar más allá de la ventana (now + 14d).
		const windowEnd = daysFromNow(generator.LOOKAHEAD_DAYS);
		for (const inst of instances) {
			expect(inst.startDate.getTime()).toBeLessThanOrEqual(windowEnd.getTime() + 1000);
		}
	});

	it('respects recurrenceEndDate and stops generating beyond it', async () => {
		// Template +7d, endDate +10d. La próxima ocurrencia (+14d) ya pasa el tope.
		const template = await service.createMeeting(testCommunity.id, {
			title: 'Capped Series',
			startDate: daysFromNow(7),
			durationMinutes: 60,
			recurrenceFrequency: 'weekly',
			recurrenceEndDate: daysFromNow(10),
		});

		const result = await generator.performGeneration();

		expect(result.errors).toBe(0);
		const instances = await AppDataSource.getRepository(CommunityMeeting).find({
			where: { parentMeetingId: template.id },
		});
		expect(instances.length).toBe(0);
	});

	it('is idempotent — second run does not duplicate instances', async () => {
		const template = await service.createMeeting(testCommunity.id, {
			title: 'Idempotent Series',
			startDate: daysFromNow(7),
			durationMinutes: 60,
			recurrenceFrequency: 'weekly',
		});

		await generator.performGeneration();
		const afterFirst = await AppDataSource.getRepository(CommunityMeeting).count({
			where: { parentMeetingId: template.id },
		});

		await generator.performGeneration();
		const afterSecond = await AppDataSource.getRepository(CommunityMeeting).count({
			where: { parentMeetingId: template.id },
		});

		expect(afterSecond).toBe(afterFirst);
	});

	it('skips templates with exceptionType=cancelled', async () => {
		const template = await service.createMeeting(testCommunity.id, {
			title: 'Cancelled Template',
			startDate: daysFromNow(7),
			durationMinutes: 60,
			recurrenceFrequency: 'weekly',
		});
		await AppDataSource.getRepository(CommunityMeeting).update(template.id, {
			exceptionType: 'cancelled',
		});

		await generator.performGeneration();

		const instances = await AppDataSource.getRepository(CommunityMeeting).count({
			where: { parentMeetingId: template.id },
		});
		expect(instances).toBe(0);
	});

	it('does not regenerate after deleteMeeting with scope=all_future severs recurrence', async () => {
		const template = await service.createMeeting(testCommunity.id, {
			title: 'Pre-severed',
			startDate: daysFromNow(7),
			durationMinutes: 60,
			recurrenceFrequency: 'weekly',
		});

		// Corta la recurrencia simulando deleteMeeting con scope=all_future ejecutado
		// desde una instancia futura inexistente (caso edge: usuario decidió parar la serie).
		await AppDataSource.getRepository(CommunityMeeting).update(template.id, {
			recurrenceFrequency: null,
			isRecurrenceTemplate: false,
		});

		await generator.performGeneration();

		const instances = await AppDataSource.getRepository(CommunityMeeting).count({
			where: { parentMeetingId: template.id },
		});
		expect(instances).toBe(0);
	});
	/**
	 * `skipped` medía contra el acumulado `generated` de toda la corrida, no contra
	 * lo que produjo cada template: en cuanto uno generaba algo, la métrica se
	 * congelaba en 0 y las series estancadas dejaban de verse en el log del cron.
	 *
	 * El orden importa para que el test distinga: el template productivo se crea
	 * primero, así el bug deja `skipped` en 0 en vez de acertar por casualidad.
	 */
	it('cuenta como skipped cada template que no produjo instancias', async () => {
		await service.createMeeting(testCommunity.id, {
			title: 'Productivo',
			startDate: daysFromNow(7),
			durationMinutes: 60,
			recurrenceFrequency: 'weekly',
		});
		// Muy lejos de la ventana de 14 días: no generan nada.
		for (const title of ['Lejano A', 'Lejano B']) {
			await service.createMeeting(testCommunity.id, {
				title,
				startDate: daysFromNow(90),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
			});
		}

		const result = await generator.performGeneration();

		expect(result.errors).toBe(0);
		expect(result.generated).toBeGreaterThanOrEqual(1);
		expect(result.skipped).toBe(2);
	});

	/**
	 * Regresión de zona horaria (bug reportado en producción).
	 *
	 * El cron corre en un server en Etc/UTC. Una serie de los miércoles a las
	 * 19:45 CDMX se guarda como 01:45Z del jueves, así que resolver "el próximo
	 * miércoles" con los getters locales de `Date` avanzaba 6 días en vez de 7 y
	 * materializaba toda la serie los martes.
	 *
	 * Estos dos tests cubren el plumbing completo (no solo el helper): que el
	 * generador cargue la community y le pase su timezone. El caso de Tokio usa
	 * una zona distinta del default para que el test falle si alguien deja de
	 * propagar la timezone y el cálculo cae al fallback de CDMX.
	 */
	describe('timezone de la community', () => {
		const weekdayIn = (date: Date, timeZone: string) =>
			new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);

		it('mantiene la serie en miércoles para una community en CDMX', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				timezone: 'America/Mexico_City',
			});
			// Miércoles 2 de septiembre de 2026, 19:45 CDMX.
			const template = await service.createMeeting(community.id, {
				title: 'Preparacion Retiro',
				startDate: new Date('2026-09-03T01:45:00.000Z'),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceDayOfWeek: 'wednesday',
			});

			const result = await generator.performGeneration(new Date('2026-09-03T12:00:00.000Z'));
			expect(result.errors).toBe(0);

			const instances = await AppDataSource.getRepository(CommunityMeeting).find({
				where: { parentMeetingId: template.id },
				order: { startDate: 'ASC' },
			});

			expect(instances.map((i) => i.startDate.toISOString())).toEqual([
				'2026-09-10T01:45:00.000Z', // miércoles 9
				'2026-09-17T01:45:00.000Z', // miércoles 16
			]);
			for (const inst of instances) {
				expect(weekdayIn(inst.startDate, 'America/Mexico_City')).toBe('Wed');
			}
		});

		it('usa la timezone de la community y no el fallback de CDMX', async () => {
			const community = await TestDataFactory.createTestCommunity(testUser.id, {
				timezone: 'Asia/Tokyo',
			});
			// Miércoles 2 de septiembre de 2026, 08:00 en Tokio = martes 23:00Z.
			const template = await service.createMeeting(community.id, {
				title: 'Reunion Tokio',
				startDate: new Date('2026-09-01T23:00:00.000Z'),
				durationMinutes: 60,
				recurrenceFrequency: 'weekly',
				recurrenceInterval: 1,
				recurrenceDayOfWeek: 'wednesday',
			});

			const result = await generator.performGeneration(new Date('2026-09-01T12:00:00.000Z'));
			expect(result.errors).toBe(0);

			const instances = await AppDataSource.getRepository(CommunityMeeting).find({
				where: { parentMeetingId: template.id },
				order: { startDate: 'ASC' },
			});

			// Con el fallback de CDMX este instante es martes 17:00 y la serie
			// saltaría un solo día, a 2026-09-02T23:00Z.
			expect(instances.map((i) => i.startDate.toISOString())).toEqual([
				'2026-09-08T23:00:00.000Z',
			]);
			expect(weekdayIn(instances[0].startDate, 'Asia/Tokyo')).toBe('Wed');
		});
	});
});
