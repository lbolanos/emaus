import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { AppDataSource } from '@/data-source';
import { CommunityMember } from '@/entities/communityMember.entity';
import { Participant } from '@/entities/participant.entity';
import { CommunityAdmin } from '@/entities/communityAdmin.entity';
// Import estático a propósito: con `await import()` dentro del test, Jest en
// modo ESM resuelve OTRA instancia del módulo, con un `AppDataSource` sin el
// swap del test-setup → ConnectionIsNotSetError al abrir la transacción.
import { anonymizeParticipantByToken } from '@/services/participantService';

jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

// PNG 1x1 real: los tests corren en modo base64, donde el data-URI se persiste
// tal cual (el resize con sharp solo entra en modo S3).
const PNG_DATA_URI =
	'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe('Foto de miembro de comunidad', () => {
	let testUser: User;
	let testCommunity: Community;
	let testRetreat: Retreat;
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
		testRetreat = await TestDataFactory.createTestRetreat(testUser.id);
	});

	const memberRepo = () => AppDataSource.getRepository(CommunityMember);
	const participantRepo = () => AppDataSource.getRepository(Participant);

	const addMember = async () => {
		const participant = await TestDataFactory.createTestParticipant(testRetreat.id);
		const member = await service.addMember(testCommunity.id, participant.id);
		return { memberId: (member as any).id as string, participantId: participant.id };
	};

	it('guarda la foto en el miembro', async () => {
		const { memberId } = await addMember();
		await service.setMemberPhoto(testCommunity.id, memberId, PNG_DATA_URI);

		const saved = await memberRepo().findOne({ where: { id: memberId } });
		expect(saved?.photoUrl).toBe(PNG_DATA_URI);
	});

	it('reemplaza la foto anterior en vez de acumular', async () => {
		const { memberId } = await addMember();
		await service.setMemberPhoto(testCommunity.id, memberId, PNG_DATA_URI);
		const otherPng = PNG_DATA_URI.replace('iVBOR', 'iVBOR'); // mismo contenido, otra llamada
		await service.setMemberPhoto(testCommunity.id, memberId, otherPng);

		const saved = await memberRepo().findOne({ where: { id: memberId } });
		expect(saved?.photoUrl).toBe(otherPng);
	});

	it('borra la foto', async () => {
		const { memberId } = await addMember();
		await service.setMemberPhoto(testCommunity.id, memberId, PNG_DATA_URI);
		await service.deleteMemberPhoto(testCommunity.id, memberId);

		const saved = await memberRepo().findOne({ where: { id: memberId } });
		expect(saved?.photoUrl).toBeNull();
		expect(saved?.photoS3Key).toBeNull();
	});

	it('rechaza un miembro de otra comunidad (cross-tenant guard)', async () => {
		const { memberId } = await addMember();
		const otherCommunity = await TestDataFactory.createTestCommunity(testUser.id);

		await expect(
			service.setMemberPhoto(otherCommunity.id, memberId, PNG_DATA_URI),
		).rejects.toThrow('Member not found in this community');
	});

	it('NO escribe la foto en el Participant', async () => {
		// El Participant es identidad global: una comunidad no la toca, igual que
		// con el nombre, el correo y el cumpleaños.
		const { memberId, participantId } = await addMember();
		await service.setMemberPhoto(testCommunity.id, memberId, PNG_DATA_URI);

		const participant: any = await participantRepo().findOne({ where: { id: participantId } });
		expect(participant.photoUrl).toBeUndefined();
	});

	describe('exposición al cliente', () => {
		it('la key de S3 nunca viaja en el listado', async () => {
			const { memberId } = await addMember();
			await service.setMemberPhoto(testCommunity.id, memberId, PNG_DATA_URI);
			await memberRepo().update(memberId, { photoS3Key: 'community-members/fake.webp' });

			const members = await service.getMembersForViewer(testCommunity.id, {
				userId: testUser.id,
				isSuperadmin: false,
			});
			expect((members[0] as any).photoUrl).toBeTruthy();
			expect((members[0] as any).photoS3Key).toBeUndefined();
		});

		it('un admin no-owner SÍ ve la foto (sirve para reconocer, no es dato reservado)', async () => {
			const { memberId } = await addMember();
			await service.setMemberPhoto(testCommunity.id, memberId, PNG_DATA_URI);

			const adminUser = await TestDataFactory.createTestUser({
				email: `photo-admin-${Date.now()}@test.com`,
			});
			const adminRepo = AppDataSource.getRepository(CommunityAdmin);
			await adminRepo.save(
				adminRepo.create({
					communityId: testCommunity.id,
					userId: adminUser.id,
					role: 'admin',
					status: 'active',
					invitedBy: testUser.id,
					invitedAt: new Date(),
					acceptedAt: new Date(),
				}),
			);

			const members = await service.getMembersForViewer(testCommunity.id, {
				userId: adminUser.id,
				isSuperadmin: false,
			});
			expect((members[0] as any).photoUrl).toBeTruthy();
		});
	});

	describe('derecho de eliminación', () => {
		it('anonimizar al participante borra su foto de la comunidad', async () => {
			// Sin esto, la persona pide que borren sus datos y su cara sigue
			// guardada en community_member (y en S3).
			const { memberId, participantId } = await addMember();
			await service.setMemberPhoto(testCommunity.id, memberId, PNG_DATA_URI);

			const token = 'test-delete-token-' + Date.now();
			await participantRepo().update(participantId, { dataDeleteToken: token } as any);

			const ok = await anonymizeParticipantByToken(token);
			expect(ok).toBe(true);

			const member = await memberRepo().findOne({ where: { id: memberId } });
			expect(member?.photoUrl).toBeNull();
			expect(member?.photoS3Key).toBeNull();
		});
	});
});
