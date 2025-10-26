import jwt from 'jsonwebtoken';
import { User } from '../../entities/user.entity';

// Mock JWT secret for testing
const JWT_SECRET = process.env.JWT_SECRET || 'test-secret-key';

/**
 * Generate a test JWT token for authentication
 */
export function generateTestToken(user: Partial<User>): string {
	const payload = {
		sub: user.id,
		email: user.email,
		role: user.role,
		isActive: user.isActive,
		emailVerified: user.emailVerified,
		// Add other claims as needed
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 60 * 60, // 1 hour expiration
	};

	return jwt.sign(payload, JWT_SECRET);
}

/**
 * Generate an expired test token
 */
export function generateExpiredToken(user: Partial<User>): string {
	const payload = {
		sub: user.id,
		email: user.email,
		role: user.role,
		isActive: user.isActive,
		emailVerified: user.emailVerified,
		iat: Math.floor(Date.now() / 1000) - 60 * 60, // 1 hour ago
		exp: Math.floor(Date.now() / 1000) - 30 * 60, // Expired 30 minutes ago
	};

	return jwt.sign(payload, JWT_SECRET);
}

/**
 * Generate a token with invalid signature
 */
export function generateInvalidToken(): string {
	const payload = {
		sub: 'test-user-id',
		email: 'test@example.com',
		role: 'admin',
		iat: Math.floor(Date.now() / 1000),
		exp: Math.floor(Date.now() / 1000) + 60 * 60,
	};

	// Sign with wrong secret
	return jwt.sign(payload, 'wrong-secret');
}

/**
 * Decode a JWT token (for testing purposes)
 */
export function decodeToken(token: string): any {
	try {
		return jwt.decode(token);
	} catch (error) {
		return null;
	}
}

/**
 * Verify a JWT token (for testing purposes)
 */
export function verifyToken(token: string): any {
	try {
		return jwt.verify(token, JWT_SECRET);
	} catch (error) {
		return null;
	}
}

/**
 * Mock authentication middleware for testing
 */
export function mockAuthMiddleware(user: Partial<User>) {
	return (req: any, res: any, next: any) => {
		req.user = user;
		next();
	};
}

/**
 * Create test user data for different roles
 */
export const createTestUsers = () => ({
	admin: {
		id: 'admin-test-id',
		email: 'admin@test.com',
		role: 'admin' as const,
		isActive: true,
		emailVerified: true,
		firstName: 'Admin',
		lastName: 'User',
	},
	coordinator: {
		id: 'coordinator-test-id',
		email: 'coordinator@test.com',
		role: 'coordinator' as const,
		isActive: true,
		emailVerified: true,
		firstName: 'Coordinator',
		lastName: 'User',
	},
	viewer: {
		id: 'viewer-test-id',
		email: 'viewer@test.com',
		role: 'viewer' as const,
		isActive: true,
		emailVerified: true,
		firstName: 'Viewer',
		lastName: 'User',
	},
	inactive: {
		id: 'inactive-test-id',
		email: 'inactive@test.com',
		role: 'admin' as const,
		isActive: false,
		emailVerified: true,
		firstName: 'Inactive',
		lastName: 'User',
	},
	unverified: {
		id: 'unverified-test-id',
		email: 'unverified@test.com',
		role: 'admin' as const,
		isActive: true,
		emailVerified: false,
		firstName: 'Unverified',
		lastName: 'User',
	},
});

/**
 * Common authentication test scenarios
 */
export const authTestScenarios = {
	withValidToken: (user: Partial<User>, requestFn: any) => {
		const token = generateTestToken(user);
		return requestFn().set('Authorization', `Bearer ${token}`);
	},

	withInvalidToken: (requestFn: any) => {
		const token = generateInvalidToken();
		return requestFn().set('Authorization', `Bearer ${token}`);
	},

	withExpiredToken: (user: Partial<User>, requestFn: any) => {
		const token = generateExpiredToken(user);
		return requestFn().set('Authorization', `Bearer ${token}`);
	},

	withoutToken: (requestFn: any) => {
		return requestFn();
	},

	withMalformedToken: (requestFn: any) => {
		return requestFn().set('Authorization', 'Bearer malformed-token');
	},

	withWrongScheme: (user: Partial<User>, requestFn: any) => {
		const token = generateTestToken(user);
		return requestFn().set('Authorization', `Basic ${token}`);
	},
};
