import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Community } from '@/entities/community.entity';
import { Retreat } from '@/entities/retreat.entity';
import { CommunityService } from '@/services/communityService';
import { AppDataSource } from '@/data-source';
import { Participant } from '@/entities/participant.entity';
import { CommunityMember } from '@/entities/communityMember.entity';

// Mock EmailService — algunos flujos disparan notify*; los silenciamos.
jest.mock('@/services/emailService', () => ({
	EmailService: jest.fn(() => ({
		sendEmail: jest.fn(async () => true),
		isSmtpConfigured: jest.fn().mockReturnValue(true),
	})),
}));

describe('CommunityService.bulkAddMembers', () => {
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

	it('crea nuevos Participant + Member cuando no existen previamente', async () => {
		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Juan', lastName: 'Pérez', email: 'juan@example.com', cellPhone: '5512345678' },
			{ firstName: 'María', lastName: 'López', email: 'maria@example.com' },
		]);

		expect(result.added).toHaveLength(2);
		expect(result.linked).toHaveLength(0);
		expect(result.skipped).toHaveLength(0);
		expect(result.rejected).toHaveLength(0);

		const members = await AppDataSource.getRepository(CommunityMember).find({
			where: { communityId: testCommunity.id },
		});
		expect(members).toHaveLength(2);
		expect(members.every((m) => m.state === 'pending_verification')).toBe(true);
	});

	it('vincula Participant existente sin duplicar identidad cuando coincide email', async () => {
		const existing = await TestDataFactory.createTestParticipant(testRetreat.id, {
			email: 'reused@example.com',
		});

		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Reused', lastName: 'Person', email: 'reused@example.com' },
		]);

		expect(result.added).toHaveLength(0);
		expect(result.linked).toHaveLength(1);
		expect(result.skipped).toHaveLength(0);

		// El Participant NO se duplica.
		const participants = await AppDataSource.getRepository(Participant).find({
			where: { email: 'reused@example.com' },
		});
		expect(participants).toHaveLength(1);
		expect(participants[0].id).toBe(existing.id);

		// El CommunityMember sí se creó.
		const members = await AppDataSource.getRepository(CommunityMember).find({
			where: { communityId: testCommunity.id, participantId: existing.id },
		});
		expect(members).toHaveLength(1);
	});

	it('vincula Participant existente por teléfono cuando el email no coincide', async () => {
		const existing = await TestDataFactory.createTestParticipant(testRetreat.id, {
			email: 'other@example.com',
			cellPhone: '5587654321',
		});

		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Phone', lastName: 'Match', cellPhone: '+52 55 8765 4321' },
		]);

		expect(result.linked).toHaveLength(1);
		expect(result.added).toHaveLength(0);

		const participants = await AppDataSource.getRepository(Participant).find({
			where: { cellPhone: '5587654321' },
		});
		expect(participants).toHaveLength(1);
		expect(participants[0].id).toBe(existing.id);
	});

	it('omite la entrada cuando ya es miembro de la comunidad', async () => {
		const existing = await TestDataFactory.createTestParticipant(testRetreat.id, {
			email: 'already@example.com',
		});
		await TestDataFactory.createTestCommunityMember(testCommunity.id, existing.id);

		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Already', lastName: 'Member', email: 'already@example.com' },
		]);

		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0].reason).toBe('already_member');
		expect(result.added).toHaveLength(0);
		expect(result.linked).toHaveLength(0);
	});

	it('rechaza entradas sin nombre o sin email/teléfono y reporta missingFields', async () => {
		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Solo', lastName: 'Nombre' },
			{ firstName: '', lastName: 'Apellido', email: 'incomplete@example.com' },
			{ firstName: 'Sin', lastName: '', cellPhone: '5500000000' },
		]);

		expect(result.rejected).toHaveLength(3);
		expect(result.rejected[0].missingFields).toContain('email_or_cellPhone');
		expect(result.rejected[1].missingFields).toContain('firstName');
		expect(result.rejected[2].missingFields).toContain('lastName');
		expect(result.added).toHaveLength(0);
	});

	it('deduplica dentro del mismo lote (mismo email aparece dos veces)', async () => {
		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'First', lastName: 'Time', email: 'dup@example.com' },
			{ firstName: 'Second', lastName: 'Time', email: 'dup@example.com' },
		]);

		expect(result.added).toHaveLength(1);
		expect(result.skipped).toHaveLength(1);
		expect(result.skipped[0].reason).toBe('already_member');
	});

	it('normaliza email a lowercase y trim para el matching', async () => {
		const existing = await TestDataFactory.createTestParticipant(testRetreat.id, {
			email: 'mixedcase@example.com',
		});

		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Mixed', lastName: 'Case', email: '  MIXEDCase@Example.com  ' },
		]);

		expect(result.linked).toHaveLength(1);
		expect(result.added).toHaveLength(0);

		const participants = await AppDataSource.getRepository(Participant).find({
			where: { email: 'mixedcase@example.com' },
		});
		expect(participants).toHaveLength(1);
		expect(participants[0].id).toBe(existing.id);
	});

	it('aplica el state pasado al crear miembros nuevos', async () => {
		const result = await service.bulkAddMembers(
			testCommunity.id,
			[{ firstName: 'Active', lastName: 'Now', email: 'active@example.com' }],
			'active_member',
		);

		expect(result.added).toHaveLength(1);

		const members = await AppDataSource.getRepository(CommunityMember).find({
			where: { communityId: testCommunity.id },
		});
		expect(members).toHaveLength(1);
		expect(members[0].state).toBe('active_member');
	});

	it('crea Participant con email placeholder cuando solo hay teléfono', async () => {
		const result = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Only', lastName: 'Phone', cellPhone: '5500001111' },
		]);

		expect(result.added).toHaveLength(1);

		const participants = await AppDataSource.getRepository(Participant).find({
			where: { cellPhone: '5500001111' },
		});
		expect(participants).toHaveLength(1);
		expect(participants[0].email).toContain('placeholder.local');

		// Una segunda llamada con el mismo teléfono debe deduplicar vía phone lookup.
		const result2 = await service.bulkAddMembers(testCommunity.id, [
			{ firstName: 'Only', lastName: 'Phone', cellPhone: '5500001111' },
		]);
		expect(result2.skipped).toHaveLength(1);
		expect(result2.skipped[0].reason).toBe('already_member');
	});
});
