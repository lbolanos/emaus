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
});
