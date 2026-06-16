import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { CommunityService } from '@/services/communityService';
import { CommunityMeeting } from '@/entities/communityMeeting.entity';
import { AppDataSource } from '@/data-source';

// Mock EmailService antes de cargar el servicio (regla ESM del proyecto): el
// service dispara notificaciones fire-and-forget al crear reuniones.
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

// data-URI de imagen válido (PNG 1x1 transparente). En modo base64 (default de
// los tests) el service persiste el data-URI tal cual en `photoUrl` sin tocar S3.
const PNG_DATA_URI =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

describe('Community Meeting Photo', () => {
	let service: CommunityService;
	let testUser: User;
	let testCommunity: Community;

	beforeAll(async () => {
		await setupTestDatabase();
		service = new CommunityService();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		testUser = await TestDataFactory.createTestUser();
		testCommunity = await TestDataFactory.createTestCommunity(testUser.id);
	});

	const createMeeting = () =>
		service.createMeeting(testCommunity.id, {
			title: 'Reunión con foto',
			startDate: new Date(),
			durationMinutes: 60,
		});

	describe('setMeetingPhoto', () => {
		it('guarda el data-URI en photoUrl (modo base64) y deja photoS3Key en null', async () => {
			const meeting = await createMeeting();

			const updated = await service.setMeetingPhoto(meeting.id, PNG_DATA_URI);

			expect(updated?.photoUrl).toBe(PNG_DATA_URI);
			expect(updated?.photoS3Key).toBeNull();

			// Verificar persistencia en DB
			const persisted = await AppDataSource.getRepository(CommunityMeeting).findOne({
				where: { id: meeting.id },
			});
			expect(persisted?.photoUrl).toBe(PNG_DATA_URI);
		});

		it('reemplaza una foto existente', async () => {
			const meeting = await createMeeting();
			await service.setMeetingPhoto(meeting.id, PNG_DATA_URI);

			const newPhoto = PNG_DATA_URI.replace('iVBORw0KGgo', 'iVBORw0KGgX'); // otro data-URI
			const updated = await service.setMeetingPhoto(meeting.id, newPhoto);

			expect(updated?.photoUrl).toBe(newPhoto);
		});

		it('lanza "Meeting not found" si la reunión no existe', async () => {
			await expect(
				service.setMeetingPhoto('00000000-0000-0000-0000-000000000000', PNG_DATA_URI),
			).rejects.toThrow('Meeting not found');
		});
	});

	describe('deleteMeetingPhoto', () => {
		it('limpia photoUrl y photoS3Key', async () => {
			const meeting = await createMeeting();
			await service.setMeetingPhoto(meeting.id, PNG_DATA_URI);

			const updated = await service.deleteMeetingPhoto(meeting.id);

			expect(updated?.photoUrl).toBeNull();
			expect(updated?.photoS3Key).toBeNull();
		});

		it('es idempotente si la reunión no tiene foto', async () => {
			const meeting = await createMeeting();

			const updated = await service.deleteMeetingPhoto(meeting.id);

			expect(updated?.photoUrl).toBeNull();
		});

		it('lanza "Meeting not found" si la reunión no existe', async () => {
			await expect(
				service.deleteMeetingPhoto('00000000-0000-0000-0000-000000000000'),
			).rejects.toThrow('Meeting not found');
		});
	});
});
