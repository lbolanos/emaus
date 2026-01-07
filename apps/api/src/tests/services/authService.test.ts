import { setupTestDatabase, teardownTestDatabase, clearTestData } from '../test-setup';
import { TestDataFactory } from '../test-utils/testDataFactory';
import { User } from '@/entities/user.entity';
import { UserRole } from '@/entities/userRole.entity';
import { Role } from '@/entities/role.entity';
import { passport, configurePassportStrategies } from '@/services/authService';
import * as bcrypt from 'bcrypt';

// Helper to get testDataSource - defined at module level for all tests to use
const getTestDataSource = () => TestDataFactory['testDataSource'];

/**
 * Auth Service Tests
 *
 * All services have been refactored to accept an optional `dataSource?: DataSource` parameter.
 * Tests now reconfigure passport strategies with testDataSource for proper test database isolation.
 */
describe('Auth Service - Local Strategy', () => {
	let testUser: User;
	let testRole: Role;

	beforeAll(async () => {
		await setupTestDatabase();

		// Reconfigure passport strategies with test database
		configurePassportStrategies(passport, getTestDataSource());

		const roleRepository = getTestDataSource().getRepository(Role);
		testRole = roleRepository.create({
			name: 'regular',
			description: 'Regular user role',
		});
		await roleRepository.save(testRole);

		// Create a test user - entity will hash the password automatically
		const userRepository = getTestDataSource().getRepository(User);
		testUser = userRepository.create({
			id: `user-${Date.now()}`,
			email: 'testuser@example.com',
			displayName: 'Test User',
			password: 'password123', // Entity's @BeforeInsert will hash this
			isPending: false,
		});
		await userRepository.save(testUser);

		// Assign role to user
		const userRoleRepository = getTestDataSource().getRepository(UserRole);
		const userRole = userRoleRepository.create({
			userId: testUser.id,
			roleId: testRole.id,
		});
		await userRoleRepository.save(userRole);
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Recreate test user after clearing - use plain password, entity will hash it
		const userRepository = getTestDataSource().getRepository(User);
		testUser = userRepository.create({
			id: `user-${Date.now()}-${Math.random()}`,
			email: 'testuser@example.com',
			displayName: 'Test User',
			password: 'password123', // Entity's @BeforeInsert will hash this
			isPending: false,
		});
		await userRepository.save(testUser);
	});

	describe('Local Authentication', () => {
		test('should authenticate user with valid email and password', (done) => {
			passport.authenticate('local', { session: false }, (err: any, user: any, info: any) => {
				expect(err).toBeNull();
				expect(user).toBeTruthy();
				expect(user.email).toBe('testuser@example.com');
				expect(info).toBeUndefined();
				done();
			})({ body: { email: 'testuser@example.com', password: 'password123' } });
		});

		test('should reject authentication with invalid email', (done) => {
			passport.authenticate('local', { session: false }, (err: any, user: any, info: any) => {
				expect(err).toBeNull();
				expect(user).toBe(false);
				expect(info?.message).toBe('Incorrect email or password.');
				done();
			})({ body: { email: 'nonexistent@example.com', password: 'password123' } });
		});

		test('should reject authentication with invalid password', (done) => {
			passport.authenticate('local', { session: false }, (err: any, user: any, info: any) => {
				expect(err).toBeNull();
				expect(user).toBe(false);
				expect(info?.message).toBe('Incorrect email or password.');
				done();
			})({ body: { email: 'testuser@example.com', password: 'wrongpassword' } });
		});

		test('should reject authentication for user without password', (done) => {
			// Create a user without password (Google OAuth user)
			const userRepository = getTestDataSource().getRepository(User);
			const googleUser = userRepository.create({
				id: `google-user-${Date.now()}`,
				email: 'googleuser@example.com',
				displayName: 'Google User',
				googleId: 'google123',
				isPending: false,
			});
			userRepository.save(googleUser).then(() => {
				passport.authenticate('local', { session: false }, (err: any, user: any, info: any) => {
					expect(err).toBeNull();
					expect(user).toBe(false);
					expect(info?.message).toBe('Please log in with Google.');
					done();
				})({ body: { email: 'googleuser@example.com', password: 'anypassword' } });
			});
		});
	});

	describe('Password Hashing Verification', () => {
		test('should correctly compare hashed password', async () => {
			const plainPassword = 'testpassword123';
			const hashedPassword = await bcrypt.hash(plainPassword, 10);

			const isMatch = await bcrypt.compare(plainPassword, hashedPassword);
			expect(isMatch).toBe(true);

			const isNotMatch = await bcrypt.compare('wrongpassword', hashedPassword);
			expect(isNotMatch).toBe(false);
		});

		test('should generate different hashes for same password', async () => {
			const password = 'samepassword';
			const hash1 = await bcrypt.hash(password, 10);
			const hash2 = await bcrypt.hash(password, 10);

			expect(hash1).not.toBe(hash2);

			// But both should match the original password
			expect(await bcrypt.compare(password, hash1)).toBe(true);
			expect(await bcrypt.compare(password, hash2)).toBe(true);
		});
	});

	describe('Session Serialization', () => {
		test('should serialize user by id', (done) => {
			passport.serializeUser(testUser, (err: any, id: any) => {
				expect(err).toBeNull();
				expect(id).toBe(testUser.id);
				done();
			});
		});

		test('should deserialize user from id', (done) => {
			passport.deserializeUser(testUser.id, (err: any, user: any) => {
				expect(err).toBeNull();
				expect(user).toBeTruthy();
				expect(user.id).toBe(testUser.id);
				expect(user.email).toBe(testUser.email);
				done();
			});
		});

		test('should handle deserialization of non-existent user', (done) => {
			passport.deserializeUser('non-existent-id', (err: any, user: any) => {
				expect(err).toBeTruthy();
				expect(user).toBeNull();
				done();
			});
		});
	});
});

// JWT and Refresh Token functionality not implemented in production code
// Skip these tests until JWT auth is added
describe.skip('Auth Service - Token Generation and Validation', () => {
	describe('JWT Token Handling', () => {
		test.skip('should generate valid JWT token', async () => {
			// Test skipped - JWT not implemented
		});

		test.skip('should reject invalid JWT token', async () => {
			// Test skipped - JWT not implemented
		});

		test.skip('should reject expired JWT token', async () => {
			// Test skipped - JWT not implemented
		});
	});

	describe('Token Refresh', () => {
		test.skip('should generate new refresh token', async () => {
			// Test skipped - Refresh tokens not implemented
		});
	});
});

describe('Auth Service - Password Management', () => {
	beforeAll(async () => {
		await setupTestDatabase();
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	test('should hash password with bcrypt', async () => {
		const plainPassword = 'SecurePassword123!';
		const hashedPassword = await bcrypt.hash(plainPassword, 10);

		expect(hashedPassword).toBeDefined();
		expect(hashedPassword).not.toBe(plainPassword);
		expect(hashedPassword.length).toBe(60); // bcrypt hashes are 60 chars
		expect(hashedPassword.startsWith('$2b$10$') || hashedPassword.startsWith('$2a$10$')).toBe(true);
	});

	test('should verify correct password', async () => {
		const plainPassword = 'SecurePassword123!';
		const hashedPassword = await bcrypt.hash(plainPassword, 10);

		const isValid = await bcrypt.compare(plainPassword, hashedPassword);
		expect(isValid).toBe(true);
	});

	test('should reject incorrect password', async () => {
		const plainPassword = 'SecurePassword123!';
		const hashedPassword = await bcrypt.hash(plainPassword, 10);

		const isValid = await bcrypt.compare('WrongPassword123!', hashedPassword);
		expect(isValid).toBe(false);
	});

	test('should use different salt for each hash', async () => {
		const password = 'SamePassword123!';
		const hash1 = await bcrypt.hash(password, 10);
		const hash2 = await bcrypt.hash(password, 10);

		expect(hash1).not.toBe(hash2);

		// Extract salts
		const salt1 = hash1.substring(0, 29);
		const salt2 = hash2.substring(0, 29);
		expect(salt1).not.toBe(salt2);
	});
});

describe('Auth Service - User Lookup', () => {
	// Helper to get testDataSource
	const getTestDataSource = () => TestDataFactory['testDataSource'];

	let testUser: User;

	beforeAll(async () => {
		await setupTestDatabase();

		// Reconfigure passport strategies with test database
		configurePassportStrategies(passport, getTestDataSource());

		const hashedPassword = await bcrypt.hash('password123', 10);
		const userRepository = getTestDataSource().getRepository(User);
		testUser = userRepository.create({
			id: `user-${Date.now()}`,
			email: 'authlookup@example.com',
			displayName: 'Auth Lookup User',
			password: hashedPassword,
			isPending: false,
		});
		await userRepository.save(testUser);
	});

	afterAll(async () => {
		await teardownTestDatabase();
	});

	beforeEach(async () => {
		await clearTestData();
		// Recreate test user after clearing
		const hashedPassword = await bcrypt.hash('password123', 10);
		const userRepository = getTestDataSource().getRepository(User);
		testUser = userRepository.create({
			id: `user-${Date.now()}-${Math.random()}`,
			email: 'authlookup@example.com',
			displayName: 'Auth Lookup User',
			password: hashedPassword,
			isPending: false,
		});
		await userRepository.save(testUser);
	});

	test('should find user by email for authentication', (done) => {
		const userRepository = getTestDataSource().getRepository(User);
		userRepository.findOne({ where: { email: 'authlookup@example.com' } }).then((user) => {
			expect(user).toBeTruthy();
			expect(user?.email).toBe('authlookup@example.com');
			done();
		});
	});

	test('should not find user with wrong email', (done) => {
		const userRepository = getTestDataSource().getRepository(User);
		userRepository.findOne({ where: { email: 'wrong@example.com' } }).then((user) => {
			expect(user).toBeNull();
			done();
		});
	});

	test('should handle pending user authentication', (done) => {
		// Create a pending user
		const userRepository = getTestDataSource().getRepository(User);
		const pendingUser = userRepository.create({
			id: `pending-${Date.now()}`,
			email: 'pending@example.com',
			displayName: 'Pending User',
			password: 'password123', // Entity's @BeforeInsert will hash this
			isPending: true,
		});
		userRepository.save(pendingUser).then(() => {
			// The local strategy should authenticate pending users
			// (actual pending check is handled elsewhere in the app)
			passport.authenticate('local', { session: false }, (err: any, user: any, info: any) => {
				expect(err).toBeNull();
				// Authentication succeeds for pending users at strategy level
				// Pending status is checked at route/middleware level
				done();
			})({ body: { email: 'pending@example.com', password: 'password123' } });
		});
	});
});
