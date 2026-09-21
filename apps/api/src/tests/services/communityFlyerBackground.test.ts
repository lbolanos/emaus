import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { CommunityService } from '@/services/communityService';
import { AppDataSource } from '@/data-source';

jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

// PNG 1x1 real. En dev sin S3, storeFlyerAsset lo re-procesa con sharp y
// devuelve un data-URI webp inline, así que el guardado NO es el data-URI tal
// cual (a diferencia de la foto de reunión, que persiste el original).
const PNG_DATA_URI =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Fondo del flyer de comunidad', () => {
	let testUser: User;
	let testCommunity: Community;
	let service: CommunityService;

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

	const repo = () => AppDataSource.getRepository(Community);

	it('guarda un fondo procesado (webp inline en dev)', async () => {
		const updated = await service.setFlyerBackground(testCommunity.id, PNG_DATA_URI);
		expect(updated?.flyerBackgroundUrl).toMatch(/^data:image\/webp;base64,/);
	});

	it('reemplaza el fondo anterior en vez de acumular', async () => {
		await service.setFlyerBackground(testCommunity.id, PNG_DATA_URI);
		await service.setFlyerBackground(testCommunity.id, PNG_DATA_URI);

		const saved = await repo().findOne({ where: { id: testCommunity.id } });
		expect(saved?.flyerBackgroundUrl).toBeTruthy();
	});

	it('clearFlyerBackground restaura el fondo por defecto (NULL)', async () => {
		await service.setFlyerBackground(testCommunity.id, PNG_DATA_URI);
		await service.clearFlyerBackground(testCommunity.id);

		const saved = await repo().findOne({ where: { id: testCommunity.id } });
		expect(saved?.flyerBackgroundUrl).toBeNull();
	});

	it('rechaza un data-URI que no es una imagen real (magic bytes)', async () => {
		const fake = 'data:image/png;base64,' + Buffer.from('not an image').toString('base64');
		await expect(service.setFlyerBackground(testCommunity.id, fake)).rejects.toThrow();
	});

	it('community inexistente → Community not found', async () => {
		await expect(service.setFlyerBackground('00000000-0000-4000-8000-000000000000', PNG_DATA_URI)).rejects.toThrow(
			'Community not found',
		);
	});
});
