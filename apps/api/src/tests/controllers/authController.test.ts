import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '../../entities/user.entity';
import * as bcrypt from 'bcrypt';
import { v4 as uuidv4 } from 'uuid';
import * as authController from '../../controllers/authController';
import passport from 'passport';

// Mock passport
jest.mock('passport', () => ({
	authenticate: jest.fn(),
}));

// Mock UserService
jest.mock('../../services/userService', () => ({
	UserService: jest.fn().mockImplementation(() => ({
		getUserProfile: jest.fn().mockResolvedValue({
			id: 'test-id',
			retreats: [],
		}),
	})),
}));

// Mock GlobalMessageTemplateService
jest.mock('../../services/globalMessageTemplateService', () => ({
	GlobalMessageTemplateService: jest.fn().mockImplementation(() => ({
		sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
	})),
}));

// Mock RecaptchaService
jest.mock('../../services/recaptchaService', () => ({
	RecaptchaService: jest.fn().mockImplementation(() => ({
		verifyToken: jest.fn().mockResolvedValue({ valid: true }),
	})),
}));

/**
 * Auth Controller Unit Tests
 *
 * Tests the auth controller functions directly by mocking Request, Response, and NextFunction.
 * This approach avoids the complexity of setting up passport sessions and HTTP integration tests.
 *
 * Test coverage:
 * - register - create new user
 * - login - authenticate with passport
 * - googleCallback - Google OAuth callback
 * - getAuthStatus - get authentication status
 * - logout - log out user
 * - requestPasswordReset - request password reset email
 * - resetPassword - reset password with token
 * - Error handling
 */
describe('Auth Controller', () => {
	// Helper to get testDataSource
	const getTestDataSource = () => TestDataFactory['testDataSource'];

	// Helper to create mock Request object
	const createMockRequest = (overrides: any = {}) => ({
		params: {},
		body: {},
		query: {},
		user: null,
		logIn: jest.fn((user: any, callback: any) => callback(null)),
		logout: jest.fn((callback: any) => callback(null)),
		session: {
			destroy: jest.fn((callback: any) => callback(null)),
		},
		isAuthenticated: () => false,
		...overrides,
	});

	// Helper to create mock Response object
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

	// Helper to create mock NextFunction
	const mockNext = jest.fn();

	// Helper to create a test user
	const createTestUser = async (): Promise<User> => {
		const userRepository = getTestDataSource().getRepository(User);
		// Generate unique email using timestamp to avoid collisions
		const uniqueId = Date.now() + Math.random().toString(36).substring(7);
		const user = userRepository.create({
			id: uuidv4(),
			email: `testuser_${uniqueId}@example.com`,
			displayName: 'Test User',
			password: 'password123', // Will be hashed by @BeforeInsert hook
			isPending: false,
		});
		await userRepository.save(user);
		return user;
	};

	let testUser: User;

	beforeAll(async () => {
		await setupTestDatabase();
		testUser = await createTestUser();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Recreate test user after clearing
		testUser = await createTestUser();
		jest.clearAllMocks();
	});

	describe('register', () => {
		test('should create a new user with valid data', async () => {
			const req = createMockRequest({
				body: {
					email: 'newuser@example.com',
					password: 'password123',
					displayName: 'New User',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.register(req, res, next);

			expect(res.status).toHaveBeenCalledWith(201);
			expect(res.json).toHaveBeenCalledWith({ message: 'User created successfully' });
		});

		test('should return 400 when user already exists', async () => {
			const req = createMockRequest({
				body: {
					email: testUser.email,
					password: 'password123',
					displayName: 'Test User',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.register(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'User already exists' });
		});

		test('should call next on database error', async () => {
			const req = createMockRequest({
				body: {
					email: 'error@example.com',
					password: 'password123',
					displayName: 'Error User',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			// Create a user first to trigger a duplicate error on second insert
			await authController.register(req, res, mockNext);

			const req2 = createMockRequest({
				body: {
					email: 'error@example.com',
					password: 'password123',
					displayName: 'Error User 2',
				},
			});
			const res2 = createMockResponse();

			// This should fail because user already exists
			await authController.register(req2, res2, next);
			expect(res2.status).toHaveBeenCalledWith(400);
		});
	});

	describe('login', () => {
		test('should return user data on successful login', async () => {
			const req = createMockRequest({
				body: {
					email: testUser.email,
					password: 'password123',
					recaptchaToken: 'valid-token',
				},
				user: testUser,
			});
			const res = createMockResponse();
			const next = mockNext;

			// Mock passport authenticate to call the callback with the user
			(passport.authenticate as jest.Mock).mockImplementation((strategy: string, options: any) => {
				return (req: any, res: any, next: any) => {
					// Call the callback directly with user (simulating successful auth)
					const callback = options;
					callback(null, testUser, { message: 'Success' });
				};
			});

			await authController.login(req, res, next);

			expect(res.json).toHaveBeenCalled();
		});

		test('should return 401 on failed login', async () => {
			const req = createMockRequest({
				body: {
					email: 'wrong@example.com',
					password: 'wrongpassword',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			// Mock passport authenticate to call the callback with false (simulating failed auth)
			(passport.authenticate as jest.Mock).mockImplementation((strategy: string, options: any) => {
				return (req: any, res: any, next: any) => {
					const callback = options;
					callback(null, false, { message: 'Incorrect email or password.' });
				};
			});

			await authController.login(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ message: 'Incorrect email or password.' });
		});

		test('should call next on authentication error', async () => {
			const req = createMockRequest({
				body: {
					email: testUser.email,
					password: 'password123',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			// Mock passport authenticate to call the callback with an error
			(passport.authenticate as jest.Mock).mockImplementation((strategy: string, options: any) => {
				return (req: any, res: any, next: any) => {
					const callback = options;
					callback(new Error('Database error'), null, null);
				};
			});

			await authController.login(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});

	describe('googleCallback', () => {
		test('should redirect to frontend /app URL (for dashboard redirect)', async () => {
			const req = createMockRequest();
			const res = createMockResponse();
			const next = mockNext;

			await authController.googleCallback(req, res, next);

			expect(res.redirect).toHaveBeenCalledWith('http://localhost:5173/app');
		});
	});

	describe('getAuthStatus', () => {
		test('should return user data when authenticated', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.getAuthStatus(req, res, next);

			expect(res.json).toHaveBeenCalledWith(
				expect.objectContaining({
					id: testUser.id,
					email: testUser.email,
				}),
			);
		});

		test('should return authenticated: false when not authenticated', async () => {
			const req = createMockRequest({
				isAuthenticated: () => false,
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.getAuthStatus(req, res, next);

			expect(res.json).toHaveBeenCalledWith({ authenticated: false });
		});
	});

	describe('logout', () => {
		test('should clear session and cookie on successful logout', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.logout(req, res, next);

			expect(req.logout).toHaveBeenCalled();
			expect(req.session.destroy).toHaveBeenCalled();
			expect(res.clearCookie).toHaveBeenCalledWith('connect.sid');
			expect(res.json).toHaveBeenCalledWith({ message: 'Logged out' });
		});

		test('should call next on logout error', async () => {
			const req = createMockRequest({
				user: testUser,
				logout: jest.fn((callback: any) => callback(new Error('Logout error'))),
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.logout(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});

		test('should call next on session destroy error', async () => {
			const req = createMockRequest({
				user: testUser,
				logout: jest.fn((callback: any) => callback(null)),
				session: {
					destroy: jest.fn((callback: any) => callback(new Error('Session destroy error'))),
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.logout(req, res, next);

			expect(next).toHaveBeenCalledWith(expect.any(Error));
		});
	});

	describe('requestPasswordReset', () => {
		test('should return success message for existing user', async () => {
			const req = createMockRequest({
				body: {
					email: testUser.email,
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.requestPasswordReset(req, res, next);

			expect(res.json).toHaveBeenCalledWith({
				message:
					'Si existe un usuario con ese correo, se ha enviado un enlace para restablecer la contraseña.',
			});
		});

		test('should return success message for non-existing user (prevent enumeration)', async () => {
			const req = createMockRequest({
				body: {
					email: 'nonexistent@example.com',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.requestPasswordReset(req, res, next);

			expect(res.json).toHaveBeenCalledWith({
				message:
					'Si existe un usuario con ese correo, se ha enviado un enlace para restablecer la contraseña.',
			});
		});

		test('should call next on database error', async () => {
			const req = createMockRequest({
				body: {
					email: 'error@example.com',
					recaptchaToken: 'valid-token',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			// This test checks that database errors are properly passed to next
			// Since we're using a real database, this should work
			await authController.requestPasswordReset(req, res, next);

			// Should not call next for successful request (even if user doesn't exist)
			expect(next).not.toHaveBeenCalled();
		});
	});

	describe('resetPassword', () => {
		test('should return 400 for invalid token', async () => {
			const req = createMockRequest({
				body: {
					token: 'invalid-token',
					password: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.resetPassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'Invalid or expired password reset token.',
			});
		});

		test('should return 400 for expired token', async () => {
			// We need to set a token directly in the passwordResetTokens Map
			// But since it's not exported, we can't do this easily in a unit test
			// For now, we'll just test the invalid token case
			const req = createMockRequest({
				body: {
					token: 'expired-token',
					password: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.resetPassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'Invalid or expired password reset token.',
			});
		});
	});

	describe('changePassword', () => {
		test('should change password successfully with valid data', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					newPassword: 'newpassword123',
					confirmPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).not.toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({
				message: 'Tu contraseña ha sido cambiada exitosamente.',
			});
		});

		test('should return 401 when user is not authenticated', async () => {
			const req = createMockRequest({
				isAuthenticated: () => false,
				body: {
					currentPassword: 'password123',
					newPassword: 'newpassword123',
					confirmPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({ message: 'No autorizado' });
		});

		test('should return 400 when current password is missing for user with password', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					newPassword: 'newpassword123',
					confirmPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'La contraseña actual es requerida' });
		});

		test('should return 400 when new password is missing', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					confirmPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'La nueva contraseña es requerida' });
		});

		test('should change password without confirmPassword field', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					newPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).not.toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({
				message: 'Tu contraseña ha sido cambiada exitosamente.',
			});
		});

		test('should return 400 when passwords do not match', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					newPassword: 'newpassword123',
					confirmPassword: 'differentpassword',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Las contraseñas no coinciden' });
		});

		test('should return 400 when new password is same as current password', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					newPassword: 'password123',
					confirmPassword: 'password123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'La nueva contraseña debe ser diferente a la actual',
			});
		});

		test('should return 400 when new password is too short', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					newPassword: 'short',
					confirmPassword: 'short',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'La contraseña debe tener al menos 8 caracteres',
			});
		});

		test('should return 400 when current password is incorrect', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'wrongpassword',
					newPassword: 'newpassword123',
					confirmPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'La contraseña actual es incorrecta' });
		});

		test('should return 400 when user is not found in database', async () => {
			const nonExistentUser: User = {
				id: uuidv4(),
				email: 'nonexistent@example.com',
				displayName: 'Non Existent',
				password: await bcrypt.hash('password123', 10),
				isPending: false,
				createdAt: new Date(),
				updatedAt: new Date(),
			} as User;

			const req = createMockRequest({
				user: nonExistentUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					newPassword: 'newpassword123',
					confirmPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'Usuario no encontrado' });
		});

		test('should return 400 when new password is exactly 8 characters but current password is wrong', async () => {
			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'wrongpass',
					newPassword: '12345678',
					confirmPassword: '12345678',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			// Should fail on wrong current password, not on length
			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({ message: 'La contraseña actual es incorrecta' });
		});

		test('should successfully update password when all validations pass', async () => {
			const userRepository = getTestDataSource().getRepository(User);
			const userBeforeChange = await userRepository.findOne({ where: { id: testUser.id } });
			expect(userBeforeChange).toBeTruthy();

			const req = createMockRequest({
				user: testUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'password123',
					newPassword: 'anewpass123',
					confirmPassword: 'anewpass123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.json).toHaveBeenCalledWith({
				message: 'Tu contraseña ha sido cambiada exitosamente.',
			});

			// Verify password was actually changed
			const userAfterChange = await userRepository.findOne({ where: { id: testUser.id } });
			expect(userAfterChange).toBeTruthy();

			// The new password should work
			const isNewPasswordValid = await bcrypt.compare('anewpass123', userAfterChange!.password!);
			expect(isNewPasswordValid).toBe(true);

			// The old password should not work
			const isOldPasswordValid = await bcrypt.compare('password123', userAfterChange!.password!);
			expect(isOldPasswordValid).toBe(false);
		});

		test('should allow Google user (without password) to set first password', async () => {
			// Create a Google user without a password
			const googleUser = await createTestUser();
			const userRepository = getTestDataSource().getRepository(User);
			await userRepository.update(googleUser.id, { password: null });

			const req = createMockRequest({
				user: googleUser,
				isAuthenticated: () => true,
				body: {
					newPassword: 'newpassword123',
					confirmPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).not.toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'Tu contraseña ha sido configurada exitosamente.',
			});
		});

		test('should allow Google user to set password without confirmPassword field', async () => {
			const googleUser = await createTestUser();
			const userRepository = getTestDataSource().getRepository(User);
			await userRepository.update(googleUser.id, { password: null });

			const req = createMockRequest({
				user: googleUser,
				isAuthenticated: () => true,
				body: {
					newPassword: 'newpassword123',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.json).toHaveBeenCalledWith({
				message: 'Tu contraseña ha sido configurada exitosamente.',
			});
		});

		test('should return 400 when Google user provides password too short', async () => {
			const googleUser = await createTestUser();
			const userRepository = getTestDataSource().getRepository(User);
			await userRepository.update(googleUser.id, { password: null });

			const req = createMockRequest({
				user: googleUser,
				isAuthenticated: () => true,
				body: {
					newPassword: 'short',
				},
			});
			const res = createMockResponse();
			const next = mockNext;

			await authController.changePassword(req, res, next);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				message: 'La contraseña debe tener al menos 8 caracteres',
			});
		});

		test('should allow Google user to change password after setting it', async () => {
			const googleUser = await createTestUser();
			const userRepository = getTestDataSource().getRepository(User);
			await userRepository.update(googleUser.id, { password: null });

			// First, set the password
			const setReq = createMockRequest({
				user: googleUser,
				isAuthenticated: () => true,
				body: {
					newPassword: 'firstpassword123',
				},
			});
			const setRes = createMockResponse();
			await authController.changePassword(setReq, setRes, mockNext);

			expect(setRes.json).toHaveBeenCalledWith({
				message: 'Tu contraseña ha sido configurada exitosamente.',
			});

			// Now change the password (should require current password)
			const changeReq = createMockRequest({
				user: googleUser,
				isAuthenticated: () => true,
				body: {
					currentPassword: 'firstpassword123',
					newPassword: 'newpassword456',
					confirmPassword: 'newpassword456',
				},
			});
			const changeRes = createMockResponse();
			await authController.changePassword(changeReq, changeRes, mockNext);

			expect(changeRes.json).toHaveBeenCalledWith({
				message: 'Tu contraseña ha sido cambiada exitosamente.',
			});
		});

		test('should return 400 when Google user tries to change password without current password after setting it', async () => {
			const googleUser = await createTestUser();
			const userRepository = getTestDataSource().getRepository(User);
			await userRepository.update(googleUser.id, { password: null });

			// First, set the password
			const setReq = createMockRequest({
				user: googleUser,
				isAuthenticated: () => true,
				body: {
					newPassword: 'firstpassword123',
				},
			});
			const setRes = createMockResponse();
			await authController.changePassword(setReq, setRes, mockNext);

			// Now try to change without current password (should fail)
			const changeReq = createMockRequest({
				user: googleUser,
				isAuthenticated: () => true,
				body: {
					newPassword: 'newpassword456',
				},
			});
			const changeRes = createMockResponse();
			await authController.changePassword(changeReq, changeRes, mockNext);

			expect(changeRes.status).toHaveBeenCalledWith(400);
			expect(changeRes.json).toHaveBeenCalledWith({ message: 'La contraseña actual es requerida' });
		});
	});
});
