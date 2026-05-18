import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { AppDataSource } from '@/data-source';
import { CommunityAttendance } from '@/entities/communityAttendance.entity';

jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

describe('CommunityService.bulkRecordAttendance', () => {
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
		testRetreat = await TestDataFactory.createTestRetreat();
	});

	async function setupCommunityWithMembers() {
		const meeting = await TestDataFactory.createTestCommunityMeeting(testCommunity.id);
		const p1 = await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Juan',
			lastName: 'Pérez',
			email: 'juan@example.com',
			cellPhone: '5512345678',
		});
		const p2 = await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'María',
			lastName: 'López',
			email: 'maria@example.com',
			cellPhone: '5599998888',
		});
		const p3 = await TestDataFactory.createTestParticipant(testRetreat.id, {
			firstName: 'Juan',
			lastName: 'Gómez',
			email: 'juangomez@example.com',
			cellPhone: '5511112222',
		});
		const m1 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p1.id);
		const m2 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p2.id);
		const m3 = await TestDataFactory.createTestCommunityMember(testCommunity.id, p3.id);
		return { meeting, m1, m2, m3, p1, p2, p3 };
	}

	it('marca asistencia por nombre completo', async () => {
		const { meeting, m1, m2 } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(testCommunity.id, meeting.id, [
			{ name: 'Juan Pérez' },
			{ name: 'María López' },
		]);

		expect(result.marked).toHaveLength(2);
		expect(result.marked.map((x) => x.memberId).sort()).toEqual([m1.id, m2.id].sort());
		expect(result.notFound).toHaveLength(0);
		expect(result.ambiguous).toHaveLength(0);

		const attendances = await AppDataSource.getRepository(CommunityAttendance).find({
			where: { meetingId: meeting.id },
		});
		expect(attendances).toHaveLength(2);
		expect(attendances.every((a) => a.attended)).toBe(true);
	});

	it('marca asistencia por email', async () => {
		const { meeting, m1 } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(testCommunity.id, meeting.id, [
			{ email: 'juan@example.com' },
		]);

		expect(result.marked).toHaveLength(1);
		expect(result.marked[0].memberId).toBe(m1.id);
	});

	it('marca asistencia por teléfono con prefijo internacional', async () => {
		const { meeting, m2 } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(testCommunity.id, meeting.id, [
			{ cellPhone: '+52 55 9999 8888' },
		]);

		expect(result.marked).toHaveLength(1);
		expect(result.marked[0].memberId).toBe(m2.id);
	});

	it('reporta ambiguous cuando varios miembros matchean el nombre', async () => {
		const { meeting, m1, m3 } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(testCommunity.id, meeting.id, [
			{ name: 'Juan' },
		]);

		expect(result.marked).toHaveLength(0);
		expect(result.ambiguous).toHaveLength(1);
		const ids = result.ambiguous[0].matches.map((x) => x.memberId).sort();
		expect(ids).toEqual([m1.id, m3.id].sort());
	});

	it('reporta notFound cuando la persona no es miembro de la comunidad', async () => {
		const { meeting } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(testCommunity.id, meeting.id, [
			{ name: 'Persona Inexistente' },
			{ email: 'desconocido@example.com' },
		]);

		expect(result.marked).toHaveLength(0);
		expect(result.notFound).toHaveLength(2);
		expect(result.notFound.every((x) => x.reason === 'not_a_member')).toBe(true);
	});

	it('upsert acumulativo: llamadas sucesivas NO borran marcas previas', async () => {
		const { meeting, m1, m2 } = await setupCommunityWithMembers();

		await service.bulkRecordAttendance(testCommunity.id, meeting.id, [{ name: 'Juan Pérez' }]);
		await service.bulkRecordAttendance(testCommunity.id, meeting.id, [{ name: 'María López' }]);

		const attendances = await AppDataSource.getRepository(CommunityAttendance).find({
			where: { meetingId: meeting.id },
		});
		expect(attendances).toHaveLength(2);
		const ids = attendances.map((a) => a.memberId).sort();
		expect(ids).toEqual([m1.id, m2.id].sort());
	});

	it('acepta memberId directo cuando viene', async () => {
		const { meeting, m1 } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(testCommunity.id, meeting.id, [
			{ memberId: m1.id },
		]);

		expect(result.marked).toHaveLength(1);
		expect(result.marked[0].memberId).toBe(m1.id);
	});

	it('respeta attended=false para marcar como ausente', async () => {
		const { meeting, m1 } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(
			testCommunity.id,
			meeting.id,
			[{ name: 'Juan Pérez' }],
			false,
		);

		expect(result.marked).toHaveLength(1);

		const attendances = await AppDataSource.getRepository(CommunityAttendance).find({
			where: { meetingId: meeting.id, memberId: m1.id },
		});
		expect(attendances).toHaveLength(1);
		expect(attendances[0].attended).toBe(false);
	});

	it('match de nombre es case-insensitive y tolerante a acentos', async () => {
		const { meeting, m2 } = await setupCommunityWithMembers();

		const result = await service.bulkRecordAttendance(testCommunity.id, meeting.id, [
			{ name: 'maria lopez' },
		]);

		expect(result.marked).toHaveLength(1);
		expect(result.marked[0].memberId).toBe(m2.id);
	});
});
