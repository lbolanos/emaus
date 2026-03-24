import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { Role } from '@/entities/role.entity';
import { UserRole } from '@/entities/userRole.entity';
import { passport, configurePassportStrategies } from '@/services/authService';
import * as authController from '@/controllers/authController';
import { v4 as uuidv4 } from 'uuid';

// Mock RecaptchaService
jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: jest.fn().mockImplementation(() => ({
		verifyToken: jest.fn().mockResolvedValue({ valid: true }),
	})),
}));

// Mock UserService
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

const getTestDataSource = () => TestDataFactory['testDataSource'];

const createMockRequest = (overrides: any = {}) => ({
	params: {},
	body: {},
	query: {},
	user: null,
	headers: {},
	protocol: 'http',
	logIn: jest.fn((user: any, callback: any) => callback(null)),
	logout: jest.fn((callback: any) => callback(null)),
	session: {
		destroy: jest.fn((callback: any) => callback(null)),
		regenerate: jest.fn((callback: any) => callback(null)),
		csrfToken: 'test-csrf-token',
	},
	isAuthenticated: () => false,
	...overrides,
});

const createMockResponse = () => {
	const res: any = {
		status: jest.fn().mockReturnThis(),
		json: jest.fn().mockReturnThis(),
		send: jest.fn().mockReturnThis(),
		setHeader: jest.fn().mockReturnThis(),
		clearCookie: jest.fn().mockReturnThis(),
		redirect: jest.fn(),
		get: jest.fn().mockReturnThis(),
	};
	return res;
};

const mockNext = jest.fn();

/**
 * Email Normalization Tests
 *
 * Verifies that email lookups across the auth system are case-insensitive,
 * handling pre-migration data where emails may have mixed casing.
 */
describe('Email Normalization - Case-Insensitive Lookups', () => {
	let mixedCaseUser: User;
	let testRole: Role;

	beforeAll(async () => {
		await setupTestDatabase();

		// Reconfigure passport strategies with test database
		configurePassportStrategies(passport, getTestDataSource());

		// Create regular role
		const roleRepository = getTestDataSource().getRepository(Role);
		testRole = roleRepository.create({
			name: 'regular',
			description: 'Regular user role',
		});
		await roleRepository.save(testRole);
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();

		// Create a user with MIXED CASE email (simulates pre-migration data)
		const userRepository = getTestDataSource().getRepository(User);
		mixedCaseUser = userRepository.create({
			id: uuidv4(),
			email: 'Luis@MexicanLawyers.MX',
			displayName: 'Luis Test',
			password: 'password123', // Entity's @BeforeInsert will hash this
			isPending: false,
		});
		await userRepository.save(mixedCaseUser);

		jest.clearAllMocks();
	});

	describe('Local Strategy - Login', () => {
		test('should authenticate with lowercase email when stored as mixed case', (done) => {
			passport.authenticate(
				'local',
				{ session: false },
				(err: any, user: any, info: any) => {
					expect(err).toBeNull();
					expect(user).toBeTruthy();
					expect(user.email).toBe('Luis@MexicanLawyers.MX');
					done();
				},
			)({ body: { email: 'luis@mexicanlawyers.mx', password: 'password123' } });
		});

		test('should authenticate with UPPERCASE email when stored as mixed case', (done) => {
			passport.authenticate(
				'local',
				{ session: false },
				(err: any, user: any, info: any) => {
					expect(err).toBeNull();
					expect(user).toBeTruthy();
					expect(user.email).toBe('Luis@MexicanLawyers.MX');
					done();
				},
			)({ body: { email: 'LUIS@MEXICANLAWYERS.MX', password: 'password123' } });
		});

		test('should authenticate with exact case email', (done) => {
			passport.authenticate(
				'local',
				{ session: false },
				(err: any, user: any, info: any) => {
					expect(err).toBeNull();
					expect(user).toBeTruthy();
					done();
				},
			)({ body: { email: 'Luis@MexicanLawyers.MX', password: 'password123' } });
		});

		test('should reject with wrong password regardless of email case', (done) => {
			passport.authenticate(
				'local',
				{ session: false },
				(err: any, user: any, info: any) => {
					expect(err).toBeNull();
					expect(user).toBe(false);
					expect(info?.message).toBe('Incorrect email or password.');
					done();
				},
			)({ body: { email: 'luis@mexicanlawyers.mx', password: 'wrongpassword' } });
		});

		test('should authenticate with email containing spaces (trimmed)', (done) => {
			passport.authenticate(
				'local',
				{ session: false },
				(err: any, user: any, info: any) => {
					expect(err).toBeNull();
					expect(user).toBeTruthy();
					done();
				},
			)({ body: { email: '  luis@mexicanlawyers.mx  ', password: 'password123' } });
		});
	});

	describe('Register - Duplicate Detection', () => {
		test('should detect existing user when registering with lowercase version of mixed-case email', async () => {
			const req = createMockRequest({
				body: {
					email: 'luis@mexicanlawyers.mx',
					password: 'newpassword123',
					displayName: 'Another Luis',
				},
			});
			const res = createMockResponse();

			await authController.register(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'No se pudo completar el registro. Verifica los datos ingresados.',
			});
		});

		test('should detect existing user when registering with UPPERCASE version', async () => {
			const req = createMockRequest({
				body: {
					email: 'LUIS@MEXICANLAWYERS.MX',
					password: 'newpassword123',
					displayName: 'Another Luis',
				},
			});
			const res = createMockResponse();

			await authController.register(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
		});

		test('should allow registration with a truly new email', async () => {
			const req = createMockRequest({
				body: {
					email: 'newuser@example.com',
					password: 'password123',
					displayName: 'New User',
				},
			});
			const res = createMockResponse();

			await authController.register(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith({ message: 'Usuario creado exitosamente.' });
		});

		test('should store new user email in lowercase', async () => {
			const req = createMockRequest({
				body: {
					email: 'NewUser@Example.COM',
					password: 'password123',
					displayName: 'New User',
				},
			});
			const res = createMockResponse();

			await authController.register(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(201);

			// Verify the email was stored in lowercase (Zod schema normalizes it)
			const userRepository = getTestDataSource().getRepository(User);
			const savedUser = await userRepository
				.createQueryBuilder('user')
				.where('LOWER(user.email) = :email', { email: 'newuser@example.com' })
				.getOne();
			expect(savedUser).toBeTruthy();
			expect(savedUser!.email).toBe('newuser@example.com');
		});
	});

	describe('Password Reset - Case-Insensitive Lookup', () => {
		test('should find user with lowercase email when stored as mixed case', async () => {
			const req = createMockRequest({
				body: {
					email: 'luis@mexicanlawyers.mx',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();

			await authController.requestPasswordReset(req, res, mockNext);

			expect(res.json).toHaveBeenCalledWith({
				message:
					'Si existe un usuario con ese correo, se ha enviado un enlace para restablecer la contraseña.',
			});

			// Verify that a reset token was actually set (user was found)
			const userRepository = getTestDataSource().getRepository(User);
			const user = await userRepository
				.createQueryBuilder('user')
				.where('LOWER(user.email) = :email', { email: 'luis@mexicanlawyers.mx' })
				.getOne();
			expect(user).toBeTruthy();
			expect(user!.passwordResetToken).toBeTruthy();
		});

		test('should find user with UPPERCASE email when stored as mixed case', async () => {
			const req = createMockRequest({
				body: {
					email: 'LUIS@MEXICANLAWYERS.MX',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();

			await authController.requestPasswordReset(req, res, mockNext);

			// Verify token was set
			const userRepository = getTestDataSource().getRepository(User);
			const user = await userRepository
				.createQueryBuilder('user')
				.where('LOWER(user.email) = :email', { email: 'luis@mexicanlawyers.mx' })
				.getOne();
			expect(user).toBeTruthy();
			expect(user!.passwordResetToken).toBeTruthy();
		});

		test('should handle missing/null email gracefully', async () => {
			const req = createMockRequest({
				body: {
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();

			await authController.requestPasswordReset(req, res, mockNext);

			// Should return the same anti-enumeration message, not crash
			expect(res.json).toHaveBeenCalledWith({
				message:
					'Si existe un usuario con ese correo, se ha enviado un enlace para restablecer la contraseña.',
			});
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe('Reset Password - Input Validation', () => {
		test('should return 400 when token is missing', async () => {
			const req = createMockRequest({
				body: {
					password: 'newpassword123',
				},
			});
			const res = createMockResponse();

			await authController.resetPassword(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'Token de restablecimiento inválido o expirado.',
			});
			expect(mockNext).not.toHaveBeenCalled();
		});

		test('should return 400 when password is missing', async () => {
			const req = createMockRequest({
				body: {
					token: 'some-token',
				},
			});
			const res = createMockResponse();

			await authController.resetPassword(req, res, mockNext);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(mockNext).not.toHaveBeenCalled();
		});
	});

	describe('Register - Race Condition Handling', () => {
		test('concurrent register calls with same email should not return 500', async () => {
			const makeReq = () =>
				createMockRequest({
					body: {
						email: 'concurrent@example.com',
						password: 'password123',
						displayName: 'Concurrent User',
					},
				});

			const res1 = createMockResponse();
			const res2 = createMockResponse();
			const next1 = jest.fn();
			const next2 = jest.fn();

			// Run both registrations concurrently
			await Promise.all([
				authController.register(makeReq(), res1, next1),
				authController.register(makeReq(), res2, next2),
			]);

			// One should succeed (201), the other should get 400 (not 500)
			const statuses = [
				res1.status.mock.calls[0]?.[0],
				res2.status.mock.calls[0]?.[0],
			].sort();

			// Both next() should NOT have been called (no unhandled errors)
			expect(next1).not.toHaveBeenCalled();
			expect(next2).not.toHaveBeenCalled();

			// No 500s — both should be controlled responses (201 or 400)
			for (const s of statuses) {
				expect([201, 400]).toContain(s);
			}
			// At least one must have succeeded or both got a clean 400
			expect(statuses.every((s: number) => s !== 500)).toBe(true);
		});
	});
});
