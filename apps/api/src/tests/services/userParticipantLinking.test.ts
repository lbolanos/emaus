import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Participant } from '@/entities/participant.entity';
import { RetreatParticipant } from '@/entities/retreatParticipant.entity';
import { Retreat } from '@/entities/retreat.entity';
import { House } from '@/entities/house.entity';
import { Role } from '@/entities/role.entity';
import * as authController from '@/controllers/authController';
import { v4 as uuidv4 } from 'uuid';

// Mock RecaptchaService — registration validates a token before linking
jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: jest.fn().mockImplementation(() => ({
		verifyToken: jest.fn().mockResolvedValue({ valid: true }),
	})),
}));

// Mock UserService (loaded by authController)
jest.mock('../../services/userService', () => ({
	UserService: jest.fn().mockImplementation(() => ({
		getUserProfile: jest.fn().mockResolvedValue({ id: 'test-id', retreats: [] }),
	})),
}));

// Mock GlobalMessageTemplateService
jest.mock('../../services/globalMessageTemplateService', () => ({
	GlobalMessageTemplateService: jest.fn().mockImplementation(() => ({
		sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
	})),
}));

const getDS = () => TestDataFactory['testDataSource'];

const mockReq = (overrides: any = {}) => ({
	params: {},
	body: {},
	query: {},
	user: null,
	headers: {},
	protocol: 'http',
	logIn: jest.fn((_u: any, cb: any) => cb(null)),
	session: { csrfToken: 'test' },
	isAuthenticated: () => false,
	...overrides,
});

const mockRes = () => {
	const res: any = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
		send: jest.fn().mockReturnThis(),
	};
	return res;
};

const mockNext = jest.fn();

/**
 * Helpers to seed the in-memory DB with the bare minimum needed to
 * exercise the user/participant linking code paths.
 */
async function seedHouseAndRetreat(): Promise<{ house: House; retreatA: Retreat; retreatB: Retreat }> {
	const houseRepo = getDS().getRepository(House);
	const retreatRepo = getDS().getRepository(Retreat);

	const house = houseRepo.create({
		id: uuidv4(),
		name: 'Casa Test',
		address1: 'Calle Test 123',
		city: 'CDMX',
		state: 'CDMX',
		zipCode: '01000',
		country: 'MX',
		capacity: 50,
	} as any);
	await houseRepo.save(house);

	const retreatA = retreatRepo.create({
		id: uuidv4(),
		parish: 'San Judas Tadeo',
		startDate: new Date('2026-04-17'),
		endDate: new Date('2026-04-19'),
		houseId: (house as any).id,
		max_walkers: 30,
		max_servers: 20,
	} as any);
	await retreatRepo.save(retreatA);

	const retreatB = retreatRepo.create({
		id: uuidv4(),
		parish: 'La Esperanza de María',
		startDate: new Date('2026-02-20'),
		endDate: new Date('2026-02-22'),
		houseId: (house as any).id,
		max_walkers: 30,
		max_servers: 20,
	} as any);
	await retreatRepo.save(retreatB);

	return { house: house as any, retreatA: retreatA as any, retreatB: retreatB as any };
}

async function seedParticipant(
	email: string,
	retreatId: string,
	overrides: Partial<Participant> = {},
): Promise<Participant> {
	const repo = getDS().getRepository(Participant);
	const p = repo.create({
		id: uuidv4(),
		firstName: 'Test',
		lastName: 'User',
		nickname: 'Test',
		birthDate: new Date('1990-01-01'),
		maritalStatus: 'S',
		street: 'X',
		houseNumber: '1',
		postalCode: '00000',
		neighborhood: 'X',
		city: 'X',
		state: 'X',
		country: 'MX',
		cellPhone: '5555555555',
		email,
		occupation: 'X',
		snores: false,
		hasMedication: false,
		hasDietaryRestrictions: false,
		sacraments: ['baptism'],
		emergencyContact1Name: 'X',
		emergencyContact1Relation: 'X',
		emergencyContact1CellPhone: '5555555555',
		retreatId,
		registrationDate: new Date(),
		lastUpdatedDate: new Date(),
		...overrides,
	} as any);
	return await repo.save(p);
}

async function seedRetreatParticipant(
	participantId: string,
	retreatId: string,
	userId: string | null = null,
): Promise<RetreatParticipant> {
	const repo = getDS().getRepository(RetreatParticipant);
	const rp = repo.create({
		id: uuidv4(),
		participantId,
		retreatId,
		userId: userId ?? undefined,
		roleInRetreat: 'server',
		type: 'server',
		isPrimaryRetreat: false,
		isCancelled: false,
		createdAt: new Date(),
	} as any);
	return await repo.save(rp);
}

/**
 * Tests for the user ↔ participant linking logic.
 *
 * These cover the regression where a registered user could not see their
 * historical retreats because the participants/retreat_participants rows
 * predated the user account and were never linked.
 */
describe('User ↔ Participant linking', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Best-effort wipe of the roles table (table name varies by version)
		try {
			await getDS().query('DELETE FROM roles;');
		} catch {
			/* fallback to singular */
		}
		const roleRepo = getDS().getRepository(Role);
		const existing = await roleRepo.findOne({ where: { name: 'regular' } });
		if (!existing) {
			const role = roleRepo.create({ name: 'regular', description: 'Regular' } as any);
			await roleRepo.save(role);
		}
		jest.clearAllMocks();
	});

	describe('register controller — backfill on signup', () => {
		test('links a brand-new user to all pre-existing participants with the same email', async () => {
			const { retreatA, retreatB } = await seedHouseAndRetreat();
			const email = 'leonardo@example.com';

			// Two historical participant rows for two different retreats
			const pA = await seedParticipant(email, retreatA.id);
			const pB = await seedParticipant(email, retreatB.id);
			const rpA = await seedRetreatParticipant(pA.id, retreatA.id);
			const rpB = await seedRetreatParticipant(pB.id, retreatB.id);

			const req = mockReq({
				body: {
					email,
					password: 'password123',
					displayName: 'Leonardo',
					recaptchaToken: 'valid',
				},
			});
			const res = mockRes();

			await authController.register(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);

			const userRepo = getDS().getRepository(User);
			const newUser = await userRepo
				.createQueryBuilder('u')
				.where('LOWER(u.email) = :email', { email })
				.getOne();
			expect(newUser).toBeTruthy();
			// User must be linked to one of the participants (most recent)
			expect(newUser!.participantId).toBeTruthy();
			expect([pA.id, pB.id]).toContain(newUser!.participantId);

			// ALL matching participant rows must be stamped with the new userId
			const partRepo = getDS().getRepository(Participant);
			const refreshedA = await partRepo.findOne({ where: { id: pA.id } });
			const refreshedB = await partRepo.findOne({ where: { id: pB.id } });
			expect(refreshedA!.userId).toBe(newUser!.id);
			expect(refreshedB!.userId).toBe(newUser!.id);

			// All retreat_participants rows must be stamped too — this is what
			// /history/my-retreats actually queries.
			const rpRepo = getDS().getRepository(RetreatParticipant);
			const refreshedRpA = await rpRepo.findOne({ where: { id: rpA.id } });
			const refreshedRpB = await rpRepo.findOne({ where: { id: rpB.id } });
			expect(refreshedRpA!.userId).toBe(newUser!.id);
			expect(refreshedRpB!.userId).toBe(newUser!.id);
		});

		test('does not overwrite an existing userId on a participant', async () => {
			const { retreatA } = await seedHouseAndRetreat();
			const email = 'taken@example.com';

			// Pre-existing user already linked to this participant
			const userRepo = getDS().getRepository(User);
			const otherUser = userRepo.create({
				id: uuidv4(),
				email: 'other@example.com',
				displayName: 'Other',
				password: 'password123',
				isPending: false,
			} as any);
			await userRepo.save(otherUser);

			const p = await seedParticipant(email, retreatA.id, { userId: (otherUser as any).id } as any);

			// Now a different user registers with the same email
			const req = mockReq({
				body: {
					email,
					password: 'password123',
					displayName: 'New Person',
					recaptchaToken: 'valid',
				},
			});
			const res = mockRes();

			await authController.register(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);

			// The participant.userId should NOT have been overwritten
			const partRepo = getDS().getRepository(Participant);
			const refreshed = await partRepo.findOne({ where: { id: p.id } });
			expect(refreshed!.userId).toBe((otherUser as any).id);
		});

		test('register succeeds even when no matching participant exists', async () => {
			const req = mockReq({
				body: {
					email: 'nobody@example.com',
					password: 'password123',
					displayName: 'Nobody',
					recaptchaToken: 'valid',
				},
			});
			const res = mockRes();

			await authController.register(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);

			const userRepo = getDS().getRepository(User);
			const newUser = await userRepo
				.createQueryBuilder('u')
				.where('u.email = :email', { email: 'nobody@example.com' })
				.getOne();
			expect(newUser).toBeTruthy();
			expect(newUser!.participantId).toBeFalsy();
		});

		test('email matching is case-insensitive when linking participants', async () => {
			const { retreatA } = await seedHouseAndRetreat();

			// Participant stored with one casing
			const p = await seedParticipant('Mixed@Case.com', retreatA.id);
			const rp = await seedRetreatParticipant(p.id, retreatA.id);

			// User registers with a different casing
			const req = mockReq({
				body: {
					email: 'mixed@case.com',
					password: 'password123',
					displayName: 'Mixed',
					recaptchaToken: 'valid',
				},
			});
			const res = mockRes();

			await authController.register(req, res, mockNext);
			expect(res.status).toHaveBeenCalledWith(201);

			const userRepo = getDS().getRepository(User);
			const newUser = await userRepo
				.createQueryBuilder('u')
				.where('LOWER(u.email) = :email', { email: 'mixed@case.com' })
				.getOne();
			expect(newUser).toBeTruthy();
			expect(newUser!.participantId).toBe(p.id);

			const rpRepo = getDS().getRepository(RetreatParticipant);
			const refreshedRp = await rpRepo.findOne({ where: { id: rp.id } });
			expect(refreshedRp!.userId).toBe(newUser!.id);
		});
	});
});
