import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityMember } from '@/entities/communityMember.entity';
import { CommunityService } from '@/services/communityService';
import { AddCommunityMemberSourceRetreat20261022100000 } from '@/migrations/sqlite/20261022100000_AddCommunityMemberSourceRetreat';

jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

describe('Retiro de origen del miembro de comunidad', () => {
	let community: Community;
	let retreat: Retreat;
	let otherRetreat: Retreat;
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
		const user = await TestDataFactory.createTestUser();
		community = await TestDataFactory.createTestCommunity(user.id);
		retreat = await TestDataFactory.createTestRetreat({ parish: 'Buen Despacho' });
		otherRetreat = await TestDataFactory.createTestRetreat({ parish: 'San Agustín' });
	});

	const memberRepo = () => TestDataFactory.getDataSource().getRepository(CommunityMember);

	// One phone per community member is enforced, and the factory default is shared.
	let phoneSeq = 0;
	const mkParticipant = (retreatId: string) =>
		TestDataFactory.createTestParticipant(retreatId, {
			cellPhone: `5533${String(Date.now() % 100_000).padStart(5, '0')}${phoneSeq++ % 10}`,
			email: `source-retreat-${Date.now()}-${phoneSeq}@example.com`,
		});

	it('el import desde retiro guarda el retiro de origen', async () => {
		const p = await mkParticipant(retreat.id);

		await service.importFromRetreat(community.id, retreat.id, [p.id]);

		const saved = await memberRepo().findOneOrFail({ where: { participantId: p.id } });
		expect(saved.sourceRetreatId).toBe(retreat.id);
	});

	it('no etiqueta con un retiro en cuyo roster no está la persona', async () => {
		const p = await mkParticipant(otherRetreat.id);

		await service.importFromRetreat(community.id, retreat.id, [p.id]);

		const saved = await memberRepo().findOneOrFail({ where: { participantId: p.id } });
		expect(saved.sourceRetreatId).toBeNull();
	});

	it('getMembers devuelve solo id, parroquia y fecha del retiro, y null sin retiro', async () => {
		const imported = await mkParticipant(retreat.id);
		const manual = await mkParticipant(otherRetreat.id);
		await service.importFromRetreat(community.id, retreat.id, [imported.id]);
		await service.addMember(community.id, manual.id);

		const members = await service.getMembers(community.id);
		const byParticipant = new Map(members.map((m: any) => [m.participantId, m]));

		const source = byParticipant.get(imported.id)!.sourceRetreat;
		expect(Object.keys(source).sort()).toEqual(['id', 'parish', 'startDate']);
		expect(source).toMatchObject({ id: retreat.id, parish: 'Buen Despacho' });
		expect(byParticipant.get(manual.id)!.sourceRetreat).toBeNull();
	});

	it('la migración rellena a los miembros existentes con el retiro principal de su ficha', async () => {
		const fromRetreat = await mkParticipant(retreat.id);
		const created = await service.addMember(community.id, fromRetreat.id);
		const withoutRetreat = await TestDataFactory.createTestParticipant(retreat.id, {
			cellPhone: '5544000001',
			email: `no-retreat-${Date.now()}@example.com`,
		});
		await TestDataFactory.getDataSource().query(
			`UPDATE participants SET retreatId = NULL WHERE id = ?`,
			[withoutRetreat.id],
		);
		await service.addMember(community.id, withoutRetreat.id);

		const qr = TestDataFactory.getDataSource().createQueryRunner();
		try {
			await new AddCommunityMemberSourceRetreat20261022100000().up(qr);
		} finally {
			await qr.release();
		}

		const backfilled = await memberRepo().findOneOrFail({ where: { id: (created as any).id } });
		expect(backfilled.sourceRetreatId).toBe(retreat.id);
		const untouched = await memberRepo().findOneOrFail({
			where: { participantId: withoutRetreat.id },
		});
		expect(untouched.sourceRetreatId).toBeNull();
	});
});
